var express = require('express');
var session = require('express-session');
var cookieParser = require('cookie-parser');

// ================================================================
// MOCKS — toutes les definitions sont hoistees par jest
// ================================================================

// ---- fs in-memory ----
var mockFileStore = {};

jest.mock('fs', function () {
  return {
    existsSync: jest.fn(function (p) { return mockFileStore[p] !== undefined; }),
    mkdirSync: jest.fn(function (p) { mockFileStore[p] = 'dir'; }),
    readFileSync: jest.fn(function () { return Buffer.alloc(64 * 1024); }),
    statSync: jest.fn(function (p) {
      var val = mockFileStore[p];
      return { size: val && val.length ? val.length : 1024, mtime: new Date() };
    }),
    unlinkSync: jest.fn(function (p) { delete mockFileStore[p]; }),
    copyFileSync: jest.fn(function (src, dst) {
      if (mockFileStore[src] !== undefined) { mockFileStore[dst] = mockFileStore[src]; }
    }),
    readdir: jest.fn(function (dir, cb) { cb(null, []); }),
    promises: {
      mkdir: jest.fn().mockResolvedValue(undefined),
      writeFile: jest.fn().mockResolvedValue(undefined),
      readFile: jest.fn().mockResolvedValue('{}'),
      access: jest.fn().mockRejectedValue(new Error('ENOENT')),
      stat: jest.fn().mockResolvedValue({ mtimeMs: Date.now() }),
      readdir: jest.fn().mockResolvedValue([]),
      open: jest.fn().mockResolvedValue({ read: jest.fn().mockResolvedValue({ bytesRead: 100 }), close: jest.fn().mockResolvedValue(undefined) })
    }
  };
});

// ---- server/config ----
jest.mock('../../server/config', function () {
  return {
    getPaths: jest.fn().mockReturnValue({
      root: '/fake/root',
      pages: '/fake/pages',
      adminPages: '/fake/pages/admin',
      texts: '/fake/config/texts.json',
      photos: '/fake/photos',
      temp: '/fake/temp',
      stats: '/fake/logs/stats.json',
      config: '/fake/config/config.json'
    }),
    getConfig: jest.fn().mockReturnValue({
      thumbnails: {
        width: 600,
        height: 600,
        quality: 80,
        fit: 'inside',
        withoutEnlargement: true
      }
    }),
    getPort: jest.fn().mockReturnValue(3000),
    adminPassword: 'test'
  };
});

// ---- sharp (pipe partage, implementation embarquee pour survivre a restoreMocks) ----
var mockSharpPipe = {
  jpeg: jest.fn(function () { return mockSharpPipe; }),
  webp: jest.fn(function () { return mockSharpPipe; }),
  resize: jest.fn(function () { return mockSharpPipe; }),
  withMetadata: jest.fn(function () { return mockSharpPipe; }),
  toFile: jest.fn(function () { return Promise.resolve(undefined); }),
  toBuffer: jest.fn(function () { return Promise.resolve(Buffer.from('img')); })
};

jest.mock('sharp', function () {
  return jest.fn(function () { return mockSharpPipe; });
});

// ---- exifr (controle par les variables module-level) ----
var mockExifrData = null;
var mockExifrError = null;

jest.mock('exifr', function () {
  return {
    parse: jest.fn(function () {
      if (mockExifrError) return Promise.reject(mockExifrError);
      return Promise.resolve(mockExifrData);
    })
  };
});

// ---- multer ----
var mockFiles = [];
var mockCapturedMulterOpts = null;

jest.mock('multer', function () {
  var fn = function (opts) {
    mockCapturedMulterOpts = opts;
    return {
      array: jest.fn(function (fieldName) {
        return function (req, res, next) {
          req.files = mockFiles;
          next();
        };
      })
    };
  };
  fn.diskStorage = jest.fn();
  return fn;
});

// ---- photoService ----
// readExif delegue au mock exifr.parse pour que mockExifrData/mockExifrError
// et mockResolvedValueOnce restent operationnels.
var mockPhotoServiceReadExif = jest.fn(function () {
  var exifrMod = require('exifr');
  return exifrMod.parse.apply(null, arguments);
});
jest.mock('../../server/utils/photoService', function () {
  return {
    getPhotosList: jest.fn().mockResolvedValue([]),
    readExif: mockPhotoServiceReadExif
  };
});

// Charger le router APRES tous les mocks (jest les hoiste de toute façon)
var photosRouter = require('../../server/routes/photos');

// ================================================================
// Helper : fabrique d'app avec session admin
// ================================================================

function makeAppWithAdmin() {
  var app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(session({
    secret: 'test-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
  }));
  // Injection session admin
  app.use(function (req, res, next) {
    req.session.isAdmin = true;
    next();
  });
  app.use('/', photosRouter);
  return app;
}

// ================================================================
// TESTS
// ================================================================

describe('photos.js upload — branches non couvertes (lignes 20-23, 80, 87-91, 110, 119-132, 151-154)', function () {
  var supertest;
  var exifrModule;
  var fsModule;

  beforeAll(function () {
    supertest = require('supertest');
    exifrModule = require('exifr');
    fsModule = require('fs');
  });

  beforeEach(function () {
    // Réinitialiser l'état global
    Object.keys(mockFileStore).forEach(function (k) { delete mockFileStore[k]; });
    mockFiles = [];
    mockExifrData = null;
    mockExifrError = null;
    // Nettoyer les overrides one-shot restants sur exifr.parse
    if (exifrModule.parse.mockRestore) {
      // restoreMocks de jest.config le fera, mais on s'assure
    }
  });

  // ================================================================
  // 1. Upload sans fichier -> succès 0 photo
  // ================================================================
  it('retourne 0 fichier quand aucun fichier n est envoye', function (done) {
    mockFiles = [];
    mockFileStore['/fake/photos/thumbnails'] = 'dir';

    supertest(makeAppWithAdmin())
      .post('/admin/upload')
      .expect(200)
      .end(function (err, res) {
        if (err) return done(err);
        expect(res.body.success).toBe(true);
        expect(res.body.message).toContain('0');
        expect(res.body.files).toEqual([]);
        done();
      });
  });

  // ================================================================
  // 2. Upload avec EXIF absent -> timestamp actuel pour le nom
  // ================================================================
  it('genere un nom base sur le timestamp quand pas d EXIF', function (done) {
    mockExifrData = null;
    mockExifrError = null;
    mockFileStore['/fake/photos/thumbnails'] = 'dir';
    mockFileStore['/fake/temp/upl1'] = 'fake-image-data';
    mockFiles = [{ path: '/fake/temp/upl1', originalname: 'concert.jpg' }];

    supertest(makeAppWithAdmin())
      .post('/admin/upload')
      .expect(200)
      .end(function (err, res) {
        if (err) return done(err);
        expect(res.body.success).toBe(true);
        expect(res.body.files.length).toBe(1);
        // Le nom commence par un timestamp (chiffres) suivi de _
        expect(res.body.files[0].filename).toMatch(/^\d{13}_concert\.jpg$/);
        // withMetadata ne doit PAS etre appele car pas d'EXIF
        expect(mockSharpPipe.withMetadata).not.toHaveBeenCalled();
        done();
      });
  });

  // ================================================================
  // 3. Upload avec EXIF DateTimeOriginal -> nom base sur la date EXIF
  // ================================================================
  it('genere un nom base sur la date EXIF DateTimeOriginal', function (done) {
    mockExifrData = { DateTimeOriginal: '2023-06-15T14:30:00' };
    mockExifrError = null;
    mockFileStore['/fake/photos/thumbnails'] = 'dir';
    mockFileStore['/fake/temp/upl2'] = 'fake-image-data';
    mockFiles = [{ path: '/fake/temp/upl2', originalname: 'festival.jpg' }];

    supertest(makeAppWithAdmin())
      .post('/admin/upload')
      .expect(200)
      .end(function (err, res) {
        if (err) return done(err);
        expect(res.body.success).toBe(true);
        expect(res.body.files.length).toBe(1);
        // Le nom commence par 20230615_ suivi de l'heure-minute-seconde
        expect(res.body.files[0].filename).toMatch(/^20230615_\d{6}_festival\.jpg$/);
        // withMetadata doit etre appele car on a des metadonnees EXIF
        expect(mockSharpPipe.withMetadata).toHaveBeenCalled();
        done();
      });
  });

  // ================================================================
  // 4. Upload avec exifr.parse qui leve une erreur -> fallback timestamp
  // ================================================================
  it('utilise le timestamp quand exifr.parse echoue', function (done) {
    mockExifrData = null;
    mockExifrError = new Error('Fichier JPEG corrompu');
    mockFileStore['/fake/photos/thumbnails'] = 'dir';
    mockFileStore['/fake/temp/upl3'] = 'fake-image-data';
    mockFiles = [{ path: '/fake/temp/upl3', originalname: 'corrompu.jpg' }];

    supertest(makeAppWithAdmin())
      .post('/admin/upload')
      .expect(200)
      .end(function (err, res) {
        if (err) return done(err);
        expect(res.body.success).toBe(true);
        expect(res.body.files.length).toBe(1);
        // Le nom commence par un timestamp (pas la date EXIF)
        expect(res.body.files[0].filename).toMatch(/^\d{13}_corrompu\.jpg$/);
        // withMetadata ne doit PAS etre appele
        expect(mockSharpPipe.withMetadata).not.toHaveBeenCalled();
        done();
      });
  });

  // ================================================================
  // 5. Upload avec sharp.toFile qui echoue -> copyFileSync fallback
  // ================================================================
  it('utilise copyFileSync quand sharp.toFile (principal) echoue', function (done) {
    mockExifrData = null;
    mockExifrError = null;
    mockFileStore['/fake/photos/thumbnails'] = 'dir';
    mockFileStore['/fake/temp/upl5'] = 'original-data';
    mockFiles = [{ path: '/fake/temp/upl5', originalname: 'corrompu_sharp.jpg' }];

    // Premier toFile (principal) echoue, le deuxieme (thumbnail) reussit
    mockSharpPipe.toFile.mockRejectedValueOnce(new Error('Sharp: unsupported format'));

    supertest(makeAppWithAdmin())
      .post('/admin/upload')
      .expect(200)
      .end(function (err, res) {
        if (err) return done(err);
        expect(res.body.success).toBe(true);
        expect(res.body.files.length).toBe(1);
        // copyFileSync a ete appele (fallback de la branche 130-132)
        expect(fsModule.copyFileSync).toHaveBeenCalledWith(
          '/fake/temp/upl5',
          expect.stringContaining('corrompu_sharp.jpg')
        );
        // Le fichier temporaire est supprime
        expect(fsModule.unlinkSync).toHaveBeenCalledWith('/fake/temp/upl5');
        done();
      });
  });

  // ================================================================
  // 6. EXIF verification : sharp garde les metadonnees -> pas de copyFileSync
  // ================================================================
  it('ne retablit pas l original quand sharp preserve les EXIF', function (done) {
    mockExifrData = { DateTimeOriginal: '2023-06-15T14:30:00' };
    mockExifrError = null;
    mockFileStore['/fake/photos/thumbnails'] = 'dir';
    mockFileStore['/fake/temp/upl6'] = 'original-with-exif';
    mockFiles = [{ path: '/fake/temp/upl6', originalname: 'avec_exif.jpg' }];

    // Le deuxieme appel exifr.parse (verification) retourne aussi des donnees
    // La valeur par defaut (mockExifrData) le fait deja -> pas besoin d'override

    supertest(makeAppWithAdmin())
      .post('/admin/upload')
      .expect(200)
      .end(function (err, res) {
        if (err) return done(err);
        expect(res.body.success).toBe(true);
        // withMetadata a ete appele
        expect(mockSharpPipe.withMetadata).toHaveBeenCalled();
        // copyFileSync NE doit PAS etre appele pour la verification
        // (le code ne passe ni par ligne 123 ni par ligne 127)
        // On verifie que copyFileSync n'a ete appele que 0 fois (ou eventuellement
        // par un autre chemin, mais pour ce test aucun)
        var copyCalls = fsModule.copyFileSync.mock.calls.filter(function (call) {
          return call[0] === '/fake/temp/upl6';
        });
        expect(copyCalls.length).toBe(0);
        done();
      });
  });

  // ================================================================
  // 7. EXIF verification : sharp supprime les metadonnees -> copyFileSync
  // ================================================================
  it('retablit l original quand sharp supprime les metadonnees', function (done) {
    // Premier appel exifr.parse (ligne 76) doit reussir -> originalExifData existe
    // Deuxieme appel exifr.parse (verification ligne 120) doit retourner null -> copyFileSync
    // mockResolvedValueOnce s'applique au PREMIER appel, puis l'impl par defaut au second
    mockExifrData = null; // second appel via defaut -> null
    mockExifrError = null;
    exifrModule.parse.mockResolvedValueOnce({ DateTimeOriginal: '2023-06-15T14:30:00' });

    mockFileStore['/fake/photos/thumbnails'] = 'dir';
    mockFileStore['/fake/temp/upl7'] = 'original-with-exif-but-sharp-strips';
    mockFiles = [{ path: '/fake/temp/upl7', originalname: 'exif_strip.jpg' }];

    supertest(makeAppWithAdmin())
      .post('/admin/upload')
      .expect(200)
      .end(function (err, res) {
        if (err) return done(err);
        expect(res.body.success).toBe(true);
        // copyFileSync a ete appele pour retablir l'original (ligne 123)
        expect(fsModule.copyFileSync).toHaveBeenCalledWith(
          '/fake/temp/upl7',
          expect.stringContaining('exif_strip.jpg')
        );
        done();
      });
  });

  // ================================================================
  // 8. EXIF verification : exifr.parse jette une erreur -> copyFileSync
  // ================================================================
  it('retablit l original quand la verification EXIF leve une erreur', function (done) {
    mockExifrData = null;
    mockExifrError = null;
    mockFileStore['/fake/photos/thumbnails'] = 'dir';
    mockFileStore['/fake/temp/upl8'] = 'original-with-exif-verify-error';
    mockFiles = [{ path: '/fake/temp/upl8', originalname: 'verify_error.jpg' }];

    // Premier appel (ligne 76) reussit, deuxieme appel (verification ligne 120) rejecte
    var parseCallCount = 0;
    exifrModule.parse.mockImplementation(function () {
      parseCallCount++;
      if (parseCallCount === 1) return Promise.resolve({ DateTimeOriginal: '2023-06-15T14:30:00' });
      return Promise.reject(new Error('Impossible de lire le fichier optimise'));
    });

    supertest(makeAppWithAdmin())
      .post('/admin/upload')
      .expect(200)
      .end(function (err, res) {
        if (err) return done(err);
        expect(res.body.success).toBe(true);
        // copyFileSync a ete appele (ligne 127 du catch)
        expect(fsModule.copyFileSync).toHaveBeenCalledWith(
          '/fake/temp/upl8',
          expect.stringContaining('verify_error.jpg')
        );
        done();
      });
  });

  // ================================================================
  // 9. Upload : thumbnail sharp.toFile echoue -> copyFileSync fallback
  // ================================================================
  it('utilise copyFileSync quand la miniature echoue', function (done) {
    mockExifrData = null;
    mockExifrError = null;
    mockFileStore['/fake/photos/thumbnails'] = 'dir';
    mockFileStore['/fake/temp/upl9'] = 'original-data-for-thumb-fail';
    mockFiles = [{ path: '/fake/temp/upl9', originalname: 'thumb_fail.jpg' }];

    // Premier toFile (principal) reussit
    mockSharpPipe.toFile.mockResolvedValueOnce(undefined);
    // Deuxieme toFile (miniature) echoue
    mockSharpPipe.toFile.mockRejectedValueOnce(new Error('Sharp thumbnail error'));

    supertest(makeAppWithAdmin())
      .post('/admin/upload')
      .expect(200)
      .end(function (err, res) {
        if (err) return done(err);
        expect(res.body.success).toBe(true);
        // copyFileSync a ete appele pour la miniature (ligne 154)
        expect(fsModule.copyFileSync).toHaveBeenCalledWith(
          '/fake/temp/upl9',
          expect.stringContaining('.webp')
        );
        done();
      });
  });

  // ================================================================
  // 10. EXIF verification : mockExifrError global provoque le fallback copyFileSync
  // ================================================================
  it('retablit l original quand mockExifrError est defini globalement apres le premier parse', function (done) {
    mockExifrData = { DateTimeOriginal: '2023-06-15T14:30:00' };
    // On met mockExifrError apres le premier appel
    // Strategy: on utilise mockImplementationOnce pour le premier appel (succes)
    // Puis on met mockExifrError global pour que le deuxieme appel echoue
    mockExifrError = null;
    mockFileStore['/fake/photos/thumbnails'] = 'dir';
    mockFileStore['/fake/temp/upl10'] = 'original-data-global-error';
    mockFiles = [{ path: '/fake/temp/upl10', originalname: 'global_error.jpg' }];

    // Deuxieme appel (verification) utilisera le comportement par defaut
    // Mais on veut qu'il echoue. On met mockExifrError avant que le deuxieme appel n'ait lieu.
    // Problème : le premier appel verifiera aussi mockExifrError.
    // Solution : mockResolvedValueOnce pour le premier, puis l'implementation par defaut
    // avec mockExifrError positionne pour le deuxieme.
    exifrModule.parse.mockResolvedValueOnce({ DateTimeOriginal: '2023-06-15T14:30:00' });
    // Apres le premier appel, l'implementation par defaut prend le relais.
    // On veut que le deuxieme appel leve une erreur. On positionne mockExifrError maintenant.
    // Mais la promesse du premier appel est deja resolue via mockResolvedValueOnce.
    // Le deuxieme appel passera par l'implementation par defaut qui verifie mockExifrError.
    mockExifrError = new Error('EXIF read error on optimised file');

    supertest(makeAppWithAdmin())
      .post('/admin/upload')
      .expect(200)
      .end(function (err, res) {
        if (err) return done(err);
        expect(res.body.success).toBe(true);
        // copyFileSync a ete appele (branche catch ligne 125-127)
        expect(fsModule.copyFileSync).toHaveBeenCalledWith(
          '/fake/temp/upl10',
          expect.stringContaining('global_error.jpg')
        );
        done();
      });
  });

  // ================================================================
  // 11. fileFilter : accepte les fichiers image/*
  // ================================================================
  it('fileFilter accepte les fichiers avec mimetype image/*', function () {
    var cb = jest.fn();
    mockCapturedMulterOpts.fileFilter(null, { mimetype: 'image/jpeg' }, cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  // ================================================================
  // 12. fileFilter : rejette les fichiers non-image
  // ================================================================
  it('fileFilter rejette les fichiers non-image', function () {
    var cb = jest.fn();
    mockCapturedMulterOpts.fileFilter(null, { mimetype: 'application/pdf' }, cb);
    expect(cb).toHaveBeenCalledWith(expect.any(Error));
    expect(cb.mock.calls[0][0].message).toBe('Seules les images sont autorisées');
  });
});
