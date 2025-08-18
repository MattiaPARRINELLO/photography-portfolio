const express = require('express');
const fs = require('fs');
const path = require('path');
const serverConfig = require('../config');
const textUtils = require('../utils/textUtils');
const campaignService = require('../utils/campaignService');

const router = express.Router();
const paths = serverConfig.getPaths();

// Route pour la page d'accueil
router.get('/', (req, res) => {
    console.log('🚀 Route / (accueil) appelée - DEBUG SPÉCIAL');
    console.log('📍 URL demandée:', req.url);
    console.log('📍 Original URL:', req.originalUrl);

    try {
        // Détecter si c'est une visite avec campagne
        const campaignRef = req.query.ref || req.query.utm_campaign;
        let campaignInfo = null;

        if (campaignRef) {
            campaignInfo = campaignService.processCampaignFromQuery(req.query);
            console.log(`🎯 Campagne détectée via URL: ${campaignRef}`);
        }

        const texts = textUtils.loadTexts();
        console.log('📖 Textes chargés pour /');

        const htmlPath = path.join(paths.pages, 'home.html');
        let htmlContent = fs.readFileSync(htmlPath, 'utf-8');
        console.log('📄 HTML lu, taille:', htmlContent.length, 'caractères');

        // Injecter les meta tags ET les informations de campagne
        htmlContent = textUtils.injectMetaTags(htmlContent, texts, req, 'Portfolio', campaignInfo);

        // Si on a une campagne, ajouter un script pour nettoyer l'URL côté client
        if (campaignRef) {
            const urlCleanScript = `
    <script>
        // Nettoyer l'URL côté client après chargement de la page
        if (window.location.search.includes('ref=')) {
            console.log('🔄 Nettoyage URL côté client');
            history.replaceState(null, null, window.location.pathname);
        }
    </script>`;
            htmlContent = htmlContent.replace('</body>', `${urlCleanScript}</body>`);
            console.log('🔄 Script de nettoyage URL ajouté');
        }

        res.send(htmlContent);
    } catch (error) {
        console.error('❌ Erreur lors du chargement de home.html:', error);
        res.sendFile(path.join(paths.pages, 'home.html'));
    }
});

// Route pour servir texts.json publiquement
router.get('/texts.json', (req, res) => {
    try {
        let texts = {};
        if (fs.existsSync(paths.texts)) {
            texts = JSON.parse(fs.readFileSync(paths.texts, 'utf-8'));
        }
        res.json(texts);
    } catch (error) {
        console.error('Erreur lors de la lecture de texts.json:', error);
        res.status(500).json({ error: 'Erreur lors de la lecture des textes' });
    }
});

// Route pour la page Contact
router.get('/contact', (req, res) => {
    console.log('🚀 Route /contact appelée');
    try {
        const texts = textUtils.loadTexts();
        console.log('📖 Textes chargés pour /contact');
        const htmlPath = path.join(paths.pages, 'contact.html');
        let htmlContent = fs.readFileSync(htmlPath, 'utf-8');
        htmlContent = textUtils.injectMetaTags(htmlContent, texts, req, 'Contact');
        res.send(htmlContent);
    } catch (error) {
        console.error('❌ Erreur lors du chargement de contact.html:', error);
        res.sendFile(path.join(paths.pages, 'contact.html'));
    }
});

// Redirection pour /contact/ vers /contact
router.get('/contact/', (req, res) => {
    res.redirect('/contact');
});

// Route pour la page À propos
router.get('/a-propos', (req, res) => {
    console.log('🚀 Route /a-propos appelée');
    try {
        const texts = textUtils.loadTexts();
        console.log('📖 Textes chargés pour /a-propos');
        const htmlPath = path.join(paths.pages, 'about_me.html');
        let htmlContent = fs.readFileSync(htmlPath, 'utf-8');
        htmlContent = textUtils.injectMetaTags(htmlContent, texts, req, 'À propos');
        res.send(htmlContent);
    } catch (error) {
        console.error('❌ Erreur lors du chargement de about_me.html:', error);
        res.sendFile(path.join(paths.pages, 'about_me.html'));
    }
});

// Redirection pour /a-propos/ vers /a-propos
router.get('/a-propos/', (req, res) => {
    res.redirect('/a-propos');
});

// Redirection pour /portfolio vers /
router.get('/portfolio', (req, res) => {
    res.redirect('/');
});

module.exports = router;
