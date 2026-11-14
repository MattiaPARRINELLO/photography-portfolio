var { AI_BOTS, AI_BOT_LABELS, detectAiBot } = require('../../server/utils/aiBots');
var { createAiCrawlerMiddleware, createCrawlQuota, isContentRequest, cleanPath } = require('../../server/middleware/aiCrawler');

function req(method, path, ua, ip) {
    return {
        method: method,
        path: path,
        ip: ip,
        get: function (name) {
            return name.toLowerCase() === 'user-agent' ? ua : undefined;
        }
    };
}

function fakeStore() {
    var lines = [];
    return {
        append: function (record) { lines.push(record); },
        lines: lines
    };
}

function run(middleware, request) {
    var nextCalled = false;
    middleware(request, {}, function () { nextCalled = true; });
    return nextCalled;
}

describe('Détection des robots IA', function () {
    describe('detectAiBot', function () {
        it('reconnaît les crawlers des principaux assistants', function () {
            expect(detectAiBot('Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2').id).toBe('gptbot');
            expect(detectAiBot('Mozilla/5.0; compatible; OAI-SearchBot/1.0').id).toBe('oai-searchbot');
            expect(detectAiBot('Mozilla/5.0; compatible; ClaudeBot/1.0').id).toBe('claudebot');
            expect(detectAiBot('Mozilla/5.0; compatible; PerplexityBot/1.0').id).toBe('perplexitybot');
            expect(detectAiBot('Mozilla/5.0; compatible; Google-Extended').id).toBe('google-extended');
            expect(detectAiBot('Mozilla/5.0; compatible; CCBot/2.0').id).toBe('ccbot');
        });

        it('distingue les agents de navigation des crawlers', function () {
            expect(detectAiBot('Mozilla/5.0; ChatGPT-User/1.0').id).toBe('chatgpt-user');
            expect(detectAiBot('Mozilla/5.0; Perplexity-User/1.0').id).toBe('perplexity-user');
            expect(detectAiBot('Mozilla/5.0; Claude-User/1.0').id).toBe('claude-user');
        });

        it('ne classe pas un navigateur classique comme un robot IA', function () {
            expect(detectAiBot('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36')).toBeNull();
            expect(detectAiBot('Mozilla/5.0 (compatible; Googlebot/2.1)')).toBeNull();
        });

        it('ignore une valeur absente ou non textuelle', function () {
            expect(detectAiBot(undefined)).toBeNull();
            expect(detectAiBot(null)).toBeNull();
            expect(detectAiBot(42)).toBeNull();
        });

        it('expose un libellé lisible pour chaque robot', function () {
            AI_BOTS.forEach(function (bot) {
                expect(typeof AI_BOT_LABELS[bot.id]).toBe('string');
                expect(AI_BOT_LABELS[bot.id].length).toBeGreaterThan(0);
            });
        });
    });

    describe('isContentRequest', function () {
        it('compte les pages de contenu', function () {
            expect(isContentRequest(req('GET', '/', 'x'))).toBe(true);
            expect(isContentRequest(req('GET', '/galerie/gojira', 'x'))).toBe(true);
            expect(isContentRequest(req('GET', '/llms.txt', 'x'))).toBe(true);
            expect(isContentRequest(req('GET', '/sitemap.xml', 'x'))).toBe(true);
        });

        it('ignore les assets, l\'admin et l\'API', function () {
            expect(isContentRequest(req('GET', '/dist/js/home-sheet.js', 'x'))).toBe(false);
            expect(isContentRequest(req('GET', '/photos/thumbnails/a.webp', 'x'))).toBe(false);
            expect(isContentRequest(req('GET', '/admin/analytics', 'x'))).toBe(false);
            expect(isContentRequest(req('GET', '/api/track', 'x'))).toBe(false);
        });

        it('ignore les méthodes autres que GET/HEAD', function () {
            expect(isContentRequest(req('POST', '/contact', 'x'))).toBe(false);
        });
    });

    describe('cleanPath', function () {
        it('borne la longueur et retombe sur la racine', function () {
            expect(cleanPath('')).toBe('/');
            expect(cleanPath(undefined)).toBe('/');
            expect(cleanPath('/' + 'a'.repeat(500)).length).toBe(200);
        });
    });

    describe('middleware', function () {
        it('enregistre une ligne minimale sans User-Agent ni IP', function () {
            var store = fakeStore();
            var middleware = createAiCrawlerMiddleware({ store: store });

            var nextCalled = run(middleware, req('GET', '/galerie/gojira', 'Mozilla/5.0; compatible; GPTBot/1.2'));

            expect(nextCalled).toBe(true);
            expect(store.lines).toHaveLength(1);
            expect(store.lines[0]).toEqual({
                v: 1,
                event: 'ai_crawl',
                ts: expect.any(Number),
                bot: 'gptbot',
                path: '/galerie/gojira'
            });
            expect(JSON.stringify(store.lines[0])).not.toContain('GPTBot');
        });

        it('ne journalise rien pour un visiteur humain', function () {
            var store = fakeStore();
            var middleware = createAiCrawlerMiddleware({ store: store });

            run(middleware, req('GET', '/', 'Mozilla/5.0 (X11; Linux x86_64) Chrome/126.0'));

            expect(store.lines).toHaveLength(0);
        });

        it('ne journalise pas les requêtes d\'assets', function () {
            var store = fakeStore();
            var middleware = createAiCrawlerMiddleware({ store: store });

            run(middleware, req('GET', '/dist/css/output.css', 'GPTBot/1.2'));

            expect(store.lines).toHaveLength(0);
        });

        it('laisse passer la requête même sans store', function () {
            var nextCalled = run(createAiCrawlerMiddleware({}), req('GET', '/', 'GPTBot/1.2'));
            expect(nextCalled).toBe(true);
        });

        it('laisse passer la requête même si l\'écriture échoue', function () {
            var middleware = createAiCrawlerMiddleware({
                store: { append: function () { throw new Error('disque plein'); } }
            });
            expect(run(middleware, req('GET', '/', 'GPTBot/1.2'))).toBe(true);
        });
    });

    // ================================================================
    // GARDE-FOU ANTI-ABUS (CWE-770)
    // ================================================================
    describe('budget d\'écriture', function () {
        it('plafonne les écritures d\'un même appelant', function () {
            var quota = createCrawlQuota({ maxPerCaller: 3, maxTotal: 100 });

            expect(quota.allow('1.1.1.1')).toBe(true);
            expect(quota.allow('1.1.1.1')).toBe(true);
            expect(quota.allow('1.1.1.1')).toBe(true);
            expect(quota.allow('1.1.1.1')).toBe(false);
            // Un autre appelant n'est pas pénalisé
            expect(quota.allow('2.2.2.2')).toBe(true);
        });

        it('plafonne le total, tous appelants confondus', function () {
            var quota = createCrawlQuota({ maxPerCaller: 100, maxTotal: 2 });

            expect(quota.allow('1.1.1.1')).toBe(true);
            expect(quota.allow('2.2.2.2')).toBe(true);
            expect(quota.allow('3.3.3.3')).toBe(false);
        });

        it('réouvre le budget à la fenêtre suivante', function () {
            var now = 1000000;
            var spy = jest.spyOn(Date, 'now').mockImplementation(function () { return now; });
            var quota = createCrawlQuota({ windowMs: 60000, maxPerCaller: 1, maxTotal: 100 });

            expect(quota.allow('1.1.1.1')).toBe(true);
            expect(quota.allow('1.1.1.1')).toBe(false);

            now += 60001;
            expect(quota.allow('1.1.1.1')).toBe(true);

            spy.mockRestore();
        });

        it('borne la mémoire du compteur en purgeant les appelants expirés', function () {
            var now = 1000000;
            var spy = jest.spyOn(Date, 'now').mockImplementation(function () { return now; });
            var quota = createCrawlQuota({ windowMs: 1000, maxCallers: 5, maxTotal: 100000 });

            for (var i = 0; i < 20; i++) {
                quota.allow('10.0.0.' + i);
                now += 10;
            }

            expect(quota.callerCount()).toBeLessThanOrEqual(6);

            spy.mockRestore();
        });

        it('laisse passer la requête mais n\'écrit pas au-delà du budget', function () {
            var store = fakeStore();
            var middleware = createAiCrawlerMiddleware({
                store: store,
                quotaOptions: { maxPerCaller: 2, maxTotal: 100 }
            });

            for (var i = 0; i < 10; i++) {
                expect(run(middleware, req('GET', '/galerie/gojira', 'GPTBot/1.2', '9.9.9.9'))).toBe(true);
            }

            expect(store.lines).toHaveLength(2);
        });
    });
});
