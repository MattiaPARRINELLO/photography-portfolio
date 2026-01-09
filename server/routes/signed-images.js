const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// Clé secrète pour signer les URLs (à stocker dans config ou variable d'environnement)
const SECRET_KEY = process.env.IMAGE_SECRET_KEY || crypto.randomBytes(32).toString('hex');

// Durée de validité des URLs signées (en secondes)
const URL_EXPIRY = 3600; // 1 heure

/**
 * Génère une signature HMAC pour une URL d'image avec expiration
 */
function generateSignature(imagePath, expiresAt) {
    const data = `${imagePath}:${expiresAt}`;
    return crypto.createHmac('sha256', SECRET_KEY).update(data).digest('hex');
}

/**
 * Vérifie la validité d'une signature
 */
function verifySignature(imagePath, expiresAt, signature) {
    const expectedSignature = generateSignature(imagePath, expiresAt);
    return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
    );
}

/**
 * Route pour demander une URL signée pour une image HD
 * POST /api/request-hd-access
 * Body: { imagePath: string }
 */
router.post('/request-hd-access', (req, res) => {
    try {
        const { imagePath } = req.body;

        console.log('📸 Demande d\'accès HD reçue:', imagePath);

        if (!imagePath) {
            console.log('❌ Erreur: imagePath manquant');
            return res.status(400).json({ error: 'imagePath est requis' });
        }

        // Extraire le chemin relatif si c'est une URL complète
        let relativePath = imagePath;
        try {
            // Si c'est une URL, extraire le pathname
            if (imagePath.startsWith('http://') || imagePath.startsWith('https://') || imagePath.startsWith('/')) {
                const url = new URL(imagePath, 'http://localhost');
                relativePath = url.pathname;
                // Retirer le préfixe /photos/ si présent
                if (relativePath.startsWith('/photos/')) {
                    relativePath = relativePath.substring(8);
                }
            }
        } catch (e) {
            console.log('⚠️ Erreur parsing URL:', e.message);
        }

        console.log('📁 Chemin relatif extrait:', relativePath);

        // Validation basique du chemin (éviter path traversal)
        const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');

        // Vérifier que le fichier existe dans le dossier photos
        const fullPath = path.join(process.cwd(), 'photos', normalized);
        console.log('🔍 Vérification existence:', fullPath);

        if (!fs.existsSync(fullPath)) {
            console.log('❌ Fichier non trouvé:', fullPath);
            // En mode dev, retourner l'URL originale sans signature
            if (process.env.NODE_ENV !== 'production') {
                console.log('🔧 Mode dev: retour URL originale');
                return res.json({
                    success: true,
                    url: imagePath,
                    expiresAt: new Date(Date.now() + URL_EXPIRY * 1000).toISOString()
                });
            }
            return res.status(404).json({ error: 'Image non trouvée', path: fullPath });
        }

        // Générer l'URL signée
        const expiresAt = Math.floor(Date.now() / 1000) + URL_EXPIRY;
        const signature = generateSignature(normalized, expiresAt);

        const signedUrl = `/api/hd-image?path=${encodeURIComponent(normalized)}&expires=${expiresAt}&signature=${signature}`;

        console.log('✅ URL signée générée:', signedUrl);

        res.json({
            success: true,
            url: signedUrl,
            expiresAt: new Date(expiresAt * 1000).toISOString()
        });
    } catch (error) {
        console.error('❌ Erreur lors de la génération de l\'URL signée:', error);
        res.status(500).json({ error: 'Erreur serveur', message: error.message });
    }
});

/**
 * Route pour servir l'image HD avec vérification de signature
 * GET /api/hd-image?path=...&expires=...&signature=...
 */
router.get('/hd-image', (req, res) => {
    try {
        const { path: imagePath, expires, signature } = req.query;

        if (!imagePath || !expires || !signature) {
            return res.status(400).send('Paramètres manquants');
        }

        // Vérifier l'expiration
        const expiresAt = parseInt(expires, 10);
        const now = Math.floor(Date.now() / 1000);

        if (now > expiresAt) {
            return res.status(403).send('URL expirée');
        }

        // Vérifier la signature
        const normalized = path.normalize(imagePath).replace(/^(\.\.(\/|\\|$))+/, '');

        try {
            if (!verifySignature(normalized, expiresAt, signature)) {
                return res.status(403).send('Signature invalide');
            }
        } catch (err) {
            return res.status(403).send('Signature invalide');
        }

        // Servir l'image
        const fullPath = path.join(process.cwd(), 'photos', normalized);

        if (!fs.existsSync(fullPath)) {
            return res.status(404).send('Image non trouvée');
        }

        // Ajouter des headers pour empêcher la mise en cache prolongée
        res.setHeader('Cache-Control', 'private, no-store, max-age=300');
        res.setHeader('X-Content-Type-Options', 'nosniff');

        res.sendFile(fullPath);
    } catch (error) {
        console.error('Erreur lors de la récupération de l\'image HD:', error);
        res.status(500).send('Erreur serveur');
    }
});

module.exports = router;
