const express = require('express');
const fs = require('fs');
const path = require('path');
const serverConfig = require('../config');
const textUtils = require('../utils/textUtils');
const campaignService = require('../utils/campaignService');
const photoService = require('../utils/photoService');
const linksService = require('../utils/linksService');
const galleryService = require('../utils/galleryService');

const router = express.Router();
const paths = serverConfig.getPaths();

// SEO: Charge les données SEO pour l'injection de contenu dynamique
const seoDataPath = path.join(__dirname, '..', '..', 'config', 'seo.json');
function loadSeoData() {
    try {
        return JSON.parse(fs.readFileSync(seoDataPath, 'utf-8'));
    } catch (e) {
        return {};
    }
}

// SEO: Génère le bloc hero HTML pour la page d'accueil (H1 + intro + artistes + lieux + CTA)
function generateHomeHeroHtml() {
    const seo = loadSeoData();
    const pageSeo = (seo.pages && seo.pages.home) || {};
    const artists = seo.artists || [];
    const venues = seo.venues || [];
    const introText = seo.intro_text || '';

    // SEO: Liste des artistes avec noms comme mots-clés
    const artistNames = artists.map(a => a.name).join(' · ');
    // SEO: Liste des lieux avec noms comme mots-clés locaux
    const venueNames = venues.map(v => `${v.name} (${v.city})`).join(' · ');

    return `
            <div class="home-hero px-5 md:px-0 pt-10 pb-6">
        <!-- SEO: H1 optimisé avec mots-clés principaux -->
        <h1 class="text-3xl md:text-4xl font-bold font-signika mb-4">${pageSeo.h1 || 'Mattia Parrinello - Photographe de Concert à Paris'}</h1>
        <!-- SEO: Paragraphe d'introduction riche en mots-clés -->
        <p class="text-base md:text-lg text-gray-700 dark:text-gray-300 max-w-3xl mb-6 leading-relaxed">${introText}</p>
        <!-- SEO: Section artistes - mots-clés noms propres -->
        <div class="mb-4">
          <p class="text-sm text-gray-500 dark:text-gray-400 font-signika uppercase tracking-wider mb-1">Artistes photographiés</p>
          <p class="text-sm md:text-base text-gray-600 dark:text-gray-300">${artistNames}</p>
        </div>
        <!-- SEO: Section lieux - mots-clés locaux -->
        <div class="mb-6">
          <p class="text-sm text-gray-500 dark:text-gray-400 font-signika uppercase tracking-wider mb-1">Salles & festivals</p>
          <p class="text-sm md:text-base text-gray-600 dark:text-gray-300">${venueNames}</p>
        </div>
                <!-- SEO: CTA vers contact -->
                <div class="mt-6">
                    <a href="/contact" class="cta-contact primary inline-block px-6 py-3 text-sm font-signika font-bold rounded-lg transition duration-300">Me contacter pour un projet</a>
                </div>
      </div>`;
}

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
                     alt="Photo de concert par Mattia Parrinello - ${photo.filename.replace(/^\d+_*/, '').replace(/\.[^.]+$/, '').replace(/_/g, ' ')}" 
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

        // SEO: Injecter le Schema.org JSON-LD
        const schemaJsonLd = textUtils.generateSchemaJsonLd('Portfolio', req);
        htmlContent = htmlContent.replace('</head>', `    ${schemaJsonLd}\n  </head>`);

        // SEO: Injecter le bloc hero (H1, intro, artistes, lieux, CTA)
        const heroHtml = generateHomeHeroHtml();
        htmlContent = htmlContent.replace('<!-- SEO_HERO_PLACEHOLDER -->', heroHtml);

        // SEO: Injecter le bloc post-galerie (collaborations + CTA secondaire)
        const seoBottom = loadSeoData();
        const bottomArtists = (seoBottom.artists || []).map(a => a.name).join(', ');
        const bottomVenues = (seoBottom.venues || []).map(v => v.name).join(', ');
        const bottomHtml = `
    <div class="container mx-auto px-5 md:px-0 py-12">
    <!-- SEO: Section collaborations - renforce les mots-clés et le maillage -->
      <section class="max-w-3xl mb-10">
        <h2 class="text-2xl font-bold font-signika mb-4 text-black dark:text-white">Collaborations & événements</h2>
        <p class="text-base text-gray-700 dark:text-gray-300 mb-3">J'ai eu la chance de photographier des artistes comme <strong>${bottomArtists}</strong>, dans des salles emblématiques : <strong>${bottomVenues}</strong>.</p>
        <p class="text-base text-gray-700 dark:text-gray-300 mb-6">Média musical, artiste émergent, label ou salle de concert - je suis disponible pour capturer l'énergie de vos événements partout en France.</p>
        <a href="/contact" class="cta-contact inline-block px-6 py-3 text-sm font-signika font-bold rounded-lg transition duration-300">Discutons de votre projet</a>
      </section>
    </div>`;
        htmlContent = htmlContent.replace('<!-- SEO_BOTTOM_PLACEHOLDER -->', bottomHtml);

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
        // SEO: Injecter le Schema.org JSON-LD
        const schemaJsonLd = textUtils.generateSchemaJsonLd('Contact', req);
        htmlContent = htmlContent.replace('</head>', `    ${schemaJsonLd}\n  </head>`);
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
        // SEO: Injecter le Schema.org JSON-LD
        const schemaJsonLd = textUtils.generateSchemaJsonLd('À propos', req);
        htmlContent = htmlContent.replace('</head>', `    ${schemaJsonLd}\n  </head>`);
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

// Route pour la page Links (carte de visite digitale / QR code)
router.get('/links', (req, res) => {
    console.log('🚀 Route /links appelée - Carte de visite digitale');
    try {
        const htmlPath = path.join(paths.pages, 'links.html');
        let htmlContent = fs.readFileSync(htmlPath, 'utf-8');

        // Charger la configuration des liens
        const linksConfig = linksService.loadLinksConfig();

        // Injecter les données dans le template
        htmlContent = linksService.injectLinksData(htmlContent, linksConfig, req);

        // Headers pour optimisation mobile
        res.setHeader('Cache-Control', 'public, max-age=300'); // 5 min cache
        res.send(htmlContent);
    } catch (error) {
        console.error('❌ Erreur lors du chargement de links.html:', error);
        res.status(500).send('Erreur lors du chargement de la page');
    }
});

// Redirection pour /links/ vers /links
router.get('/links/', (req, res) => {
    res.redirect('/links');
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

// =============================================
// ROUTES PUBLIQUES POUR LES GALERIES PAR ARTISTE
// =============================================

function escapeAttr(s) {
    return (s || '').toString().replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatGalleryDate(iso) {
    if (!iso) return '';
    try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) { return ''; }
}

function renderGalleryCard(g) {
    const cover = g.cover
        ? `<img class="cover" src="/photos/resize?file=${encodeURIComponent(g.cover)}&amp;w=800" alt="${escapeAttr(g.title)} - photo par Mattia Parrinello" loading="lazy" />`
        : '<div class="cover" style="background:#111"></div>';
    const metaParts = [g.venue, formatGalleryDate(g.date)].filter(Boolean);
    const meta = metaParts.join(' · ');
    const kicker = g.artist || 'Concert';
    const count = `${g.photos.length} photo${g.photos.length > 1 ? 's' : ''}`;

    return `
      <a class="gallery-card" href="/galeries/${encodeURIComponent(g.slug)}" aria-label="Voir la galerie ${escapeAttr(g.title)}">
        ${cover}
        <div class="gradient"></div>
        <span class="count">${count}</span>
        <div class="content">
          <span class="kicker">${escapeAttr(kicker)}</span>
          <h3>${escapeAttr(g.title)}</h3>
          ${meta ? `<p class="meta">${escapeAttr(meta)}</p>` : ''}
        </div>
      </a>`;
}

router.get('/galeries', (req, res) => {
    try {
        const texts = textUtils.loadTexts();
        const htmlPath = path.join(paths.pages, 'galleries.html');
        let htmlContent = fs.readFileSync(htmlPath, 'utf-8');

        htmlContent = textUtils.injectMetaTags(htmlContent, texts, req, 'Galeries');

        const schemaJsonLd = textUtils.generateSchemaJsonLd('Galeries', req);
        htmlContent = htmlContent.replace('</head>', `    ${schemaJsonLd}\n  </head>`);

        const galleries = galleryService.listGalleries().filter(g => g.published !== false);
        let listHtml;
        if (galleries.length === 0) {
            listHtml = `
      <div class="empty-state">
        <p class="text-lg">Les premières galeries arrivent bientôt.</p>
        <p class="mt-4"><a href="/contact" class="underline">Me contacter pour un projet</a></p>
      </div>`;
        } else {
            listHtml = `<div class="galleries-grid">${galleries.map(renderGalleryCard).join('')}</div>`;
        }
        htmlContent = htmlContent.replace('<!-- GALLERIES_LIST_PLACEHOLDER -->', listHtml);

        res.send(htmlContent);
    } catch (error) {
        console.error('❌ Erreur /galeries:', error);
        res.status(500).send('Erreur lors du chargement des galeries');
    }
});
router.get('/galeries/', (req, res) => res.redirect('/galeries'));

router.get('/galeries/:slug', (req, res) => {
    try {
        const gallery = galleryService.getGalleryBySlug(req.params.slug);
        if (!gallery || gallery.published === false) {
            return res.status(404).sendFile(path.join(paths.pages, '404.html'));
        }

        const htmlPath = path.join(paths.pages, 'gallery.html');
        let htmlContent = fs.readFileSync(htmlPath, 'utf-8');

        // Meta tags dynamiques spécifiques à la galerie
        const metaTitle = `${gallery.title} - Mattia Parrinello`;
        const metaDescParts = [gallery.artist, gallery.venue, formatGalleryDate(gallery.date)].filter(Boolean);
        const metaDesc = gallery.description
            || `Galerie photo concert : ${gallery.title}${metaDescParts.length ? ' - ' + metaDescParts.join(' · ') : ''}. Photographié par Mattia Parrinello, photographe de concert à Paris.`;

        htmlContent = htmlContent.replace('{{DYNAMIC_TITLE}}', escapeAttr(metaTitle));
        htmlContent = htmlContent.replace('{{DYNAMIC_DESCRIPTION}}', escapeAttr(metaDesc));

        // Canonical + og tags manuels (textUtils.injectMetaTags s'appuie sur texts.json par page)
        const canonical = `https://www.photo.mprnl.fr/galeries/${encodeURIComponent(gallery.slug)}`;
        const ogImage = gallery.cover
            ? `https://www.photo.mprnl.fr/photos/resize?file=${encodeURIComponent(gallery.cover)}&w=1200`
            : 'https://www.photo.mprnl.fr/dist/assets/Logo_MP.svg';

        const extraHead = `
    <link rel="canonical" href="${canonical}" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${escapeAttr(metaTitle)}" />
    <meta property="og:description" content="${escapeAttr(metaDesc)}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:image" content="${ogImage}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeAttr(metaTitle)}" />
    <meta name="twitter:description" content="${escapeAttr(metaDesc)}" />
    <meta name="twitter:image" content="${ogImage}" />`;

        // Schema.org ImageGallery
        const schema = {
            '@context': 'https://schema.org',
            '@type': 'ImageGallery',
            name: gallery.title,
            description: metaDesc,
            url: canonical,
            ...(gallery.date ? { datePublished: gallery.date } : {}),
            ...(gallery.venue ? { contentLocation: { '@type': 'Place', name: gallery.venue } } : {}),
            author: {
                '@type': 'Person',
                name: 'Mattia Parrinello',
                url: 'https://www.photo.mprnl.fr'
            },
            image: (gallery.photos || []).map(f => ({
                '@type': 'ImageObject',
                contentUrl: `https://www.photo.mprnl.fr/photos/resize?file=${encodeURIComponent(f)}&w=1600`,
                thumbnailUrl: `https://www.photo.mprnl.fr/photos/resize?file=${encodeURIComponent(f)}&w=640`,
                creator: { '@type': 'Person', name: 'Mattia Parrinello' }
            }))
        };
        const schemaScript = `<script type="application/ld+json">${JSON.stringify(schema)}</script>`;

        htmlContent = htmlContent.replace('</head>', `${extraHead}\n    ${schemaScript}\n  </head>`);

        // Hero
        const heroCoverUrl = gallery.cover
            ? `/photos/resize?file=${encodeURIComponent(gallery.cover)}&w=1600`
            : '';
        const metaLine = [gallery.artist, gallery.venue, formatGalleryDate(gallery.date)].filter(Boolean).join(' · ');
        const heroHtml = `
      <section class="gallery-hero">
        ${heroCoverUrl ? `<img class="cover" src="${heroCoverUrl}" alt="${escapeAttr(gallery.title)}" />` : ''}
        <div class="overlay"></div>
        <div class="hero-content">
          <h1>${escapeAttr(gallery.title)}</h1>
          ${metaLine ? `<p class="meta">${escapeAttr(metaLine)}</p>` : ''}
        </div>
      </section>`;
        htmlContent = htmlContent.replace('<!-- GALLERY_HERO_PLACEHOLDER -->', heroHtml);

        const descHtml = gallery.description
            ? `<section class="max-w-3xl mb-10"><p class="text-base md:text-lg text-gray-700 dark:text-gray-300 leading-relaxed">${escapeAttr(gallery.description)}</p></section>`
            : '';
        htmlContent = htmlContent.replace('<!-- GALLERY_DESCRIPTION_PLACEHOLDER -->', descHtml);

        // Photos (masonry via CSS columns + Fancybox)
        const photosHtml = (gallery.photos || []).map((filename, i) => {
            const file = encodeURIComponent(filename);
            const full = `/photos/resize?file=${file}&w=1600`;
            const thumb = `/photos/resize?file=${file}&w=640`;
            const srcset = `/photos/resize?file=${file}&w=320 320w, /photos/resize?file=${file}&w=480 480w, /photos/resize?file=${file}&w=640 640w, /photos/resize?file=${file}&w=960 960w`;
            const loading = i < 6 ? 'eager' : 'lazy';
            const alt = `${gallery.title} - photo ${i + 1} par Mattia Parrinello`;
            return `<a href="${full}" data-fancybox="gallery"><img src="${thumb}" srcset="${srcset}" sizes="(max-width:768px) 50vw, (max-width:1440px) 33vw, 25vw" alt="${escapeAttr(alt)}" loading="${loading}" /></a>`;
        }).join('');
        const masonryHtml = photosHtml
            ? `<section class="masonry">${photosHtml}</section>`
            : '<p class="text-center text-gray-500 py-8">Aucune photo dans cette galerie.</p>';
        htmlContent = htmlContent.replace('<!-- GALLERY_PHOTOS_PLACEHOLDER -->', masonryHtml);

        res.send(htmlContent);
    } catch (error) {
        console.error('❌ Erreur /galeries/:slug :', error);
        res.status(500).send('Erreur lors du chargement de la galerie');
    }
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
                loc: '/links',
                lastmod: new Date().toISOString().slice(0, 10),
                changefreq: 'weekly',
                priority: '0.9'
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
                loc: '/galeries',
                lastmod: new Date().toISOString().slice(0, 10),
                changefreq: 'weekly',
                priority: '0.9'
            },
            {
                loc: '/mentions-legales',
                lastmod: '2025-12-31',
                changefreq: 'yearly',
                priority: '0.3'
            }
        ];

        // Add published galleries
        try {
            const galleries = galleryService.listGalleries().filter(g => g.published !== false);
            galleries.forEach(g => {
                const lastmod = (g.updatedAt || g.createdAt || new Date().toISOString()).slice(0, 10);
                staticPages.push({
                    loc: `/galeries/${g.slug}`,
                    lastmod,
                    changefreq: 'monthly',
                    priority: '0.8'
                });
            });
        } catch (e) {
            console.warn('Could not add galleries to sitemap:', e.message);
        }

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
