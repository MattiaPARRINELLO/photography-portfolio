const express = require('express');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const sharp = require('sharp');
const { rateLimit } = require('express-rate-limit');
const serverConfig = require('../config');
const { getOriginalsDir, isImageFilename } = require('../utils/photoStorage');

const router = express.Router();
const config = serverConfig.getConfig();
const paths = serverConfig.getPaths();

// Largeurs servies publiquement. Toute autre valeur est refusée : la
// résolution maximale téléchargeable depuis le site est donc 1600 px.
const ALLOWED_WIDTHS = [240, 320, 400, 480, 640, 800, 960, 1200, 1600];
const MAX_WIDTH = 1600;
const MIN_QUALITY = 40;
const MAX_QUALITY = 85;

// Métadonnées injectées sur les versions >= 960 px (aucun impact visuel).
const COPYRIGHT = '© Mattia Parrinello — photo.mprnl.fr';
const ARTIST = 'Mattia Parrinello';

// Anti-moissonnage : le moissonnage de galerie complète dépasse largement
// cette limite, un visiteur normal ne l'atteint jamais.
const resizeLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 600,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: 'Trop de requêtes, réessayez plus tard.'
});

// Observation seule (pas de blocage) : les navigateurs en `no-referrer` sont
// légitimes, on se contente de tracer les appels cross-site pour décider plus tard.
const HOST_RE = /^(?:www\.)?photo\.mprnl\.fr$/i;
function refererObserver(req, res, next) {
    const referer = req.get('referer');
    if (referer) {
        try {
            const host = new URL(referer).hostname;
            if (!HOST_RE.test(host) && host !== 'localhost' && host !== '127.0.0.1') {
                console.warn(`[photos/resize] Referer externe: ${host} → ${req.path}`);
            }
        } catch (e) {
            console.warn('[photos/resize] Referer invalide ignoré');
        }
    }
    next();
}

// Helper to ensure we only serve files from the originals directory
function safeJoinPhotos(filename) {
    const base = path.basename(String(filename || ''));
    if (!isImageFilename(base)) return null;
    const originalsDir = getOriginalsDir();
    if (!originalsDir) return null;
    const target = path.join(originalsDir, base);
    if (!path.resolve(target).startsWith(path.resolve(originalsDir))) return null;
    return target;
}

// Ensure cache directory exists
async function ensureDir(dir) {
    try {
        await fsp.mkdir(dir, { recursive: true });
    } catch (e) {
        // ignore
    }
}

function sendCached(res, cachePath, contentType) {
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Vary', 'Accept');
    res.setHeader('X-Robots-Tag', 'noimageindex');
    return res.sendFile(cachePath);
}

// GET /photos/resize?file=FILENAME&w=320&fmt=webp&q=80
router.get('/resize', resizeLimiter, refererObserver, async (req, res) => {
    try {
        const file = req.query.file;
        const width = parseInt(req.query.w, 10) || parseInt(req.query.width, 10) || 640;
        const rawQuality = parseInt(req.query.q, 10) || 80;
        const quality = Math.min(MAX_QUALITY, Math.max(MIN_QUALITY, rawQuality));
        let fmt = (req.query.fmt || req.query.format || '').toLowerCase();

        if (!file) return res.status(400).send('Missing file parameter');
        if (!width || width <= 0 || width > MAX_WIDTH) return res.status(400).send('Invalid width');
        if (!ALLOWED_WIDTHS.includes(width)) return res.status(400).send('Invalid width');

        const chosenWidth = width;
        const originalPath = safeJoinPhotos(file);
        if (!originalPath) return res.status(400).send('Invalid file');

        // Decide output format: prefer webp when supported or when requested
        const accept = req.get('Accept') || '';
        if (!fmt) {
            if (accept.includes('image/webp')) fmt = 'webp';
            else fmt = (config.thumbnails && config.thumbnails.format) || 'webp';
        }
        if (!['webp', 'jpeg', 'jpg', 'png'].includes(fmt)) fmt = 'webp';

        // Build cache path: photos/resized/<fmt>/<width>/<basename>.<fmt>
        const base = path.basename(file).replace(/\.[^.]+$/, '');
        const cacheDir = path.join(paths.photos, 'resized', fmt, String(chosenWidth));
        const cacheName = `${base}.${fmt === 'jpg' ? 'jpeg' : fmt}`;
        const cachePath = path.join(cacheDir, cacheName);

        await ensureDir(cacheDir);

        // If cache exists and up-to-date, send it (non-bloquant)
        let cacheStat = null;
        try { cacheStat = await fsp.stat(cachePath); } catch (e) { cacheStat = null; }
        let origStat = null;
        try { origStat = await fsp.stat(originalPath); } catch (e) { origStat = null; }

        const contentType = `image/${fmt === 'jpeg' ? 'jpeg' : fmt}`;

        // If original missing but cache exists, serve cache. If both missing, 404.
        if (!origStat && cacheStat) {
            return sendCached(res, cachePath, contentType);
        }
        if (!origStat) return res.status(404).send('File not found');

        // If cache is up-to-date, serve it without invoking sharp at all.
        if (cacheStat && cacheStat.mtimeMs >= origStat.mtimeMs) {
            return sendCached(res, cachePath, contentType);
        }

        // Otherwise generate resized image and write to cache (async safe ops)
        const transformer = sharp(originalPath).resize({
            width: chosenWidth,
            withoutEnlargement: true,
            fit: (config.thumbnails && config.thumbnails.fit) || 'inside'
        });

        let pipeline;
        if (fmt === 'webp') {
            pipeline = transformer.webp({ quality });
        } else if (fmt === 'png') {
            pipeline = transformer.png({ quality });
        } else {
            pipeline = transformer.jpeg({ quality });
        }

        // Copyright invisible sur les résolutions exploitables (>= 960 px).
        if (chosenWidth >= 960) {
            pipeline = pipeline.withMetadata({
                exif: { IFD0: { Copyright: COPYRIGHT, Artist: ARTIST } }
            });
        }

        const buffer = await pipeline.toBuffer();
        // Save cache in background (best-effort, non-blocking)
        fsp.writeFile(cachePath, buffer).catch((e) => { console.warn('Failed to write cache', e.message); });

        res.setHeader('Content-Type', contentType);
        // Cache for 1 year (31536000 seconds)
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.setHeader('Vary', 'Accept');
        res.setHeader('X-Robots-Tag', 'noimageindex');
        res.send(buffer);
    } catch (err) {
        console.error('Resize error', err);
        res.status(500).send('Server error');
    }
});

module.exports = router;
