// Accès au dossier des photos originales.
// Les originaux vivent hors du dossier statique `photos/` public :
// `paths.photoOriginals` (config.js) pointe hors du DocumentRoot en prod.
const fs = require('fs');
const path = require('path');
const serverConfig = require('../config');

/**
 * Retourne le dossier des originaux.
 * Repli sur `paths.photos` uniquement pour les environnements (tests) dont la
 * configuration mockée ne fournit pas encore `photoOriginals`.
 */
function getOriginalsDir() {
    const paths = serverConfig.getPaths() || {};
    return paths.photoOriginals || paths.photos;
}

const IMAGE_EXT_RE = /\.(jpe?g|png|webp)$/i;

/**
 * Vrai si le nom de fichier a une extension d'image supportée.
 */
function isImageFilename(filename) {
    return IMAGE_EXT_RE.test(String(filename || ''));
}

/**
 * URL statique de la miniature générée à l'upload (`photos/thumbnails/`).
 *
 * Contrairement à `/photos/resize` (rendu à la volée par sharp, soumis au
 * rate-limit et aux limites de processus de l'hébergement), ce fichier est
 * servi directement par le serveur web : c'est le repli fiable quand le
 * redimensionnement dynamique échoue (429, 508, original absent).
 */
function getThumbnailUrl(filename) {
    const name = String(filename || '');
    if (!name) return null;
    const base = name.replace(/\.[^.]+$/, '');
    if (!base) return null;
    return `/photos/thumbnails/${encodeURIComponent(base).replace(/'/g, '%27')}.webp`;
}

/**
 * Vrai si la photo peut réellement s'afficher : l'original existe dans
 * `paths.photoOriginals`, ou à défaut sa miniature statique générée à l'upload.
 *
 * Sert à ne pas rendre de tuile cassée quand `galleries.json` référence encore
 * un fichier supprimé du serveur (cas réel : 32 références mortes en prod).
 * Résultat mémorisé quelques secondes pour éviter un `stat` par photo et par
 * rendu (les pages sont elles-mêmes mises en cache).
 */
const RENDERABLE_TTL_MS = 60 * 1000;
const renderableCache = new Map();

function isPhotoRenderable(filename) {
    const name = String(filename || '');
    if (!isImageFilename(name)) return false;

    const now = Date.now();
    const cached = renderableCache.get(name);
    if (cached && cached.expiresAt > now) return cached.value;

    let value = false;
    const paths = serverConfig.getPaths() || {};
    try {
        const originalsDir = getOriginalsDir();
        const thumbsBase = paths.photos;
        // Configuration incomplète : on ne masque jamais une photo par erreur.
        if (!originalsDir && !thumbsBase) return true;
        if (originalsDir && fs.existsSync(path.join(originalsDir, path.basename(name)))) {
            value = true;
        } else if (thumbsBase) {
            const thumbName = path.basename(name).replace(/\.[^.]+$/, '.webp');
            value = fs.existsSync(path.join(thumbsBase, 'thumbnails', thumbName));
        }
    } catch (e) {
        // En cas d'erreur d'accès disque, on ne masque pas la photo.
        value = true;
    }

    renderableCache.set(name, { value, expiresAt: now + RENDERABLE_TTL_MS });
    return value;
}

/**
 * Filtre une liste de noms de fichiers pour ne garder que ceux qui existent.
 */
function filterRenderablePhotos(photos) {
    return (Array.isArray(photos) ? photos : []).filter(isPhotoRenderable);
}

module.exports = { getOriginalsDir, isImageFilename, getThumbnailUrl, isPhotoRenderable, filterRenderablePhotos };
