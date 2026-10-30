// Sécurité des URLs signées du kit presse : signature invalide/tronquée,
// expiration, restriction à la sélection presse et absence de cache.
const crypto = require('crypto');

process.env.IMAGE_SECRET_KEY = 'test-signed-images-secret-32chars!!';
const SECRET = 'test-signed-images-secret-32chars!!';

jest.mock('../../server/config', function () {
  return {
    getPaths: function () {
      return {
        photos: '/fake/photos',
        photoOriginals: '/fake/originals',
        root: '/fake/root'
      };
    },
    getConfig: function () {
      return { thumbnails: { width: 600, height: 600, quality: 90, fit: 'inside', withoutEnlargement: true, format: 'jpeg' } };
    }
  };
});

// Seules les 3 premières photos d'une galerie publiée sont offertes en HD.
jest.mock('../../server/utils/galleryService', function () {
  return {
    loadGalleries: jest.fn(function () {
      return {
        galleries: [
          { published: true, photos: ['allowed-1.jpg', 'allowed-2.jpg', 'allowed-3.jpg', 'hidden-4.jpg'] },
          { published: false, photos: ['brouillon-1.jpg'] }
        ]
      };
    })
  };
});

jest.mock('fs', function () {
  var actual = jest.requireActual('fs');
  return Object.assign({}, actual, {
    existsSync: jest.fn().mockReturnValue(true)
  });
});

const fs = require('fs');
const express = require('express');

// Les fichiers HD n'existent pas sur disque en test.
express.response.sendFile = function (p, opts, cb) {
  this.status(200).type('image/jpeg').send(Buffer.from('fake-hd-image'));
};

const signedImagesRouter = require('../../server/routes/signed-images');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', signedImagesRouter);
  return app;
}

function sign(filename, expiresAt) {
  return crypto.createHmac('sha256', SECRET).update(`${filename}:${expiresAt}`).digest('hex');
}

describe('URLs signées HD', function () {
  const supertest = require('supertest');

  beforeEach(function () {
    fs.existsSync.mockReturnValue(true);
  });

  describe('GET /api/hd-image', function () {
    it('refuse une signature tronquée avec 403 (et non 500)', function () {
      const expiresAt = Math.floor(Date.now() / 1000) + 600;
      return supertest(makeApp())
        .get('/api/hd-image?path=allowed-1.jpg&expires=' + expiresAt + '&signature=abc')
        .expect(403);
    });

    it('refuse une signature de mauvaise longueur avec 403', function () {
      const expiresAt = Math.floor(Date.now() / 1000) + 600;
      return supertest(makeApp())
        .get('/api/hd-image?path=allowed-1.jpg&expires=' + expiresAt + '&signature=' + 'a'.repeat(128))
        .expect(403);
    });

    it('refuse une signature invalide avec 403', function () {
      const expiresAt = Math.floor(Date.now() / 1000) + 600;
      return supertest(makeApp())
        .get('/api/hd-image?path=allowed-1.jpg&expires=' + expiresAt + '&signature=' + sign('allowed-2.jpg', expiresAt))
        .expect(403);
    });

    it('refuse une URL expirée avec 403', function () {
      const expiresAt = Math.floor(Date.now() / 1000) - 10;
      return supertest(makeApp())
        .get('/api/hd-image?path=allowed-1.jpg&expires=' + expiresAt + '&signature=' + sign('allowed-1.jpg', expiresAt))
        .expect(403);
    });

    it('sert l image avec une signature valide, sans cache', function () {
      const expiresAt = Math.floor(Date.now() / 1000) + 600;
      return supertest(makeApp())
        .get('/api/hd-image?path=allowed-1.jpg&expires=' + expiresAt + '&signature=' + sign('allowed-1.jpg', expiresAt))
        .expect(200)
        .expect('Cache-Control', 'private, no-store');
    });

    it('refuse un chemin de traversal même signé', function () {
      const expiresAt = Math.floor(Date.now() / 1000) + 600;
      const tricky = '../../etc/passwd';
      return supertest(makeApp())
        .get('/api/hd-image?path=' + encodeURIComponent(tricky) + '&expires=' + expiresAt + '&signature=' + sign('passwd', expiresAt))
        .expect(404);
    });
  });

  describe('POST /api/request-hd-access', function () {
    it('émet une URL signée pour une photo du kit presse', function () {
      return supertest(makeApp())
        .post('/api/request-hd-access')
        .send({ imagePath: 'photos/allowed-1.jpg' })
        .expect(200)
        .expect(function (res) {
          expect(res.body.success).toBe(true);
          expect(res.body.url).toContain('/api/hd-image?path=allowed-1.jpg');
        });
    });

    it('refuse une photo hors sélection presse avec 403', function () {
      return supertest(makeApp())
        .post('/api/request-hd-access')
        .send({ imagePath: 'photos/hidden-4.jpg' })
        .expect(403);
    });

    it('refuse une photo d une galerie non publiée avec 403', function () {
      return supertest(makeApp())
        .post('/api/request-hd-access')
        .send({ imagePath: 'photos/brouillon-1.jpg' })
        .expect(403);
    });

    it('refuse un fichier inconnu avec 403', function () {
      return supertest(makeApp())
        .post('/api/request-hd-access')
        .send({ imagePath: 'photos/autre.jpg' })
        .expect(403);
    });

    it('retourne 404 quand le fichier autorisé est introuvable', function () {
      fs.existsSync.mockReturnValue(false);
      return supertest(makeApp())
        .post('/api/request-hd-access')
        .send({ imagePath: 'photos/allowed-1.jpg' })
        .expect(404);
    });
  });
});
