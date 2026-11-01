// Accès au dossier des photos originales.
// Les originaux vivent hors du dossier statique `photos/` public :
// `paths.photoOriginals` (config.js) pointe hors du DocumentRoot en prod.
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

module.exports = { getOriginalsDir, isImageFilename, getThumbnailUrl };
