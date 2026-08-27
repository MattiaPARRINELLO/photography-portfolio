// Garde-fou : en production, exclut des pages publiques les galeries aux données
// manifestement fictives (date invalide/impossible, champs requis absents).
// Le développement local et l'interface d'administration restent non filtrés :
// l'admin doit pouvoir voir et corriger une galerie douteuse.
const galleryService = require('./galleryService');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isManifestlyFake(g) {
    if (!g) return false;
    // Date absente/invalide ou année aberrante (> N+1 ou < 2000) : saisie test typique
    if (g.date) {
        if (!DATE_RE.test(g.date)) return true;
        const year = parseInt(g.date.slice(0, 4), 10);
        const currentYear = new Date().getUTCFullYear();
        if (year > currentYear + 1 || year < 2000) return true;
    }
    // Galerie sans titre, sans artiste et sans lieu : contenu de démonstration
    if (!(g.title || '').trim() && !(g.artist || '').trim() && !(g.venue || '').trim()) return true;
    return false;
}

// Galeries publiques : publiées ET non fictives (en production uniquement)
function getPublicGalleries() {
    const galleries = galleryService.listGalleries().filter(g => g.published !== false);
    if (process.env.NODE_ENV !== 'production') return galleries;
    return galleries.filter(g => {
        if (isManifestlyFake(g)) {
            console.error(`CRITIQUE: galerie aux données fictives exclue du site public (slug: ${g.slug || '?'}). À corriger dans config/galleries.json.`);
            return false;
        }
        return true;
    });
}

module.exports = { getPublicGalleries, isManifestlyFake };