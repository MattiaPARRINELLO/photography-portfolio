var campaignService = require('../../server/utils/campaignService');

// ================================================================
// Service de campagnes — extraction SANS ÉTAT
//
// Plus de cache serveur, plus de cookie `user_campaign_info` :
// le tracker client détecte la campagne dans l'URL puis la joint
// à chaque signal de session. Ce module ne fait que parser/normaliser.
// ================================================================

describe('campaignService', function () {
  describe('parseCampaignQuery', function () {
    it('retrouve la campagne depuis le paramètre c', function () {
      var result = campaignService.parseCampaignQuery({ c: 'ete2025' });
      expect(result).toEqual({ id: 'ete2025', source: null });
    });

    it('retrouve la campagne depuis le paramètre ref', function () {
      var result = campaignService.parseCampaignQuery({ ref: 'ete2025', utm_source: 'instagram' });
      expect(result).toEqual({ id: 'ete2025', source: 'instagram' });
    });

    it('retrouve la campagne depuis utm_campaign', function () {
      var result = campaignService.parseCampaignQuery({ utm_campaign: 'hiver2025', utm_source: 'newsletter' });
      expect(result).toEqual({ id: 'hiver2025', source: 'newsletter' });
    });

    it('supporte aussi le paramètre source', function () {
      var result = campaignService.parseCampaignQuery({ c: 'promo', source: 'flyer' });
      expect(result).toEqual({ id: 'promo', source: 'flyer' });
    });

    it('privilégie c, puis ref, puis utm_campaign', function () {
      expect(campaignService.parseCampaignQuery({ c: 'a', ref: 'b', utm_campaign: 'c' }).id).toBe('a');
      expect(campaignService.parseCampaignQuery({ ref: 'b', utm_campaign: 'c' }).id).toBe('b');
      expect(campaignService.parseCampaignQuery({ utm_campaign: 'c' }).id).toBe('c');
    });

    it('accepte un objet URLSearchParams', function () {
      var params = new URLSearchParams('ref=biolink&utm_source=instagram');
      expect(campaignService.parseCampaignQuery(params)).toEqual({ id: 'biolink', source: 'instagram' });
    });

    it('retourne null si aucun paramètre de campagne', function () {
      expect(campaignService.parseCampaignQuery({})).toBeNull();
      expect(campaignService.parseCampaignQuery({ page: '/', utm_medium: 'social' })).toBeNull();
    });

    it('retourne null si les paramètres sont absents', function () {
      expect(campaignService.parseCampaignQuery(null)).toBeNull();
      expect(campaignService.parseCampaignQuery(undefined)).toBeNull();
    });

    it('retourne null si le paramètre est une chaîne vide', function () {
      expect(campaignService.parseCampaignQuery({ ref: '  ' })).toBeNull();
    });

    it('tronque les identifiants trop longs', function () {
      var long = 'x'.repeat(200);
      var result = campaignService.parseCampaignQuery({ c: long });
      expect(result.id.length).toBe(64);
    });
  });

  describe('normalizeCampaign', function () {
    it('normalise un objet campagne', function () {
      expect(campaignService.normalizeCampaign({ id: 'promo', source: 'instagram' }))
        .toEqual({ id: 'promo', source: 'instagram' });
    });

    it('parse une chaîne JSON', function () {
      expect(campaignService.normalizeCampaign('{"id":"promo","source":"bio"}'))
        .toEqual({ id: 'promo', source: 'bio' });
    });

    it('met une source manquante à null', function () {
      expect(campaignService.normalizeCampaign({ id: 'promo' })).toEqual({ id: 'promo', source: null });
    });

    it('retourne null pour une entrée invalide', function () {
      expect(campaignService.normalizeCampaign(null)).toBeNull();
      expect(campaignService.normalizeCampaign(undefined)).toBeNull();
      expect(campaignService.normalizeCampaign({})).toBeNull();
      expect(campaignService.normalizeCampaign({ source: 'instagram' })).toBeNull();
      expect(campaignService.normalizeCampaign('pas-du-json')).toBeNull();
      expect(campaignService.normalizeCampaign(42)).toBeNull();
    });

    it('tronque les champs trop longs', function () {
      var result = campaignService.normalizeCampaign({ id: 'a'.repeat(100), source: 'b'.repeat(80) });
      expect(result.id.length).toBe(64);
      expect(result.source.length).toBe(32);
    });

    it('supprime les espaces superflus', function () {
      expect(campaignService.normalizeCampaign({ id: '  promo  ', source: '  instagram  ' }))
        .toEqual({ id: 'promo', source: 'instagram' });
    });
  });

  it("n'expose plus d'état serveur ni d'API de cookie", function () {
    expect(campaignService.userCampaignCache).toBeUndefined();
    expect(campaignService.associateUserToCampaign).toBeUndefined();
    expect(campaignService.getUserCampaignInfo).toBeUndefined();
    expect(campaignService.getCampaignInfo).toBeUndefined();
    expect(campaignService.processCampaignFromQuery).toBeUndefined();
  });
});
