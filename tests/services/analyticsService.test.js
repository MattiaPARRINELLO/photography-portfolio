var os = require('os');
var path = require('path');
var fs = require('fs');

var AnalyticsStore = require('../../server/utils/analyticsStore');
var AnalyticsService = require('../../server/utils/analyticsService');

// Galeries fictives injectées dans le service pour vérifier la résolution
// des titres / artistes / salles sans dépendre de la configuration réelle.
var GALERIES = [
    { slug: 'gojira', title: 'Gojira — Bercy', artist: 'Gojira', venue: 'Accor Arena', date: '2026-02-10' },
    { slug: 'tagada', title: 'Tagada Jones — Brest', artist: 'Tagada Jones', venue: 'La Carene', date: '2026-03-02' },
    { slug: 'no venue', title: 'Sans salle', artist: 'Artiste X', venue: null, date: '2026-04-01' }
];

var BASE_DIR = path.join(os.tmpdir(), 'pp-service-' + process.pid + '-' + Date.now());
var compteur = 0;
var DIR;

/** Signal de session dans le format exact envoyé par le tracker client */
function signal(sid, pages, extra) {
    var base = { v: 1, sid: sid, hash: null, ts: Date.now(), src: 'direct', camp: null, pages: pages };
    if (extra) Object.keys(extra).forEach(function (k) { base[k] = extra[k]; });
    return base;
}

function page(id, data) {
    var base = {
        id: id, engagedMs: 0, scrollMax: 0,
        fullscreenOpens: 0, photosViewed: 0, contactClicks: 0, mailtoClicks: 0
    };
    if (data) Object.keys(data).forEach(function (k) { base[k] = data[k]; });
    return base;
}

describe('AnalyticsService', function () {
    var store;
    var analytics;

    beforeEach(function () {
        DIR = path.join(BASE_DIR, 'cas-' + (compteur++));
        store = new AnalyticsStore({ dir: DIR, retentionDays: 90 });
        analytics = new AnalyticsService(store);
        analytics.refreshGalleryIndex(GALERIES);
    });

    afterAll(function () {
        try { fs.rmSync(BASE_DIR, { recursive: true, force: true }); } catch (e) { /* déjà nettoyé */ }
    });

    // ================================================================
    // REBOND QUALIFIÉ
    // ================================================================
    describe('rebond qualifié', function () {
        it('considère en rebond un visiteur sans aucun signe d\'intérêt', function () {
            store.append(signal('s1', [page('/', { engagedMs: 3000, scrollMax: 0.2 })]));

            expect(analytics.getDashboard(30).kpis.smartBounceRate).toBe(100);
        });

        it('ne compte pas comme rebond un visiteur resté plus de 15 secondes', function () {
            store.append(signal('s1', [page('/', { engagedMs: 16000, scrollMax: 0.2 })]));

            expect(analytics.getDashboard(30).kpis.smartBounceRate).toBe(0);
        });

        it('ne compte pas comme rebond une ouverture de Fancybox même très brève', function () {
            store.append(signal('s1', [page('/', { engagedMs: 900, fullscreenOpens: 1 })]));

            var kpis = analytics.getDashboard(30).kpis;
            expect(kpis.smartBounceRate).toBe(0);
            expect(kpis.engagedSessions).toBe(1);
        });

        it('ne compte pas comme rebond la vue d\'au moins 3 photos', function () {
            store.append(signal('s1', [page('/', { engagedMs: 900, photosViewed: 3 })]));
            store.append(signal('s2', [page('/', { engagedMs: 900, photosViewed: 2 })]));

            var kpis = analytics.getDashboard(30).kpis;
            expect(kpis.smartBounceRate).toBe(50);
        });

        it('ne compte pas comme rebond un clic de conversion', function () {
            store.append(signal('s1', [page('/contact', { contactClicks: 1 })]));
            store.append(signal('s2', [page('/contact', { mailtoClicks: 1 })]));

            expect(analytics.getDashboard(30).kpis.smartBounceRate).toBe(0);
        });

        it('ne compte pas comme rebond un parcours de deux pages', function () {
            store.append(signal('s1', [
                page('/', { engagedMs: 1000 }),
                page('/a-propos', { engagedMs: 1000 })
            ]));

            expect(analytics.getDashboard(30).kpis.smartBounceRate).toBe(0);
        });

        it('seuil exact : 15 secondes ne suffisent pas, 15 s + 1 ms si', function () {
            store.append(signal('s1', [page('/', { engagedMs: 15000 })]));
            store.append(signal('s2', [page('/', { engagedMs: 15001 })]));

            expect(analytics.getDashboard(30).kpis.smartBounceRate).toBe(50);
        });

        it('cumule les signaux d\'une même visite pour qualifier le rebond', function () {
            store.append(signal('s1', [page('/', { engagedMs: 8000 })]));
            store.append(signal('s1', [page('/', { engagedMs: 25000 })]));

            expect(analytics.getDashboard(30).kpis.smartBounceRate).toBe(0);
        });
    });

    // ================================================================
    // TEMPS ENGAGÉ
    // ================================================================
    describe('temps engagé', function () {
        it('moyenne par session', function () {
            store.append(signal('s1', [page('/', { engagedMs: 10000 })]));
            store.append(signal('s2', [page('/', { engagedMs: 20000 })]));

            expect(analytics.getDashboard(30).kpis.avgEngagedMs).toBe(15000);
        });

        it('renvoie la médiane, robuste aux valeurs aberrantes', function () {
            [1000, 2000, 3000, 200000].forEach(function (ms, i) {
                store.append(signal('s' + i, [page('/', { engagedMs: ms })]));
            });

            // La moyenne vaudrait ~51500, la médiane reste représentative
            expect(analytics.getDashboard(30).kpis.medianEngagedMs).toBe(2500);
        });

        it('n\'utilise que le dernier signal de chaque session (compteurs cumulés)', function () {
            store.append(signal('s1', [page('/', { engagedMs: 5000 })]));
            store.append(signal('s1', [page('/', { engagedMs: 5000 })]));
            store.append(signal('s1', [page('/', { engagedMs: 12000 })]));

            expect(analytics.getDashboard(30).kpis.avgEngagedMs).toBe(12000);
        });

        it('agrège le temps par galerie visitée', function () {
            store.append(signal('s1', [page('/galerie/gojira', { engagedMs: 12000 })]));
            store.append(signal('s2', [page('/galerie/gojira', { engagedMs: 6000 })]));

            var galeries = analytics.getDashboard(30).galleries;
            expect(galeries).toHaveLength(1);
            expect(galeries[0].avgEngagedMs).toBe(9000);
        });
    });

    // ================================================================
    // SCORE D'INTÉRÊT VISUEL
    // ================================================================
    describe('score d\'intérêt visuel', function () {
        it('mesure la part des visiteurs ayant ouvert le plein écran', function () {
            store.append(signal('s1', [page('/galerie/gojira', { fullscreenOpens: 1 })]));
            store.append(signal('s2', [page('/galerie/gojira', { fullscreenOpens: 0 })]));
            store.append(signal('s3', [page('/galerie/gojira', { fullscreenOpens: 1 })]));

            var galerie = analytics.getDashboard(30).galleries[0];
            expect(galerie.title).toBe('Gojira — Bercy');
            expect(galerie.artist).toBe('Gojira');
            expect(galerie.venue).toBe('Accor Arena');
            expect(galerie.sessions).toBe(3);
            expect(galerie.visualInterestRate).toBe(67);
        });

        it('compte une seule ouverture même si le signal en cumule plusieurs', function () {
            store.append(signal('s1', [page('/galerie/gojira', { fullscreenOpens: 4 })]));

            var galerie = analytics.getDashboard(30).galleries[0];
            expect(galerie.visualInterestRate).toBe(100);
        });

        it('résout le libellé depuis la configuration des galeries', function () {
            store.append(signal('s1', [page('/galerie/tagada', { fullscreenOpens: 1 })]));

            var galerie = analytics.getDashboard(30).galleries[0];
            expect(galerie.slug).toBe('tagada');
            expect(galerie.title).toContain('Tagada Jones');
        });

        it('ignore les pages ordinaires dans le classement des galeries', function () {
            store.append(signal('s1', [
                page('/', { fullscreenOpens: 1 }),
                page('/galerie/gojira', { fullscreenOpens: 1 })
            ]));

            expect(analytics.getDashboard(30).galleries).toHaveLength(1);
        });

        it('classe les galeries par score d\'engagement décroissant', function () {
            store.append(signal('s1', [page('/galerie/gojira', { fullscreenOpens: 1 })]));
            store.append(signal('s2', [page('/galerie/gojira', { fullscreenOpens: 1 })]));
            store.append(signal('s3', [page('/galerie/tagada', { fullscreenOpens: 0, scrollMax: 0.1 })]));

            var galeries = analytics.getDashboard(30).galleries;
            expect(galeries[0].slug).toBe('gojira');
            expect(galeries[1].slug).toBe('tagada');
            expect(galeries[0].score).toBeGreaterThan(galeries[1].score);
        });

        it('expose le nombre de photos vues par visite', function () {
            store.append(signal('s1', [page('/galerie/gojira', { photosViewed: 12 })]));
            store.append(signal('s2', [page('/galerie/gojira', { photosViewed: 7 })]));

            expect(analytics.getDashboard(30).galleries[0].avgPhotosViewed).toBe(9.5);
        });
    });

    // ================================================================
    // TAUX DE TRANSFORMATION CONTACT
    // ================================================================
    describe('taux de transformation contact', function () {
        it('rapporte les sessions converties aux sessions uniques', function () {
            store.append(signal('s1', [page('/contact', { contactClicks: 1 })], { hash: 'h1' }));
            store.append(signal('s2', [page('/', {})], { hash: 'h2' }));
            store.append(signal('s3', [page('/', {})], { hash: 'h3' }));
            store.append(signal('s4', [page('/', { mailtoClicks: 1 })], { hash: 'h4' }));

            var kpis = analytics.getDashboard(30).kpis;
            expect(kpis.sessions).toBe(4);
            expect(kpis.contactConversionRate).toBe(50);
            expect(kpis.totalConversions).toBe(2);
        });

        it('compte les visiteurs distincts via le hash anonyme', function () {
            store.append(signal('s1', [page('/', {})], { hash: 'h1' }));
            store.append(signal('s2', [page('/', {})], { hash: 'h1' }));
            store.append(signal('s3', [page('/', {})], { hash: 'h2' }));

            expect(analytics.getDashboard(30).kpis.visitors).toBe(2);
        });

        it('renvoie zéro quand il n\'y a aucune donnée', function () {
            var kpis = analytics.getDashboard(30).kpis;
            expect(kpis.sessions).toBe(0);
            expect(kpis.contactConversionRate).toBe(0);
            expect(kpis.avgEngagedMs).toBe(0);
            expect(kpis.smartBounceRate).toBe(0);
        });
    });

    // ================================================================
    // TOP ARTISTES / SALLES
    // ================================================================
    describe('top artistes et salles', function () {
        it('agrège les sessions par artiste', function () {
            store.append(signal('s1', [page('/galerie/gojira', { engagedMs: 9000 })]));
            store.append(signal('s2', [page('/galerie/tagada', { engagedMs: 3000 })]));
            store.append(signal('s3', [page('/galerie/tagada', { engagedMs: 6000 })]));

            var artists = analytics.getDashboard(30).artists.artists;
            expect(artists).toHaveLength(2);
            expect(artists[0].name).toBe('Tagada Jones');
            expect(artists[0].sessions).toBe(2);
            expect(artists[0].avgEngagedMs).toBe(4500);
        });

        it('agrège les sessions par salle', function () {
            store.append(signal('s1', [page('/galerie/gojira', { engagedMs: 9000 })]));
            store.append(signal('s2', [page('/galerie/tagada', { engagedMs: 3000 })]));

            var venues = analytics.getDashboard(30).artists.venues;
            expect(venues.map(function (v) { return v.name; }).sort()).toEqual(['Accor Arena', 'La Carene']);
        });

        it('exclut les galeries sans salle renseignée', function () {
            store.append(signal('s1', [page('/galerie/no venue', { engagedMs: 5000 })]));

            expect(analytics.getDashboard(30).artists.venues).toHaveLength(0);
        });
    });

    // ================================================================
    // SOURCES DE TRAFIC
    // ================================================================
    describe('sources de trafic', function () {
        it('classe les sources par engagement réel', function () {
            store.append(signal('s1', [page('/', { engagedMs: 30000 })], { src: 'instagram' }));
            store.append(signal('s2', [page('/', { engagedMs: 30000 })], { src: 'instagram' }));
            store.append(signal('s3', [page('/', { engagedMs: 2000 })], { src: 'search' }));
            store.append(signal('s4', [page('/', {})], { src: 'direct' }));

            var sources = analytics.getDashboard(30).sources;
            expect(sources.map(function (s) { return s.source; }))
                .toEqual(['instagram', 'search', 'direct']);
            expect(sources[0].engagementRate).toBe(100);
            expect(sources[1].engagementRate).toBe(0);
        });

        it('retombe sur direct quand la source est absente', function () {
            store.append(signal('s1', [page('/', {})], { src: null }));

            expect(analytics.getDashboard(30).sources[0].source).toBe('direct');
        });
    });

    // ================================================================
    // CAMPAGNES
    // ================================================================
    describe('campagnes', function () {
        it('produit visites, engagement, temps moyen et conversions', function () {
            store.append(signal('s1', [page('/', { engagedMs: 25000 })], {
                src: 'instagram', camp: { id: 'promo-ete', source: 'instagram' }
            }));
            store.append(signal('s2', [page('/', { engagedMs: 2000 })], {
                src: 'instagram', camp: { id: 'promo-ete', source: 'instagram' }
            }));
            store.append(signal('s3', [page('/contact', { contactClicks: 1 })], {
                src: 'newsletter', camp: { id: 'promo-hiver', source: 'email' }
            }));

            var campagnes = analytics.getDashboard(30).campaigns;
            expect(campagnes).toHaveLength(2);

            var ete = campagnes[0];
            expect(ete.id).toBe('promo-ete');
            expect(ete.sessions).toBe(2);
            expect(ete.avgEngagedMs).toBe(13500);
            expect(ete.engagementRate).toBe(50);
            expect(ete.conversions).toBe(0);

            var hiver = campagnes[1];
            expect(hiver.id).toBe('promo-hiver');
            expect(hiver.sessions).toBe(1);
            expect(hiver.conversionRate).toBe(100);
        });

        it('ignore les sessions sans campagne', function () {
            store.append(signal('s1', [page('/', {})]));

            expect(analytics.getDashboard(30).campaigns).toHaveLength(0);
        });

        it('ignore une campagne sans identifiant', function () {
            store.append(signal('s1', [page('/', {})], { camp: { source: 'instagram' } }));

            expect(analytics.getDashboard(30).campaigns).toHaveLength(0);
        });
    });

    // ================================================================
    // SÉRIE QUOTIDIENNE
    // ================================================================
    describe('série quotidienne', function () {
        it('regroupe les sessions par jour', function () {
            var jour = new Date();
            jour.setHours(12, 0, 0, 0);
            // s1 releve du rebond (10 s, aucun autre signe d'interet)
            store.append(signal('s1', [page('/', { engagedMs: 10000 })], { ts: jour.getTime() }));
            store.append(signal('s2', [page('/', { engagedMs: 20000 })], { ts: jour.getTime() }));

            var daily = analytics.getDashboard(30).daily;
            expect(daily).toHaveLength(1);
            expect(daily[0].sessions).toBe(2);
            expect(daily[0].engaged).toBe(1);
            expect(daily[0].bounceRate).toBe(50);
            expect(daily[0].avgEngagedMs).toBe(15000);
            expect(daily[0].conversions).toBe(0);
        });

        it('trie la série par ordre chronologique', function () {
            var jourA = new Date();
            jourA.setDate(jourA.getDate() - 2);
            jourA.setHours(12, 0, 0, 0);
            var jourB = new Date();
            jourB.setDate(jourB.getDate() - 1);
            jourB.setHours(12, 0, 0, 0);

            store.append(signal('s1', [page('/', {})], { ts: jourB.getTime() }));
            store.append(signal('s2', [page('/', {})], { ts: jourA.getTime() }));

            var dates = analytics.getDashboard(30).daily.map(function (d) { return d.date; });
            expect(dates).toEqual(dates.slice().sort());
        });

        it('ignore les signaux sans horodatage', function () {
            store.append(signal('s1', [page('/', {})], { ts: 0 }));

            expect(analytics.getDashboard(30).daily).toHaveLength(0);
        });
    });

    // ================================================================
    // DÉDOUBLONNAGE ET ROBUSTESSE
    // ================================================================
    describe('dédoublonnage et robustesse', function () {
        it('ne garde qu\'un signal par identifiant de session', function () {
            store.append(signal('s1', [page('/', { engagedMs: 5000 })]));
            store.append(signal('s1', [page('/', { engagedMs: 9000 })]));

            expect(analytics.getDashboard(30).period.sessions).toBe(1);
        });

        it('ignore les signaux sans identifiant de session', function () {
            store.append({ v: 1, ts: Date.now(), pages: [page('/', {})] });

            expect(analytics.getDashboard(30).kpis.sessions).toBe(0);
        });

        it('ignore les signaux sans liste de pages', function () {
            store.append({ v: 1, sid: 's1', ts: Date.now() });

            expect(analytics.getDashboard(30).kpis.sessions).toBe(1);
            expect(analytics.getDashboard(30).kpis.avgEngagedMs).toBe(0);
        });

        it('neutralise les valeurs négatives ou non numériques', function () {
            store.append(signal('s1', [page('/', {
                engagedMs: -5000,
                scrollMax: 4,
                fullscreenOpens: -1,
                photosViewed: 'beaucoup',
                contactClicks: null
            })]));

            var kpis = analytics.getDashboard(30).kpis;
            expect(kpis.avgEngagedMs).toBe(0);
            expect(kpis.totalFullscreen).toBe(0);
        });

        it('borne la profondeur de scroll entre 0 et 1', function () {
            store.append(signal('s1', [page('/', { scrollMax: 3.7 })]));
            store.append(signal('s2', [page('/', { scrollMax: -2 })]));

            expect(analytics.getDashboard(30).kpis.avgScrollDepth).toBe(50);
        });

        it('supporte le sélecteur "tout l\'historique"', function () {
            var ancien = Date.now() - 200 * 86400000;
            store.append({ v: 1, sid: 'ancien', ts: ancien, src: 'search', pages: [page('/', { engagedMs: 5000 })] });

            var tout = analytics.getDashboard(null);
            expect(tout.period.days).toBeNull();
            expect(tout.kpis.sessions).toBe(1);
            expect(analytics.getDashboard(30).kpis.sessions).toBe(0);
        });
    });
});
