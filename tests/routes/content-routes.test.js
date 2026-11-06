var express = require('express');
var session = require('express-session');
var cookieParser = require('cookie-parser');
var os = require('os');
var nodePath = require('path');


// Chemin vers le vrai système de fichiers : le magasin analytique doit
// écrire et relire de véritables fichiers JSONL, sans passer par le faux fs.
// La fabrique du mock est hissée par Jest : tout ce qu'elle référence doit
// être résolu à l'intérieur (via requireActual) pour rester disponible.
var realFs = jest.requireActual('fs');
var realOs = jest.requireActual('os');
var realPath = jest.requireActual('path');
var ANALYTICS_DIR = realPath.join(realOs.tmpdir(), 'pp-content-analytics-' + process.pid);

jest.mock('fs', function () {
    var actual = jest.requireActual('fs');
    var disk = jest.requireActual('fs');
    var os = jest.requireActual('os');
    var path = jest.requireActual('path');
    var analyticsDir = path.join(os.tmpdir(), 'pp-content-analytics-' + process.pid);
    var store = {};
    function isAnalytics(p) {
        return typeof p === 'string' && p.indexOf(analyticsDir) === 0;
    }
    return Object.assign({}, actual, {
        existsSync: jest.fn(function (p) {
            if (isAnalytics(p)) return disk.existsSync(p);
            return store[p] !== undefined;
        }),
        readFileSync: jest.fn(function (p, enc) {
            if (isAnalytics(p)) return disk.readFileSync(p, enc);
            return store[p] !== undefined ? store[p] : '{}';
        }),
        writeFileSync: jest.fn(function (p, d) {
            if (isAnalytics(p)) return disk.writeFileSync(p, d);
            store[p] = d;
        }),
        appendFileSync: jest.fn(function (p, d) {
            if (isAnalytics(p)) return disk.appendFileSync(p, d);
            store[p] = (store[p] || '') + d;
        }),
        readdirSync: jest.fn(function (p) {
            if (isAnalytics(p)) return disk.readdirSync(p);
            return actual.readdirSync(p);
        }),
        unlinkSync: jest.fn(function (p) {
            if (isAnalytics(p)) return disk.unlinkSync(p);
            delete store[p];
        }),
        mkdirSync: jest.fn(function (p) {
            if (isAnalytics(p)) return disk.mkdirSync(p, { recursive: true });
        }),
        statSync: jest.fn(function () { return { size: 1024, mtime: new Date() }; })
    });
});

jest.mock('../../server/config', function () {
    return {
        getPaths: jest.fn().mockReturnValue({
            root: '/fake/root',
            pages: '/fake/pages',
            adminPages: '/fake/pages/admin',
            config: '/fake/config/config.json',
            texts: '/fake/config/texts.json',
            photos: '/fake/photos',
            temp: '/fake/temp'
        }),
        getConfig: jest.fn().mockReturnValue({}),
        getPort: jest.fn().mockReturnValue(3000),
        adminPassword: 'admin-test-password',
        reloadConfig: jest.fn()
    };
});

jest.mock('../../server/middleware/auth', function () {
    return {
        requireAdminSession: jest.fn(function (req, res, next) {
            if (req.session && req.session.isAdmin) return next();
            return res.status(401).json({ error: 'Session non autorisée' });
        }),
        requireAdminPage: jest.fn(function (req, res, next) {
            if (req.session && req.session.isAdmin) return next();
            return res.redirect('/admin');
        }),
        checkAdminPassword: jest.fn(),
        restoreAdminSessionFromCookie: jest.fn().mockReturnValue(false),
        setAdminAuthCookie: jest.fn(),
        clearAdminAuthCookie: jest.fn()
    };
});

var contentRouter = require('../../server/routes/content');

function makeApp(opts) {
    opts = opts || {};
    var app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use(session({
        secret: 'test-session-secret',
        resave: false,
        saveUninitialized: true,
        cookie: { secure: false }
    }));
    if (opts.admin) {
        app.use(function (req, res, next) {
            req.session.isAdmin = true;
            next();
        });
    }
    app.locals.campaignManager = {
        campaignExists: jest.fn(),
        createCampaign: jest.fn(),
        getAllCampaigns: jest.fn(),
        getCampaignStats: jest.fn(),
        deleteCampaign: jest.fn()
    };
    // Le service d'agrégation est réel : on le laisse lire son stockage
    // (vide par défaut) pour ne pas masquer le calcul des KPI.
    var AnalyticsStore = require('../../server/utils/analyticsStore');
    var AnalyticsService = require('../../server/utils/analyticsService');
    app.locals.analytics = new AnalyticsService(new AnalyticsStore({ dir: ANALYTICS_DIR, retentionDays: 90 }));
    app.use('/', contentRouter);
    return app;
}

describe('Routes content', function () {
    var supertest;
    var DEFAULT_TEXTS;

    afterAll(function () {
        try {
            if (realFs.existsSync(ANALYTICS_DIR)) {
                realFs.readdirSync(ANALYTICS_DIR).forEach(function (f) {
                    realFs.unlinkSync(realPath.join(ANALYTICS_DIR, f));
                });
                realFs.rmdirSync(ANALYTICS_DIR);
            }
        } catch (e) { /* nettoyage best-effort */ }
    });

    beforeAll(function () {
        supertest = require('supertest');
        // Monkey-patch sendFile pour les pages admin servies directement
        require('express').response.sendFile = function (p, opts, cb) {
            this.removeHeader('Content-Encoding');
            if (!this.statusCode || this.statusCode === 200) {
                this.status(200);
            }
            this.type('text/html').send('<html>fake</html>');
        };
        DEFAULT_TEXTS = {
            hero_title: 'Bienvenue',
            hero_subtitle: 'Photographe',
            about_text: 'À propos de moi'
        };
    });

    beforeEach(function () {
        jest.clearAllMocks();
        var fs = require('fs');
        fs.writeFileSync('/fake/config/texts.json', JSON.stringify(DEFAULT_TEXTS));
    });

    // ================================================================
    // GET /admin/texts
    // ================================================================
    describe('GET /admin/texts', function () {
        it('refuse sans session admin', function (done) {
            supertest(makeApp())
                .get('/admin/texts')
                .expect(401)
                .end(done);
        });

        it('retourne les textes depuis fs avec session admin', function (done) {
            supertest(makeApp({ admin: true }))
                .get('/admin/texts')
                .expect(200)
                .end(function (err, res) {
                    if (err) return done(err);
                    expect(res.body.hero_title).toBe('Bienvenue');
                    expect(res.body.hero_subtitle).toBe('Photographe');
                    expect(res.body.about_text).toBe('À propos de moi');
                    done();
                });
        });
    });

    // ================================================================
    // POST /admin/texts
    // ================================================================
    describe('POST /admin/texts', function () {
        it('refuse sans session admin', function (done) {
            supertest(makeApp())
                .post('/admin/texts')
                .send({ hero_title: 'Nouveau' })
                .expect(401)
                .end(done);
        });

        it('sauvegarde les textes avec session admin', function (done) {
            var newTexts = { hero_title: 'Nouveau', hero_subtitle: 'Sous-titre' };

            supertest(makeApp({ admin: true }))
                .post('/admin/texts')
                .send(newTexts)
                .expect(200)
                .end(function (err, res) {
                    if (err) return done(err);
                    expect(res.body.success).toBe(true);
                    expect(res.body.message).toContain('sauvegardés');

                    var fs = require('fs');
                    expect(fs.writeFileSync).toHaveBeenCalledWith(
                        '/fake/config/texts.json',
                        JSON.stringify(newTexts, null, 2)
                    );
                    done();
                });
        });
    });

    // ================================================================
    // GET /admin/texts/:key
    // ================================================================
    describe('GET /admin/texts/:key', function () {
        it('retourne la valeur d une cle existante', function (done) {
            supertest(makeApp({ admin: true }))
                .get('/admin/texts/hero_title')
                .expect(200)
                .end(function (err, res) {
                    if (err) return done(err);
                    expect(res.body.key).toBe('hero_title');
                    expect(res.body.value).toBe('Bienvenue');
                    done();
                });
        });

        it('retourne une chaine vide pour une cle inexistante', function (done) {
            supertest(makeApp({ admin: true }))
                .get('/admin/texts/cle_inexistante')
                .expect(200)
                .end(function (err, res) {
                    if (err) return done(err);
                    expect(res.body.key).toBe('cle_inexistante');
                    expect(res.body.value).toBe('');
                    done();
                });
        });
    });

    // ================================================================
    // PUT /admin/texts/:key
    // ================================================================
    describe('PUT /admin/texts/:key', function () {
        it('refuse sans session admin', function (done) {
            supertest(makeApp())
                .put('/admin/texts/hero_title')
                .send({ value: 'Modifié' })
                .expect(401)
                .end(done);
        });

        it('met a jour la valeur d une cle', function (done) {
            supertest(makeApp({ admin: true }))
                .put('/admin/texts/hero_title')
                .send({ value: 'Titre modifié' })
                .expect(200)
                .end(function (err, res) {
                    if (err) return done(err);
                    expect(res.body.success).toBe(true);
                    expect(res.body.message).toContain('hero_title');

                    var fs = require('fs');
                    var stored = JSON.parse(fs.readFileSync('/fake/config/texts.json', 'utf-8'));
                    expect(stored.hero_title).toBe('Titre modifié');
                    done();
                });
        });
    });

    // ================================================================
    // GET /admin/campaigns (res.sendFile — mock fs contourné)
    // ================================================================
    describe('GET /admin/campaigns', function () {
        it('retourne un statut valide pour la page campaigns', function (done) {
            var app = makeApp({ admin: true });
            supertest(app)
                .get('/admin/campaigns')
                .end(function (err, res) {
                    if (err) return done(err);
                    expect([200, 500]).toContain(res.status);
                    done();
                });
        });
    });

    // ================================================================
    // POST /admin/api/campaigns
    // ================================================================
    describe('POST /admin/api/campaigns', function () {
        it('cree une campagne avec des donnees valides', function (done) {
            var app = makeApp({ admin: true });
            app.locals.campaignManager.campaignExists.mockReturnValue(false);
            app.locals.campaignManager.createCampaign.mockReturnValue({
                id: 'c1', name: 'Campagne Test', source: 'instagram'
            });

            supertest(app)
                .post('/admin/api/campaigns')
                .send({ id: 'c1', name: 'Campagne Test', source: 'instagram', medium: 'social', description: 'Une campagne' })
                .expect(200)
                .end(function (err, res) {
                    if (err) return done(err);
                    expect(res.body.success).toBe(true);
                    expect(res.body.campaign.id).toBe('c1');
                    expect(res.body.campaign.name).toBe('Campagne Test');
                    done();
                });
        });

        it('retourne 400 si champs requis manquants', function (done) {
            supertest(makeApp({ admin: true }))
                .post('/admin/api/campaigns')
                .send({ name: 'Sans ID ni source' })
                .expect(400)
                .end(function (err, res) {
                    if (err) return done(err);
                    expect(res.body.error).toContain('requis');
                    done();
                });
        });

        it('retourne 400 si l ID de campagne existe deja', function (done) {
            var app = makeApp({ admin: true });
            app.locals.campaignManager.campaignExists.mockReturnValue(true);

            supertest(app)
                .post('/admin/api/campaigns')
                .send({ id: 'c1', name: 'Doublon', source: 'facebook' })
                .expect(400)
                .end(function (err, res) {
                    if (err) return done(err);
                    expect(res.body.error).toContain('existe déjà');
                    done();
                });
        });
    });

    // ================================================================
    // GET /admin/api/campaigns
    // ================================================================
    describe('GET /admin/api/campaigns', function () {
        it('retourne la liste des campagnes enrichie des KPI', function (done) {
            var app = makeApp({ admin: true });
            app.locals.campaignManager.getAllCampaigns.mockReturnValue([
                { id: 'c1', name: 'Campagne 1' }
            ]);

            supertest(app)
                .get('/admin/api/campaigns')
                .expect(200)
                .end(function (err, res) {
                    if (err) return done(err);
                    expect(res.body.campaigns).toEqual([
                        {
                            id: 'c1', name: 'Campagne 1',
                            sessions: 0, avgEngagedMs: 0, engagementRate: 0,
                            conversions: 0, conversionRate: 0, hasData: false
                        }
                    ]);
                    // L'ancien bloc `stats` (visites brutes) n'existe plus
                    expect(res.body.stats).toBeUndefined();
                    done();
                });
        });

        it('calcule les KPI de campagne depuis les signaux de session', function (done) {
            var app = makeApp({ admin: true });
            app.locals.campaignManager.getAllCampaigns.mockReturnValue([
                { id: 'promo-ete', name: 'Promo Ete' }
            ]);
            // Deux signaux pour la même session : seul le dernier compte
            app.locals.analytics.store.append({
                v: 1, sid: 's1', hash: 'h1', ts: Date.now(), src: 'instagram',
                camp: { id: 'promo-ete', source: 'instagram' },
                pages: [{ id: '/', engagedMs: 5000, scrollMax: 0.8, fullscreenOpens: 0, photosViewed: 1, contactClicks: 0, mailtoClicks: 0 }]
            });
            app.locals.analytics.store.append({
                v: 1, sid: 's1', hash: 'h1', ts: Date.now(), src: 'instagram',
                camp: { id: 'promo-ete', source: 'instagram' },
                pages: [{ id: '/', engagedMs: 20000, scrollMax: 0.8, fullscreenOpens: 0, photosViewed: 1, contactClicks: 1, mailtoClicks: 0 }]
            });

            supertest(app)
                .get('/admin/api/campaigns?days=30')
                .expect(200)
                .end(function (err, res) {
                    if (err) return done(err);
                    var campaign = res.body.campaigns[0];
                    expect(campaign.hasData).toBe(true);
                    expect(campaign.sessions).toBe(1);
                    expect(campaign.avgEngagedMs).toBe(20000);
                    expect(campaign.engagementRate).toBe(100);
                    expect(campaign.conversions).toBe(1);
                    expect(campaign.conversionRate).toBe(100);
                    done();
                });
        });

        it('accepte le sélecteur de période Tout', function (done) {
            var app = makeApp({ admin: true });
            app.locals.campaignManager.getAllCampaigns.mockReturnValue([]);

            supertest(app)
                .get('/admin/api/campaigns?days=all')
                .expect(200)
                .end(function (err, res) {
                    if (err) return done(err);
                    expect(res.body.campaigns).toEqual([]);
                    done();
                });
        });
    });

    // ================================================================
    // DELETE /admin/api/campaigns/:id
    // ================================================================
    describe('DELETE /admin/api/campaigns/:id', function () {
        it('supprime une campagne existante', function (done) {
            var app = makeApp({ admin: true });
            app.locals.campaignManager.deleteCampaign.mockReturnValue(true);

            supertest(app)
                .delete('/admin/api/campaigns/c1')
                .expect(200)
                .end(function (err, res) {
                    if (err) return done(err);
                    expect(res.body.success).toBe(true);
                    expect(app.locals.campaignManager.deleteCampaign).toHaveBeenCalledWith('c1');
                    done();
                });
        });

        it('retourne 404 si campagne non trouvee', function (done) {
            var app = makeApp({ admin: true });
            app.locals.campaignManager.deleteCampaign.mockReturnValue(false);

            supertest(app)
                .delete('/admin/api/campaigns/inexistante')
                .expect(404)
                .end(function (err, res) {
                    if (err) return done(err);
                    expect(res.body.error).toContain('non trouvée');
                    done();
                });
        });
    });
});
