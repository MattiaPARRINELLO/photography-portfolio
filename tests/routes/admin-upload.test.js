var path = require('path');
var session = require('express-session');
var cookieParser = require('cookie-parser');

// ================================================================
// Mocks
// ================================================================

// Forcer strict routing sur express.Router() pour que les routes
// avec slash final (/text-editor/, /links/, /galleries/) soient
// distinctes des routes sans slash
jest.mock('express', function () {
  var actual = jest.requireActual('express');
  var keys = Object.getOwnPropertyNames(actual);
  function mockExpress() { return actual.apply(null, arguments); }
  for (var i = 0; i < keys.length; i++) {
    mockExpress[keys[i]] = actual[keys[i]];
  }
  mockExpress.Router = function (opts) {
    return actual.Router(Object.assign({}, opts, { strict: true }));
  };
  return mockExpress;
});

jest.mock('fs', function () {
  var actual = jest.requireActual('fs');
  return Object.assign({}, actual, {
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
    mkdirSync: jest.fn(),
    statSync: jest.fn()
  });
});

jest.mock('../../server/config', function () {
  return {
    getPaths: jest.fn().mockReturnValue({
      root: '/fake/root',
      pages: '/fake/pages',
      adminPages: '/fake/pages/admin',
      config: '/fake/config/config.json',
      texts: '/fake/config/texts.json',
      photos: '/fake/photos',
      temp: '/fake/temp',
      stats: '/fake/logs/stats.json'
    }),
    getConfig: jest.fn().mockReturnValue({}),
    getPort: jest.fn().mockReturnValue(3000),
    adminPassword: 'admin-test-password',
    reloadConfig: jest.fn()
  };
});

jest.mock('multer', function () {
  var fn = jest.fn().mockImplementation(function () {
    return {
      array: jest.fn().mockReturnValue(function (req, res, next) {
        if (req.body && req.body.__mockFiles) {
          req.files = req.body.__mockFiles;
          delete req.body.__mockFiles;
        }
        next();
      }),
      single: jest.fn().mockReturnValue(function (req, res, next) {
        if (req.body && req.body.__mockFile) {
          req.file = req.body.__mockFile;
          delete req.body.__mockFile;
        }
        next();
      }),
      diskStorage: jest.fn()
    };
  });
  fn.diskStorage = jest.fn();
  return fn;
});

jest.mock('../../server/utils/linksService', function () {
  return {
    loadLinksConfig: jest.fn(),
    saveLinksConfig: jest.fn(),
    addLink: jest.fn(),
    updateLink: jest.fn(),
    deleteLink: jest.fn(),
    reorderLinks: jest.fn(),
    updateProfile: jest.fn(),
    setEventBanner: jest.fn(),
    clearEventBanner: jest.fn(),
    isEventActive: jest.fn(),
    getEventTimeRemaining: jest.fn(),
    getAvailableIcons: jest.fn()
  };
});

jest.mock('../../server/utils/galleryService', function () {
  return {
    loadGalleries: jest.fn(),
    listGalleries: jest.fn(),
    getGalleryBySlug: jest.fn(),
    getGalleryById: jest.fn(),
    createGallery: jest.fn(),
    updateGallery: jest.fn(),
    deleteGallery: jest.fn()
  };
});

var express = require('express');
var fs = require('fs');
var linksService = require('../../server/utils/linksService');
var galleryService = require('../../server/utils/galleryService');
var adminRouter = require('../../server/routes/admin');

// ================================================================
// Helpers
// ================================================================

function makeApp() {
  var app = express();
  app.set('strict routing', true);
  app.use(express.json());
  app.use(cookieParser());
  app.use(session({
    secret: 'test-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
  }));
  // Intercepter res.sendFile pour eviter de lire le disque
  app.use(function (req, res, next) {
    res.sendFile = function (filePath, opts, cb) {
      if (typeof opts === 'function') { cb = opts; opts = undefined; }
      if (req.query && req.query.__sendFileError === '1') {
        if (typeof cb === 'function') { cb(new Error('ENOENT: mock sendFile error')); }
        return;
      }
      res.status(200).type('text/html').send('<!-- mock page -->');
      if (typeof cb === 'function') { cb(null); }
    };
    next();
  });
  app.use('/admin', adminRouter);
  return app;
}

function loginSession(app, done) {
  var supertest = require('supertest');
  supertest(app)
    .post('/admin/login')
    .send({ password: 'admin-test-password' })
    .end(function (err, res) {
      if (err) return done(err);
      done(null, res.headers['set-cookie']);
    });
}

// ================================================================
// Tests
// ================================================================

describe('Routes admin - couverture complementaire', function () {
  var supertest;

  beforeAll(function () {
    supertest = require('supertest');
  });

  beforeEach(function () {
    jest.clearAllMocks();

    // --- fs defaults ---
    fs.existsSync.mockReturnValue(true);
    fs.statSync.mockReturnValue({ size: 1024, mtime: new Date() });
    fs.readFileSync.mockImplementation(function (filePath) {
      if (filePath === '/fake/config/config.json') return '{"thumbnails":{"width":400}}';
      return '{}';
    });
    fs.writeFileSync.mockImplementation(function () {});

    // --- linksService defaults ---
    linksService.loadLinksConfig.mockReturnValue({
      profile: { name: 'Test', role: 'Photo', tagline: 'T', avatar: { enabled: true, url: '/a.png' } },
      links: [
        { id: 'l1', label: 'L1', url: 'https://a.com', icon: 'link', enabled: true, order: 1, style: 'default' },
        { id: 'l2', label: 'L2', url: 'https://b.com', icon: 'camera', enabled: true, order: 2, style: 'primary' }
      ],
      appearance: { theme: 'dark', accentColor: '#667eea', showWatermark: true },
      seo: { title: 'SEO', description: 'Desc' },
      event: { enabled: false }
    });
    linksService.saveLinksConfig.mockReturnValue(true);
    linksService.addLink.mockImplementation(function (data) { return linksService.loadLinksConfig(); });
    linksService.updateLink.mockImplementation(function (id, upd) {
      if (id === 'inexistant') return null;
      return linksService.loadLinksConfig();
    });
    linksService.deleteLink.mockImplementation(function (id) {
      if (id === 'inexistant') return null;
      return linksService.loadLinksConfig();
    });
    linksService.reorderLinks.mockReturnValue(linksService.loadLinksConfig());
    linksService.updateProfile.mockReturnValue(linksService.loadLinksConfig());
    linksService.setEventBanner.mockImplementation(function (data, days) {
      var d = days || 7;
      return {
        event: { enabled: true, message: data.message, url: data.url || '', icon: data.icon || 'star',
          createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + d * 86400000).toISOString() }
      };
    });
    linksService.clearEventBanner.mockReturnValue({ event: { enabled: false } });
    linksService.isEventActive.mockReturnValue(false);
    linksService.getEventTimeRemaining.mockReturnValue(null);
    linksService.getAvailableIcons.mockReturnValue(['camera', 'link', 'star']);

    // --- galleryService defaults ---
    galleryService.listGalleries.mockReturnValue([
      { id: 'g1', slug: 'concert-test', title: 'Concert Test', artist: 'X', venue: 'Y', date: '2025-01-01',
        photos: ['p1.jpg'], cover: 'p1.jpg', published: true }
    ]);
    galleryService.getGalleryById.mockImplementation(function (id) {
      if (id === 'inexistant') return null;
      return { id: id, slug: 'test-' + id, title: 'Test ' + id, photos: ['p1.jpg'], published: true };
    });
    galleryService.createGallery.mockImplementation(function (input) {
      if (!input.title || !input.title.trim()) throw new Error('Le titre est requis');
      return { id: 'g-new', slug: 'nouvelle', title: input.title, photos: input.photos || [], published: true };
    });
    galleryService.updateGallery.mockImplementation(function (id, upd) {
      if (id === 'inexistant') return null;
      return { id: id, slug: 'maj-' + id, title: upd.title || 'Test', photos: upd.photos || [], published: true };
    });
    galleryService.deleteGallery.mockImplementation(function (id) {
      return id !== 'inexistant';
    });
  });

  // ================================================================
  // Pages HTML (sendFile) — lignes 160-198, 202, 280, 454
  // ================================================================

  describe('GET /admin/ — page admin principale', function () {
    it('renvoie 200 quand le fichier existe', function (done) {
      var app = makeApp();
      supertest(app)
        .get('/admin/')
        .expect(200)
        .expect('Content-Type', /html/)
        .end(done);
    });

    it('renvoie 404 quand admin.html est introuvable', function (done) {
      fs.existsSync.mockReturnValue(false);
      var app = makeApp();
      supertest(app)
        .get('/admin/')
        .expect(404)
        .end(done);
    });

    it('renvoie 500 si sendFile echoue (erreur interne)', function (done) {
      var app = makeApp();
      supertest(app)
        .get('/admin/?__sendFileError=1')
        .expect(500)
        .end(done);
    });
  });

  describe('GET /admin/text-editor — editeur de texte', function () {
    it('renvoie 200 quand le fichier existe', function (done) {
      var app = makeApp();
      supertest(app)
        .get('/admin/text-editor')
        .expect(200)
        .end(done);
    });
  });

  describe('GET /admin/links — page liens', function () {
    it('renvoie 200', function (done) {
      var app = makeApp();
      supertest(app)
        .get('/admin/links')
        .expect(200)
        .end(done);
    });
  });

  describe('GET /admin/galleries — page galeries', function () {
    it('renvoie 200', function (done) {
      var app = makeApp();
      supertest(app)
        .get('/admin/galleries')
        .expect(200)
        .end(done);
    });
  });

  // ================================================================
  // Redirections — lignes 207, 285, 456
  // ================================================================

  describe('Redirections avec slash final', function () {
    it('GET /admin/text-editor/ redirige vers /admin/text-editor', function (done) {
      supertest(makeApp())
        .get('/admin/text-editor/')
        .expect(302)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.headers.location).toBe('/admin/text-editor');
          done();
        });
    });

    it('GET /admin/links/ redirige vers /admin/links', function (done) {
      supertest(makeApp())
        .get('/admin/links/')
        .expect(302)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.headers.location).toBe('/admin/links');
          done();
        });
    });

    it('GET /admin/galleries/ redirige vers /admin/galleries', function (done) {
      supertest(makeApp())
        .get('/admin/galleries/')
        .expect(302)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.headers.location).toBe('/admin/galleries');
          done();
        });
    });
  });

  // ================================================================
  // check-auth — branche succes (ligne 291)
  // ================================================================

  describe('GET /admin/check-auth — branche authentifiee', function () {
    it('renvoie authenticated=true avec session admin', function (done) {
      var app = makeApp();
      loginSession(app, function (err, cookies) {
        if (err) return done(err);
        supertest(app)
          .get('/admin/check-auth')
          .set('Cookie', cookies)
          .expect(200)
          .end(function (err2, res) {
            if (err2) return done(err2);
            expect(res.body.authenticated).toBe(true);
            done();
          });
      });
    });
  });

  // ================================================================
  // Config — branches erreur (lignes 253-254, 269-270)
  // ================================================================

  describe('GET /admin/config — erreur lecture', function () {
    it('renvoie 500 si readFileSync leve une exception', function (done) {
      fs.readFileSync.mockImplementation(function () { throw new Error('Permission denied'); });
      var app = makeApp();
      loginSession(app, function (err, cookies) {
        if (err) return done(err);
        supertest(app)
          .get('/admin/config')
          .set('Cookie', cookies)
          .expect(500)
          .end(function (err2, res) {
            if (err2) return done(err2);
            expect(res.body.error).toBe('Erreur lors de la lecture de la configuration');
            done();
          });
      });
    });
  });

  describe('PUT /admin/config — erreur ecriture', function () {
    it('renvoie 500 si writeFileSync leve une exception', function (done) {
      fs.writeFileSync.mockImplementation(function () { throw new Error('Disk full'); });
      var app = makeApp();
      loginSession(app, function (err, cookies) {
        if (err) return done(err);
        supertest(app)
          .put('/admin/config')
          .set('Cookie', cookies)
          .send({ thumbnails: { width: 800 } })
          .expect(500)
          .end(function (err2, res) {
            if (err2) return done(err2);
            expect(res.body.error).toContain('Erreur lors de la sauvegarde');
            done();
          });
      });
    });
  });

  // ================================================================
  // PUT /admin/api/links — route non couverte (lignes 310-321)
  // ================================================================

  describe('PUT /admin/api/links — mise a jour complete des liens', function () {
    it('reussit quand saveLinksConfig retourne true', function (done) {
      linksService.saveLinksConfig.mockReturnValue(true);
      var app = makeApp();
      loginSession(app, function (err, cookies) {
        if (err) return done(err);
        supertest(app)
          .put('/admin/api/links')
          .set('Cookie', cookies)
          .send({ links: [{ id: 'n1', label: 'Nouveau', url: 'https://n.com' }] })
          .expect(200)
          .end(function (err2, res) {
            if (err2) return done(err2);
            expect(res.body.success).toBe(true);
            done();
          });
      });
    });

    it('renvoie 500 quand saveLinksConfig retourne false', function (done) {
      linksService.saveLinksConfig.mockReturnValue(false);
      var app = makeApp();
      loginSession(app, function (err, cookies) {
        if (err) return done(err);
        supertest(app)
          .put('/admin/api/links')
          .set('Cookie', cookies)
          .send({ links: [] })
          .expect(500)
          .end(function (err2, res) {
            if (err2) return done(err2);
            expect(res.body.error).toBe('Erreur lors de la sauvegarde');
            done();
          });
      });
    });
  });

  // ================================================================
  // PUT /admin/api/links/:linkId — route non couverte (lignes 338-353)
  // ================================================================

  describe('PUT /admin/api/links/:linkId — mise a jour lien unique', function () {
    it('reussit quand le lien existe', function (done) {
      var app = makeApp();
      loginSession(app, function (err, cookies) {
        if (err) return done(err);
        supertest(app)
          .put('/admin/api/links/l1')
          .set('Cookie', cookies)
          .send({ label: 'Modifie', url: 'https://m.com' })
          .expect(200)
          .end(function (err2, res) {
            if (err2) return done(err2);
            expect(res.body.success).toBe(true);
            done();
          });
      });
    });

    it('renvoie 404 quand le lien est inexistant', function (done) {
      var app = makeApp();
      loginSession(app, function (err, cookies) {
        if (err) return done(err);
        supertest(app)
          .put('/admin/api/links/inexistant')
          .set('Cookie', cookies)
          .send({ label: 'X' })
          .expect(404)
          .end(function (err2, res) {
            if (err2) return done(err2);
            expect(res.body.error).toBe('Lien non trouvé');
            done();
          });
      });
    });
  });

  // ================================================================
  // DELETE /admin/api/links/:linkId — branche 404 (ligne 364)
  // ================================================================

  describe('DELETE /admin/api/links/:linkId — lien inexistant', function () {
    it('renvoie 404 si le lien n existe pas', function (done) {
      var app = makeApp();
      loginSession(app, function (err, cookies) {
        if (err) return done(err);
        supertest(app)
          .delete('/admin/api/links/inexistant')
          .set('Cookie', cookies)
          .expect(404)
          .end(function (err2, res) {
            if (err2) return done(err2);
            expect(res.body.error).toBe('Lien non trouvé');
            done();
          });
      });
    });
  });

  // ================================================================
  // GET /admin/api/galleries/:id — route non couverte (lignes 469-473)
  // ================================================================

  describe('GET /admin/api/galleries/:id — galerie par ID', function () {
    it('renvoie la galerie si elle existe', function (done) {
      var app = makeApp();
      loginSession(app, function (err, cookies) {
        if (err) return done(err);
        supertest(app)
          .get('/admin/api/galleries/g1')
          .set('Cookie', cookies)
          .expect(200)
          .end(function (err2, res) {
            if (err2) return done(err2);
            expect(res.body.gallery).toBeDefined();
            expect(res.body.gallery.id).toBe('g1');
            done();
          });
      });
    });

    it('renvoie 404 si la galerie est inexistante', function (done) {
      var app = makeApp();
      loginSession(app, function (err, cookies) {
        if (err) return done(err);
        supertest(app)
          .get('/admin/api/galleries/inexistant')
          .set('Cookie', cookies)
          .expect(404)
          .end(function (err2, res) {
            if (err2) return done(err2);
            expect(res.body.error).toBe('Galerie non trouvée');
            done();
          });
      });
    });
  });

  // ================================================================
  // PUT /admin/api/galleries/:id — route non couverte (lignes 491-502)
  // ================================================================

  describe('PUT /admin/api/galleries/:id — mise a jour galerie', function () {
    it('reussit quand la galerie existe', function (done) {
      var app = makeApp();
      loginSession(app, function (err, cookies) {
        if (err) return done(err);
        supertest(app)
          .put('/admin/api/galleries/g1')
          .set('Cookie', cookies)
          .send({ title: 'Titre modifie', photos: ['p1.jpg', 'p2.jpg'] })
          .expect(200)
          .end(function (err2, res) {
            if (err2) return done(err2);
            expect(res.body.success).toBe(true);
            expect(res.body.gallery).toBeDefined();
            done();
          });
      });
    });

    it('renvoie 404 si la galerie est inexistante', function (done) {
      var app = makeApp();
      loginSession(app, function (err, cookies) {
        if (err) return done(err);
        supertest(app)
          .put('/admin/api/galleries/inexistant')
          .set('Cookie', cookies)
          .send({ title: 'X' })
          .expect(404)
          .end(function (err2, res) {
            if (err2) return done(err2);
            expect(res.body.error).toBe('Galerie non trouvée');
            done();
          });
      });
    });
  });

  // ================================================================
  // POST /admin/api/galleries avec fichiers (multer + buildGalleryInputFromRequest)
  // ================================================================

  describe('POST /admin/api/galleries — avec fichiers uploades', function () {
    it('integre les fichiers uploades dans la galerie', function (done) {
      var app = makeApp();
      loginSession(app, function (err, cookies) {
        if (err) return done(err);
        var mockFiles = [
          { filename: '1712000000-abc123-photo.jpg', originalname: 'photo.jpg' },
          { filename: '1712000001-def456-image.png', originalname: 'image.png' }
        ];
        supertest(app)
          .post('/admin/api/galleries')
          .set('Cookie', cookies)
          .send({
            title: 'Galerie avec uploads',
            artist: 'Artiste Test',
            __mockFiles: mockFiles
          })
          .expect(200)
          .end(function (err2, res) {
            if (err2) return done(err2);
            expect(res.body.success).toBe(true);
            expect(galleryService.createGallery).toHaveBeenCalled();
            var createInput = galleryService.createGallery.mock.calls[0][0];
            expect(createInput.uploadedPhotos).toEqual([
              '1712000000-abc123-photo.jpg',
              '1712000001-def456-image.png'
            ]);
            expect(createInput.galleryOnlyPhotos).toEqual([
              '1712000000-abc123-photo.jpg',
              '1712000001-def456-image.png'
            ]);
            done();
          });
      });
    });
  });

  // ================================================================
  // PUT /admin/api/galleries/:id avec fichiers
  // ================================================================

  describe('PUT /admin/api/galleries/:id — avec fichiers uploades', function () {
    it('merge les fichiers uploades avec les photos existantes', function (done) {
      var app = makeApp();
      loginSession(app, function (err, cookies) {
        if (err) return done(err);
        var mockFiles = [
          { filename: '1712000000-nouveau.jpg', originalname: 'nouveau.jpg' }
        ];
        supertest(app)
          .put('/admin/api/galleries/g1')
          .set('Cookie', cookies)
          .send({
            title: 'Mise a jour avec fichier',
            photos: ['existante.jpg'],
            __mockFiles: mockFiles
          })
          .expect(200)
          .end(function (err2, res) {
            if (err2) return done(err2);
            expect(res.body.success).toBe(true);
            expect(galleryService.updateGallery).toHaveBeenCalled();
            var updateInput = galleryService.updateGallery.mock.calls[0][1];
            expect(updateInput.photos).toContain('existante.jpg');
            expect(updateInput.photos).toContain('1712000000-nouveau.jpg');
            expect(updateInput.uploadedPhotos).toEqual(['1712000000-nouveau.jpg']);
            done();
          });
      });
    });
  });

  // ================================================================
  // parsePhotosField — branche JSON et virgules (lignes 47-56)
  // ================================================================

  describe('parsePhotosField — via POST /admin/api/galleries', function () {
    it('accepte photos en JSON string', function (done) {
      var app = makeApp();
      loginSession(app, function (err, cookies) {
        if (err) return done(err);
        supertest(app)
          .post('/admin/api/galleries')
          .set('Cookie', cookies)
          .send({ title: 'Photos JSON', photos: '["p1.jpg","p2.jpg"]' })
          .expect(200)
          .end(function (err2, res) {
            if (err2) return done(err2);
            var input = galleryService.createGallery.mock.calls[0][0];
            expect(input.photos).toEqual(['p1.jpg', 'p2.jpg']);
            done();
          });
      });
    });

    it('accepte photos en string separee par virgules', function (done) {
      var app = makeApp();
      loginSession(app, function (err, cookies) {
        if (err) return done(err);
        supertest(app)
          .post('/admin/api/galleries')
          .set('Cookie', cookies)
          .send({ title: 'Photos CSV', photos: 'a.jpg, b.jpg , c.jpg' })
          .expect(200)
          .end(function (err2, res) {
            if (err2) return done(err2);
            var input = galleryService.createGallery.mock.calls[0][0];
            expect(input.photos).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
            done();
          });
      });
    });
  });

  // ================================================================
  // buildGalleryInputFromRequest — payload wrapper + artistLinks objet
  // ================================================================

  describe('buildGalleryInputFromRequest — payload JSON wrapper', function () {
    it('extrait les champs depuis un payload JSON string', function (done) {
      var app = makeApp();
      loginSession(app, function (err, cookies) {
        if (err) return done(err);
        supertest(app)
          .post('/admin/api/galleries')
          .set('Cookie', cookies)
          .send({
            payload: JSON.stringify({ title: 'Via payload', artist: 'Payload Artiste' })
          })
          .expect(200)
          .end(function (err2, res) {
            if (err2) return done(err2);
            var input = galleryService.createGallery.mock.calls[0][0];
            expect(input.title).toBe('Via payload');
            expect(input.artist).toBe('Payload Artiste');
            done();
          });
      });
    });
  });

  describe('buildGalleryInputFromRequest — artistLinks comme objet', function () {
    it('accepte artistLinks comme objet JS', function (done) {
      var app = makeApp();
      loginSession(app, function (err, cookies) {
        if (err) return done(err);
        supertest(app)
          .post('/admin/api/galleries')
          .set('Cookie', cookies)
          .send({
            title: 'Avec liens artiste',
            artistLinks: { instagram: '@test', deezer: 'deezer.com/test' }
          })
          .expect(200)
          .end(function (err2, res) {
            if (err2) return done(err2);
            var input = galleryService.createGallery.mock.calls[0][0];
            expect(input.artistLinks).toBeDefined();
            expect(input.artistLinks.instagram).toBe('@test');
            expect(input.artistLinks.deezer).toBe('deezer.com/test');
            done();
          });
      });
    });
  });
});
