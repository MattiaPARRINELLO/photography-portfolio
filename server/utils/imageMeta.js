// Dimensions intrinsèques des photos (cache mémoire) pour les attributs
// width/height — prévient le CLS sur la maçonnerie sans appeler sharp à chaque requête.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const serverConfig = require('../config');

const paths = serverConfig.getPaths();
const cache = new Map();

// Retourne {width, height} de l'original, ou null (fallback : pas d'attributs).
async function getImageDimensions(filename) {
    const name = String(filename || '').replace(/^.*[\\/]/, ''); // basename, anti-traversal
    if (cache.has(name)) return cache.get(name);
    if (!paths.photos) {
        cache.set(name, null);
        return null;
    }
    const filePath = path.join(paths.photos, name);
    if (!fs.existsSync(filePath)) {
        cache.set(name, null);
        return null;
    }
    try {
        const meta = await sharp(filePath).metadata();
        const dims = meta.width && meta.height ? { width: meta.width, height: meta.height } : null;
        cache.set(name, dims);
        return dims;
    } catch (e) {
        cache.set(name, null);
        return null;
    }
}

module.exports = { getImageDimensions };