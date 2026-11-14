// Le tracker est un script navigateur : on lui fournit un window minimal.
// Sous Node, le module exporte ses fonctions pures sans démarrer la collecte.
var tracker;

beforeAll(function () {
    global.window = {
        location: { search: '', pathname: '/' },
        navigator: {},
        screen: { width: 0, height: 0 }
    };
    tracker = require('../../dist/js/analytics-tracker.js');
});

afterAll(function () {
    delete global.window;
});

describe('Classement de la source de trafic', function () {
    describe('classifyReferrer', function () {
        it('reconnaît les assistants IA', function () {
            expect(tracker.classifyReferrer('https://chatgpt.com/c/abc')).toBe('ai:chatgpt');
            expect(tracker.classifyReferrer('https://www.chatgpt.com/')).toBe('ai:chatgpt');
            expect(tracker.classifyReferrer('https://chat.openai.com/')).toBe('ai:chatgpt');
            expect(tracker.classifyReferrer('https://www.perplexity.ai/search?q=photographe')).toBe('ai:perplexity');
            expect(tracker.classifyReferrer('https://claude.ai/chat/123')).toBe('ai:claude');
            expect(tracker.classifyReferrer('https://copilot.microsoft.com/chats/xyz')).toBe('ai:copilot');
            expect(tracker.classifyReferrer('https://chat.deepseek.com/')).toBe('ai:deepseek');
            expect(tracker.classifyReferrer('https://x.ai/')).toBe('ai:grok');
            expect(tracker.classifyReferrer('https://chat.mistral.ai/chat')).toBe('ai:mistral');
        });

        it('place Gemini avant la recherche Google', function () {
            expect(tracker.classifyReferrer('https://gemini.google.com/app')).toBe('ai:gemini');
            expect(tracker.classifyReferrer('https://www.google.com/search?q=concert')).toBe('search');
        });

        it('conserve les classements existants', function () {
            expect(tracker.classifyReferrer('https://www.instagram.com/p/abc')).toBe('instagram');
            expect(tracker.classifyReferrer('https://www.lesinrocks.com/article')).toBe('press');
            expect(tracker.classifyReferrer('https://bandcamp.com/album')).toBe('labels');
            expect(tracker.classifyReferrer('https://exemple.fr/article')).toBe('referral');
            expect(tracker.classifyReferrer('')).toBe('direct');
            expect(tracker.classifyReferrer('pas une url')).toBe('referral');
        });
    });

    describe('classifySourceParam', function () {
        function withSearch(search) {
            global.window.location.search = search;
            return tracker.classifySourceParam();
        }

        it('reconnaît les utm_source posés par les assistants', function () {
            expect(withSearch('?utm_source=chatgpt.com')).toBe('ai:chatgpt');
            expect(withSearch('?utm_source=ChatGPT')).toBe('ai:chatgpt');
            expect(withSearch('?utm_source=www.perplexity.ai')).toBe('ai:perplexity');
            expect(withSearch('?utm_source=claude')).toBe('ai:claude');
            expect(withSearch('?utm_source=gemini')).toBe('ai:gemini');
            expect(withSearch('?utm_source=copilot')).toBe('ai:copilot');
        });

        it('accepte aussi ?source=', function () {
            expect(withSearch('?source=perplexity')).toBe('ai:perplexity');
        });

        it('ignore une source inconnue ou absente', function () {
            expect(withSearch('?utm_source=newsletter')).toBeNull();
            expect(withSearch('')).toBeNull();
            expect(withSearch('?utm_campaign=printemps')).toBeNull();
        });
    });
});
