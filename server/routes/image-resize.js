const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const express = require('express');
const sharp = require('sharp');
const serverConfig = require('../config');

const router = express.Router();
const paths = serverConfig.getPaths();
const config = serverConfig.getConfig();

// Helper to ensure we only serve files from photos directory
function safeJoinPhotos(filename) {
    // Use basename to avoid ../ traversal
    const base = path.basename(filename);
    return path.join(paths.photos, base);
}

// Ensure cache directory exists
async function ensureDir(dir) {
    try {
        await fsp.mkdir(dir, { recursive: true });
    } catch (e) {
        // ignore
    }
}

// GET /photos/resize?file=FILENAME&w=320&fmt=webp&q=80
router.get('/resize', async (req, res) => {
    try {
        const file = req.query.file;
        const width = parseInt(req.query.w, 10) || parseInt(req.query.width, 10) || 640;
        const quality = parseInt(req.query.q, 10) || 80;
        let fmt = (req.query.fmt || req.query.format || '').toLowerCase();

        if (!file) return res.status(400).send('Missing file parameter');
        if (!width || width <= 0 || width > 5000) return res.status(400).send('Invalid width');

        // Cap width to reasonable values and prefer configured thumbnails as guidance
        const allowedWidths = [320, 640, 1000, 1600];
        const chosenWidth = allowedWidths.includes(width) ? width : width;

        const originalPath = safeJoinPhotos(file);

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

        // If cache exists and up-to-date (mtime >= original mtime), send it (non-bloquant)
        let cacheStat = null;
        try { cacheStat = await fsp.stat(cachePath); } catch (e) { cacheStat = null; }
        let origStat = null;
        try { origStat = await fsp.stat(originalPath); } catch (e) { origStat = null; }

        // If original missing but cache exists, serve cache. If both missing, 404.
        if (!origStat && cacheStat) {
            res.setHeader('Content-Type', `image/${fmt === 'jpeg' ? 'jpeg' : fmt}`);
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            res.setHeader('Vary', 'Accept');
            return res.sendFile(cachePath);
        }
        if (!origStat) return res.status(404).send('File not found');

        // If cache is up-to-date, serve it
        if (cacheStat && cacheStat.mtimeMs >= origStat.mtimeMs) {
            res.setHeader('Content-Type', `image/${fmt === 'jpeg' ? 'jpeg' : fmt}`);
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            res.setHeader('Vary', 'Accept');
            return res.sendFile(cachePath);
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

        const buffer = await pipeline.toBuffer();
        // Save cache in background (best-effort, non-blocking)
        fsp.writeFile(cachePath, buffer).catch((e) => { console.warn('Failed to write cache', e.message); });

        res.setHeader('Content-Type', `image/${fmt === 'jpeg' ? 'jpeg' : fmt}`);
        // Cache for 1 year (31536000 seconds)
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.setHeader('Vary', 'Accept');
        res.send(buffer);
    } catch (err) {
        console.error('Resize error', err);
        res.status(500).send('Server error');
    }
});

module.exports = router;
