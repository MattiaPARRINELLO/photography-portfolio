const express = require('express');
const fs = require('fs');
const path = require('path');
const serverConfig = require('../config');
const {
    requireAdminSession,
    requireAdminPage,
    restoreAdminSessionFromCookie,
    setAdminAuthCookie,
    clearAdminAuthCookie
} = require('../middleware/auth');
const linksService = require('../utils/linksService');
const galleryService = require('../utils/galleryService');

const router = express.Router();
const paths = serverConfig.getPaths();

// Route principale d'administration (gère / et /)
router.get(['/', '/'], (req, res) => {
    console.log('🚨 ROUTE ADMIN APPELÉE:', req.url, req.originalUrl);
    console.log('🚨 Headers reçus:', req.headers['user-agent']);

    // Headers pour éviter le cache en développement
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    res.setHeader('X-Powered-By', 'Express-Admin-Route');

    const filePath = path.join(paths.adminPages, 'admin.html');
    console.log('🔍 Serveur admin: Fichier servi depuis:', filePath);
    console.log('🔍 Fichier existe?', fs.existsSync(filePath));
    console.log('🔍 URL demandée:', req.url);

    // Vérifier que le fichier existe
    if (fs.existsSync(filePath)) {
        try {
            const stats = fs.statSync(filePath);
            console.log('📏 Taille fichier:', stats.size, 'bytes');
            console.log('📅 Dernière modification:', stats.mtime);

            res.sendFile(filePath, (err) => {
                if (err) {
                    console.error('❌ Erreur sendFile:', err);
                    res.status(500).send('Erreur lors de l\'envoi du fichier');
                } else {
                    console.log('✅ Fichier admin.html envoyé avec succès');
                }
            });
        } catch (error) {
            console.error('❌ Erreur stats fichier:', error);
            res.status(500).send('Erreur lors de la lecture du fichier');
        }
    } else {
        console.error('❌ Fichier admin.html introuvable:', filePath);
        res.status(404).send('Page d\'administration non trouvée');
    }
});

// Route pour l'éditeur de texte
router.get('/text-editor', (req, res) => {
    res.sendFile(path.join(paths.adminPages, 'text-editor.html'));
});

// Redirection pour /admin/text-editor/ vers /admin/text-editor
router.get('/text-editor/', (req, res) => {
    res.redirect('/admin/text-editor');
});

// Route pour vérifier le statut de la session
router.get('/session-status', (req, res) => {
    const isLoggedIn = !!req.session.isAdmin || restoreAdminSessionFromCookie(req);
    res.json({ isLoggedIn });
});

// Route de connexion admin
router.post('/login', (req, res) => {
    const { password } = req.body;
    const ADMIN_PASSWORD = serverConfig.adminPassword;

    if (password === ADMIN_PASSWORD) {
        req.session.isAdmin = true;
        setAdminAuthCookie(res);
        res.json({ success: true, message: 'Connexion réussie' });
    } else {
        res.status(401).json({ error: 'Mot de passe incorrect' });
    }
});

// Route de déconnexion admin
router.post('/logout', (req, res) => {
    clearAdminAuthCookie(res);
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Erreur lors de la déconnexion' });
        }
        res.json({ success: true, message: 'Déconnexion réussie' });
    });
});

// Route pour vérifier le statut de connexion
router.get('/status', (req, res) => {
    const isLoggedIn = !!req.session.isAdmin || restoreAdminSessionFromCookie(req);
    res.json({ isLoggedIn });
});

// Route pour récupérer la configuration
router.get('/config', requireAdminSession, (req, res) => {
    try {
        const currentConfig = JSON.parse(fs.readFileSync(paths.config, 'utf-8'));
        res.json(currentConfig);
    } catch (error) {
        console.error('Erreur lors de la lecture de la configuration:', error);
        res.status(500).json({ error: 'Erreur lors de la lecture de la configuration' });
    }
});

// Route pour mettre à jour la configuration
router.put('/config', requireAdminSession, (req, res) => {
    try {
        const newConfig = req.body;
        fs.writeFileSync(paths.config, JSON.stringify(newConfig, null, 2));

        // Recharger la configuration en mémoire
        serverConfig.reloadConfig();

        res.json({ success: true, message: 'Configuration mise à jour avec succès' });
    } catch (error) {
        console.error('Erreur lors de la sauvegarde de la configuration:', error);
        res.status(500).json({ error: 'Erreur lors de la sauvegarde: ' + error.message });
    }
});

// =============================================
// ROUTES POUR LA GESTION DES LIENS (/links)
// =============================================

// Route pour la page d'administration des liens
router.get('/links', (req, res) => {
    res.sendFile(path.join(paths.adminPages, 'links.html'));
});

// Redirection pour /admin/links/ vers /admin/links
router.get('/links/', (req, res) => {
    res.redirect('/admin/links');
});

// Route pour vérifier l'authentification (utilisée par la page links.html)
router.get('/check-auth', (req, res) => {
    if (req.session.isAdmin || restoreAdminSessionFromCookie(req)) {
        res.json({ authenticated: true });
    } else {
        res.status(401).json({ authenticated: false });
    }
});

// API: Récupérer la configuration des liens
router.get('/api/links', requireAdminSession, (req, res) => {
    try {
        const config = linksService.loadLinksConfig();
        res.json(config);
    } catch (error) {
        console.error('Erreur lors de la lecture de links.json:', error);
        res.status(500).json({ error: 'Erreur lors de la lecture de la configuration des liens' });
    }
});

// API: Mettre à jour toute la configuration des liens
router.put('/api/links', requireAdminSession, (req, res) => {
    try {
        const newConfig = req.body;
        const success = linksService.saveLinksConfig(newConfig);

        if (success) {
            res.json({ success: true, message: 'Configuration des liens mise à jour' });
        } else {
            res.status(500).json({ error: 'Erreur lors de la sauvegarde' });
        }
    } catch (error) {
        console.error('Erreur lors de la sauvegarde de links.json:', error);
        res.status(500).json({ error: 'Erreur lors de la sauvegarde: ' + error.message });
    }
});

// API: Ajouter un nouveau lien
router.post('/api/links/add', requireAdminSession, (req, res) => {
    try {
        const linkData = req.body;
        const config = linksService.addLink(linkData);
        res.json({ success: true, config });
    } catch (error) {
        console.error('Erreur lors de l\'ajout du lien:', error);
        res.status(500).json({ error: 'Erreur lors de l\'ajout du lien' });
    }
});

// API: Mettre à jour un lien existant
router.put('/api/links/:linkId', requireAdminSession, (req, res) => {
    try {
        const { linkId } = req.params;
        const updates = req.body;
        const config = linksService.updateLink(linkId, updates);

        if (config) {
            res.json({ success: true, config });
        } else {
            res.status(404).json({ error: 'Lien non trouvé' });
        }
    } catch (error) {
        console.error('Erreur lors de la mise à jour du lien:', error);
        res.status(500).json({ error: 'Erreur lors de la mise à jour du lien' });
    }
});

// API: Supprimer un lien
router.delete('/api/links/:linkId', requireAdminSession, (req, res) => {
    try {
        const { linkId } = req.params;
        const config = linksService.deleteLink(linkId);

        if (config) {
            res.json({ success: true, config });
        } else {
            res.status(404).json({ error: 'Lien non trouvé' });
        }
    } catch (error) {
        console.error('Erreur lors de la suppression du lien:', error);
        res.status(500).json({ error: 'Erreur lors de la suppression du lien' });
    }
});

// API: Réordonner les liens
router.post('/api/links/reorder', requireAdminSession, (req, res) => {
    try {
        const { orderedIds } = req.body;
        const config = linksService.reorderLinks(orderedIds);
        res.json({ success: true, config });
    } catch (error) {
        console.error('Erreur lors du réordonnancement des liens:', error);
        res.status(500).json({ error: 'Erreur lors du réordonnancement' });
    }
});

// API: Mettre à jour le profil
router.put('/api/links/profile', requireAdminSession, (req, res) => {
    try {
        const profileData = req.body;
        const config = linksService.updateProfile(profileData);
        res.json({ success: true, config });
    } catch (error) {
        console.error('Erreur lors de la mise à jour du profil:', error);
        res.status(500).json({ error: 'Erreur lors de la mise à jour du profil' });
    }
});

// API: Récupérer les icônes disponibles
router.get('/api/links/icons', requireAdminSession, (req, res) => {
    try {
        const icons = linksService.getAvailableIcons();
        res.json({ icons });
    } catch (error) {
        res.status(500).json({ error: 'Erreur lors de la récupération des icônes' });
    }
});

// =============================================
// ROUTES POUR LE BANDEAU ÉVÉNEMENT
// =============================================

function handleEventBanner(req, res) {
    try {
        if (req.method === 'POST') {
            const { message, url, icon, days, daysUntilExpiration } = req.body || {};

            if (!message || message.trim() === '') {
                return res.status(400).json({ error: 'Le message est requis' });
            }

            const durationDays = days ?? daysUntilExpiration ?? 7;
            const config = linksService.setEventBanner(
                { message: message.trim(), url: url || '', icon: icon || 'camera' },
                durationDays
            );

            const timeRemaining = linksService.getEventTimeRemaining(config.event);
            return res.json({ success: true, event: config.event, timeRemaining });
        }

        if (req.method === 'DELETE') {
            const config = linksService.clearEventBanner();
            return res.json({ success: true, event: config.event });
        }

        // GET (ou fallback lecture)
        const config = linksService.loadLinksConfig();
        const event = config.event || { enabled: false };
        const isActive = linksService.isEventActive(event);
        const timeRemaining = linksService.getEventTimeRemaining(event);
        return res.json({ event, isActive, timeRemaining });
    } catch (error) {
        console.error('Erreur bandeau événement:', error);
        return res.status(500).json({ error: 'Erreur bandeau événement' });
    }
}

router.all(['/api/links/event', '/api/links/event/'], requireAdminSession, handleEventBanner);

// =============================================
// ROUTES POUR LA GESTION DES GALERIES PAR ARTISTE
// =============================================

// Page admin galeries
router.get('/galleries', (req, res) => {
    res.sendFile(path.join(paths.adminPages, 'galleries.html'));
});
router.get('/galleries/', (req, res) => res.redirect('/admin/galleries'));

// API: liste complète des galeries (admin)
router.get('/api/galleries', requireAdminSession, (req, res) => {
    try {
        res.json({ galleries: galleryService.listGalleries() });
    } catch (error) {
        console.error('Erreur lecture galeries:', error);
        res.status(500).json({ error: 'Erreur lors de la lecture des galeries' });
    }
});

// API: récupérer une galerie par id
router.get('/api/galleries/:id', requireAdminSession, (req, res) => {
    const gallery = galleryService.getGalleryById(req.params.id);
    if (!gallery) return res.status(404).json({ error: 'Galerie non trouvée' });
    res.json({ gallery });
});

// API: créer une galerie
router.post('/api/galleries', requireAdminSession, (req, res) => {
    try {
        const gallery = galleryService.createGallery(req.body || {});
        res.json({ success: true, gallery });
    } catch (error) {
        console.error('Erreur création galerie:', error);
        res.status(400).json({ error: error.message || 'Erreur lors de la création' });
    }
});

// API: mettre à jour une galerie
router.put('/api/galleries/:id', requireAdminSession, (req, res) => {
    try {
        const gallery = galleryService.updateGallery(req.params.id, req.body || {});
        if (!gallery) return res.status(404).json({ error: 'Galerie non trouvée' });
        res.json({ success: true, gallery });
    } catch (error) {
        console.error('Erreur maj galerie:', error);
        res.status(400).json({ error: error.message || 'Erreur lors de la mise à jour' });
    }
});

// API: supprimer une galerie
router.delete('/api/galleries/:id', requireAdminSession, (req, res) => {
    const ok = galleryService.deleteGallery(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Galerie non trouvée' });
    res.json({ success: true });
});

module.exports = router;
