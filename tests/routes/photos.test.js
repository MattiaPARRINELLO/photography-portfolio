var express = require('express');
var session = require('express-session');
var cookieParser = require('cookie-parser');

jest.mock('../../server/config', function () {
  return {
    getPaths: jest.fn().mockReturnValue({
      root: '/fake/root', pages: '/fake/pages', adminPages: '/fake/pages/admin',
      texts: '/fake/config/texts.json'
    }),
    getConfig: jest.fn().mockReturnValue({}),
    getPort: jest.fn().mockReturnValue(3000),
    adminPassword: 'test'
  };
});

jest.mock('fs', function () {
  var actual = jest.requireActual('fs');
  return Object.assign({}, actual, {
    existsSync: jest.fn().mockReturnValue(true),
    readFileSync: jest.fn().mockReturnValue('{}'),
    mkdirSync: jest.fn(),
    statSync: jest.fn().mockReturnValue({ size: 1024, mtime: new Date() }),
    promises: {
      readFile: jest.fn().mockResolvedValue('<html><head></head><body><!-- SEO_HERO_PLACEHOLDER --><!-- SEO_BOTTOM_PLACEHOLDER --><!-- SERVER_RENDERED_GALLERY --><!-- GALLERIES_LIST_PLACEHOLDER --><!-- GALLERY_HERO_PLACEHOLDER --><!-- GALLERY_DESCRIPTION_PLACEHOLDER --><!-- GALLERY_PHOTOS_PLACEHOLDER --><!-- META_PLACEHOLDER_END --></body></html>'),
      mkdir: jest.fn().mockResolvedValue(undefined),
      writeFile: jest.fn().mockResolvedValue(undefined),
      access: jest.fn().mockRejectedValue(new Error('not found')),
      stat: jest.fn().mockResolvedValue({ mtimeMs: Date.now(), size: 1024 })
    }
  });
});

jest.mock('../../server/utils/photoService', function () {
  return {
    getPhotosList: jest.fn().mockResolvedValue([
      { url: '/photos/p1.jpg', filename: 'p1.jpg', date: new Date('2025-06-01'), dateSource: 'exif' },
      { url: '/photos/p2.jpg', filename: 'p2.jpg', date: new Date('2025-05-01'), dateSource: 'exif' },
      { url: '/photos/p3.jpg', filename: 'p3.jpg', date: new Date('2025-04-01'), dateSource: 'exif' },
      { url: '/photos/p4.jpg', filename: 'p4.jpg', date: new Date('2025-03-01'), dateSource: 'exif' }
    ])
  };
});

jest.mock('../../server/utils/galleryService', function () {
  return {
    loadGalleries: jest.fn().mockReturnValue({ galleries: [] }),
    listGalleries: jest.fn().mockReturnValue([
      { id: 'g1', slug: 'concert-paris', title: 'Concert Paris', artist: 'Artiste1', venue: 'Salle1', date: '2025-01-01', description: 'Super concert', photos: ['p1.jpg', 'p2.jpg'], cover: 'p1.jpg', published: true },
      { id: 'g2', slug: 'festival-lyon', title: 'Festival Lyon', artist: 'Artiste2', venue: 'Salle2', date: '2025-02-01', description: '', photos: ['p3.jpg'], cover: null, published: true }
    ]),
    getGalleryBySlug: jest.fn().mockImplementation(function (slug) {
      if (slug === 'concert-paris') return { id: 'g1', slug: 'concert-paris', title: 'Concert Paris', artist: 'Artiste1', venue: 'Salle1', date: '2025-01-01', description: 'Super concert', photos: ['p1.jpg', 'p2.jpg'], cover: 'p1.jpg', published: true };
      if (slug === 'non-publiee') return { id: 'g3', slug: 'non-publiee', title: 'NP', photos: [], published: false };
      return null;
    }),
    getGalleryById: jest.fn().mockReturnValue(null)
  };
});

jest.mock('../../server/utils/textUtils', function () {
  return {
    loadTexts: jest.fn().mockReturnValue({ meta: { title: 'Portfolio Test', description: 'Description test', keywords: 'photo, concert', author: 'Mattia' } }),
    loadSeoData: jest.fn().mockReturnValue({}),
    injectMetaTags: jest.fn(function (html) { return html; }),
    generateSchemaJsonLd: jest.fn().mockReturnValue('')
  };
});

jest.mock('../../server/utils/linksService', function () {
  return {
    loadLinksConfig: jest.fn().mockReturnValue({
      profile: { name: 'Test', avatar: { url: '/a.png', enabled: true }, role: 'Photo', tagline: 'T' },
      links: [], appearance: { showWatermark: true }, seo: { title: 'SEO', description: 'Desc' }, event: { enabled: false }
    }),
    injectLinksData: jest.fn(function (html) { return html; })
  };
});

jest.mock('../../server/utils/campaignService', function () {
  return {
    processCampaignFromQuery: jest.fn().mockReturnValue(null),
    getUserCampaignInfo: jest.fn().mockReturnValue(null)
  };
});

var pagesRouter = require('../../server/routes/pages');

function makeApp() {
  var app = express();
  app.use(cookieParser());
  app.use(session({ secret: 'test-secret', resave: false, saveUninitialized: true, cookie: { secure: false } }));
  app.use('/', pagesRouter);
  return app;
}

describe('Routes pages publiques', function () {
  var supertest;
  beforeAll(function () { supertest = require('supertest'); });
  beforeEach(function () { jest.clearAllMocks(); });

  describe('GET / (accueil)', function () {
    it('retourne la page d accueil en HTML', function (done) {
      supertest(makeApp()).get('/').expect(200).end(function (err, res) {
        if (err) return done(err);
        expect(res.text).toContain('<html>');
        done();
      });
    });
  });

  describe('GET /contact', function () {
    it('retourne la page contact', function (done) {
      supertest(makeApp()).get('/contact').expect(200).end(function (err, res) {
        if (err) return done(err);
        expect(res.text).toContain('<html>');
        done();
      });
    });
  });

  describe('GET /a-propos', function () {
    it('retourne la page a propos', function (done) {
      supertest(makeApp()).get('/a-propos').expect(200).end(function (err, res) {
        if (err) return done(err);
        expect(res.text).toContain('<html>');
        done();
      });
    });
  });

  describe('GET /links', function () {
    it('retourne la page links', function (done) {
      supertest(makeApp()).get('/links').expect(200).end(function (err) { done(err); });
    });
  });

  describe('GET /mentions-legales', function () {
    it('retourne un statut valide pour la page mentions legales', function (done) {
      supertest(makeApp()).get('/mentions-legales').end(function (err, res) {
        if (err) return done(err);
        expect([200, 404]).toContain(res.status);
        done();
      });
    });
  });

  describe('GET /portfolio', function () {
    it('redirige vers /', function (done) {
      supertest(makeApp()).get('/portfolio').expect(301).end(done);
    });
  });

  describe('GET /texts.json', function () {
    it('retourne les textes en JSON', function (done) {
      supertest(makeApp()).get('/texts.json').expect(200).end(function (err, res) {
        if (err) return done(err);
        expect(res.body).toBeDefined();
        done();
      });
    });
  });

  describe('GET /galeries', function () {
    it('retourne la liste des galeries', function (done) {
      supertest(makeApp()).get('/galeries').expect(200).end(function (err, res) {
        if (err) return done(err);
        expect(res.text).toContain('<html>');
        done();
      });
    });
  });

  describe('GET /galeries/:slug', function () {
    it('retourne une galerie existante', function (done) {
      supertest(makeApp()).get('/galeries/concert-paris').expect(200).end(function (err, res) {
        if (err) return done(err);
        expect(res.text).toContain('<html>');
        done();
      });
    });
    it('retourne 404 si galerie non trouvee', function (done) {
      supertest(makeApp()).get('/galeries/inexistante').expect(404).end(done);
    });
    it('retourne 404 si galerie non publiee', function (done) {
      supertest(makeApp()).get('/galeries/non-publiee').expect(404).end(done);
    });
  });

  describe('GET /sitemap.xml', function () {
    it('retourne un XML valide', function (done) {
      supertest(makeApp()).get('/sitemap.xml').expect(200).end(function (err, res) {
        if (err) return done(err);
        expect(res.text).toContain('<?xml');
        expect(res.text).toContain('<urlset');
        expect(res.text).toContain('<url>');
        done();
      });
    });
  });
});
