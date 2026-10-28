const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { rateLimit } = require('express-rate-limit');
const galleryService = require('../utils/galleryService');
const { getOriginalsDir, isImageFilename } = require('../utils/photoStorage');

// Clé secrète pour signer les URLs
const SECRET_KEY = process.env.IMAGE_SECRET_KEY;
if (!SECRET_KEY) throw new Error('IMAGE_SECRET_KEY doit être définie dans .env');

// Durée de validité des URLs signées (en secondes)
const URL_EXPIRY = 3600; // 1 heure

// Nombre de photos HD offertes par galerie (kit presse)
const PRESS_KIT_PHOTOS = 3;

// Accès HD strictement limité : un téléchargement massif n'est pas possible.
const hdLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: 'Trop de demandes HD, réessayez plus tard.'
});

/**
 * Génère une signature HMAC pour une URL d'image avec expiration
 */
function generateSignature(imagePath, expiresAt) {
    const data = `${imagePath}:${expiresAt}`;
    return crypto.createHmac('sha256', SECRET_KEY).update(data).digest('hex');
}

/**
 * Vérifie la validité d'une signature sans jamais lever d'exception
 * (longueurs différentes → timingSafeEqual lèverait une TypeError → 500).
 */
function verifySignature(imagePath, expiresAt, signature) {
    if (typeof signature !== 'string' || signature.length === 0) return false;
    const expectedSignature = generateSignature(imagePath, expiresAt);
    const userBuf = Buffer.from(signature, 'hex');
    const expectedBuf = Buffer.from(expectedSignature, 'hex');
    if (userBuf.length === 0 || userBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(userBuf, expectedBuf);
}

/**
 * Photos HD autorisées : les 3 premières photos de chaque galerie publiée,
 * soit exactement ce que propose le kit presse. Tout le reste est refusé.
 */
function getAllowedPressPhotos() {
    const allowed = new Set();
    try {
        const galleries = galleryService.loadGalleries().galleries || [];
        for (const gallery of galleries) {
            if (gallery.published === false) continue;
            (gallery.photos || []).slice(0, PRESS_KIT_PHOTOS).forEach((file) => {
                if (file) allowed.add(path.basename(String(file)));
            });
        }
    } catch (e) {
        console.warn('Impossible de construire la liste des photos presse:', e && e.message);
    }
    return allowed;
}

function isAllowedForHd(filename, allowedPhotos) {
    // Sans aucune galerie configurée (dev), on ne bloque pas pour ne pas casser
    // le kit presse local. En production galleries.json existe toujours.
    if (allowedPhotos.size === 0 && process.env.NODE_ENV !== 'production') return true;
    return allowedPhotos.has(path.basename(filename));
}

/**
 * Résout un chemin de photo dans le dossier des originaux, en refusant
 * toute sortie du répertoire (path traversal).
 */
function resolveOriginal(filename) {
    const originalsDir = getOriginalsDir();
    if (!originalsDir) return null;
    const base = path.basename(String(filename || ''));
    if (!isImageFilename(base)) return null;
    const target = path.resolve(originalsDir, base);
    if (!target.startsWith(path.resolve(originalsDir) + path.sep)) return null;
    return target;
}

/**
 * Route pour demander une URL signée pour une image HD
 * POST /api/request-hd-access
 * Body: { imagePath: string }
 */
router.post('/request-hd-access', (req, res) => {
    try {
        const { imagePath } = req.body;

        if (!imagePath) {
            return res.status(400).json({ error: 'imagePath est requis' });
        }

        // Extraire le chemin relatif si c'est une URL complète
        let relativePath = imagePath;
        try {
            if (imagePath.startsWith('http://') || imagePath.startsWith('https://') || imagePath.startsWith('/')) {
                const url = new URL(imagePath, 'http://localhost');
                relativePath = url.pathname;
                if (relativePath.startsWith('/photos/')) {
                    relativePath = relativePath.substring(8);
                }
            }
        } catch (e) {
            // URL invalide: garder le chemin tel quel
        }

        // Validation basique du chemin (éviter path traversal)
        const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
        const filename = path.basename(normalized);

        // Restriction à la sélection presse (3 photos par galerie publiée)
        const allowedPhotos = getAllowedPressPhotos();
        if (!isAllowedForHd(filename, allowedPhotos)) {
            return res.status(403).json({ error: 'Photo non autorisée en HD' });
        }

        // Vérifier que le fichier existe dans le dossier des originaux
        const fullPath = resolveOriginal(filename);

        if (!fullPath || !fs.existsSync(fullPath)) {
            return res.status(404).json({ error: 'Image non trouvée' });
        }

        // Générer l'URL signée
        const expiresAt = Math.floor(Date.now() / 1000) + URL_EXPIRY;
        const signature = generateSignature(filename, expiresAt);

        const signedUrl = `/api/hd-image?path=${encodeURIComponent(filename)}&expires=${expiresAt}&signature=${signature}`;

        res.json({
            success: true,
            url: signedUrl,
            expiresAt: new Date(expiresAt * 1000).toISOString()
        });
    } catch (error) {
        console.error('❌ Erreur lors de la génération de l\'URL signée:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

/**
 * Route pour servir l'image HD avec vérification de signature
 * GET /api/hd-image?path=...&expires=...&signature=...
 */
router.get('/hd-image', hdLimiter, (req, res) => {
    try {
        const { path: imagePath, expires, signature } = req.query;

        if (!imagePath || !expires || !signature) {
            return res.status(400).send('Paramètres manquants');
        }

        // Vérifier l'expiration
        const expiresAt = parseInt(expires, 10);
        const now = Math.floor(Date.now() / 1000);

        if (!Number.isFinite(expiresAt) || now > expiresAt) {
            return res.status(403).send('URL expirée');
        }

        // Vérifier la signature
        const normalized = path.normalize(imagePath).replace(/^(\.\.(\/|\\|$))+/, '');
        const filename = path.basename(normalized);

        if (!verifySignature(filename, expiresAt, signature)) {
            return res.status(403).send('Signature invalide');
        }

        const fullPath = resolveOriginal(filename);

        if (!fullPath || !fs.existsSync(fullPath)) {
            return res.status(404).send('Image non trouvée');
        }

        // Jamais de cache : une URL signée ne doit pas survivre à son expiration.
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');

        res.sendFile(fullPath);
    } catch (error) {
        console.error('Erreur lors de la récupération de l\'image HD:', error);
        res.status(500).send('Erreur serveur');
    }
});

module.exports = router;
module.exports.generateSignature = generateSignature;
module.exports.verifySignature = verifySignature;
