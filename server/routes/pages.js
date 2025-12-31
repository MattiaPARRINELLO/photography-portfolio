const express = require('express');
const fs = require('fs');
const path = require('path');
const serverConfig = require('../config');
const textUtils = require('../utils/textUtils');
const campaignService = require('../utils/campaignService');
const photoService = require('../utils/photoService');

const router = express.Router();
const paths = serverConfig.getPaths();

// Helper to generate HTML for a gallery item
function generateGalleryItemHtml(photo, index) {
    const fileParam = encodeURIComponent(photo.filename);
    const clickWidth = 1600;
    const fullUrl = `/photos/resize?file=${fileParam}&w=${clickWidth}`;

    // Use dynamic resizing for thumbnails with srcset
    const thumbUrl = `/photos/resize?file=${fileParam}&w=640`;
    const srcset = `/photos/resize?file=${fileParam}&w=320 320w, /photos/resize?file=${fileParam}&w=400 400w, /photos/resize?file=${fileParam}&w=480 480w, /photos/resize?file=${fileParam}&w=640 640w`;
    const sizes = "(max-width: 480px) 50vw, (max-width: 1024px) 33vw, (max-width: 1440px) 25vw, 20vw";

    // LCP Optimization: Eager load first 4 images
    const loading = index < 4 ? 'eager' : 'lazy';
    // Apply high priority to the first 2 images to cover LCP candidates in multi-column layouts
    const fetchPriority = index < 2 ? 'high' : 'auto';
    const animClass = index < 4 ? '' : 'animate-fade-in';

    return `
    <div class="gallery-item" style="opacity: 1; transform: translate3d(0,0,0);">
        <a href="${fullUrl}" data-fancybox="gallery" data-file="${photo.filename}" data-original="${photo.url}">
            <div class="relative overflow-hidden rounded-xl group">
                <img src="${thumbUrl}" 
                     srcset="${srcset}"
                     sizes="${sizes}"
                     data-full="${fullUrl}" 
                     alt="${photo.filename}" 
                     loading="${loading}" 
                     fetchpriority="${fetchPriority}"
                     class="gallery-image rounded-xl shadow-lg ${animClass} transition-all duration-700 transform-gpu" 
                     style="will-change: transform, opacity, filter, box-shadow;">
                <div class="gallery-overlay absolute inset-0 bg-black bg-opacity-0 transition-all duration-500 rounded-xl flex items-center justify-center opacity-0 hover:opacity-100 hover:bg-opacity-20">
                    <div><svg class="w-8 h-8 text-white drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"/></svg></div>
                </div>
            </div>
        </a>
    </div>`;
}

// Route pour la page d'accueil
router.get('/', async (req, res) => {
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

        // INLINE CSS OPTIMIZATION
        try {
            const cssPath = path.join(paths.root, 'dist/css/output.css');
            if (fs.existsSync(cssPath)) {
                const cssContent = fs.readFileSync(cssPath, 'utf-8');
                htmlContent = htmlContent.replace(
                    '<link rel="stylesheet" href="../dist/css/output.css" />',
                    `<style>${cssContent}</style>`
                );
                console.log('🎨 CSS inlined successfully');
            }
        } catch (e) {
            console.error('CSS Inline Error:', e);
        }

        // Injecter les meta tags ET les informations de campagne
        htmlContent = textUtils.injectMetaTags(htmlContent, texts, req, 'Portfolio', campaignInfo);

        // --- LCP OPTIMIZATION: Server-Side Rendering of first images ---
        try {
            const photos = await photoService.getPhotosList();
            // Render first 4 images server-side
            const initialPhotos = photos.slice(0, 4);
            const galleryHtml = initialPhotos.map((p, i) => generateGalleryItemHtml(p, i)).join('');

            // Inject into placeholder
            htmlContent = htmlContent.replace('<!-- SERVER_RENDERED_GALLERY -->', galleryHtml);

            // Inject full data to avoid client-side fetch
            const dataScript = `<script>window.INJECTED_PHOTOS = ${JSON.stringify(photos)};</script>`;

            // Inject earlier in head (after meta tags) to ensure it's available before the main script runs
            // This prevents the client-side fetch('/photos-list') from triggering unnecessarily
            if (htmlContent.includes('<!-- META_PLACEHOLDER_END -->')) {
                htmlContent = htmlContent.replace('<!-- META_PLACEHOLDER_END -->', `<!-- META_PLACEHOLDER_END -->${dataScript}`);
            } else {
                htmlContent = htmlContent.replace('</head>', `${dataScript}</head>`);
            }

            console.log('⚡ SSR: 4 images injected + full data payload');
        } catch (e) {
            console.error('SSR Error:', e);
            // Fallback: remove placeholder
            htmlContent = htmlContent.replace('<!-- SERVER_RENDERED_GALLERY -->', '');
        }

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

// Route pour les mentions légales
router.get('/mentions-legales', (req, res) => {
    console.log('🚀 Route /mentions-legales appelée');
    try {
        const htmlPath = path.join(paths.pages, 'mentions.html');
        res.sendFile(htmlPath);
    } catch (error) {
        console.error('❌ Erreur lors du chargement de mentions.html:', error);
        res.status(404).send('Page non trouvée');
    }
});

// Redirection pour /mentions-legales/ vers /mentions-legales
router.get('/mentions-legales/', (req, res) => {
    res.redirect('/mentions-legales');
});

// Redirection pour /portfolio vers /
router.get('/portfolio', (req, res) => {
    res.redirect('/');
});

// Dynamic sitemap.xml generation optimized for portfolio (static pages only)
router.get('/sitemap.xml', async (req, res) => {
    try {
        const baseUrl = 'https://www.photo.mprnl.fr';

        // Determine latest photo date to use as lastmod for homepage
        let latestPhotoDate = null;
        try {
            const photos = await photoService.getPhotosList();
            if (photos.length > 0) {
                // Photos are already sorted by date (most recent first)
                const mostRecent = photos[0];
                if (mostRecent && mostRecent.date) {
                    latestPhotoDate = new Date(mostRecent.date);
                }
            }
        } catch (e) {
            console.warn('Could not fetch photos for sitemap date:', e.message);
        }

        // Static pages with metadata
        const staticPages = [
            {
                loc: '/',
                lastmod: latestPhotoDate ? latestPhotoDate.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
                changefreq: 'weekly',
                priority: '1.0'
            },
            {
                loc: '/a-propos',
                lastmod: '2025-12-31',
                changefreq: 'monthly',
                priority: '0.7'
            },
            {
                loc: '/contact',
                lastmod: '2025-12-31',
                changefreq: 'monthly',
                priority: '0.6'
            },
            {
                loc: '/mentions-legales',
                lastmod: '2025-12-31',
                changefreq: 'yearly',
                priority: '0.3'
            }
        ];

        // Build XML
        let urls = '';
        staticPages.forEach(p => {
            urls += `  <url>\n`;
            urls += `    <loc>${baseUrl}${p.loc}</loc>\n`;
            urls += `    <lastmod>${p.lastmod}</lastmod>\n`;
            urls += `    <changefreq>${p.changefreq}</changefreq>\n`;
            urls += `    <priority>${p.priority}</priority>\n`;
            urls += `  </url>\n`;
        });

        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}</urlset>`;

        res.header('Content-Type', 'application/xml');
        res.send(xml);
    } catch (error) {
        console.error('Error generating sitemap:', error);
        res.status(500).send('Error generating sitemap');
    }
});

module.exports = router;
