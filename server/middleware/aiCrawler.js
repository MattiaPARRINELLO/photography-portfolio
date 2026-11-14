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
// • Budget d'écriture par appelant et au total (voir DEFAULT_QUOTA) : un
//   client qui se déclare crawler ne peut pas remplir le disque.
//
// Le User-Agent est falsifiable : ce compteur est un signal d'audience,
// jamais une preuve ni un contrôle d'accès.

// Extensions non contentuelles : un crawler qui récupère une vignette ne
// « lit » pas la page.
const NON_CONTENT_RE = /\.(?:js|mjs|css|map|png|jpe?g|webp|avif|gif|svg|ico|bmp|woff2?|ttf|otf|eot|mp4|webm|mp3|zip|gz|br)$/i;

const MAX_PATH_LENGTH = 200;

// Garde-fou anti-abus, indispensable ici : un User-Agent se falsifie, donc
// n'importe quel client peut se déclarer « GPTBot ». Sans budget d'écriture,
// il remplirait le disque à la vitesse des requêtes (le store ne purge que
// les fichiers de plus de 90 jours). On borne donc les écritures par
// appelant ET au total, en mémoire, sans jamais conserver l'IP.
const DEFAULT_QUOTA = {
    windowMs: 60 * 1000,
    maxPerCaller: 30,   // lignes/minute pour une même IP
    maxTotal: 60,       // lignes/minute pour tout le site
    maxCallers: 10000   // borne la mémoire du compteur
};

/** Chemin normalisé : sans query, sans fragment, longueur bornée */
function cleanPath(pathname) {
    if (typeof pathname !== 'string') return '/';
    return pathname.slice(0, MAX_PATH_LENGTH) || '/';
}

/**
 * Budget d'écriture à fenêtre glissante. L'IP ne sert que de clé en mémoire,
 * elle n'est jamais écrite sur disque.
 * @param {Object} [options]
 * @returns {{allow: (ip?: string) => boolean, callerCount: () => number}}
 */
function createCrawlQuota(options = {}) {
    const windowMs = options.windowMs || DEFAULT_QUOTA.windowMs;
    const maxPerCaller = options.maxPerCaller || DEFAULT_QUOTA.maxPerCaller;
    const maxTotal = options.maxTotal || DEFAULT_QUOTA.maxTotal;
    const maxCallers = options.maxCallers || DEFAULT_QUOTA.maxCallers;

    const byCaller = new Map(); // IP -> { count, since }
    let total = { count: 0, since: Date.now() };
    let lastPrune = Date.now();

    function allow(ip) {
        const now = Date.now();

        if (now - total.since > windowMs) total = { count: 0, since: now };
        if (total.count >= maxTotal) return false;

        const key = (typeof ip === 'string' && ip) ? ip : 'inconnu';
        let slot = byCaller.get(key);
        if (!slot || now - slot.since > windowMs) {
            slot = { count: 0, since: now };
            byCaller.set(key, slot);
        }
        if (slot.count >= maxPerCaller) return false;

        slot.count++;
        total.count++;

        // Purge paresseuse : borne la mémoire du compteur, sans timer.
        if (byCaller.size > maxCallers || now - lastPrune > windowMs) {
            for (const [k, s] of byCaller) {
                if (now - s.since > windowMs) byCaller.delete(k);
            }
            // Toujours trop d'appelants : on oublie les plus anciens. Un
            // appelant oublié regagne son budget, mais le plafond global
            // (maxTotal) continue de borner les écritures du site.
            while (byCaller.size > maxCallers) {
                byCaller.delete(byCaller.keys().next().value);
            }
            lastPrune = now;
        }

        return true;
    }

    return { allow, callerCount: () => byCaller.size };
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
 * @param {{store?: {append: Function}, quota?: Object}} options
 */
function createAiCrawlerMiddleware(options = {}) {
    const store = options.store;
    const quota = options.quota || createCrawlQuota(options.quotaOptions);

    return function aiCrawler(req, res, next) {
        if (!store || !isContentRequest(req)) return next();

        let bot = null;
        try {
            bot = detectAiBot(req.get ? req.get('user-agent') : null);
        } catch (e) {
            bot = null;
        }
        if (!bot) return next();

        // Un client qui se déclare crawler sans en être un ne peut pas
        // écrire plus que son budget : la requête passe, la ligne est perdue.
        if (!quota.allow(req.ip)) return next();

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

module.exports = {
    createAiCrawlerMiddleware,
    createCrawlQuota,
    isContentRequest,
    cleanPath
};
