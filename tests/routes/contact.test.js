var express = require('express');
var crypto = require('crypto');
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

var nodemailer = require('nodemailer');
var statsRouter = require('../../server/routes/stats');

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

var SECRET = process.env.CONTACT_API_SECRET;

describe('Route contact POST /send-mail', function () {
  var supertest;

  beforeAll(function () {
    supertest = require('supertest');
  });

  beforeEach(function () {
    jest.clearAllMocks();
  });

  function makeValidBody(overrides) {
    // Use a timestamp from 5 seconds ago to pass the "fill time >= 3 sec" check
    var ts = Date.now() - 5000;
    var sig = crypto.createHash('sha256')
      .update(ts + SECRET)
      .digest('hex')
      .substring(0, 16);
    var base = {
      email: 'visiteur@test.com',
      subject: 'Demande de devis',
      message: 'Bonjour, je souhaiterais un devis pour un concert.',
      _timestamp: ts,
      _token: 'csrf-token-123',
      _signature: sig
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

  // ================================================================
  // Timestamp absent
  // ================================================================
  it('retourne 400 si timestamp absent', function (done) {
    var body = makeValidBody();
    delete body._timestamp;
    delete body._signature;

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
    var sig = crypto.createHash('sha256')
      .update(oldTs + SECRET)
      .digest('hex')
      .substring(0, 16);
    var body = makeValidBody({ _timestamp: oldTs, _signature: sig });

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
  // Signature absente
  // ================================================================
  it('retourne 400 si signature absente', function (done) {
    var body = makeValidBody();
    delete body._signature;

    supertest(makeApp())
      .post('/send-mail')
      .set(validHeaders())
      .send(body)
      .expect(400)
      .end(done);
  });

  // ================================================================
  // Signature invalide
  // ================================================================
  it('retourne 403 si signature invalide', function (done) {
    var body = makeValidBody({ _signature: 'invalide' });

    supertest(makeApp())
      .post('/send-mail')
      .set(validHeaders())
      .send(body)
      .expect(403)
      .end(done);
  });

  // ================================================================
  // Token CSRF absent
  // ================================================================
  it('retourne 400 si token CSRF absent', function (done) {
    var ts = Date.now();
    var sig = crypto.createHash('sha256').update(ts + SECRET).digest('hex').substring(0, 16);

    supertest(makeApp())
      .post('/send-mail')
      .set(validHeaders())
      .send({ email: 'v@t.com', subject: 'S', message: 'Message assez long.', _timestamp: ts, _signature: sig })
      .expect(400)
      .end(done);
  });
});
