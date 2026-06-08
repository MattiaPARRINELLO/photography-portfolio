var fileStore = {};
jest.mock('fs', function () {
  var actual = jest.requireActual('fs');
  return Object.assign({}, actual, {
    existsSync: jest.fn(function (p) { return fileStore[p] !== undefined; }),
    readFileSync: jest.fn(function (p, enc) {
      if (fileStore[p] !== undefined) return fileStore[p];
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }),
    writeFileSync: jest.fn(function (p, d) { fileStore[p] = d; }),
    appendFileSync: jest.fn(function (p, d) {
      fileStore[p] = (fileStore[p] || '') + d;
    }),
    readdirSync: jest.fn(function () {
      return Object.keys(fileStore).map(function (f) {
        return require('path').basename(f);
      });
    }),
    mkdirSync: jest.fn(),
    unlinkSync: jest.fn(function (p) { delete fileStore[p]; }),
    statSync: jest.fn().mockReturnValue({ size: 1024, mtime: new Date() })
  });
});

beforeAll(function () {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-06-08T12:00:00Z'));
});

afterAll(function () {
  jest.useRealTimers();
});

beforeEach(function () {
  Object.keys(fileStore).forEach(function (key) { delete fileStore[key]; });
  jest.spyOn(console, 'log').mockImplementation(function () {});
  jest.spyOn(console, 'error').mockImplementation(function () {});
  jest.spyOn(console, 'warn').mockImplementation(function () {});
  jest.spyOn(process, 'cwd').mockReturnValue('/');
});

function makeLogger() {
  return new (require('../../scripts/UserActivityLogger'))('/fake/logs');
}

function makeLogEntry(userId, action, details) {
  return makeLogEntryWithDate(userId, action, details, new Date());
}

function makeLogEntryWithDate(userId, action, details, date) {
  var timestamp = date.toISOString();
  var userAgent = (details && details.userAgent) || 'Unknown';
  var ip = (details && details.ip) || 'Unknown';
  var url = (details && details.url) || 'Unknown';
  var method = (details && details.method) || 'Unknown';
  var entry = {
    timestamp: timestamp,
    userId: userId,
    action: action,
    ip: ip,
    userAgent: userAgent,
    url: url,
    method: method,
    details: Object.assign({},
      (details && details.extraData) || {},
      (details && details.campaignInfo) ? { campaignInfo: details.campaignInfo } : {}
    )
  };
  return JSON.stringify(entry) + '\n';
}

// ================================================================
describe('UserActivityLogger', function () {

  // ================================================================
  // Constructor / ensureLogsDirectory
  // ================================================================
  describe('constructor', function () {
    it('stocke le logsDir et crée le répertoire si absent', function () {
      var logger = makeLogger();
      expect(logger.logsDir).toBe('/fake/logs');
    });

    it('appelle mkdirSync si le répertoire n\'existe pas', function () {
      var fs = require('fs');
      makeLogger();
      expect(fs.mkdirSync).toHaveBeenCalledWith('/fake/logs', { recursive: true });
    });

    it('n\'appelle pas mkdirSync si le répertoire existe déjà', function () {
      var fs = require('fs');
      fileStore['/fake/logs'] = '';
      makeLogger();
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  // ================================================================
  // getLogFileName
  // ================================================================
  describe('getLogFileName', function () {
    it('retourne le format YYYY-MM-DD.log pour la date fournie', function () {
      var logger = makeLogger();
      var result = logger.getLogFileName(new Date('2026-06-08'));
      expect(result).toBe('2026-06-08.log');
    });

    it('pad le mois et le jour avec un zéro', function () {
      var logger = makeLogger();
      var result = logger.getLogFileName(new Date('2026-01-05'));
      expect(result).toBe('2026-01-05.log');
    });
  });

  // ================================================================
  // getLogFilePath
  // ================================================================
  describe('getLogFilePath', function () {
    it('retourne le chemin complet du fichier de log', function () {
      var logger = makeLogger();
      var result = logger.getLogFilePath(new Date('2026-06-08'));
      expect(result).toBe('/fake/logs/2026-06-08.log');
    });
  });

  // ================================================================
  // log
  // ================================================================
  describe('log', function () {
    it('écrit une ligne JSON dans le fichier de log du jour', function () {
      var logger = makeLogger();
      logger.log('user1', 'page_view', { url: '/galerie', userAgent: 'Chrome', ip: '1.2.3.4', method: 'GET' });

      var logPath = logger.getLogFilePath();
      expect(fileStore[logPath]).toBeDefined();

      var lines = fileStore[logPath].trim().split('\n');
      expect(lines.length).toBe(1);

      var parsed = JSON.parse(lines[0]);
      expect(parsed.userId).toBe('user1');
      expect(parsed.action).toBe('page_view');
      expect(parsed.url).toBe('/galerie');
      expect(parsed.userAgent).toBe('Chrome');
      expect(parsed.ip).toBe('1.2.3.4');
      expect(parsed.method).toBe('GET');
      expect(parsed.timestamp).toBeDefined();
    });

    it('utilise des valeurs par défaut pour les champs absents', function () {
      var logger = makeLogger();
      logger.log('user2', 'click');

      var logPath = logger.getLogFilePath();
      var parsed = JSON.parse(fileStore[logPath].trim().split('\n')[0]);
      expect(parsed.userAgent).toBe('Unknown');
      expect(parsed.ip).toBe('Unknown');
      expect(parsed.url).toBe('Unknown');
      expect(parsed.method).toBe('Unknown');
    });

    it('inclut les extraData dans les détails', function () {
      var logger = makeLogger();
      logger.log('user3', 'form_submit', {
        extraData: { formName: 'contact', success: true }
      });

      var logPath = logger.getLogFilePath();
      var parsed = JSON.parse(fileStore[logPath].trim().split('\n')[0]);
      expect(parsed.details.formName).toBe('contact');
      expect(parsed.details.success).toBe(true);
    });

    it('inclut les campaignInfo si présentes', function () {
      var logger = makeLogger();
      logger.log('user4', 'landing', {
        campaignInfo: { source: 'instagram', medium: 'social' }
      });

      var logPath = logger.getLogFilePath();
      var parsed = JSON.parse(fileStore[logPath].trim().split('\n')[0]);
      expect(parsed.details.campaignInfo).toBeDefined();
      expect(parsed.details.campaignInfo.source).toBe('instagram');
      expect(parsed.details.campaignInfo.medium).toBe('social');
    });

    it('ajoute des lignes successives sans écraser', function () {
      var logger = makeLogger();
      logger.log('user1', 'page_view');
      logger.log('user2', 'click');

      var logPath = logger.getLogFilePath();
      var lines = fileStore[logPath].trim().split('\n');
      expect(lines.length).toBe(2);

      var entry1 = JSON.parse(lines[0]);
      var entry2 = JSON.parse(lines[1]);
      expect(entry1.userId).toBe('user1');
      expect(entry2.userId).toBe('user2');
    });

    it('loggue l\'erreur en console en cas d\'échec d\'écriture', function () {
      var fs = require('fs');
      fs.appendFileSync.mockImplementationOnce(function () {
        throw new Error('Disk full');
      });
      var logger = makeLogger();
      logger.log('user1', 'page_view');

      expect(console.error).toHaveBeenCalled();
    });
  });

  // ================================================================
  // getLogsForDate
  // ================================================================
  describe('getLogsForDate', function () {
    it('retourne un tableau vide si le fichier n\'existe pas', function () {
      var logger = makeLogger();
      var result = logger.getLogsForDate(new Date('2026-06-08'));
      expect(result).toEqual([]);
    });

    it('retourne les entrées parsées pour une date donnée', function () {
      var logger = makeLogger();
      var logPath = '/fake/logs/2026-06-08.log';
      fileStore[logPath] = makeLogEntry('user1', 'page_view') + makeLogEntry('user2', 'click');

      var result = logger.getLogsForDate(new Date('2026-06-08'));
      expect(result.length).toBe(2);
      expect(result[0].userId).toBe('user1');
      expect(result[0].action).toBe('page_view');
      expect(result[1].userId).toBe('user2');
      expect(result[1].action).toBe('click');
    });

    it('ignore les lignes vides', function () {
      var logger = makeLogger();
      var logPath = '/fake/logs/2026-06-08.log';
      fileStore[logPath] = '\n\n' + makeLogEntry('user1', 'page_view') + '\n\n';

      var result = logger.getLogsForDate(new Date('2026-06-08'));
      expect(result.length).toBe(1);
      expect(result[0].userId).toBe('user1');
    });

    it('retourne un tableau vide en cas de JSON malformé', function () {
      var logger = makeLogger();
      var logPath = '/fake/logs/2026-06-08.log';
      fileStore[logPath] = 'ligne invalide\n';

      var result = logger.getLogsForDate(new Date('2026-06-08'));
      expect(result).toEqual([]);
    });
  });

  // ================================================================
  // getAvailableDates
  // ================================================================
  describe('getAvailableDates', function () {
    it('retourne un tableau vide si aucun log', function () {
      var logger = makeLogger();
      var result = logger.getAvailableDates();
      expect(result).toEqual([]);
    });

    it('retourne les dates triées en ordre décroissant', function () {
      fileStore['/fake/logs/2026-06-01.log'] = '';
      fileStore['/fake/logs/2026-06-08.log'] = '';
      fileStore['/fake/logs/2026-06-03.log'] = '';

      var logger = makeLogger();
      var result = logger.getAvailableDates();

      expect(result.length).toBe(3);
      expect(result[0]).toBe('2026-06-08');
      expect(result[1]).toBe('2026-06-03');
      expect(result[2]).toBe('2026-06-01');
    });

    it('ignore les fichiers sans extension .log', function () {
      fileStore['/fake/logs/2026-06-08.log'] = '';
      fileStore['/fake/logs/config.json'] = '';
      fileStore['/fake/logs/readme.txt'] = '';

      var logger = makeLogger();
      var result = logger.getAvailableDates();

      expect(result.length).toBe(1);
      expect(result[0]).toBe('2026-06-08');
    });
  });

  // ================================================================
  // getUserStats
  // ================================================================
  describe('getUserStats', function () {
    it('retourne un objet vide si aucun log', function () {
      var logger = makeLogger();
      var result = logger.getUserStats(new Date('2026-06-08'));
      expect(result).toEqual({});
    });

    it('agrège les stats par utilisateur', function () {
      var logPath = '/fake/logs/2026-06-08.log';
      fileStore[logPath] =
        makeLogEntryWithDate('user1', 'page_view', {}, new Date('2026-06-08T10:00:00Z')) +
        makeLogEntryWithDate('user1', 'click', { url: '/galerie' }, new Date('2026-06-08T11:00:00Z')) +
        makeLogEntryWithDate('user1', 'page_view', { url: '/contact' }, new Date('2026-06-08T12:00:00Z'));

      var logger = makeLogger();
      var result = logger.getUserStats(new Date('2026-06-08'));

      var userStat = result['user1'];
      expect(userStat).toBeDefined();
      expect(userStat.userId).toBe('user1');
      expect(userStat.totalActions).toBe(3);
      expect(userStat.actions['page_view']).toBe(2);
      expect(userStat.actions['click']).toBe(1);
      expect(userStat.uniquePages).toEqual(['Unknown', '/galerie', '/contact']);
      expect(userStat.pageCount).toBe(3);
    });

    it('sépare les stats de plusieurs utilisateurs', function () {
      var logPath = '/fake/logs/2026-06-08.log';
      fileStore[logPath] =
        makeLogEntryWithDate('user1', 'page_view', {}, new Date('2026-06-08T10:00:00Z')) +
        makeLogEntryWithDate('user2', 'click', {}, new Date('2026-06-08T11:00:00Z')) +
        makeLogEntryWithDate('user1', 'form_submit', {}, new Date('2026-06-08T12:00:00Z'));

      var logger = makeLogger();
      var result = logger.getUserStats(new Date('2026-06-08'));

      expect(Object.keys(result).length).toBe(2);
      expect(result['user1'].totalActions).toBe(2);
      expect(result['user2'].totalActions).toBe(1);
    });

    it('enregistre la première et dernière action dans le temps', function () {
      var logPath = '/fake/logs/2026-06-08.log';
      fileStore[logPath] =
        makeLogEntryWithDate('user1', 'page_view', {}, new Date('2026-06-08T08:00:00Z')) +
        makeLogEntryWithDate('user1', 'click', {}, new Date('2026-06-08T09:00:00Z')) +
        makeLogEntryWithDate('user1', 'form_submit', {}, new Date('2026-06-08T10:00:00Z'));

      var logger = makeLogger();
      var result = logger.getUserStats(new Date('2026-06-08'));

      expect(result['user1'].firstAction).toBe('2026-06-08T08:00:00.000Z');
      expect(result['user1'].lastAction).toBe('2026-06-08T10:00:00.000Z');
    });
  });

  // ================================================================
  // getTopActions
  // ================================================================
  describe('getTopActions', function () {
    it('retourne les actions les plus fréquentes', function () {
      var logPath = '/fake/logs/2026-06-08.log';
      fileStore[logPath] =
        makeLogEntry('user1', 'page_view') +
        makeLogEntry('user2', 'page_view') +
        makeLogEntry('user3', 'page_view') +
        makeLogEntry('user1', 'click') +
        makeLogEntry('user2', 'click') +
        makeLogEntry('user3', 'form_submit');

      var logger = makeLogger();
      var result = logger.getTopActions(new Date('2026-06-08'));

      expect(result.length).toBe(3);
      expect(result[0]).toEqual({ action: 'page_view', count: 3 });
      expect(result[1]).toEqual({ action: 'click', count: 2 });
      expect(result[2]).toEqual({ action: 'form_submit', count: 1 });
    });

    it('respecte la limite demandée', function () {
      var logPath = '/fake/logs/2026-06-08.log';
      fileStore[logPath] =
        makeLogEntry('user1', 'a') +
        makeLogEntry('user2', 'b') +
        makeLogEntry('user3', 'c') +
        makeLogEntry('user4', 'd');

      var logger = makeLogger();
      var result = logger.getTopActions(new Date('2026-06-08'), 2);

      expect(result.length).toBe(2);
    });

    it('retourne un tableau vide si aucun log', function () {
      var logger = makeLogger();
      var result = logger.getTopActions(new Date('2026-06-08'));
      expect(result).toEqual([]);
    });

    it('limite par défaut à 10', function () {
      var logPath = '/fake/logs/2026-06-08.log';
      var i;
      for (i = 0; i < 15; i++) {
        fileStore[logPath] = (fileStore[logPath] || '') +
          makeLogEntry('user' + i, 'action' + i);
      }

      var logger = makeLogger();
      var result = logger.getTopActions(new Date('2026-06-08'));
      expect(result.length).toBe(10);
    });
  });

  // ================================================================
  // getTrafficSources
  // ================================================================
  describe('getTrafficSources', function () {
    it('retourne les sources de trafic agrégées', function () {
      var logPath = '/fake/logs/2026-06-08.log';
      fileStore[logPath] =
        makeLogEntry('user1', 'landing', { extraData: { trafficSource: { utm_source: 'instagram', utm_medium: 'social', utm_campaign: 'spring2026' } } }) +
        makeLogEntry('user2', 'landing', { extraData: { trafficSource: { utm_source: 'instagram', utm_medium: 'social' } } }) +
        makeLogEntry('user3', 'landing', { extraData: { trafficSource: { utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'ads1' } } });

      var logger = makeLogger();
      var result = logger.getTrafficSources(new Date('2026-06-08'));

      expect(result.sources.length).toBe(2);
      expect(result.sources[0]).toEqual({ source: 'instagram', count: 2 });
      expect(result.sources[1]).toEqual({ source: 'google', count: 1 });

      expect(result.details['instagram']).toBeDefined();
      expect(result.details['instagram'].campaigns).toEqual(['spring2026']);
      expect(result.details['instagram'].mediums).toEqual(['social']);
      expect(result.details['instagram'].users).toEqual(['user1', 'user2']);
      expect(result.details['instagram'].count).toBe(2);
    });

    it('utilise le champ ref comme source', function () {
      var logPath = '/fake/logs/2026-06-08.log';
      fileStore[logPath] =
        makeLogEntry('user1', 'landing', { extraData: { trafficSource: { ref: 'summer2025' } } });

      var logger = makeLogger();
      var result = logger.getTrafficSources(new Date('2026-06-08'));

      expect(result.sources[0].source).toBe('summer2025');
      expect(result.sources[0].count).toBe(1);
    });

    it('utilise trafficSource.source comme source principale', function () {
      var logPath = '/fake/logs/2026-06-08.log';
      fileStore[logPath] =
        makeLogEntry('user1', 'landing', { extraData: { trafficSource: { source: 'newsletter' } } });

      var logger = makeLogger();
      var result = logger.getTrafficSources(new Date('2026-06-08'));

      expect(result.sources[0].source).toBe('newsletter');
    });

    it('retourne \'direct\' si aucune source n\'est présente', function () {
      var logPath = '/fake/logs/2026-06-08.log';
      fileStore[logPath] =
        makeLogEntry('user1', 'landing', { extraData: { trafficSource: {} } });

      var logger = makeLogger();
      var result = logger.getTrafficSources(new Date('2026-06-08'));

      expect(result.sources[0].source).toBe('direct');
    });

    it('retourne des objets vides si aucun log n\'a de trafficSource', function () {
      var logPath = '/fake/logs/2026-06-08.log';
      fileStore[logPath] =
        makeLogEntry('user1', 'page_view') +
        makeLogEntry('user2', 'click');

      var logger = makeLogger();
      var result = logger.getTrafficSources(new Date('2026-06-08'));

      expect(result.sources).toEqual([]);
      expect(result.details).toEqual({});
    });
  });

  // ================================================================
  // cleanOldLogs
  // ================================================================
  describe('cleanOldLogs', function () {
    it('supprime les logs plus anciens que maxDays', function () {
      fileStore['/fake/logs/2026-05-31.log'] = 'old log';
      fileStore['/fake/logs/2026-06-08.log'] = 'recent log';

      var logger = makeLogger();
      logger.cleanOldLogs(7);

      expect(fileStore['/fake/logs/2026-05-31.log']).toBeUndefined();
      expect(fileStore['/fake/logs/2026-06-08.log']).toBeDefined();
    });

    it('conserve les logs exactement à maxDays jours', function () {
      fileStore['/fake/logs/2026-06-01.log'] = 'boundary log';

      var logger = makeLogger();
      logger.cleanOldLogs(7);

      expect(fileStore['/fake/logs/2026-06-01.log']).toBeDefined();
    });

    it('ignore les fichiers qui ne correspondent pas au pattern YYYY-MM-DD.log', function () {
      fileStore['/fake/logs/2025-01-01.log'] = 'old but valid pattern';
      fileStore['/fake/logs/log_2025-01-01.log'] = 'old wrong pattern';
      fileStore['/fake/logs/access.log'] = 'no date';

      var logger = makeLogger();
      logger.cleanOldLogs(7);

      expect(fileStore['/fake/logs/2025-01-01.log']).toBeUndefined();
      expect(fileStore['/fake/logs/log_2025-01-01.log']).toBeDefined();
      expect(fileStore['/fake/logs/access.log']).toBeDefined();
    });

    it('utilise maxDays=7 par défaut', function () {
      fileStore['/fake/logs/2026-05-31.log'] = '8 jours avant';
      fileStore['/fake/logs/2026-06-01.log'] = '7 jours avant exact';

      var logger = makeLogger();
      logger.cleanOldLogs();

      expect(fileStore['/fake/logs/2026-05-31.log']).toBeUndefined();
      expect(fileStore['/fake/logs/2026-06-01.log']).toBeDefined();
    });
  });

  // ================================================================
  // startPeriodicCleanup
  // ================================================================
  describe('startPeriodicCleanup', function () {
    afterEach(function () {
      jest.clearAllTimers();
      jest.clearAllMocks();
    });

    it('déclenche un nettoyage immédiat puis programme des intervalles', function () {
      fileStore['/fake/logs/2026-05-31.log'] = 'old log';
      fileStore['/fake/logs/2026-06-08.log'] = 'recent log';

      var logger = makeLogger();
      logger.startPeriodicCleanup(24, 7);

      // Le nettoyage immédiat doit avoir supprimé le vieux log
      expect(fileStore['/fake/logs/2026-05-31.log']).toBeUndefined();
      expect(fileStore['/fake/logs/2026-06-08.log']).toBeDefined();

      // Simuler l'écoulement du temps (24h + 1ms)
      jest.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);

      // Le nettoyage périodique s'est déclenché, le vieux log (encore présent)
      // ne devrait pas être réapparu — on vérifie juste l'état
      expect(fileStore['/fake/logs/2026-06-08.log']).toBeDefined();
    });

    it('utilise les valeurs par défaut: 24h et 7 jours', function () {
      fileStore['/fake/logs/2026-05-31.log'] = 'old log';

      var logger = makeLogger();
      logger.startPeriodicCleanup();

      // Nettoyage immédiat avec maxDays=7
      expect(fileStore['/fake/logs/2026-05-31.log']).toBeUndefined();
    });
  });

});
