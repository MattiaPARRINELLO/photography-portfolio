var path = require('path');
var fileStore = {};

describe('ServerConfig', function () {
  var ROOT_DIR = path.resolve(__dirname, '../..');
  var CONFIG_DIR = path.join(ROOT_DIR, 'config');
  var CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
  var CONFIG_LOCAL_PATH = path.join(CONFIG_DIR, 'config.local.json');
  var CONFIG_EXAMPLE_PATH = path.join(CONFIG_DIR, 'config.json.example');
  var CONFIG_LOCAL_EXAMPLE_PATH = path.join(CONFIG_DIR, 'config.local.json.example');

  function seedFs() {
    jest.doMock('fs', function () {
      var actual = jest.requireActual('fs');
      return Object.assign({}, actual, {
        existsSync: jest.fn(function (p) { return fileStore[p] !== undefined; }),
        readFileSync: jest.fn(function (p, enc) {
          if (fileStore[p] !== undefined) return fileStore[p];
          throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        }),
        writeFileSync: jest.fn(function (p, d) { fileStore[p] = d; }),
        mkdirSync: jest.fn(),
        statSync: jest.fn(function () { return { size: 1024, mtime: new Date() }; })
      });
    });
  }

  function requireConfig() {
    return require(path.join(ROOT_DIR, 'server', 'config.js'));
  }

  beforeEach(function () {
    jest.resetModules();
    fileStore = {};
    delete process.env.CONFIG_FILE;
    delete process.env.PORT;
    delete process.env.ADMIN_PASSWORD;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.GMAIL_USER;
    delete process.env.GMAIL_PASS;
    delete process.env.IMAGE_SECRET_KEY;
    delete process.env.GMAIL_USER;
    delete process.env.GMAIL_PASS;
    seedFs();
  });

  it('getPaths returns correct paths', function () {
    fileStore[CONFIG_PATH] = JSON.stringify({});
    var cfg = requireConfig();
    var paths = cfg.getPaths();

    expect(paths.root).toBe(ROOT_DIR);
    expect(paths.config).toBe(CONFIG_PATH);
    expect(paths.photos).toBe(path.join(ROOT_DIR, 'photos'));
    expect(paths.pages).toBe(path.join(ROOT_DIR, 'pages'));
    expect(paths.adminPages).toBe(path.join(ROOT_DIR, 'pages', 'admin'));
    expect(paths.stats).toBe(path.join(ROOT_DIR, 'stats.json'));
    expect(paths.texts).toBe(path.join(CONFIG_DIR, 'texts.json'));
    expect(paths.temp).toBe(path.join(ROOT_DIR, 'temp'));
  });

  it('getConfig returns loaded config', function () {
    fileStore[CONFIG_PATH] = JSON.stringify({ siteName: 'Mon Portfolio' });
    var cfg = requireConfig();

    expect(cfg.getConfig().siteName).toBe('Mon Portfolio');
  });

  it('loads environment variables (ADMIN_PASSWORD, SMTP_*)', function () {
    process.env.ADMIN_PASSWORD = 'secret123';
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'user@test.com';
    process.env.SMTP_PASS = 'pass123';

    fileStore[CONFIG_PATH] = JSON.stringify({});
    var cfg = requireConfig();

    expect(cfg.adminPassword).toBe('secret123');
    expect(cfg.smtpHost).toBe('smtp.example.com');
    expect(cfg.smtpPort).toBe(587);
    expect(cfg.smtpUser).toBe('user@test.com');
    expect(cfg.smtpPass).toBe('pass123');
  });

  it('port defaults to 3000 when PORT env is not set', function () {
    fileStore[CONFIG_PATH] = JSON.stringify({});
    var cfg = requireConfig();

    expect(cfg.port).toBe(3000);
  });

  it('port uses PORT environment variable when set', function () {
    process.env.PORT = '8080';
    fileStore[CONFIG_PATH] = JSON.stringify({});
    var cfg = requireConfig();

    expect(cfg.port).toBe('8080');
  });

  it('shallow merges config.local.json over config.json', function () {
    fileStore[CONFIG_PATH] = JSON.stringify({ a: 1, b: 2, nested: { x: 1 } });
    fileStore[CONFIG_LOCAL_PATH] = JSON.stringify({ b: 3, c: 4, nested: { y: 2 } });
    var cfg = requireConfig();
    var config = cfg.getConfig();

    expect(config.a).toBe(1);
    expect(config.b).toBe(3);
    expect(config.c).toBe(4);
    expect(config.nested.y).toBe(2);
    expect(config.nested.x).toBeUndefined();
  });

  it('reloadConfig re-reads files and returns updated config', function () {
    fileStore[CONFIG_PATH] = JSON.stringify({ version: 1 });
    var cfg = requireConfig();
    expect(cfg.getConfig().version).toBe(1);

    fileStore[CONFIG_PATH] = JSON.stringify({ version: 2 });
    var result = cfg.reloadConfig();
    expect(result.version).toBe(2);
    expect(cfg.getConfig().version).toBe(2);
  });

  it('CONFIG_FILE env var takes absolute precedence', function () {
    process.env.CONFIG_FILE = '/custom/config.json';
    fileStore['/custom/config.json'] = JSON.stringify({ from: 'custom' });
    fileStore[CONFIG_PATH] = JSON.stringify({ from: 'default' });
    var cfg = requireConfig();

    expect(cfg.getConfig().from).toBe('custom');
  });

  it('falls back to config.json.example when config.json is missing', function () {
    fileStore[CONFIG_EXAMPLE_PATH] = JSON.stringify({ fromExample: true });
    var cfg = requireConfig();

    expect(cfg.getConfig().fromExample).toBe(true);
  });

  it('falls back to config.local.json.example for local overrides', function () {
    fileStore[CONFIG_PATH] = JSON.stringify({ base: 1, override: 'base' });
    fileStore[CONFIG_LOCAL_EXAMPLE_PATH] = JSON.stringify({ override: 'local' });
    var cfg = requireConfig();

    expect(cfg.getConfig().base).toBe(1);
    expect(cfg.getConfig().override).toBe('local');
  });

  it('uses default config when no files exist at all', function () {
    var cfg = requireConfig();
    var config = cfg.getConfig();

    expect(config.thumbnails).toBeDefined();
    expect(config.thumbnails.width).toBe(600);
    expect(config.thumbnails.height).toBe(600);
    expect(config.thumbnails.quality).toBe(90);
    expect(config.thumbnails.fit).toBe('inside');
    expect(config.thumbnails.withoutEnlargement).toBe(true);
    expect(config.thumbnails.format).toBe('jpeg');
  });

  it('SMTP port defaults to 465 when SMTP_PORT env is not set', function () {
    fileStore[CONFIG_PATH] = JSON.stringify({});
    var cfg = requireConfig();

    expect(cfg.smtpPort).toBe(465);
  });
});
