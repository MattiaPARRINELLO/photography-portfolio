var express = require('express');
var session = require('express-session');
var cookieParser = require('cookie-parser');

var fileStore = {};
jest.mock('fs', function () {
    var actual = jest.requireActual('fs');
    return Object.assign({}, actual, {
        existsSync: jest.fn(function (p) { return fileStore[p] !== undefined; }),
        readFileSync: jest.fn(function (p, enc) {
            if (fileStore[p] !== undefined) return fileStore[p];
            var e = new Error('ENOENT'); e.code = 'ENOENT'; throw e;
        }),
        writeFileSync: jest.fn(function (p, d) { fileStore[p] = d; }),
        mkdirSync: jest.fn(),
        statSync: jest.fn(function () { return { size: 1024, mtime: new Date() }; })
    });
});

jest.mock('../../server/config', function () {
    return {
        getPaths: jest.fn().mockReturnValue({
            texts: '/fake/config/texts.json',
            pages: '/fake/pages',
            adminPages: '/fake/pages/admin'
        }),
        getConfig: jest.fn().mockReturnValue({}),
        getPort: jest.fn().mockReturnValue(3000),
        adminPassword: 'test'
    };
});

var contentRouter = require('../../server/routes/content');

function makeAdminApp() {
    var app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use(session({ secret: 's', resave: false, saveUninitialized: true, cookie: { secure: false } }));
    app.use(function (req, res, next) { req.session.isAdmin = true; next(); });
    app.locals.campaignManager = {
        campaignExists: jest.fn().mockReturnValue(false),
        createCampaign: jest.fn().mockReturnValue({ id: 'c1' }),
        getAllCampaigns: jest.fn().mockReturnValue([]),
        getCampaignStats: jest.fn().mockReturnValue({ totalCampaigns: 0 }),
        deleteCampaign: jest.fn().mockReturnValue(true)
    };
    app.use('/', contentRouter);
    return app;
}

describe('Routes content — branches d erreur', function () {
    var supertest;

    beforeAll(function () {
        supertest = require('supertest');
    });

    beforeEach(function () {
        Object.keys(fileStore).forEach(function (k) { delete fileStore[k]; });
    });

    // ================================================================
    // GET /admin/texts — erreur de lecture (JSON mal formé)
    // ================================================================
    describe('GET /admin/texts — erreur', function () {
        it('retourne 500 quand le fichier texts.json contient du JSON invalide', function (done) {
            var fs = require('fs');
            fs.writeFileSync('/fake/config/texts.json', '{malformed json!!!');

            supertest(makeAdminApp())
                .get('/admin/texts')
                .expect(500)
                .end(function (err, res) {
                    if (err) return done(err);
                    expect(res.body.error).toContain('Erreur lors de la lecture des textes');
                    done();
                });
        });
    });

    // ================================================================
    // GET /admin/texts — succès normal
    // ================================================================
    describe('GET /admin/texts — succès', function () {
        it('retourne 200 avec les textes valides', function (done) {
            var fs = require('fs');
            fs.writeFileSync('/fake/config/texts.json', JSON.stringify({ hero_title: 'Bienvenue' }));

            supertest(makeAdminApp())
                .get('/admin/texts')
                .expect(200)
                .end(function (err, res) {
                    if (err) return done(err);
                    expect(res.body.hero_title).toBe('Bienvenue');
                    done();
                });
        });
    });

    // ================================================================
    // POST /admin/texts — erreur d écriture
    // ================================================================
    describe('POST /admin/texts — erreur', function () {
        it('retourne 500 quand writeFileSync echoue', function (done) {
            var fs = require('fs');
            fs.writeFileSync.mockImplementationOnce(function () {
                throw new Error('Erreur disque plein');
            });

            supertest(makeAdminApp())
                .post('/admin/texts')
                .send({ hero_title: 'Nouveau' })
                .expect(500)
                .end(function (err, res) {
                    if (err) return done(err);
                    expect(res.body.error).toContain('Erreur lors de la sauvegarde');
                    done();
                });
        });
    });

    // ================================================================
    // POST /admin/texts — succès normal
    // ================================================================
    describe('POST /admin/texts — succès', function () {
        it('retourne 200 et sauvegarde les textes', function (done) {
            supertest(makeAdminApp())
                .post('/admin/texts')
                .send({ hero_title: 'Nouveau' })
                .expect(200)
                .end(function (err, res) {
                    if (err) return done(err);
                    expect(res.body.success).toBe(true);
                    expect(res.body.message).toContain('sauvegardés');
                    done();
                });
        });
    });

    // ================================================================
    // GET /admin/texts/:key — erreur de lecture
    // ================================================================
    describe('GET /admin/texts/:key — erreur', function () {
        it('retourne 500 quand le fichier contient du JSON invalide', function (done) {
            var fs = require('fs');
            fs.writeFileSync('/fake/config/texts.json', '{broken');

            supertest(makeAdminApp())
                .get('/admin/texts/hero_title')
                .expect(500)
                .end(function (err, res) {
                    if (err) return done(err);
                    expect(res.body.error).toContain('Erreur lors de la lecture du texte');
                    done();
                });
        });
    });

    // ================================================================
    // PUT /admin/texts/:key — erreur d écriture
    // ================================================================
    describe('PUT /admin/texts/:key — erreur', function () {
        it('retourne 500 quand l ecriture du fichier echoue', function (done) {
            var fs = require('fs');
            fs.writeFileSync('/fake/config/texts.json', JSON.stringify({ hero_title: 'Avant' }));
            fs.writeFileSync.mockImplementationOnce(function () {
                throw new Error('Permission refusée');
            });

            supertest(makeAdminApp())
                .put('/admin/texts/hero_title')
                .send({ value: 'Modifié' })
                .expect(500)
                .end(function (err, res) {
                    if (err) return done(err);
                    expect(res.body.error).toContain('Erreur lors de la mise à jour');
                    done();
                });
        });
    });

    // ================================================================
    // PUT /admin/texts/:key — succès normal
    // ================================================================
    describe('PUT /admin/texts/:key — succès', function () {
        it('retourne 200 et met a jour la cle', function (done) {
            var fs = require('fs');
            fs.writeFileSync('/fake/config/texts.json', JSON.stringify({ hero_title: 'Avant' }));

            supertest(makeAdminApp())
                .put('/admin/texts/hero_title')
                .send({ value: 'Après' })
                .expect(200)
                .end(function (err, res) {
                    if (err) return done(err);
                    expect(res.body.success).toBe(true);
                    expect(res.body.message).toContain('hero_title');
                    done();
                });
        });
    });

    // ================================================================
    // POST /admin/api/campaigns — erreur du campaignManager
    // ================================================================
    describe('POST /admin/api/campaigns — erreur', function () {
        it('retourne 500 quand createCampaign leve une exception', function (done) {
            var app = makeAdminApp();
            app.locals.campaignManager.createCampaign.mockImplementation(function () {
                throw new Error('Erreur base de données');
            });

            supertest(app)
                .post('/admin/api/campaigns')
                .send({ id: 'c1', name: 'Test', source: 'instagram' })
                .expect(500)
                .end(function (err, res) {
                    if (err) return done(err);
                    expect(res.body.error).toContain('Erreur lors de la création de la campagne');
                    done();
                });
        });

        it('retourne 400 quand les champs requis sont manquants', function (done) {
            supertest(makeAdminApp())
                .post('/admin/api/campaigns')
                .send({ name: 'Sans ID ni source' })
                .expect(400)
                .end(function (err, res) {
                    if (err) return done(err);
                    expect(res.body.error).toContain('requis');
                    done();
                });
        });
    });

    // ================================================================
    // GET /admin/api/campaigns — erreur du campaignManager
    // ================================================================
    describe('GET /admin/api/campaigns — erreur', function () {
        it('retourne 500 quand getAllCampaigns leve une exception', function (done) {
            var app = makeAdminApp();
            app.locals.campaignManager.getAllCampaigns.mockImplementation(function () {
                throw new Error('Erreur lecture données');
            });

            supertest(app)
                .get('/admin/api/campaigns')
                .expect(500)
                .end(function (err, res) {
                    if (err) return done(err);
                    expect(res.body.error).toContain('Erreur lors de la récupération des campagnes');
                    done();
                });
        });
    });

    // ================================================================
    // DELETE /admin/api/campaigns/:id — erreur du campaignManager
    // ================================================================
    describe('DELETE /admin/api/campaigns/:id — erreur', function () {
        it('retourne 500 quand deleteCampaign leve une exception', function (done) {
            var app = makeAdminApp();
            app.locals.campaignManager.deleteCampaign.mockImplementation(function () {
                throw new Error('Erreur suppression');
            });

            supertest(app)
                .delete('/admin/api/campaigns/c1')
                .expect(500)
                .end(function (err, res) {
                    if (err) return done(err);
                    expect(res.body.error).toContain('Erreur lors de la suppression de la campagne');
                    done();
                });
        });

        it('retourne 404 quand la campagne n existe pas', function (done) {
            var app = makeAdminApp();
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
