'use strict';

// Mock fs avec un mockFileStore en mémoire
var mockFileStore = {};

jest.mock('fs', function () {
  var actual = jest.requireActual('fs');
  return Object.assign({}, actual, {
    existsSync: jest.fn(function (p) { return mockFileStore[p] !== undefined; }),
    readFileSync: jest.fn(function (p, enc) {
      if (mockFileStore[p] !== undefined) return mockFileStore[p];
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }),
    writeFileSync: jest.fn(function (p, d) { mockFileStore[p] = d; }),
    mkdirSync: jest.fn(),
    statSync: jest.fn().mockReturnValue({ size: 1024, mtime: new Date() })
  });
});

var PhotoClickTracker = require('../../scripts/PhotoClickTracker');

describe('PhotoClickTracker', function () {
  var cwdSpy;
  var DATA_PATH = '/fake/logs/photo-clicks.json';

  beforeEach(function () {
    mockFileStore = {};
    cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue('/fake');
  });

  afterEach(function () {
    cwdSpy.mockRestore();
  });

  function readStored() {
    return JSON.parse(mockFileStore[DATA_PATH]);
  }

  describe('constructor', function () {
    it('crée le fichier de données et le dossier logs', function () {
      new PhotoClickTracker();
      var stored = readStored();
      expect(stored.metadata.totalClicks).toBe(0);
      expect(stored.photos).toEqual({});
      expect(stored.metadata.created).toBeDefined();
    });

    it('accepte un nom de fichier personnalisé', function () {
      var tracker = new PhotoClickTracker('custom.json');
      expect(tracker.dataFile).toBe('/fake/logs/custom.json');
    });
  });

  describe('recordPhotoClick', function () {
    it('ajoute une nouvelle photo et incrémente les compteurs', function () {
      var tracker = new PhotoClickTracker();
      var result = tracker.recordPhotoClick('photo1.jpg', 'user1');

      expect(result).toBe(true);
      var stored = readStored();
      expect(stored.metadata.totalClicks).toBe(1);
      expect(stored.photos['photo1.jpg'].totalClicks).toBe(1);
      expect(stored.photos['photo1.jpg'].uniqueUsers).toEqual(['user1']);
    });

    it('incrémente totalClicks pour une photo existante', function () {
      var tracker = new PhotoClickTracker();
      tracker.recordPhotoClick('photo1.jpg', 'user1');
      tracker.recordPhotoClick('photo1.jpg', 'user2');

      var stored = readStored();
      expect(stored.photos['photo1.jpg'].totalClicks).toBe(2);
      expect(stored.metadata.totalClicks).toBe(2);
    });

    it('ne duplique pas les identifiants utilisateurs', function () {
      var tracker = new PhotoClickTracker();
      tracker.recordPhotoClick('photo1.jpg', 'user1');
      tracker.recordPhotoClick('photo1.jpg', 'user1');
      tracker.recordPhotoClick('photo1.jpg', 'user1');

      var stored = readStored();
      expect(stored.photos['photo1.jpg'].uniqueUsers).toEqual(['user1']);
    });

    it('nettoie le chemin et les paramètres du nom de fichier', function () {
      var tracker = new PhotoClickTracker();
      tracker.recordPhotoClick('/galleries/voyage/photo1.jpg?size=large', 'user1');

      var stored = readStored();
      expect(stored.photos['photo1.jpg']).toBeDefined();
      expect(stored.photos['/galleries/voyage/photo1.jpg']).toBeUndefined();
    });

    it('fonctionne sans userId', function () {
      var tracker = new PhotoClickTracker();
      tracker.recordPhotoClick('photo1.jpg');

      var stored = readStored();
      expect(stored.photos['photo1.jpg'].totalClicks).toBe(1);
      expect(stored.photos['photo1.jpg'].uniqueUsers).toEqual([]);
      expect(stored.photos['photo1.jpg'].clickDetails[0].userId).toBe(null);
    });

    it('inclut les additionalData dans clickDetails', function () {
      var tracker = new PhotoClickTracker();
      tracker.recordPhotoClick('photo1.jpg', 'user1', { referrer: '/galleries' });

      var stored = readStored();
      expect(stored.photos['photo1.jpg'].clickDetails[0].referrer).toBe('/galleries');
    });

    it('limite clickDetails à 100 entrées', function () {
      var tracker = new PhotoClickTracker();
      for (var i = 0; i < 150; i++) {
        tracker.recordPhotoClick('photo1.jpg', 'user' + i);
      }

      var stored = readStored();
      expect(stored.photos['photo1.jpg'].clickDetails.length).toBe(100);
    });
  });

  describe('getAllPhotoStats', function () {
    it('retourne les photos triées par clics décroissants', function () {
      var tracker = new PhotoClickTracker();
      tracker.recordPhotoClick('b.jpg', 'u1');
      tracker.recordPhotoClick('a.jpg', 'u1');
      tracker.recordPhotoClick('a.jpg', 'u2');
      tracker.recordPhotoClick('c.jpg', 'u1');
      tracker.recordPhotoClick('c.jpg', 'u2');
      tracker.recordPhotoClick('c.jpg', 'u3');

      var stats = tracker.getAllPhotoStats();

      expect(stats.totalPhotos).toBe(3);
      expect(stats.totalClicks).toBe(6);
      expect(stats.photos.length).toBe(3);
      expect(stats.photos[0].filename).toBe('c.jpg');
      expect(stats.photos[0].totalClicks).toBe(3);
      expect(stats.photos[1].filename).toBe('a.jpg');
      expect(stats.photos[1].totalClicks).toBe(2);
      expect(stats.photos[2].filename).toBe('b.jpg');
      expect(stats.photos[2].totalClicks).toBe(1);
    });

    it('inclut uniqueUsers comme un nombre', function () {
      var tracker = new PhotoClickTracker();
      tracker.recordPhotoClick('photo1.jpg', 'user1');
      tracker.recordPhotoClick('photo1.jpg', 'user2');
      tracker.recordPhotoClick('photo1.jpg', 'user1');

      var stats = tracker.getAllPhotoStats();
      expect(stats.photos[0].uniqueUsers).toBe(2);
    });

    it('retourne des stats vides sans photos', function () {
      var tracker = new PhotoClickTracker();
      var stats = tracker.getAllPhotoStats();

      expect(stats.totalPhotos).toBe(0);
      expect(stats.totalClicks).toBe(0);
      expect(stats.photos).toEqual([]);
    });
  });

  describe('getClicksForPeriod', function () {
    it('filtre les clics selon le nombre de jours', function () {
      var tracker = new PhotoClickTracker();
      var maintenant = new Date();
      var ilYAUneHeure = new Date(maintenant.getTime() - 60 * 60 * 1000);
      var ilYADeuxJours = new Date(maintenant.getTime() - 2 * 24 * 60 * 60 * 1000);
      var ilYADixJours = new Date(maintenant.getTime() - 10 * 24 * 60 * 60 * 1000);

      var clickDetails = [
        { timestamp: maintenant.toISOString() },
        { timestamp: ilYAUneHeure.toISOString() },
        { timestamp: ilYADeuxJours.toISOString() },
        { timestamp: ilYADixJours.toISOString() }
      ];

      expect(tracker.getClicksForPeriod(clickDetails, 1)).toBe(2);
      expect(tracker.getClicksForPeriod(clickDetails, 3)).toBe(3);
      expect(tracker.getClicksForPeriod(clickDetails, 7)).toBe(3);
      expect(tracker.getClicksForPeriod(clickDetails, 30)).toBe(4);
    });

    it('retourne 0 pour une entrée non-array', function () {
      var tracker = new PhotoClickTracker();
      expect(tracker.getClicksForPeriod(null, 7)).toBe(0);
      expect(tracker.getClicksForPeriod(undefined, 7)).toBe(0);
      expect(tracker.getClicksForPeriod('string', 7)).toBe(0);
    });
  });

  describe('getTopPhotos', function () {
    it('retourne le top N des photos', function () {
      var tracker = new PhotoClickTracker();
      tracker.recordPhotoClick('c.jpg', 'u1');
      tracker.recordPhotoClick('a.jpg', 'u1');
      tracker.recordPhotoClick('a.jpg', 'u2');
      tracker.recordPhotoClick('b.jpg', 'u1');

      var top2 = tracker.getTopPhotos(2);
      expect(top2.length).toBe(2);
      expect(top2[0].filename).toBe('a.jpg');

      var top5 = tracker.getTopPhotos(5);
      expect(top5.length).toBe(3);
    });

    it('utilise 10 comme limite par défaut', function () {
      var tracker = new PhotoClickTracker();
      var top = tracker.getTopPhotos();
      expect(Array.isArray(top)).toBe(true);
      expect(top.length).toBe(0);
    });
  });

  describe('resetStats', function () {
    it('réinitialise les statistiques', function () {
      var tracker = new PhotoClickTracker();
      tracker.recordPhotoClick('a.jpg', 'u1');
      tracker.recordPhotoClick('b.jpg', 'u2');

      expect(readStored().metadata.totalClicks).toBe(2);

      var result = tracker.resetStats();
      expect(result).toBe(true);

      var stored = readStored();
      expect(stored.metadata.totalClicks).toBe(0);
      expect(stored.photos).toEqual({});
      expect(stored.metadata.resetAt).toBeDefined();
    });
  });
});
