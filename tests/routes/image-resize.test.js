var express = require('express');

// Store for fs.stat responses, resettable per test
var fsStore = {};

// Mock server config
jest.mock('../../server/config', function () {
  return {
    getPaths: jest.fn().mockReturnValue({
      photos: '/fake/photos',
      root: '/fake/root'
    }),
    getConfig: jest.fn().mockReturnValue({
      thumbnails: {
        width: 600,
        height: 600,
        quality: 90,
        fit: 'inside',
        withoutEnlargement: true,
        format: 'jpeg'
      }
    })
  };
});

// Mock fs with in-memory store for stat
jest.mock('fs', function () {
  var actual = jest.requireActual('fs');
  return Object.assign({}, actual, {
    promises: {
      stat: jest.fn(function (p) {
        if (fsStore[p] !== undefined) return Promise.resolve(fsStore[p]);
        var err = new Error('ENOENT: no such file or directory, stat \'' + p + '\'');
        err.code = 'ENOENT';
        return Promise.reject(err);
      }),
      mkdir: jest.fn().mockResolvedValue(undefined),
      writeFile: jest.fn().mockResolvedValue(undefined)
    }
  });
});

// Mock sharp — returns a chainable pipeline
jest.mock('sharp', function () {
  return jest.fn(function (filePath) {
    var pipeline = {
      resize: jest.fn().mockReturnThis(),
      webp: jest.fn().mockReturnThis(),
      jpeg: jest.fn().mockReturnThis(),
      png: jest.fn().mockReturnThis(),
      toBuffer: jest.fn().mockResolvedValue(Buffer.from('fake-resized-image-data')),
      toFile: jest.fn().mockResolvedValue(undefined)
    };
    return pipeline;
  });
});

var sharp = require('sharp');
var fs = require('fs');

// Monkey-patch sendFile pour éviter les lectures disque
var origSendFile = express.response.sendFile;
express.response.sendFile = function (p, opts, cb) {
  this.removeHeader('Content-Encoding');
  if (!this.statusCode || this.statusCode === 200) {
    this.status(200);
  }
  this.type('image/webp').send(Buffer.from('fake-image'));
};

var imageResizeRouter = require('../../server/routes/image-resize');

function makeApp() {
  var app = express();
  app.use('/photos', imageResizeRouter);
  return app;
}

describe('Route image-resize GET /photos/resize', function () {
  var supertest;

  beforeAll(function () {
    supertest = require('supertest');
  });

  beforeEach(function () {
    jest.clearAllMocks();
    // Reset in-memory fs store
    Object.keys(fsStore).forEach(function (k) { delete fsStore[k]; });
  });

  // ================================================================
  // Parametres manquants ou invalides
  // ================================================================

  it('retourne 400 si le parametre file est manquant', function (done) {
    supertest(makeApp())
      .get('/photos/resize')
      .expect(400)
      .end(function (err, res) {
        if (err) return done(err);
        expect(res.text).toBe('Missing file parameter');
        done();
      });
  });

  it('retourne 400 si la largeur est negative', function (done) {
    supertest(makeApp())
      .get('/photos/resize?file=test.jpg&w=-1')
      .expect(400)
      .end(function (err, res) {
        if (err) return done(err);
        expect(res.text).toBe('Invalid width');
        done();
      });
  });

  it('retourne 400 si la largeur depasse 5000', function (done) {
    supertest(makeApp())
      .get('/photos/resize?file=test.jpg&w=6000')
      .expect(400)
      .end(function (err, res) {
        if (err) return done(err);
        expect(res.text).toBe('Invalid width');
        done();
      });
  });

  // ================================================================
  // Fichier introuvable
  // ================================================================

  it('retourne 404 si le fichier original n existe pas et aucun cache', function (done) {
    supertest(makeApp())
      .get('/photos/resize?file=missing.jpg&w=640')
      .expect(404)
      .end(function (err, res) {
        if (err) return done(err);
        expect(res.text).toBe('File not found');
        done();
      });
  });

  // ================================================================
  // Redimensionnement sans cache
  // ================================================================

  it('retourne 200 avec l image redimensionnee (pas de cache)', function (done) {
    fsStore['/fake/photos/test.jpg'] = { mtimeMs: Date.now() };

    supertest(makeApp())
      .get('/photos/resize?file=test.jpg&w=640')
      .expect(200)
      .end(function (err, res) {
        if (err) return done(err);
        expect(sharp).toHaveBeenCalled();
        expect(res.headers['content-type']).toBe('image/jpeg');
        expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
        done();
      });
  });

  it('appelle sharp.resize avec la largeur demandee', function (done) {
    fsStore['/fake/photos/test.jpg'] = { mtimeMs: Date.now() };

    supertest(makeApp())
      .get('/photos/resize?file=test.jpg&w=1000')
      .expect(200)
      .end(function (err) {
        if (err) return done(err);
        var pipeline = sharp.mock.results[0].value;
        expect(pipeline.resize).toHaveBeenCalledWith(
          expect.objectContaining({ width: 1000 })
        );
        done();
      });
  });

  // ================================================================
  // Format override
  // ================================================================

  it('utilise le format fmt=png quand specifie', function (done) {
    fsStore['/fake/photos/test.png'] = { mtimeMs: Date.now() };

    supertest(makeApp())
      .get('/photos/resize?file=test.png&w=640&fmt=png')
      .expect(200)
      .end(function (err, res) {
        if (err) return done(err);
        expect(res.headers['content-type']).toBe('image/png');
        var pipeline = sharp.mock.results[0].value;
        expect(pipeline.png).toHaveBeenCalled();
        done();
      });
  });

  it('utilise le format fmt=webp quand specifie', function (done) {
    fsStore['/fake/photos/test.jpg'] = { mtimeMs: Date.now() };

    supertest(makeApp())
      .get('/photos/resize?file=test.jpg&w=640&fmt=webp')
      .expect(200)
      .end(function (err, res) {
        if (err) return done(err);
        expect(res.headers['content-type']).toBe('image/webp');
        var pipeline = sharp.mock.results[0].value;
        expect(pipeline.webp).toHaveBeenCalled();
        done();
      });
  });

  // ================================================================
  // Parametre qualite
  // ================================================================

  it('passe le parametre q a sharp en qualite', function (done) {
    fsStore['/fake/photos/test.jpg'] = { mtimeMs: Date.now() };

    supertest(makeApp())
      .get('/photos/resize?file=test.jpg&w=640&q=50')
      .expect(200)
      .end(function (err) {
        if (err) return done(err);
        var pipeline = sharp.mock.results[0].value;
        expect(pipeline.jpeg).toHaveBeenCalledWith({ quality: 50 });
        done();
      });
  });

  // ================================================================
  // Parametre width alternatif
  // ================================================================

  it('accepte le parametre width comme alternative a w', function (done) {
    fsStore['/fake/photos/test.jpg'] = { mtimeMs: Date.now() };

    supertest(makeApp())
      .get('/photos/resize?file=test.jpg&width=320')
      .expect(200)
      .end(function (err) {
        if (err) return done(err);
        done();
      });
  });

  // ================================================================
  // Cache (non testable sans mock de send)
  // ================================================================

  it('cache valide → retourne 200', function (done) {
    var path = require('path');
    var fsp = fs.promises;

    // Simuler que le fichier original existe
    var origPath = path.resolve('/fake/photos/photo-cache.jpg');
    fsStore[origPath] = { mtimeMs: 1000 }; // original plus vieux
    // Simuler que le cache existe et est plus récent
    var cachePath = path.resolve('/fake/photos/resized/webp/800/photo-cache.webp');
    fsStore[cachePath] = { mtimeMs: 2000 }; // cache plus récent

    var supertest = require('supertest');
    supertest(makeApp())
      .get('/photos/resize?file=photo-cache.jpg&w=800')
      .expect(200)
      .end(done);
  });
});
