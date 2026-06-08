var campaignService = require('../../server/utils/campaignService');

describe('campaignService', function () {

  beforeEach(function () {
    // Nettoyer le cache entre les tests
    campaignService.userCampaignCache.clear();
  });

  // ================================================================
  // processCampaignFromQuery
  // ================================================================
  describe('processCampaignFromQuery', function () {
    it('retourne les infos de campagne depuis le param ref', function () {
      var result = campaignService.processCampaignFromQuery({
        ref: 'summer2025',
        utm_source: 'instagram',
        utm_medium: 'social'
      });

      expect(result).toBeDefined();
      expect(result.campaignId).toBe('summer2025');
      expect(result.campaignName).toBe('summer2025');
      expect(result.source).toBe('instagram');
      expect(result.medium).toBe('social');
      expect(result.timestamp).toBeDefined();
    });

    it('utilise utm_campaign si ref est absent', function () {
      var result = campaignService.processCampaignFromQuery({
        utm_campaign: 'winter2025',
        utm_source: 'email'
      });

      expect(result.campaignId).toBe('winter2025');
      expect(result.source).toBe('email');
      expect(result.medium).toBe('unknown');
    });

    it('retourne null si aucun param de campagne', function () {
      var result = campaignService.processCampaignFromQuery({});
      expect(result).toBeNull();
    });

    it('retourne null si query est vide', function () {
      var result = campaignService.processCampaignFromQuery({});
      expect(result).toBeNull();
    });

    it('utilise des valeurs par defaut pour source et medium absents', function () {
      var result = campaignService.processCampaignFromQuery({ ref: 'test' });
      expect(result.source).toBe('unknown');
      expect(result.medium).toBe('unknown');
    });
  });

  // ================================================================
  // associateUserToCampaign / getUserCampaignInfo
  // ================================================================
  describe('associateUserToCampaign / getUserCampaignInfo', function () {
    it('associe et recupere les infos de campagne', function () {
      var info = { campaignId: 'c1', campaignName: 'Test', source: 's', medium: 'm', timestamp: new Date().toISOString() };
      campaignService.associateUserToCampaign('user1', info);

      var retrieved = campaignService.getUserCampaignInfo('user1');
      expect(retrieved).toEqual(info);
    });

    it('retourne null si utilisateur non associe', function () {
      var result = campaignService.getUserCampaignInfo('inconnu');
      expect(result).toBeNull();
    });

    it('ne fait rien si userId est null', function () {
      campaignService.associateUserToCampaign(null, { campaignId: 'c1' });
      expect(campaignService.getUserCampaignInfo(null)).toBeNull();
    });

    it('ne fait rien si campaignInfo est null', function () {
      campaignService.associateUserToCampaign('user1', null);
      expect(campaignService.getUserCampaignInfo('user1')).toBeNull();
    });

    it('ecrase l association existante', function () {
      var info1 = { campaignId: 'c1', campaignName: 'First', timestamp: new Date().toISOString() };
      var info2 = { campaignId: 'c2', campaignName: 'Second', timestamp: new Date().toISOString() };

      campaignService.associateUserToCampaign('user1', info1);
      campaignService.associateUserToCampaign('user1', info2);

      expect(campaignService.getUserCampaignInfo('user1').campaignId).toBe('c2');
    });
  });

  // ================================================================
  // getCampaignInfo
  // ================================================================
  describe('getCampaignInfo', function () {
    it('priorise les infos client', function () {
      var req = { cookies: {} };
      campaignService.associateUserToCampaign('u1', { campaignId: 'cached' });

      var result = campaignService.getCampaignInfo(req, 'u1', { campaignId: 'client' });
      expect(result.campaignId).toBe('client');
    });

    it('fallback sur le cache utilisateur', function () {
      var req = { cookies: {} };
      campaignService.associateUserToCampaign('u1', { campaignId: 'cached' });

      var result = campaignService.getCampaignInfo(req, 'u1', null);
      expect(result.campaignId).toBe('cached');
    });

    it('fallback sur le cookie', function () {
      var req = {
        cookies: { user_campaign_info: JSON.stringify({ campaignId: 'cookie-camp' }) }
      };

      var result = campaignService.getCampaignInfo(req, 'u2', null);
      expect(result.campaignId).toBe('cookie-camp');
    });

    it('retourne null si aucune source disponible', function () {
      var req = { cookies: {} };
      var result = campaignService.getCampaignInfo(req, 'u99', null);
      expect(result).toBeNull();
    });
  });
});
