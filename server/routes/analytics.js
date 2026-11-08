const express = require('express');
const path = require('path');
const AnalyticsStore = require('../utils/analyticsStore');
const AnalyticsService = require('../utils/analyticsService');
const serverConfig = require('../config');
const { requireAdminSession, requireAdminPage } = require('../middleware/auth');

const router = express.Router();
const paths = serverConfig.getPaths();

// ============================================
// SYSTÈME D'ANALYTICS PROPRIÉTAIRE
// ============================================
//
// - Aucun cookie, aucune IP, aucun User-Agent n'est stocké.
// - Le client envoie un signal cumulé par session (navigator.sendBeacon).
// - Le serveur ajoute la ligne en fin de fichier (append-only) puis agrège
//   les signaux en KPI à la demande.

const RETENTION_DAYS = 90;

const store = new AnalyticsStore({
    dir: paths.analytics || path.join(paths.root, 'data', 'analytics'),
    retentionDays: RETENTION_DAYS
});

const analytics = new AnalyticsService(store);

// Purge quotidienne des fichiers au-delà de la rétention (90 jours glissants)
setInterval(() => store.rotate(), 24 * 60 * 60 * 1000).unref?.();

// ============================================
// PROTECTION ANTI-ABUS
// ============================================
// /api/track est public : une petite fenêtre glissante par IP évite
// qu'unscript ne sature le stockage sans déranger les vrais visiteurs
// (un visiteur envoie ~6 signaux par minute).

const TRACK_WINDOW_MS = 60 * 1000;
const TRACK_MAX_PER_WINDOW = 60;
const trackWindow = new Map(); // IP -> { count, since }

setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of trackWindow) {
        if (now - data.since > TRACK_WINDOW_MS) trackWindow.delete(ip);
    }
}, TRACK_WINDOW_MS).unref?.();

function isTrackRateLimited(ip) {
    const now = Date.now();
    const data = trackWindow.get(ip);
    if (!data || now - data.since > TRACK_WINDOW_MS) {
        trackWindow.set(ip, { count: 1, since: now });
        return false;
    }
    data.count++;
    return data.count > TRACK_MAX_PER_WINDOW;
}

// ============================================
// ASSAINISSEMENT DES DONNÉES ENTRANTES
// ============================================

const MAX_SID_LENGTH = 64;
const MAX_HASH_LENGTH = 64;
const MAX_ID_LENGTH = 200;

function cleanString(value, max) {
    if (typeof value !== 'string') return '';
    return value.slice(0, max);
}

function cleanInt(value, max) {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(n, max);
}

function cleanRatio(value) {
    const n = Number.parseFloat(value);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(n, 1);
}

function sanitizePage(page) {
    return {
        id: cleanString(page && page.id, MAX_ID_LENGTH),
        engagedMs: cleanInt(page && page.engagedMs, 24 * 60 * 60 * 1000),
        scrollMax: cleanRatio(page && page.scrollMax),
        fullscreenOpens: cleanInt(page && page.fullscreenOpens, 1000),
        photosViewed: cleanInt(page && page.photosViewed, 10000),
        contactClicks: cleanInt(page && page.contactClicks, 100),
        mailtoClicks: cleanInt(page && page.mailtoClicks, 100),
        contactViews: cleanInt(page && page.contactViews, 100),
        contactSubmits: cleanInt(page && page.contactSubmits, 100)
    };
}

function sanitizeCampaign(campaign) {
    if (!campaign || typeof campaign !== 'object') return null;
    const id = cleanString(campaign.id, 64);
    if (!id) return null;
    return { id, source: cleanString(campaign.source, 32) || null };
}

// ============================================
// INGESTION DES SIGNAUX
// ============================================

// sendBeacon peut envoyer du text/plain (selon le navigateur) : on accepte
// les deux formats, le corps étant toujours du JSON.
router.post('/api/track', express.text({ type: 'text/plain', limit: '16kb' }), (req, res) => {
    let payload = req.body;
    if (typeof payload === 'string') {
        try {
            payload = JSON.parse(payload);
        } catch (e) {
            return res.status(400).json({ error: 'Signal invalide' });
        }
    }

    if (!payload || typeof payload !== 'object') {
        return res.status(400).json({ error: 'Signal invalide' });
    }

    const sid = cleanString(payload.sid, MAX_SID_LENGTH);
    if (!sid) return res.status(400).json({ error: 'Session manquante' });

    const clientIP = req.ip || req.socket?.remoteAddress || 'inconnu';
    if (isTrackRateLimited(clientIP)) {
        return res.status(429).json({ error: 'Trop de signaux' });
    }

    const pages = Array.isArray(payload.pages) ? payload.pages.slice(0, 50).map(sanitizePage) : [];

    store.append({
        v: 1,
        sid,
        hash: cleanString(payload.hash, MAX_HASH_LENGTH) || null,
        ts: Date.now(),
        src: cleanString(payload.src, 32) || 'direct',
        camp: sanitizeCampaign(payload.camp),
        pages
    });

    res.status(204).end();
});

// ============================================
// TABLEAU DE BORD ADMIN
// ============================================

// Page du tableau de bord
router.get('/admin/analytics', requireAdminPage, (req, res) => {
    res.sendFile(path.join(paths.adminPages, 'analytics.html'), { dotfiles: 'allow' }, (err) => {
        if (err) res.status(500).send('Erreur interne');
    });
});

// API d'agrégation : ?days=7|30|null (null = tout l'historique)
router.get('/admin/api/analytics', requireAdminSession, (req, res) => {
    try {
        const raw = req.query.days;
        let days = 30;
        if (raw === 'all' || raw === 'null' || raw === undefined) {
            days = raw === undefined ? 30 : null;
        } else {
            const parsed = Number.parseInt(raw, 10);
            days = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 3650) : 30;
        }

        // Rafraîchit l'index des galeries pour libeller les pages
        analytics.refreshGalleryIndex();

        res.json(analytics.getDashboard(days));
    } catch (error) {
        console.error('❌ Erreur lors du calcul des analytics:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération des statistiques' });
    }
});

// Purge manuelle de la rétention (admin)
router.post('/admin/api/analytics/rotate', requireAdminSession, (req, res) => {
    try {
        const removed = store.rotate();
        res.json({ success: true, removed });
    } catch (error) {
        console.error('❌ Erreur lors de la rotation des analytics:', error);
        res.status(500).json({ error: 'Erreur lors de la rotation' });
    }
});

module.exports = router;
module.exports.store = store;
module.exports.analytics = analytics;
