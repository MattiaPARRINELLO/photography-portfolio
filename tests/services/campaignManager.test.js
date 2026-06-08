var path = require('path');
var fileStore = {};

jest.mock('fs', function () {
  var actual = jest.requireActual('fs');
  return Object.assign({}, actual, {
    existsSync: jest.fn(function (p) { return fileStore[p] !== undefined; }),
    readFileSync: jest.fn(function (p, enc) {
      if (fileStore[p] !== undefined) return fileStore[p];
      var err = new Error('ENOENT');
      err.code = 'ENOENT';
      throw err;
    }),
    writeFileSync: jest.fn(function (p, d) { fileStore[p] = d; }),
    mkdirSync: jest.fn(),
    unlinkSync: jest.fn()
  });
});

var CampaignManager = require('../../scripts/CampaignManager');

var managerModule = require.resolve('../../scripts/CampaignManager');
var dataFile = path.join(path.dirname(managerModule), '..', 'config', 'campaigns.json');

function seed(data) {
  fileStore[dataFile] = JSON.stringify(data);
}

function readStore() {
  var raw = fileStore[dataFile];
  return raw ? JSON.parse(raw) : null;
}

function makeCampaignData(overrides) {
  var base = {
    id: 'test-campaign',
    name: 'Campagne Test',
    source: 'instagram',
    medium: 'social',
    description: 'Une campagne de test'
  };
  if (overrides) {
    Object.keys(overrides).forEach(function (k) { base[k] = overrides[k]; });
  }
  return base;
}

describe('CampaignManager', function () {
  var cm;

  beforeEach(function () {
    jest.clearAllMocks();
    Object.keys(fileStore).forEach(function (k) { delete fileStore[k]; });
    cm = new CampaignManager();
  });

  // ================================================================
  // constructor / initializeDataFile
  // ================================================================
  describe('constructor et initializeDataFile', function () {
    it('definit le bon chemin pour dataFile', function () {
      expect(cm.dataFile).toBe(dataFile);
    });

    it('cree le fichier de donnees avec la structure initiale', function () {
      var stored = readStore();
      expect(stored).not.toBeNull();
      expect(stored.metadata).toBeDefined();
      expect(stored.metadata.version).toBe('1.0.0');
      expect(stored.metadata.created).toBeDefined();
      expect(stored.metadata.lastUpdated).toBeDefined();
      expect(stored.campaigns).toEqual({});
    });

    it('ne reecrase pas un fichier deja existant', function () {
      var customData = {
        metadata: {
          created: '2020-01-01T00:00:00.000Z',
          lastUpdated: '2020-01-01T00:00:00.000Z',
          version: 'custom-v2'
        },
        campaigns: { existing: { id: 'existing', name: 'Existante' } }
      };
      seed(customData);

      var cm2 = new CampaignManager();
      var stored = readStore();
      expect(stored.metadata.version).toBe('custom-v2');
      expect(stored.campaigns.existing).toBeDefined();
      expect(stored.campaigns.existing.name).toBe('Existante');
    });
  });

  // ================================================================
  // readData
  // ================================================================
  describe('readData', function () {
    it('lit et parse des donnees JSON valides', function () {
      seed({
        metadata: { version: '1.0' },
        campaigns: { c1: { id: 'c1', name: 'Test', visits: 5 } }
      });

      var result = cm.readData();
      expect(result.metadata.version).toBe('1.0');
      expect(result.campaigns.c1.name).toBe('Test');
      expect(result.campaigns.c1.visits).toBe(5);
    });

    it('retourne un fallback si le JSON est invalide', function () {
      fileStore[dataFile] = '{json corrompu';

      var result = cm.readData();
      expect(result.metadata).toBeDefined();
      expect(result.metadata.version).toBe('1.0.0');
      expect(result.campaigns).toEqual({});
    });

    it('retourne un fallback si le fichier est introuvable', function () {
      delete fileStore[dataFile];

      var result = cm.readData();
      expect(result.metadata).toBeDefined();
      expect(result.metadata.version).toBe('1.0.0');
      expect(result.campaigns).toEqual({});
    });
  });

  // ================================================================
  // saveData
  // ================================================================
  describe('saveData', function () {
    it('ecrit les donnees et met a jour metadata.lastUpdated', function () {
      var data = {
        metadata: { lastUpdated: 'ancienne-date' },
        campaigns: { c1: { id: 'c1' } }
      };

      var result = cm.saveData(data);
      expect(result).toBe(true);

      var stored = readStore();
      expect(stored.metadata.lastUpdated).not.toBe('ancienne-date');
      expect(stored.campaigns.c1.id).toBe('c1');
    });

    it('retourne false si l\'ecriture echoue', function () {
      var fs = require('fs');
      fs.writeFileSync.mockImplementationOnce(function () {
        throw new Error('Erreur disque');
      });

      var data = { metadata: { lastUpdated: 'test' }, campaigns: {} };
      var result = cm.saveData(data);
      expect(result).toBe(false);
    });
  });

  // ================================================================
  // createCampaign
  // ================================================================
  describe('createCampaign', function () {
    it('cree une campagne avec tous les champs requis', function () {
      var input = makeCampaignData();

      var campaign = cm.createCampaign(input);

      expect(campaign.id).toBe('test-campaign');
      expect(campaign.name).toBe('Campagne Test');
      expect(campaign.source).toBe('instagram');
      expect(campaign.medium).toBe('social');
      expect(campaign.description).toBe('Une campagne de test');
      expect(campaign.createdAt).toBeDefined();
      expect(campaign.visits).toBe(0);
      expect(campaign.lastVisit).toBeNull();
      expect(campaign.isActive).toBe(true);

      var stored = readStore();
      expect(stored.campaigns['test-campaign']).toBeDefined();
    });

    it('persiste la campagne dans le fichier', function () {
      cm.createCampaign(makeCampaignData({ id: 'camp-persistee', name: 'Persistee' }));

      var stored = readStore();
      expect(stored.campaigns['camp-persistee'].name).toBe('Persistee');
    });

    it('lance une erreur si la sauvegarde echoue', function () {
      var fs = require('fs');
      fs.writeFileSync.mockImplementationOnce(function () {
        throw new Error('Erreur disque');
      });

      expect(function () {
        cm.createCampaign(makeCampaignData());
      }).toThrow('Erreur lors de la sauvegarde de la campagne');
    });
  });

  // ================================================================
  // recordCampaignVisit
  // ================================================================
  describe('recordCampaignVisit', function () {
    it('incremente visits et ajoute une entree au visitHistory', function () {
      cm.createCampaign(makeCampaignData({ id: 'c1' }));

      var result = cm.recordCampaignVisit('c1', 'Mozilla/5.0', '192.168.1.1');

      expect(result.visits).toBe(1);
      expect(result.visitHistory).toBeDefined();
      expect(result.visitHistory.length).toBe(1);
      expect(result.visitHistory[0].userAgent).toBe('Mozilla/5.0');
      expect(result.visitHistory[0].ip).toBe('192.168.1.1');
      expect(result.visitHistory[0].timestamp).toBeDefined();
      expect(result.lastVisit).toBeDefined();
      expect(result.lastVisit).not.toBeNull();
    });

    it('incremente visits a chaque visite successive', function () {
      cm.createCampaign(makeCampaignData({ id: 'c1' }));

      cm.recordCampaignVisit('c1', 'UA1', '10.0.0.1');
      cm.recordCampaignVisit('c1', 'UA2', '10.0.0.2');
      var result = cm.recordCampaignVisit('c1', 'UA3', '10.0.0.3');

      expect(result.visits).toBe(3);
      expect(result.visitHistory.length).toBe(3);
      expect(result.visitHistory[0].userAgent).toBe('UA1');
      expect(result.visitHistory[2].userAgent).toBe('UA3');
    });

    it('retourne null si le campaignId n\'existe pas', function () {
      var result = cm.recordCampaignVisit('inexistant', 'UA', '1.1.1.1');
      expect(result).toBeNull();
    });

    it('cree le tableau visitHistory s\'il est absent', function () {
      seed({
        metadata: { version: '1.0' },
        campaigns: {
          'no-history': {
            id: 'no-history',
            name: 'Sans Historique',
            source: 'email',
            medium: 'newsletter',
            description: '',
            createdAt: new Date().toISOString(),
            visits: 0,
            lastVisit: null,
            isActive: true
          }
        }
      });

      var result = cm.recordCampaignVisit('no-history', 'Chrome', '10.0.0.1');
      expect(result.visitHistory).toBeDefined();
      expect(result.visitHistory.length).toBe(1);
      expect(result.visitHistory[0].userAgent).toBe('Chrome');
    });

    it('persiste les visites dans le fichier', function () {
      cm.createCampaign(makeCampaignData({ id: 'c1' }));
      cm.recordCampaignVisit('c1', 'UA', '1.1.1.1');
      cm.recordCampaignVisit('c1', 'UA', '1.1.1.1');

      var stored = readStore();
      expect(stored.campaigns.c1.visits).toBe(2);
      expect(stored.campaigns.c1.visitHistory.length).toBe(2);
    });
  });

  // ================================================================
  // getAllCampaigns
  // ================================================================
  describe('getAllCampaigns', function () {
    it('retourne un tableau de toutes les campagnes', function () {
      cm.createCampaign(makeCampaignData({ id: 'c1', name: 'Premiere' }));
      cm.createCampaign(makeCampaignData({ id: 'c2', name: 'Deuxieme', source: 'email' }));

      var all = cm.getAllCampaigns();
      expect(Array.isArray(all)).toBe(true);
      expect(all.length).toBe(2);
      expect(all[0].id).toBe('c1');
      expect(all[1].id).toBe('c2');
    });

    it('retourne un tableau vide si aucune campagne n\'existe', function () {
      var all = cm.getAllCampaigns();
      expect(Array.isArray(all)).toBe(true);
      expect(all.length).toBe(0);
    });
  });

  // ================================================================
  // getCampaignById
  // ================================================================
  describe('getCampaignById', function () {
    it('retourne la campagne si l\'ID existe', function () {
      cm.createCampaign(makeCampaignData({ id: 'c1', name: 'Ma Campagne' }));

      var result = cm.getCampaignById('c1');
      expect(result).toBeDefined();
      expect(result.name).toBe('Ma Campagne');
    });

    it('retourne null si l\'ID n\'existe pas', function () {
      var result = cm.getCampaignById('inexistant');
      expect(result).toBeNull();
    });
  });

  // ================================================================
  // deleteCampaign
  // ================================================================
  describe('deleteCampaign', function () {
    it('supprime la campagne et retourne true', function () {
      cm.createCampaign(makeCampaignData({ id: 'c1' }));

      var result = cm.deleteCampaign('c1');
      expect(result).toBe(true);
      expect(cm.getCampaignById('c1')).toBeNull();

      var stored = readStore();
      expect(stored.campaigns.c1).toBeUndefined();
    });

    it('retourne false si la campagne n\'existe pas', function () {
      var result = cm.deleteCampaign('inexistant');
      expect(result).toBe(false);
    });

    it('retourne false si la sauvegarde echoue', function () {
      cm.createCampaign(makeCampaignData({ id: 'c1' }));

      var fs = require('fs');
      fs.writeFileSync.mockImplementationOnce(function () {
        throw new Error('Erreur disque');
      });

      var result = cm.deleteCampaign('c1');
      expect(result).toBe(false);
    });

    it('ne supprime que la campagne ciblee', function () {
      cm.createCampaign(makeCampaignData({ id: 'c1', name: 'Garder' }));
      cm.createCampaign(makeCampaignData({ id: 'c2', name: 'Supprimer' }));

      cm.deleteCampaign('c2');

      expect(cm.campaignExists('c1')).toBe(true);
      expect(cm.campaignExists('c2')).toBe(false);
    });
  });

  // ================================================================
  // getCampaignStats
  // ================================================================
  describe('getCampaignStats', function () {
    it('calcule totalCampaigns et totalVisits', function () {
      cm.createCampaign(makeCampaignData({ id: 'c1', source: 'instagram' }));
      cm.createCampaign(makeCampaignData({ id: 'c2', source: 'facebook' }));
      cm.createCampaign(makeCampaignData({ id: 'c3', source: 'instagram' }));

      cm.recordCampaignVisit('c1', 'UA', '1.1.1.1');
      cm.recordCampaignVisit('c1', 'UA', '1.1.1.1');
      cm.recordCampaignVisit('c2', 'UA', '1.1.1.1');

      var stats = cm.getCampaignStats();
      expect(stats.totalCampaigns).toBe(3);
      expect(stats.totalVisits).toBe(3);
    });

    it('calcule les visites du jour (todayVisits)', function () {
      cm.createCampaign(makeCampaignData({ id: 'c1', source: 'facebook' }));
      cm.recordCampaignVisit('c1', 'UA', '1.1.1.1');

      var stats = cm.getCampaignStats();
      expect(stats.todayVisits).toBe(1);
    });

    it('identifie la source la plus populaire (topSource)', function () {
      cm.createCampaign(makeCampaignData({ id: 'c1', source: 'instagram' }));
      cm.createCampaign(makeCampaignData({ id: 'c2', source: 'facebook' }));

      cm.recordCampaignVisit('c1', 'UA', '1.1.1.1');
      cm.recordCampaignVisit('c1', 'UA', '1.1.1.1');
      cm.recordCampaignVisit('c1', 'UA', '1.1.1.1');
      cm.recordCampaignVisit('c2', 'UA', '1.1.1.1');

      var stats = cm.getCampaignStats();
      expect(stats.topSource).toBe('instagram');
    });

    it('gere le cas sans aucune campagne', function () {
      var stats = cm.getCampaignStats();
      expect(stats.totalCampaigns).toBe(0);
      expect(stats.totalVisits).toBe(0);
      expect(stats.todayVisits).toBe(0);
      expect(stats.topSource).toBeNull();
    });

    it('gere les campagnes sans visitHistory', function () {
      seed({
        metadata: { version: '1.0' },
        campaigns: {
          'sans-visites': {
            id: 'sans-visites',
            name: 'Sans visites',
            source: 'email',
            medium: 'newsletter',
            description: '',
            createdAt: new Date().toISOString(),
            visits: 0,
            lastVisit: null,
            isActive: true
          }
        }
      });

      var stats = cm.getCampaignStats();
      expect(stats.totalCampaigns).toBe(1);
      expect(stats.totalVisits).toBe(0);
      expect(stats.todayVisits).toBe(0);
    });
  });

  // ================================================================
  // campaignExists
  // ================================================================
  describe('campaignExists', function () {
    it('retourne true si la campagne existe', function () {
      cm.createCampaign(makeCampaignData({ id: 'existante' }));
      expect(cm.campaignExists('existante')).toBe(true);
    });

    it('retourne false si la campagne n\'existe pas', function () {
      expect(cm.campaignExists('inexistante')).toBe(false);
    });

    it('retourne false apres suppression', function () {
      cm.createCampaign(makeCampaignData({ id: 'temp' }));
      expect(cm.campaignExists('temp')).toBe(true);

      cm.deleteCampaign('temp');
      expect(cm.campaignExists('temp')).toBe(false);
    });
  });
});
