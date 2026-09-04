var path = require('path');

var mockFileStore = {};

var seoPath = path.resolve(__dirname, '..', '..', 'config', 'seo.json');

jest.mock('fs', function () {
  var actual = jest.requireActual('fs');
  return Object.assign({}, actual, {
    existsSync: jest.fn(function (p) { return mockFileStore[p] !== undefined; }),
    readFileSync: jest.fn(function (p, enc) {
      if (mockFileStore[p] !== undefined) return mockFileStore[p];
      var err = new Error('ENOENT');
      err.code = 'ENOENT';
      throw err;
    }),
    writeFileSync: jest.fn(function (p, d) { mockFileStore[p] = d; }),
    renameSync: jest.fn(function (src, dst) {
      mockFileStore[dst] = mockFileStore[src];
      delete mockFileStore[src];
    })
  });
});

var seoService;

beforeEach(function () {
  jest.resetModules();
  mockFileStore = {};
  seoService = require('../../server/utils/seoService');
});

describe('seoService', function () {
  describe('loadSeoConfig', function () {
    it('lit le JSON existant', function () {
      mockFileStore[seoPath] = '{"site":{"url":"https://x"}}';
      expect(seoService.loadSeoConfig().site.url).toBe('https://x');
    });

    it('retourne un objet vide si le fichier est absent', function () {
      expect(seoService.loadSeoConfig()).toEqual({});
    });
  });

  describe('validateSeoConfig', function () {
    it('accepte une config valide et génère les slugs manquants', function () {
      var data = {
        site: { url: 'https://www.photo.mprnl.fr' },
        pages: { home: { title: 'T' } },
        artists: [{ name: 'Jok\'air' }],
        venues: [{ name: 'Zénith d\'Amiens', city: 'Amiens' }]
      };
      var result = seoService.validateSeoConfig(data);
      expect(result.ok).toBe(true);
      expect(data.artists[0].slug).toBe('jok-air');
      expect(data.venues[0].slug).toBe('zenith-d-amiens');
    });

    it('refuse un objet sans site.url', function () {
      expect(seoService.validateSeoConfig({ pages: {} }).ok).toBe(false);
    });

    it('refuse un tableau d\'artistes sans name', function () {
      var data = { site: { url: 'x' }, pages: {}, artists: [{ slug: 'a' }] };
      expect(seoService.validateSeoConfig(data).ok).toBe(false);
    });

    it('refuse un JSON non objet', function () {
      expect(seoService.validateSeoConfig([1, 2]).ok).toBe(false);
      expect(seoService.validateSeoConfig(null).ok).toBe(false);
    });
  });

  describe('saveSeoConfig', function () {
    it('écrit le fichier validé (JSON indenté)', function () {
      var result = seoService.saveSeoConfig({ site: { url: 'https://y' }, pages: {}, artists: [{ name: 'Aswell' }] });
      expect(result.ok).toBe(true);
      var saved = JSON.parse(mockFileStore[seoPath]);
      expect(saved.artists[0].slug).toBe('aswell');
      expect(mockFileStore[seoPath + '.tmp']).toBeUndefined();
    });

    it('n\'écrit rien si la validation échoue', function () {
      var result = seoService.saveSeoConfig({ pages: {} });
      expect(result.ok).toBe(false);
      expect(mockFileStore[seoPath]).toBeUndefined();
    });
  });
});
