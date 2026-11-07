// Génération HTML de la page d'accueil « planche contact ».
// Fonctions pures : reçoivent les galeries publiques et une fonction de
// résolution des dimensions (pour width/height anti-CLS) et rendent des
// fragments prêts à remplacer les placeholders de pages/home.html.

const MONTHS_FR = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
];

function esc(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function resizeUrl(file, width) {
    return `/photos/resize?file=${encodeURIComponent(file)}&w=${width}`;
}

function shortDate(date) {
    // "2026-05-09" -> "09.05.2026"
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
    const [y, m, d] = date.split('-');
    return `${d}.${m}.${y}`;
}

function longDate(date) {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
    const [y, m, d] = date.split('-');
    const month = MONTHS_FR[parseInt(m, 10) - 1] || '';
    return `${parseInt(d, 10)} ${month} ${y}`;
}

function yearOf(date) {
    return date && /^\d{4}/.test(date) ? date.slice(0, 4) : '';
}

function widthAttrs(dims, width) {
    if (!dims || !dims.width || !dims.height) return '';
    return ` width="${width}" height="${Math.round(width * dims.height / dims.width)}"`;
}

function photosOf(gallery) {
    return (gallery && Array.isArray(gallery.photos) ? gallery.photos : []).filter(Boolean);
}

function artistLabel(gallery) {
    return gallery.artist || gallery.title || '';
}

function venueLabel(gallery) {
    return gallery.venue || gallery.city || '';
}

// --- 1. Hero : six colonnes de la planche, offsets verticaux différents ----
function buildHeroColumns(galleries, dimsFor, perColumn = 5, columns = 6) {
    const gigs = galleries.filter(g => photosOf(g).length);
    if (!gigs.length) return '';

    // Distribution en tourniquet sur les concerts pour mélanger les séries.
    const flat = [];
    const maxPhotos = Math.max(...gigs.map(g => photosOf(g).length));
    for (let round = 0; round < maxPhotos; round++) {
        gigs.forEach(g => {
            const photos = photosOf(g);
            if (photos[round]) flat.push({ gallery: g, file: photos[round] });
        });
    }

    const offsets = [0, -90, -40, -130, -20, -70];
    let html = '';
    let cursor = 0;
    for (let c = 0; c < columns; c++) {
        let frames = '';
        for (let i = 0; i < perColumn; i++) {
            const item = flat[cursor % flat.length];
            cursor++;
            if (!item) continue;
            const dims = dimsFor(item.file);
            const first = c === 0 && i === 0;
            const second = c === 0 && i === 1;
            const priority = first ? ' fetchpriority="high"' : second ? '' : ' fetchpriority="low"';
            frames += `
          <figure class="cs-frame"><img src="${resizeUrl(item.file, 320)}"${widthAttrs(dims, 320)} alt="Concert de ${esc(artistLabel(item.gallery))} à ${esc(venueLabel(item.gallery))}" decoding="async"${priority}><figcaption class="cs-frame-strip">${esc(venueLabel(item.gallery))}</figcaption></figure>`;
        }
        html += `
        <div class="cs-col" style="--offset:${offsets[c % offsets.length]}px">${frames}
        </div>`;
    }
    return html;
}

// --- 2. Une bande par concert (5 images, 190px de haut) -------------------
function buildStrips(galleries, dimsFor, perStrip = 6) {
    const rows = galleries.filter(g => photosOf(g).length).map(gallery => {
        const photos = photosOf(gallery).slice(0, perStrip);
        const frames = photos.map((file, i) => {
            const dims = dimsFor(file);
            return `<a class="cs-strip-frame" href="${resizeUrl(file, 1600)}" data-fancybox="strips" data-caption="${esc(artistLabel(gallery))} · ${esc(venueLabel(gallery))}"><img src="${resizeUrl(file, 400)}"${widthAttrs(dims, 400)} alt="Concert de ${esc(artistLabel(gallery))} à ${esc(venueLabel(gallery))}, photo ${i + 1}" loading="lazy" decoding="async"></a>`;
        }).join('');
        const count = photosOf(gallery).length;
        return `
      <article class="cs-strip" data-gig="${esc(gallery.slug)}" data-year="${yearOf(gallery.date)}">
        <div class="cs-strip-frames">${frames}</div>
        <p class="cs-strip-caption">
          <a class="cs-strip-name" href="/galeries/${esc(gallery.slug)}">${esc(gallery.title || artistLabel(gallery))}</a>
          <span class="cs-strip-desc">${count} photos · ${esc(gallery.city || venueLabel(gallery))}</span>
          <span class="cs-strip-date">${shortDate(gallery.date)}</span>
        </p>
      </article>`;
    }).join('');
    return rows;
}

// --- 3. Carnet de route : le line-up, deux extrémités par ligne ----------
function buildIndex(galleries) {
    const groups = new Map();
    galleries.filter(g => photosOf(g).length).forEach(g => {
        const year = yearOf(g.date) || '—';
        if (!groups.has(year)) groups.set(year, []);
        groups.get(year).push(g);
    });

    let html = '';
    groups.forEach((gigs, year) => {
        const rows = gigs.map(g => `
        <li class="cs-row">
          <button type="button" class="cs-row-btn" data-filter-gig="${esc(g.slug)}" aria-pressed="false">
            <img class="cs-row-dot" src="${resizeUrl(photosOf(g)[0], 320)}" width="32" height="32" alt="" loading="lazy">
            <span class="cs-row-text">
              <span class="cs-row-name">${esc(artistLabel(g))}</span>
              <span class="cs-row-venue">${esc(venueLabel(g))}</span>
            </span>
            <span class="cs-row-value">${longDate(g.date)}</span>
          </button>
        </li>`).join('');
        html += `
      <div class="cs-index-group">
        <p class="cs-index-year">${esc(year)}</p>
        <ul class="cs-index-list">${rows}
        </ul>
      </div>`;
    });

    html += `
      <div class="cs-index-foot">
        <p class="cs-index-status" aria-live="polite"></p>
        <button type="button" class="cs-linkbtn" data-filter-gig="">Tout afficher</button>
      </div>`;
    return html;
}

// --- 4. Planche dense : 4 images par concert -----------------------------
function buildMosaic(galleries, dimsFor, perGig = 4) {
    // Sélection en tourniquet : les colonnes de la planche mélangent les
    // concerts au lieu d'empiler quatre images de la même date.
    const picks = galleries.map(g => {
        const photos = photosOf(g);
        const slice = photos.slice(5, 5 + perGig);
        return { g, files: slice.length ? slice : photos.slice(0, perGig) };
    });
    const tiles = [];
    for (let round = 0; round < perGig; round++) {
        picks.forEach(({ g, files }) => {
            if (files[round]) tiles.push({ g, file: files[round] });
        });
    }

    return tiles.map(({ g, file }) => {
        const dims = dimsFor(file);
        return `
        <figure class="cs-tile" data-gig="${esc(g.slug)}" data-year="${yearOf(g.date)}">
          <a href="${resizeUrl(file, 1600)}" data-fancybox="planche" data-caption="${esc(artistLabel(g))} · ${esc(venueLabel(g))}"><img src="${resizeUrl(file, 400)}"${widthAttrs(dims, 400)} alt="Concert de ${esc(artistLabel(g))} à ${esc(venueLabel(g))}" loading="lazy" decoding="async"></a>
          <figcaption class="cs-tile-caption"><a href="/galeries/${esc(g.slug)}">${esc(artistLabel(g))}, ${esc(venueLabel(g))}</a></figcaption>
        </figure>`;
    }).join('');
}

module.exports = {
    buildHeroColumns,
    buildStrips,
    buildIndex,
    buildMosaic,
    shortDate,
    longDate
};
