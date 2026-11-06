/**
 * Gestionnaire des campagnes — extraction et normalisation
 *
 * Module volontairement SANS ÉTAT : aucune donnée de campagne n'est
 * stockée côté serveur (plus de cache, plus de cookie).
 *
 * Le tracker client détecte les paramètres de campagne à l'arrivée sur le
 * site et les joint à chaque signal de session. La lecture des statistiques
 * se fait ensuite via AnalyticsService, qui agrège les mêmes données.
 *
 * Paramètres reconnus : ?c=, ?ref=, ?utm_campaign= (+ ?utm_source= / ?source=)
 */

const MAX_ID_LENGTH = 64;
const MAX_SOURCE_LENGTH = 32;

/**
 * Normalise une campagne déjà extraite.
 * @param {*} campaign Valeur brute (objet, chaîne JSON, etc.)
 * @returns {{id: string, source: string|null}|null}
 */
function normalizeCampaign(campaign) {
    if (!campaign) return null;

    if (typeof campaign === 'string') {
        try {
            campaign = JSON.parse(campaign);
        } catch (e) {
            return null;
        }
    }

    if (typeof campaign !== 'object') return null;

    const id = typeof campaign.id === 'string' ? campaign.id.trim().slice(0, MAX_ID_LENGTH) : '';
    if (!id) return null;

    const source = typeof campaign.source === 'string' ? campaign.source.trim().slice(0, MAX_SOURCE_LENGTH) : '';

    return { id, source: source || null };
}

/**
 * Extrait une campagne depuis des paramètres d'URL.
 * @param {Object|URLSearchParams} params Paramètres de requête
 * @returns {{id: string, source: string|null}|null}
 */
function parseCampaignQuery(params) {
    if (!params) return null;

    const read = (key) => {
        if (params instanceof URLSearchParams) return params.get(key);
        if (typeof params.get === 'function') return params.get(key);
        const value = params[key];
        return typeof value === 'string' ? value : null;
    };

    const id = (read('c') || read('ref') || read('utm_campaign') || '').trim();
    if (!id) return null;

    const source = (read('utm_source') || read('source') || '').trim();

    return {
        id: id.slice(0, MAX_ID_LENGTH),
        source: source ? source.slice(0, MAX_SOURCE_LENGTH) : null
    };
}

module.exports = {
    normalizeCampaign,
    parseCampaignQuery
};
