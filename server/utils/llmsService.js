const fs = require('fs');
const path = require('path');
const { getPublicGalleries } = require('./dataSanity');

const paths = { root: path.resolve(__dirname, '..', '..') };

// Cache 5 min : même logique que les pages (maj à l'ajout/édition de galerie)
const cache = new Map();
const TTL = 5 * 60 * 1000;

function getCached(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        cache.delete(key);
        return null;
    }
    return entry.value;
}

function setCache(key, value) {
    cache.set(key, { value, expiresAt: Date.now() + TTL });
}

function formatGalleryDate(iso) {
    if (!iso) return '';
    try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) { return ''; }
}

function galleryLines(galleries, max) {
    return galleries.slice(0, max).map(g => {
        const parts = [g.title, g.artist, g.venue, formatGalleryDate(g.date)].filter(Boolean);
        const url = `https://www.photo.mprnl.fr/galeries/${encodeURIComponent(g.slug)}`;
        return `- [${parts.join(' — ')}](${url})`;
    }).join('\n');
}

// Section auto-générée (liste des galeries publiées) injectée à la place du marqueur
function autoGalleriesBlock(markdownStyle) {
    const galleries = getPublicGalleries();
    if (!galleries.length) return markdownStyle ? '_Aucune galerie publiée pour le moment._' : 'Dernières galeries : (aucune pour le moment)';
    if (markdownStyle) {
        return `${galleries.length} galeries publiées :\n${galleryLines(galleries, 40)}\n Liste complète : https://www.photo.mprnl.fr/galeries`;
    }
    return `Dernières galeries :\n${galleryLines(galleries, 5)}\nToutes les galeries : https://www.photo.mprnl.fr/galeries`;
}

// Injecte le bloc dynamique dans le fichier statique (fallback : fichier brut si erreur)
function renderLlmsFile(filename) {
    const cached = getCached(filename);
    if (cached !== null) return cached;
    try {
        const filePath = path.join(paths.root, filename);
        let content = fs.readFileSync(filePath, 'utf-8');
        content = content.replace('<!-- AUTO_GALLERIES -->', autoGalleriesBlock(filename.endsWith('.md')));
        setCache(filename, content);
        return content;
    } catch (e) {
        console.error(`llmsService: lecture ${filename} impossible:`, e.message);
        return null;
    }
}

function generateLlmsTxt() {
    return renderLlmsFile('llms.txt');
}

function generateLlmsFull() {
    return renderLlmsFile('llms-full.md');
}

module.exports = { generateLlmsTxt, generateLlmsFull };
