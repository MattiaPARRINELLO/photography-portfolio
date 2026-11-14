const { detectAiBot } = require('../utils/aiBots');

// ============================================
// MIDDLEWARE — COMPTAGE DES LECTURES PAR LES IA
// ============================================
//
// Objectif : savoir si les assistants IA lisent réellement le site (galeries,
// llms.txt, sitemap) et lesquels. Rien de plus n'est enregistré que :
//   { v, event: 'ai_crawl', ts, bot, path }
//
// • Aucun User-Agent, aucune IP, aucun cookie : l'UA sert uniquement à
//   choisir la catégorie, puis il est jeté.
// • Les requêtes d'assets (JS, CSS, images, polices, vidéos) sont ignorées :
//   seules les lectures de contenu comptent.
// • L'admin et l'API publique ne sont pas suivis.
//
// Le User-Agent est falsifiable : ce compteur est un signal d'audience,
// jamais une preuve ni un contrôle d'accès.

// Extensions non contentuelles : un crawler qui récupère une vignette ne
// « lit » pas la page.
const NON_CONTENT_RE = /\.(?:js|mjs|css|map|png|jpe?g|webp|avif|gif|svg|ico|bmp|woff2?|ttf|otf|eot|mp4|webm|mp3|zip|gz|br)$/i;

const MAX_PATH_LENGTH = 200;

/** Chemin normalisé : sans query, sans fragment, longueur bornée */
function cleanPath(pathname) {
    if (typeof pathname !== 'string') return '/';
    return pathname.slice(0, MAX_PATH_LENGTH) || '/';
}

/** Cette requête correspond-elle à une lecture de contenu ? */
function isContentRequest(req) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    const path = req.path || '';
    if (path.startsWith('/admin') || path.startsWith('/api/')) return false;
    return !NON_CONTENT_RE.test(path);
}

/**
 * Crée le middleware. Sans store fourni, il ne fait rien (tests, config
 * incomplète) : une panne d'analytics ne doit jamais bloquer une requête.
 * @param {{store?: {append: Function}}} options
 */
function createAiCrawlerMiddleware(options = {}) {
    const store = options.store;

    return function aiCrawler(req, res, next) {
        if (!store || !isContentRequest(req)) return next();

        let bot = null;
        try {
            bot = detectAiBot(req.get ? req.get('user-agent') : null);
        } catch (e) {
            bot = null;
        }
        if (!bot) return next();

        try {
            store.append({
                v: 1,
                event: 'ai_crawl',
                ts: Date.now(),
                bot: bot.id,
                path: cleanPath(req.path)
            });
        } catch (e) {
            // Le compteur ne doit jamais casser la réponse HTTP.
        }

        return next();
    };
}

module.exports = { createAiCrawlerMiddleware, isContentRequest, cleanPath };
