/**
 * Gestionnaire des campagnes et du cache utilisateur-campagne
 */
class CampaignService {
    constructor() {
        // Cache des associations utilisateur-campagne (expire automatiquement après 24h)
        this.userCampaignCache = new Map();

        // Nettoyer le cache des campagnes expirées toutes les heures
        setInterval(() => this.cleanExpiredCampaigns(), 60 * 60 * 1000);
    }

    /**
     * Nettoie le cache des campagnes expirées
     */
    cleanExpiredCampaigns() {
        const now = Date.now();
        const twentyFourHours = 24 * 60 * 60 * 1000;

        for (const [userId, campaignData] of this.userCampaignCache.entries()) {
            if (now - new Date(campaignData.timestamp).getTime() > twentyFourHours) {
                this.userCampaignCache.delete(userId);
            }
        }
    }

    /**
     * Associe un utilisateur à une campagne
     * @param {string} userId - ID de l'utilisateur
     * @param {Object} campaignInfo - Informations de la campagne
     */
    associateUserToCampaign(userId, campaignInfo) {
        if (userId && campaignInfo) {
            this.userCampaignCache.set(userId, campaignInfo);
        }
    }

    /**
     * Récupère les informations de campagne d'un utilisateur
     * @param {string} userId - ID de l'utilisateur
     * @returns {Object|null} Informations de campagne ou null
     */
    getUserCampaignInfo(userId) {
        return this.userCampaignCache.get(userId) || null;
    }

    /**
     * Traite les informations de campagne depuis les paramètres de requête
     * @param {Object} query - Paramètres de requête
     * @returns {Object|null} Informations de campagne formatées
     */
    processCampaignFromQuery(query) {
        const { ref: campaignRef, utm_source, utm_medium, utm_campaign } = query;

        if (campaignRef || utm_campaign) {
            const campaignId = campaignRef || utm_campaign;
            const source = utm_source || 'unknown';
            const medium = utm_medium || 'unknown';

            return {
                campaignId: campaignId,
                campaignName: campaignId, // Peut être amélioré avec un mapping
                source: source,
                medium: medium,
                timestamp: new Date().toISOString()
            };
        }

        return null;
    }

    /**
     * Récupère les informations de campagne depuis différentes sources (client, cache, cookie)
     * @param {Object} req - Objet request Express
     * @param {string} userId - ID de l'utilisateur
     * @param {Object} clientCampaignInfo - Informations de campagne du client
     * @returns {Object|null} Informations de campagne
     */
    getCampaignInfo(req, userId, clientCampaignInfo = null) {
        // Priorité : client, puis cache, puis cookie
        let campaignInfo = clientCampaignInfo;

        if (!campaignInfo) {
            // Essayer de récupérer depuis le cache
            campaignInfo = this.getUserCampaignInfo(userId);
        }

        if (!campaignInfo && req.cookies.user_campaign_info) {
            try {
                campaignInfo = JSON.parse(req.cookies.user_campaign_info);
                // Mettre à jour le cache si on a trouvé des infos dans le cookie
                if (userId) {
                    this.associateUserToCampaign(userId, campaignInfo);
                }
            } catch (e) {
                // Cookie de campagne invalide: ignorer
            }
        }

        return campaignInfo;
    }
}

module.exports = new CampaignService();
