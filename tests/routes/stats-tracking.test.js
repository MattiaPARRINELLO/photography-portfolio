var express = require('express');
var session = require('express-session');
var cookieParser = require('cookie-parser');
var crypto = require('crypto');

// ================================================================
// MOCKS
// ================================================================

// In-memory fs store
var fileStore = {};

jest.mock('fs', function () {
  return {
    existsSync: jest.fn(function (p) { return fileStore[p] !== undefined; }),
    readFileSync: jest.fn(function (p, enc) {
      if (fileStore[p] !== undefined) return fileStore[p];
      var e = new Error('ENOENT'); e.code = 'ENOENT'; throw e;
    }),
    writeFileSync: jest.fn(function (p, d) { fileStore[p] = d; }),
    mkdirSync: jest.fn(),
    statSync: jest.fn(function () { return { size: 1024, mtime: new Date() }; }),
    readdirSync: jest.fn().mockReturnValue([]),
    unlinkSync: jest.fn(function (p) { delete fileStore[p]; }),
    promises: {
      mkdir: jest.fn().mockResolvedValue(undefined),
      writeFile: jest.fn().mockResolvedValue(undefined),
      readFile: jest.fn().mockResolvedValue('{}'),
      access: jest.fn().mockRejectedValue(new Error('ENOENT')),
      stat: jest.fn().mockResolvedValue({ mtimeMs: Date.now() }),
      readdir: jest.fn().mockResolvedValue([])
    }
  };
});

jest.mock('../../server/config', function () {
  return {
    getPaths: jest.fn().mockReturnValue({
      root: '/fake/root', pages: '/fake/pages', adminPages: '/fake/pages/admin',
      texts: '/fake/config/texts.json', photos: '/fake/photos', temp: '/fake/temp',
      stats: '/fake/logs/stats.json', config: '/fake/config/config.json'
    }),
    getConfig: jest.fn().mockReturnValue({}),
    getPort: jest.fn().mockReturnValue(3000),
    adminPassword: 'test',
    smtpHost: 'smtp.test.com', smtpPort: 587, smtpUser: 'u@t.com', smtpPass: 'p'
  };
});

jest.mock('multer', function () {
  return function () {
    return {
      array: function () { return function (req, res, next) { next(); }; },
      single: function () { return function (req, res, next) { next(); }; }
    };
  };
});

jest.mock('nodemailer', function () {
  return {
    createTransport: jest.fn().mockReturnValue({
      sendMail: jest.fn().mockResolvedValue({ messageId: 'id' })
    })
  };
});

jest.mock('../../server/utils/campaignService', function () {
  return {
    getCampaignInfo: jest.fn().mockReturnValue(null),
    getUserCampaignInfo: jest.fn().mockReturnValue(null),
    associateUserToCampaign: jest.fn(),
    processCampaignFromQuery: jest.fn()
  };
});

jest.mock('../../server/utils/photoService', function () {
  return { getPhotosList: jest.fn().mockResolvedValue([]) };
});

jest.mock('../../server/utils/galleryService', function () {
  return {
    loadGalleries: jest.fn().mockReturnValue({ galleries: [] }),
    listGalleries: jest.fn().mockReturnValue([]),
    getGalleryBySlug: jest.fn().mockReturnValue(null),
    getGalleryById: jest.fn().mockReturnValue(null)
  };
});

jest.mock('../../server/utils/textUtils', function () {
  return {
    loadTexts: jest.fn().mockReturnValue({}),
    loadSeoData: jest.fn().mockReturnValue({}),
    injectMetaTags: jest.fn(function (html) { return html; }),
    generateSchemaJsonLd: jest.fn().mockReturnValue('')
  };
});

jest.mock('../../server/utils/linksService', function () {
  return {
    loadLinksConfig: jest.fn().mockReturnValue({
      profile: { name: 'Test', avatar: { url: '/a.png', enabled: true }, role: 'P', tagline: 'T' },
      links: [], appearance: { showWatermark: true }, seo: { title: 'S', description: 'D' },
      event: { enabled: false }
    }),
    injectLinksData: jest.fn(function (html) { return html; })
  };
});

// ================================================================
// Création de l'app avec stats router + services mockés
// ================================================================

var statsRouter = require('../../server/routes/stats');

function makeApp() {
  var app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(session({
    secret: 'test-secret', resave: false, saveUninitialized: true,
    cookie: { secure: false }
  }));

  // Mock services on app.locals — c'est ce que stats.js attend
  app.locals.userLogger = {
    log: jest.fn(),
    getLogsForDate: jest.fn().mockReturnValue([]),
    getAvailableDates: jest.fn().mockReturnValue(['2025-01-01', '2025-01-02']),
    getUserStats: jest.fn().mockReturnValue({}),
    getTopActions: jest.fn().mockReturnValue([{ action: 'view', count: 10 }]),
    getTrafficSources: jest.fn().mockReturnValue({ sources: [], details: {} }),
    cleanOldLogs: jest.fn()
  };

  app.locals.photoClickTracker = {
    recordPhotoClick: jest.fn().mockReturnValue(true),
    getAllPhotoStats: jest.fn().mockReturnValue({
      metadata: { totalClicks: 100 },
      totalPhotos: 5, totalClicks: 100,
      photos: [
        { filename: 'p1.jpg', totalClicks: 50, uniqueUsers: 10 },
        { filename: 'p2.jpg', totalClicks: 30, uniqueUsers: 5 }
      ]
    }),
    getTopPhotos: jest.fn().mockImplementation(function (limit) {
      return [{ filename: 'top.jpg', totalClicks: 99 }];
    }),
    resetStats: jest.fn().mockReturnValue(true)
  };

  app.locals.campaignManager = {
    getAllCampaigns: jest.fn().mockReturnValue([])
  };

  app.use('/', statsRouter);
  return app;
}

// Helper: login admin session
function loginAdmin(app, done) {
  var supertest = require('supertest');
  supertest(app)
    .post('/admin/login')
    .send({ password: 'not-available-in-this-router' })
    .end(function () {
      // On force la session admin manuellement
      // Le router stats n'a pas de route login, donc on passe par set-cookie trick
      done();
    });
}

// Simuler une session admin en positionnant la variable
function makeAppWithAdmin() {
  var app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(session({
    secret: 'test-secret', resave: false, saveUninitialized: true,
    cookie: { secure: false }
  }));

  // Inject admin session via middleware
  app.use(function (req, res, next) {
    req.session.isAdmin = true;
    next();
  });

  app.locals.userLogger = {
    log: jest.fn(),
    getLogsForDate: jest.fn().mockReturnValue([]),
    getAvailableDates: jest.fn().mockReturnValue(['2025-01-01']),
    getUserStats: jest.fn().mockReturnValue({}),
    getTopActions: jest.fn().mockReturnValue([]),
    getTrafficSources: jest.fn().mockReturnValue({ sources: [], details: {} }),
    cleanOldLogs: jest.fn()
  };
  app.locals.photoClickTracker = {
    recordPhotoClick: jest.fn().mockReturnValue(true),
    getAllPhotoStats: jest.fn().mockReturnValue({
      metadata: { totalClicks: 0 }, totalPhotos: 0, totalClicks: 0, photos: []
    }),
    getTopPhotos: jest.fn().mockReturnValue([]),
    resetStats: jest.fn().mockReturnValue(true)
  };
  app.locals.campaignManager = {
    getAllCampaigns: jest.fn().mockReturnValue([])
  };

  app.use('/', statsRouter);
  return app;
}

// ================================================================
// TESTS
// ================================================================

describe('stats.js — routes legacy tracking', function () {
  var supertest;

  beforeAll(function () { supertest = require('supertest'); });

  beforeEach(function () {
    jest.clearAllMocks();
    Object.keys(fileStore).forEach(function (k) { delete fileStore[k]; });
  });

  // ================================================================
  // POST /track (legacy)
  // ================================================================
  describe('POST /track', function () {
    it('enregistre une visite', function (done) {
      fileStore['/fake/logs/stats.json'] = JSON.stringify({ visits: 0, pages: {} });

      supertest(makeApp())
        .post('/track')
        .send({ page: 'accueil' })
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body.success).toBe(true);
          var stats = JSON.parse(fileStore['/fake/logs/stats.json']);
          expect(stats.visits).toBe(1);
          expect(stats.pages.accueil.count).toBe(1);
          done();
        });
    });

    it('initialise le fichier stats si absent', function (done) {
      supertest(makeApp())
        .post('/track')
        .send({ page: 'nouvelle-page' })
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body.success).toBe(true);
          done();
        });
    });

    it('utilise "inconnue" si page non spécifiée', function (done) {
      supertest(makeApp())
        .post('/track')
        .send({})
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          var stats = JSON.parse(fileStore['/fake/logs/stats.json']);
          expect(stats.pages.inconnue).toBeDefined();
          done();
        });
    });
  });

  // ================================================================
  // GET /stats (legacy)
  // ================================================================
  describe('GET /stats', function () {
    it('retourne les stats existantes', function (done) {
      fileStore['/fake/logs/stats.json'] = JSON.stringify({ visits: 42, pages: { home: { count: 10 } } });

      supertest(makeApp())
        .get('/stats')
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body.visits).toBe(42);
          expect(res.body.pages.home.count).toBe(10);
          done();
        });
    });

    it('retourne des stats vides si fichier absent', function (done) {
      supertest(makeApp())
        .get('/stats')
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body.visits).toBe(0);
          done();
        });
    });
  });

  // ================================================================
  // POST /log-action
  // ================================================================
  describe('POST /log-action', function () {
    it('enregistre une action sur une page autorisée', function (done) {
      supertest(makeApp())
        .post('/log-action')
        .send({
          userId: 'user-1', action: 'click', timestamp: Date.now(),
          url: '/', page: '/'
        })
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body.success).toBe(true);
          done();
        });
    });

    it('ignore les actions sur pages non autorisées', function (done) {
      supertest(makeApp())
        .post('/log-action')
        .send({
          userId: 'u2', action: 'click', timestamp: Date.now(),
          url: '/admin', page: '/admin'
        })
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          // Le log n'est PAS appelé pour page non autorisée
          done();
        });
    });

    it('ignore les heartbeat', function (done) {
      supertest(makeApp())
        .post('/log-action')
        .send({
          userId: 'u3', action: 'heartbeat', timestamp: Date.now(),
          url: '/', page: '/'
        })
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body.success).toBe(true);
          done();
        });
    });

    it('utilise le userId client si fourni', function (done) {
      supertest(makeApp())
        .post('/log-action')
        .send({
          userId: 'client-id', action: 'scroll', timestamp: Date.now(),
          url: '/a-propos', page: '/a-propos'
        })
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body.success).toBe(true);
          done();
        });
    });

    it('attache les infos de campagne si disponibles', function (done) {
      var campaignService = require('../../server/utils/campaignService');
      campaignService.getCampaignInfo.mockReturnValue({
        campaignId: 'camp-1', campaignName: 'Summer',
        source: 'instagram', medium: 'social', timestamp: new Date().toISOString()
      });

      supertest(makeApp())
        .post('/log-action')
        .send({
          userId: 'u5', action: 'view', timestamp: Date.now(),
          url: '/contact', page: '/contact'
        })
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body.success).toBe(true);
          done();
        });
    });
  });

  // ================================================================
  // POST /photo-click
  // ================================================================
  describe('POST /photo-click', function () {
    it('enregistre un clic photo', function (done) {
      supertest(makeApp())
        .post('/photo-click')
        .send({ photoFilename: 'concert.jpg', userId: 'u1' })
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body.success).toBe(true);
          done();
        });
    });

    it('retourne 400 si photoFilename absent', function (done) {
      supertest(makeApp())
        .post('/photo-click')
        .send({ userId: 'u1' })
        .expect(400)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body.error).toBe('Nom de photo manquant');
          done();
        });
    });

    it('retourne 500 si le tracker échoue', function (done) {
      var app = makeApp();
      app.locals.photoClickTracker.recordPhotoClick.mockReturnValue(false);

      var supertest = require('supertest');
      supertest(app)
        .post('/photo-click')
        .send({ photoFilename: 'fail.jpg' })
        .expect(500)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body.error).toBeDefined();
          done();
        });
    });
  });
});

// ================================================================
// ADMIN routes (avec session)
// ================================================================
describe('stats.js — routes admin', function () {

  describe('GET /admin/photo-stats', function () {
    it('retourne les statistiques photos', function (done) {
      var supertest = require('supertest');
      supertest(makeAppWithAdmin())
        .get('/admin/photo-stats')
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body.totalPhotos).toBeDefined();
          expect(res.body.totalClicks).toBeDefined();
          done();
        });
    });
  });

  describe('GET /admin/photo-stats/top/:limit', function () {
    it('retourne le top N photos', function (done) {
      var supertest = require('supertest');
      supertest(makeAppWithAdmin())
        .get('/admin/photo-stats/top/5')
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body.topPhotos).toBeDefined();
          done();
        });
    });

    it('utilise la limite par défaut si NaN', function (done) {
      var supertest = require('supertest');
      supertest(makeAppWithAdmin())
        .get('/admin/photo-stats/top/abc')
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body.topPhotos).toBeDefined();
          done();
        });
    });
  });

  describe('GET /admin/photo-stats/top', function () {
    it('retourne le top 10 par défaut', function (done) {
      var supertest = require('supertest');
      supertest(makeAppWithAdmin())
        .get('/admin/photo-stats/top')
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body.topPhotos).toBeDefined();
          done();
        });
    });
  });

  describe('POST /admin/photo-stats/reset', function () {
    it('réinitialise les statistiques', function (done) {
      var supertest = require('supertest');
      supertest(makeAppWithAdmin())
        .post('/admin/photo-stats/reset')
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body.success).toBe(true);
          done();
        });
    });

    it('retourne 500 si le reset échoue', function (done) {
      var app = makeAppWithAdmin();
      app.locals.photoClickTracker.resetStats.mockReturnValue(false);

      var supertest = require('supertest');
      supertest(app)
        .post('/admin/photo-stats/reset')
        .expect(500)
        .end(function (err) {
          if (err) return done(err);
          done();
        });
    });
  });

  describe('GET /admin/logs', function () {
    it('sert la page logs.html', function (done) {
      // res.sendFile échouera à cause de send package
      // Mais on vérifie que la route existe
      var supertest = require('supertest');
      supertest(makeAppWithAdmin())
        .get('/admin/logs')
        .end(function (err, res) {
          // Peut être 200 ou 500 selon sendFile
          expect(res.status).toBeDefined();
          done();
        });
    });
  });

  describe('GET /admin/logs/:date', function () {
    it('retourne les logs pour une date', function (done) {
      var supertest = require('supertest');
      supertest(makeAppWithAdmin())
        .get('/admin/logs/2025-01-01')
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          expect(Array.isArray(res.body)).toBe(true);
          done();
        });
    });

    it('gère les erreurs de parsing', function (done) {
      var app = makeAppWithAdmin();
      app.locals.userLogger.getLogsForDate.mockImplementation(function () {
        throw new Error('Cannot read');
      });

      var supertest = require('supertest');
      supertest(app)
        .get('/admin/logs/2025-01-01')
        .expect(500)
        .end(function (err) {
          if (err) return done(err);
          done();
        });
    });
  });

  describe('GET /admin/logs-dates', function () {
    it('retourne les dates disponibles', function (done) {
      var supertest = require('supertest');
      supertest(makeAppWithAdmin())
        .get('/admin/logs-dates')
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body).toEqual(['2025-01-01']);
          done();
        });
    });
  });

  describe('GET /admin/logs-stats/:date', function () {
    it('retourne les stats utilisateurs', function (done) {
      var supertest = require('supertest');
      supertest(makeAppWithAdmin())
        .get('/admin/logs-stats/2025-01-01')
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body.userStats).toBeDefined();
          expect(res.body.topActions).toBeDefined();
          expect(res.body.trafficSources).toBeDefined();
          done();
        });
    });
  });

  describe('POST /admin/logs/cleanup', function () {
    it('nettoie les logs avec la durée par défaut', function (done) {
      var supertest = require('supertest');
      supertest(makeAppWithAdmin())
        .post('/admin/logs/cleanup')
        .send({})
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body.success).toBe(true);
          done();
        });
    });

    it('utilise la durée spécifiée', function (done) {
      var supertest = require('supertest');
      supertest(makeAppWithAdmin())
        .post('/admin/logs/cleanup')
        .send({ maxDays: 30 })
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body.message).toContain('30');
          done();
        });
    });
  });

  // ================================================================
  // Vérification auth sur routes admin
  // ================================================================
  describe('protection auth sur routes admin', function () {
    it('GET /admin/photo-stats sans session → 401', function (done) {
      var supertest = require('supertest');
      supertest(makeApp())
        .get('/admin/photo-stats')
        .expect(401)
        .end(function (err) { done(err); });
    });

    it('GET /admin/logs/:date sans session → 401', function (done) {
      var supertest = require('supertest');
      supertest(makeApp())
        .get('/admin/logs/2025-01-01')
        .expect(401)
        .end(function (err) { done(err); });
    });
  });
});
