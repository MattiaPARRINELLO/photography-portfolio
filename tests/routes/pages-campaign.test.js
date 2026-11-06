// Régression : la page d'accueil doit accepter les paramètres de campagne
// avec le VRAI campaignService (l'API a changé : parseCampaignQuery a remplacé
// processCampaignFromQuery). Un mock masquait le TypeError qui faisait un 500
// sur toute URL du type /?ref=... (liens de campagne marketing).
const request = require('supertest');
const express = require('express');

jest.mock('../../server/utils/photoService', function () {
    return {
        getPhotosList: jest.fn().mockResolvedValue([]),
        getPhotosForGallery: jest.fn().mockResolvedValue([])
    };
});

const pagesRouter = require('../../server/routes/pages');

describe('pages publiques avec le campaignService réel', function () {
    let app;

    beforeAll(function () {
        app = express();
        app.use('/', pagesRouter);
    });

    // L'ordre compte : le cache de page d'accueil (60 s) est partagé, la première
    // requête détermine le HTML mis en cache. On teste donc la campagne d'abord.
    it('injecte le script de nettoyage d\'URL quand une campagne est présente', function () {
        return request(app)
            .get('/?ref=insta-bio')
            .expect(200)
            .expect(function (res) {
                if (!/history\.replaceState/.test(res.text)) {
                    throw new Error('script de nettoyage d\'URL absent de la page d\'accueil');
                }
            });
    });

    ['/?utm_campaign=newsletter', '/?c=printemps'].forEach(function (url) {
        it('sert ' + url + ' sans erreur serveur', function () {
            return request(app).get(url).expect(200);
        });
    });

    it('sert / sans paramètre', function () {
        return request(app).get('/').expect(200);
    });

    it('n\'injecte pas de script de nettoyage sans campagne', function () {
        return request(app)
            .get('/a-propos')
            .expect(200)
            .expect(function (res) {
                if (/history\.replaceState/.test(res.text)) {
                    throw new Error('script de nettoyage d\'URL injecté à tort');
                }
            });
    });
});
