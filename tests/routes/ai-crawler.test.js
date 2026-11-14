var express = require('express');
var request = require('supertest');
var os = require('os');
var path = require('path');
var fs = require('fs');

var AnalyticsStore = require('../../server/utils/analyticsStore');
var AnalyticsService = require('../../server/utils/analyticsService');
var { createAiCrawlerMiddleware } = require('../../server/middleware/aiCrawler');

// Serveur réel (Express + store sur disque) : vérifie le câblage complet,
// du User-Agent entrant jusqu'à la ligne JSONL relue par l'agrégation.
describe('Lectures par les robots IA — serveur réel', function () {
    var dir;
    var store;
    var app;

    beforeEach(function () {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-ai-crawl-'));
        store = new AnalyticsStore({ dir: dir, retentionDays: 90 });

        app = express();
        app.use(createAiCrawlerMiddleware({ store: store }));
        app.get('/', function (req, res) { res.send('accueil'); });
        app.get('/llms.txt', function (req, res) { res.type('text/plain').send('llms'); });
        app.get('/galerie/gojira', function (req, res) { res.send('galerie'); });
        app.use('/dist', express.static(path.join(__dirname, '..', '..', 'dist')));
    });

    afterEach(function () {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* déjà supprimé */ }
    });

    it('enregistre une lecture de page par GPTBot', async function () {
        await request(app)
            .get('/galerie/gojira')
            .set('User-Agent', 'Mozilla/5.0; compatible; GPTBot/1.2')
            .expect(200);

        var records = store.read();
        expect(records).toHaveLength(1);
        expect(records[0].event).toBe('ai_crawl');
        expect(records[0].bot).toBe('gptbot');
        expect(records[0].path).toBe('/galerie/gojira');
        expect(JSON.stringify(records[0])).not.toMatch(/GPTBot|Mozilla/);
    });

    it('n\'enregistre ni un visiteur humain ni les assets', async function () {
        await request(app)
            .get('/')
            .set('User-Agent', 'Mozilla/5.0 (X11; Linux x86_64) Chrome/126.0')
            .expect(200);

        await request(app)
            .get('/dist/js/analytics-tracker.js')
            .set('User-Agent', 'Mozilla/5.0; compatible; GPTBot/1.2')
            .expect(200);

        expect(store.read()).toHaveLength(0);
    });

    it('remonte les lectures dans le tableau de bord', async function () {
        await request(app).get('/').set('User-Agent', 'PerplexityBot/1.0').expect(200);
        await request(app).get('/llms.txt').set('User-Agent', 'ClaudeBot/1.0').expect(200);

        var dash = new AnalyticsService(store).getDashboard(30);
        expect(dash.aiCrawls.totalHits).toBe(2);
        expect(dash.aiCrawls.bots.map(function (b) { return b.bot; }).sort()).toEqual(['claudebot', 'perplexitybot']);
        expect(dash.kpis.sessions).toBe(0);
    });

    it('plafonne un flot de requêtes qui se déclarent crawler IA', async function () {
        // 40 requêtes avec un faux UA de robot : au-delà de 30/min pour une
        // même IP, la requête passe mais plus aucune ligne n'est écrite.
        for (var i = 0; i < 40; i++) {
            await request(app)
                .get('/galerie/gojira')
                .set('User-Agent', 'GPTBot/1.2')
                .expect(200);
        }

        expect(store.read()).toHaveLength(30);
    });
});
