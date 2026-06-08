// Les fonctions testees ici sont des copies locales des helpers prives de pages.js
// car ces fonctions ne sont pas exportées du module (seul le router l'est).

function escapeAttr(s) {
  return (s || '').toString().replace(/[&<>"']/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
  });
}

function formatGalleryDate(iso) {
  if (!iso) return '';
  try {
    var d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch (e) { return ''; }
}

function safeExternalUrl(url) {
  var raw = (url || '').toString().trim();
  if (!raw) return '';
  return /^https?:\/\//i.test(raw) ? raw : '';
}

function artistPlatformIcon(platform) {
  if (platform === 'instagram') return '<svg>instagram</svg>';
  if (platform === 'deezer') return '<svg>deezer</svg>';
  return '<svg>default</svg>';
}

function renderArtistLinksSection(gallery) {
  var artist = (gallery.artist || '').trim();
  var links = gallery.artistLinks || {};
  var instagram = safeExternalUrl(links.instagram);
  var deezer = safeExternalUrl(links.deezer);
  var spotify = safeExternalUrl(links.spotify);

  var chips = [];
  if (instagram) chips.push('<a href="' + escapeAttr(instagram) + '" data-platform="instagram">Instagram</a>');
  if (deezer) chips.push('<a href="' + escapeAttr(deezer) + '" data-platform="deezer">Deezer</a>');
  if (spotify) chips.push('<a href="' + escapeAttr(spotify) + '" data-platform="spotify">Spotify</a>');

  if (!artist || chips.length === 0) return '';
  return '<section class="artist-links-panel">' + chips.join('') + '</section>';
}

function renderGalleryCard(g) {
  var cover = g.cover
    ? '<img class="cover" src="/photos/resize?file=' + encodeURIComponent(g.cover) + '&amp;w=800" alt="' + escapeAttr(g.title) + '" />'
    : '<div class="cover" style="background:#111"></div>';
  var metaParts = [g.venue, formatGalleryDate(g.date)].filter(Boolean);
  var meta = metaParts.join(' · ');
  var kicker = g.artist || 'Concert';
  var count = g.photos.length + ' photo' + (g.photos.length > 1 ? 's' : '');

  return '<a class="gallery-card" href="/galeries/' + encodeURIComponent(g.slug) + '">' +
    cover + '<span class="count">' + count + '</span>' +
    '<div class="content"><span class="kicker">' + escapeAttr(kicker) + '</span>' +
    '<h3>' + escapeAttr(g.title) + '</h3>' +
    (meta ? '<p class="meta">' + escapeAttr(meta) + '</p>' : '') +
    '</div></a>';
}

function generateGalleryItemHtml(photo, index) {
  var fileParam = encodeURIComponent(photo.filename);
  var thumbUrl = '/photos/resize?file=' + fileParam + '&w=640';
  var fullUrl = '/photos/resize?file=' + fileParam + '&w=1600';
  var loading = index < 4 ? 'eager' : 'lazy';
  var fetchPriority = index < 2 ? 'high' : 'auto';
  var animClass = index < 4 ? '' : 'animate-fade-in';

  return '<div class="gallery-item"><a href="' + fullUrl + '">' +
    '<img src="' + thumbUrl + '" loading="' + loading + '" fetchpriority="' + fetchPriority + '" class="' + animClass + '" />' +
    '</a></div>';
}

describe('SEO — helpers de generation HTML', function () {

  describe('escapeAttr', function () {
    it('echappe les caracteres HTML speciaux', function () {
      expect(escapeAttr('<>&"\'')).toBe('&lt;&gt;&amp;&quot;&#39;');
    });

    it('gere null', function () {
      expect(escapeAttr(null)).toBe('');
    });

    it('gere undefined', function () {
      expect(escapeAttr(undefined)).toBe('');
    });
  });

  describe('formatGalleryDate', function () {
    it('formate une date ISO', function () {
      var d = formatGalleryDate('2025-06-15');
      expect(d).toContain('15');
      expect(d).toContain('2025');
    });

    it('retourne vide pour date invalide', function () {
      expect(formatGalleryDate('abc')).toBe('');
    });

    it('retourne vide pour null', function () {
      expect(formatGalleryDate(null)).toBe('');
    });
  });

  describe('safeExternalUrl', function () {
    it('accepte https', function () {
      expect(safeExternalUrl('https://example.com')).toBe('https://example.com');
    });

    it('accepte http', function () {
      expect(safeExternalUrl('http://example.com')).toBe('http://example.com');
    });

    it('rejette sans protocole', function () {
      expect(safeExternalUrl('example.com')).toBe('');
    });

    it('rejette javascript:', function () {
      expect(safeExternalUrl('javascript:alert(1)')).toBe('');
    });
  });

  describe('artistPlatformIcon', function () {
    it('retourne un SVG pour instagram', function () {
      expect(artistPlatformIcon('instagram')).toContain('instagram');
    });

    it('retourne un SVG pour deezer', function () {
      expect(artistPlatformIcon('deezer')).toContain('deezer');
    });

    it('retourne un SVG par defaut pour plateforme inconnue', function () {
      expect(artistPlatformIcon('unknown')).toContain('default');
    });
  });

  describe('renderArtistLinksSection', function () {
    it('genere le HTML avec les liens', function () {
      var html = renderArtistLinksSection({
        artist: 'ArtisteTest',
        artistLinks: {
          instagram: 'https://instagram.com/artist',
          spotify: 'https://spotify.com/artist'
        }
      });
      expect(html).toContain('artist-links-panel');
      expect(html).toContain('instagram');
      expect(html).toContain('spotify');
    });

    it('retourne vide si pas d artiste', function () {
      var html = renderArtistLinksSection({
        artist: '',
        artistLinks: { instagram: 'https://i.com/a' }
      });
      expect(html).toBe('');
    });

    it('retourne vide si aucun lien valide', function () {
      var html = renderArtistLinksSection({
        artist: 'A',
        artistLinks: {}
      });
      expect(html).toBe('');
    });

    it('retourne vide si liens non http', function () {
      var html = renderArtistLinksSection({
        artist: 'A',
        artistLinks: { instagram: 'javascript:alert(1)' }
      });
      expect(html).toBe('');
    });
  });

  describe('renderGalleryCard', function () {
    it('genere une carte complete', function () {
      var html = renderGalleryCard({
        slug: 'test',
        title: 'Mon Concert',
        artist: 'Artiste',
        venue: 'Salle',
        date: '2025-01-15',
        photos: ['p1.jpg', 'p2.jpg'],
        cover: 'cover.jpg'
      });
      expect(html).toContain('gallery-card');
      expect(html).toContain('Mon Concert');
      expect(html).toContain('2 photos');
    });

    it('genere une carte sans cover', function () {
      var html = renderGalleryCard({
        slug: 'sans-cover',
        title: 'Sans Cover',
        photos: ['p1.jpg'],
        cover: null
      });
      expect(html).toContain('background:#111');
    });
  });

  describe('generateGalleryItemHtml', function () {
    it('eager loading + high priority pour index 0', function () {
      var html = generateGalleryItemHtml({ filename: 'p.jpg' }, 0);
      expect(html).toContain('loading="eager"');
      expect(html).toContain('fetchpriority="high"');
    });

    it('eager loading + high priority pour index 1', function () {
      var html = generateGalleryItemHtml({ filename: 'p.jpg' }, 1);
      expect(html).toContain('loading="eager"');
      expect(html).toContain('fetchpriority="high"');
    });

    it('eager loading sans high priority pour index 2-3', function () {
      var html = generateGalleryItemHtml({ filename: 'p.jpg' }, 2);
      expect(html).toContain('loading="eager"');
      expect(html).not.toContain('fetchpriority="high"');
    });

    it('lazy loading pour index >= 4', function () {
      var html = generateGalleryItemHtml({ filename: 'p.jpg' }, 5);
      expect(html).toContain('loading="lazy"');
    });

    it('animate-fade-in pour index >= 4', function () {
      var html = generateGalleryItemHtml({ filename: 'p.jpg' }, 6);
      expect(html).toContain('animate-fade-in');
    });

    it('pas de animate-fade-in pour index < 4', function () {
      var html = generateGalleryItemHtml({ filename: 'p.jpg' }, 0);
      expect(html).not.toContain('animate-fade-in');
    });
  });
});
