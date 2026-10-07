var express = require('express');
var session = require('express-session');
var cookieParser = require('cookie-parser');

// Mock server config
jest.mock('../../server/config', function () {
  return {
    getPaths: jest.fn().mockReturnValue({
      root: '/fake/root',
      stats: '/fake/stats.json',
      pages: '/fake/pages',
      adminPages: '/fake/pages/admin',
      texts: '/fake/config/texts.json'
    }),
    getConfig: jest.fn().mockReturnValue({}),
    getPort: jest.fn().mockReturnValue(3000),
    smtpHost: 'smtp.test.com',
    smtpPort: 587,
    smtpUser: 'test@test.com',
    smtpPass: 'testpass',
    adminPassword: 'test'
  };
});

jest.mock('multer', function () {
  var fn = function () {
    return {
      array: function () { return function (req, res, next) { next(); }; },
      single: function () { return function (req, res, next) { next(); }; }
    };
  };
  fn.diskStorage = function () {};
  return fn;
});

// Mock fs
jest.mock('fs', function () {
  var actual = jest.requireActual('fs');
  var store = {};
  return Object.assign({}, actual, {
    existsSync: jest.fn(function (p) { return store[p] !== undefined; }),
    readFileSync: jest.fn(function (p, enc) { return store[p] !== undefined ? store[p] : '{"visits":0,"pages":{}}'; }),
    writeFileSync: jest.fn(function (p, d) { store[p] = d; }),
    mkdirSync: jest.fn(),
    statSync: jest.fn(function () { return { size: 1024, mtime: new Date() }; })
  });
});

// Mock nodemailer
jest.mock('nodemailer', function () {
  var sendMailFn = jest.fn();
  sendMailFn.mockResolvedValue({ messageId: 'test-id' });
  var transport = { sendMail: sendMailFn };
  return {
    createTransport: jest.fn().mockReturnValue(transport)
  };
});

// Mock campaignService
jest.mock('../../server/utils/campaignService', function () {
  return {
    getCampaignInfo: jest.fn().mockReturnValue(null),
    getUserCampaignInfo: jest.fn().mockReturnValue(null),
    associateUserToCampaign: jest.fn(),
    processCampaignFromQuery: jest.fn()
  };
});

// Mock photoService
jest.mock('../../server/utils/photoService', function () {
  return { getPhotosList: jest.fn().mockResolvedValue([]) };
});

// Mock galleryService
jest.mock('../../server/utils/galleryService', function () {
  return {
    loadGalleries: jest.fn().mockReturnValue({ galleries: [] }),
    listGalleries: jest.fn().mockReturnValue([]),
    getGalleryBySlug: jest.fn().mockReturnValue(null),
    getGalleryById: jest.fn().mockReturnValue(null)
  };
});

// Mock textUtils
jest.mock('../../server/utils/textUtils', function () {
  return {
    loadTexts: jest.fn().mockReturnValue({}),
    loadSeoData: jest.fn().mockReturnValue({}),
    injectMetaTags: jest.fn(function (html) { return html; }),
    generateSchemaJsonLd: jest.fn().mockReturnValue('')
  };
});

var nodemailer;
var statsRouter;

function makeApp() {
  var app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(session({
    secret: 'test-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
  }));
  app.use('/', statsRouter);
  return app;
}

describe('Route contact POST /send-mail', function () {
  var supertest;

  beforeAll(function () {
    supertest = require('supertest');
  });

  beforeEach(function () {
    jest.clearAllMocks();
    // Le rate limiter vit dans le module : on recharge pour repartir d'un
    // compteur IP vierge, sinon les tests s'épuisent mutuellement.
    jest.resetModules();
    nodemailer = require('nodemailer');
    statsRouter = require('../../server/routes/stats');
  });

  function makeValidBody(overrides) {
    // Use a timestamp from 5 seconds ago to pass the "fill time >= 3 sec" check
    var ts = Date.now() - 5000;
    var base = {
      email: 'visiteur@test.com',
      subject: 'Demande de devis',
      message: 'Bonjour, je souhaiterais un devis pour un concert.',
      _timestamp: ts,
      _token: 'csrf-token-123'
    };
    if (overrides) {
      Object.keys(overrides).forEach(function (k) { base[k] = overrides[k]; });
    }
    return base;
  }

  function validHeaders() {
    return {
      'Content-Type': 'application/json',
      'Origin': 'http://localhost:3000',
      'Referer': 'http://localhost:3000/contact'
    };
  }

  // ================================================================
  // Cas nominal
  // ================================================================
  it('envoie un email avec succes', function (done) {
    var body = makeValidBody();

    supertest(makeApp())
      .post('/send-mail')
      .set(validHeaders())
      .send(body)
      .expect(200)
      .end(function (err, res) {
        if (err) return done(err);
        expect(res.body.success).toBe(true);
        expect(nodemailer.createTransport).toHaveBeenCalled();
        done();
      });
  });

  // ================================================================
  // Message trop court (avant rate limit accumulation)
  // ================================================================
  it('retourne 400 si message trop court (< 10 chars)', function (done) {
    var body = makeValidBody({ message: 'Court' });

    supertest(makeApp())
      .post('/send-mail')
      .set(validHeaders())
      .send(body)
      .expect(400)
      .end(done);
  });

  // ================================================================
  // Validation email (avant l'accumulation rate limit)
  // ================================================================
  it('retourne 400 si email invalide', function (done) {
    var body = makeValidBody({ email: 'pas-un-email' });

    supertest(makeApp())
      .post('/send-mail')
      .set(validHeaders())
      .send(body)
      .expect(400)
      .end(done);
  });

  // ================================================================
  // Champs requis (groupés pour économiser le rate limit)
  // ================================================================
  it('retourne 400 si un champ requis est manquant', function (done) {
    var cases = [
      { name: 'email', body: makeValidBody() },
      { name: 'subject', body: makeValidBody() }
    ];
    cases.forEach(function (c) { delete c.body[c.name]; });

    var counter = 0;
    function runNext() {
      if (counter >= cases.length) return done();
      var c = cases[counter++];
      supertest(makeApp())
        .post('/send-mail')
        .set(validHeaders())
        .send(c.body)
        .expect(400)
        .end(function (err) {
          if (err) return done(err);
          runNext();
        });
    }
    runNext();
  });

  it(' borne les timeouts SMTP (serveur sans IPv6 : fallback IPv4)', function (done) {
    var body = makeValidBody();

    supertest(makeApp())
      .post('/send-mail')
      .set(validHeaders())
      .send(body)
      .expect(200)
      .end(function (err) {
        if (err) return done(err);
        var opts = nodemailer.createTransport.mock.calls[0][0];
        // Sans ces timeouts, l'envoi bloque ~120 s le temps que l'IPv6 expire.
        expect(opts.connectionTimeout).toBeLessThanOrEqual(15000);
        expect(opts.greetingTimeout).toBeLessThanOrEqual(15000);
        expect(opts.socketTimeout).toBeGreaterThan(0);
        done();
      });
  });

  // ================================================================
  // Honeypot
  // ================================================================
  it('retourne 200 fake si honeypot rempli', function (done) {
    var body = makeValidBody({ _honeypot: 'je-suis-un-bot' });

    supertest(makeApp())
      .post('/send-mail')
      .set(validHeaders())
      .send(body)
      .expect(200)
      .end(function (err, res) {
        if (err) return done(err);
        expect(res.body.success).toBe(true);
        done();
      });
  });

  it('retourne 403 si Origin invalide', function (done) {
    var body = makeValidBody();

    supertest(makeApp())
      .post('/send-mail')
      .set('Content-Type', 'application/json')
      .set('Origin', 'https://evil.com')
      .send(body)
      .expect(403)
      .end(done);
  });

  it('accepte une requete depuis le domaine de production', function (done) {
    var body = makeValidBody();

    supertest(makeApp())
      .post('/send-mail')
      .set('Content-Type', 'application/json')
      .set('Origin', 'https://www.photo.mprnl.fr')
      .set('Referer', 'https://www.photo.mprnl.fr/contact')
      .send(body)
      .expect(200)
      .end(done);
  });

  it('retourne 403 sur un sous-domaine piege du domaine autorise', function (done) {
    var body = makeValidBody();

    supertest(makeApp())
      .post('/send-mail')
      .set('Content-Type', 'application/json')
      .set('Origin', 'https://www.photo.mprnl.fr.evil.com')
      .send(body)
      .expect(403)
      .end(done);
  });

  // ================================================================
  // Timestamp absent
  // ================================================================
  it('retourne 400 si timestamp absent', function (done) {
    var body = makeValidBody();
    delete body._timestamp;

    supertest(makeApp())
      .post('/send-mail')
      .set(validHeaders())
      .send(body)
      .expect(400)
      .end(done);
  });

  // ================================================================
  // Timestamp expire (>10 min)
  // ================================================================
  it('retourne 400 si timestamp expire', function (done) {
    var oldTs = Date.now() - 11 * 60 * 1000;
    var body = makeValidBody({ _timestamp: oldTs });

    supertest(makeApp())
      .post('/send-mail')
      .set(validHeaders())
      .send(body)
      .expect(400)
      .end(function (err, res) {
        if (err) return done(err);
        expect(res.body.error).toContain('expir');
        done();
      });
  });

  // ================================================================
  // Token CSRF absent
  // ================================================================
  it('retourne 400 si token CSRF absent', function (done) {
    supertest(makeApp())
      .post('/send-mail')
      .set(validHeaders())
      .send({ email: 'v@t.com', subject: 'S', message: 'Message assez long.', _timestamp: Date.now() - 5000 })
      .expect(400)
      .end(done);
  });
});
