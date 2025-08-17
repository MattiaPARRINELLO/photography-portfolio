const express = require('express');
const fs = require('fs');
const path = require('path');
const serverConfig = require('../config');
const { requireAdminSession, requireAdminPage } = require('../middleware/auth');

const router = express.Router();
const paths = serverConfig.getPaths();

// ===== ROUTES TEXTES =====

// Route admin : récupérer les textes
router.get('/admin/texts', requireAdminSession, (req, res) => {
    try {
        let texts = {};
        if (fs.existsSync(paths.texts)) {
            texts = JSON.parse(fs.readFileSync(paths.texts, 'utf-8'));
        }
        res.json(texts);
    } catch (error) {
        console.error('Erreur lors de la lecture des textes:', error);
        res.status(500).json({ error: 'Erreur lors de la lecture des textes: ' + error.message });
    }
});

// Route admin : sauvegarder les textes
router.post('/admin/texts', requireAdminSession, (req, res) => {
    console.log('Session admin lors de la sauvegarde:', req.session.isAdmin);
    try {
        const texts = req.body;
        fs.writeFileSync(paths.texts, JSON.stringify(texts, null, 2));
        console.log('Textes sauvegardés avec succès');
        res.json({ success: true, message: 'Textes sauvegardés avec succès' });
    } catch (error) {
        console.error('Erreur lors de la sauvegarde des textes:', error);
        res.status(500).json({ error: 'Erreur lors de la sauvegarde: ' + error.message });
    }
});

// Route admin : récupérer un texte spécifique
router.get('/admin/texts/:key', requireAdminSession, (req, res) => {
    try {
        let texts = {};
        if (fs.existsSync(paths.texts)) {
            texts = JSON.parse(fs.readFileSync(paths.texts, 'utf-8'));
        }
        const key = req.params.key;
        res.json({ key, value: texts[key] || '' });
    } catch (error) {
        console.error('Erreur lors de la lecture du texte:', error);
        res.status(500).json({ error: 'Erreur lors de la lecture du texte: ' + error.message });
    }
});

// Route admin : mettre à jour un texte spécifique
router.put('/admin/texts/:key', requireAdminSession, (req, res) => {
    try {
        let texts = {};
        if (fs.existsSync(paths.texts)) {
            texts = JSON.parse(fs.readFileSync(paths.texts, 'utf-8'));
        }

        const key = req.params.key;
        const { value } = req.body;
        texts[key] = value;

        fs.writeFileSync(paths.texts, JSON.stringify(texts, null, 2));
        res.json({ success: true, message: `Texte "${key}" mis à jour avec succès` });
    } catch (error) {
        console.error('Erreur lors de la mise à jour du texte:', error);
        res.status(500).json({ error: 'Erreur lors de la mise à jour: ' + error.message });
    }
});

// ===== ROUTES CAMPAGNES =====

// Route admin : page de gestion des campagnes
router.get('/admin/campaigns', requireAdminPage, (req, res) => {
    console.log('🎯 Route campaigns appelée - session:', req.session.isAdmin);
    res.sendFile(path.join(paths.adminPages, 'campaigns.html'));
});

// Route admin API : créer une nouvelle campagne
router.post('/admin/api/campaigns', requireAdminSession, (req, res) => {
    try {
        const { id, name, source, medium, description } = req.body;

        // Validation
        if (!id || !name || !source) {
            return res.status(400).json({ error: 'ID, nom et source sont requis' });
        }

        // Vérifier que l'ID n'existe pas déjà
        if (req.app.locals.campaignManager.campaignExists(id)) {
            return res.status(400).json({ error: 'Cet ID de campagne existe déjà' });
        }

        const campaign = req.app.locals.campaignManager.createCampaign({
            id, name, source, medium, description
        });

        res.json({ success: true, campaign });
    } catch (error) {
        console.error('❌ Erreur lors de la création de la campagne:', error);
        res.status(500).json({ error: 'Erreur lors de la création de la campagne' });
    }
});

// Route admin API : obtenir toutes les campagnes avec leurs stats
router.get('/admin/api/campaigns', requireAdminSession, (req, res) => {
    try {
        const campaigns = req.app.locals.campaignManager.getAllCampaigns();
        const stats = req.app.locals.campaignManager.getCampaignStats();
        res.json({ campaigns, stats });
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des campagnes:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération des campagnes' });
    }
});

// Route admin API : supprimer une campagne
router.delete('/admin/api/campaigns/:id', requireAdminSession, (req, res) => {
    try {
        const campaignId = req.params.id;
        const success = req.app.locals.campaignManager.deleteCampaign(campaignId);

        if (success) {
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Campagne non trouvée' });
        }
    } catch (error) {
        console.error('❌ Erreur lors de la suppression de la campagne:', error);
        res.status(500).json({ error: 'Erreur lors de la suppression de la campagne' });
    }
});

module.exports = router;
