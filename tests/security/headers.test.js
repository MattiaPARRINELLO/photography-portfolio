var crypto = require('crypto');

process.env.IMAGE_SECRET_KEY = 'test-hmac-secret-key-32chars!!';

// Mock avant tout require
jest.mock('fs', function () {
  var actual = jest.requireActual('fs');
  return Object.assign({}, actual, {
    existsSync: jest.fn(),
    statSync: jest.fn()
  });
});

jest.mock('../../server/config', function () {
  var p = require('path');
  return {
    getPaths: function () {
      return {
        root: p.resolve(__dirname, '../..'),
        pages: p.resolve(__dirname, '../../pages')
      };
    },
    getConfig: function () {
      return { thumbnails: { width: 600, height: 600, quality: 90, fit: 'inside', withoutEnlargement: true, format: 'jpeg' } };
    },
    getPort: function () { return 3001; },
    adminPassword: 'test',
    __esModule: true
  };
});

jest.mock('multer', function () {
  var fn = function () {
    return {
      array: function () { return function (req, res, next) { next(); }; },
      single: function () { return function (req, res, next) { next(); }; }
    };
  };
  fn.diskStorage = function () { return {}; };
  return fn;
});

var fs = require('fs');
var express = require('express');
var signedImagesRouter = require('../../server/routes/signed-images');

function makeApp() {
  var app = express();
  app.use(express.json());
  app.use('/api', signedImagesRouter);
  return app;
}

describe('Securite Signatures HMAC', function () {

  beforeEach(function () {
    jest.clearAllMocks();
    delete process.env.NODE_ENV;
  });

  afterAll(function () {
    delete process.env.IMAGE_SECRET_KEY;
  });

  describe('POST /api/request-hd-access', function () {
    var supertest = require('supertest');

    it('retourne 400 si imagePath absent', function (done) {
      supertest(makeApp())
        .post('/api/request-hd-access')
        .send({})
        .expect(400)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body.error).toBe('imagePath est requis');
          done();
        });
    });

    it('genere une URL signee pour une image existante', function (done) {
      fs.existsSync.mockReturnValue(true);

      supertest(makeApp())
        .post('/api/request-hd-access')
        .send({ imagePath: 'test-photo.jpg' })
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body.success).toBe(true);
          expect(res.body.url).toContain('/api/hd-image?path=');
          expect(res.body.url).toContain('&expires=');
          expect(res.body.url).toContain('&signature=');
          done();
        });
    });

    it('extrait le chemin depuis une URL complete', function (done) {
      fs.existsSync.mockReturnValue(true);

      supertest(makeApp())
        .post('/api/request-hd-access')
        .send({ imagePath: 'https://example.com/photos/concert.jpg' })
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body.success).toBe(true);
          done();
        });
    });

    it('retourne URL non signee en dev si fichier absent', function (done) {
      fs.existsSync.mockReturnValue(false);
      process.env.NODE_ENV = 'development';

      supertest(makeApp())
        .post('/api/request-hd-access')
        .send({ imagePath: '/photos/missing.jpg' })
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body.url).toBe('/photos/missing.jpg');
          done();
        });
    });

    it('retourne 404 en production si fichier absent', function (done) {
      fs.existsSync.mockReturnValue(false);
      process.env.NODE_ENV = 'production';

      supertest(makeApp())
        .post('/api/request-hd-access')
        .send({ imagePath: '/photos/missing.jpg' })
        .expect(404)
        .end(function (err) {
          if (err) return done(err);
          done();
        });
    });

    it('normalise le chemin path traversal', function (done) {
      fs.existsSync.mockReturnValue(false);
      process.env.NODE_ENV = 'development';

      supertest(makeApp())
        .post('/api/request-hd-access')
        .send({ imagePath: '../../../etc/passwd' })
        .expect(200)
        .end(function (err) {
          if (err) return done(err);
          done();
        });
    });
  });

  describe('GET /api/hd-image', function () {
    var supertest = require('supertest');

    it('retourne 400 si parametres manquants', function (done) {
      supertest(makeApp())
        .get('/api/hd-image')
        .expect(400)
        .end(function (err) {
          if (err) return done(err);
          done();
        });
    });

    it('retourne 403 si signature invalide', function (done) {
      supertest(makeApp())
        .get('/api/hd-image?path=test.jpg&expires=9999999999&signature=badsig')
        .expect(403)
        .end(function (err) {
          if (err) return done(err);
          done();
        });
    });

    it('retourne 403 si URL expiree', function (done) {
      supertest(makeApp())
        .get('/api/hd-image?path=test.jpg&expires=1&signature=any')
        .expect(403)
        .end(function (err) {
          if (err) return done(err);
          done();
        });
    });

    it('accepte une signature valide non expiree', function (done) {
      var SECRET = 'test-hmac-secret-key-32chars!!';
      var normalized = 'test-photo.jpg';
      var expiresAt = Math.floor(Date.now() / 1000) + 3600;
      var sig = crypto.createHmac('sha256', SECRET)
        .update(normalized + ':' + expiresAt)
        .digest('hex');

      fs.existsSync.mockReturnValue(true);

      supertest(makeApp())
        .get('/api/hd-image?path=' + encodeURIComponent(normalized) + '&expires=' + expiresAt + '&signature=' + sig)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.status).not.toBe(403);
          expect(res.status).not.toBe(400);
          done();
        });
    });
  });
});
