var path = require('path');
var fs = require('fs');

var fileStore = {};

// Resolve le chemin de links.json
var linksPath = (function () {
  var p = require.resolve('../../server/utils/linksService');
  return path.join(path.dirname(p), '..', '..', 'config', 'links.json');
})();

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
    readdirSync: jest.fn().mockReturnValue([]),
    mkdirSync: jest.fn(),
    statSync: jest.fn().mockReturnValue({ size: 1024, mtime: new Date() }),
    unlinkSync: jest.fn()
  });
});

var linksService = require('../../server/utils/linksService');

function seed(data) {
  fileStore[linksPath] = JSON.stringify(data);
}

function getDefaultConfig() {
  return {
    profile: { name: 'Test', role: 'Photographe', tagline: 'Test', avatar: { enabled: true, url: '/avatar.png' }, description: 'Bio', links: [] },
    links: [
      { id: 'l1', label: 'Instagram', url: 'https://instagram.com/test', icon: 'instagram', enabled: true, order: 1, style: 'default' },
      { id: 'l2', label: 'Site Web', url: 'https://example.com', icon: 'link', enabled: true, order: 2, style: 'primary' },
      { id: 'l3', label: 'Caché', url: 'https://hidden.com', icon: 'eye', enabled: false, order: 3, style: 'default' }
    ],
    appearance: { theme: 'dark', accentColor: '#667eea', showWatermark: true },
    seo: { title: 'SEO Title', description: 'SEO Desc', keywords: 'photo', author: 'Moi', image: '/og.png' },
    event: { enabled: false, message: '', url: '', icon: 'star', createdAt: null, expiresAt: null }
  };
}

function readStore() {
  return JSON.parse(fileStore[linksPath] || '{}');
}

describe('linksService', function () {

  beforeEach(function () {
    jest.clearAllMocks();
    Object.keys(fileStore).forEach(function (k) { delete fileStore[k]; });
    seed(getDefaultConfig());
  });

  // ================================================================
  // loadLinksConfig / saveLinksConfig
  // ================================================================
  describe('loadLinksConfig', function () {
    it('charge la configuration', function () {
      var cfg = linksService.loadLinksConfig();
      expect(cfg.profile.name).toBe('Test');
      expect(cfg.links).toHaveLength(3);
    });

    it('retourne config par defaut si fichier absent', function () {
      delete fileStore[linksPath];
      var cfg = linksService.loadLinksConfig();
      expect(cfg.profile.name).toBeDefined();
    });
  });

  describe('saveLinksConfig', function () {
    it('sauvegarde et met a jour lastUpdated', function () {
      var cfg = linksService.loadLinksConfig();
      cfg.profile.name = 'Updated';
      var saved = linksService.saveLinksConfig(cfg);
      expect(saved).toBe(true);
      expect(readStore().profile.name).toBe('Updated');
    });
  });

  // ================================================================
  // getActiveLinks
  // ================================================================
  describe('getActiveLinks', function () {
    it('retourne uniquement les liens actifs', function () {
      var active = linksService.getActiveLinks();
      expect(active).toHaveLength(2);
      expect(active[0].id).toBe('l1');
      expect(active[1].id).toBe('l2');
    });

    it('retourne tableau vide si aucun lien actif', function () {
      seed({ profile: { name: 'X' }, links: [], appearance: {}, seo: {}, event: { enabled: false } });
      expect(linksService.getActiveLinks()).toEqual([]);
    });
  });

  // ================================================================
  // addLink
  // ================================================================
  describe('addLink', function () {
    it('ajoute un lien a la fin', function () {
      var result = linksService.addLink({
        label: 'Nouveau', url: 'https://new.com', icon: 'star'
      });
      expect(result.links).toHaveLength(4);
      expect(result.links[3].label).toBe('Nouveau');
      expect(result.links[3].order).toBe(4);
    });

    it('genere un id si absent', function () {
      var result = linksService.addLink({ label: 'Sans ID', url: 'https://x.com', icon: 'link' });
      expect(result.links[3].id).toBeDefined();
      expect(result.links[3].id).toContain('link_');
    });

    it('utilise l id fourni', function () {
      var result = linksService.addLink({ id: 'my-id', label: 'Custom', url: 'https://c.com', icon: 'link' });
      expect(result.links[3].id).toBe('my-id');
    });
  });

  // ================================================================
  // updateLink
  // ================================================================
  describe('updateLink', function () {
    it('met a jour un lien existant', function () {
      var result = linksService.updateLink('l1', { label: 'Updated IG', url: 'https://new.com' });
      var link = result.links.find(function (l) { return l.id === 'l1'; });
      expect(link.label).toBe('Updated IG');
      expect(link.url).toBe('https://new.com');
    });

    it('retourne null si lien inexistant', function () {
      expect(linksService.updateLink('inexistant', { label: 'X' })).toBeNull();
    });
  });

  // ================================================================
  // deleteLink
  // ================================================================
  describe('deleteLink', function () {
    it('supprime un lien existant', function () {
      var result = linksService.deleteLink('l1');
      expect(result.links).toHaveLength(2);
    });

    it('retourne null si lien inexistant', function () {
      expect(linksService.deleteLink('inexistant')).toBeNull();
    });
  });

  // ================================================================
  // reorderLinks
  // ================================================================
  describe('reorderLinks', function () {
    it('met a jour l ordre des liens', function () {
      var result = linksService.reorderLinks(['l3', 'l1', 'l2']);
      var l3 = result.links.find(function (l) { return l.id === 'l3'; });
      var l1 = result.links.find(function (l) { return l.id === 'l1'; });
      var l2 = result.links.find(function (l) { return l.id === 'l2'; });
      expect(l3.order).toBe(1);
      expect(l1.order).toBe(2);
      expect(l2.order).toBe(3);
    });

    it('ignore les ids inexistants', function () {
      linksService.reorderLinks(['inexistant', 'l1']);
      var cfg = linksService.loadLinksConfig();
      expect(cfg.links.length).toBeGreaterThan(0);
    });
  });

  // ================================================================
  // updateProfile
  // ================================================================
  describe('updateProfile', function () {
    it('met a jour le profil', function () {
      var result = linksService.updateProfile({ name: 'Nouveau Nom', role: 'Dev' });
      expect(result.profile.name).toBe('Nouveau Nom');
      expect(result.profile.role).toBe('Dev');
    });

    it('remplace avatar complet', function () {
      var result = linksService.updateProfile({ avatar: { enabled: false } });
      expect(result.profile.avatar.enabled).toBe(false);
      // Le spread remplace tout l objet avatar, url est perdue
      expect(result.profile.avatar.url).toBeUndefined();
    });
  });

  // ================================================================
  // updateAppearance
  // ================================================================
  describe('updateAppearance', function () {
    it('met a jour le theme', function () {
      var result = linksService.updateAppearance({ theme: 'light' });
      expect(result.appearance.theme).toBe('light');
    });
  });

  // ================================================================
  // updateSeo
  // ================================================================
  describe('updateSeo', function () {
    it('met a jour le titre SEO', function () {
      var result = linksService.updateSeo({ title: 'New SEO Title' });
      expect(result.seo.title).toBe('New SEO Title');
    });
  });

  // ================================================================
  // setEventBanner / clearEventBanner
  // ================================================================
  describe('setEventBanner', function () {
    it('cree un bandeau evenement', function () {
      var result = linksService.setEventBanner({
        message: 'Nouvel album dispo!',
        url: 'https://album.com',
        icon: 'star'
      }, 3);

      expect(result.event.enabled).toBe(true);
      expect(result.event.message).toBe('Nouvel album dispo!');
      expect(result.event.url).toBe('https://album.com');
      expect(result.event.icon).toBe('star');
      expect(result.event.createdAt).toBeDefined();
      expect(result.event.expiresAt).toBeDefined();
    });

    it('cree sans url ni icone', function () {
      var result = linksService.setEventBanner({ message: 'Event!' }, 5);
      expect(result.event.url).toBe('');
      expect(result.event.icon).toBe('star');
    });
  });

  describe('clearEventBanner', function () {
    it('desactive le bandeau', function () {
      var result = linksService.clearEventBanner();
      expect(result.event.enabled).toBe(false);
      expect(result.event.message).toBe('');
    });
  });

  // ================================================================
  // isEventActive / getEventTimeRemaining
  // ================================================================
  describe('isEventActive', function () {
    it('retourne true si actif et non expire', function () {
      var future = new Date(Date.now() + 86400000).toISOString();
      expect(linksService.isEventActive({ enabled: true, message: 'E!', expiresAt: future })).toBe(true);
    });

    it('retourne false si expire', function () {
      var past = new Date(Date.now() - 86400000).toISOString();
      expect(linksService.isEventActive({ enabled: true, message: 'E!', expiresAt: past })).toBe(false);
    });

    it('retourne false si enabled false', function () {
      expect(linksService.isEventActive({ enabled: false, message: 'E!' })).toBe(false);
    });

    it('retourne false si message vide', function () {
      expect(linksService.isEventActive({ enabled: true, message: '' })).toBe(false);
    });

    it('retourne false pour null', function () {
      expect(linksService.isEventActive(null)).toBe(false);
    });
  });

  describe('getEventTimeRemaining', function () {
    it('retourne days et hours pour un evenement futur', function () {
      var future = new Date(Date.now() + 2 * 86400000 + 3600000).toISOString(); // 2j 1h
      var r = linksService.getEventTimeRemaining({ enabled: true, message: 'E!', expiresAt: future });
      expect(r.days).toBeGreaterThanOrEqual(1);
    });

    it('retourne null si expire', function () {
      var past = new Date(Date.now() - 86400000).toISOString();
      expect(linksService.getEventTimeRemaining({ enabled: true, message: 'E!', expiresAt: past })).toBeNull();
    });

    it('retourne null pour null', function () {
      expect(linksService.getEventTimeRemaining(null)).toBeNull();
    });
  });

  // ================================================================
  // getAvailableIcons
  // ================================================================
  describe('getAvailableIcons', function () {
    it('retourne un tableau d icones', function () {
      var icons = linksService.getAvailableIcons();
      expect(Array.isArray(icons)).toBe(true);
      expect(icons.length).toBeGreaterThan(0);
    });
  });

  // ================================================================
  // generateAvatarHtml / generateLinkHtml / generateWatermarkHtml
  // Ces fonctions sont privees (non exportees) — testees indirectement via injectLinksData
  // ================================================================

  // ================================================================
  // generateEventBannerHtml
  // ================================================================
  describe('generateEventBannerHtml', function () {
    it('genere HTML pour un bandeau actif', function () {
      var future = new Date(Date.now() + 86400000).toISOString();
      var event = { enabled: true, message: 'Event!', url: 'https://e.com', icon: 'star', createdAt: new Date().toISOString(), expiresAt: future };
      var html = linksService.generateEventBannerHtml(event);
      expect(html).toContain('Event!');
      expect(html).not.toBe('');
    });

    it('genere bandeau sans lien si pas d url', function () {
      var future = new Date(Date.now() + 86400000).toISOString();
      var event = { enabled: true, message: 'E!', url: '', icon: 'star', expiresAt: future };
      var html = linksService.generateEventBannerHtml(event);
      expect(html).not.toBe('');
    });

    it('retourne vide si event inactif', function () {
      expect(linksService.generateEventBannerHtml({ enabled: false })).toBe('');
    });
  });

  // ================================================================
  // injectLinksData
  // ================================================================
  describe('injectLinksData', function () {
    var req = { secure: false, headers: { 'x-forwarded-proto': 'https' }, get: function (h) { return 'test.com'; } };

    it('remplace les placeholders dans le HTML', function () {
      var html = '<html>{{PROFILE_NAME}}</html>';
      var cfg = linksService.loadLinksConfig();
      var result = linksService.injectLinksData(html, cfg, req);
      expect(result).not.toContain('{{PROFILE_NAME}}');
    });

    it('remplace le title SEO', function () {
      var html = '<title>{{SEO_TITLE}}</title>';
      var cfg = linksService.loadLinksConfig();
      var result = linksService.injectLinksData(html, cfg, req);
      expect(result).not.toContain('{{SEO_TITLE}}');
    });

    it('remplace le placeholder des liens', function () {
      var html = '<body><!-- LINKS_PLACEHOLDER --></body>';
      var cfg = linksService.loadLinksConfig();
      var result = linksService.injectLinksData(html, cfg, req);
      expect(result).toContain('link-btn');
    });

    it('remplace le placeholder watermark', function () {
      var html = '<footer><!-- WATERMARK_PLACEHOLDER --></footer>';
      var cfg = linksService.loadLinksConfig();
      var result = linksService.injectLinksData(html, cfg, req);
      expect(result).toContain('watermark');
    });

    it('remplace le placeholder event banner', function () {
      var html = '<body><!-- EVENT_BANNER_PLACEHOLDER --></body>';
      var cfg = linksService.loadLinksConfig();
      var result = linksService.injectLinksData(html, cfg, req);
      expect(result).not.toContain('EVENT_BANNER_PLACEHOLDER');
    });
  });
});
