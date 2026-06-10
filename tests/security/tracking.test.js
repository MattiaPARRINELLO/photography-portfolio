jest.mock('../../server/utils/campaignService', function () {
  return {
    processCampaignFromQuery: jest.fn().mockReturnValue(null),
    associateUserToCampaign: jest.fn(),
    getUserCampaignInfo: jest.fn().mockReturnValue(null)
  };
});

var tracking;
var campaignService;

describe('userTrackingMiddleware', function () {
  var userLogger;
  var campaignManager;

  beforeAll(function () {
    tracking = require('../../server/middleware/tracking');
    campaignService = require('../../server/utils/campaignService');
  });

  beforeEach(function () {
    userLogger = { log: jest.fn() };
    campaignManager = {};
  });

  it('genere un userId et definit un cookie pour une requete page sans cookie existant', function () {
    var middleware = tracking.userTrackingMiddleware(userLogger, campaignManager);
    var req = {
      method: 'GET',
      url: '/portfolio',
      cookies: {},
      get: jest.fn().mockReturnValue(null),
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' },
      originalUrl: '/portfolio'
    };
    var res = { cookie: jest.fn() };
    var next = jest.fn();

    middleware(req, res, next);

    expect(req.userId).toBeDefined();
    expect(req.userId).toMatch(/^user_/);
    expect(res.cookie).toHaveBeenCalledWith(
      'user_tracking_id',
      expect.any(String),
      expect.objectContaining({ maxAge: expect.any(Number), path: '/' })
    );
    expect(next).toHaveBeenCalled();
  });

  it('reutilise le cookie existant sans en creer un nouveau', function () {
    var middleware = tracking.userTrackingMiddleware(userLogger, campaignManager);
    var req = {
      method: 'GET',
      url: '/portfolio',
      cookies: { user_tracking_id: 'user_existant123' },
      get: jest.fn().mockReturnValue(null),
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' },
      originalUrl: '/portfolio'
    };
    var res = { cookie: jest.fn() };
    var next = jest.fn();

    middleware(req, res, next);

    expect(req.userId).toBe('user_existant123');
    expect(res.cookie).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('ne genere pas de cookie pour les requetes assets (.js, .css, .jpg, .png, .svg)', function () {
    var middleware = tracking.userTrackingMiddleware(userLogger, campaignManager);
    var urls = ['/dist/js/app.js', '/dist/css/output.css', '/photos/img.jpg', '/img/logo.png', '/icons/star.svg'];

    urls.forEach(function (url) {
      var req = {
        method: 'GET',
        url: url,
        cookies: {},
        get: jest.fn().mockReturnValue(null),
        ip: '127.0.0.1',
        connection: { remoteAddress: '127.0.0.1' },
        originalUrl: url
      };
      var res = { cookie: jest.fn() };
      var next = jest.fn();

      middleware(req, res, next);

      expect(req.userId).toBeUndefined();
      expect(res.cookie).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });
  });

  it('ne genere pas de cookie pour les requetes API et admin', function () {
    var middleware = tracking.userTrackingMiddleware(userLogger, campaignManager);
    var req = {
      method: 'GET',
      url: '/api/photos',
      cookies: {},
      get: jest.fn().mockReturnValue(null),
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' },
      originalUrl: '/api/photos'
    };
    var res = { cookie: jest.fn() };
    var next = jest.fn();

    middleware(req, res, next);

    expect(req.userId).toBeUndefined();
    expect(res.cookie).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('loggue les requetes HTTP sur les pages autorisees (/, /a-propos, /contact)', function () {
    var middleware = tracking.userTrackingMiddleware(userLogger, campaignManager);
    var req = {
      method: 'GET',
      url: '/',
      cookies: { user_tracking_id: 'user_logtest' },
      get: jest.fn().mockReturnValue('Mozilla/5.0'),
      ip: '192.168.1.1',
      connection: {},
      originalUrl: '/?ref=test'
    };
    var res = { cookie: jest.fn() };
    var next = jest.fn();

    middleware(req, res, next);

    expect(userLogger.log).toHaveBeenCalledWith(
      'user_logtest',
      'http_request',
      expect.objectContaining({
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        url: '/?ref=test',
        method: 'GET'
      })
    );
    expect(next).toHaveBeenCalled();
  });

  it('attache les infos de campagne au log si elles sont dans le cache utilisateur', function () {
    campaignService.getUserCampaignInfo.mockReturnValue({
      campaignId: 'ete2025',
      campaignName: 'Ete 2025',
      source: 'instagram',
      medium: 'social',
      timestamp: '2025-06-01T00:00:00.000Z'
    });

    var middleware = tracking.userTrackingMiddleware(userLogger, campaignManager);
    var req = {
      method: 'GET',
      url: '/contact',
      cookies: { user_tracking_id: 'user_camp' },
      get: jest.fn().mockReturnValue(null),
      ip: '10.0.0.1',
      connection: {},
      originalUrl: '/contact'
    };
    var res = { cookie: jest.fn() };
    var next = jest.fn();

    middleware(req, res, next);

    expect(userLogger.log).toHaveBeenCalledWith(
      'user_camp',
      'http_request',
      expect.objectContaining({
        campaignInfo: {
          campaignId: 'ete2025',
          campaignName: 'Ete 2025',
          source: 'instagram',
          medium: 'social',
          campaignTimestamp: '2025-06-01T00:00:00.000Z'
        }
      })
    );
    expect(next).toHaveBeenCalled();
  });
});

describe('campaignMiddleware', function () {
  var campaignManager;

  beforeAll(function () {
    tracking = tracking || require('../../server/middleware/tracking');
    campaignService = require('../../server/utils/campaignService');
  });

  beforeEach(function () {
    campaignManager = { recordCampaignVisit: jest.fn() };
    campaignService.processCampaignFromQuery.mockReturnValue(null);
    campaignService.associateUserToCampaign.mockClear();
  });

  it('traite les parametres de campagne et associe l utilisateur', function () {
    campaignService.processCampaignFromQuery.mockReturnValue({
      campaignId: 'printemps2025',
      campaignName: 'Printemps 2025',
      source: 'facebook',
      medium: 'cpc',
      timestamp: '2025-03-01T00:00:00.000Z'
    });

    var middleware = tracking.campaignMiddleware(campaignManager);
    var req = {
      query: { ref: 'printemps2025', utm_source: 'facebook', utm_medium: 'cpc' },
      userId: 'user_camp1',
      ip: '1.2.3.4',
      connection: {},
      get: jest.fn().mockReturnValue('Chrome'),
      cookies: {}
    };
    var res = { cookie: jest.fn() };
    var next = jest.fn();

    middleware(req, res, next);

    expect(campaignManager.recordCampaignVisit).toHaveBeenCalledWith(
      'printemps2025',
      'Chrome',
      '1.2.3.4'
    );
    expect(campaignService.associateUserToCampaign).toHaveBeenCalledWith(
      'user_camp1',
      expect.objectContaining({ campaignId: 'printemps2025' })
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'user_campaign_info',
      expect.any(String),
      expect.objectContaining({ maxAge: expect.any(Number), path: '/' })
    );
    expect(next).toHaveBeenCalled();
  });

  it('ne fait rien si aucun parametre de campagne dans la query', function () {
    var middleware = tracking.campaignMiddleware(campaignManager);
    var req = {
      query: {},
      userId: 'user_no_camp',
      cookies: {}
    };
    var res = { cookie: jest.fn() };
    var next = jest.fn();

    middleware(req, res, next);

    expect(campaignManager.recordCampaignVisit).not.toHaveBeenCalled();
    expect(campaignService.associateUserToCampaign).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('ne fait rien si userId est absent meme avec des parametres de campagne', function () {
    campaignService.processCampaignFromQuery.mockReturnValue({
      campaignId: 'sansuser',
      campaignName: 'Sans User'
    });

    var middleware = tracking.campaignMiddleware(campaignManager);
    var req = {
      query: { ref: 'sansuser' },
      userId: undefined,
      cookies: {}
    };
    var res = { cookie: jest.fn() };
    var next = jest.fn();

    middleware(req, res, next);

    expect(campaignManager.recordCampaignVisit).not.toHaveBeenCalled();
    expect(campaignService.associateUserToCampaign).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
