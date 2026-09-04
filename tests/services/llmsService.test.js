var path = require('path');

var mockFileStore = {};

var llmsTxtPath = path.resolve(__dirname, '..', '..', 'llms.txt');
var llmsFullPath = path.resolve(__dirname, '..', '..', 'llms-full.md');

jest.mock('fs', function () {
  var actual = jest.requireActual('fs');
  return Object.assign({}, actual, {
    existsSync: jest.fn(function (p) { return mockFileStore[p] !== undefined; }),
    readFileSync: jest.fn(function (p, enc) {
      if (mockFileStore[p] !== undefined) return mockFileStore[p];
      var err = new Error('ENOENT');
      err.code = 'ENOENT';
      throw err;
    })
  });
});

jest.mock('../../server/utils/dataSanity', function () {
  return {
    getPublicGalleries: jest.fn().mockReturnValue([
      { slug: 'concert-1', title: 'Concert 1', artist: 'Artiste A', venue: 'Salle X', date: '2025-06-15' },
      { slug: 'concert-2', title: 'Concert 2', artist: 'Artiste B', venue: 'Salle Y', date: '2025-07-01' }
    ]),
    isManifestlyFake: jest.fn().mockReturnValue(false)
  };
});

var llmsService;

beforeEach(function () {
  jest.resetModules();
  mockFileStore = {};
  llmsService = require('../../server/utils/llmsService');
});

describe('llmsService', function () {
  describe('generateLlmsTxt', function () {
    it('remplace le marqueur par les dernières galeries', function () {
      mockFileStore[llmsTxtPath] = 'Contact : test\n\n<!-- AUTO_GALLERIES -->\n\nFull context : /llms-full.md';
      var out = llmsService.generateLlmsTxt();
      expect(out).toContain('Dernières galeries :');
      expect(out).toContain('[Concert 1 — Artiste A — Salle X');
      expect(out).toContain('https://www.photo.mprnl.fr/galeries/concert-1');
      expect(out).not.toContain('AUTO_GALLERIES');
      expect(out).toContain('Full context : /llms-full.md');
    });

    it('retourne null si le fichier est absent (fallback sendFile)', function () {
      expect(llmsService.generateLlmsTxt()).toBe(null);
    });
  });

  describe('generateLlmsFull', function () {
    it('injecte la liste des galeries publiées en markdown', function () {
      mockFileStore[llmsFullPath] = '## Galeries\n\n<!-- AUTO_GALLERIES -->\n\n## Droits';
      var out = llmsService.generateLlmsFull();
      expect(out).toContain('2 galeries publiées');
      expect(out).toContain('[Concert 2 — Artiste B — Salle Y — 1 juillet 2025]');
      expect(out).not.toContain('AUTO_GALLERIES');
      expect(out).toContain('## Droits');
    });

    it('gère le cas sans galerie', function () {
      require('../../server/utils/dataSanity').getPublicGalleries.mockReturnValue([]);
      mockFileStore[llmsFullPath] = '## Galeries\n\n<!-- AUTO_GALLERIES -->';
      var out = llmsService.generateLlmsFull();
      expect(out).toContain('Aucune galerie publiée');
    });
  });
});
