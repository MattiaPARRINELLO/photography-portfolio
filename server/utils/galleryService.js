const fs = require('fs');
const path = require('path');

const galleriesPath = path.join(__dirname, '..', '..', 'config', 'galleries.json');

function loadGalleries() {
    try {
        const data = JSON.parse(fs.readFileSync(galleriesPath, 'utf-8'));
        if (!data.galleries) data.galleries = [];
        return data;
    } catch (e) {
        return { metadata: { version: '1.0.0', lastUpdated: null }, galleries: [] };
    }
}

function saveGalleries(data) {
    data.metadata = data.metadata || {};
    data.metadata.lastUpdated = new Date().toISOString();
    fs.writeFileSync(galleriesPath, JSON.stringify(data, null, 2));
    return data;
}

function slugify(str) {
    return (str || '')
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
}

function generateUniqueSlug(base, galleries, excludeId = null) {
    let slug = slugify(base) || 'galerie';
    let candidate = slug;
    let i = 2;
    while (galleries.some(g => g.slug === candidate && g.id !== excludeId)) {
        candidate = `${slug}-${i++}`;
    }
    return candidate;
}

function generateId() {
    return 'g_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function uniqueStrings(values = []) {
    return Array.from(
        new Set(
            values
                .filter(v => typeof v === 'string')
                .map(v => v.trim())
                .filter(Boolean)
        )
    );
}

function sanitizeExternalUrl(value) {
    const raw = (value || '').toString().trim();
    if (!raw) return '';

    if (/^https?:\/\//i.test(raw)) {
        return raw;
    }

    // Accept domain-like values and prepend https for admin convenience
    if (/^[\w.-]+\.[a-z]{2,}([/?#].*)?$/i.test(raw)) {
        return `https://${raw}`;
    }

    return '';
}

function normalizeArtistLinks(input = {}) {
    const src = input || {};
    const instagram = sanitizeExternalUrl(src.instagram || src.insta || src.artistInstagram);
    const deezer = sanitizeExternalUrl(src.deezer || src.artistDeezer);
    const spotify = sanitizeExternalUrl(src.spotify || src.artistSpotify);

    const links = {};
    if (instagram) links.instagram = instagram;
    if (deezer) links.deezer = deezer;
    if (spotify) links.spotify = spotify;
    return links;
}

function mergeArtistLinks(current = {}, updates = {}) {
    return normalizeArtistLinks({
        ...(current || {}),
        ...(updates || {})
    });
}

function listGalleries() {
    const data = loadGalleries();
    return data.galleries.slice().sort((a, b) => {
        const da = (a.date || '').trim();
        const db = (b.date || '').trim();

        // Tri strictement basé sur la date de concert (plus récent -> plus ancien)
        if (da && db && da !== db) return db.localeCompare(da);
        if (da && !db) return -1;
        if (!da && db) return 1;

        // Ordre stable si les dates sont identiques ou absentes
        return (a.title || '').localeCompare(b.title || '');
    });
}

function getGalleryBySlug(slug) {
    return loadGalleries().galleries.find(g => g.slug === slug) || null;
}

function getGalleryById(id) {
    return loadGalleries().galleries.find(g => g.id === id) || null;
}

function createGallery(input) {
    const data = loadGalleries();
    const now = new Date().toISOString();
    const title = (input.title || '').trim();
    if (!title) throw new Error('Le titre est requis');

    const photos = uniqueStrings(Array.isArray(input.photos) ? input.photos : []);
    const uploadedPhotos = uniqueStrings(Array.isArray(input.uploadedPhotos) ? input.uploadedPhotos : []);
    const explicitGalleryOnlyPhotos = uniqueStrings(Array.isArray(input.galleryOnlyPhotos) ? input.galleryOnlyPhotos : []);
    const galleryOnlyPhotos = uniqueStrings([...explicitGalleryOnlyPhotos, ...uploadedPhotos]).filter(name => photos.includes(name));

    const gallery = {
        id: generateId(),
        slug: generateUniqueSlug(input.slug || title, data.galleries),
        title,
        artist: (input.artist || '').trim(),
        venue: (input.venue || '').trim(),
        date: (input.date || '').trim(),
        description: (input.description || '').trim(),
        cover: input.cover || photos[0] || null,
        photos,
        // Photos uploaded from the gallery form should stay gallery-only.
        galleryOnlyPhotos,
        artistLinks: normalizeArtistLinks(input.artistLinks || input),
        published: input.published !== false,
        // When true, photos in this gallery should not appear in the site's main photo listing
        excludeFromMain: !!input.excludeFromMain,
        createdAt: now,
        updatedAt: now
    };

    data.galleries.push(gallery);
    saveGalleries(data);
    return gallery;
}

function updateGallery(id, updates) {
    const data = loadGalleries();
    const idx = data.galleries.findIndex(g => g.id === id);
    if (idx === -1) return null;

    const current = data.galleries[idx];
    const merged = { ...current };

    if (updates.title !== undefined) merged.title = updates.title.trim();
    if (updates.artist !== undefined) merged.artist = updates.artist.trim();
    if (updates.venue !== undefined) merged.venue = updates.venue.trim();
    if (updates.date !== undefined) merged.date = updates.date.trim();
    if (updates.description !== undefined) merged.description = updates.description.trim();
    if (updates.cover !== undefined) merged.cover = updates.cover;
    if (Array.isArray(updates.photos)) merged.photos = uniqueStrings(updates.photos);
    if (!Array.isArray(merged.photos)) merged.photos = [];
    if (!Array.isArray(merged.galleryOnlyPhotos)) merged.galleryOnlyPhotos = [];

    if (Array.isArray(updates.galleryOnlyPhotos)) {
        merged.galleryOnlyPhotos = uniqueStrings(updates.galleryOnlyPhotos);
    }

    if (Array.isArray(updates.uploadedPhotos) && updates.uploadedPhotos.length > 0) {
        merged.galleryOnlyPhotos = uniqueStrings([
            ...merged.galleryOnlyPhotos,
            ...updates.uploadedPhotos
        ]);
    }

    // Keep gallery-only list coherent with current gallery photos.
    merged.galleryOnlyPhotos = merged.galleryOnlyPhotos.filter(name => merged.photos.includes(name));
    if (updates.artistLinks !== undefined || updates.artistInstagram !== undefined || updates.artistDeezer !== undefined || updates.artistSpotify !== undefined) {
        merged.artistLinks = mergeArtistLinks(current.artistLinks, updates.artistLinks || updates);
    }
    if (updates.published !== undefined) merged.published = !!updates.published;
    if (updates.excludeFromMain !== undefined) merged.excludeFromMain = !!updates.excludeFromMain;
    if (updates.slug !== undefined && updates.slug.trim()) {
        merged.slug = generateUniqueSlug(updates.slug, data.galleries, id);
    }
    if (!merged.cover && merged.photos.length > 0) merged.cover = merged.photos[0];
    merged.updatedAt = new Date().toISOString();

    data.galleries[idx] = merged;
    saveGalleries(data);
    return merged;
}

function deleteGallery(id) {
    const data = loadGalleries();
    const before = data.galleries.length;
    data.galleries = data.galleries.filter(g => g.id !== id);
    if (data.galleries.length === before) return false;
    saveGalleries(data);
    return true;
}

module.exports = {
    loadGalleries,
    listGalleries,
    getGalleryBySlug,
    getGalleryById,
    createGallery,
    updateGallery,
    deleteGallery,
    slugify
};
