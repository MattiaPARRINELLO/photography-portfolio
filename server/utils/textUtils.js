const fs = require('fs');
const path = require('path');
const serverConfig = require('../config');
const { translateHtml } = require('./i18n');

// SEO: Chargement des données SEO centralisées
const seoDataPath = path.join(__dirname, '..', '..', 'config', 'seo.json');

class TextUtils {
    constructor() {
        this.textsFile = serverConfig.getPaths().texts;
    }

    /**
     * Charge les textes depuis texts.json
     * @returns {Object} Objet contenant les textes
     */
    loadTexts() {
        try {
            if (fs.existsSync(this.textsFile)) {
                return JSON.parse(fs.readFileSync(this.textsFile, 'utf-8'));
            } else {
                // Si texts.json n'existe pas, le créer depuis texts.json.example
                const exampleFile = path.join(path.dirname(this.textsFile), 'texts.json.example');
                if (fs.existsSync(exampleFile)) {
                    console.log('📋 texts.json introuvable, création depuis texts.json.example');
                    const exampleContent = fs.readFileSync(exampleFile, 'utf-8');
                    fs.writeFileSync(this.textsFile, exampleContent);
                    return JSON.parse(exampleContent);
                }
            }
        } catch (error) {
            console.error('Erreur lors du chargement des textes:', error);
        }
        return {};
    }

    // SEO: Charge les données SEO depuis config/seo.json
    loadSeoData() {
        try {
            if (fs.existsSync(seoDataPath)) {
                return JSON.parse(fs.readFileSync(seoDataPath, 'utf-8'));
            }
        } catch (error) {
            console.error('Erreur lors du chargement de seo.json:', error);
        }
        return {};
    }

    _getLang(req) {
        if (req && req.lang === 'en') return 'en';
        if (req && req.lang === 'fr') return 'fr';
        return (req && req.query && req.query.lang === 'en') ? 'en' : 'fr';
    }

    // SEO: Résout la clé de page SEO à partir du pageType
    _resolvePageKey(pageType) {
        const mapping = {
            'Portfolio': 'home',
            '': 'home',
            'Contact': 'contact',
            'À propos': 'about',
            'Mentions légales': 'mentions',
            'Links': 'links',
            'Galeries': 'galleries'
        };
        return mapping[pageType] || 'home';
    }

    /**
     * Injecte les meta tags dans le contenu HTML
     * @param {string} htmlContent - Contenu HTML
     * @param {Object} texts - Objet textes
     * @param {Object} req - Objet request Express
     * @param {string} pageType - Type de page
     * @param {Object} campaignInfo - Informations de campagne
     * @returns {string} HTML avec meta tags injectés
     */
    injectMetaTags(htmlContent, texts, req, pageType = '', campaignInfo = null) {
        // SEO: Charger les données SEO pour des meta uniques par page
        const seo = this.loadSeoData();
        const pageKey = this._resolvePageKey(pageType);
        const pageSeo = (seo.pages && seo.pages[pageKey]) || {};
        const siteSeo = seo.site || {};

        const lang = this._getLang(req);
        const isEn = lang === 'en';
        let injectedHtml = htmlContent;

        if (isEn) {
            injectedHtml = injectedHtml.replace('<html lang="fr"', '<html lang="en"');
        }

        // SEO: Utiliser les meta SEO optimisés de seo.json (prioritaire sur texts.json), avec variante EN si ?lang=en
        const title = (isEn && pageSeo.title_en ? pageSeo.title_en : null) || pageSeo.title || (texts.meta && texts.meta.title ? texts.meta.title + (pageType ? ' - ' + pageType : '') : 'Mattia Parrinello');
        const description = (isEn && pageSeo.description_en ? pageSeo.description_en : null) || pageSeo.description || (texts.meta && texts.meta.description) || 'Portfolio photographique';

        // Remplacement des placeholders
        injectedHtml = injectedHtml.replace('{{DYNAMIC_TITLE}}', title);
        injectedHtml = injectedHtml.replace('{{DYNAMIC_DESCRIPTION}}', description);

        // Construire les meta tags supplémentaires
        const metaPlaceholderEnd = '    <!-- META_PLACEHOLDER_END -->';
        let additionalMetas = '';

        // SEO: Keywords optimisés par page (EN)
        const keywords = (isEn && pageSeo.keywords_en ? pageSeo.keywords_en : null) || pageSeo.keywords || (texts.meta && texts.meta.keywords) || '';
        if (keywords) {
            additionalMetas += `    <meta name="keywords" content="${keywords}">\n`;
        }

        // SEO: Auteur
        const author = siteSeo.author || (texts.meta && texts.meta.author) || 'Mattia Parrinello';
        additionalMetas += `    <meta name="author" content="${author}">\n`;

        // Récupérer les informations de protocole et host
        const protocol = req.protocol || 'https';
        const host = req.get('host') || 'www.photo.mprnl.fr';
        const fullUrl = `${protocol}://${host}${req.originalUrl}`;
        const baseUrl = siteSeo.url || `${protocol}://${host}`;

        // SEO: Balise canonical + hreflang (anglais partiel via ?lang=en)
        const pathOnly = (req.path || '/').replace(/\/$/, '') || '/';
        const canonicalPath = isEn ? `${pathOnly}?lang=en` : pathOnly;
        const canonicalUrl = `${baseUrl}${canonicalPath}`;
        additionalMetas += `    <link rel="canonical" href="${canonicalUrl}">\n`;
        const frUrl = `${baseUrl}${pathOnly}`;
        const enUrl = `${baseUrl}${pathOnly}?lang=en`;
        additionalMetas += `    <link rel="alternate" hreflang="fr" href="${frUrl}">\n`;
        additionalMetas += `    <link rel="alternate" hreflang="en" href="${enUrl}">\n`;
        additionalMetas += `    <link rel="alternate" hreflang="x-default" href="${frUrl}">\n`;

        // SEO: Open Graph tags optimisés (variante EN)
        const ogTitle = (isEn && pageSeo.og_title_en ? pageSeo.og_title_en : null) || pageSeo.og_title || title;
        const ogDescription = (isEn && pageSeo.og_description_en ? pageSeo.og_description_en : null) || pageSeo.og_description || description;
        // og:image : valeur centralisée en code (og-image.jpg). La surcharge texts.json
        // reste possible, sauf si elle pointe encore vers l'ancien Avatar.png par défaut
        // (config de prod non versionnée) - dans ce cas, l'og-image prend le relais.
        const legacyOgImage = '/dist/assets/Avatar.png';
        const ogImageRef = (texts.meta && texts.meta.og_image && texts.meta.og_image !== legacyOgImage)
            ? texts.meta.og_image
            : '/dist/assets/og-image.jpg';
        const ogImage = `${baseUrl}${ogImageRef}`;

        additionalMetas += `    <meta property="og:title" content="${ogTitle}">\n`;
        additionalMetas += `    <meta property="og:description" content="${ogDescription}">\n`;
        additionalMetas += `    <meta property="og:image" content="${ogImage}">\n`;
        additionalMetas += `    <meta property="og:type" content="website">\n`;
        additionalMetas += `    <meta property="og:url" content="${canonicalUrl}">\n`;
        additionalMetas += `    <meta property="og:locale" content="${isEn ? 'en_US' : 'fr_FR'}">\n`;
        if (!isEn) {
            additionalMetas += `    <meta property="og:locale:alternate" content="en_US">\n`;
        } else {
            additionalMetas += `    <meta property="og:locale:alternate" content="fr_FR">\n`;
        }
        additionalMetas += `    <meta property="og:site_name" content="Mattia Parrinello - Photographe de Concert">\n`;

        // SEO: Twitter Cards
        additionalMetas += `    <meta name="twitter:card" content="summary_large_image">\n`;
        additionalMetas += `    <meta name="twitter:title" content="${ogTitle}">\n`;
        additionalMetas += `    <meta name="twitter:description" content="${ogDescription}">\n`;
        additionalMetas += `    <meta name="twitter:image" content="${ogImage}">\n`;

        // SEO: Geo meta tags pour le référencement local
        additionalMetas += `    <meta name="geo.region" content="FR-IDF">\n`;
        additionalMetas += `    <meta name="geo.placename" content="Paris">\n`;

        // Vérifier s'il y a des informations de campagne à injecter
        let campaignScript = '';
        const activeCampaignInfo = campaignInfo || (req.cookies && req.cookies.user_campaign_info ? JSON.parse(req.cookies.user_campaign_info) : null);

        if (activeCampaignInfo) {
            campaignScript = `\n    <script>\n        // Informations de campagne injectées\n        window.campaignInfo = ${JSON.stringify(activeCampaignInfo)};\n    </script>`;
        }

        // Injecter les meta tags et le script de campagne
        injectedHtml = injectedHtml.replace(metaPlaceholderEnd, `${additionalMetas}${campaignScript}\n${metaPlaceholderEnd}`);

        // Lang switcher flottant (anglais partiel) - persiste via cookie
        const toggleHref = isEn ? `${pathOnly}?lang=fr` : `${pathOnly}?lang=en`;
        const toggleLabel = isEn ? 'FR' : 'EN';
        const toggleTitle = isEn ? 'Voir en français' : 'View in English';
        const langSwitcher = `\n    <style>.lang-switch{position:fixed;top:14px;right:14px;z-index:50;background:rgba(255,255,255,0.92);border:1px solid rgba(15,23,42,0.12);border-radius:999px;padding:4px 10px;font-family:Signika,sans-serif;font-weight:700;font-size:0.72rem;backdrop-filter:blur(6px);text-decoration:none;color:#0f172a}@media(prefers-color-scheme:dark){.lang-switch{background:rgba(15,23,42,0.9);border-color:rgba(148,163,184,0.22);color:#fff}}</style>\n    <a class="lang-switch" href="${toggleHref}" hreflang="${isEn ? 'fr' : 'en'}" aria-label="${toggleTitle}">${toggleLabel}</a>`;
        if (injectedHtml.includes('</body>')) {
            injectedHtml = injectedHtml.replace('</body>', `${langSwitcher}\n  </body>`);
        }

        injectedHtml = translateHtml(injectedHtml, lang);

        return injectedHtml;
    }

    // SEO: Génère le JSON-LD Schema.org pour une page donnée
    // Graphe unique (@graph) avec des @id stables : les entités Person,
    // ProfessionalService et WebSite sont définies une seule fois et référencées.
    generateSchemaJsonLd(pageType, req) {
        const lang = this._getLang(req);
        const seo = this.loadSeoData();
        const siteSeo = seo.site || {};
        const baseUrl = siteSeo.url || 'https://www.photo.mprnl.fr';
        const author = siteSeo.author || 'Mattia Parrinello';
        const pageKey = this._resolvePageKey(pageType);

        const social = [
            siteSeo.social && siteSeo.social.instagram,
            siteSeo.social && siteSeo.social.tiktok
        ].filter(Boolean);

        // @id stables (une seule identité, reliée partout)
        const personId = `${baseUrl}/#person`;
        const serviceId = `${baseUrl}/#service`;
        const websiteId = `${baseUrl}/#website`;
        const pagePath = this._pagePath(pageKey);
        const pageId = `${baseUrl}${pagePath}#webpage`;

        const address = {
            '@type': 'PostalAddress',
            'addressLocality': 'Paris',
            'addressRegion': 'Île-de-France',
            'addressCountry': 'FR'
        };

        const graph = [
            {
                '@type': 'WebSite',
                '@id': websiteId,
                'name': siteSeo.name || 'Mattia Parrinello - Photographe de Concert',
                'url': baseUrl,
                'inLanguage': [lang, lang === 'fr' ? 'en' : 'fr'],
                'publisher': { '@id': personId }
            },
            {
                '@type': 'Person',
                '@id': personId,
                'name': author,
                'alternateName': 'MPRNL',
                'url': baseUrl,
                'image': `${baseUrl}/dist/assets/og-image.jpg`,
                'jobTitle': 'Photographe de concert',
                'description': 'Photographe de concert basé à Paris, spécialisé dans la musique rap et les événements live. Captation de concerts, festivals, showcases et backstage.',
                'address': address,
                'sameAs': social,
                'knowsAbout': [
                    'Photographie de concert',
                    'Photographie de festival',
                    'Photographie de backstage',
                    'Photographie événementielle musicale',
                    'Photographie de spectacle'
                ]
            },
            {
                '@type': 'ProfessionalService',
                '@id': serviceId,
                'name': 'Mattia Parrinello - Photographe de Concert',
                'url': baseUrl,
                'image': `${baseUrl}/dist/assets/og-image.jpg`,
                'description': 'Photographe de concert professionnel basé à Paris, spécialisé dans la captation de concerts, festivals, showcases et backstage. Musique rap et tous genres.',
                'telephone': siteSeo.phone || '',
                'address': address,
                'areaServed': [
                    { '@type': 'City', 'name': 'Paris' },
                    { '@type': 'AdministrativeArea', 'name': 'Île-de-France' },
                    { '@type': 'Country', 'name': 'France' }
                ],
                'priceRange': '€€',
                'founder': { '@id': personId },
                'sameAs': social,
                'knowsAbout': [
                    'Photographie de concert',
                    'Photographie de festival',
                    'Photographie de backstage',
                    'Photographie événementielle musicale',
                    'Photographie de spectacle'
                ]
            },
            {
                '@type': 'WebPage',
                '@id': pageId,
                'url': `${baseUrl}${pagePath}`,
                'isPartOf': { '@id': websiteId },
                'about': { '@id': personId },
                'inLanguage': lang
            }
        ];

        // SEO: Schema spécifique par page
        if (pageKey === 'home') {
            graph.push({
                '@type': 'ImageGallery',
                'name': 'Portfolio - Photos de concert par Mattia Parrinello',
                'description': 'Galerie de photographies de concerts, festivals et événements musicaux à Paris et en France.',
                'url': baseUrl,
                'author': { '@id': personId }
            });
        }

        if (pageKey === 'contact') {
            graph.push({
                '@type': 'ContactPage',
                'name': 'Contacter Mattia Parrinello - Photographe de Concert',
                'url': `${baseUrl}/contact`,
                'mainEntity': { '@id': personId }
            });
        }

        if (pageKey === 'about') {
            graph.push({
                '@type': 'AboutPage',
                'name': 'À propos de Mattia Parrinello - Photographe de Concert',
                'url': `${baseUrl}/a-propos`,
                'mainEntity': { '@id': personId }
            });
        }

        // SEO: BreadcrumbList
        const breadcrumbs = this._generateBreadcrumbs(pageKey, baseUrl);
        if (breadcrumbs) {
            graph.push(breadcrumbs);
        }

        // FAQPage for AIO/GEO (about + contact)
        if (pageKey === 'about' || pageKey === 'contact') {
            const faq = this._getFaq(lang, baseUrl);
            if (faq) graph.push(faq);
        }

        return `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })}</script>`;
    }

    // SEO: Chemin d'URL canonique par clé de page
    _pagePath(pageKey) {
        const paths = {
            'home': '/',
            'about': '/a-propos',
            'contact': '/contact',
            'mentions': '/mentions-legales',
            'links': '/links',
            'galleries': '/galeries'
        };
        return paths[pageKey] || '/';
    }

    // SEO: Génère le breadcrumb Schema.org
    _generateBreadcrumbs(pageKey, baseUrl) {
        const items = [{ name: 'Accueil', url: baseUrl }];

        const pageNames = {
            'about': { name: 'À propos', url: `${baseUrl}/a-propos` },
            'contact': { name: 'Contact', url: `${baseUrl}/contact` },
            'mentions': { name: 'Mentions légales', url: `${baseUrl}/mentions-legales` },
            'links': { name: 'Liens', url: `${baseUrl}/links` },
            'galleries': { name: 'Galeries', url: `${baseUrl}/galeries` }
        };

        if (pageKey !== 'home' && pageNames[pageKey]) {
            items.push(pageNames[pageKey]);
        }

        if (items.length < 2) return null;

        return {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            'itemListElement': items.map((item, i) => ({
                '@type': 'ListItem',
                'position': i + 1,
                'name': item.name,
                'item': item.url
            }))
        };
    }

    _getFaq(lang, baseUrl) {
        const isEn = lang === 'en';
        const qs = isEn ? [
            { q: 'How much does a concert report in Paris cost?', a: 'From 300€, free quote within 24h. Price depends on duration, number of photos and usage. Press and social networks with credit included, commercial use on request. More on ' + baseUrl + '/contact' },
            { q: 'What is the delivery time?', a: '48 to 72 hours. Online gallery and HD download via link. Available immediately, travel across France.' },
            { q: 'What usage rights are included?', a: 'Press and social media use with mandatory credit included. Commercial, advertising or print use requires a separate quote. All photos remain protected.' },
            { q: 'Where do you work?', a: 'Paris, Île-de-France and across France. Based in Paris, I travel everywhere in France for concerts, festivals, showcases and backstage.' }
        ] : [
            { q: 'Quel est le tarif d\'un reportage concert à Paris ?', a: 'À partir de 300€, devis gratuit sous 24h. Prix selon durée, nombre de photos et usage. Presse et réseaux avec crédit inclus, commercial sur devis. Détails sur ' + baseUrl + '/contact' },
            { q: 'Quel est le délai de livraison ?', a: '48 à 72 heures. Galerie en ligne et HD via lien. Disponible immédiatement, déplacement partout en France.' },
            { q: 'Quels droits d\'usage sont inclus ?', a: 'Usage presse et réseaux sociaux avec crédit obligatoire inclus. Usage commercial, pub ou print sur devis. Toutes les photos restent protégées.' },
            { q: 'Dans quelles villes tu te déplaces ?', a: 'Paris, Île-de-France et partout en France. Basé à Paris, je me déplace partout en France pour concerts, festivals, showcases et backstage.' }
        ];
        return {
            '@type': 'FAQPage',
            'inLanguage': lang,
            'mainEntity': qs.map(x => ({
                '@type': 'Question',
                'name': x.q,
                'acceptedAnswer': { '@type': 'Answer', 'text': x.a }
            }))
        };
    }
}

module.exports = new TextUtils();
