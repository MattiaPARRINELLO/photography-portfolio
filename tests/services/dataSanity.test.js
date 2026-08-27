const { isManifestlyFake, getPublicGalleries } = require('../../server/utils/dataSanity');

describe('dataSanity — garde-fou contre les galeries fictives', function () {
    describe('isManifestlyFake', function () {
        it('retourne false pour une galerie valide', function () {
            expect(isManifestlyFake({
                title: 'Damso à Reims',
                artist: 'Damso',
                venue: 'Reims Arena',
                date: '2026-05-09',
                published: true
            })).toBe(false);
        });

        it('détecte une date à 5 chiffres sans séparateur (saisie test)', function () {
            expect(isManifestlyFake({ title: 'x', date: '21310312' })).toBe(true);
        });

        it('détecte une année aberrante dans le futur', function () {
            expect(isManifestlyFake({ title: 'x', artist: 'y', date: '2131-03-12' })).toBe(true);
        });

        it('détecte une date antérieure à 2000', function () {
            expect(isManifestlyFake({ title: 'x', date: '1999-01-01' })).toBe(true);
        });

        it('juge aussi la donnée d une galerie non publiée (le filtre published est géré par l appelant)', function () {
            expect(isManifestlyFake({ title: 'kjhgfds', date: '2131-03-12', published: false })).toBe(true);
        });

        it('détecte une galerie vide de titre/artiste/lieu', function () {
            expect(isManifestlyFake({ date: '2026-01-01' })).toBe(true);
        });

        it('ignore null/undefined', function () {
            expect(isManifestlyFake(null)).toBe(false);
            expect(isManifestlyFake(undefined)).toBe(false);
        });
    });

    describe('getPublicGalleries', function () {
        const prev = process.env.NODE_ENV;

        afterEach(function () {
            process.env.NODE_ENV = prev;
        });

        it('ne filtre rien hors production (dev : contenu visible)', function () {
            process.env.NODE_ENV = 'development';
            const out = getPublicGalleries();
            expect(Array.isArray(out)).toBe(true);
        });

        it('en production, exclut une galerie aux données fictives si elle est publiée', function () {
            process.env.NODE_ENV = 'production';
            const out = getPublicGalleries();
            expect(Array.isArray(out)).toBe(true);
            const fake = out.find(g => g.date && (g.title || '').toLowerCase() === 'kjhgfds');
            expect(fake).toBeUndefined();
        });
    });
});