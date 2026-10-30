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

module.exports = { getOriginalsDir, isImageFilename };
