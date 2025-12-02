const express = require('express');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const serverConfig = require('../config');
const { requireAdminSession } = require('../middleware/auth');
const campaignService = require('../utils/campaignService');

const router = express.Router();
const paths = serverConfig.getPaths();

// ===== ROUTES DE COMMUNICATION =====

// Route pour l'envoi d'email
router.post('/send-mail', async (req, res) => {
    const { email, subject, message } = req.body;
    console.log('📧 Tentative d\'envoi de mail:', { email, subject, messageLength: message ? message.length : 0 });

    if (!email || !subject || !message) {
        console.warn('⚠️ Champs manquants pour l\'envoi de mail');
        return res.status(400).json({ error: 'Champs manquants' });
    }

    // Debug credentials (masked)
    const user = serverConfig.gmailUser;
    const pass = serverConfig.gmailPass;
    console.log('🔑 Credentials:', {
        user: user ? `${user.substring(0, 3)}...` : 'UNDEFINED',
        pass: pass ? 'DEFINED' : 'UNDEFINED'
    });

    try {
        let transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 587,
            secure: false,
            auth: {
                user: user,
                pass: pass
            },
            tls: {
                rejectUnauthorized: false
            }
        });

        await transporter.sendMail({
            from: user,
            to: user,
            replyTo: email,
            subject: `[Portfolio] ${subject}`,
            text: `De: ${email}\n\n${message}`
        });

        console.log('✅ Mail envoyé avec succès');
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
