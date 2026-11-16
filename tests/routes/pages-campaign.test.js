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

    // La campagne est lue côté client : aucun paramètre de requête ne doit se
    // retrouver dans le HTML servi (XSS réfléchie par rebond du cache de rendu).
    it('ne recopie aucun paramètre de campagne dans le HTML', function () {
        return request(app)
            .get('/?ref=insta-bio')
            .expect(200)
            .expect(function (res) {
                if (/insta-bio/.test(res.text)) {
                    throw new Error('paramètre de campagne recopié dans la page');
                }
                if (/window\.campaignInfo/.test(res.text)) {
                    throw new Error('campaignInfo injecté côté serveur');
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

    it('n\'injecte aucun script lié à la campagne', function () {
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
