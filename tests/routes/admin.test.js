var path = require('path');
var express = require('express');
var session = require('express-session');
var cookieParser = require('cookie-parser');

jest.mock('fs', function () {
  var actual = jest.requireActual('fs');
  var store = {};
  return Object.assign({}, actual, {
    existsSync: jest.fn(function (p) { return store[p] !== undefined || p.includes('admin.html'); }),
    readFileSync: jest.fn(function (p, enc) { return store[p] !== undefined ? store[p] : '{}'; }),
    writeFileSync: jest.fn(function (p, d) { store[p] = d; }),
    mkdirSync: jest.fn(),
    statSync: jest.fn(function () { return { size: 1024, mtime: new Date() }; })
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
      temp: '/fake/temp'
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
      array: jest.fn().mockReturnValue(function (req, res, next) { next(); }),
      single: jest.fn().mockReturnValue(function (req, res, next) { next(); }),
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
    getAvailableIcons: jest.fn(),
    generateAvatarHtml: jest.fn(),
    generateLinkHtml: jest.fn(),
    generateWatermarkHtml: jest.fn(),
    generateEventBannerHtml: jest.fn(),
    injectLinksData: jest.fn(),
    ICONS: {}
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

var linksService = require('../../server/utils/linksService');
var galleryService = require('../../server/utils/galleryService');
var adminRouter = require('../../server/routes/admin');

function makeApp() {
  var app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(session({
    secret: 'test-session-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
  }));
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

describe('Routes admin', function () {
  var supertest;

  beforeAll(function () {
    supertest = require('supertest');
  });

  beforeEach(function () {
    jest.clearAllMocks();
    if (adminRouter.loginLimiter) adminRouter.loginLimiter.resetKey('::ffff:127.0.0.1');
    // Valeurs par defaut pour linksService
    linksService.loadLinksConfig.mockReturnValue({
      profile: { name: 'Test', role: 'Photo', tagline: 'T', avatar: { enabled: true, url: '/a.png' } },
      links: [
        { id: 'l1', label: 'L1', url: 'https://e.com', icon: 'link', enabled: true, order: 1, style: 'default' },
        { id: 'l2', label: 'L2', url: 'https://t.com', icon: 'camera', enabled: true, order: 2, style: 'primary' }
      ],
      appearance: { theme: 'dark', accentColor: '#667eea', showWatermark: true },
      seo: { title: 'SEO', description: 'Desc' },
      event: { enabled: false, message: '', url: '', icon: 'star', createdAt: null, expiresAt: null }
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
      return {
        event: {
          enabled: true,
          message: data.message,
          url: data.url || '',
          icon: data.icon || 'star',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + days * 86400000).toISOString()
        }
      };
    });
    linksService.clearEventBanner.mockReturnValue({ event: { enabled: false } });
    linksService.isEventActive.mockReturnValue(false);
    linksService.getEventTimeRemaining.mockReturnValue(null);
    linksService.getAvailableIcons.mockReturnValue(['camera', 'link', 'star']);

    // Valeurs par defaut pour galleryService
    galleryService.listGalleries.mockReturnValue([
      { id: 'g1', slug: 'concert-test', title: 'Concert Test', artist: 'X', venue: 'Y', date: '2025-01-01', photos: ['p1.jpg'], cover: 'p1.jpg', published: true }
    ]);
    galleryService.getGalleryById.mockImplementation(function (id) {
      if (id === 'inexistant') return null;
      return { id: id, slug: 'test', title: 'Test', photos: [], published: true };
    });
    galleryService.createGallery.mockImplementation(function (input) {
      if (!input.title || !input.title.trim()) throw new Error('Le titre est requis');
      return { id: 'g-new', slug: 'new', title: input.title, photos: input.photos || [] };
    });
    galleryService.updateGallery.mockImplementation(function (id, upd) {
      if (id === 'inexistant') return null;
      return { id: id, slug: 'test', title: upd.title || 'Test', photos: [] };
    });
    galleryService.deleteGallery.mockImplementation(function (id) {
      return id !== 'inexistant';
    });
  });

  // ================================================================
  // Login/Logout
  // ================================================================
  describe('POST /admin/login', function () {
    it('connexion avec bon mot de passe', function (done) {
      supertest(makeApp())
        .post('/admin/login')
        .send({ password: 'admin-test-password' })
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body.success).toBe(true);
          done();
        });
    });

    it('connexion avec mauvais mot de passe', function (done) {
      supertest(makeApp())
        .post('/admin/login')
        .send({ password: 'mauvais' })
        .expect(401)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body.error).toBe('Mot de passe incorrect');
          done();
        });
    });
  });

  describe('POST /admin/logout', function () {
    it('deconnexion reussie', function (done) {
      supertest(makeApp())
        .post('/admin/logout')
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body.success).toBe(true);
          done();
        });
    });
  });

  // ================================================================
  // Session / Status
  // ================================================================
  describe('GET /admin/session-status', function () {
    it('non connecte -> false', function (done) {
      supertest(makeApp())
        .get('/admin/session-status')
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body.isLoggedIn).toBe(false);
          done();
        });
    });
  });

  describe('GET /admin/status', function () {
    it('non connecte -> false', function (done) {
      supertest(makeApp())
        .get('/admin/status')
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body.isLoggedIn).toBe(false);
          done();
        });
    });
  });

  describe('GET /admin/check-auth', function () {
    it('non authentifie -> 401', function (done) {
      supertest(makeApp())
        .get('/admin/check-auth')
        .expect(401)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body.authenticated).toBe(false);
          done();
        });
    });
  });

  // ================================================================
  // Config
  // ================================================================
  describe('GET /admin/config', function () {
    it('refuse sans session', function (done) {
      supertest(makeApp()).get('/admin/config').expect(401).end(function (err) { done(err); });
    });

    it('accepte avec session admin', function (done) {
      var app = makeApp();
      loginSession(app, function (err, cookies) {
        if (err) return done(err);
        supertest(app).get('/admin/config').set('Cookie', cookies).expect(200).end(done);
      });
    });
  });

  describe('PUT /admin/config', function () {
    it('met a jour la config', function (done) {
      var app = makeApp();
      loginSession(app, function (err, cookies) {
        if (err) return done(err);
        supertest(app)
          .put('/admin/config')
          .set('Cookie', cookies)
          .send({ thumbnails: { width: 800 } })
          .expect(200)
          .end(function (err2, res) {
            if (err2) return done(err2);
            expect(res.body.success).toBe(true);
            done();
          });
      });
    });
  });

  // ================================================================
  // API Links
  // ================================================================
  describe('GET /admin/api/links', function () {
    it('refuse sans session', function (done) {
      supertest(makeApp()).get('/admin/api/links').expect(401).end(done);
    });

    it('retourne la config', function (done) {
      var app = makeApp();
      loginSession(app, function (err, cookies) {
        if (err) return done(err);
        supertest(app).get('/admin/api/links').set('Cookie', cookies).expect(200).end(function (err2, res) {
          if (err2) return done(err2);
          expect(res.body.links).toBeDefined();
          done();
        });
      });
    });
  });

  describe('POST /admin/api/links/add', function () {
    it('ajoute un lien', function (done) {
      var app = makeApp();
      loginSession(app, function (err, cookies) {
        if (err) return done(err);
        supertest(app)
          .post('/admin/api/links/add')
          .set('Cookie', cookies)
          .send({ label: 'Nouveau', url: 'https://n.com', icon: 'link' })
          .expect(200)
          .end(function (err2, res) {
            if (err2) return done(err2);
            expect(res.body.success).toBe(true);
            done();
          });
      });
    });
  });

  describe('DELETE /admin/api/links/:id', function () {
    it('supprime un lien', function (done) {
      var app = makeApp();
      loginSession(app, function (err, cookies) {
        if (err) return done(err);
        supertest(app)
          .delete('/admin/api/links/l1')
          .set('Cookie', cookies)
          .expect(200)
          .end(function (err2, res) {
            if (err2) return done(err2);
            expect(res.body.success).toBe(true);
            done();
          });
      });
    });
  });

  describe('POST /admin/api/links/reorder', function () {
    it('reordonne les liens', function (done) {
      var app = makeApp();
      loginSession(app, function (err, cookies) {
        if (err) return done(err);
        supertest(app)
          .post('/admin/api/links/reorder')
          .set('Cookie', cookies)
          .send({ orderedIds: ['l2', 'l1'] })
          .expect(200)
          .end(function (err2, res) {
            if (err2) return done(err2);
            expect(res.body.success).toBe(true);
            done();
          });
      });
    });
  });

  describe('PUT /admin/api/links/profile', function () {
    it('met a jour le profil', function (done) {
      var app = makeApp();
      loginSession(app, function (err, cookies) {
        if (err) return done(err);
        supertest(app)
          .put('/admin/api/links/profile')
          .set('Cookie', cookies)
          .send({ name: 'Nouveau Nom' })
          .expect(200)
          .end(function (err2, res) {
            if (err2) return done(err2);
            expect(res.body.success).toBe(true);
            done();
          });
      });
    });
  });

  describe('GET /admin/api/links/icons', function () {
    it('retourne les icones', function (done) {
      var app = makeApp();
      loginSession(app, function (err, cookies) {
        if (err) return done(err);
        supertest(app).get('/admin/api/links/icons').set('Cookie', cookies).expect(200).end(function (err2, res) {
          if (err2) return done(err2);
          expect(res.body.icons).toBeDefined();
          done();
        });
      });
    });
  });

  // ================================================================
  // Event Banner
  // ================================================================
  describe('ALL /admin/api/links/event', function () {
    it('GET retourne l etat', function (done) {
      var app = makeApp();
      loginSession(app, function (err, cookies) {
        if (err) return done(err);
        supertest(app).get('/admin/api/links/event').set('Cookie', cookies).expect(200).end(function (err2, res) {
          if (err2) return done(err2);
          expect(res.body.event).toBeDefined();
          done();
        });
      });
    });

    it('POST cree un bandeau', function (done) {
      var app = makeApp();
      loginSession(app, function (err, cookies) {
        if (err) return done(err);
        supertest(app)
          .post('/admin/api/links/event')
          .set('Cookie', cookies)
          .send({ message: 'Event!', url: 'https://e.com', icon: 'star', days: 3 })
          .expect(200)
          .end(function (err2, res) {
            if (err2) return done(err2);
            expect(res.body.success).toBe(true);
            done();
          });
      });
    });

    it('POST refuse message vide', function (done) {
      var app = makeApp();
      loginSession(app, function (err, cookies) {
        if (err) return done(err);
        supertest(app)
          .post('/admin/api/links/event')
          .set('Cookie', cookies)
          .send({ message: '' })
          .expect(400)
          .end(done);
      });
    });

    it('DELETE desactive le bandeau', function (done) {
      var app = makeApp();
      loginSession(app, function (err, cookies) {
        if (err) return done(err);
        supertest(app)
          .delete('/admin/api/links/event')
          .set('Cookie', cookies)
          .expect(200)
          .end(function (err2, res) {
            if (err2) return done(err2);
            expect(res.body.success).toBe(true);
            done();
          });
      });
    });
  });

  // ================================================================
  // API Galleries
  // ================================================================
  describe('GET /admin/api/galleries', function () {
    it('retourne la liste', function (done) {
      var app = makeApp();
      loginSession(app, function (err, cookies) {
        if (err) return done(err);
        supertest(app).get('/admin/api/galleries').set('Cookie', cookies).expect(200).end(function (err2, res) {
          if (err2) return done(err2);
          expect(res.body.galleries).toBeDefined();
          done();
        });
      });
    });
  });

  describe('POST /admin/api/galleries', function () {
    it('cree une galerie', function (done) {
      var app = makeApp();
      loginSession(app, function (err, cookies) {
        if (err) return done(err);
        supertest(app)
          .post('/admin/api/galleries')
          .set('Cookie', cookies)
          .send({ title: 'Nouvelle', artist: 'A', photos: ['p1.jpg'] })
          .expect(200)
          .end(function (err2, res) {
            if (err2) return done(err2);
            expect(res.body.success).toBe(true);
            done();
          });
      });
    });

    it('refuse sans titre', function (done) {
      var app = makeApp();
      loginSession(app, function (err, cookies) {
        if (err) return done(err);
        supertest(app)
          .post('/admin/api/galleries')
          .set('Cookie', cookies)
          .send({ artist: 'A' })
          .expect(400)
          .end(done);
      });
    });
  });

  describe('DELETE /admin/api/galleries/:id', function () {
    it('supprime une galerie', function (done) {
      var app = makeApp();
      loginSession(app, function (err, cookies) {
        if (err) return done(err);
        supertest(app)
          .delete('/admin/api/galleries/g1')
          .set('Cookie', cookies)
          .expect(200)
          .end(function (err2, res) {
            if (err2) return done(err2);
            expect(res.body.success).toBe(true);
            done();
          });
      });
    });

    it('retourne 404 si non trouvee', function (done) {
      var app = makeApp();
      loginSession(app, function (err, cookies) {
        if (err) return done(err);
        supertest(app)
          .delete('/admin/api/galleries/inexistant')
          .set('Cookie', cookies)
          .expect(404)
          .end(done);
      });
    });
  });
});
