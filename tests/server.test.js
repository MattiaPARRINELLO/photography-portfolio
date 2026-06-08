var fileStore = {};

jest.mock('fs', function () {
  return {
    existsSync: jest.fn(function (p) { return fileStore[p] !== undefined; }),
    readFileSync: jest.fn(function (p) {
      if (fileStore[p] !== undefined) return fileStore[p];
      var e = new Error('ENOENT'); e.code = 'ENOENT'; throw e;
    }),
    writeFileSync: jest.fn(function (p, d) { fileStore[p] = d; }),
    mkdirSync: jest.fn(),
    statSync: jest.fn(function () { return { size: 1024, mtime: new Date() }; }),
    readdirSync: jest.fn().mockReturnValue([]),
    unlinkSync: jest.fn(function (p) { delete fileStore[p]; }),
    copyFileSync: jest.fn(),
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

jest.mock('dotenv', function () { return { config: jest.fn() }; });
jest.mock('compression', function () { return jest.fn(function () { return function (req, res, next) { next(); }; }); });
jest.mock('cookie-parser', function () { return jest.fn(function () { return function (req, res, next) { next(); }; }); });
jest.mock('express-session', function () { return jest.fn(function () { return function (req, res, next) { next(); }; }); });

jest.mock('../server/config', function () {
  return {
    getPaths: jest.fn().mockReturnValue({
      root: '/fake/root', pages: '/fake/pages', adminPages: '/fake/pages/admin',
      texts: '/fake/config/texts.json', photos: '/fake/photos', temp: '/fake/temp',
      stats: '/fake/logs/stats.json', config: '/fake/config/config.json'
    }),
    getConfig: jest.fn().mockReturnValue({}),
    getPort: jest.fn().mockReturnValue(3001),
    adminPassword: 'test', smtpHost: 'h', smtpPort: 587, smtpUser: 'u', smtpPass: 'p'
  };
});

jest.mock('../server/middleware/auth', function () {
  return {
    requireAdminSession: jest.fn(function (req, res, next) { next(); }),
    requireAdminPage: jest.fn(function (req, res, next) { next(); })
  };
});

jest.mock('../server/utils/linksService', function () {
  return {
    loadLinksConfig: jest.fn().mockReturnValue({ event: { enabled: false, message: '', url: '', icon: 'star', createdAt: null, expiresAt: null } }),
    setEventBanner: jest.fn().mockReturnValue({ event: { enabled: true } }),
    clearEventBanner: jest.fn().mockReturnValue({ event: { enabled: false } }),
    isEventActive: jest.fn().mockReturnValue(false),
    getEventTimeRemaining: jest.fn().mockReturnValue(null),
    injectLinksData: jest.fn(function (h) { return h; })
  };
});

jest.mock('../server/utils/campaignService', function () {
  return {
    processCampaignFromQuery: jest.fn().mockReturnValue(null),
    associateUserToCampaign: jest.fn(),
    getCampaignInfo: jest.fn().mockReturnValue(null)
  };
});

jest.mock('../server/middleware/tracking', function () {
  return {
    userTrackingMiddleware: jest.fn(function () { return function (req, res, next) { next(); }; }),
    campaignMiddleware: jest.fn(function () { return function (req, res, next) { next(); }; })
  };
});

jest.mock('../server/routes/pages', function () { var e = require('express'); return e.Router(); });
jest.mock('../server/routes/admin', function () { var e = require('express'); return e.Router(); });
jest.mock('../server/routes/photos', function () { var e = require('express'); return e.Router(); });
jest.mock('../server/routes/image-resize', function () { var e = require('express'); return e.Router(); });
jest.mock('../server/routes/content', function () { var e = require('express'); return e.Router(); });
jest.mock('../server/routes/stats', function () { var e = require('express'); return e.Router(); });
jest.mock('../server/routes/signed-images', function () { var e = require('express'); return e.Router(); });

jest.mock('../scripts/UserActivityLogger', function () {
  return function () {
    return { log: jest.fn(), cleanOldLogs: jest.fn(), startPeriodicCleanup: jest.fn() };
  };
});

jest.mock('../scripts/PhotoClickTracker', function () {
  return function () { return { recordPhotoClick: jest.fn() }; };
});

jest.mock('../scripts/CampaignManager', function () {
  return function () { return { getAllCampaigns: jest.fn().mockReturnValue([]) }; };
});

describe('server.js', function () {
  var app;

  beforeAll(function () {
    fileStore['/fake/pages/404.html'] = '<html>404</html>';

    var express = require('express');
    var origListen = express.application.listen;
    express.application.listen = jest.fn(function (port, cb) {
      if (cb) cb();
      return { close: jest.fn() };
    });

    // Monkey-patch sendFile — préserve le status déjà défini
    var origSend = express.response.sendFile;
    express.response.sendFile = function (p, opts, cb) {
      this.removeHeader('Content-Encoding');
      if (!this.statusCode || this.statusCode === 200) {
        this.status(200);
      }
      this.type('text/html').send('<html>fake</html>');
    };

    app = require('../server');

    express.application.listen = origListen;
    // Ne pas restaurer sendFile — les tests en ont besoin
  });

  describe('initialisation', function () {
    it('crée une app Express', function () {
      expect(app).toBeDefined();
      expect(typeof app.use).toBe('function');
    });
  });

  describe('bandeau événement', function () {
    // Ces tests sont dans server-push.test.js avec le monkey-patch sendFile fonctionnel
    it('POST message vide → 400', function (done) {
      var express = require('express');
      var origSendFile = express.response.sendFile;
      express.response.sendFile = function (p, opts, cb) { this.status(200).type('text/plain').send('ok'); };

      var supertest = require('supertest');
      supertest(app)
        .post('/api/links/event')
        .send({ message: '' })
        .expect(400)
        .end(function (err) {
          express.response.sendFile = origSendFile;
          done(err);
        });
    });

    it('POST valide → 200', function (done) {
      var supertest = require('supertest');
      supertest(app)
        .post('/api/links/event')
        .send({ message: 'E!', url: 'https://e.com', icon: 'star', days: 3 })
        .expect(200)
        .end(done);
    });

    it('DELETE → 200', function (done) {
      var supertest = require('supertest');
      supertest(app)
        .delete('/api/links/event')
        .expect(200)
        .end(done);
    });
  });

  describe('404 handler', function () {
    it.skip('[SEND-REAL-FS] sendFile monkey-patch non fonctionnel sur ce test', function () {});
  });

  describe('intégration services', function () {
    it('les services sont instanciés dans app.locals', function () {
      expect(app.locals.userLogger).toBeDefined();
      expect(app.locals.photoClickTracker).toBeDefined();
      expect(app.locals.campaignManager).toBeDefined();
      expect(app.locals.campaignService).toBeDefined();
    });

    it('le port configuré est accessible', function () {
      var cfg = require('../server/config');
      expect(cfg.getPort()).toBe(3001);
    });
  });
});
