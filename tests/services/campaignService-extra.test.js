var campaignService = require('../../server/utils/campaignService');

describe('campaignService — edge cases', function () {

  var MS_24H = 24 * 60 * 60 * 1000;

  beforeEach(function () {
    campaignService.userCampaignCache.clear();
  });

  // ================================================================
  // cleanExpiredCampaigns (lignes 17-23)
  // ================================================================
  describe('cleanExpiredCampaigns', function () {

    it('supprime les entrees expirees du cache', function () {
      var expiredInfo = {
        campaignId: 'old-camp',
        campaignName: 'Old',
        source: 'src',
        medium: 'med',
        timestamp: new Date(Date.now() - MS_24H - 1000).toISOString()
      };
      campaignService.associateUserToCampaign('expired-user', expiredInfo);

      expect(campaignService.userCampaignCache.size).toBe(1);
      campaignService.cleanExpiredCampaigns();
      expect(campaignService.userCampaignCache.size).toBe(0);
      expect(campaignService.getUserCampaignInfo('expired-user')).toBeNull();
    });

    it('conserve les entrees non expirees', function () {
      var freshInfo = {
        campaignId: 'fresh-camp',
        campaignName: 'Fresh',
        source: 'src',
        medium: 'med',
        timestamp: new Date(Date.now() - 1000).toISOString()
      };
      campaignService.associateUserToCampaign('fresh-user', freshInfo);

      campaignService.cleanExpiredCampaigns();
      expect(campaignService.userCampaignCache.size).toBe(1);
      expect(campaignService.getUserCampaignInfo('fresh-user')).not.toBeNull();
    });

    it('ne plante pas avec un cache vide', function () {
      expect(function () {
        campaignService.cleanExpiredCampaigns();
      }).not.toThrow();
      expect(campaignService.userCampaignCache.size).toBe(0);
    });

    it('supprime uniquement les entrees strictement plus vieilles que 24h', function () {
      var justeDansLesLimites = {
        campaignId: 'juste',
        campaignName: 'Juste',
        source: 's',
        medium: 'm',
        timestamp: new Date(Date.now() - MS_24H + 1000).toISOString()
      };
      var tresVieille = {
        campaignId: 'trop-vieux',
        campaignName: 'TropVieux',
        source: 's',
        medium: 'm',
        timestamp: new Date(Date.now() - MS_24H - 60000).toISOString()
      };

      campaignService.associateUserToCampaign('limite', justeDansLesLimites);
      campaignService.associateUserToCampaign('vieux', tresVieille);

      campaignService.cleanExpiredCampaigns();

      expect(campaignService.userCampaignCache.size).toBe(1);
      expect(campaignService.getUserCampaignInfo('limite')).not.toBeNull();
      expect(campaignService.getUserCampaignInfo('vieux')).toBeNull();
    });

  });

  // ================================================================
  // Cache expiry — entries expire after set duration
  // ================================================================
  describe('expiration du cache apres 24h', function () {

    var realDateNow;

    beforeEach(function () {
      realDateNow = Date.now;
    });

    afterEach(function () {
      Date.now = realDateNow;
    });

    it('getUserCampaignInfo retourne la valeur avant expiration', function () {
      var now = realDateNow.call(Date);
      Date.now = function () { return now; };

      var info = { campaignId: 'c1', campaignName: 'Test', timestamp: new Date(now).toISOString() };
      campaignService.associateUserToCampaign('u1', info);

      var result = campaignService.getUserCampaignInfo('u1');
      expect(result).not.toBeNull();
      expect(result.campaignId).toBe('c1');
    });

    it('cleanExpiredCampaigns supprime apres expiration via Date.now mock', function () {
      var now = realDateNow.call(Date);
      Date.now = function () { return now + MS_24H + 60000; };

      var info = {
        campaignId: 'c-old',
        campaignName: 'Vieux',
        timestamp: new Date(now).toISOString()
      };
      campaignService.associateUserToCampaign('u-old', info);

      campaignService.cleanExpiredCampaigns();
      expect(campaignService.userCampaignCache.size).toBe(0);
    });

  });

  // ================================================================
  // getCampaignInfo — cookie invalide (ligne 98)
  // ================================================================
  describe('getCampaignInfo — cookie parsing error', function () {

    it('ignore un cookie JSON invalide et retourne null', function () {
      var req = {
        cookies: { user_campaign_info: '{broken json!!!' }
      };
      var result = campaignService.getCampaignInfo(req, 'u1', null);
      expect(result).toBeNull();
    });

    it('ne met pas a jour le cache quand le cookie est invalide', function () {
      var req = {
        cookies: { user_campaign_info: 'pas-du-json' }
      };
      campaignService.getCampaignInfo(req, 'u1', null);
      expect(campaignService.userCampaignCache.size).toBe(0);
    });

  });

  // ================================================================
  // getUserCampaignInfo — edge cases
  // ================================================================
  describe('getUserCampaignInfo — cas limites', function () {

    it('retourne null pour undefined userId', function () {
      expect(campaignService.getUserCampaignInfo(undefined)).toBeNull();
    });

    it('retourne null quand le cache est vide', function () {
      expect(campaignService.userCampaignCache.size).toBe(0);
      expect(campaignService.getUserCampaignInfo('nimporte-qui')).toBeNull();
    });

  });

});
