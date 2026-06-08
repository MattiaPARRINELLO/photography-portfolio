var path = require('path');
var fs = require('fs');

// =============================================================================
// Helpers pour cloner les middlewares de server.js en unités testables
// =============================================================================

function createPrecompressedMiddleware(fsMock, pathMock, rootPath) {
  return function (req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    var assetExt = req.path.split('.').pop();
    var serveExts = ['js', 'css', 'png', 'jpg', 'jpeg', 'webp', 'avif', 'svg', 'json', 'html'];
    if (serveExts.indexOf(assetExt) === -1) return next();

    var acceptEnc = req.headers['accept-encoding'] || '';
    var tryBrotli = acceptEnc.indexOf('br') !== -1;
    var tryGzip = acceptEnc.indexOf('gzip') !== -1;

    var fileOnDisk = pathMock.join(rootPath, decodeURIComponent(req.path));
    if (req.path.charAt(req.path.length - 1) === '/') return next();

    if (tryBrotli) {
      var brPath = fileOnDisk + '.br';
      if (fsMock.existsSync(brPath)) {
        res.setHeader('Content-Encoding', 'br');
        if (/\.js$/.test(req.path)) res.setHeader('Content-Type', 'application/javascript');
        else if (/\.css$/.test(req.path)) res.setHeader('Content-Type', 'text/css');
        else if (/\.svg$/.test(req.path)) res.setHeader('Content-Type', 'image/svg+xml');
        else if (/\.json$/.test(req.path)) res.setHeader('Content-Type', 'application/json');
        else if (/\.html$/.test(req.path)) res.setHeader('Content-Type', 'text/html; charset=utf-8');
        else if (/\.(png|jpe?g|webp|avif)$/.test(req.path)) res.setHeader('Content-Type', 'image/*');
        res.setHeader('Vary', 'Accept-Encoding');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.sendFile(brPath);
      }
    }

    if (tryGzip) {
      var gzPath = fileOnDisk + '.gz';
      if (fsMock.existsSync(gzPath)) {
        res.setHeader('Content-Encoding', 'gzip');
        if (/\.js$/.test(req.path)) res.setHeader('Content-Type', 'application/javascript');
        else if (/\.css$/.test(req.path)) res.setHeader('Content-Type', 'text/css');
        else if (/\.svg$/.test(req.path)) res.setHeader('Content-Type', 'image/svg+xml');
        else if (/\.json$/.test(req.path)) res.setHeader('Content-Type', 'application/json');
        else if (/\.html$/.test(req.path)) res.setHeader('Content-Type', 'text/html; charset=utf-8');
        else if (/\.(png|jpe?g|webp|avif)$/.test(req.path)) res.setHeader('Content-Type', 'image/*');
        res.setHeader('Vary', 'Accept-Encoding');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.sendFile(gzPath);
      }
    }

    return next();
  };
}

function createStaticSetHeaders() {
  return function (res, filePath) {
    if (filePath.indexOf('/admin/') !== -1) {
      res.setHeader('Cache-Control', 'no-store');
      return;
    }

    if (/\.html?$/.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return;
    }

    if (/\.(js|css)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return;
    }

    if (/\.(png|jpe?g|webp|avif|svg|gif|ico|ttf|woff2?)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return;
    }

    res.setHeader('Cache-Control', 'public, max-age=86400');
  };
}

// =============================================================================
// Tests : Middleware de fichiers pré-compressés (.br / .gz)
// =============================================================================

describe('Pre-compressed Assets Middleware', function () {
  var fileStore;
  var fsMock;
  var pathMock;
  var rootPath;
  var middleware;

  beforeEach(function () {
    fileStore = {};

    fsMock = {
      existsSync: function (p) {
        return fileStore.hasOwnProperty(p);
      }
    };

    rootPath = '/fake/root';

    pathMock = {
      join: function (root, p) {
        return root + p;
      }
    };

    middleware = createPrecompressedMiddleware(fsMock, pathMock, rootPath);
  });

  // --- Helper pour construire req/res/next mockés ---
  function reqResNext(opts) {
    var o = opts || {};
    return {
      req: Object.assign({
        method: 'GET',
        path: '/dist/js/app.js',
        headers: {},
        // minimal IncomingMessage shape for decodeURIComponent(req.path)
      }, o.reqOverrides || {}),
      res: {
        setHeader: jest.fn(),
        sendFile: jest.fn()
      },
      next: jest.fn()
    };
  }

  // 1. Non-GET/HEAD methods → next()
  it('ignore les methodes autres que GET et HEAD', function () {
    var mocks = reqResNext({ reqOverrides: { method: 'POST' } });
    middleware(mocks.req, mocks.res, mocks.next);
    expect(mocks.next).toHaveBeenCalled();
    expect(mocks.res.setHeader).not.toHaveBeenCalled();
  });

  // 2. No asset extension → next()
  it('ignore les chemins sans extension serviable', function () {
    var mocks = reqResNext({ reqOverrides: { path: '/api/test' } });
    middleware(mocks.req, mocks.res, mocks.next);
    expect(mocks.next).toHaveBeenCalled();
    expect(mocks.res.setHeader).not.toHaveBeenCalled();
  });

  // 3. Path ending with / → next()
  it('ignore les chemins terminant par un slash', function () {
    var mocks = reqResNext({ reqOverrides: { path: '/dist/js/' } });
    middleware(mocks.req, mocks.res, mocks.next);
    expect(mocks.next).toHaveBeenCalled();
    expect(mocks.res.setHeader).not.toHaveBeenCalled();
  });

  // 4. Accept-Encoding: br → serves .br file if exists
  it('sert le fichier brotli quand accept-encoding contient br et le .br existe', function () {
    fileStore['/fake/root/dist/js/app.js.br'] = true;
    var mocks = reqResNext({
      reqOverrides: {
        path: '/dist/js/app.js',
        headers: { 'accept-encoding': 'br' }
      }
    });
    middleware(mocks.req, mocks.res, mocks.next);
    expect(mocks.res.setHeader).toHaveBeenCalledWith('Content-Encoding', 'br');
    expect(mocks.res.sendFile).toHaveBeenCalledWith('/fake/root/dist/js/app.js.br');
    expect(mocks.next).not.toHaveBeenCalled();
  });

  // 5. Accept-Encoding: gzip → serves .gz file if exists
  it('sert le fichier gzip quand accept-encoding contient gzip et le .gz existe', function () {
    fileStore['/fake/root/dist/css/output.css.gz'] = true;
    var mocks = reqResNext({
      reqOverrides: {
        path: '/dist/css/output.css',
        headers: { 'accept-encoding': 'gzip' }
      }
    });
    middleware(mocks.req, mocks.res, mocks.next);
    expect(mocks.res.setHeader).toHaveBeenCalledWith('Content-Encoding', 'gzip');
    expect(mocks.res.sendFile).toHaveBeenCalledWith('/fake/root/dist/css/output.css.gz');
    expect(mocks.next).not.toHaveBeenCalled();
  });

  // 6. Accept-Encoding: br → brotli file NOT found → tries gzip (fallback)
  it('fallback sur gzip quand accept-encoding contient br+gzip et .br inexistant', function () {
    fileStore['/fake/root/dist/js/bundle.js.gz'] = true;
    var mocks = reqResNext({
      reqOverrides: {
        path: '/dist/js/bundle.js',
        headers: { 'accept-encoding': 'br, gzip' }
      }
    });
    middleware(mocks.req, mocks.res, mocks.next);
    expect(mocks.res.setHeader).toHaveBeenCalledWith('Content-Encoding', 'gzip');
    expect(mocks.res.sendFile).toHaveBeenCalledWith('/fake/root/dist/js/bundle.js.gz');
    expect(mocks.next).not.toHaveBeenCalled();
  });

  // 7. Brotli sets correct Content-Type for JS
  it('definit le Content-Type application/javascript pour les fichiers .js en brotli', function () {
    fileStore['/fake/root/dist/js/app.js.br'] = true;
    var mocks = reqResNext({
      reqOverrides: {
        path: '/dist/js/app.js',
        headers: { 'accept-encoding': 'br' }
      }
    });
    middleware(mocks.req, mocks.res, mocks.next);
    expect(mocks.res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/javascript');
  });

  // 8. Brotli sets correct Content-Type for CSS
  it('definit le Content-Type text/css pour les fichiers .css en brotli', function () {
    fileStore['/fake/root/dist/css/output.css.br'] = true;
    var mocks = reqResNext({
      reqOverrides: {
        path: '/dist/css/output.css',
        headers: { 'accept-encoding': 'br' }
      }
    });
    middleware(mocks.req, mocks.res, mocks.next);
    expect(mocks.res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/css');
  });

  // 9. Brotli sets correct Content-Type for images (png/jpg/webp/avif)
  it('definit le Content-Type image/* pour les fichiers image en brotli', function () {
    fileStore['/fake/root/photos/photo.png.br'] = true;
    var mocks = reqResNext({
      reqOverrides: {
        path: '/photos/photo.png',
        headers: { 'accept-encoding': 'br' }
      }
    });
    middleware(mocks.req, mocks.res, mocks.next);
    expect(mocks.res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/*');
  });

  // 10. Brotli sets correct Content-Type for SVG
  it('definit le Content-Type image/svg+xml pour les fichiers .svg en brotli', function () {
    fileStore['/fake/root/icons/star.svg.br'] = true;
    var mocks = reqResNext({
      reqOverrides: {
        path: '/icons/star.svg',
        headers: { 'accept-encoding': 'br' }
      }
    });
    middleware(mocks.req, mocks.res, mocks.next);
    expect(mocks.res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/svg+xml');
  });

  // 11. Brotli sets correct Content-Type for JSON
  it('definit le Content-Type application/json pour les fichiers .json en brotli', function () {
    fileStore['/fake/root/manifest.json.br'] = true;
    var mocks = reqResNext({
      reqOverrides: {
        path: '/manifest.json',
        headers: { 'accept-encoding': 'br' }
      }
    });
    middleware(mocks.req, mocks.res, mocks.next);
    expect(mocks.res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
  });

  // 12. Neither br nor gzip accepted → next()
  it('passe au middleware suivant quand ni br ni gzip sont acceptes', function () {
    var mocks = reqResNext({
      reqOverrides: {
        path: '/dist/js/app.js',
        headers: { 'accept-encoding': 'identity' }
      }
    });
    middleware(mocks.req, mocks.res, mocks.next);
    expect(mocks.next).toHaveBeenCalled();
    expect(mocks.res.sendFile).not.toHaveBeenCalled();
  });

  // --- Cas supplémentaires pour la robustesse ---

  it('definit Vary et Cache-Control pour les reponses brotli', function () {
    fileStore['/fake/root/dist/js/app.js.br'] = true;
    var mocks = reqResNext({
      reqOverrides: {
        path: '/dist/js/app.js',
        headers: { 'accept-encoding': 'br' }
      }
    });
    middleware(mocks.req, mocks.res, mocks.next);
    expect(mocks.res.setHeader).toHaveBeenCalledWith('Vary', 'Accept-Encoding');
    expect(mocks.res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=31536000, immutable');
  });

  it('definit Vary et Cache-Control pour les reponses gzip', function () {
    fileStore['/fake/root/dist/css/output.css.gz'] = true;
    var mocks = reqResNext({
      reqOverrides: {
        path: '/dist/css/output.css',
        headers: { 'accept-encoding': 'gzip' }
      }
    });
    middleware(mocks.req, mocks.res, mocks.next);
    expect(mocks.res.setHeader).toHaveBeenCalledWith('Vary', 'Accept-Encoding');
    expect(mocks.res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=31536000, immutable');
  });

  it('definit le Content-Type text/html pour les fichiers .html en gzip', function () {
    fileStore['/fake/root/index.html.gz'] = true;
    var mocks = reqResNext({
      reqOverrides: {
        path: '/index.html',
        headers: { 'accept-encoding': 'gzip' }
      }
    });
    middleware(mocks.req, mocks.res, mocks.next);
    expect(mocks.res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html; charset=utf-8');
  });

  it('passe au suivant si le fichier compresse n existe pas (br+gzip acceptes)', function () {
    var mocks = reqResNext({
      reqOverrides: {
        path: '/dist/js/missing.js',
        headers: { 'accept-encoding': 'br, gzip' }
      }
    });
    middleware(mocks.req, mocks.res, mocks.next);
    expect(mocks.next).toHaveBeenCalled();
    expect(mocks.res.sendFile).not.toHaveBeenCalled();
  });

  it('accepte la methode HEAD comme GET', function () {
    fileStore['/fake/root/dist/js/app.js.br'] = true;
    var mocks = reqResNext({
      reqOverrides: {
        method: 'HEAD',
        path: '/dist/js/app.js',
        headers: { 'accept-encoding': 'br' }
      }
    });
    middleware(mocks.req, mocks.res, mocks.next);
    expect(mocks.res.setHeader).toHaveBeenCalledWith('Content-Encoding', 'br');
    expect(mocks.res.sendFile).toHaveBeenCalledWith('/fake/root/dist/js/app.js.br');
  });
});

// =============================================================================
// Tests : setHeaders du middleware static d'Express
// =============================================================================

describe('Static Files setHeaders', function () {
  var setHeaders;

  beforeEach(function () {
    setHeaders = createStaticSetHeaders();
  });

  function makeRes() {
    return { setHeader: jest.fn() };
  }

  // 13. admin path → no-store
  it('bloque le cache (no-store) pour les fichiers dans /admin/', function () {
    var res = makeRes();
    setHeaders(res, '/fake/root/pages/admin/index.html');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('bloque le cache (no-store) pour les sous-dossiers de /admin/', function () {
    var res = makeRes();
    setHeaders(res, '/fake/root/pages/admin/partials/header.html');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  // 14. .html → no-cache, no-store, must-revalidate
  it('desactive le cache pour les fichiers .html', function () {
    var res = makeRes();
    setHeaders(res, '/fake/root/index.html');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache, no-store, must-revalidate');
  });

  // 15. .htm → no-cache, no-store, must-revalidate
  it('desactive le cache pour les fichiers .htm', function () {
    var res = makeRes();
    setHeaders(res, '/fake/root/old-page.htm');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache, no-store, must-revalidate');
  });

  // 16. .js → public, max-age=31536000, immutable
  it('definit un cache immutable pour les fichiers .js', function () {
    var res = makeRes();
    setHeaders(res, '/fake/root/dist/js/app.hash123.js');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=31536000, immutable');
  });

  // 17. .css → public, max-age=31536000, immutable
  it('definit un cache immutable pour les fichiers .css', function () {
    var res = makeRes();
    setHeaders(res, '/fake/root/dist/css/output.hash456.css');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=31536000, immutable');
  });

  // 18. .png → public, max-age=31536000, immutable
  it('definit un cache immutable pour les fichiers .png', function () {
    var res = makeRes();
    setHeaders(res, '/fake/root/photos/landscape.png');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=31536000, immutable');
  });

  // 19. .jpg/.jpeg → public, max-age=31536000, immutable
  it('definit un cache immutable pour les fichiers .jpg', function () {
    var res = makeRes();
    setHeaders(res, '/fake/root/photos/portrait.jpg');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=31536000, immutable');
  });

  it('definit un cache immutable pour les fichiers .jpeg', function () {
    var res = makeRes();
    setHeaders(res, '/fake/root/photos/portrait.jpeg');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=31536000, immutable');
  });

  // 20. .webp → public, max-age=31536000, immutable
  it('definit un cache immutable pour les fichiers .webp', function () {
    var res = makeRes();
    setHeaders(res, '/fake/root/photos/image.webp');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=31536000, immutable');
  });

  // 21. .svg → public, max-age=31536000, immutable
  it('definit un cache immutable pour les fichiers .svg', function () {
    var res = makeRes();
    setHeaders(res, '/fake/root/icons/logo.svg');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=31536000, immutable');
  });

  // 22. .woff2 → public, max-age=31536000, immutable
  it('definit un cache immutable pour les fichiers .woff2', function () {
    var res = makeRes();
    setHeaders(res, '/fake/root/fonts/open-sans.woff2');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=31536000, immutable');
  });

  it('definit un cache immutable pour les fichiers .woff', function () {
    var res = makeRes();
    setHeaders(res, '/fake/root/fonts/open-sans.woff');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=31536000, immutable');
  });

  it('definit un cache immutable pour les fichiers .avif', function () {
    var res = makeRes();
    setHeaders(res, '/fake/root/photos/modern.avif');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=31536000, immutable');
  });

  it('definit un cache immutable pour les fichiers .gif', function () {
    var res = makeRes();
    setHeaders(res, '/fake/root/anim/animation.gif');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=31536000, immutable');
  });

  it('definit un cache immutable pour les fichiers .ico', function () {
    var res = makeRes();
    setHeaders(res, '/fake/root/favicon.ico');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=31536000, immutable');
  });

  it('definit un cache immutable pour les fichiers .ttf', function () {
    var res = makeRes();
    setHeaders(res, '/fake/root/fonts/mono.ttf');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=31536000, immutable');
  });

  // 23. Default → public, max-age=86400
  it('definit un cache court par defaut (max-age=86400) pour les types non listes', function () {
    var res = makeRes();
    setHeaders(res, '/fake/root/data/document.pdf');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=86400');
  });

  it('definit un cache court par defaut pour les fichiers sans extension', function () {
    var res = makeRes();
    setHeaders(res, '/fake/root/random-file');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=86400');
  });

  // --- Verification que /admin/ a priorite sur l'extension ---
  it('applique no-store aux .html dans /admin/ (priorite admin sur extension)', function () {
    var res = makeRes();
    setHeaders(res, '/fake/root/pages/admin/dashboard.html');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('applique no-store aux .js dans /admin/ (priorite admin sur extension)', function () {
    var res = makeRes();
    setHeaders(res, '/fake/root/pages/admin/scripts.js');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });
});
