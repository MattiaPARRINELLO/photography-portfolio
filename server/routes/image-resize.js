const express = require('express');
const fs = require('fs');
const path = require('path');
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
function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
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
        if (!fs.existsSync(originalPath)) return res.status(404).send('File not found');

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
        ensureDir(cacheDir);
        const cacheName = `${base}.${fmt === 'jpg' ? 'jpeg' : fmt}`;
        const cachePath = path.join(cacheDir, cacheName);

        // If cache exists and up-to-date (mtime >= original mtime), stream it
        if (fs.existsSync(cachePath)) {
            const cacheStat = fs.statSync(cachePath);
            const origStat = fs.statSync(originalPath);
            if (cacheStat.mtimeMs >= origStat.mtimeMs) {
                res.setHeader('Content-Type', `image/${fmt === 'jpeg' ? 'jpeg' : fmt}`);
                res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
                res.setHeader('Vary', 'Accept');
                return fs.createReadStream(cachePath).pipe(res);
            }
        }

        // Otherwise generate resized image and write to cache
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
        // Save cache (best-effort)
        try { fs.writeFileSync(cachePath, buffer); } catch (e) { console.warn('Failed to write cache', e.message); }

        res.setHeader('Content-Type', `image/${fmt === 'jpeg' ? 'jpeg' : fmt}`);
        res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
        res.setHeader('Vary', 'Accept');
        res.send(buffer);
    } catch (err) {
        console.error('Resize error', err);
        res.status(500).send('Server error');
    }
});

module.exports = router;
