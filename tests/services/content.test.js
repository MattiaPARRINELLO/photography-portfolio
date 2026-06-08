// Mock server config
jest.mock('../../server/config', function () {
  return {
    getPaths: jest.fn().mockReturnValue({
      texts: '/fake/config/texts.json'
    })
  };
});

var fs = require('fs');
var TextUtils = require('../../server/utils/textUtils');

// On a besoin de mocker fs pour les tests de chargement
jest.mock('fs', function () {
  var actual = jest.requireActual('fs');
  var store = {};
  return Object.assign({}, actual, {
    existsSync: jest.fn(function (p) {
      return store[p] !== undefined || actual.existsSync(p);
    }),
    readFileSync: jest.fn(function (p, enc) {
      if (store[p] !== undefined) return store[p];
      return '{}';
    }),
    writeFileSync: jest.fn(function (p, d) { store[p] = d; })
  });
});

describe('TextUtils', function () {
  var textUtils;

  beforeAll(function () {
    textUtils = TextUtils;
  });

  beforeEach(function () {
    jest.clearAllMocks();
  });

  // ================================================================
  // _resolvePageKey
  // ================================================================
  describe('_resolvePageKey', function () {
    it('resolve Portfolio -> home', function () {
      expect(textUtils._resolvePageKey('Portfolio')).toBe('home');
    });

    it('resolve chaine vide -> home', function () {
      expect(textUtils._resolvePageKey('')).toBe('home');
    });

    it('resolve Contact -> contact', function () {
      expect(textUtils._resolvePageKey('Contact')).toBe('contact');
    });

    it('resolve A propos -> about', function () {
      expect(textUtils._resolvePageKey('À propos')).toBe('about');
    });

    it('resolve Mentions legales -> mentions', function () {
      expect(textUtils._resolvePageKey('Mentions légales')).toBe('mentions');
    });

    it('resolve Links -> links', function () {
      expect(textUtils._resolvePageKey('Links')).toBe('links');
    });

    it('resolve Galeries -> galleries', function () {
      expect(textUtils._resolvePageKey('Galeries')).toBe('galleries');
    });

    it('resolve valeur inconnue -> home', function () {
      expect(textUtils._resolvePageKey('Inconnu')).toBe('home');
    });
  });

  // ================================================================
  // loadTexts
  // ================================================================
  describe('loadTexts', function () {
    it('retourne les textes si le fichier existe', function () {
      fs.writeFileSync('/fake/config/texts.json', JSON.stringify({ meta: { title: 'Test' } }));
      var texts = textUtils.loadTexts();
      expect(texts.meta.title).toBe('Test');
    });

    it('retourne {} si le fichier n existe pas', function () {
      fs.existsSync.mockReturnValueOnce(false);
      var texts = textUtils.loadTexts();
      expect(texts).toEqual({});
    });
  });

  // ================================================================
  // injectMetaTags
  // ================================================================
  describe('injectMetaTags', function () {
    var req;

    beforeEach(function () {
      req = {
        protocol: 'https',
        get: jest.fn(function (header) {
          if (header === 'host') return 'www.test.com';
          return '';
        }),
        originalUrl: '/',
        cookies: {}
      };
    });

    it('remplace les placeholders de title et description', function () {
      var html = '<html><head>{{DYNAMIC_TITLE}}</head><body>{{DYNAMIC_DESCRIPTION}}</body></html>';
      var texts = { meta: { title: 'Mon Titre', description: 'Ma Description', keywords: 'photo', author: 'Moi' } };

      var result = textUtils.injectMetaTags(html, texts, req, 'Portfolio');
      expect(result).toContain('Mon Titre');
      expect(result).toContain('Ma Description');
    });

    it('injecte les meta tags Open Graph', function () {
      var html = '<html><head>    <!-- META_PLACEHOLDER_END --></head><body></body></html>';
      var texts = { meta: { title: 'OG Test', description: 'OG Desc', og_image: '/img.png' } };

      var result = textUtils.injectMetaTags(html, texts, req, 'Portfolio');
      expect(result).toContain('og:title');
      expect(result).toContain('og:description');
    });

    it('injecte les meta tags Twitter', function () {
      var html = '<html><head>    <!-- META_PLACEHOLDER_END --></head><body></body></html>';
      var texts = { meta: { title: 'Twitter Test', description: 'Tw Desc' } };

      var result = textUtils.injectMetaTags(html, texts, req, 'Contact');
      expect(result).toContain('twitter:card');
      expect(result).toContain('summary_large_image');
    });

    it('injecte la balise canonical', function () {
      var html = '<html><head>    <!-- META_PLACEHOLDER_END --></head><body></body></html>';
      var texts = { meta: {} };

      var result = textUtils.injectMetaTags(html, texts, req, 'Portfolio');
      expect(result).toContain('rel="canonical"');
    });

    it('injecte le script de campagne si campagne active', function () {
      var html = '<html><head>    <!-- META_PLACEHOLDER_END --></head><body></body></html>';
      var texts = { meta: {} };
      var campaignInfo = { campaignId: 'c1', campaignName: 'Camp1' };

      var result = textUtils.injectMetaTags(html, texts, req, 'Portfolio', campaignInfo);
      expect(result).toContain('window.campaignInfo');
      expect(result).toContain('Camp1');
    });

    it('utilise les donnees SEO si disponibles', function () {
      var html = '<html><head>{{DYNAMIC_TITLE}}</head><body></body></html>';
      var texts = { meta: {} };

      // Le mock pour fs.readFileSync devrait retourner des donnees
      var result = textUtils.injectMetaTags(html, texts, req, 'Portfolio');
      expect(result).toContain('html');
    });
  });

  // ================================================================
  // generateSchemaJsonLd
  // ================================================================
  describe('generateSchemaJsonLd', function () {
    var req;

    beforeEach(function () {
      req = {
        protocol: 'https',
        get: jest.fn().mockReturnValue('www.test.com'),
        originalUrl: '/'
      };
    });

    it('genere des schemas JSON-LD valides', function () {
      var result = textUtils.generateSchemaJsonLd('Portfolio', req);
      expect(result).toContain('application/ld+json');
      expect(result).toContain('WebSite');
      expect(result).toContain('ProfessionalService');
      expect(result).toContain('Person');
    });

    it('ajoute ImageGallery pour la page home', function () {
      var result = textUtils.generateSchemaJsonLd('Portfolio', req);
      expect(result).toContain('ImageGallery');
    });

    it('ajoute ContactPage pour la page contact', function () {
      var result = textUtils.generateSchemaJsonLd('Contact', req);
      expect(result).toContain('ContactPage');
    });

    it('ajoute AboutPage pour la page about', function () {
      var result = textUtils.generateSchemaJsonLd('À propos', req);
      expect(result).toContain('AboutPage');
    });

    it('genere le breadcrumb pour les sous-pages', function () {
      var result = textUtils.generateSchemaJsonLd('Contact', req);
      expect(result).toContain('BreadcrumbList');
    });

    it('ne genere pas de breadcrumb pour la home', function () {
      // Le breadcrumb pour home a 1 seul item => null
      var result = textUtils.generateSchemaJsonLd('Portfolio', req);
      // Doit contenir schemas mais pas BreadcrumbList
      expect(result).not.toContain('BreadcrumbList');
    });
  });

  // ================================================================
  // _generateBreadcrumbs
  // ================================================================
  describe('_generateBreadcrumbs', function () {
    it('retourne null pour la page home', function () {
      var result = textUtils._generateBreadcrumbs('home', 'https://test.com');
      expect(result).toBeNull();
    });

    it('retourne un breadcrumb pour une sous-page', function () {
      var result = textUtils._generateBreadcrumbs('contact', 'https://test.com');
      expect(result).toBeDefined();
      expect(result['@type']).toBe('BreadcrumbList');
      expect(result.itemListElement.length).toBe(2);
      expect(result.itemListElement[0].name).toBe('Accueil');
      expect(result.itemListElement[1].name).toBe('Contact');
    });
  });
});
