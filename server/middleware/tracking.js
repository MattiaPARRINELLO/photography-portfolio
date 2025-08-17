const campaignService = require('../utils/campaignService');

/**
 * Middleware de logging et tracking utilisateur pour toutes les requêtes
 */
function userTrackingMiddleware(userLogger, campaignManager) {
    return (req, res, next) => {
        // Générer un userId à partir du cookie seulement pour les requêtes de pages HTML
        // Pas pour les requêtes AJAX ou d'assets
        const isPageRequest = req.method === 'GET' &&
            !req.url.includes('/api/') &&
            !req.url.includes('/admin/') &&
            !req.url.includes('/dist/') &&
            !req.url.includes('.js') &&
            !req.url.includes('.css') &&
            !req.url.includes('.jpg') &&
            !req.url.includes('.png') &&
            !req.url.includes('.svg');

        let userId = req.cookies.user_tracking_id;

        if (!userId && isPageRequest) {
            userId = 'user_' + Date.now().toString(36) + Math.random().toString(36).substring(2);
            res.cookie('user_tracking_id', userId, {
                maxAge: 365 * 24 * 60 * 60 * 1000, // 1 an
                httpOnly: false, // Permettre l'accès côté client
                path: '/' // Disponible sur tout le site
            });
            console.log(`🆕 Nouvel utilisateur créé: ${userId}`);
        } else if (userId && isPageRequest) {
            console.log(`👤 Utilisateur existant: ${userId}`);
        }

        // Ajouter l'userId à la requête pour usage ultérieur
        req.userId = userId;

        // Logger seulement les requêtes vers les pages principales du portfolio
        const allowedPages = ['/', '/a-propos', '/contact'];
        const isAllowedPage = allowedPages.includes(req.url.split('?')[0]); // Ignorer les query parameters

        if (isAllowedPage && userId) {
            // Récupérer les informations de campagne depuis le cache ou le cookie
            let campaignInfo = campaignService.getUserCampaignInfo(userId);
            
            if (!campaignInfo && req.cookies.user_campaign_info) {
                try {
                    campaignInfo = JSON.parse(req.cookies.user_campaign_info);
                    // Sauvegarder dans le cache pour les prochaines requêtes
                    campaignService.associateUserToCampaign(userId, campaignInfo);
                } catch (e) {
                    console.log('⚠️ Erreur parsing campaign info dans HTTP request:', e.message);
                }
            }

            // Construire les détails du log
            const logDetails = {
                ip: req.ip || req.connection.remoteAddress,
                userAgent: req.get('User-Agent'),
                url: req.originalUrl,
                method: req.method,
                extraData: {
                    referer: req.get('Referer'),
                    host: req.get('Host')
                }
            };
            
            // Ajouter les informations de campagne si disponibles
            if (campaignInfo) {
                logDetails.campaignInfo = {
                    campaignId: campaignInfo.campaignId,
                    campaignName: campaignInfo.campaignName,
                    source: campaignInfo.source,
                    medium: campaignInfo.medium,
                    campaignTimestamp: campaignInfo.timestamp
                };
                console.log(`🎯 Log HTTP avec campagne: ${req.method} ${req.url} - ${campaignInfo.campaignName} (${campaignInfo.campaignId})`);
            }
            
            userLogger.log(userId, 'http_request', logDetails);
        }

        next();
    };
}

/**
 * Middleware pour traiter les campagnes depuis les paramètres URL
 */
function campaignMiddleware(campaignManager) {
    return (req, res, next) => {
        // Vérifier s'il y a un paramètre de campagne dans l'URL
        const campaignInfo = campaignService.processCampaignFromQuery(req.query);
        
        if (campaignInfo && req.userId) {
            // Enregistrer la campagne
            campaignManager.recordCampaignVisit(campaignInfo.campaignId, {
                userId: req.userId,
                ip: req.ip || req.connection.remoteAddress,
                userAgent: req.get('User-Agent'),
                referer: req.get('Referer')
            });

            // Associer l'utilisateur à la campagne
            campaignService.associateUserToCampaign(req.userId, campaignInfo);

            // Sauvegarder dans un cookie pour persister l'info
            res.cookie('user_campaign_info', JSON.stringify(campaignInfo), {
                maxAge: 24 * 60 * 60 * 1000, // 24h
                httpOnly: false,
                path: '/'
            });

            console.log(`🎯 Campagne détectée: ${campaignInfo.campaignId} pour utilisateur ${req.userId}`);
        }

        next();
    };
}

module.exports = {
    userTrackingMiddleware,
    campaignMiddleware
};
