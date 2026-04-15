const fs = require('fs');
const path = require('path');
const serverConfig = require('../config');

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
        console.log(`🔍 Injection meta tags pour la page: ${pageType || 'Accueil'}`);

        // SEO: Charger les données SEO pour des meta uniques par page
        const seo = this.loadSeoData();
        const pageKey = this._resolvePageKey(pageType);
        const pageSeo = (seo.pages && seo.pages[pageKey]) || {};
        const siteSeo = seo.site || {};

        let injectedHtml = htmlContent;

        // SEO: Utiliser les meta SEO optimisés de seo.json (prioritaire sur texts.json)
        const title = pageSeo.title || (texts.meta && texts.meta.title ? texts.meta.title + (pageType ? ' - ' + pageType : '') : 'Mattia Parrinello');
        const description = pageSeo.description || (texts.meta && texts.meta.description) || 'Portfolio photographique';

        // Remplacement des placeholders
        injectedHtml = injectedHtml.replace('{{DYNAMIC_TITLE}}', title);
        injectedHtml = injectedHtml.replace('{{DYNAMIC_DESCRIPTION}}', description);

        console.log(`📝 Title injecté: "${title}"`);
        console.log(`📝 Description injectée: "${description.substring(0, 60)}..."`);

        // Construire les meta tags supplémentaires
        const metaPlaceholderEnd = '    <!-- META_PLACEHOLDER_END -->';
        let additionalMetas = '';

        // SEO: Keywords optimisés par page
        const keywords = pageSeo.keywords || (texts.meta && texts.meta.keywords) || '';
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

        // SEO: Balise canonical (éviter le contenu dupliqué)
        const canonicalPath = req.originalUrl.replace(/\/$/, '') || '/';
        const canonicalUrl = `${baseUrl}${canonicalPath}`;
        additionalMetas += `    <link rel="canonical" href="${canonicalUrl}">\n`;

        // SEO: Open Graph tags optimisés
        const ogTitle = pageSeo.og_title || title;
        const ogDescription = pageSeo.og_description || description;
        const ogImage = (texts.meta && texts.meta.og_image) ? `${baseUrl}${texts.meta.og_image}` : `${baseUrl}/dist/assets/Avatar.png`;

        additionalMetas += `    <meta property="og:title" content="${ogTitle}">\n`;
        additionalMetas += `    <meta property="og:description" content="${ogDescription}">\n`;
        additionalMetas += `    <meta property="og:image" content="${ogImage}">\n`;
        additionalMetas += `    <meta property="og:type" content="website">\n`;
        additionalMetas += `    <meta property="og:url" content="${canonicalUrl}">\n`;
        additionalMetas += `    <meta property="og:locale" content="fr_FR">\n`;
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
            try {
                campaignScript = `\n    <script>\n        // Informations de campagne injectées\n        window.campaignInfo = ${JSON.stringify(activeCampaignInfo)};\n        console.log('🎯 Informations de campagne chargées:', window.campaignInfo);\n    </script>`;
                console.log(`🎯 Script de campagne injecté pour: ${activeCampaignInfo.campaignName} (${activeCampaignInfo.campaignId})`);
            } catch (error) {
                console.error('⚠️ Erreur lors de l\'injection du script de campagne:', error);
            }
        }

        // Injecter les meta tags et le script de campagne
        injectedHtml = injectedHtml.replace(metaPlaceholderEnd, `${additionalMetas}${campaignScript}\n${metaPlaceholderEnd}`);

        return injectedHtml;
    }

    // SEO: Génère le JSON-LD Schema.org pour une page donnée
    generateSchemaJsonLd(pageType, req) {
        const seo = this.loadSeoData();
        const siteSeo = seo.site || {};
        const baseUrl = siteSeo.url || 'https://www.photo.mprnl.fr';
        const schemas = [];

        // SEO: Schema WebSite (présent sur toutes les pages)
        schemas.push({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            'name': siteSeo.name || 'Mattia Parrinello - Photographe de Concert',
            'url': baseUrl,
            'inLanguage': 'fr',
            'author': {
                '@type': 'Person',
                'name': siteSeo.author || 'Mattia Parrinello'
            }
        });

        // SEO: Schema ProfessionalService (photographe - présent sur toutes les pages)
        const professionalService = {
            '@context': 'https://schema.org',
            '@type': 'ProfessionalService',
            'name': 'Mattia Parrinello - Photographe de Concert',
            'url': baseUrl,
            'image': `${baseUrl}/dist/assets/Avatar.png`,
            'description': 'Photographe de concert professionnel basé à Paris, spécialisé dans la captation de concerts, festivals, showcases et backstage. Musique rap et tous genres.',
            'telephone': siteSeo.phone || '',
            'address': {
                '@type': 'PostalAddress',
                'addressLocality': 'Paris',
                'addressRegion': 'Île-de-France',
                'addressCountry': 'FR'
            },
            'areaServed': [
                {
                    '@type': 'City',
                    'name': 'Paris'
                },
                {
                    '@type': 'AdministrativeArea',
                    'name': 'Île-de-France'
                },
                {
                    '@type': 'Country',
                    'name': 'France'
                }
            ],
            'priceRange': '€€',
            'sameAs': [
                siteSeo.social && siteSeo.social.instagram,
                siteSeo.social && siteSeo.social.tiktok
            ].filter(Boolean),
            'knowsAbout': [
                'Photographie de concert',
                'Photographie de festival',
                'Photographie de backstage',
                'Photographie événementielle musicale',
                'Photographie de spectacle'
            ]
        };
        schemas.push(professionalService);

        // SEO: Schema Person (photographe)
        schemas.push({
            '@context': 'https://schema.org',
            '@type': 'Person',
            'name': siteSeo.author || 'Mattia Parrinello',
            'url': baseUrl,
            'image': `${baseUrl}/dist/assets/Avatar.png`,
            'jobTitle': 'Photographe de concert',
            'worksFor': {
                '@type': 'Organization',
                'name': 'Mattia Parrinello Photographie'
            },
            'address': {
                '@type': 'PostalAddress',
                'addressLocality': 'Paris',
                'addressRegion': 'Île-de-France',
                'addressCountry': 'FR'
            },
            'sameAs': [
                siteSeo.social && siteSeo.social.instagram,
                siteSeo.social && siteSeo.social.tiktok
            ].filter(Boolean)
        });

        // SEO: Schema spécifique par page
        const pageKey = this._resolvePageKey(pageType);

        if (pageKey === 'home') {
            // ImageGallery pour la page d'accueil
            schemas.push({
                '@context': 'https://schema.org',
                '@type': 'ImageGallery',
                'name': 'Portfolio - Photos de concert par Mattia Parrinello',
                'description': 'Galerie de photographies de concerts, festivals et événements musicaux à Paris et en France.',
                'url': baseUrl,
                'author': {
                    '@type': 'Person',
                    'name': 'Mattia Parrinello'
                }
            });
        }

        if (pageKey === 'contact') {
            schemas.push({
                '@context': 'https://schema.org',
                '@type': 'ContactPage',
                'name': 'Contacter Mattia Parrinello - Photographe de Concert',
                'url': `${baseUrl}/contact`,
                'mainEntity': {
                    '@type': 'Person',
                    'name': 'Mattia Parrinello',
                    'telephone': siteSeo.phone || '',
                    'contactType': 'Photographe de concert'
                }
            });
        }

        if (pageKey === 'about') {
            schemas.push({
                '@context': 'https://schema.org',
                '@type': 'AboutPage',
                'name': 'À propos de Mattia Parrinello - Photographe de Concert',
                'url': `${baseUrl}/a-propos`,
                'mainEntity': {
                    '@type': 'Person',
                    'name': 'Mattia Parrinello'
                }
            });
        }

        // SEO: BreadcrumbList
        const breadcrumbs = this._generateBreadcrumbs(pageKey, baseUrl);
        if (breadcrumbs) {
            schemas.push(breadcrumbs);
        }

        return schemas.map(s => `<script type="application/ld+json">${JSON.stringify(s)}</script>`).join('\n    ');
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
}

module.exports = new TextUtils();
