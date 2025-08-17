const fs = require('fs');
const path = require('path');
const serverConfig = require('../config');

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

        if (!texts.meta) {
            console.log('❌ Aucune section meta trouvée dans texts.json');
            return htmlContent;
        }

        console.log('✅ Section meta trouvée, injection en cours...');
        let injectedHtml = htmlContent;

        // Remplacer les placeholders par les vraies valeurs
        const title = texts.meta.title + (pageType ? ' - ' + pageType : '');
        const description = texts.meta.description || 'Portfolio photographique';

        // Remplacement des placeholders
        injectedHtml = injectedHtml.replace('{{DYNAMIC_TITLE}}', title);
        injectedHtml = injectedHtml.replace('{{DYNAMIC_DESCRIPTION}}', description);

        console.log(`📝 Title injecté: "${title}"`);
        console.log(`📝 Description injectée: "${description}"`);

        // Construire les meta tags supplémentaires
        const metaPlaceholderEnd = '    <!-- META_PLACEHOLDER_END -->';
        let additionalMetas = '';

        if (texts.meta.keywords) {
            additionalMetas += `    <meta name="keywords" content="${texts.meta.keywords}">\n`;
            console.log(`🏷️ Meta keywords ajoutés: "${texts.meta.keywords}"`);
        }

        if (texts.meta.author) {
            additionalMetas += `    <meta name="author" content="${texts.meta.author}">\n`;
            console.log(`👤 Meta author ajouté: "${texts.meta.author}"`);
        }

        // Open Graph tags
        if (texts.meta.og_title) {
            additionalMetas += `    <meta property="og:title" content="${texts.meta.og_title}${pageType ? ' - ' + pageType : ''}">\n`;
            console.log(`📱 Open Graph title ajouté: "${texts.meta.og_title}${pageType ? ' - ' + pageType : ''}"`);
        }

        if (texts.meta.og_description) {
            additionalMetas += `    <meta property="og:description" content="${texts.meta.og_description}">\n`;
            console.log(`📱 Open Graph description ajoutée: "${texts.meta.og_description}"`);
        }

        // Récupérer les informations de protocole et host une seule fois
        const protocol = req.protocol || 'http';
        const host = req.get('host') || 'localhost';

        if (texts.meta.og_image) {
            const fullImageUrl = `${protocol}://${host}${texts.meta.og_image}`;
            additionalMetas += `    <meta property="og:image" content="${fullImageUrl}">\n`;
            console.log(`🖼️ Open Graph image ajoutée: "${fullImageUrl}"`);
        }

        additionalMetas += `    <meta property="og:type" content="website">\n`;
        const fullUrl = `${protocol}://${host}${req.originalUrl}`;
        additionalMetas += `    <meta property="og:url" content="${fullUrl}">\n`;
        console.log(`🌐 Open Graph type et URL ajoutés: "${fullUrl}"`);

        // Vérifier s'il y a des informations de campagne à injecter
        let campaignScript = '';
        const activeCampaignInfo = campaignInfo || (req.cookies.user_campaign_info ? JSON.parse(req.cookies.user_campaign_info) : null);
        
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
}

module.exports = new TextUtils();
