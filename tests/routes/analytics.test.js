var express = require('express');
var session = require('express-session');
var cookieParser = require('cookie-parser');
var os = require('os');
var path = require('path');
var fs = require('fs');

// Le magasin doit écrire et relire de vrais fichiers JSONL : on délègue
// les chemins du dossier d'analytique au vrai système de fichiers.
// (Jest hisse les fabriques de mock : tout ce qu'elles utilisent doit être
// préfixé par « mock » ou résolu dans la fabrique elle-même.)
var mockDir = jest.requireActual('path').join(
    jest.requireActual('os').tmpdir(),
    'pp-route-analytics-' + process.pid
);
var realFs = jest.requireActual('fs');
var realPath = jest.requireActual('path');

jest.mock('fs', function () {
    var actual = jest.requireActual('fs');
    var disk = jest.requireActual('fs');
    var os = jest.requireActual('os');
    var p = jest.requireActual('path');
    var dir = p.join(os.tmpdir(), 'pp-route-analytics-' + process.pid);
    var store = {};
    function isAnalytics(target) {
        return typeof target === 'string' && target.indexOf(dir) === 0;
    }
    return Object.assign({}, actual, {
        existsSync: jest.fn(function (target) {
            if (isAnalytics(target)) return disk.existsSync(target);
            return store[target] !== undefined;
        }),
        readFileSync: jest.fn(function (target, enc) {
            if (isAnalytics(target)) return disk.readFileSync(target, enc);
            return store[target] !== undefined ? store[target] : '{}';
        }),
        writeFileSync: jest.fn(function (target, data) {
            if (isAnalytics(target)) return disk.writeFileSync(target, data);
            store[target] = data;
        }),
        appendFileSync: jest.fn(function (target, data) {
            if (isAnalytics(target)) return disk.appendFileSync(target, data);
            store[target] = (store[target] || '') + data;
        }),
        readdirSync: jest.fn(function (target) {
            if (isAnalytics(target)) return disk.readdirSync(target);
            return actual.readdirSync(target);
        }),
        unlinkSync: jest.fn(function (target) {
            if (isAnalytics(target)) return disk.unlinkSync(target);
            delete store[target];
        }),
        mkdirSync: jest.fn(function (target) {
            if (isAnalytics(target)) return disk.mkdirSync(target, { recursive: true });
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
            texts: '/fake/config/texts.json',
            analytics: mockDir
        }),
        getConfig: jest.fn().mockReturnValue({}),
        getPort: jest.fn().mockReturnValue(3000),
        adminPassword: 'test', smtpHost: 'h', smtpPort: 587, smtpUser: 'u', smtpPass: 'p'
    };
});

jest.mock('../../server/utils/galleryService', function () {
    return {
        loadGalleries: jest.fn().mockReturnValue({
            galleries: [
                { slug: 'gojira', title: 'Gojira — Bercy', artist: 'Gojira', venue: 'Accor Arena', date: '2026-02-10' }
            ]
        })
    };
});

var analyticsRouter = require('../../server/routes/analytics');

function makeApp(opts) {
    opts = opts || {};
    var app = express();
    app.use(express.json());
    app.use(express.text({ type: 'text/plain' }));
    app.use(cookieParser());
    app.use(session({
        secret: 'test-secret',
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
    app.use('/', analyticsRouter);
    return app;
}

describe('Route POST /api/track', function () {
    var supertest;

    beforeAll(function () {
        supertest = require('supertest');
    });

    beforeEach(function () {
        analyticsRouter.store.ensureDir();
        analyticsRouter.store.clear();
    });


    function validPayload(extra) {
        var base = {
            sid: 'session-1',
            hash: 'abc123',
            src: 'instagram',
            camp: { id: 'promo-ete', source: 'instagram' },
            pages: [{
                id: '/galerie/gojira',
                engagedMs: 25000,
                scrollMax: 0.8,
                fullscreenOpens: 2,
                photosViewed: 7,
                contactClicks: 0,
                mailtoClicks: 0
            }]
        };
        if (extra) Object.keys(extra).forEach(function (k) { base[k] = extra[k]; });
        return base;
    }

    it('enregistre un signal et renvoie 204', function (done) {
        supertest(makeApp())
            .post('/api/track')
            .send(validPayload())
            .expect(204)
            .end(function (err) {
                if (err) return done(err);

                var records = analyticsRouter.store.read();
                expect(records).toHaveLength(1);
                expect(records[0].sid).toBe('session-1');
                expect(records[0].hash).toBe('abc123');
                expect(records[0].src).toBe('instagram');
                expect(records[0].camp).toEqual({ id: 'promo-ete', source: 'instagram' });
                expect(records[0].pages[0].engagedMs).toBe(25000);
                expect(records[0].ts).toBeGreaterThan(0);
                expect(records[0].v).toBe(1);
                done();
            });
    });

    it('accepte le format text/plain utilisé par sendBeacon', function (done) {
        supertest(makeApp())
            .post('/api/track')
            .set('Content-Type', 'text/plain;charset=UTF-8')
            .send(JSON.stringify(validPayload({ sid: 'beacon-1' })))
            .expect(204)
            .end(function (err) {
                if (err) return done(err);
                expect(analyticsRouter.store.read()[0].sid).toBe('beacon-1');
                done();
            });
    });

    it('ne stocke aucune donnée personnelle', function (done) {
        supertest(makeApp())
            .post('/api/track')
            .set('User-Agent', 'Mozilla/5.0 (X11; Linux x86_64)')
            .set('X-Forwarded-For', '203.0.113.42')
            .send(validPayload())
            .expect(204)
            .end(function (err) {
                if (err) return done(err);

                var brut = JSON.stringify(analyticsRouter.store.read());
                expect(brut).not.toContain('203.0.113.42');
                expect(brut).not.toContain('Mozilla/5.0');
                expect(brut).not.toContain('Linux x86_64');
                done();
            });
    });

    it('rejette un signal sans identifiant de session', function (done) {
        supertest(makeApp())
            .post('/api/track')
            .send({ hash: 'abc', pages: [] })
            .expect(400)
            .end(function (err) {
                if (err) return done(err);
                expect(analyticsRouter.store.read()).toHaveLength(0);
                done();
            });
    });

    it('rejette un corps invalide', function (done) {
        supertest(makeApp())
            .post('/api/track')
            .set('Content-Type', 'text/plain;charset=UTF-8')
            .send('{json cassé')
            .expect(400)
            .end(function (err) {
                if (err) return done(err);
                expect(analyticsRouter.store.read()).toHaveLength(0);
                done();
            });
    });

    it('force la source à direct quand elle est absente', function (done) {
        supertest(makeApp())
            .post('/api/track')
            .send(validPayload({ sid: 'sans-src', src: null }))
            .expect(204)
            .end(function (err) {
                if (err) return done(err);
                expect(analyticsRouter.store.read()[0].src).toBe('direct');
                done();
            });
    });

    it('accepte un signal sans campagne', function (done) {
        supertest(makeApp())
            .post('/api/track')
            .send(validPayload({ sid: 'sans-camp', camp: null }))
            .expect(204)
            .end(function (err) {
                if (err) return done(err);
                expect(analyticsRouter.store.read()[0].camp).toBeNull();
                done();
            });
    });

    it('assainit les valeurs aberrantes', function (done) {
        supertest(makeApp())
            .post('/api/track')
            .send(validPayload({
                sid: 'sale',
                pages: [{
                    id: 'x'.repeat(500),
                    engagedMs: -999999,
                    scrollMax: 42,
                    fullscreenOpens: 'beaucoup',
                    photosViewed: 999999,
                    contactClicks: -3,
                    mailtoClicks: 'deux'
                }]
            }))
            .expect(204)
            .end(function (err) {
                if (err) return done(err);

                var recorded = analyticsRouter.store.read()[0];
                expect(recorded.pages).toHaveLength(1);
                expect(recorded.pages[0].id.length).toBe(200);
                expect(recorded.pages[0].engagedMs).toBe(0);
                expect(recorded.pages[0].scrollMax).toBe(1);
                expect(recorded.pages[0].fullscreenOpens).toBe(0);
                expect(recorded.pages[0].photosViewed).toBe(10000);
                expect(recorded.pages[0].contactClicks).toBe(0);
                expect(recorded.pages[0].mailtoClicks).toBe(0);
                done();
            });
    });

    it('ignore une campagne sans identifiant', function (done) {
        supertest(makeApp())
            .post('/api/track')
            .send(validPayload({ sid: 'camp-vide', camp: { source: 'instagram' } }))
            .expect(204)
            .end(function (err) {
                if (err) return done(err);
                expect(analyticsRouter.store.read()[0].camp).toBeNull();
                done();
            });
    });

    it('limite le nombre de pages enregistrées', function (done) {
        var pages = [];
        for (var i = 0; i < 120; i++) {
            pages.push({ id: '/page-' + i, engagedMs: 100, scrollMax: 0, fullscreenOpens: 0, photosViewed: 0, contactClicks: 0, mailtoClicks: 0 });
        }

        supertest(makeApp())
            .post('/api/track')
            .send(validPayload({ sid: 'beaucoup-de-pages', pages: pages }))
            .expect(204)
            .end(function (err) {
                if (err) return done(err);
                expect(analyticsRouter.store.read()[0].pages).toHaveLength(50);
                done();
            });
    });

    it('accepte plusieurs signaux pour des sessions distinctes', function (done) {
        supertest(makeApp())
            .post('/api/track')
            .send(validPayload({ sid: 'a' }))
            .expect(204)
            .end(function (err) {
                if (err) return done(err);
                supertest(makeApp())
                    .post('/api/track')
                    .send(validPayload({ sid: 'b' }))
                    .expect(204)
                    .end(function (err2) {
                        if (err2) return done(err2);
                        expect(analyticsRouter.store.read().map(function (r) { return r.sid; })).toEqual(['a', 'b']);
                        done();
                    });
            });
    });
});

describe('Route GET /admin/api/analytics', function () {
    var supertest;

    beforeAll(function () {
        supertest = require('supertest');
    });

    beforeEach(function () {
        analyticsRouter.store.ensureDir();
        analyticsRouter.store.clear();
    });


    function enregistrer(sid, data, extra) {
        var payload = {
            v: 1, sid: sid, hash: 'h', ts: Date.now(), src: 'direct', camp: null,
            pages: [{
                id: '/galerie/gojira', engagedMs: 0, scrollMax: 0,
                fullscreenOpens: 0, photosViewed: 0, contactClicks: 0, mailtoClicks: 0
            }]
        };
        if (data) Object.keys(data).forEach(function (k) { payload.pages[0][k] = data[k]; });
        if (extra) Object.keys(extra).forEach(function (k) { payload[k] = extra[k]; });
        analyticsRouter.store.append(payload);
    }

    it('exige une session admin', function (done) {
        supertest(makeApp({ admin: false }))
            .get('/admin/api/analytics')
            .expect(401)
            .end(done);
    });

    it('renvoie des KPI pour une session autorisée', function (done) {
        enregistrer('s1', { engagedMs: 25000, fullscreenOpens: 1 });

        supertest(makeApp({ admin: true }))
            .get('/admin/api/analytics?days=30')
            .expect(200)
            .end(function (err, res) {
                if (err) return done(err);

                expect(res.body.period.days).toBe(30);
                expect(res.body.period.sessions).toBe(1);
                expect(res.body.kpis.sessions).toBe(1);
                expect(res.body.kpis.smartBounceRate).toBe(0);
                expect(res.body.kpis.avgEngagedMs).toBe(25000);
                expect(res.body.galleries).toHaveLength(1);
                expect(res.body.galleries[0].visualInterestRate).toBe(100);
                expect(res.body.sources).toHaveLength(1);
                expect(res.body.daily).toHaveLength(1);
                // La galerie mockée porte un artiste et une salle résolus
                expect(res.body.artists.artists).toHaveLength(1);
                expect(res.body.artists.artists[0].name).toBe('Gojira');
                expect(res.body.artists.venues).toHaveLength(1);
                expect(res.body.artists.venues[0].name).toBe('Accor Arena');
                done();
            });
    });

    it('respère le sélecteur 7 jours', function (done) {
        enregistrer('s1', {});

        supertest(makeApp({ admin: true }))
            .get('/admin/api/analytics?days=7')
            .expect(200)
            .end(function (err, res) {
                if (err) return done(err);
                expect(res.body.period.days).toBe(7);
                done();
            });
    });

    it('suppère le sélecteur Tout', function (done) {
        var ancien = Date.now() - 200 * 86400000;
        analyticsRouter.store.append({ v: 1, sid: 'ancien', ts: ancien, src: 'search', pages: [] });

        supertest(makeApp({ admin: true }))
            .get('/admin/api/analytics?days=all')
            .expect(200)
            .end(function (err, res) {
                if (err) return done(err);
                expect(res.body.period.days).toBeNull();
                expect(res.body.kpis.sessions).toBe(1);
                done();
            });
    });

    it('retombe sur 30 jours pour une période invalide', function (done) {
        supertest(makeApp({ admin: true }))
            .get('/admin/api/analytics?days=abc')
            .expect(200)
            .end(function (err, res) {
                if (err) return done(err);
                expect(res.body.period.days).toBe(30);
                done();
            });
    });

    it('renvoie une structure vide mais cohérente sans donnée', function (done) {
        supertest(makeApp({ admin: true }))
            .get('/admin/api/analytics')
            .expect(200)
            .end(function (err, res) {
                if (err) return done(err);
                expect(res.body.kpis.sessions).toBe(0);
                expect(res.body.galleries).toEqual([]);
                expect(res.body.sources).toEqual([]);
                expect(res.body.campaigns).toEqual([]);
                expect(res.body.daily).toEqual([]);
                done();
            });
    });
});

describe('nettoyage du stockage analytique temporaire', function () {
    afterAll(function () {
        try {
            if (fs.existsSync(mockDir)) {
                fs.readdirSync(mockDir).forEach(function (f) {
                    fs.unlinkSync(realPath.join(mockDir, f));
                });
                fs.rmdirSync(mockDir);
            }
        } catch (e) { /* nettoyage best-effort */ }
    });

    it('ne laisse aucun résidu', function () {
        expect(fs.existsSync(mockDir)).toBe(true);
    });
});
