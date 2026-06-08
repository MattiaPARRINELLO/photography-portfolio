var path = require('path');

// In-memory store pour simuler le systeme de fichiers
var fileStore = {};

jest.mock('fs', function () {
  var actual = jest.requireActual('fs');
  return Object.assign({}, actual, {
    existsSync: jest.fn(function (p) { return fileStore[p] !== undefined; }),
    readFileSync: jest.fn(function (p, enc) {
      if (fileStore[p] !== undefined) return fileStore[p];
      var err = new Error('ENOENT: no such file or directory');
      err.code = 'ENOENT';
      throw err;
    }),
    writeFileSync: jest.fn(function (p, data) { fileStore[p] = data; }),
    readdirSync: jest.fn().mockReturnValue([]),
    mkdirSync: jest.fn(),
    statSync: jest.fn().mockReturnValue({ size: 1024, mtime: new Date(), mtimeMs: Date.now() }),
    promises: {
      readdir: jest.fn().mockResolvedValue([]),
      mkdir: jest.fn().mockResolvedValue(undefined),
      writeFile: jest.fn().mockResolvedValue(undefined),
      stat: jest.fn().mockResolvedValue({ mtimeMs: Date.now() })
    }
  });
});

var galleryService = require('../../server/utils/galleryService');

// Trouver le chemin reel du fichier galleries.json
var galleriesPath = (function () {
  var p = require.resolve('../../server/utils/galleryService');
  return path.join(path.dirname(p), '..', '..', 'config', 'galleries.json');
})();

function seed(data) {
  fileStore[galleriesPath] = JSON.stringify(data);
}

function readStore() {
  return JSON.parse(fileStore[galleriesPath] || '{"galleries":[]}');
}

describe('galleryService', function () {

  beforeEach(function () {
    jest.clearAllMocks();
    Object.keys(fileStore).forEach(function (k) { delete fileStore[k]; });
  });

  // ================================================================
  // loadGalleries
  // ================================================================
  describe('loadGalleries', function () {
    it('retourne les galeries si le fichier existe', function () {
      seed({ metadata: { version: '1.0' }, galleries: [{ id: 'g1', title: 'Test' }] });
      var data = galleryService.loadGalleries();
      expect(data.galleries).toHaveLength(1);
    });

    it('initialise galleries si absent du JSON', function () {
      seed({ metadata: { version: '1.0' } });
      var data = galleryService.loadGalleries();
      expect(data.galleries).toEqual([]);
    });

    it('retourne structure par defaut si fichier absent', function () {
      var data = galleryService.loadGalleries();
      expect(data.metadata.version).toBe('1.0.0');
      expect(data.galleries).toEqual([]);
    });

    it('retourne structure par defaut si JSON invalide', function () {
      fileStore[galleriesPath] = 'pas du json';
      var data = galleryService.loadGalleries();
      expect(data.galleries).toEqual([]);
    });
  });

  // ================================================================
  // slugify
  // ================================================================
  describe('slugify', function () {
    it('convertit accents et espaces en slug', function () {
      expect(galleryService.slugify('Concert de Rap à Paris')).toBe('concert-de-rap-a-paris');
    });

    it('supprime les accents', function () {
      expect(galleryService.slugify('Été 2025')).toBe('ete-2025');
    });

    it('gère chaine vide', function () {
      expect(galleryService.slugify('')).toBe('');
    });

    it('gère null', function () {
      expect(galleryService.slugify(null)).toBe('');
    });

    it('gère undefined', function () {
      expect(galleryService.slugify(undefined)).toBe('');
    });

    it('limite a 80 caracteres', function () {
      var long = 'a'.repeat(100);
      var s = galleryService.slugify(long);
      expect(s.length).toBeLessThanOrEqual(80);
    });

    it('supprime tirets au debut et a la fin', function () {
      expect(galleryService.slugify('---hello---')).toBe('hello');
    });

    it('remplace caracteres non-alphanumeriques par tiret', function () {
      expect(galleryService.slugify('hello@world#2025')).toBe('hello-world-2025');
    });
  });

  // ================================================================
  // listGalleries
  // ================================================================
  describe('listGalleries', function () {
    it('trie par date decroissante', function () {
      seed({
        galleries: [
          { id: 'g1', title: 'B', date: '2025-01-01' },
          { id: 'g2', title: 'A', date: '2025-03-01' },
          { id: 'g3', title: 'C', date: '' }
        ]
      });
      var list = galleryService.listGalleries();
      expect(list[0].id).toBe('g2');
      expect(list[1].id).toBe('g1');
      expect(list[2].id).toBe('g3');
    });

    it('tri stable par titre si meme date', function () {
      seed({
        galleries: [
          { id: 'g1', title: 'B', date: '2025-01-01' },
          { id: 'g2', title: 'A', date: '2025-01-01' }
        ]
      });
      var list = galleryService.listGalleries();
      expect(list[0].title).toBe('A');
    });

    it('tableau vide si pas de galeries', function () {
      seed({ galleries: [] });
      expect(galleryService.listGalleries()).toEqual([]);
    });
  });

  // ================================================================
  // getGalleryBySlug / getGalleryById
  // ================================================================
  describe('getGalleryBySlug', function () {
    it('trouve une galerie par slug', function () {
      seed({ galleries: [{ id: 'g1', slug: 'mon-slug', title: 'Test' }] });
      var g = galleryService.getGalleryBySlug('mon-slug');
      expect(g.id).toBe('g1');
    });

    it('retourne null si non trouve', function () {
      seed({ galleries: [] });
      expect(galleryService.getGalleryBySlug('inexistant')).toBeNull();
    });
  });

  describe('getGalleryById', function () {
    it('trouve une galerie par id', function () {
      seed({ galleries: [{ id: 'g1', slug: 's', title: 'T' }] });
      expect(galleryService.getGalleryById('g1').id).toBe('g1');
    });

    it('retourne null si non trouve', function () {
      seed({ galleries: [] });
      expect(galleryService.getGalleryById('inexistant')).toBeNull();
    });
  });

  // ================================================================
  // createGallery
  // ================================================================
  describe('createGallery', function () {
    it('cree une galerie avec tous les champs', function () {
      seed({ galleries: [] });
      var g = galleryService.createGallery({
        title: 'Concert Paris',
        artist: 'Artiste',
        venue: 'Salle',
        date: '2025-06-01',
        photos: ['p1.jpg', 'p2.jpg'],
        published: true
      });
      expect(g.id).toContain('g_');
      expect(g.slug).toBe('concert-paris');
      expect(g.title).toBe('Concert Paris');
      expect(g.photos).toEqual(['p1.jpg', 'p2.jpg']);
      expect(g.cover).toBe('p1.jpg');
      expect(g.published).toBe(true);
      expect(g.excludeFromMain).toBe(false);
      expect(g.createdAt).toBeDefined();
      expect(g.updatedAt).toBeDefined();
    });

    it('leve erreur si titre vide', function () {
      seed({ galleries: [] });
      expect(function () { galleryService.createGallery({ title: '' }); }).toThrow('Le titre est requis');
    });

    it('leve erreur si titre absent', function () {
      seed({ galleries: [] });
      expect(function () { galleryService.createGallery({}); }).toThrow('Le titre est requis');
    });

    it('cree galerie non publiee', function () {
      seed({ galleries: [] });
      var g = galleryService.createGallery({ title: 'Brouillon', published: false });
      expect(g.published).toBe(false);
    });

    it('cree galerie exclue du main', function () {
      seed({ galleries: [] });
      var g = galleryService.createGallery({ title: 'Exclue', excludeFromMain: true });
      expect(g.excludeFromMain).toBe(true);
    });

    it('incremente le slug en cas de conflit', function () {
      seed({ galleries: [{ id: 'g1', slug: 'test', title: 'Test' }, { id: 'g2', slug: 'test-2', title: 'Test2' }] });
      var g = galleryService.createGallery({ title: 'Test' });
      expect(g.slug).toBe('test-3');
    });

    it('utilise slug fourni', function () {
      seed({ galleries: [] });
      var g = galleryService.createGallery({ title: 'Test', slug: 'custom-slug' });
      expect(g.slug).toBe('custom-slug');
    });

    it('cover = null si pas de photos', function () {
      seed({ galleries: [] });
      var g = galleryService.createGallery({ title: 'Sans Photo' });
      expect(g.cover).toBeNull();
    });

    it('normalise artistLinks', function () {
      seed({ galleries: [] });
      var g = galleryService.createGallery({ title: 'Test', artistLinks: { instagram: 'instagram.com/user' } });
      expect(g.artistLinks.instagram).toContain('https://');
    });

    it('galleryOnlyPhotos inclut uploadedPhotos et exclusives', function () {
      seed({ galleries: [] });
      var g = galleryService.createGallery({
        title: 'Test',
        photos: ['a.jpg', 'b.jpg', 'c.jpg'],
        uploadedPhotos: ['a.jpg'],
        galleryOnlyPhotos: ['c.jpg']
      });
      expect(g.galleryOnlyPhotos).toContain('a.jpg');
      expect(g.galleryOnlyPhotos).toContain('c.jpg');
      expect(g.galleryOnlyPhotos).not.toContain('b.jpg');
    });

    it('filtre les photos en double', function () {
      seed({ galleries: [] });
      var g = galleryService.createGallery({
        title: 'Test',
        photos: ['a.jpg', 'a.jpg', 'b.jpg']
      });
      expect(g.photos).toEqual(['a.jpg', 'b.jpg']);
    });
  });

  // ================================================================
  // updateGallery
  // ================================================================
  describe('updateGallery', function () {
    var seedBase;

    beforeEach(function () {
      seedBase = [
        { id: 'g1', slug: 'concert-1', title: 'Concert 1', artist: 'A1', venue: 'V1', date: '2025-01-01', photos: ['p1.jpg', 'p2.jpg'], cover: 'p1.jpg', galleryOnlyPhotos: [], published: true, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' }
      ];
      seed({ galleries: JSON.parse(JSON.stringify(seedBase)) });
    });

    it('met a jour le titre', function () {
      var g = galleryService.updateGallery('g1', { title: 'Nouveau Titre' });
      expect(g.title).toBe('Nouveau Titre');
    });

    it('met a jour le slug', function () {
      var g = galleryService.updateGallery('g1', { slug: 'nouveau-slug' });
      expect(g.slug).toBe('nouveau-slug');
    });

    it('met a jour les photos et garde galleryOnlyPhotos', function () {
      seed({ galleries: [{ id: 'g1', slug: 't', title: 'T', photos: ['a.jpg', 'b.jpg'], galleryOnlyPhotos: ['a.jpg'] }] });
      var g = galleryService.updateGallery('g1', { photos: ['a.jpg'] });
      expect(g.photos).toEqual(['a.jpg']);
      expect(g.galleryOnlyPhotos).toEqual(['a.jpg']);
    });

    it('retire galleryOnlyPhotos si photo supprimee', function () {
      seed({ galleries: [{ id: 'g1', slug: 't', title: 'T', photos: ['a.jpg', 'b.jpg'], galleryOnlyPhotos: ['a.jpg', 'b.jpg'] }] });
      var g = galleryService.updateGallery('g1', { photos: ['a.jpg'] });
      expect(g.galleryOnlyPhotos).toEqual(['a.jpg']);
    });

    it('met a jour published', function () {
      var g = galleryService.updateGallery('g1', { published: false });
      expect(g.published).toBe(false);
    });

    it('met a jour excludeFromMain', function () {
      var g = galleryService.updateGallery('g1', { excludeFromMain: true });
      expect(g.excludeFromMain).toBe(true);
    });

    it('recalcule cover si photos change et cover supprime', function () {
      var g = galleryService.updateGallery('g1', { cover: null, photos: ['new-cover.jpg'] });
      expect(g.cover).toBe('new-cover.jpg');
    });

    it('met a jour artistLinks via alias', function () {
      var g = galleryService.updateGallery('g1', { artistInstagram: 'instagram.com/new' });
      expect(g.artistLinks.instagram).toContain('https://instagram.com/new');
    });

    it('retourne null si galerie inexistante', function () {
      expect(galleryService.updateGallery('inexistant', { title: 'X' })).toBeNull();
    });

    it('met a jour updatedAt', function () {
      var before = Date.now();
      var g = galleryService.updateGallery('g1', { title: 'Updated' });
      expect(new Date(g.updatedAt).getTime()).toBeGreaterThanOrEqual(before);
    });
  });

  // ================================================================
  // deleteGallery
  // ================================================================
  describe('deleteGallery', function () {
    it('supprime une galerie existante', function () {
      seed({ galleries: [{ id: 'g1', slug: 't', title: 'T' }] });
      var before = readStore().galleries.length;
      expect(before).toBe(1);
      expect(galleryService.deleteGallery('g1')).toBe(true);
      expect(readStore().galleries.length).toBe(0);
    });

    it('retourne false si galerie inexistante', function () {
      seed({ galleries: [] });
      expect(galleryService.deleteGallery('inexistant')).toBe(false);
    });
  });
});
