var express = require('express');

// Stockage des reponses de fs.stat, reinitialisable par test
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

// Mock fs avec store en memoire pour stat
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

// Mock sharp — retourne un pipeline chainable
jest.mock('sharp', function () {
  return jest.fn(function () {
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
var imageResizeRouter = require('../../server/routes/image-resize');

// Spy pour sendFile : on intercepte au niveau de chaque reponse via un middleware
var sendFileSpy;

function makeApp() {
  var app = express();

  // Middleware pour intercepter res.sendFile sur chaque reponse
  app.use(function (req, res, next) {
    sendFileSpy = jest.fn(function (p, opts, cb) {
      res.setHeader('Content-Type', 'text/plain');
      res.status(200).end('cache-hit');
    });
    res.sendFile = sendFileSpy;
    next();
  });

  app.use('/photos', imageResizeRouter);
  return app;
}

function resetSendFileSpy() {
  sendFileSpy = null;
}

describe('Route image-resize GET /photos/resize — cache hits et erreurs', function () {
  var supertest;

  beforeAll(function () {
    supertest = require('supertest');
  });

  beforeEach(function () {
    jest.clearAllMocks();
    resetSendFileSpy();
    Object.keys(fsStore).forEach(function (k) { delete fsStore[k]; });
  });

  // ================================================================
  // Cache hit : original absent, cache existant (lignes 69-72)
  // ================================================================

  it('sert le cache quand l\'original est absent (lignes 69-72)', function (done) {
    var cachePath = '/fake/photos/resized/webp/320/test.webp';
    fsStore[cachePath] = { mtimeMs: 1000 };

    supertest(makeApp())
      .get('/photos/resize?file=test.jpg&w=320&fmt=webp')
      .expect(200)
      .end(function (err, res) {
        if (err) return done(err);
        expect(res.text).toBe('cache-hit');
        expect(sendFileSpy).toHaveBeenCalledWith(cachePath);
        done();
      });
  });

  it('sert le cache avec bons headers quand l\'original est absent', function (done) {
    var cachePath = '/fake/photos/resized/webp/320/test.webp';
    fsStore[cachePath] = { mtimeMs: 1000 };

    supertest(makeApp())
      .get('/photos/resize?file=test.jpg&w=320&fmt=webp')
      .expect(200)
      .end(function (err) {
        if (err) return done(err);
        expect(sendFileSpy).toHaveBeenCalledWith(cachePath);
        done();
      });
  });

  // ================================================================
  // Cache hit : cache a jour (lignes 78-81)
  // ================================================================

  it('sert le cache quand il est a jour (lignes 78-81)', function (done) {
    var cachePath = '/fake/photos/resized/webp/320/test.webp';
    var origPath = '/fake/photos/test.jpg';
    fsStore[cachePath] = { mtimeMs: 2000 };
    fsStore[origPath] = { mtimeMs: 1000 };

    supertest(makeApp())
      .get('/photos/resize?file=test.jpg&w=320&fmt=webp')
      .expect(200)
      .end(function (err, res) {
        if (err) return done(err);
        expect(res.text).toBe('cache-hit');
        expect(sendFileSpy).toHaveBeenCalledWith(cachePath);
        done();
      });
  });

  it('sert le cache a jour avec fmt=jpg (Content-Type image/jpeg)', function (done) {
    var cachePath = '/fake/photos/resized/jpg/320/test.jpeg';
    var origPath = '/fake/photos/test.jpg';
    fsStore[cachePath] = { mtimeMs: 2000 };
    fsStore[origPath] = { mtimeMs: 1000 };

    supertest(makeApp())
      .get('/photos/resize?file=test.jpg&w=320&fmt=jpg')
      .expect(200)
      .end(function (err, res) {
        if (err) return done(err);
        expect(res.text).toBe('cache-hit');
        expect(sendFileSpy).toHaveBeenCalledWith(cachePath);
        done();
      });
  });

  // ================================================================
  // Cache obsolete → regeneration avec sharp
  // ================================================================

  it('recree l\'image quand le cache est obsolete (cache mtime < original mtime)', function (done) {
    var origPath = '/fake/photos/test.jpg';
    var cachePath = '/fake/photos/resized/webp/320/test.webp';
    fsStore[origPath] = { mtimeMs: 2000 };
    fsStore[cachePath] = { mtimeMs: 1000 };

    supertest(makeApp())
      .get('/photos/resize?file=test.jpg&w=320&fmt=webp')
      .expect(200)
      .end(function (err) {
        if (err) return done(err);
        expect(sendFileSpy).not.toHaveBeenCalled();
        var pipeline = sharp.mock.results[0].value;
        expect(pipeline.toBuffer).toHaveBeenCalled();
        done();
      });
  });

  // ================================================================
  // Erreur d'ecriture du cache en arriere-plan (ligne 102)
  // ================================================================

  it('ne crashe pas si l\'ecriture du cache echoue en arriere-plan', function (done) {
    var origPath = '/fake/photos/test.jpg';
    fsStore[origPath] = { mtimeMs: Date.now() };

    var writeErr = new Error('Disk full');
    fs.promises.writeFile.mockRejectedValueOnce(writeErr);

    var warnSpy = jest.spyOn(console, 'warn').mockImplementation(function () {});

    supertest(makeApp())
      .get('/photos/resize?file=test.jpg&w=320&fmt=webp')
      .expect(200)
      .end(function (err) {
        if (err) return done(err);
        setImmediate(function () {
          expect(warnSpy).toHaveBeenCalledWith('Failed to write cache', 'Disk full');
          warnSpy.mockRestore();
          done();
        });
      });
  });

  // ================================================================
  // Erreur fatale dans le pipeline → 500 (lignes 110-111)
  // ================================================================

  it('retourne 500 si le pipeline sharp echoue (lignes 110-111)', function (done) {
    var origPath = '/fake/photos/test.jpg';
    fsStore[origPath] = { mtimeMs: Date.now() };

    var failPipeline = {
      resize: jest.fn().mockReturnThis(),
      webp: jest.fn().mockReturnThis(),
      jpeg: jest.fn().mockReturnThis(),
      png: jest.fn().mockReturnThis(),
      toBuffer: jest.fn().mockRejectedValue(new Error('Sharp processing error')),
      toFile: jest.fn().mockResolvedValue(undefined)
    };
    sharp.mockImplementationOnce(function () { return failPipeline; });

    var errorSpy = jest.spyOn(console, 'error').mockImplementation(function () {});

    supertest(makeApp())
      .get('/photos/resize?file=test.jpg&w=320&fmt=webp')
      .expect(500)
      .end(function (err, res) {
        if (err) return done(err);
        expect(res.text).toBe('Server error');
        expect(errorSpy).toHaveBeenCalledWith('Resize error', expect.any(Error));
        errorSpy.mockRestore();
        done();
      });
  });
});
