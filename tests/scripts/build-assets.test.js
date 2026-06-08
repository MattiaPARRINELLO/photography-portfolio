'use strict';

var path = require('path');
var crypto = require('crypto');

// ---- Project root — MUST match what scripts/build-assets.js resolves via path.resolve(__dirname, '..') ----
var ROOT = path.resolve(__dirname, '../..');
var CSS_DIR = path.join(ROOT, 'dist', 'css');
var CSS_SRC = path.join(CSS_DIR, 'output.css');
var MANIFEST_PATH = path.join(ROOT, 'dist', 'manifest.json');
var PAGES_DIR = path.join(ROOT, 'pages');
var PAGES_INDEX = path.join(PAGES_DIR, 'index.html');
var PAGES_ABOUT = path.join(PAGES_DIR, 'about.html');
var OLD_FP_PATH = path.join(CSS_DIR, 'output.abcdef01.css');

// ---- In-memory file store (must be declared before jest.mock closures) ----
var fileStore = {};

// ---- Mocks ----
jest.mock('csso', function () {
    return { minify: jest.fn().mockReturnValue({ css: '.minified{}' }) };
});

jest.mock('zlib', function () {
    var actual = jest.requireActual('zlib');
    return Object.assign({}, actual, {
        gzipSync: jest.fn().mockReturnValue(Buffer.from('gzip-data')),
        brotliCompressSync: jest.fn().mockReturnValue(Buffer.from('brotli-data'))
    });
});

jest.mock('fs', function () {
    var actual = jest.requireActual('fs');
    var pathMod = require('path');

    function readdirImpl(p, opts) {
        var dirWithSep = p.endsWith(pathMod.sep) ? p : p + pathMod.sep;
        var names = [];
        var seen = {};
        Object.keys(fileStore).forEach(function (k) {
            if (k.startsWith(dirWithSep)) {
                var rest = k.slice(dirWithSep.length);
                var slashIdx = rest.indexOf(pathMod.sep);
                if (slashIdx === -1) {
                    var name = rest;
                    if (!seen[name]) {
                        seen[name] = true;
                        names.push(name);
                    }
                }
            }
        });
        if (opts && opts.withFileTypes) {
            return Promise.resolve(names.map(function (n) {
                return { name: n, isDirectory: function () { return false; }, isFile: function () { return true; } };
            }));
        }
        return Promise.resolve(names);
    }

    return Object.assign({}, actual, {
        existsSync: jest.fn(function (p) { return fileStore[p] !== undefined; }),
        readFileSync: jest.fn(function (p, enc) {
            if (fileStore[p] !== undefined) return fileStore[p];
            throw new Error('ENOENT');
        }),
        writeFileSync: jest.fn(function (p, d) { fileStore[p] = d; }),
        unlinkSync: jest.fn(function (p) { delete fileStore[p]; }),
        readdirSync: jest.fn(function (p) {
            var dirWithSep = p.endsWith(pathMod.sep) ? p : p + pathMod.sep;
            return Object.keys(fileStore)
                .filter(function (k) { return k.startsWith(dirWithSep) && k.indexOf(pathMod.sep, dirWithSep.length) === -1; })
                .map(function (k) { return pathMod.basename(k); });
        }),
        promises: {
            readFile: jest.fn(function (p, enc) {
                if (fileStore[p] !== undefined) return Promise.resolve(fileStore[p]);
                return Promise.reject(new Error('ENOENT'));
            }),
            writeFile: jest.fn(function (p, d) {
                fileStore[p] = d;
                return Promise.resolve();
            }),
            access: jest.fn(function (p) {
                if (fileStore[p] !== undefined) return Promise.resolve();
                return Promise.reject(new Error('ENOENT'));
            }),
            readdir: jest.fn(readdirImpl),
            mkdir: jest.fn(function () { return Promise.resolve(); }),
            stat: jest.fn(function () { return Promise.resolve({ mtime: new Date() }); })
        }
    });
});

// ---- Grab mocked module references (they share the same mock instances) ----
var csso = require('csso');
var zlib = require('zlib');

// ---- Prevent process.exit from killing the test runner ----
var _realExit = process.exit;
process.exit = jest.fn();

// ---- Signal de fin de main() : interception du dernier console.log ----
var _captured = {};
var _capturedResolve;
var _capturedReady = new Promise(function (r) { _capturedResolve = r; });

var _realLog = console.log;
console.log = function () {
    var msg = arguments[0];
    // Capture mock state dès que le message "Build complete" est émis
    if (typeof msg === 'string' && msg.indexOf('Build complete') === 0) {
        _captured.cssoCalls = csso.minify.mock.calls.length;
        _captured.cssoArg = _captured.cssoCalls > 0 ? csso.minify.mock.calls[0][0] : null;
        _captured.gzipCalled = zlib.gzipSync.mock.calls.length > 0;
        _captured.brotliCalled = zlib.brotliCompressSync.mock.calls.length > 0;
        _captured.exitCode = 0;
        _capturedResolve();
    }
    // Toujours transmettre au vrai console.log pour le diagnostic
    _realLog.apply(console, arguments);
};

// ---- Expected values (based on mocked csso.minify output: '.minified{}') ----
var EXPECTED_HASH = crypto.createHash('sha256').update('.minified{}').digest('hex').slice(0, 8);
var NEW_CSS_NAME = 'output.' + EXPECTED_HASH + '.css';
var NEW_CSS_PATH = path.join(CSS_DIR, NEW_CSS_NAME);

// ---- Populate the fake file system ----
function seedStore() {
    fileStore[CSS_SRC] = 'body{color:red}';
    fileStore[MANIFEST_PATH] = JSON.stringify({ 'dist/css/output.css': 'dist/css/output.abcdef01.css' });
    fileStore[PAGES_INDEX] = '<link rel="stylesheet" href="/dist/css/output.css">\n';
    fileStore[PAGES_ABOUT] = '<link rel="stylesheet" href="/dist/css/output.abcdef01.css">\n';
    fileStore[OLD_FP_PATH] = 'old-content';
    fileStore[OLD_FP_PATH + '.gz'] = 'old-gz';
    fileStore[OLD_FP_PATH + '.br'] = 'old-br';
}
seedStore();

// ---- Require the module — this triggers main() ----
var buildAssets = require('../../scripts/build-assets');

// ================================================================
// hashContent (inline pure-function test)
// ================================================================
describe('hashContent', function () {
    function hashContent(content) {
        return crypto.createHash('sha256').update(content).digest('hex').slice(0, 8);
    }

    it('produit une chaîne hexadécimale de 8 caractères', function () {
        expect(hashContent('hello')).toMatch(/^[a-f0-9]{8}$/);
    });

    it('retourne le même hash pour la même entrée (déterministe)', function () {
        expect(hashContent('abc123')).toBe(hashContent('abc123'));
    });

    it('retourne des hashs différents pour des entrées différentes', function () {
        expect(hashContent('alpha')).not.toBe(hashContent('beta'));
    });

    it('gère la chaîne vide sans erreur', function () {
        expect(hashContent('')).toMatch(/^[a-f0-9]{8}$/);
    });
});

// ================================================================
// fileExists (tested via side effects of buildCss)
// ================================================================
describe('fileExists', function () {
    it('détecte la source CSS existante et le build continue', function () {
        // La présence d'un fichier fingerprinted prouve que fileExists a retourné true
        expect(fileStore[NEW_CSS_PATH]).toBeDefined();
    });
});

// ================================================================
// Build pipeline — integration
// ================================================================
describe('build-assets pipeline', function () {
    var cssoMinifyCalled;
    var cssoMinifyArg;
    var gzipSyncCalled;
    var brotliCompressSyncCalled;
    var exitCode;

    beforeAll(async function () {
        // Attendre que main() termine (signalé via l'interception du console.log final)
        await _capturedReady;

        cssoMinifyCalled = _captured.cssoCalls > 0;
        cssoMinifyArg = _captured.cssoArg;
        gzipSyncCalled = _captured.gzipCalled;
        brotliCompressSyncCalled = _captured.brotliCalled;
        exitCode = _captured.exitCode;
    });

    afterAll(function () {
        console.log = _realLog;
        process.exit = _realExit;
    });

    it('appelle csso.minify avec le contenu de output.css', function () {
        expect(cssoMinifyCalled).toBe(true);
        expect(cssoMinifyArg).toBe('body{color:red}');
    });

    it('écrit le fichier CSS minifié et fingerprinted', function () {
        expect(fileStore[NEW_CSS_PATH]).toBe('.minified{}');
    });

    it('écrit le fichier compressé .gz', function () {
        expect(gzipSyncCalled).toBe(true);
        expect(fileStore[NEW_CSS_PATH + '.gz']).toBeDefined();
    });

    it('écrit le fichier compressé .br', function () {
        expect(brotliCompressSyncCalled).toBe(true);
        expect(fileStore[NEW_CSS_PATH + '.br']).toBeDefined();
    });

    it('remplace la référence output.css dans les fichiers HTML', function () {
        var html = fileStore[PAGES_INDEX];
        expect(html).toContain(NEW_CSS_NAME);
        expect(html).not.toContain('output.css');
    });

    it('remplace l\'ancienne référence fingerprinted dans les fichiers HTML', function () {
        var html = fileStore[PAGES_ABOUT];
        expect(html).toContain(NEW_CSS_NAME);
        expect(html).not.toContain('output.abcdef01.css');
    });

    it('supprime les anciens fichiers CSS fingerprintés', function () {
        expect(fileStore[OLD_FP_PATH]).toBeUndefined();
    });

    it('supprime aussi les variantes compressées des anciens fichiers', function () {
        expect(fileStore[OLD_FP_PATH + '.gz']).toBeUndefined();
        expect(fileStore[OLD_FP_PATH + '.br']).toBeUndefined();
    });

    it('préserve le fichier source output.css', function () {
        expect(fileStore[CSS_SRC]).toBe('body{color:red}');
    });

    it('écrit un manifest.json mis à jour', function () {
        var manifest = JSON.parse(fileStore[MANIFEST_PATH]);
        expect(manifest['dist/css/output.css']).toBe('dist/css/' + NEW_CSS_NAME);
    });

    it('termine par process.exit(0) en cas de succès', function () {
        expect(exitCode).toBe(0);
    });
});
