const express = require('express');
const nodemailer = require('nodemailer');
const serverConfig = require('../config');

const router = express.Router();

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
// `.unref()` : le minuteur de nettoyage ne doit pas maintenir le processus
// en vie à lui seul (indispensable pour que Jest se termine proprement).
setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of rateLimitStore) {
        if (now - data.firstAttempt > CLEANUP_INTERVAL) {
            rateLimitStore.delete(ip);
        }
    }
}, CLEANUP_INTERVAL).unref?.();

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

// Adresse de réception des messages du formulaire de contact
const CONTACT_RECIPIENT = 'contact.mprnl@gmail.com';

// Origines autorisées à appeler l'API de contact (vérification exacte de l'origin)
const ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://www.photo.mprnl.fr',
    'https://photo.mprnl.fr',
    'https://mattiaparrinello.com',
    'https://www.mattiaparrinello.com',
    process.env.SITE_URL
].filter(Boolean);

// ===== ROUTES DE COMMUNICATION =====

// Route pour l'envoi d'email (avec protection anti-spam et anti-API abuse)
router.post('/send-mail', async (req, res) => {
    const { email, subject, message, _honeypot, _timestamp, _token } = req.body;
    const clientIP = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    // ============================================
    // PROTECTION ANTI-API ABUSE
    // ============================================
    // Ces vérifications empêchent l'utilisation directe
    // de l'API via curl, Postman ou scripts.

    // VÉRIFICATION A : Origin/Referer
    // Doit venir de notre propre domaine
    const origin = req.headers['origin'];
    const referer = req.headers['referer'];

    const requestOrigin = origin || referer;
    const isValidOrigin = requestOrigin && ALLOWED_ORIGINS.some(allowed => {
        try {
            // Compare les origines exactes : le Referer inclut le chemin,
            // et startsWith laisserait passer « https://www.photo.mprnl.fr.evil.com ».
            return new URL(requestOrigin).origin === new URL(allowed).origin;
        } catch (e) {
            return false;
        }
    });

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
        console.warn('🚫 API abuse: Timestamp trop ancien (' + Math.round(age / 1000) + 's) depuis IP:', clientIP);
        return res.status(400).json({ error: 'Session expirée. Veuillez rafraîchir la page.' });
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
    }

    // ============================================
    // VÉRIFICATION 7 : LONGUEUR MINIMALE
    // ============================================
    if (message.length < 10) {
        return res.status(400).json({ error: 'Message trop court (minimum 10 caractères)' });
    }

    const smtpUser = serverConfig.smtpUser;
    const smtpPass = serverConfig.smtpPass;
    const smtpHost = serverConfig.smtpHost;
    const smtpPort = serverConfig.smtpPort;

    if (!smtpHost || !smtpUser || !smtpPass) {
        console.error('❌ Configuration SMTP manquante (SMTP_* ou GMAIL_* requis)');
        return res.status(500).json({ error: 'Envoi de mail non configuré côté serveur' });
    }

    try {
        let transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpPort === 465, // true pour 465, false pour les autres
            auth: {
                user: smtpUser,
                pass: smtpPass
            },
            // Ce serveur n'a pas de route IPv6 : sans ce timeout, nodemailer tente
            // l'IPv6 de smtp.gmail.com puis attend l'expiration avant de basculer
            // en IPv4 (≈120 s par envoi, formulaire figé sur « Envoi en cours… »).
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 20000
        });

        // L'envoi SMTP est normalement sous la seconde, mais Gmail peut
        // traîner (throttling, latence réseau) : on ne laisse jamais le
        // visiteur attendre plus de 2,5 s. Au-delà, on confirme et l'envoi
        // continue en tâche de fond.
        const sending = transporter
            .sendMail({
                from: `"Portfolio" <${smtpUser}>`, // Expéditeur authentifié
                to: CONTACT_RECIPIENT, // Votre adresse perso pour recevoir les messages
                replyTo: email, // Pour répondre directement au visiteur
                subject: `[Portfolio] ${subject}`,
                text: `Nouveau message de: ${email}\n\n${message}`
            })
            .then(() => 'ok')
            .catch((error) => {
                console.error('❌ Erreur lors de l\'envoi du mail:', error);
                return 'error';
            });

        const outcome = await Promise.race([
            sending,
            new Promise((resolve) => setTimeout(() => resolve('pending'), 2500))
        ]);

        if (outcome === 'error') {
            return res.status(500).json({ error: "Erreur lors de l'envoi du mail" });
        }
        res.status(200).json({ success: true, pending: outcome === 'pending' });
    } catch (err) {
        console.error('❌ Erreur lors de l\'envoi du mail:', err);
        res.status(500).json({ error: 'Erreur lors de l\'envoi du mail: ' + err.message });
    }
});

module.exports = router;
