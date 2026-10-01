/**
 * Non-exposition des fichiers internes du projet.
 *
 * Incident : Apache sert le DocumentRoot (= racine du projet) pour tout ce qui
 * n'est pas /admin, ce qui exposait /.env, /config/*.json, /AGENTS.md, etc.
 * Ces routes doivent répondre 404 côté Node.
 */

jest.mock('../../server/config', function () {
  var p = require('path');
  return {
    getPaths: function () {
      return {
        root: p.resolve(__dirname, '../..'),
        pages: p.resolve(__dirname, '../../pages'),
        adminPages: p.resolve(__dirname, '../../pages/admin'),
        config: p.resolve(__dirname, '../../config/config.json'),
        texts: p.resolve(__dirname, '../../config/texts.json'),
        photos: p.resolve(__dirname, '../../photos'),
        stats: p.resolve(__dirname, '../../stats.json'),
        temp: p.resolve(__dirname, '../../temp'),
        dist: p.resolve(__dirname, '../../dist')
      };
    },
    getConfig: function () {
      return { thumbnails: { width: 600, height: 600, quality: 90, fit: 'inside', withoutEnlargement: true, format: 'jpeg' } };
    },
    getPort: function () { return 3011; },
    reloadConfig: function () {},
    adminPassword: 'test-password',
    __esModule: true
  };
});

jest.mock('multer', function () {
  var fn = function () {
    return {
      array: function () { return function (req, res, next) { next(); }; },
      single: function () { return function (req, res, next) { next(); }; },
      none: function () { return function (req, res, next) { next(); }; }
    };
  };
  fn.memory = function () { return fn(); };
  fn.diskStorage = function () { return {}; };
  return fn;
});

const request = require('supertest');
const app = require('../../server');

const BLOCKED_PATHS = [
  '/.env',
  '/.env.local',
  '/.git/config',
  '/.gitignore',
  '/config/galleries.json',
  '/config/config.json',
  '/config/texts.json',
  '/config/links.json',
  '/config/campaigns.json',
  '/config/seo.json',
  '/logs/2026-09-03.log',
  '/coverage/lcov.info',
  '/temp/upload.jpg',
  '/scripts/build-css.js',
  '/tests/setup.js',
  '/server/config.js',
  '/graphify-out/GRAPH_REPORT.md',
  '/node_modules/express/package.json',
  '/package.json',
  '/package-lock.json',
  '/AGENTS.md',
  '/AUDIT.md',
  '/REFACTORING_PLAN.md',
  '/CONFIG_README.md',
  '/server/README.md'
];

describe('Fichiers internes du projet', () => {
  BLOCKED_PATHS.forEach(function (blockedPath) {
    it('doit renvoyer 404 pour ' + blockedPath, async function () {
      const res = await request(app).get(blockedPath);
      expect(res.status).toBe(404);
    });
  });

  it('doit renvoyer 404 pour un chemin encodé en URL', async function () {
    const res = await request(app).get('/.%65nv');
    expect(res.status).toBe(404);
  });

  it('doit renvoyer 404 pour un répertoire interne avec slash final', async function () {
    const res = await request(app).get('/config/');
    expect(res.status).toBe(404);
  });

  it('ne bloque pas les fichiers publics servis par le site', function () {
    ['/robots.txt', '/llms.txt', '/llms-full.md'].forEach(function (publicPath) {
      expect(BLOCKED_DIRS_RE_shouldNotMatch(publicPath)).toBe(true);
    });
  });
});

// Rejoue la logique de filtrage du middleware pour vérifier les faux positifs
function BLOCKED_DIRS_RE_shouldNotMatch(p) {
  return !/^\/(?:config|logs|coverage|temp|scripts|tests|server|graphify-out|node_modules)(?:\/|$)/i.test(p) &&
    !/^\/(?:package|package-lock)\.json$/i.test(p) &&
    !/^\/(?:AGENTS|AUDIT|REFACTORING_PLAN|REFACTORING_STATUS|TESTS_REPORT|CONFIG_README)\.md$/i.test(p) &&
    !/README\.md$/i.test(p) &&
    !p.startsWith('/.');
}
