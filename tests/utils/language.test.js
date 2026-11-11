// SEO: la version française de / doit survivre à Accept-Language: en-US
// (Googlebot). Le canonical est une fonction de l'URL, pas de req.lang.
const languageMiddleware = require('../../server/middleware/language');
const textUtils = require('../../server/utils/textUtils');

function makeReq(overrides) {
  const req = {
    path: '/',
    query: {},
    cookies: {},
    headers: {},
    protocol: 'https',
    originalUrl: '/',
    get: function (name) { return /host/i.test(name) ? 'www.photo.mprnl.fr' : undefined; }
  };
  return Object.assign(req, overrides || {});
}

function makeRes() {
  const res = { cookies: [], cookie: jest.fn(function (name, value) { res.cookies.push([name, value]); }) };
  return res;
}

function run(req) {
  const res = makeRes();
  const next = jest.fn();
  languageMiddleware(req, res, next);
  return { res: res, next: next };
}

const FAKE_PAGE = `<!doctype html>
<html lang="fr">
  <head>
    <title>{{DYNAMIC_TITLE}}</title>
    <!-- META_PLACEHOLDER_END -->
  </head>
  <body></body>
</html>`;

function renderHtml(req) {
  return textUtils.injectMetaTags(FAKE_PAGE, {}, req, 'Portfolio', null);
}

function canonicalOf(html) {
  const m = html.match(/<link rel="canonical" href="([^"]+)"/);
  return m ? m[1] : null;
}

describe('Langue et canonical', function () {
  describe('languageMiddleware', function () {
    it('ignore Accept-Language et sert le français par défaut', function () {
      const req = makeReq({ headers: { 'accept-language': 'en-US,en;q=0.9' } });
      run(req);
      expect(req.lang).toBe('fr');
    });

    it('ne pose aucun cookie quand la langue vient de l en-tête', function () {
      const req = makeReq({ headers: { 'accept-language': 'en-US' } });
      const { res } = run(req);
      expect(res.cookie).not.toHaveBeenCalled();
    });

    it('sert l anglais avec ?lang=en et pose le cookie', function () {
      const req = makeReq({ query: { lang: 'en' } });
      const { res } = run(req);
      expect(req.lang).toBe('en');
      expect(res.cookies).toEqual([['lang', 'en']]);
    });

    it('sert l anglais avec le cookie seul', function () {
      const req = makeReq({ cookies: { lang: 'en' } });
      run(req);
      expect(req.lang).toBe('en');
    });

    it('donne la priorité à ?lang=fr sur le cookie en', function () {
      const req = makeReq({ query: { lang: 'fr' }, cookies: { lang: 'en' } });
      run(req);
      expect(req.lang).toBe('fr');
    });
  });

  describe('canonical', function () {
    it('rend / en français et canonise vers / avec Accept-Language: en-US', function () {
      const req = makeReq({ headers: { 'accept-language': 'en-US,en;q=0.9' } });
      run(req);
      const html = renderHtml(req);
      expect(html).toContain('<html lang="fr"');
      expect(canonicalOf(html)).toBe('https://www.photo.mprnl.fr/');
    });

    it('garde le canonical de / même si un cookie lang=en sert la page en anglais', function () {
      const req = makeReq({ cookies: { lang: 'en' } });
      run(req);
      const html = renderHtml(req);
      expect(html).toContain('<html lang="en"');
      expect(canonicalOf(html)).toBe('https://www.photo.mprnl.fr/');
    });

    it('canonise /?lang=en vers lui-même', function () {
      const req = makeReq({ query: { lang: 'en' } });
      run(req);
      const html = renderHtml(req);
      expect(html).toContain('<html lang="en"');
      expect(canonicalOf(html)).toBe('https://www.photo.mprnl.fr/?lang=en');
    });

    it('déclare les hreflang fr, en et x-default', function () {
      const req = makeReq();
      run(req);
      const html = renderHtml(req);
      expect(html).toContain('<link rel="alternate" hreflang="fr" href="https://www.photo.mprnl.fr/">');
      expect(html).toContain('<link rel="alternate" hreflang="en" href="https://www.photo.mprnl.fr/?lang=en">');
      expect(html).toContain('<link rel="alternate" hreflang="x-default" href="https://www.photo.mprnl.fr/">');
    });
  });
});
