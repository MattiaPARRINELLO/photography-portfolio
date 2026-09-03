const express = require('express');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const serverConfig = require('../config');
const textUtils = require('../utils/textUtils');
const imageMeta = require('../utils/imageMeta');
const campaignService = require('../utils/campaignService');
const photoService = require('../utils/photoService');
const linksService = require('../utils/linksService');
const galleryService = require('../utils/galleryService');
const { getPublicGalleries, isManifestlyFake } = require('../utils/dataSanity');
const { translateHtml } = require('../utils/i18n');

const router = express.Router();
const paths = serverConfig.getPaths();

// Simple in-memory page cache to avoid expensive rendering on each request
const pageCache = new Map();
function getCached(key) {
    const entry = pageCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        pageCache.delete(key);
        return null;
    }
    return entry.value;
}
function setCache(key, value, ttlMs) {
    pageCache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// Rend une page: cache → lecture fichier → meta → JSON-LD → transform → cache → envoi.
// En cas d'erreur, fallback sur le fichier statique (comportement historique des routes).
async function renderPage(req, res, { cacheKey, file, pageType, ttlMs, campaignInfo, transform }) {
    const lang = (req && req.lang === 'en') ? 'en' : 'fr';
    const langSuffix = `:${lang}`;
    const effectiveKey = `${cacheKey}${langSuffix}`;
    const cached = getCached(effectiveKey);
    if (cached) return res.send(cached);

    const texts = textUtils.loadTexts();
    let htmlContent = await fsp.readFile(path.join(paths.pages, file), 'utf-8');
    htmlContent = textUtils.injectMetaTags(htmlContent, texts, req, pageType, campaignInfo);
    htmlContent = htmlContent.replace('</head>', `    ${textUtils.generateSchemaJsonLd(pageType, req)}\n  </head>`);
    if (transform) htmlContent = await transform(htmlContent);

    setCache(effectiveKey, htmlContent, ttlMs);
    res.send(htmlContent);
}

function servePage(req, res, opts) {
    renderPage(req, res, opts).catch((error) => {
        console.error(`Erreur lors du chargement de ${opts.file}:`, error);
        res.sendFile(path.join(paths.pages, opts.file));
    });
}

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
function generateHomeHeroHtml(req) {
    const isEn = !!(req && (req.lang === 'en' || (req.query && req.query.lang === 'en')));
    const seo = loadSeoData();
    const pageSeo = (seo.pages && seo.pages.home) || {};
    const artists = seo.artists || [];
    const venues = seo.venues || [];
    const introText = isEn ? (seo.intro_text_en || seo.intro_text || '') : (seo.intro_text || '');
    const h1 = isEn ? (pageSeo.h1_en || pageSeo.h1) : pageSeo.h1;

    // SEO: Liste des artistes avec noms comme mots-clés
    const artistNames = artists.map(a => a.name).join(' · ');
    // SEO: Liste des lieux avec noms comme mots-clés locaux, avec badge pour salles mises en avant
    const venueItemsHtml = venues.map(v => {
        const text = `${v.name} (${v.city})`;
        if (v.highlight) {
            return `<span class="inline-flex items-center"><span>${text}</span>&nbsp;<span class="inline-block text-[0.65rem] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wide bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 align-middle leading-none" title="${v.highlight}">${v.highlight}</span></span>`;
        }
        return `<span>${text}</span>`;
    }).join(' <span class="text-gray-400 dark:text-gray-500 select-none">·</span> ');

    const ctaLabel = isEn ? 'View my work' : 'Voir mes projets';
    const artistsLabel = isEn ? 'Artists photographed' : 'Artistes photographiés';
    const venuesLabel = isEn ? 'Venues & festivals' : 'Salles & festivals';
    return `
            <div class="home-hero px-5 md:px-0 pt-10 pb-6">
        <!-- SEO: H1 optimisé avec mots-clés principaux -->
        <h1 class="text-3xl md:text-4xl font-bold font-signika mb-4">${h1 || 'Mattia Parrinello, Photographe de Concert à Paris'}</h1>
        <!-- SEO: Paragraphe d'introduction riche en mots-clés -->
        <p class="text-base md:text-lg text-gray-700 dark:text-gray-300 max-w-3xl mb-6 leading-relaxed">${introText}</p>
        <!-- SEO: Section artistes, mots-clés noms propres -->
        <div class="mb-4">
          <p class="text-sm text-gray-500 dark:text-gray-400 font-signika uppercase tracking-wider mb-1">${artistsLabel}</p>
          <p class="text-sm md:text-base text-gray-600 dark:text-gray-300">${artistNames}</p>
        </div>
        <!-- SEO: Section lieux, mots-clés locaux -->
        <div class="mb-6">
          <p class="text-sm text-gray-500 dark:text-gray-400 font-signika uppercase tracking-wider mb-1">${venuesLabel}</p>
          <p class="text-sm md:text-base text-gray-600 dark:text-gray-300">${venueItemsHtml}</p>
        </div>
                <!-- SEO: CTA vers contact + galerie -->
                <div class="mt-6 flex items-center gap-10">
                    <a href="/galeries${isEn ? '?lang=en' : ''}" class="cta-contact primary inline-block px-6 py-3 text-sm font-signika font-bold rounded-lg transition duration-300">${ctaLabel}</a>
                </div>
      </div>`;
}

// Helper to generate HTML for a gallery item
function generateGalleryItemHtml(photo, index, dims) {
    const fileParam = encodeURIComponent(photo.filename);
    const clickWidth = 1600;
    const fullUrl = `/photos/resize?file=${fileParam}&w=${clickWidth}`;

    // Use dynamic resizing for thumbnails with srcset
    const thumbUrl = `/photos/resize?file=${fileParam}&w=640`;
    const srcset = `/photos/resize?file=${fileParam}&w=320 320w, /photos/resize?file=${fileParam}&w=400 400w, /photos/resize?file=${fileParam}&w=480 480w, /photos/resize?file=${fileParam}&w=640 640w`;
    const sizes = "(max-width: 480px) 50vw, (max-width: 1024px) 33vw, (max-width: 1440px) 25vw, 20vw";

    // CLS: attributs width/height basés sur le src par défaut (640), aspect préservé (height:auto en CSS)
    const sizeAttrs = dims && dims.width
        ? ` width="640" height="${Math.round(640 * dims.height / dims.width)}"`
        : '';

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
                     data-full="${fullUrl}" ${sizeAttrs} 
                     alt="Photo de concert par Mattia Parrinello, ${photo.filename.replace(/^\d+_*/, '').replace(/\.[^.]+$/, '').replace(/_/g, ' ')}" 
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
router.get('/', (req, res) => {
    const campaignRef = req.query.ref || req.query.utm_campaign;
    const campaignInfo = campaignRef ? campaignService.processCampaignFromQuery(req.query) : null;

    servePage(req, res, {
        cacheKey: 'page:home',
        file: 'home.html',
        pageType: 'Portfolio',
        ttlMs: 60 * 1000,
        campaignInfo,
        transform: async (htmlContent) => {
            // INLINE CSS OPTIMIZATION, utilise le manifest pour matcher le fichier fingerprinté
            try {
                let cssContent = null;
                const manifestPath = path.join(paths.root, 'dist/manifest.json');

                // Essayer le CSS fingerprinté d'abord (via manifest)
                if (fs.existsSync(manifestPath)) {
                    try {
                        const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf-8'));
                        const fingerprinted = manifest['dist/css/output.css'];
                        if (fingerprinted) {
                            const fpPath = path.join(paths.root, fingerprinted);
                            if (fs.existsSync(fpPath)) {
                                cssContent = await fsp.readFile(fpPath, 'utf-8');
                            }
                        }
                    } catch (_) { /* manifest invalide, ignorer */ }
                }

                // Fallback: output.css non-fingerprinté
                if (!cssContent) {
                    const defaultCssPath = path.join(paths.root, 'dist/css/output.css');
                    if (fs.existsSync(defaultCssPath)) {
                        cssContent = await fsp.readFile(defaultCssPath, 'utf-8');
                    }
                }

                if (cssContent) {
                    // Regex qui matche tout <link> vers output*.css quel que soit le fingerprint
                    htmlContent = htmlContent.replace(
                        /<link\s+rel=["']stylesheet["'][^>]*href=["'][^"']*dist\/css\/output[^"' ]*\.css["'][^>]*\/?>/,
                        `<style>${cssContent}</style>`
                    );
                }
            } catch (e) {
                console.error('CSS Inline Error:', e);
            }

            // SEO: Injecter le bloc hero (H1, intro, artistes, lieux, CTA), lang-aware
            htmlContent = htmlContent.replace('<!-- SEO_HERO_PLACEHOLDER -->', generateHomeHeroHtml(req));

            // SEO: Injecter le bloc post-galerie (collaborations + CTA secondaire), lang-aware
            const seoBottom = loadSeoData();
            const bottomIsEn = req.lang === 'en';
            const bottomArtists = (seoBottom.artists || []).map(a => a.name).join(', ');
            const bottomVenues = (seoBottom.venues || []).map(v => v.name).join(', ');
            const bottomHtml = bottomIsEn ? `
    <div class="container mx-auto px-5 md:px-0 py-12">
      <section class="max-w-3xl mb-10">
        <h2 class="text-2xl font-bold font-signika mb-4 text-black dark:text-white">Collaborations & events</h2>
        <p class="text-base text-gray-700 dark:text-gray-300 mb-3">I've had the chance to photograph artists like <strong>${bottomArtists}</strong>, in iconic venues: <strong>${bottomVenues}</strong>.</p>
        <p class="text-base text-gray-700 dark:text-gray-300 mb-6">Music media, emerging artist, label or venue, I'm available to capture the energy of your events across France.</p>
        <a href="/contact?lang=en" class="cta-contact inline-block px-6 py-3 text-sm font-signika font-bold rounded-lg transition duration-300">Let's talk about your project</a>
      </section>
    </div>` : `
    <div class="container mx-auto px-5 md:px-0 py-12">
    <!-- SEO: Section collaborations, renforce les mots-clés et le maillage -->
      <section class="max-w-3xl mb-10">
        <h2 class="text-2xl font-bold font-signika mb-4 text-black dark:text-white">Collaborations & événements</h2>
        <p class="text-base text-gray-700 dark:text-gray-300 mb-3">J'ai eu la chance de photographier des artistes comme <strong>${bottomArtists}</strong>, dans des salles emblématiques : <strong>${bottomVenues}</strong>.</p>
        <p class="text-base text-gray-700 dark:text-gray-300 mb-6">Média musical, artiste émergent, label ou salle de concert, je suis disponible pour capturer l'énergie de vos événements partout en France.</p>
        <a href="/contact" class="cta-contact inline-block px-6 py-3 text-sm font-signika font-bold rounded-lg transition duration-300">Discutons de votre projet</a>
      </section>
    </div>`;
            htmlContent = htmlContent.replace('<!-- SEO_BOTTOM_PLACEHOLDER -->', bottomHtml);

            // --- LCP OPTIMIZATION: Server-Side Rendering of first images ---
            try {
                const photos = await photoService.getPhotosList();
                // Render first 4 images server-side (avec dimensions pour éviter le CLS)
                const ssrPhotos = photos.slice(0, 4);
                const ssrWithDims = await Promise.all(ssrPhotos.map(async (p) => ({
                    p,
                    dims: await imageMeta.getImageDimensions(p.filename)
                })));
                const galleryHtml = ssrWithDims.map(({ p, dims }, i) => generateGalleryItemHtml(p, i, dims)).join('');
                htmlContent = htmlContent.replace('<!-- SERVER_RENDERED_GALLERY -->', galleryHtml);

                // Inject full data to avoid client-side fetch
                const dataScript = `<script>window.INJECTED_PHOTOS = ${JSON.stringify(photos)};</script>`;

                // Inject earlier in head (after meta tags) to ensure it's available before the main script runs
                if (htmlContent.includes('<!-- META_PLACEHOLDER_END -->')) {
                    htmlContent = htmlContent.replace('<!-- META_PLACEHOLDER_END -->', `<!-- META_PLACEHOLDER_END -->${dataScript}`);
                } else {
                    htmlContent = htmlContent.replace('</head>', `${dataScript}</head>`);
                }
            } catch (error) {
                console.error('SSR Error:', error);
                // Fallback: retirer le placeholder
                htmlContent = htmlContent.replace('<!-- SERVER_RENDERED_GALLERY -->', '');
            }

            // Si on a une campagne, ajouter un script pour nettoyer l'URL côté client
            if (campaignRef) {
                const urlCleanScript = `<script>if (window.location.search.includes('ref=')) history.replaceState(null, null, window.location.pathname);</script>`;
                htmlContent = htmlContent.replace('</body>', `${urlCleanScript}</body>`);
            }

            return htmlContent;
        }
    });
});

// Route pour servir texts.json publiquement (lang-aware)
router.get('/texts.json', async (req, res) => {
    try {
        let texts = {};
        try {
            const txt = await fsp.readFile(paths.texts, 'utf-8');
            texts = JSON.parse(txt);
        } catch (e) {
            texts = {};
        }
        const lang = (req.lang === 'en' || req.query.lang === 'en') ? 'en' : 'fr';
        if (lang === 'en' && texts['a propos'] && Array.isArray(texts['a propos'].bio)) {
            texts['a propos'].bio = [
                "I'm Mattia Parrinello, <strong>concert photographer</strong> based in <strong>Paris</strong>, <strong>MPRNL</strong> is the professional name under which I sign and share my work. What drives me is the raw energy of artists on stage, the moment when light, sound and emotion collide. I capture what the audience feels but doesn't always see: the intensity of a gaze, the sweat under the lights, the controlled chaos of a live show.",
                "Specialized in <strong>rap music</strong> and urban scenes, I've had the chance to shoot artists like <strong>Jok'air, Arma Jackson, Wallace Cleaver, Cyrus.wrld, Trebiz, Aswell</strong> and <strong>The French Kris</strong> in venues like <strong>La Cigale, La Boule Noire, La Bellevilloise, La Maroquinerie, Élispace, EMB Sannois, Paris La Défense Arena, Reims Arena, Zénith d'Amiens</strong> and the <strong>Pagaille Festival</strong>. From intimate showcase to open-air festival, every event is a new story to tell in images.",
                "My approach: being as close as possible to the action, anticipating the highlights, playing with stage light to create cinematic and striking images. No poses, no artifice, just the authenticity of live. My style blends strong contrasts, vibrant colors and an energy that oozes from every shot.",
                "I work with <strong>music media (Rapstar)</strong>, emerging artists, labels and venues. Based in <strong>Île-de-France</strong>, I travel across <strong>France</strong> to cover your events, concerts, festivals, showcases, backstage, promo, making-of, parties. Available immediately. Got a project or a show to cover? <a href=\"/contact?lang=en\">Let's talk.</a>",
                ""
            ];
            texts['a propos'].presentation = "Hi, I'm Mattia";
            if (texts.main) texts.main.nom = "Mattia PARRINELLO";
            if (texts.footer) {
                texts.footer.ligne1 = "Paris · Île-de-France, Available across France";
            }
            if (texts.meta) {
                texts.meta.title = "Mattia PARRINELLO, Concert & Live Photographer";
                texts.meta.description = "Concert and live photographer based in Paris, capturing authentic moments and strong emotions. Between music scenes, portraits and street photography, I tell unique stories through images.";
                texts.meta.og_title = "Mattia PARRINELLO, Concert Photographer";
                texts.meta.og_description = "Concert and live photographer capturing authentic moments and the energy of performances. Between portraits and urban scenes, I share images full of emotion and story.";
            }
        }
        res.json(texts);
    } catch (error) {
        console.error('Erreur lors de la lecture de texts.json:', error);
        res.status(500).json({ error: 'Erreur lors de la lecture des textes' });
    }
});

// Route pour la page Contact (H1 visible EN)
router.get('/contact', (req, res) => {
    servePage(req, res, {
        cacheKey: 'page:contact',
        file: 'contact.html',
        pageType: 'Contact',
        ttlMs: 5 * 60 * 1000,
        transform: (htmlContent) => {
            const isEn = req.lang === 'en';
            if (isEn) {
                htmlContent = htmlContent.replace('Contactez Mattia Parrinello, photographe de concert', 'Contact Mattia Parrinello, concert photographer');
                htmlContent = htmlContent.replace('Contactez-moi', 'Get in touch');
                htmlContent = htmlContent.replace('photographe de concert à Paris', 'concert photographer in Paris');
                htmlContent = htmlContent.replace('Vous cherchez un', 'Looking for a');
                htmlContent = htmlContent.replace('photographe de concert à Paris', 'concert photographer in Paris');
            }
            const faqContact = generateFaqHtml(req.lang);
            if (htmlContent.includes('<!-- Footer -->')) htmlContent = htmlContent.replace('<!-- Footer -->', `${faqContact}\n    <!-- Footer -->`);
            else htmlContent = htmlContent.replace('</div>\n    <!-- Footer -->', `${faqContact}\n    </div>\n    <!-- Footer -->`);
            return htmlContent;
        }
    });
});

// Redirection pour /contact/ vers /contact
router.get('/contact/', (req, res) => {
    res.redirect(301, '/contact');
});

// Route pour la page À propos (H1 visible EN)
router.get('/a-propos', (req, res) => {
    servePage(req, res, {
        cacheKey: 'page:about',
        file: 'about_me.html',
        pageType: 'À propos',
        ttlMs: 5 * 60 * 1000,
        transform: (htmlContent) => {
            const isEn = req.lang === 'en';
            if (isEn) {
                htmlContent = htmlContent.replace('Mattia Parrinello, photographe de concert à Paris', 'Mattia Parrinello, concert photographer in Paris');
                htmlContent = htmlContent.replace('À propos', 'About');
            }
            const lists = renderAboutListsHtml();
            htmlContent = htmlContent.replace('<!-- ARTISTS_LIST_PLACEHOLDER -->', lists.artists);
            htmlContent = htmlContent.replace('<!-- VENUES_LIST_PLACEHOLDER -->', lists.venues);
            const faqAbout = generateFaqHtml(req.lang);
            if (htmlContent.includes('<!-- Footer -->')) htmlContent = htmlContent.replace('<!-- Footer -->', `${faqAbout}\n    <!-- Footer -->`);
            else htmlContent = htmlContent.replace('</div>\n    <!-- Footer -->', `${faqAbout}\n    </div>\n    <!-- Footer -->`);
            return htmlContent;
        }
    });
});

// Normalisation pour comparer artistes/lieux entre seo.json et les galeries
function normalizeMatch(s) {
    return (s || '').toString().toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '');
}

// SEO: Listes « artistes photographiés » / « salles & festivals » à partir de seo.json,
// avec lien vers la galerie correspondante quand l'artiste/la salle y figure.
function renderAboutListsHtml() {
    const seo = loadSeoData();
    const galleries = getPublicGalleries();
    const artistSlug = new Map();
    const venueSlug = new Map();
    galleries.forEach(g => {
        if (g.artist && !artistSlug.has(normalizeMatch(g.artist))) artistSlug.set(normalizeMatch(g.artist), g.slug);
        if (g.venue && !venueSlug.has(normalizeMatch(g.venue))) venueSlug.set(normalizeMatch(g.venue), g.slug);
    });
    const linkItem = (label, slug) => slug
        ? `<li><a class="underline hover:opacity-80 transition duration-300" href="/galeries/${encodeURIComponent(slug)}">${escapeAttr(label)}</a></li>`
        : `<li>${escapeAttr(label)}</li>`;

    const artists = (seo.artists || []).map(a => linkItem(a.name, artistSlug.get(normalizeMatch(a.name)))).join('')
        || '<li>Aucun artiste pour le moment.</li>';
    const venues = (seo.venues || []).map(v => {
        const label = v.city ? `${v.name}, ${v.city}` : v.name;
        return linkItem(label, venueSlug.get(normalizeMatch(v.name)));
    }).join('') || '<li>Aucune salle pour le moment.</li>';

    return { artists, venues };
}

// Redirection pour /a-propos/ vers /a-propos
router.get('/a-propos/', (req, res) => {
    res.redirect(301, '/a-propos');
});

// Route pour la page Links (carte de visite digitale / QR code)
router.get('/links', (req, res) => {
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
    res.redirect(301, '/links');
});

// Route pour les mentions légales (meta/JSON-LD injectés comme les autres pages)
router.get('/mentions-legales', (req, res) => {
    servePage(req, res, {
        cacheKey: 'page:mentions',
        file: 'mentions.html',
        pageType: 'Mentions légales',
        ttlMs: 5 * 60 * 1000
    });
});

// Redirection pour /mentions-legales/ vers /mentions-legales
router.get('/mentions-legales/', (req, res) => {
    res.redirect(301, '/mentions-legales');
});

// Redirection pour /portfolio vers /
router.get('/portfolio', (req, res) => {
    res.redirect(301, '/');
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

function safeExternalUrl(url) {
    const raw = (url || '').toString().trim();
    if (!raw) return '';
    return /^https?:\/\//i.test(raw) ? raw : '';
}

function generateFaqHtml(lang) {
    const isEn = lang === 'en';
    const items = isEn ? [
        { q: 'How much does a concert report in Paris cost?', a: 'From 300€, free quote within 24h. Price depends on duration, number of photos and usage. Press and social networks with credit included, commercial use on request. <a href="/contact?lang=en">Contact me</a>.' },
        { q: 'What is the delivery time?', a: '48 to 72 hours. Online gallery and HD download via link. Available immediately, travel across France.' },
        { q: 'What usage rights are included?', a: 'Press and social media use with mandatory credit included. Commercial, advertising or print use requires a separate quote. All photos remain protected.' },
        { q: 'Where do you work?', a: 'Paris, Île-de-France and across France. Based in Paris, I travel everywhere in France for concerts, festivals, showcases and backstage.' }
    ] : [
        { q: 'Quel est le tarif d\'un reportage concert à Paris ?', a: 'À partir de 300€, devis gratuit sous 24h. Prix selon durée, nombre de photos et usage. Presse et réseaux avec crédit inclus, commercial sur devis. <a href="/contact">Contactez-moi</a>.' },
        { q: 'Quel est le délai de livraison ?', a: '48 à 72 heures. Galerie en ligne et HD via lien. Disponible immédiatement, déplacement partout en France.' },
        { q: 'Quels droits d\'usage sont inclus ?', a: 'Usage presse et réseaux sociaux avec crédit obligatoire inclus. Usage commercial, pub ou print sur devis. Toutes les photos restent protégées.' },
        { q: 'Dans quelles villes tu te déplaces ?', a: 'Paris, Île-de-France et partout en France. Basé à Paris, je me déplace partout en France pour concerts, festivals, showcases et backstage.' }
    ];
    const title = isEn ? 'FAQ' : 'Questions fréquentes';
    const rows = items.map(x => `<details class="faq-item"><summary>${escapeAttr(x.q)}<span class="faq-chevron">⌄</span></summary><p>${x.a}</p></details>`).join('');
    return `<style>
      .faq-section { margin: 2.5rem 0 2rem; }
      .faq-section h2 { font-family: "Signika", sans-serif; font-weight: 700; font-size: clamp(1.4rem, 2.5vw, 1.75rem); margin: 0 0 1rem; }
      .faq-item { border: 1px solid rgba(15, 23, 42, 0.12); border-radius: 12px; background: rgba(255,255,255,0.85); margin-bottom: 0.7rem; overflow: hidden; }
      .faq-item summary { list-style: none; cursor: pointer; display: flex; align-items: center; justify-content: space-between; gap: 0.8rem; padding: 0.9rem 1.1rem; font-weight: 700; font-family: "Signika", sans-serif; font-size: 0.95rem; color: #0f172a; }
      .faq-item summary::-webkit-details-marker { display: none; }
      .faq-item[open] summary { border-bottom: 1px solid rgba(15,23,42,0.08); }
      .faq-chevron { flex-shrink: 0; transition: transform 0.2s ease; font-size: 0.8rem; opacity: 0.6; }
      .faq-item[open] .faq-chevron { transform: rotate(180deg); }
      .faq-item p { margin: 0; padding: 0.9rem 1.1rem; font-size: 0.92rem; line-height: 1.65; color: rgba(51,65,85,1); }
      .faq-item p a { color: inherit; text-decoration: underline; }
      @media (prefers-color-scheme: dark) {
        .faq-item { background: rgba(15,23,42,0.75); border-color: rgba(148,163,184,0.22); }
        .faq-item summary { color: #f1f5f9; }
        .faq-item[open] summary { border-bottom-color: rgba(148,163,184,0.18); }
        .faq-item p { color: rgba(203,213,225,0.95); }
      }
    </style>
    <section class="faq-section" aria-label="${isEn ? 'FAQ' : 'Questions fréquentes'}">
      <h2>${title}</h2>
      ${rows}
    </section>`;
}

function generatePressKitHtml(gallery, canonical, lang) {
    const isEn = lang === 'en';
    const photos = (gallery.photos || []).slice(0, 3);
    if (photos.length === 0) return '';
    const artist = (gallery.artist || '').trim() || (isEn ? 'this artist' : 'cet artiste');
    const venue = gallery.venue ? ` ${isEn ? 'at' : 'à'} ${gallery.venue}` : '';
    const credit = `© Mattia Parrinello, photo.mprnl.fr, ${gallery.title}`;
    const galleryUrl = canonical;
    const creditLong = `© Mattia Parrinello, ${galleryUrl}, ${artist}${venue}`;
    const cards = photos.map((filename, i) => {
        const thumb = `/photos/resize?file=${encodeURIComponent(filename)}&w=400`;
        const alt = isEn ? `${artist} live, photo ${i + 1} by Mattia Parrinello` : `${artist} en concert, photo ${i + 1} par Mattia Parrinello`;
        const dl = isEn ? `Download HD ${i + 1}` : `Télécharger HD ${i + 1}`;
        return `<div class="press-kit-card"><img src="${thumb}" alt="${escapeAttr(alt)}" loading="lazy" /><button type="button" onclick="pressKitDownload('${escapeAttr(filename)}', this)">${dl}</button></div>`;
    }).join('');
    const aria = isEn ? 'Press kit' : 'Kit presse';
    const summaryTitle = isEn ? 'Press kit, 3 free HD photos' : 'Kit presse, 3 photos HD gratuites';
    const summarySub = isEn ? `${escapeAttr(artist)}${escapeAttr(venue)} · credit required` : `${escapeAttr(artist)}${escapeAttr(venue)} · crédit obligatoire`;
    const desc = isEn ? 'For artists, venues or press: 3 free HD photos for socials/website with credit + link.' : 'Pour l\'artiste, la salle ou la presse : 3 HD libres pour réseaux/site contre crédit + lien.';
    const copyLabel = isEn ? 'Copy' : 'Copier';
    const licence = isEn ? 'Press & social use with mandatory credit. HD via signed URL valid 1h.' : 'Usage presse &amp; réseaux avec crédit obligatoire. HD via URL signée valable 1h.';
    const copyLink = isEn ? 'Copy link' : 'Copier le lien';
    const shareLabel = isEn ? 'Share' : 'Partager';
    const mailSubject = isEn ? `Photos of ${artist} by Mattia Parrinello` : `Photos de ${artist} par Mattia Parrinello`;
    const mailBody = isEn ? `Gallery: ${galleryUrl}\n\nMandatory credit: ${creditLong}` : `Galerie : ${galleryUrl}\n\nCrédit obligatoire : ${creditLong}`;
    return `<details class="press-kit" id="press-kit" aria-label="${aria}">
      <summary>
        <span class="press-kit-summary-left">
          <span class="press-kit-summary-icon">⬇</span>
          <span class="press-kit-summary-text"><strong>${summaryTitle}</strong><span>${summarySub}</span></span>
        </span>
        <span class="press-kit-chevron">⌄</span>
      </summary>
      <div class="press-kit-body">
      <p class="press-kit-desc">${desc}</p>
      <div class="press-kit-grid">${cards}</div>
      <div class="press-kit-credit"><code id="press-kit-credit">${escapeAttr(creditLong)}</code><button type="button" class="press-kit-btn" onclick="pressKitCopyCredit()">${copyLabel}</button></div>
      <p class="press-kit-licence">${licence}</p>
      <div class="press-kit-actions">
        <a class="press-kit-btn primary" href="${escapeAttr(galleryUrl)}" onclick="pressKitCopyLink(event)">${copyLink}</a>
        <button type="button" class="press-kit-btn" onclick="pressKitShare()">${shareLabel}</button>
        <a class="press-kit-btn" href="https://wa.me/?text=${encodeURIComponent(galleryUrl)}" target="_blank" rel="noopener">WhatsApp</a>
        <a class="press-kit-btn" href="mailto:?subject=${encodeURIComponent(mailSubject)}&body=${encodeURIComponent(mailBody)}">Email</a>
      </div>
      </div>
      <script>
      (function(){
        var galleryUrl = ${JSON.stringify(galleryUrl)};
        var credit = ${JSON.stringify(creditLong)};
        window.pressKitCopyLink = function(e){
          if(e) e.preventDefault();
          var t = galleryUrl;
          if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(t).then(function(){ alert('Lien copié : ' + t); }); } else { prompt('Copiez ce lien :', t); }
        };
        window.pressKitCopyCredit = function(){
          if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(credit).then(function(){ var b=document.getElementById('press-kit-credit'); if(b){ b.textContent='Copié !'; setTimeout(function(){ b.textContent=credit; },1200);} }); } else { prompt('Crédit :', credit); }
        };
        window.pressKitShare = function(){
          if(navigator.share){ navigator.share({title: document.title, url: galleryUrl}).catch(function(){}); } else { window.pressKitCopyLink(); }
        };
        window.pressKitDownload = async function(filename, btn){
          var orig = btn ? btn.textContent : '';
          if(btn){ btn.textContent='Préparation...'; btn.disabled=true; }
          try{
            var res = await fetch('/api/request-hd-access', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({imagePath: 'photos/' + filename})});
            var data = await res.json();
            var url = (data && data.url) ? data.url : ('/photos/' + filename);
            var a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.rel = 'noopener';
            document.body.appendChild(a);
            a.click();
            setTimeout(function(){ if(a.parentNode) a.parentNode.removeChild(a); }, 1000);
            if(btn){ btn.textContent='Téléchargé ✓'; setTimeout(function(){ btn.textContent=orig; btn.disabled=false; }, 1800); }
          } catch(err){
            if(btn){ btn.textContent='Erreur'; setTimeout(function(){ btn.textContent=orig; btn.disabled=false; }, 1800); }
            window.open('/photos/' + filename, '_blank');
          }
        };
      })();
      </script>
    </details>`;
}

function artistPlatformIcon(platform) {
    if (platform === 'instagram') {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true" class="artist-platform-svg"><rect x="3" y="3" width="18" height="18" rx="5" ry="5"></rect><circle cx="12" cy="12" r="4"></circle><circle cx="17.5" cy="6.5" r="1"></circle></svg>`;
    }
    if (platform === 'deezer') {
        return `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" class="artist-platform-svg"><rect x="3" y="15" width="3" height="6" rx="0.6"></rect><rect x="7" y="13" width="3" height="8" rx="0.6"></rect><rect x="11" y="11" width="3" height="10" rx="0.6"></rect><rect x="15" y="9" width="3" height="12" rx="0.6"></rect><rect x="19" y="7" width="2" height="14" rx="0.5"></rect></svg>`;
    }
    return `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" class="artist-platform-svg"><path d="M12 1.75a10.25 10.25 0 1 0 0 20.5 10.25 10.25 0 0 0 0-20.5zm4.73 14.77a.73.73 0 0 1-1 .24c-2.73-1.67-6.17-2.05-10.22-1.11a.73.73 0 0 1-.33-1.42c4.43-1.03 8.23-.6 11.31 1.29.35.2.45.66.24 1zm1.42-3.24a.9.9 0 0 1-1.24.3c-3.13-1.91-7.9-2.46-11.6-1.33a.9.9 0 1 1-.52-1.73c4.11-1.25 9.28-.65 13.05 1.64a.9.9 0 0 1 .31 1.12zm.12-3.34c-3.75-2.23-9.98-2.43-13.56-1.32a1.08 1.08 0 0 1-.64-2.07c4.11-1.28 10.95-1.03 15.31 1.56a1.08 1.08 0 1 1-1.11 1.83z"></path></svg>`;
}

function renderArtistLinksSection(gallery) {
    const artist = (gallery.artist || '').trim();
    const links = gallery.artistLinks || {};
    const instagram = safeExternalUrl(links.instagram);
    const deezer = safeExternalUrl(links.deezer);
    const spotify = safeExternalUrl(links.spotify);

    const chips = [];
    if (instagram) {
        chips.push(`<a href="${escapeAttr(instagram)}" target="_blank" rel="noopener noreferrer nofollow" aria-label="Instagram de ${escapeAttr(artist)}" class="artist-link-chip" data-platform="instagram"><span class="artist-link-icon" aria-hidden="true">${artistPlatformIcon('instagram')}</span><span class="artist-link-label">Instagram</span></a>`);
    }
    if (deezer) {
        chips.push(`<a href="${escapeAttr(deezer)}" target="_blank" rel="noopener noreferrer nofollow" aria-label="Deezer de ${escapeAttr(artist)}" class="artist-link-chip" data-platform="deezer"><span class="artist-link-icon" aria-hidden="true">${artistPlatformIcon('deezer')}</span><span class="artist-link-label">Deezer</span></a>`);
    }
    if (spotify) {
        chips.push(`<a href="${escapeAttr(spotify)}" target="_blank" rel="noopener noreferrer nofollow" aria-label="Spotify de ${escapeAttr(artist)}" class="artist-link-chip" data-platform="spotify"><span class="artist-link-icon" aria-hidden="true">${artistPlatformIcon('spotify')}</span><span class="artist-link-label">Spotify</span></a>`);
    }

    if (!artist || chips.length === 0) {
        return '';
    }

    return `<section class="artist-links-panel" aria-label="Liens officiels de ${escapeAttr(artist)}">
            <div class="artist-links-head">
                <p class="artist-links-kicker">Liens officiels</p>
                <h2 class="artist-links-title">Retrouver ${escapeAttr(artist)}</h2>
            </div>
            <div class="artist-link-grid">${chips.join('')}</div>
    </section>`;
}

function renderGalleryCard(g) {
    const coverAlt = g.artist
        ? `${g.artist} en concert${g.venue ? ', ' + g.venue : ''}, photo par Mattia Parrinello`
        : `${g.title}, photo par Mattia Parrinello`;
    const cover = g.cover
        ? `<img class="cover" src="/photos/resize?file=${encodeURIComponent(g.cover)}&amp;w=800" srcset="/photos/resize?file=${encodeURIComponent(g.cover)}&amp;w=400 400w, /photos/resize?file=${encodeURIComponent(g.cover)}&amp;w=800 800w, /photos/resize?file=${encodeURIComponent(g.cover)}&amp;w=1200 1200w" sizes="(max-width:768px) 94vw, (max-width:1024px) 48vw, 31vw" alt="${escapeAttr(coverAlt)}" loading="lazy" />`
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
    renderPage(req, res, {
        cacheKey: 'page:galleries',
        file: 'galleries.html',
        pageType: 'Galeries',
        ttlMs: 2 * 60 * 1000,
        transform: async (htmlContent) => {
            const galleries = getPublicGalleries();

            // SEO: Enrichir title/description/keywords avec les artistes effectivement présents
            const artistNames = Array.from(new Set(galleries.map((g) => (g.artist || '').trim()).filter(Boolean)));
            if (artistNames.length > 0) {
                const topArtists = artistNames.slice(0, 3);
                const seoTitle = `Galeries concerts ${topArtists.join(', ')}, Photos live | Mattia Parrinello`;
                const seoDescription = `Galeries photo concerts de ${artistNames.slice(0, 10).join(', ')}. Photos live, festivals et showcases par Mattia Parrinello, photographe de concert à Paris.`;

                htmlContent = htmlContent.replace(/<title>[^<]*<\/title>/i, `<title>${escapeAttr(seoTitle)}</title>`);
                htmlContent = htmlContent.replace(/<meta name="description" content="[^"]*"\s*\/?\s*>/i, `<meta name="description" content="${escapeAttr(seoDescription)}" />`);

                const keywordParts = [
                    ...artistNames.slice(0, 20).map((a) => `photos ${a}`),
                    'galerie concert',
                    'photos live',
                    'photographe concert paris'
                ];

                const itemListSchema = {
                    '@context': 'https://schema.org',
                    '@type': 'ItemList',
                    name: 'Galeries de concerts par artiste',
                    numberOfItems: galleries.length,
                    itemListElement: galleries.slice(0, 120).map((g, idx) => ({
                        '@type': 'ListItem',
                        position: idx + 1,
                        name: g.artist ? `${g.artist}, ${g.title}` : g.title,
                        url: `https://www.photo.mprnl.fr/galeries/${encodeURIComponent(g.slug)}`
                    }))
                };

                const collectionSchema = {
                    '@context': 'https://schema.org',
                    '@type': 'CollectionPage',
                    name: 'Galeries de concerts',
                    url: 'https://www.photo.mprnl.fr/galeries',
                    about: artistNames.slice(0, 40).map((name) => ({ '@type': 'MusicGroup', name }))
                };

                const seoHead = `\n    <meta name="keywords" content="${escapeAttr(keywordParts.join(', '))}" />\n    <script type="application/ld+json">${JSON.stringify(itemListSchema)}</script>\n    <script type="application/ld+json">${JSON.stringify(collectionSchema)}</script>`;
                htmlContent = htmlContent.replace('</head>', `${seoHead}\n  </head>`);
            }

            const listHtml = galleries.length === 0
                ? `
      <div class="empty-state">
        <p class="text-lg">Les premières galeries arrivent bientôt.</p>
        <p class="mt-4"><a href="/contact" class="underline">Me contacter pour un projet</a></p>
      </div>`
                : `<div class="galleries-grid">${galleries.map(renderGalleryCard).join('')}</div>`;

            return htmlContent.replace('<!-- GALLERIES_LIST_PLACEHOLDER -->', listHtml);
        }
    }).catch((error) => {
        console.error('Erreur /galeries:', error);
        res.status(500).send('Erreur lors du chargement des galeries');
    });
});
router.get('/galeries/', (req, res) => res.redirect(301, '/galeries'));

router.get('/galeries/:slug', async (req, res) => {
    try {
        const gallery = galleryService.getGalleryBySlug(req.params.slug);
        if (!gallery || gallery.published === false
            || (process.env.NODE_ENV === 'production' && isManifestlyFake(gallery))) {
            return res.status(404).sendFile(path.join(paths.pages, '404.html'));
        }

        const lang = req.lang === 'en' ? 'en' : 'fr';
        const isEn = lang === 'en';
        const cacheKey = `page:gallery:${gallery.slug}:${lang}`;
        const cached = getCached(cacheKey);
        if (cached) return res.send(cached);

        const htmlPath = path.join(paths.pages, 'gallery.html');
        let htmlContent = await fsp.readFile(htmlPath, 'utf-8');
        if (isEn) htmlContent = htmlContent.replace('<html lang="fr"', '<html lang="en"');

        // Meta tags dynamiques spécifiques à la galerie (optimisés pour la recherche artiste)
        const artistName = (gallery.artist || '').trim();
        const metaTitle = isEn
            ? (artistName ? `Photos of ${artistName} live, ${gallery.title} | Mattia Parrinello` : `${gallery.title}, Mattia Parrinello`)
            : (artistName ? `Photos de ${artistName} en concert, ${gallery.title} | Mattia Parrinello` : `${gallery.title}, Mattia Parrinello`);
        const metaDescParts = [artistName, gallery.venue, formatGalleryDate(gallery.date)].filter(Boolean);
        const metaDesc = isEn
            ? (gallery.description ? `${gallery.description} (EN: live photos by Mattia Parrinello, concert photographer in Paris)` : (artistName ? `Live photo gallery of ${artistName}${metaDescParts.length ? ', ' + metaDescParts.join(' · ') : ''}. Photos by Mattia Parrinello, concert photographer in Paris.` : `Concert photo gallery: ${gallery.title}${metaDescParts.length ? ', ' + metaDescParts.join(' · ') : ''}. By Mattia Parrinello.`))
            : (gallery.description
            || (artistName
                ? `Galerie photo de ${artistName} en concert${metaDescParts.length ? ', ' + metaDescParts.join(' · ') : ''}. Photos live par Mattia Parrinello, photographe de concert à Paris.`
                : `Galerie photo concert : ${gallery.title}${metaDescParts.length ? ', ' + metaDescParts.join(' · ') : ''}. Photographié par Mattia Parrinello, photographe de concert à Paris.`));

        htmlContent = htmlContent.replace('{{DYNAMIC_TITLE}}', escapeAttr(metaTitle));
        htmlContent = htmlContent.replace('{{DYNAMIC_DESCRIPTION}}', escapeAttr(metaDesc));

        // Canonical + og tags manuels (textUtils.injectMetaTags s'appuie sur texts.json par page)
        const canonical = `https://www.photo.mprnl.fr/galeries/${encodeURIComponent(gallery.slug)}`;
        const ogImage = gallery.cover
            ? `https://www.photo.mprnl.fr/photos/resize?file=${encodeURIComponent(gallery.cover)}&w=1200`
            : 'https://www.photo.mprnl.fr/dist/assets/og-image.jpg';

        const artistLinks = gallery.artistLinks || {};
        const artistSameAs = [
            safeExternalUrl(artistLinks.instagram),
            safeExternalUrl(artistLinks.deezer),
            safeExternalUrl(artistLinks.spotify)
        ].filter(Boolean);
        const keywords = artistName
            ? `photos ${artistName}, ${artistName} concert, galerie ${artistName}, photographe concert Paris`
            : 'galerie photo concert, photos live, photographe concert Paris';

        const canonicalEn = `${canonical}?lang=en`;
        const hreflangFr = canonical;
        const hreflangEn = canonicalEn;
        const extraHead = `
    <link rel="canonical" href="${isEn ? canonicalEn : canonical}" />
    <link rel="alternate" hreflang="fr" href="${hreflangFr}" />
    <link rel="alternate" hreflang="en" href="${hreflangEn}" />
    <link rel="alternate" hreflang="x-default" href="${hreflangFr}" />
    <meta name="keywords" content="${escapeAttr(keywords)}" />
    <meta property="og:type" content="article" />
    <meta property="og:locale" content="${isEn ? 'en_US' : 'fr_FR'}" />
    <meta property="og:locale:alternate" content="${isEn ? 'fr_FR' : 'en_US'}" />
    <meta property="og:title" content="${escapeAttr(metaTitle)}" />
    <meta property="og:description" content="${escapeAttr(metaDesc)}" />
    <meta property="og:url" content="${isEn ? canonicalEn : canonical}" />
    <meta property="og:image" content="${ogImage}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeAttr(metaTitle)}" />
    <meta name="twitter:description" content="${escapeAttr(metaDesc)}" />
    <meta name="twitter:image" content="${ogImage}" />
    ${artistName ? `<meta property="article:tag" content="${escapeAttr(artistName)}" />` : ''}`;

        // Schema.org ImageGallery
        const schema = {
            '@context': 'https://schema.org',
            '@type': 'ImageGallery',
            name: gallery.title,
            description: metaDesc,
            url: canonical,
            ...(gallery.date ? { datePublished: gallery.date } : {}),
            ...(gallery.venue ? { contentLocation: { '@type': 'Place', name: gallery.venue } } : {}),
            ...(artistName ? { about: { '@type': 'MusicGroup', name: artistName, ...(artistSameAs.length ? { sameAs: artistSameAs } : {}) } } : {}),
            author: {
                '@type': 'Person',
                '@id': 'https://www.photo.mprnl.fr/#person',
                name: 'Mattia Parrinello',
                url: 'https://www.photo.mprnl.fr'
            },
            image: (gallery.photos || []).map(f => ({
                '@type': 'ImageObject',
                contentUrl: `https://www.photo.mprnl.fr/photos/resize?file=${encodeURIComponent(f)}&w=1600`,
                thumbnailUrl: `https://www.photo.mprnl.fr/photos/resize?file=${encodeURIComponent(f)}&w=640`,
                creator: { '@type': 'Person', '@id': 'https://www.photo.mprnl.fr/#person', name: 'Mattia Parrinello' }
            }))
        };

        const schemaNodes = [schema];
        if (artistName) {
            schemaNodes.push({
                '@context': 'https://schema.org',
                '@type': 'MusicGroup',
                name: artistName,
                ...(artistSameAs.length ? { sameAs: artistSameAs } : {})
            });
        }
        // Fil d'Ariane cohérent avec le breadcrumb visible du hero
        schemaNodes.push({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Accueil', item: 'https://www.photo.mprnl.fr' },
                { '@type': 'ListItem', position: 2, name: 'Galeries', item: 'https://www.photo.mprnl.fr/galeries' },
                { '@type': 'ListItem', position: 3, name: gallery.title, item: canonical }
            ]
        });
        const schemaScript = schemaNodes.map((node) => `<script type="application/ld+json">${JSON.stringify(node)}</script>`).join('\n    ');

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
          <nav class="breadcrumb" aria-label="Fil d'Ariane">
            <a href="/">Accueil</a>
            <span aria-hidden="true">›</span>
            <a href="/galeries">Galeries</a>
            <span aria-hidden="true">›</span>
            <span aria-current="page">${escapeAttr(gallery.title)}</span>
          </nav>
          <h1>${escapeAttr(gallery.title)}</h1>
          ${metaLine ? `<p class="meta">${escapeAttr(metaLine)}</p>` : ''}
        </div>
      </section>`;
        htmlContent = htmlContent.replace('<!-- GALLERY_HERO_PLACEHOLDER -->', heroHtml);

        const descriptionSection = gallery.description
            ? `<section class="gallery-description-panel"><p class="gallery-description-text">${escapeAttr(gallery.description)}</p></section>`
            : '';
        const artistLinksSection = renderArtistLinksSection(gallery);
        const introHtml = (descriptionSection || artistLinksSection)
            ? `<section class="gallery-intro-grid">${descriptionSection}${artistLinksSection}</section>`
            : '';
        htmlContent = htmlContent.replace('<!-- GALLERY_DESCRIPTION_PLACEHOLDER -->', introHtml);

        // Photos (masonry via CSS columns + Fancybox)
        const altContext = artistName
            ? `Concert de ${artistName}${gallery.venue ? ' à ' + gallery.venue : ''}`
            : gallery.title;
        const photosWithDims = await Promise.all((gallery.photos || []).map(async (filename) => ({
            filename,
            dims: await imageMeta.getImageDimensions(filename)
        })));
        const photosHtml = photosWithDims.map(({ filename, dims }, i) => {
            const file = encodeURIComponent(filename);
            const full = `/photos/resize?file=${file}&w=1600`;
            const thumb = `/photos/resize?file=${file}&w=640`;
            const srcset = `/photos/resize?file=${file}&w=320 320w, /photos/resize?file=${file}&w=480 480w, /photos/resize?file=${file}&w=640 640w, /photos/resize?file=${file}&w=960 960w`;
            const loading = i < 6 ? 'eager' : 'lazy';
            const alt = `${altContext}, photo ${i + 1} par Mattia Parrinello`;
            const sizeAttrs = dims && dims.width
                ? ` width="640" height="${Math.round(640 * dims.height / dims.width)}"`
                : '';
            return `<a href="${full}" data-fancybox="gallery"><img src="${thumb}" srcset="${srcset}" sizes="(max-width:768px) 50vw, (max-width:1440px) 33vw, 25vw" alt="${escapeAttr(alt)}" loading="${loading}"${sizeAttrs} /></a>`;
        }).join('');
        const masonryHtml = photosHtml
            ? `<div class="gallery-photos-shell"><div class="gallery-divider-grid" aria-hidden="true"></div><section class="masonry">${photosHtml}</section></div>`
            : '<p class="text-center text-gray-500 py-8">Aucune photo dans cette galerie.</p>';
        htmlContent = htmlContent.replace('<!-- GALLERY_PHOTOS_PLACEHOLDER -->', masonryHtml);

        const pressKitHtml = generatePressKitHtml(gallery, canonical, lang);
        if (htmlContent.includes('<!-- PRESS_KIT_PLACEHOLDER -->')) {
            htmlContent = htmlContent.replace('<!-- PRESS_KIT_PLACEHOLDER -->', pressKitHtml);
        } else if (pressKitHtml) {
            htmlContent = htmlContent.replace('</main>', `${pressKitHtml}\n    </main>`);
        }

        // Lang switcher flottant pour galeries (anglais partiel), cookie persistant
        {
            const toggleHref = isEn ? `/galeries/${encodeURIComponent(gallery.slug)}?lang=fr` : `/galeries/${encodeURIComponent(gallery.slug)}?lang=en`;
            const toggleLabel = isEn ? 'FR' : 'EN';
            const toggleTitle = isEn ? 'Voir en français' : 'View in English';
            const langSwitcher = `\n    <style>.lang-switch{position:fixed;top:14px;right:14px;z-index:50;background:rgba(255,255,255,0.92);border:1px solid rgba(15,23,42,0.12);border-radius:999px;padding:4px 10px;font-family:Signika,sans-serif;font-weight:700;font-size:0.72rem;backdrop-filter:blur(6px);text-decoration:none;color:#0f172a}@media(prefers-color-scheme:dark){.lang-switch{background:rgba(15,23,42,0.9);border-color:rgba(148,163,184,0.22);color:#fff}}</style>\n    <a class="lang-switch" href="${toggleHref}" hreflang="${isEn ? 'fr' : 'en'}" aria-label="${toggleTitle}">${toggleLabel}</a>`;
            if (htmlContent.includes('</body>')) htmlContent = htmlContent.replace('</body>', `${langSwitcher}\n  </body>`);
        }

        htmlContent = translateHtml(htmlContent, lang);

        try { setCache(cacheKey, htmlContent, 5 * 60 * 1000); } catch (e) { }
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

        // lastmod réels : date de modification des fichiers (évite les dates factices)
        function fileLastmod(relativePath) {
            try {
                const st = fs.statSync(path.join(paths.root, relativePath));
                return st.mtime.toISOString().slice(0, 10);
            } catch (e) {
                return new Date().toISOString().slice(0, 10);
            }
        }

        // Date de dernière mise à jour des galeries (metadata.lastUpdated)
        let galleriesLastmod = new Date().toISOString().slice(0, 10);
        try {
            const gMeta = galleryService.loadGalleries().metadata;
            if (gMeta && gMeta.lastUpdated) {
                galleriesLastmod = String(gMeta.lastUpdated).slice(0, 10);
            }
        } catch (e) { /* dernière date par défaut */ }

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
                lastmod: fileLastmod('config/links.json'),
                changefreq: 'weekly',
                priority: '0.9'
            },
            {
                loc: '/a-propos',
                lastmod: fileLastmod('pages/about_me.html'),
                changefreq: 'monthly',
                priority: '0.7'
            },
            {
                loc: '/contact',
                lastmod: fileLastmod('pages/contact.html'),
                changefreq: 'monthly',
                priority: '0.6'
            },
            {
                loc: '/galeries',
                lastmod: galleriesLastmod,
                changefreq: 'weekly',
                priority: '0.9'
            },
            {
                loc: '/mentions-legales',
                lastmod: fileLastmod('pages/mentions.html'),
                changefreq: 'yearly',
                priority: '0.3'
            }
        ];

        // Add published galleries (avec extension image pour le référencement des photos)
        try {
            const galleries = getPublicGalleries();
            galleries.forEach(g => {
                const lastmod = (g.updatedAt || g.createdAt || new Date().toISOString()).slice(0, 10);
                const imageUrls = (g.photos || []).slice(0, 20).map(f => ({
                    url: `https://www.photo.mprnl.fr/photos/resize?file=${encodeURIComponent(f)}&w=1600`,
                    title: g.title
                }));
                staticPages.push({
                    loc: `/galeries/${g.slug}`,
                    lastmod,
                    changefreq: 'monthly',
                    priority: '0.8',
                    images: imageUrls
                });
            });
        } catch (e) {
            console.warn('Could not add galleries to sitemap:', e.message);
        }

        // Build XML (avec xml:image pour les galeries)
        const urls = staticPages.map((p) => {
            const imageTags = (p.images || [])
                .map(img => `\n      <image:image>\n        <image:loc>${img.url}</image:loc>\n        <image:title>${escapeAttr(img.title)}</image:title>\n      </image:image>`)
                .join('');
            return `  <url>\n    <loc>${baseUrl}${p.loc}</loc>\n    <lastmod>${p.lastmod}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>${imageTags}\n  </url>\n`;
        }).join('');

        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls}</urlset>`;

        res.header('Content-Type', 'application/xml');
        res.send(xml);
    } catch (error) {
        console.error('Error generating sitemap:', error);
        res.status(500).send('Error generating sitemap');
    }
});

module.exports = router;
