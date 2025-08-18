const express = require('express');
const fs = require('fs');
const path = require('path');
const serverConfig = require('../config');
const { requireAdminSession, requireAdminPage } = require('../middleware/auth');

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
    res.json({ isLoggedIn: !!req.session.isAdmin });
});

// Route de connexion admin
router.post('/login', (req, res) => {
    const { password } = req.body;
    const ADMIN_PASSWORD = serverConfig.adminPassword;

    if (password === ADMIN_PASSWORD) {
        req.session.isAdmin = true;
        res.json({ success: true, message: 'Connexion réussie' });
    } else {
        res.status(401).json({ error: 'Mot de passe incorrect' });
    }
});

// Route de déconnexion admin
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Erreur lors de la déconnexion' });
        }
        res.json({ success: true, message: 'Déconnexion réussie' });
    });
});

// Route pour vérifier le statut de connexion
router.get('/status', (req, res) => {
    res.json({ isLoggedIn: !!req.session.isAdmin });
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

module.exports = router;
