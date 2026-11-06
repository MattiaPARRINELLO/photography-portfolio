var campaignService = require('../../server/utils/campaignService');

// ================================================================
// Service de campagnes — cas limites
//
// Le service est désormais sans état : ces cas vérifient la robustesse
// du parsing (données absentes, malformées, types inattendus) et
// confirment qu'aucun mécanisme de persistance n'a survécu.
// ================================================================

describe('campaignService — cas limites', function () {

  describe('parseCampaignQuery — types inattendus', function () {

    it('ignore un tableau de paramètres', function () {
      expect(campaignService.parseCampaignQuery(['ref=promo'])).toBeNull();
    });

    it('ignore une chaîne simple', function () {
      expect(campaignService.parseCampaignQuery('ref=promo')).toBeNull();
    });

    it('ignore un nombre', function () {
      expect(campaignService.parseCampaignQuery(42)).toBeNull();
    });

    it('ignore une valeur non chaîne pour un paramètre attendu', function () {
      expect(campaignService.parseCampaignQuery({ ref: { nested: true } })).toBeNull();
      expect(campaignService.parseCampaignQuery({ ref: 123 })).toBeNull();
    });

    it('ignore un paramètre c vide au profit de ref', function () {
      expect(campaignService.parseCampaignQuery({ c: '', ref: 'secours' }).id).toBe('secours');
    });

    it('gère une URLSearchParams vide', function () {
      expect(campaignService.parseCampaignQuery(new URLSearchParams())).toBeNull();
    });

    it('tolère les valeurs avec des caractères accentués', function () {
      var result = campaignService.parseCampaignQuery({ ref: 'concertenfr' });
      expect(result.id).toBe('concertenfr');
    });
  });

  describe('normalizeCampaign — types inattendus', function () {

    it('ignore un tableau', function () {
      expect(campaignService.normalizeCampaign(['id'])).toBeNull();
    });

    it('ignore une fonction', function () {
      expect(campaignService.normalizeCampaign(function () {})).toBeNull();
    });

    it('ignore un identifiant vide après nettoyage', function () {
      expect(campaignService.normalizeCampaign({ id: '   ' })).toBeNull();
    });

    it('ignore une source non chaîne', function () {
      expect(campaignService.normalizeCampaign({ id: 'promo', source: 12 })).toEqual({ id: 'promo', source: null });
    });

    it('parse un JSON avec des champs superflus', function () {
      expect(campaignService.normalizeCampaign('{"id":"p","source":"s","timestamp":"2026"}'))
        .toEqual({ id: 'p', source: 's' });
    });
  });

  describe('aucune persistance résiduelle', function () {

    it("n'expose aucun cache ni aucune méthode liée aux cookies", function () {
      expect(campaignService.userCampaignCache).toBeUndefined();
      expect(campaignService.cleanExpiredCampaigns).toBeUndefined();
      expect(campaignService.associateUserToCampaign).toBeUndefined();
      expect(campaignService.getUserCampaignInfo).toBeUndefined();
      expect(campaignService.getCampaignInfo).toBeUndefined();
      expect(campaignService.processCampaignFromQuery).toBeUndefined();
    });
  });
});
