// Sert uniquement les miniatures publiques de /photos et bloque tout le reste.
//
// Les photos originales et le cache de redimensionnement ne doivent JAMAIS être
// accessibles en statique : le site passe par /photos/resize (1600 px max) et
// par les URLs signées du kit presse (/api/hd-image).
const express = require('express');
const path = require('path');

function createPhotosStaticMiddleware(photosDir) {
    const router = express.Router();

    // Seul sous-dossier public : les miniatures générées à l'upload.
    router.use('/thumbnails', express.static(path.join(photosDir, 'thumbnails'), {
        index: false,
        maxAge: '1y',
        immutable: true,
        // Un déploiement peut vivre sous un dossier caché (ex. ~/.t3/...) ;
        // seules les miniatures, dans un répertoire fixe, sont servies ici.
        dotfiles: 'allow'
    }));

    // Tout le reste tombe en 404 : originaux, cache resized/, listings.
    router.use((req, res, next) => {
        if (req.path === '/resize' || req.path.startsWith('/thumbnails/')) return next();
        return res.status(404).send('Not found');
    });

    return router;
}

module.exports = { createPhotosStaticMiddleware };
