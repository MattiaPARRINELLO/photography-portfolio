// ============================================
// ROBOTS DES ASSISTANTS IA — DÉTECTION PAR USER-AGENT
// ============================================
//
// Deux familles distinctes, souvent confondues :
//
//  • les crawlers d'indexation (GPTBot, ClaudeBot, PerplexityBot…) qui
//    lisent le site pour alimenter les réponses des assistants ;
//  • les agents de navigation à la demande (ChatGPT-User, Perplexity-User…)
//    qui vont chercher une page au moment où un utilisateur la demande.
//
// Le User-Agent n'est JAMAIS conservé : seule la catégorie (« gptbot »,
// « claudebot »…) est écrite dans le journal, avec le chemin demandé.
// Cette liste n'est pas un contrôle de sécurité : un UA se falsifie. C'est
// un signal d'audience, comme le referrer côté navigateur.

const AI_BOTS = [
    { id: 'gptbot', label: 'GPTBot (OpenAI)', re: /GPTBot/i },
    { id: 'oai-searchbot', label: 'OAI-SearchBot (OpenAI)', re: /OAI-SearchBot/i },
    { id: 'chatgpt-user', label: 'ChatGPT-User (navigation)', re: /ChatGPT-User/i },
    { id: 'claudebot', label: 'ClaudeBot (Anthropic)', re: /ClaudeBot/i },
    { id: 'claude-user', label: 'Claude-User (navigation)', re: /Claude-User/i },
    { id: 'claude-searchbot', label: 'Claude-SearchBot (Anthropic)', re: /Claude-SearchBot/i },
    { id: 'anthropic-ai', label: 'anthropic-ai', re: /anthropic-ai/i },
    { id: 'perplexitybot', label: 'PerplexityBot', re: /PerplexityBot/i },
    { id: 'perplexity-user', label: 'Perplexity-User (navigation)', re: /Perplexity-User/i },
    { id: 'google-extended', label: 'Google-Extended (Gemini)', re: /Google-Extended/i },
    { id: 'ccbot', label: 'CCBot (Common Crawl)', re: /CCBot/i },
    { id: 'bytespider', label: 'Bytespider (ByteDance)', re: /Bytespider/i },
    { id: 'amazonbot', label: 'Amazonbot', re: /Amazonbot/i },
    { id: 'applebot-extended', label: 'Applebot-Extended', re: /Applebot-Extended/i },
    { id: 'meta-externalagent', label: 'meta-externalagent', re: /meta-externalagent/i },
    { id: 'facebookbot', label: 'FacebookBot (Meta)', re: /FacebookBot/i },
    { id: 'cohere-ai', label: 'cohere-ai', re: /cohere-ai/i },
    { id: 'mistralai-user', label: 'MistralAI-User', re: /MistralAI-User/i },
    { id: 'duckassistbot', label: 'DuckAssistBot', re: /DuckAssistBot/i },
    { id: 'youbot', label: 'YouBot', re: /YouBot/i },
    { id: 'diffbot', label: 'Diffbot', re: /Diffbot/i },
    { id: 'timpibot', label: 'Timpibot', re: /Timpibot/i },
    { id: 'ai2bot', label: 'AI2Bot (Allen Institute)', re: /AI2Bot/i }
];

/** Libellés lisibles (id -> label) pour l'agrégation côté dashboard */
const AI_BOT_LABELS = AI_BOTS.reduce((acc, bot) => {
    acc[bot.id] = bot.label;
    return acc;
}, {});

const MAX_UA_LENGTH = 1024;

/**
 * Reconnaît un robot d'IA à partir de son User-Agent.
 * @param {string|null|undefined} userAgent
 * @returns {{id: string, label: string}|null}
 */
function detectAiBot(userAgent) {
    if (typeof userAgent !== 'string' || !userAgent) return null;
    const ua = userAgent.slice(0, MAX_UA_LENGTH);
    for (const bot of AI_BOTS) {
        if (bot.re.test(ua)) return { id: bot.id, label: bot.label };
    }
    return null;
}

module.exports = { AI_BOTS, AI_BOT_LABELS, detectAiBot };
