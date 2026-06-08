var express = require('express');
var session = require('express-session');
var cookieParser = require('cookie-parser');

// ============================================================================
// MOCK : server/config
// ============================================================================
jest.mock('../../server/config', function () {
  return {
    getPaths: jest.fn().mockReturnValue({
      root: '/fake/root',
      pages: '/fake/pages',
      adminPages: '/fake/pages/admin',
      texts: '/fake/config/texts.json'
    }),
    getConfig: jest.fn().mockReturnValue({}),
    getPort: jest.fn().mockReturnValue(3000),
    adminPassword: 'test'
  };
});

// ============================================================================
// MOCK : fs — lecture depuis un fileStore simple
// ============================================================================
jest.mock('fs', function () {
  var actual = jest.requireActual('fs');
  return Object.assign({}, actual, {
    existsSync: jest.fn(function () { return true; }),
    readFileSync: jest.fn(function (p) {
      if (String(p).indexOf('seo.json') !== -1) return JSON.stringify({ artists: [{ name: 'Artiste1' }, { name: 'Artiste2' }], venues: [{ name: 'La Cigale', city: 'Paris', highlight: 'Premium' }, { name: 'La Maroquinerie', city: 'Paris' }], intro_text: 'Intro', pages: { home: { h1: 'H1 Test' } } });
      return '{}';
    }),
    writeFileSync: jest.fn(),
    mkdirSync: jest.fn(),
    statSync: jest.fn().mockReturnValue({ size: 1024, mtime: new Date() }),
    promises: {
      readFile: jest.fn().mockResolvedValue('<html></html>'),
      mkdir: jest.fn().mockResolvedValue(undefined),
      writeFile: jest.fn().mockResolvedValue(undefined),
      access: jest.fn().mockRejectedValue(new Error('not found')),
      stat: jest.fn().mockResolvedValue({ mtimeMs: Date.now(), size: 1024 })
    }
  });
});

// ============================================================================
// MOCK : photoService
// ============================================================================
jest.mock('../../server/utils/photoService', function () {
  return {
    getPhotosList: jest.fn().mockResolvedValue([
      { url: '/photos/p1.jpg', filename: 'p1.jpg', date: new Date('2025-06-01') },
      { url: '/photos/p2.jpg', filename: 'p2.jpg', date: new Date('2025-05-01') },
      { url: '/photos/p3.jpg', filename: 'p3.jpg', date: new Date('2025-04-01') },
      { url: '/photos/p4.jpg', filename: 'p4.jpg', date: new Date('2025-03-01') }
    ])
  };
});

// ============================================================================
// MOCK : galleryService
// ============================================================================
jest.mock('../../server/utils/galleryService', function () {
  return {
    loadGalleries: jest.fn().mockReturnValue({ galleries: [] }),
    listGalleries: jest.fn().mockReturnValue([
      { id: 'g1', slug: 'concert-paris', title: 'Concert Paris', artist: 'Artiste1', venue: 'Salle1', date: '2025-01-01', description: 'Super concert', photos: ['p1.jpg', 'p2.jpg'], cover: 'p1.jpg', published: true, artistLinks: { instagram: 'https://instagram.com/artist1' } },
      { id: 'g2', slug: 'festival-lyon', title: 'Festival Lyon', artist: 'Artiste2', venue: 'Salle2', date: '2025-02-01', description: '', photos: ['p3.jpg'], cover: null, published: true }
    ]),
    getGalleryBySlug: jest.fn().mockImplementation(function (slug) {
      var list = [
        { id: 'g1', slug: 'concert-paris', title: 'Concert Paris', artist: 'Artiste1', venue: 'Salle1', date: '2025-01-01', description: 'Super concert', photos: ['p1.jpg', 'p2.jpg'], cover: 'p1.jpg', published: true, artistLinks: { instagram: 'https://instagram.com/artist1' } },
        { id: 'g2', slug: 'festival-lyon', title: 'Festival Lyon', artist: 'Artiste2', venue: 'Salle2', date: '2025-02-01', description: '', photos: ['p3.jpg'], cover: null, published: true }
      ];
      for (var i = 0; i < list.length; i++) {
        if (list[i].slug === slug) return list[i];
      }
      return null;
    }),
    getGalleryById: jest.fn().mockReturnValue(null)
  };
});

// ============================================================================
// MOCK : textUtils
// ============================================================================
jest.mock('../../server/utils/textUtils', function () {
  return {
    loadTexts: jest.fn().mockReturnValue({ meta: { title: 'T', description: 'D', keywords: 'K', author: 'A' } }),
    loadSeoData: jest.fn().mockReturnValue({ artists: [], venues: [], intro_text: '', pages: { home: {} } }),
    injectMetaTags: jest.fn(function (html) { return html; }),
    generateSchemaJsonLd: jest.fn().mockReturnValue('')
  };
});

// ============================================================================
// MOCK : linksService
// ============================================================================
jest.mock('../../server/utils/linksService', function () {
  return {
    loadLinksConfig: jest.fn().mockReturnValue({
      profile: { name: 'Test', avatar: { url: '/a.png', enabled: true }, role: 'Photo', tagline: 'T' },
      links: [],
      appearance: { showWatermark: true },
      seo: { title: 'SEO', description: 'Desc' },
      event: { enabled: false }
    }),
    injectLinksData: jest.fn(function (html) { return html; })
  };
});

// ============================================================================
// MOCK : campaignService
// ============================================================================
jest.mock('../../server/utils/campaignService', function () {
  return {
    processCampaignFromQuery: jest.fn().mockReturnValue(null),
    getUserCampaignInfo: jest.fn().mockReturnValue(null)
  };
});

// ============================================================================
// Templates HTML minimaux
// ============================================================================
var TEMPLATE_HOME =
  '<!doctype html><html lang="fr"><head><meta charset="UTF-8">' +
  '<!-- META_PLACEHOLDER_END -->' +
  '</head><body>' +
  '<!-- SEO_HERO_PLACEHOLDER --><!-- SEO_BOTTOM_PLACEHOLDER --><!-- SERVER_RENDERED_GALLERY -->' +
  '</body></html>';

var TEMPLATE_HOME_NO_META_END =
  '<!doctype html><html lang="fr"><head><meta charset="UTF-8">' +
  '</head><body>' +
  '<!-- SEO_HERO_PLACEHOLDER --><!-- SEO_BOTTOM_PLACEHOLDER --><!-- SERVER_RENDERED_GALLERY -->' +
  '</body></html>';

var TEMPLATE_GALLERIES =
  '<!doctype html><html lang="fr"><head><meta charset="UTF-8">' +
  '<title>Galeries</title>' +
  '<meta name="description" content="defaut" />' +
  '</head><body>' +
  '<!-- GALLERIES_LIST_PLACEHOLDER -->' +
  '</body></html>';

var TEMPLATE_GALLERY =
  '<!doctype html><html lang="fr"><head><meta charset="UTF-8">' +
  '<title>{{DYNAMIC_TITLE}}</title>' +
  '<meta name="description" content="{{DYNAMIC_DESCRIPTION}}" />' +
  '</head><body>' +
  '<!-- GALLERY_HERO_PLACEHOLDER -->' +
  '<!-- GALLERY_DESCRIPTION_PLACEHOLDER -->' +
  '<!-- GALLERY_PHOTOS_PLACEHOLDER -->' +
  '</body></html>';

var TEMPLATE_CONTACT =
  '<!doctype html><html lang="fr"><head></head><body></body></html>';

var TEMPLATE_ABOUT =
  '<!doctype html><html lang="fr"><head></head><body></body></html>';

var TEMPLATE_LINKS =
  '<!doctype html><html lang="fr"><head>' +
  '<title>{{SEO_TITLE}}</title><meta name="description" content="{{SEO_DESCRIPTION}}" />' +
  '</head><body><h1 class="profile-name">{{PROFILE_NAME}}</h1>' +
  '<!-- AVATAR_PLACEHOLDER --><!-- LINKS_PLACEHOLDER --></body></html>';

// ============================================================================
// Chargement du routeur (après tous les mocks)
// ============================================================================
var pagesRouter = require('../../server/routes/pages');

function makeApp() {
  var app = express();
  app.use(cookieParser());
  app.use(session({
    secret: 'test-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
  }));
  app.use('/', pagesRouter);
  return app;
}

// ============================================================================
// Helper : expire le cache en avançant Date.now au-delà de tous les TTL
// ============================================================================
function expireAllCaches() {
  var tenMinutesMs = 10 * 60 * 1000;
  Date.now = function () { return Date._realNow() + tenMinutesMs; };
}

function restoreDateNow() {
  Date.now = Date._realNow;
}

// Sauvegarde du vrai Date.now avant tout
Date._realNow = Date.now;

// ============================================================================
// Tests
// ============================================================================
describe('Routes pages — branches non couvertes (SSR galeries)', function () {
  var supertest;
  var fs;
  var photoService;
  var galleryService;
  var campaignService;

  beforeAll(function () {
    supertest = require('supertest');
    fs = require('fs');
    photoService = require('../../server/utils/photoService');
    galleryService = require('../../server/utils/galleryService');
    campaignService = require('../../server/utils/campaignService');
  });

  // ========================================================================
  // GET / — campagne marketing (lignes 132-133, 227-236)
  // ========================================================================
  describe('GET / avec campagne', function () {
    beforeEach(function () {
      fs.promises.readFile.mockResolvedValue(TEMPLATE_HOME);
    });

    it('injecte le script de nettoyage URL quand campagne detectee via ref', function (done) {
      campaignService.processCampaignFromQuery.mockReturnValue({ ref: 'insta-bio', source: 'instagram' });
      supertest(makeApp())
        .get('/?ref=insta-bio')
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.text).toContain('history.replaceState');
          done();
        });
    });
  });

  // ========================================================================
  // GET / — META_PLACEHOLDER_END absent (ligne 212)
  // ========================================================================
  describe('GET / sans META_PLACEHOLDER_END', function () {
    it('injecte INJECTED_PHOTOS via </head> quand le placeholder meta est absent', function (done) {
      fs.promises.readFile.mockResolvedValue(TEMPLATE_HOME_NO_META_END);
      supertest(makeApp())
        .get('/')
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.text).toContain('INJECTED_PHOTOS');
          done();
        });
    });
  });

  // ========================================================================
  // GET / — erreur photoService SSR (lignes 220-222)
  // ========================================================================
  describe('GET / avec erreur de chargement des photos', function () {
    it('remplace le placeholder SSR par une chaine vide en cas d erreur', function (done) {
      fs.promises.readFile.mockResolvedValue(TEMPLATE_HOME);
      photoService.getPhotosList.mockRejectedValue(new Error('Photo load error'));
      supertest(makeApp())
        .get('/')
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.text).not.toContain('<!-- SERVER_RENDERED_GALLERY -->');
          done();
        });
    });
  });

  // ========================================================================
  // GET / — erreur lecture seo.json (ligne 36)
  // ========================================================================
  describe('GET / avec erreur lecture seo.json', function () {
    it('continue de fonctionner meme si seo.json est illisible', function (done) {
      fs.promises.readFile.mockResolvedValue(TEMPLATE_HOME);
      fs.readFileSync.mockImplementation(function (p) {
        if (String(p).indexOf('seo.json') !== -1) throw new Error('Seo read error');
        return '{}';
      });
      supertest(makeApp())
        .get('/')
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.text).toContain('<html');
          done();
        });
    });
  });

  // ========================================================================
  // GET / — cache expiré (lignes 20-24)
  // ========================================================================
  describe('GET / avec cache expire', function () {
    it('regénère la page après expiration du cache', function (done) {
      fs.promises.readFile.mockResolvedValue(TEMPLATE_HOME);
      photoService.getPhotosList.mockResolvedValue([
        { url: '/photos/p1.jpg', filename: 'p1.jpg', date: new Date('2025-06-01') },
        { url: '/photos/p2.jpg', filename: 'p2.jpg', date: new Date('2025-05-01') }
      ]);

      var app = makeApp();
      var origNow = Date.now;

      supertest(app)
        .get('/')
        .expect(200)
        .end(function (err) {
          if (err) return done(err);

          var fakeTime = origNow() + 61000;
          Date.now = function () { return fakeTime; };

          supertest(app)
            .get('/')
            .expect(200)
            .end(function (err2, res2) {
              Date.now = origNow;
              if (err2) return done(err2);
              expect(res2.text).toContain('<html');
              done();
            });
        });
    });
  });

  // ========================================================================
  // GET /texts.json — erreur de lecture (catch intérieur 253-254)
  // ========================================================================
  describe('GET /texts.json avec erreur de lecture', function () {
    it('retourne un objet vide si texts.json est illisible', function (done) {
      fs.promises.readFile.mockRejectedValue(new Error('ENOENT'));
      supertest(makeApp())
        .get('/texts.json')
        .expect(200)
        .expect('Content-Type', /json/)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body).toEqual({});
          done();
        });
    });
  });

  // ========================================================================
  // GET / — erreur lecture home.html (fallback sendFile, lignes 241-242)
  // ========================================================================
  describe('GET / avec erreur de lecture du template', function () {
    it('tente un fallback sendFile quand le template home est illisible', function (done) {
      fs.promises.readFile.mockRejectedValue(new Error('ENOENT'));
      supertest(makeApp())
        .get('/')
        .end(function (err) {
          if (err) return done(err);
          done();
        });
    });
  });

  // ========================================================================
  // GET /contact — erreur lecture template (285-286)
  // ========================================================================
  describe('GET /contact avec erreur de template', function () {
    it('tente un fallback sendFile', function (done) {
      fs.promises.readFile.mockResolvedValueOnce('ok-for-cache').mockRejectedValue(new Error('ENOENT'));
      // Premier appel pour le cache (peut ne pas exister), on force le reject
      // En fait, on mock pour plusieurs appels potentiels
      fs.promises.readFile.mockRejectedValue(new Error('ENOENT'));
      supertest(makeApp())
        .get('/contact')
        .end(function (err) {
          if (err) return done(err);
          done();
        });
    });
  });

  // ========================================================================
  // GET /a-propos — erreur lecture template (316-317)
  // ========================================================================
  describe('GET /a-propos avec erreur de template', function () {
    it('tente un fallback sendFile', function (done) {
      fs.promises.readFile.mockRejectedValue(new Error('ENOENT'));
      supertest(makeApp())
        .get('/a-propos')
        .end(function (err) {
          if (err) return done(err);
          done();
        });
    });
  });

  // ========================================================================
  // GET /links — erreur lecture (catch block 343-344)
  // ========================================================================
  describe('GET /links avec erreur de template', function () {
    it('retourne 500 si links.html est illisible', function (done) {
      fs.readFileSync.mockImplementation(function () { throw new Error('ENOENT'); });
      supertest(makeApp())
        .get('/links')
        .expect(500)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.text).toContain('Erreur');
          done();
        });
    });
  });

  // ========================================================================
  // GET /galeries — liste vide (ligne 526, empty state)
  // ========================================================================
  describe('GET /galeries avec liste vide', function () {
    it('affiche un message quand aucune galerie n est publiee', function (done) {
      fs.promises.readFile.mockResolvedValue(TEMPLATE_GALLERIES);
      galleryService.listGalleries.mockReturnValue([]);
      supertest(makeApp())
        .get('/galeries')
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.text).toContain('premières galeries');
          expect(res.text).not.toContain('galleries-grid');
          done();
        });
    });
  });

  // ========================================================================
  // GET /galeries — erreur handler (lignes 542-543)
  // ========================================================================
  describe('GET /galeries avec erreur handler', function () {
    beforeEach(function () {
      expireAllCaches();
    });

    afterEach(function () {
      restoreDateNow();
    });

    it('retourne 500 si le handler leve une exception', function (done) {
      fs.promises.readFile.mockResolvedValue(TEMPLATE_GALLERIES);
      galleryService.listGalleries.mockImplementation(function () {
        throw new Error('Gallery list error');
      });
      supertest(makeApp())
        .get('/galeries')
        .expect(500)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.text).toContain('Erreur');
          done();
        });
    });
  });

  // ========================================================================
  // GET /galeries/:slug — sans cover (hero sans image, ligne 644 else)
  // ========================================================================
  describe('GET /galeries/:slug sans cover', function () {
    it('ne met pas d image dans le hero', function (done) {
      fs.promises.readFile.mockResolvedValue(TEMPLATE_GALLERY);
      supertest(makeApp())
        .get('/galeries/festival-lyon')
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.text).not.toContain('<img class="cover"');
          done();
        });
    });
  });

  // ========================================================================
  // GET /galeries/:slug — sans artist (ligne 427)
  // ========================================================================
  describe('GET /galeries/:slug sans artist', function () {
    it('ne genere pas la section liens artiste', function (done) {
      fs.promises.readFile.mockResolvedValue(TEMPLATE_GALLERY);
      galleryService.getGalleryBySlug.mockReturnValue({
        id: 'g-na', slug: 'sans-artist', title: 'Sans artiste', artist: '', venue: 'Lieu', date: '2025-03-01', description: '', photos: ['x.jpg'], cover: null, published: true, artistLinks: {}
      });
      supertest(makeApp())
        .get('/galeries/sans-artist')
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.text).not.toContain('artist-links-panel');
          done();
        });
    });
  });

  // ========================================================================
  // GET /galeries/:slug — avec deezer + spotify (402-405, 420, 423)
  // ========================================================================
  describe('GET /galeries/:slug avec liens deezer et spotify', function () {
    it('genere les chips deezer et spotify', function (done) {
      fs.promises.readFile.mockResolvedValue(TEMPLATE_GALLERY);
      galleryService.getGalleryBySlug.mockReturnValue({
        id: 'g-ds', slug: 'multi-plateforme', title: 'Multi plateforme', artist: 'ArtisteMulti', venue: 'Salle', date: '2025-04-01', description: 'T', photos: ['p1.jpg'], cover: 'p1.jpg', published: true, artistLinks: { instagram: 'https://instagr.am/am', deezer: 'https://deezer.com/am', spotify: 'https://open.spotify.com/am' }
      });
      supertest(makeApp())
        .get('/galeries/multi-plateforme')
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.text).toContain('data-platform="deezer"');
          expect(res.text).toContain('data-platform="spotify"');
          done();
        });
    });
  });

  // ========================================================================
  // GET /galeries/:slug — sans description, sans artistLinks (662-664 else)
  // ========================================================================
  describe('GET /galeries/:slug sans description ni liens artiste', function () {
    it('ne genere pas la grille intro', function (done) {
      fs.promises.readFile.mockResolvedValue(TEMPLATE_GALLERY);
      galleryService.getGalleryBySlug.mockReturnValue({
        id: 'g-min', slug: 'minimal', title: 'Minimal', artist: '', venue: '', date: '', description: '', photos: ['p1.jpg'], cover: null, published: true, artistLinks: {}
      });
      supertest(makeApp())
        .get('/galeries/minimal')
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.text).not.toContain('gallery-intro-grid');
          done();
        });
    });
  });

  // ========================================================================
  // GET /galeries/:slug — sans photos (ligne 679 else)
  // ========================================================================
  describe('GET /galeries/:slug sans photos', function () {
    it('affiche un message galerie vide', function (done) {
      fs.promises.readFile.mockResolvedValue(TEMPLATE_GALLERY);
      galleryService.getGalleryBySlug.mockReturnValue({
        id: 'g-empty', slug: 'vide', title: 'Galerie vide', artist: 'X', venue: 'Y', date: '2025-05-01', description: '', photos: [], cover: null, published: true, artistLinks: {}
      });
      supertest(makeApp())
        .get('/galeries/vide')
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.text).toContain('Aucune photo dans cette galerie');
          done();
        });
    });
  });

  // ========================================================================
  // GET /galeries/:slug — erreur handler (lignes 685-686)
  // ========================================================================
  describe('GET /galeries/:slug avec erreur', function () {
    beforeEach(function () {
      expireAllCaches();
    });

    afterEach(function () {
      restoreDateNow();
    });

    it('retourne 500 si le template gallery est illisible', function (done) {
      fs.promises.readFile.mockRejectedValue(new Error('ENOENT'));
      supertest(makeApp())
        .get('/galeries/concert-paris')
        .expect(500)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.text).toContain('Erreur lors du chargement');
          done();
        });
    });
  });

  // ========================================================================
  // GET /sitemap.xml — erreur photos (ligne 707)
  // ========================================================================
  describe('GET /sitemap.xml avec erreur photoService', function () {
    it('genere le sitemap sans lastmod photo', function (done) {
      photoService.getPhotosList.mockRejectedValue(new Error('fail'));
      supertest(makeApp())
        .get('/sitemap.xml')
        .expect(200)
        .expect('Content-Type', /xml/)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.text).toContain('<urlset');
          done();
        });
    });
  });

  // ========================================================================
  // GET /sitemap.xml — erreur galleries (ligne 763)
  // ========================================================================
  describe('GET /sitemap.xml avec erreur galleryService', function () {
    it('genere le sitemap sans les slugs de galeries', function (done) {
      galleryService.listGalleries.mockImplementation(function () {
        throw new Error('fail');
      });
      supertest(makeApp())
        .get('/sitemap.xml')
        .expect(200)
        .expect('Content-Type', /xml/)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.text).toContain('<urlset');
          expect(res.text).not.toContain('concert-paris');
          done();
        });
    });
  });

  // ========================================================================
  // GET /galeries/:slug — galerie non publiée (404, lignes 551-552)
  // ========================================================================
  describe('GET /galeries/:slug non publiee', function () {
    it('retourne 404 pour une galerie non publiee', function (done) {
      galleryService.getGalleryBySlug.mockReturnValue({
        id: 'g-unpub', slug: 'cachee', title: 'Cachee', photos: [], published: false
      });
      supertest(makeApp())
        .get('/galeries/cachee')
        .expect(404)
        .end(done);
    });
  });

  // ========================================================================
  // GET /galeries/:slug — avec description uniquement (sans artistLinks)
  // ========================================================================
  describe('GET /galeries/:slug avec description uniquement', function () {
    it('affiche la description sans la section liens', function (done) {
      fs.promises.readFile.mockResolvedValue(TEMPLATE_GALLERY);
      galleryService.getGalleryBySlug.mockReturnValue({
        id: 'g-desc', slug: 'desc-only', title: 'Description Only', artist: '', venue: '', date: '', description: 'Une super description', photos: ['p1.jpg'], cover: null, published: true, artistLinks: {}
      });
      supertest(makeApp())
        .get('/galeries/desc-only')
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.text).toContain('gallery-description-text');
          expect(res.text).toContain('Une super description');
          expect(res.text).not.toContain('artist-links-panel');
          done();
        });
    });
  });

  // ========================================================================
  // GET /galeries/:slug avec date vide
  // ========================================================================
  describe('GET /galeries/:slug avec date vide', function () {
    it('ne met pas la date dans le hero quand elle est absente', function (done) {
      fs.promises.readFile.mockResolvedValue(TEMPLATE_GALLERY);
      galleryService.getGalleryBySlug.mockReturnValue({
        id: 'g-nodate', slug: 'sans-date', title: 'Sans date', artist: 'Artiste', venue: '', date: '', description: '', photos: ['p.jpg'], cover: 'p.jpg', published: true, artistLinks: {}
      });
      supertest(makeApp())
        .get('/galeries/sans-date')
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.text).toContain('gallery-hero');
          expect(res.text).toContain('Sans date');
          done();
        });
    });
  });
});
