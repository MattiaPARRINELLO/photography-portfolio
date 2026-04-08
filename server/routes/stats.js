const express = require('express');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const serverConfig = require('../config');
const { requireAdminSession } = require('../middleware/auth');
const campaignService = require('../utils/campaignService');

const router = express.Router();
const paths = serverConfig.getPaths();

// ============================================
// PROTECTION ANTI-SPAM - RATE LIMITING
// ============================================
//
// Stocke les tentatives d'envoi par IP pour limiter
// le nombre de messages qu'une même IP peut envoyer.
//
// Configuration :
// - MAX_EMAILS_PER_HOUR : Maximum d'emails par heure par IP
// - CLEANUP_INTERVAL : Nettoyage des anciennes entrées

const MAX_EMAILS_PER_HOUR = 5;
const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 heure
const rateLimitStore = new Map(); // IP -> { count, firstAttempt }

// Nettoie les entrées expirées toutes les heures
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of rateLimitStore) {
    if (now - data.firstAttempt > CLEANUP_INTERVAL) {
      rateLimitStore.delete(ip);
    }
  }
}, CLEANUP_INTERVAL);

// ============================================
// LISTE NOIRE DE MOTS SPAM
// ============================================
// Mots souvent utilisés dans les messages spam

const SPAM_KEYWORDS = [
  'casino', 'viagra', 'crypto', 'bitcoin', 'lottery', 'winner',
  'click here', 'free money', 'make money fast', 'nigerian prince',
  'pills', 'weight loss', 'earn extra', 'work from home',
  'investment opportunity', 'limited time', 'act now', 'urgent'
];

// ============================================
// CLÉ SECRÈTE POUR SIGNATURE DES REQUÊTES
// ============================================
// Cette clé est utilisée pour valider que la requête
// vient bien du formulaire et non d'un appel API direct.
// Elle est combinée avec le timestamp pour créer une signature.

const API_SECRET = process.env.CONTACT_API_SECRET || 'mp-contact-form-2024-secret-key';

// ===== ROUTES DE COMMUNICATION =====

// Route pour l'envoi d'email (avec protection anti-spam et anti-API abuse)
router.post('/send-mail', async (req, res) => {
    const { email, subject, message, _honeypot, _timestamp, _token, _signature } = req.body;
    const clientIP = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    
    console.log('📧 Tentative d\'envoi de mail:', { 
        email, 
        subject, 
        messageLength: message ? message.length : 0,
        ip: clientIP 
    });

    // ============================================
    // PROTECTION ANTI-API ABUSE
    // ============================================
    // Ces vérifications empêchent l'utilisation directe
    // de l'API via curl, Postman ou scripts.

    // VÉRIFICATION A : Headers requis
    // Le formulaire envoie ces headers, pas les appels directs
    const contentType = req.headers['content-type'];
    const origin = req.headers['origin'];
    const referer = req.headers['referer'];
    
    if (!contentType || !contentType.includes('application/json')) {
        console.warn('🚫 API abuse: Content-Type invalide depuis IP:', clientIP);
        return res.status(400).json({ error: 'Requête invalide' });
    }
    
    // VÉRIFICATION B : Origin/Referer
    // Doit venir de notre propre domaine
    const allowedOrigins = [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'https://mattiaparrinello.com',
        'https://www.mattiaparrinello.com',
        process.env.SITE_URL
    ].filter(Boolean);
    
    const requestOrigin = origin || referer;
    const isValidOrigin = requestOrigin && allowedOrigins.some(allowed => 
        requestOrigin.startsWith(allowed)
    );
    
    if (!isValidOrigin) {
        console.warn('🚫 API abuse: Origin invalide:', requestOrigin, 'depuis IP:', clientIP);
        return res.status(403).json({ error: 'Accès non autorisé' });
    }

    // VÉRIFICATION C : Timestamp obligatoire et valide
    // Le timestamp doit être présent et récent (< 10 minutes)
    if (!_timestamp) {
        console.warn('🚫 API abuse: Timestamp manquant depuis IP:', clientIP);
        return res.status(400).json({ error: 'Requête invalide - données manquantes' });
    }
    
    const timestamp = parseInt(_timestamp);
    const age = Date.now() - timestamp;
    
    // Le formulaire ne peut pas être soumis après 10 minutes
    if (age > 10 * 60 * 1000) {
        console.warn('🚫 API abuse: Timestamp trop ancien (' + Math.round(age/1000) + 's) depuis IP:', clientIP);
        return res.status(400).json({ error: 'Session expirée. Veuillez rafraîchir la page.' });
    }
    
    // VÉRIFICATION D : Signature de la requête
    // Le client doit envoyer une signature basée sur le timestamp
    // Cela prouve qu'il a exécuté notre JavaScript
    if (!_signature) {
        console.warn('🚫 API abuse: Signature manquante depuis IP:', clientIP);
        return res.status(400).json({ error: 'Requête invalide - signature manquante' });
    }
    
    // Vérifie la signature (hash simple du timestamp + secret)
    // Le même calcul est fait côté client
    const crypto = require('crypto');
    const expectedSignature = crypto
        .createHash('sha256')
        .update(_timestamp + API_SECRET)
        .digest('hex')
        .substring(0, 16);
    
    if (_signature !== expectedSignature) {
        console.warn('🚫 API abuse: Signature invalide depuis IP:', clientIP);
        return res.status(403).json({ error: 'Signature invalide' });
    }

    // VÉRIFICATION E : Token CSRF obligatoire
    if (!_token) {
        console.warn('🚫 API abuse: Token CSRF manquant depuis IP:', clientIP);
        return res.status(400).json({ error: 'Token de sécurité manquant' });
    }

    // ============================================
    // VÉRIFICATION 1 : HONEYPOT
    // ============================================
    // Si le champ honeypot est rempli, c'est un bot
    if (_honeypot) {
        console.warn('🚫 Bot détecté via honeypot depuis IP:', clientIP);
        // Retourne succès pour ne pas alerter le bot
        return res.status(200).json({ success: true });
    }

    // ============================================
    // VÉRIFICATION 2 : TIMESTAMP (temps de remplissage)
    // ============================================
    // Le formulaire doit être rempli en au moins 3 secondes
    if (_timestamp) {
        const fillTime = Date.now() - parseInt(_timestamp);
        if (fillTime < 3000) {
            console.warn('🚫 Bot détecté : formulaire rempli trop vite (' + fillTime + 'ms) depuis IP:', clientIP);
            return res.status(400).json({ error: 'Formulaire soumis trop rapidement' });
        }
    }

    // ============================================
    // VÉRIFICATION 3 : RATE LIMITING
    // ============================================
    // Limite le nombre d'emails par IP par heure
    const now = Date.now();
    let rateData = rateLimitStore.get(clientIP);
    
    if (rateData) {
        // Vérifie si l'heure est passée
        if (now - rateData.firstAttempt > CLEANUP_INTERVAL) {
            // Reset le compteur
            rateData = { count: 1, firstAttempt: now };
        } else {
            rateData.count++;
        }
        
        if (rateData.count > MAX_EMAILS_PER_HOUR) {
            console.warn('🚫 Rate limit atteint pour IP:', clientIP, '(' + rateData.count + ' tentatives)');
            return res.status(429).json({ 
                error: 'Trop de messages envoyés. Veuillez réessayer dans une heure.' 
            });
        }
    } else {
        rateData = { count: 1, firstAttempt: now };
    }
    rateLimitStore.set(clientIP, rateData);

    // ============================================
    // VÉRIFICATION 4 : CHAMPS REQUIS
    // ============================================
    if (!email || !subject || !message) {
        console.warn('⚠️ Champs manquants pour l\'envoi de mail');
        return res.status(400).json({ error: 'Champs manquants' });
    }

    // ============================================
    // VÉRIFICATION 5 : VALIDATION EMAIL
    // ============================================
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        console.warn('⚠️ Email invalide:', email);
        return res.status(400).json({ error: 'Adresse email invalide' });
    }

    // ============================================
    // VÉRIFICATION 6 : DÉTECTION DE SPAM
    // ============================================
    const lowerMessage = message.toLowerCase();
    const lowerSubject = subject.toLowerCase();
    const combinedText = lowerMessage + ' ' + lowerSubject;
    
    const spamScore = SPAM_KEYWORDS.reduce((score, keyword) => {
        return score + (combinedText.includes(keyword) ? 1 : 0);
    }, 0);
    
    if (spamScore >= 3) {
        console.warn('🚫 Message détecté comme spam (score: ' + spamScore + ') depuis IP:', clientIP);
        // On accepte quand même mais on marque pour review
        console.log('📝 Contenu marqué spam:', { subject, messagePreview: message.substring(0, 100) });
    }

    // ============================================
    // VÉRIFICATION 7 : LONGUEUR MINIMALE
    // ============================================
    if (message.length < 10) {
        return res.status(400).json({ error: 'Message trop court (minimum 10 caractères)' });
    }

    // Debug credentials (masked)
    const smtpUser = serverConfig.smtpUser;
    const smtpPass = serverConfig.smtpPass;
    const smtpHost = serverConfig.smtpHost;
    const smtpPort = serverConfig.smtpPort;

    console.log('🔑 Credentials:', {
        host: smtpHost,
        port: smtpPort,
        user: smtpUser ? `${smtpUser.substring(0, 3)}...` : 'UNDEFINED',
        pass: smtpPass ? 'DEFINED' : 'UNDEFINED'
    });

    try {
        let transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpPort === 465, // true pour 465, false pour les autres
            auth: {
                user: smtpUser,
                pass: smtpPass
            }
        });

        await transporter.sendMail({
            from: `"Portfolio" <${smtpUser}>`, // Expéditeur authentifié
            to: 'contact.mprnl@gmail.com', // Votre adresse perso pour recevoir les messages
            replyTo: email, // Pour répondre directement au visiteur
            subject: `[Portfolio] ${subject}`,
            text: `Nouveau message de: ${email}\n\n${message}`
        }); console.log('✅ Mail envoyé avec succès');
        res.status(200).json({ success: true });
    } catch (err) {
        console.error('❌ Erreur lors de l\'envoi du mail:', err);
        res.status(500).json({ error: 'Erreur lors de l\'envoi du mail: ' + err.message });
    }
});

// ===== ROUTES DE TRACKING =====

// Endpoint pour enregistrer une visite (legacy)
router.post('/track', (req, res) => {
    const page = req.body.page || 'inconnue';
    const now = new Date().toISOString();
    let stats = { visits: 0, pages: {} };
    try {
        if (fs.existsSync(paths.stats)) {
            stats = JSON.parse(fs.readFileSync(paths.stats, 'utf-8'));
        }
    } catch (e) {
        console.error('Erreur lors de la lecture du fichier stats:', e);
    }
    stats.visits++;
    if (!stats.pages[page]) stats.pages[page] = { count: 0, last: null };
    stats.pages[page].count++;
    stats.pages[page].last = now;
    fs.writeFileSync(paths.stats, JSON.stringify(stats, null, 2));
    res.json({ success: true });
});

// Endpoint pour consulter les stats (legacy)
router.get('/stats', (req, res) => {
    try {
        const stats = fs.existsSync(paths.stats) ? JSON.parse(fs.readFileSync(paths.stats, 'utf-8')) : { visits: 0, pages: {} };
        res.json(stats);
    } catch (e) {
        console.error('Erreur lors de la lecture des stats:', e);
        res.status(500).json({ error: 'Erreur lecture stats' });
    }
});

// ===== ROUTES DE LOGGING AVANCÉ =====

// Route pour recevoir les logs côté client
router.post('/log-action', (req, res) => {
    try {
        let { userId, action, timestamp, url, page, sessionDuration, timeSinceLastActivity, campaignInfo: clientCampaignInfo, ...otherDetails } = req.body;

        // Pour les requêtes AJAX, utiliser l'userId fourni par le client si disponible
        const finalUserId = userId || req.userId || req.cookies.user_tracking_id;

        if (userId && userId !== req.userId) {
            console.log(`🆔 Client userId: ${userId}, Server userId: ${req.userId}`);
        }

        // Filtrer les actions selon les pages autorisées
        const allowedPages = ['/', '/a-propos', '/contact'];
        const isAllowedPage = page && allowedPages.includes(page);

        // Exclure les signaux de vie (heartbeat) des logs pour éviter l'encombrement
        const isHeartbeat = action === 'heartbeat';

        // Logger seulement si l'action vient d'une page autorisée ET n'est pas un heartbeat
        if (isAllowedPage && !isHeartbeat) {
            // Récupérer les informations de campagne
            const campaignInfo = campaignService.getCampaignInfo(req, finalUserId, clientCampaignInfo);

            // Construire les détails du log
            const logDetails = {
                ip: req.ip || req.connection.remoteAddress,
                userAgent: req.get('User-Agent'),
                url,
                page,
                sessionDuration,
                timeSinceLastActivity,
                extraData: {
                    referer: req.get('Referer'),
                    host: req.get('Host'),
                    ...otherDetails
                }
            };

            // Ajouter les informations de campagne si disponibles
            if (campaignInfo) {
                logDetails.campaignInfo = {
                    campaignId: campaignInfo.campaignId,
                    campaignName: campaignInfo.campaignName,
                    source: campaignInfo.source,
                    medium: campaignInfo.medium,
                    campaignTimestamp: campaignInfo.timestamp
                };
                console.log(`🎯 Log action avec campagne: ${action} sur ${page} - ${campaignInfo.campaignName} (${campaignInfo.campaignId})`);
            }

            // Enregistrer le log (userLogger sera injecté par le serveur principal)
            req.app.locals.userLogger.log(finalUserId, action, logDetails);
        } else if (isHeartbeat) {
            console.log(`💓 Heartbeat reçu de ${finalUserId} (non loggé)`);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur lors du logging d\'action:', error);
        res.status(500).json({ error: 'Erreur lors du logging' });
    }
});

// Route pour enregistrer un clic sur une photo
router.post('/photo-click', (req, res) => {
    try {
        const { photoFilename, userId, ...additionalData } = req.body;

        if (!photoFilename) {
            return res.status(400).json({ error: 'Nom de photo manquant' });
        }

        // Ajouter les informations de la requête
        const clickData = {
            ip: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent'),
            referer: req.get('Referer'),
            timestamp: new Date().toISOString(),
            ...additionalData
        };

        const success = req.app.locals.photoClickTracker.recordPhotoClick(photoFilename, userId, clickData);

        if (success) {
            res.json({ success: true, message: 'Clic photo enregistré' });
        } else {
            res.status(500).json({ error: 'Erreur lors de l\'enregistrement du clic' });
        }
    } catch (error) {
        console.error('❌ Erreur lors de l\'enregistrement du clic photo:', error);
        res.status(500).json({ error: 'Erreur lors de l\'enregistrement du clic' });
    }
});

// ===== ROUTES ADMIN POUR LES STATISTIQUES =====

// Route admin : récupérer les statistiques des photos
router.get('/admin/photo-stats', requireAdminSession, (req, res) => {
    try {
        const stats = req.app.locals.photoClickTracker.getAllPhotoStats();
        res.json(stats);
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des stats photos:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération des statistiques photos' });
    }
});

// Route admin : récupérer le top des photos (avec limite optionnelle)
router.get('/admin/photo-stats/top/:limit', requireAdminSession, (req, res) => {
    try {
        const limit = parseInt(req.params.limit) || 10;
        const topPhotos = req.app.locals.photoClickTracker.getTopPhotos(limit);
        res.json({ topPhotos });
    } catch (error) {
        console.error('❌ Erreur lors de la récupération du top photos:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération du top photos' });
    }
});

// Route admin : récupérer le top des photos (par défaut 10)
router.get('/admin/photo-stats/top', requireAdminSession, (req, res) => {
    try {
        const topPhotos = req.app.locals.photoClickTracker.getTopPhotos(10);
        res.json({ topPhotos });
    } catch (error) {
        console.error('❌ Erreur lors de la récupération du top photos:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération du top photos' });
    }
});

// Route admin : réinitialiser les statistiques photos
router.post('/admin/photo-stats/reset', requireAdminSession, (req, res) => {
    try {
        const success = req.app.locals.photoClickTracker.resetStats();
        if (success) {
            res.json({ success: true, message: 'Statistiques photos réinitialisées' });
        } else {
            res.status(500).json({ error: 'Erreur lors de la réinitialisation' });
        }
    } catch (error) {
        console.error('❌ Erreur lors de la réinitialisation des stats photos:', error);
        res.status(500).json({ error: 'Erreur lors de la réinitialisation des statistiques' });
    }
});

// ===== ROUTES ADMIN POUR LES LOGS =====

// Route admin : page des logs
router.get('/admin/logs', (req, res) => {
    res.sendFile(path.join(paths.adminPages, 'logs.html'));
});

// Route admin : récupérer les logs d'une date
router.get('/admin/logs/:date', requireAdminSession, (req, res) => {
    try {
        const date = new Date(req.params.date);
        const logs = req.app.locals.userLogger.getLogsForDate(date);
        res.json(logs);
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des logs:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération des logs' });
    }
});

// Route admin : récupérer les dates disponibles
router.get('/admin/logs-dates', requireAdminSession, (req, res) => {
    try {
        const dates = req.app.locals.userLogger.getAvailableDates();
        res.json(dates);
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des dates:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération des dates' });
    }
});

// Route admin : récupérer les statistiques des utilisateurs pour une date
router.get('/admin/logs-stats/:date', requireAdminSession, (req, res) => {
    try {
        const date = new Date(req.params.date);
        const stats = req.app.locals.userLogger.getUserStats(date);
        const topActions = req.app.locals.userLogger.getTopActions(date);
        const trafficSources = req.app.locals.userLogger.getTrafficSources(date);

        res.json({
            userStats: stats,
            topActions: topActions,
            trafficSources: trafficSources,
            date: req.params.date
        });
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des stats:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération des statistiques' });
    }
});

// Route admin : nettoyage manuel des logs
router.post('/admin/logs/cleanup', requireAdminSession, (req, res) => {
    try {
        const { maxDays = 7 } = req.body;
        req.app.locals.userLogger.cleanOldLogs(maxDays);
        res.json({
            success: true,
            message: `Nettoyage effectué avec succès (rétention: ${maxDays} jours)`
        });
    } catch (error) {
        console.error('❌ Erreur lors du nettoyage manuel:', error);
        res.status(500).json({ error: 'Erreur lors du nettoyage des logs' });
    }
});

module.exports = router;
