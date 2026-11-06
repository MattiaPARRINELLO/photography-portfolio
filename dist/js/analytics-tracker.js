/* ============================================================
   ANALYTICS TRACKER — portfolio photo
   ============================================================
   Collecte légère, sans cookie, sans identifiant persistant :

   • Zéro cookie : la continuité de session repose sur sessionStorage,
     une donnée éphémère limitée à l'onglet courant, purgée à sa
     fermeture et JAMAIS transmise automatiquement au serveur.
   • Engagement réel : le temps n'est compté que lorsque l'onglet est
     visible. Un onglet laissé en arrière-plan ne gonfle pas la métrique
     (et la session est close après 2 min passées en arrière-plan).
   • Conversions : mailto/tel, CTA contact, liens réseaux/presse/labels.
   • Campagnes : paramètres d'URL (?c, ?ref, ?utm_*) mémorisés pour
     toute la session.
   • Transport : navigator.sendBeacon (ne bloque jamais la navigation),
     repli sur fetch keepalive.

   Aucune donnée personnelle n'est collectée : pas d'IP, pas d'UA,
   pas de texte saisi. Uniquement des signaux de session anonymisés
   par un hash tournant quotidiennement.
   ============================================================ */

(function () {
  'use strict';

  // ----- Configuration ------------------------------------------------

  var ENDPOINT = '/api/track';
  var TICK_MS = 1000;          // cadence d'accumulation du temps engagé
  var FLUSH_MS = 10000;        // cadence d'envoi des signaux
  var IDLE_HIDDEN_MS = 120000; // 2 min en arrière-plan => session close
  var LIGHTBOX_DEBOUNCE_MS = 500;
  var MAX_TICK_JUMP = TICK_MS * 5;
  var STORAGE_PREFIX = 'pp_analytics.';

  // Graine du hash quotidien : rend le hash non devinable côté client.
  // Ce n'est pas un secret, uniquement un sel d'anonymisation.
  var HASH_SALT = 'photo.mprnl.fr/analytics/v1';

  // ----- Utilitaires --------------------------------------------------

  function log() {
    if (typeof console === 'undefined' || typeof console.warn !== 'function') return;
    console.warn.apply(console, arguments);
  }

  function readStore(key) {
    try {
      return window.sessionStorage.getItem(STORAGE_PREFIX + key);
    } catch (e) {
      return null;
    }
  }

  function writeStore(key, value) {
    try {
      window.sessionStorage.setItem(STORAGE_PREFIX + key, value);
    } catch (e) {
      /* mode privé strict : on ignore, la session reste fonctionnelle */
    }
  }

  function randomId() {
    var c = window.crypto || window.msCrypto;
    if (c && typeof c.getRandomValues === 'function') {
      var bytes = new Uint8Array(8);
      c.getRandomValues(bytes);
      var out = '';
      for (var i = 0; i < bytes.length; i++) out += bytes[i].toString(36);
      return out.slice(0, 15);
    }
    return Math.random().toString(36).slice(2, 12);
  }

  function dayKey() {
    var d = new Date();
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /** URL de page normalisée (sans query, sans slash final superflu) */
  function pageId() {
    var p = window.location.pathname || '/';
    if (p.length > 1 && p.slice(-1) === '/') p = p.slice(0, -1);
    return p || '/';
  }

  // ----- Classification du trafic -------------------------------------

  var SEARCH_DOMAINS = {
    'google.': 'search', 'bing.': 'search', 'duckduckgo.com': 'search',
    'ecosia.org': 'search', 'qwant.com': 'search', 'startpage.com': 'search',
    'search.yahoo.com': 'search', 'baidu.com': 'search', 'yandex.': 'search',
    'lite.duckduckgo.com': 'search'
  };

  var NAMED_SOCIAL = {
    'instagram.com': 'instagram', 'facebook.com': 'facebook', 'fb.me': 'facebook',
    'x.com': 'x', 'twitter.com': 'x', 't.co': 'x', 'tiktok.com': 'tiktok',
    'youtube.com': 'youtube', 'youtu.be': 'youtube', 'linkedin.com': 'linkedin',
    'pinterest.': 'pinterest', 'reddit.com': 'reddit'
  };

  // Maisons de disques, plateformes musicales, press spécialisée concert/musique
  var LABEL_DOMAINS = {
    'bandcamp.com': 'labels', 'discogs.com': 'labels', 'spotify.com': 'labels',
    'soundcloud.com': 'labels', 'deezer.com': 'labels', 'music.apple.com': 'labels',
    'last.fm': 'labels', 'rateyourmusic.com': 'labels', 'songkick.com': 'labels',
    'bandsintown.com': 'labels'
  };

  var PRESS_DOMAINS = {
    'lemonde.fr': 'press', 'liberation.fr': 'press', 'lesinrocks.com': 'press',
    'rollingstone.com': 'press', 'billboard.com': 'press', 'pitchfork.com': 'press',
    'consequence.net': 'press', 'sourdoreille.net': 'press', 'leride.com': 'press'
  };

  /** Teste si un hôte correspond exactement ou en sous-domaine à une clé */
  function hostMatches(host, key) {
    if (key.slice(-1) === '.') return host.slice(0, key.length) === key;
    return host === key || host.slice(-(key.length + 1)) === '.' + key;
  }

  function matchDomain(host, map) {
    for (var key in map) {
      if (Object.prototype.hasOwnProperty.call(map, key) && hostMatches(host, key)) return map[key];
    }
    return null;
  }

  /** Nettoie un referrer en une source qualifiée, sans stocker l'URL complète */
  function classifyReferrer(referrer) {
    if (!referrer) return 'direct';
    var host;
    try {
      host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, '');
    } catch (e) {
      return 'referral';
    }
    if (!host) return 'direct';

    return matchDomain(host, SEARCH_DOMAINS)
      || matchDomain(host, NAMED_SOCIAL)
      || matchDomain(host, LABEL_DOMAINS)
      || matchDomain(host, PRESS_DOMAINS)
      || 'referral';
  }

  // ----- Extraction des campagnes -------------------------------------

  /** Supporte ?c, ?ref et les paramètres standards ?utm_campaign / ?utm_source */
  function extractCampaign() {
    var params;
    try {
      params = new URLSearchParams(window.location.search || '');
    } catch (e) {
      return null;
    }
    var id = params.get('c') || params.get('ref') || params.get('utm_campaign');
    if (!id) return null;
    var source = params.get('utm_source') || params.get('source') || null;
    return { id: String(id).slice(0, 64), source: source ? String(source).slice(0, 32) : null };
  }

  // ----- Hash quotidien anonyme ---------------------------------------
  // Regroupe les visites d'une même journée / d'un même appareil sans
  // jamais conserver d'identifiant individuel : le sel change chaque jour.

  function fingerprintInput() {
    var nav = window.navigator || {};
    return [
      nav.userAgent || '',
      nav.platform || '',
      (window.screen ? window.screen.width + 'x' + window.screen.height : '0x0'),
      String(window.devicePixelRatio || 1),
      (window.Intl && window.Intl.DateTimeFormat
        ? window.Intl.DateTimeFormat().resolvedOptions().timeZone : '') || ''
    ].join('|');
  }

  function fallbackHash(text) {
    // Dérivation simple (non cryptographique) si Web Crypto est indisponible
    var h1 = 0x811c9dc5;
    var h2 = 0x9e3779b9;
    var i;
    for (i = 0; i < text.length; i++) {
      h1 ^= text.charCodeAt(i);
      h1 = Math.imul(h1, 0x01000193) >>> 0;
    }
    for (i = text.length - 1; i >= 0; i--) {
      h2 ^= text.charCodeAt(i);
      h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
    }
    return ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8);
  }

  function computeDailyHash() {
    var text = HASH_SALT + '|' + fingerprintInput() + '|' + dayKey();
    var cryptoObj = window.crypto;
    if (cryptoObj && cryptoObj.subtle && typeof cryptoObj.subtle.digest === 'function') {
      return cryptoObj.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) {
          return ('0' + b.toString(16)).slice(-2);
        }).join('').slice(0, 32);
      }).catch(function () {
        return fallbackHash(text);
      });
    }
    return Promise.resolve(fallbackHash(text));
  }

  function loadDailyHash() {
    var cached = readStore('hash');
    if (cached && readStore('hash_day') === dayKey()) return Promise.resolve(cached);

    return computeDailyHash().then(function (hash) {
      writeStore('hash', hash);
      writeStore('hash_day', dayKey());
      return hash;
    });
  }

  // ============================================================
  // TRACKER
  // ============================================================

  function AnalyticsTracker() {
    // Identifiant de session aléatoire, porté par sessionStorage :
    // il relie les pages d'un même onglet sans jamais être un cookie.
    var existingSid = readStore('sid');
    this.sid = existingSid || randomId();
    if (!existingSid) writeStore('sid', this.sid);

    this.hash = null;
    this.source = null;
    this.campaign = null;
    this.pages = loadPages();
    this._seenPhotos = loadSeenPhotos();
    this.dirty = false;
    this.closed = false;
    this.flushed = false;
    this.hiddenSince = null;
    this.lastTick = Date.now();
    this.lastLightboxAt = 0;
    this.tickTimer = null;
    this.flushTimer = null;
    this.photoObserver = null;
    this.mutationObserver = null;

    this.currentPage = this._ensurePage(pageId());
    this._init();
  }

  function loadPages() {
    var raw = readStore('pages');
    if (!raw) return [];
    try {
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function loadSeenPhotos() {
    var raw = readStore('photos');
    if (!raw) return {};
    try {
      var parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  /** Retrouve (ou crée) l'entrée cumulée d'une page dans la session */
  AnalyticsTracker.prototype._ensurePage = function (id) {
    var found = null;
    for (var i = 0; i < this.pages.length; i++) {
      if (this.pages[i].id === id) { found = this.pages[i]; break; }
    }
    if (!found) {
      found = {
        id: id,
        engagedMs: 0,
        scrollMax: 0,
        fullscreenOpens: 0,
        photosViewed: 0,
        contactClicks: 0,
        mailtoClicks: 0
      };
      this.pages.push(found);
      this.dirty = true;
    }
    return found;
  };

  AnalyticsTracker.prototype._init = function () {
    var self = this;

    // Campagne : capturée une fois, conservée pour toute la session
    var storedCampaign = readStore('campaign');
    if (storedCampaign) {
      try {
        var parsed = JSON.parse(storedCampaign);
        if (parsed && parsed.id) self.campaign = parsed;
      } catch (e) { /* corrompu : on repart de zéro */ }
    } else {
      var fromUrl = extractCampaign();
      if (fromUrl) {
        self.campaign = fromUrl;
        writeStore('campaign', JSON.stringify(fromUrl));
      }
    }

    // Source de trafic : déterminée à la première page visitée
    var storedSource = readStore('source');
    if (storedSource) {
      self.source = storedSource;
    } else {
      self.source = classifyReferrer(document.referrer);
      writeStore('source', self.source);
    }

    // Le hash quotidien est asynchrone : il sera joint au prochain flush
    loadDailyHash().then(function (hash) {
      if (self.closed) return;
      self.hash = hash;
      self.dirty = true;
    }).catch(function () { self.hash = null; });

    // --- Temps engagé : on ne compte que l'onglet visible ------------
    this.tickTimer = setInterval(function () { self._tick(); }, TICK_MS);

    document.addEventListener('visibilitychange', function () {
      if (self.closed) return;
      if (document.hidden) {
        self.hiddenSince = Date.now();
        self.flush();
      } else {
        // Le temps passé en arrière-plan n'est jamais compté.
        if (self.hiddenSince && Date.now() - self.hiddenSince > IDLE_HIDDEN_MS) {
          self._closeSession();
          return;
        }
        self.hiddenSince = null;
        self.lastTick = Date.now();
      }
    });

    // --- Profondeur de scroll ----------------------------------------
    var scrollPending = false;
    window.addEventListener('scroll', function () {
      if (self.closed || scrollPending) return;
      scrollPending = true;
      requestAnimationFrame(function () {
        scrollPending = false;
        if (self.closed) return;
        var depth = self._scrollDepth();
        if (depth > self.currentPage.scrollMax) {
          self.currentPage.scrollMax = depth;
          self.dirty = true;
        }
      });
    }, { passive: true });

    // --- Photos réellement regardées ---------------------------------
    this._watchPhotos();

    // --- Interactions fortes -----------------------------------------
    this._bindClicks();

    // --- Envoi périodique --------------------------------------------
    this.flushTimer = setInterval(function () { self.flush(); }, FLUSH_MS);

    var onLeave = function () { self.flush(); };
    window.addEventListener('pagehide', onLeave);
    window.addEventListener('beforeunload', onLeave);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) onLeave();
    });

    this._persist();
  };

  AnalyticsTracker.prototype._scrollDepth = function () {
    var doc = document.documentElement;
    var scrollable = doc.scrollHeight - window.innerHeight;
    if (scrollable <= 0) return 1;
    var depth = (window.pageYOffset || doc.scrollTop || 0) / scrollable;
    return Math.max(0, Math.min(1, depth));
  };

  /** Une seule ouverture de lightbox n'est comptée qu'une fois */
  AnalyticsTracker.prototype._countLightbox = function () {
    var now = Date.now();
    if (now - this.lastLightboxAt < LIGHTBOX_DEBOUNCE_MS) return;
    this.lastLightboxAt = now;
    this.currentPage.fullscreenOpens++;
    this.dirty = true;
  };

  AnalyticsTracker.prototype._countConversion = function (kind) {
    if (kind === 'mailto') this.currentPage.mailtoClicks++;
    else this.currentPage.contactClicks++;
    this.dirty = true;
  };

  AnalyticsTracker.prototype._countPhoto = function (src) {
    if (!src || this._seenPhotos[src]) return;
    this._seenPhotos[src] = 1;
    this.currentPage.photosViewed++;
    this.dirty = true;
  };

  /** Détecte les photos réellement regardées (au moins la moitié visible) */
  AnalyticsTracker.prototype._watchPhotos = function () {
    var self = this;

    if (typeof IntersectionObserver === 'function') {
      this.photoObserver = new IntersectionObserver(function (entries) {
        if (self.closed) return;
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          self._countPhoto(entry.target.currentSrc || entry.target.src);
        });
      }, { threshold: 0.5 });
    }

    var scan = function () {
      if (self.closed) return;
      var images = document.images || [];
      for (var i = 0; i < images.length; i++) {
        var img = images[i];
        if (!img || img.dataset.analyticsTracked === '1') continue;
        var src = img.currentSrc || img.src;
        if (!src) continue;
        img.dataset.analyticsTracked = '1';

        if (self.photoObserver) self.photoObserver.observe(img);
        else self._countPhoto(src);
      }
    };

    scan();

    // Les galeries sont parfois injectées dynamiquement
    if (typeof MutationObserver === 'function' && document.body) {
      var pending = null;
      this.mutationObserver = new MutationObserver(function () {
        if (pending) clearTimeout(pending);
        pending = setTimeout(scan, 400);
      });
      this.mutationObserver.observe(document.body, { childList: true, subtree: true });
    }
  };

  AnalyticsTracker.prototype._bindClicks = function () {
    var self = this;

    document.addEventListener('click', function (event) {
      if (self.closed) return;
      var target = event.target;
      if (!target || typeof target.closest !== 'function') return;

      // a) Ouverture Fancybox / plein écran, détectée au clic
      if (target.closest('[data-fancybox]')) {
        self._countLightbox();
        return;
      }

      var conversionEl = target.closest('[data-analytics-conversion]');
      if (conversionEl) {
        self._countConversion(conversionEl.dataset.analyticsConversion === 'mailto' ? 'mailto' : 'contact');
        return;
      }

      var anchor = target.closest('a[href]');
      if (!anchor) return;

      var href = anchor.getAttribute('href') || '';
      if (/^(mailto:|tel:)/i.test(href)) {
        self._countConversion('mailto');
        return;
      }

      var isExternal = false;
      try {
        isExternal = new URL(href, window.location.href).origin !== window.location.origin;
      } catch (e) { isExternal = false; }

      // Réseaux sociaux, labels, presse : un lien externe est une conversion
      if (isExternal) {
        self._countConversion('contact');
        return;
      }
      if (/\/contact(?:\/|$|\?)/.test(href)) self._countConversion('contact');
    }, true);

    // b) Filet de sécurité : événement Fancybox si la bibliothèque l'émet
    document.addEventListener('fancybox:open', function () {
      if (!self.closed) self._countLightbox();
    });
  };

  AnalyticsTracker.prototype._persist = function () {
    writeStore('pages', JSON.stringify(this.pages));
    writeStore('photos', JSON.stringify(this._seenPhotos));
  };

  AnalyticsTracker.prototype._tick = function () {
    if (this.closed) return;
    if (document.hidden) {
      this.lastTick = Date.now();
      return;
    }
    var now = Date.now();
    var delta = now - this.lastTick;
    this.lastTick = now;
    // Garde-fou anti-dérive (onglet gelé, reprise après verrouillage)
    if (delta <= 0) return;
    if (delta > MAX_TICK_JUMP) delta = MAX_TICK_JUMP;
    this.currentPage.engagedMs += delta;
    this.dirty = true;
  };

  AnalyticsTracker.prototype._closeSession = function () {
    this.closed = true;
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.photoObserver) this.photoObserver.disconnect();
    if (this.mutationObserver) this.mutationObserver.disconnect();
    try { window.sessionStorage.removeItem(STORAGE_PREFIX + 'sid'); } catch (e) { /* ignore */ }
    this.flush();
  };

  /** Envoie l'état cumulé ; le serveur conserve le dernier signal reçu */
  AnalyticsTracker.prototype.flush = function () {
    if (this.closed && this.flushed) return;
    this._persist();

    var payload = {
      v: 1,
      sid: this.sid,
      hash: this.hash,
      src: this.source || 'direct',
      camp: this.campaign,
      pages: this.pages.map(function (p) {
        return {
          id: p.id,
          engagedMs: Math.round(p.engagedMs),
          scrollMax: Math.round(p.scrollMax * 100) / 100,
          fullscreenOpens: p.fullscreenOpens,
          photosViewed: p.photosViewed,
          contactClicks: p.contactClicks,
          mailtoClicks: p.mailtoClicks
        };
      })
    };

    var body = JSON.stringify(payload);
    var sent = false;

    // sendBeacon : survit à la navigation et à la fermeture d'onglet
    if (typeof navigator.sendBeacon === 'function') {
      try {
        sent = navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
      } catch (e) { sent = false; }
    }

    if (!sent && typeof window.fetch === 'function') {
      try {
        window.fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body,
          credentials: 'omit',
          keepalive: true,
          cache: 'no-store'
        }).catch(function () { /* signal perdu : sans impact métier */ });
        sent = true;
      } catch (e) { sent = false; }
    }

    if (sent) {
      this.flushed = true;
      this.dirty = false;
    }
  };

  // ----- Démarrage ----------------------------------------------------

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { new AnalyticsTracker(); });
  } else {
    new AnalyticsTracker();
  }

  // Export pour les tests
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      AnalyticsTracker: AnalyticsTracker,
      classifyReferrer: classifyReferrer,
      extractCampaign: extractCampaign
    };
  }
})();
