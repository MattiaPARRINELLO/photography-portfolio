// Sécurité : les photos originales ne doivent jamais être servies en statique.
// Ce test vérifie le comportement réel du middleware monté sur /photos dans
// server.js, ainsi que l'absence de mount statique sur la racine du projet.
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const supertest = require('supertest');
const { createPhotosStaticMiddleware } = require('../../server/middleware/photosStatic');

function makeApp(photosDir) {
  const app = express();
  app.use('/photos', createPhotosStaticMiddleware(photosDir));
  // Route de redimensionnement : doit rester accessible (montée après le garde).
  app.get('/photos/resize', function (req, res) { res.status(200).send('resize-ok'); });
  return app;
}

describe('Photos : aucun accès public aux originaux', function () {
  let photosDir;

  beforeAll(function () {
    photosDir = fs.mkdtempSync(path.join(os.tmpdir(), 'photos-static-'));
    fs.writeFileSync(path.join(photosDir, 'concert.jpg'), 'original-image-bytes');
    fs.writeFileSync(path.join(photosDir, 'concert.webp'), 'original-image-bytes');
    fs.mkdirSync(path.join(photosDir, 'thumbnails'), { recursive: true });
    fs.writeFileSync(path.join(photosDir, 'thumbnails', 'concert.webp'), 'thumb-bytes');
    fs.mkdirSync(path.join(photosDir, 'resized', 'webp', '1600'), { recursive: true });
    fs.writeFileSync(path.join(photosDir, 'resized', 'webp', '1600', 'concert.webp'), 'resized-bytes');
  });

  afterAll(function () {
    try {
      fs.rmSync(photosDir, { recursive: true, force: true });
    } catch (e) {
      // best-effort
    }
  });

  it('renvoie 404 pour un original .jpg', function () {
    return supertest(makeApp(photosDir))
      .get('/photos/concert.jpg')
      .expect(404)
      .expect(function (res) {
        expect(res.text).not.toContain('original-image-bytes');
      });
  });

  it('renvoie 404 pour un original .webp', function () {
    return supertest(makeApp(photosDir)).get('/photos/concert.webp').expect(404);
  });

  it('renvoie 404 pour le cache de redimensionnement', function () {
    return supertest(makeApp(photosDir))
      .get('/photos/resized/webp/1600/concert.webp')
      .expect(404);
  });

  it('renvoie 404 pour un listing de dossier', function () {
    return supertest(makeApp(photosDir)).get('/photos/').expect(404);
  });

  it('sert toujours les miniatures publiques', function () {
    return supertest(makeApp(photosDir))
      .get('/photos/thumbnails/concert.webp')
      .expect(200)
      .expect(function (res) {
        expect(res.body.toString()).toBe('thumb-bytes');
      });
  });

  it('laisse passer la route /photos/resize', function () {
    return supertest(makeApp(photosDir))
      .get('/photos/resize?file=concert.jpg&w=640')
      .expect(200)
      .expect('resize-ok');
  });

  it('server.js ne monte aucun static sur la racine du dossier photos', function () {
    const source = fs.readFileSync(path.join(__dirname, '../../server.js'), 'utf8');
    expect(source).not.toMatch(/express\.static\(path\.join\(__dirname,\s*'photos'\)\)/);
    expect(source).toMatch(/createPhotosStaticMiddleware/);
  });
});
