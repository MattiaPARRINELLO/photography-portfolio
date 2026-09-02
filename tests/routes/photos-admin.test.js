var express = require('express');
var session = require('express-session');
var cookieParser = require('cookie-parser');

// ================================================================
// Store in-memory partage pour fs
// ================================================================
var mockFsStore = {};
var mockFsReaddirError = null;
var mockFsUnlinkError = null;

jest.mock('fs', function () {
  var actual = jest.requireActual('fs');
  return Object.assign({}, actual, {
    readFileSync: jest.fn(function () { return Buffer.alloc(64 * 1024); }),
    readdir: jest.fn(function (dir, cb) {
      if (mockFsReaddirError) return cb(mockFsReaddirError);
      var dirSlash = dir + '/';
      var files = [];
      Object.keys(mockFsStore).forEach(function (k) {
        if (k.indexOf(dirSlash) === 0) {
          files.push(k.slice(dirSlash.length));
        }
      });
      cb(null, files);
    }),
    statSync: jest.fn(function (p) {
      var inStore = mockFsStore[p];
      return {
        size: inStore ? inStore.length : 1024,
        mtime: new Date('2025-06-01T12:00:00Z')
      };
    }),
    existsSync: jest.fn(function (p) {
      return Object.prototype.hasOwnProperty.call(mockFsStore, p);
    }),
    mkdirSync: jest.fn(),
    unlinkSync: jest.fn(function (p) {
      if (mockFsUnlinkError) throw mockFsUnlinkError;
      delete mockFsStore[p];
    }),
    copyFileSync: jest.fn(function (src, dst) {
      if (Object.prototype.hasOwnProperty.call(mockFsStore, src)) {
        mockFsStore[dst] = mockFsStore[src];
      }
    }),
    promises: Object.assign({}, actual.promises, {
      mkdir: jest.fn().mockResolvedValue(undefined),
      writeFile: jest.fn().mockResolvedValue(undefined),
      readFile: jest.fn().mockResolvedValue('{}'),
      access: jest.fn().mockRejectedValue(new Error('not found')),
      stat: jest.fn().mockResolvedValue({ mtimeMs: Date.now(), size: 1024 }),
      open: jest.fn().mockResolvedValue({ read: jest.fn().mockResolvedValue({ bytesRead: 100 }), close: jest.fn().mockResolvedValue(undefined) })
    })
  });
});

// ================================================================
// Mock server config
// ================================================================
jest.mock('../../server/config', function () {
  return {
    getPaths: jest.fn().mockReturnValue({
      root: '/fake/root',
      pages: '/fake/pages',
      adminPages: '/fake/pages/admin',
      config: '/fake/config/config.json',
      texts: '/fake/config/texts.json',
      photos: '/fake/photos',
      temp: '/fake/temp'
    }),
    getConfig: jest.fn().mockReturnValue({
      thumbnails: {
        width: 600,
        height: 600,
        quality: 90,
        fit: 'inside',
        withoutEnlargement: true
      }
    }),
    getPort: jest.fn().mockReturnValue(3000),
    adminPassword: 'admin-test-password'
  };
});

// ================================================================
// Mock photoService
// ================================================================
var mockPhotoServiceGetPhotosList = jest.fn().mockResolvedValue([
  { url: '/photos/p1.jpg', filename: 'p1.jpg', thumbnailUrl: '/t1.jpg', date: new Date('2025-06-01'), dateSource: 'exif' },
  { url: '/photos/p2.jpg', filename: 'p2.jpg', thumbnailUrl: '/t2.jpg', date: new Date('2025-05-01'), dateSource: 'exif' }
]);

// ================================================================
// Mock exifr
// ================================================================
var mockExifrParse = jest.fn().mockResolvedValue(null);

jest.mock('exifr', function () {
  return { parse: mockExifrParse };
});

jest.mock('../../server/utils/photoService', function () {
  return {
    getPhotosList: mockPhotoServiceGetPhotosList,
    readExif: jest.fn(function () { return mockExifrParse.apply(null, arguments); })
  };
});

// ================================================================
// Mock sharp
// ================================================================
var mockSharpToFile = jest.fn().mockResolvedValue(undefined);

jest.mock('sharp', function () {
  return jest.fn(function () {
    return {
      jpeg: function () { return this; },
      webp: function () { return this; },
      resize: function () { return this; },
      withMetadata: function () { return this; },
      toFile: mockSharpToFile,
      toBuffer: jest.fn().mockResolvedValue(Buffer.from('fake-image'))
    };
  });
});

// ================================================================
// Mock multer
// ================================================================
var mockMulterFiles = [];

jest.mock('multer', function () {
  var fn = function () {
    return {
      array: function () {
        return function (req, res, next) {
          req.files = mockMulterFiles;
          next();
        };
      },
      single: function () { return function (req, res, next) { next(); }; }
    };
  };
  fn.diskStorage = function () { return {}; };
  return fn;
});

// ================================================================
// Chargement du router
// ================================================================
var photosRouter = require('../../server/routes/photos');

// ================================================================
// Fabrique d'application Express pour les tests
// ================================================================
function makeApp(withAdmin) {
  var app = express();
  app.use(cookieParser());
  app.use(session({
    secret: 'test-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
  }));
  if (withAdmin) {
    app.use(function (req, res, next) {
      req.session.isAdmin = true;
      next();
    });
  }
  app.use('/api', photosRouter);
  return app;
}

// ================================================================
// Tests
// ================================================================
describe('Routes photos (admin)', function () {
  var supertest;

  beforeAll(function () {
    supertest = require('supertest');
  });

  beforeEach(function () {
    mockFsStore = {};
    mockFsReaddirError = null;
    mockFsUnlinkError = null;
    mockMulterFiles = [];
    mockPhotoServiceGetPhotosList.mockResolvedValue([
      { url: '/photos/p1.jpg', filename: 'p1.jpg', thumbnailUrl: '/t1.jpg', date: new Date('2025-06-01'), dateSource: 'exif' },
      { url: '/photos/p2.jpg', filename: 'p2.jpg', thumbnailUrl: '/t2.jpg', date: new Date('2025-05-01'), dateSource: 'exif' }
    ]);
    mockExifrParse.mockResolvedValue(null);
    mockSharpToFile.mockResolvedValue(undefined);
  });

  // ================================================================
  // GET /api/photos-list
  // ================================================================
  describe('GET /api/photos-list', function () {
    it('retourne la liste des photos depuis photoService', function (done) {
      supertest(makeApp(false))
        .get('/api/photos-list')
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body).toBeInstanceOf(Array);
          expect(res.body.length).toBe(2);
          expect(res.body[0].filename).toBe('p1.jpg');
          expect(mockPhotoServiceGetPhotosList).toHaveBeenCalled();
          done();
        });
    });

    it('retourne 500 si photoService leve une erreur', function (done) {
      mockPhotoServiceGetPhotosList.mockRejectedValue(new Error('Erreur test'));
      supertest(makeApp(false))
        .get('/api/photos-list')
        .expect(500)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body.error).toBe('Impossible de lire le dossier photos');
          done();
        });
    });
  });

  // ================================================================
  // GET /api/admin/photos
  // ================================================================
  describe('GET /api/admin/photos', function () {
    it('refuse l acces sans session admin (401)', function (done) {
      supertest(makeApp(false))
        .get('/api/admin/photos')
        .expect(401)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body.error).toBe('Session non autorisée');
          done();
        });
    });

    it('retourne la liste des fichiers avec session admin', function (done) {
      mockFsStore['/fake/photos/photo1.jpg'] = 'fake-content-a';
      mockFsStore['/fake/photos/photo2.png'] = 'fake-content-b';
      mockFsStore['/fake/photos/readme.txt'] = 'not-an-image';

      supertest(makeApp(true))
        .get('/api/admin/photos')
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body).toBeInstanceOf(Array);
          expect(res.body.length).toBe(2);
          expect(res.body[0]).toHaveProperty('filename');
          expect(res.body[0]).toHaveProperty('size');
          expect(res.body[0]).toHaveProperty('mtime');
          done();
        });
    });

    it('retourne 500 si readdir echoue', function (done) {
      mockFsReaddirError = new Error('Erreur disque');

      supertest(makeApp(true))
        .get('/api/admin/photos')
        .expect(500)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body.error).toBe('Impossible de lire le dossier photos');
          done();
        });
    });
  });

  // ================================================================
  // DELETE /api/admin/photos/:filename
  // ================================================================
  describe('DELETE /api/admin/photos/:filename', function () {
    it('refuse l acces sans session admin (401)', function (done) {
      supertest(makeApp(false))
        .delete('/api/admin/photos/photo.jpg')
        .expect(401)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body.error).toBe('Session non autorisée');
          done();
        });
    });

    it('retourne 404 si la photo n existe pas', function (done) {
      supertest(makeApp(true))
        .delete('/api/admin/photos/inexistante.jpg')
        .expect(404)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body.error).toBe('Photo non trouvée');
          done();
        });
    });

    it('supprime la photo principale et la miniature', function (done) {
      var fs = require('fs');
      mockFsStore['/fake/photos/photo.jpg'] = 'photo-content';
      mockFsStore['/fake/photos/thumbnails/photo.webp'] = 'thumb-content';

      supertest(makeApp(true))
        .delete('/api/admin/photos/photo.jpg')
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body.success).toBe(true);
          expect(res.body.message).toBe('Photo supprimée avec succès');
          expect(mockFsStore['/fake/photos/photo.jpg']).toBeUndefined();
          expect(mockFsStore['/fake/photos/thumbnails/photo.webp']).toBeUndefined();
          expect(fs.unlinkSync).toHaveBeenCalledTimes(2);
          done();
        });
    });

    it('retourne 500 si la suppression echoue', function (done) {
      mockFsStore['/fake/photos/photo.jpg'] = 'photo-content';
      mockFsUnlinkError = new Error('Erreur disque');

      supertest(makeApp(true))
        .delete('/api/admin/photos/photo.jpg')
        .expect(500)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body.error).toContain('Erreur lors de la suppression');
          done();
        });
    });
  });

  // ================================================================
  // POST /api/admin/upload
  // ================================================================
  describe('POST /api/admin/upload', function () {
    it('refuse l acces sans session admin (401)', function (done) {
      supertest(makeApp(false))
        .post('/api/admin/upload')
        .expect(401)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body.error).toBe('Session non autorisée');
          done();
        });
    });

    it('retourne 0 fichier si aucun fichier n est envoye', function (done) {
      mockMulterFiles = [];

      supertest(makeApp(true))
        .post('/api/admin/upload')
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body.success).toBe(true);
          expect(res.body.files).toBeInstanceOf(Array);
          expect(res.body.files.length).toBe(0);
          done();
        });
    });

    it('traite l upload avec succes (sharp + exifr)', function (done) {
      var fs = require('fs');
      mockFsStore['/fake/photos/thumbnails'] = 'dir';
      mockFsStore['/fake/temp/upl123'] = 'temp-image-content';

      mockMulterFiles = [
        { path: '/fake/temp/upl123', originalname: 'concert.jpg' }
      ];

      supertest(makeApp(true))
        .post('/api/admin/upload')
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body.success).toBe(true);
          expect(res.body.files).toBeInstanceOf(Array);
          expect(res.body.files.length).toBe(1);
          expect(res.body.files[0].originalName).toBe('concert.jpg');
          expect(res.body.files[0]).toHaveProperty('filename');
          expect(res.body.files[0]).toHaveProperty('size');
          // toFile appele 2 fois : photo principale + miniature
          expect(mockSharpToFile).toHaveBeenCalledTimes(2);
          // exifr parse appele via readExif pour lire les metadonnees
          expect(mockExifrParse).toHaveBeenCalled();
          // fichier temporaire nettoye
          expect(fs.unlinkSync).toHaveBeenCalledWith('/fake/temp/upl123');
          done();
        });
    });

    it('retourne 500 en cas d erreur lors de l upload', function (done) {
      mockFsStore['/fake/photos/thumbnails'] = 'dir';
      mockFsStore['/fake/temp/upl123'] = 'temp-content';
      mockFsUnlinkError = new Error('Erreur suppression fichier temporaire');

      mockMulterFiles = [
        { path: '/fake/temp/upl123', originalname: 'concert.jpg' }
      ];

      supertest(makeApp(true))
        .post('/api/admin/upload')
        .expect(500)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body.error).toContain('Erreur lors de l\'upload');
          done();
        });
    });
  });
});
