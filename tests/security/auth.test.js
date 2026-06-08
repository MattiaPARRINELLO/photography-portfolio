const crypto = require('crypto');

let checkAdminPassword, requireAdminSession, requireAdminPage;
let restoreAdminSessionFromCookie, setAdminAuthCookie, clearAdminAuthCookie;

// On doit mocker server/config AVANT de require le module auth
jest.mock('../../server/config', () => ({
  adminPassword: 'test-password'
}), { virtual: false });

// computeAdminToken is not exported, we must recompute the same logic
const ADMIN_COOKIE_SALT = process.env.ADMIN_REMEMBER_SALT || 'admin-remember-salt';
function computeValidToken() {
  return crypto.createHmac('sha256', ADMIN_COOKIE_SALT).update('test-password').digest('hex');
}

describe('Middleware auth', () => {
  beforeAll(() => {
    const auth = require('../../server/middleware/auth');
    checkAdminPassword = auth.checkAdminPassword;
    requireAdminSession = auth.requireAdminSession;
    requireAdminPage = auth.requireAdminPage;
    restoreAdminSessionFromCookie = auth.restoreAdminSessionFromCookie;
    setAdminAuthCookie = auth.setAdminAuthCookie;
    clearAdminAuthCookie = auth.clearAdminAuthCookie;
  });

  // ================================================================
  // checkAdminPassword
  // ================================================================
  describe('checkAdminPassword', () => {
    it('devrait appeler next() si le mot de passe est correct', () => {
      const req = { headers: { 'x-admin-password': 'test-password' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      checkAdminPassword(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('devrait retourner 401 si le mot de passe est incorrect', () => {
      const req = { headers: { 'x-admin-password': 'mauvais' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      checkAdminPassword(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Accès non autorisé' });
      expect(next).not.toHaveBeenCalled();
    });

    it('devrait retourner 401 si le header est absent', () => {
      const req = { headers: {} };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      checkAdminPassword(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  // ================================================================
  // restoreAdminSessionFromCookie
  // ================================================================
  describe('restoreAdminSessionFromCookie', () => {
    it('devrait restaurer la session si le cookie adminAuth est valide', () => {
      const req = { cookies: { adminAuth: computeValidToken() }, session: {} };

      const result = restoreAdminSessionFromCookie(req);

      expect(result).toBe(true);
      expect(req.session.isAdmin).toBe(true);
    });

    it('devrait retourner false si le cookie adminAuth est absent', () => {
      const req = { cookies: {}, session: {} };

      const result = restoreAdminSessionFromCookie(req);

      expect(result).toBe(false);
    });

    it('devrait retourner false si le cookie adminAuth est invalide', () => {
      const req = { cookies: { adminAuth: 'token-invalide' }, session: {} };

      const result = restoreAdminSessionFromCookie(req);

      expect(result).toBe(false);
    });

    it('devrait retourner false si req.cookies est null', () => {
      const req = { cookies: null, session: {} };

      const result = restoreAdminSessionFromCookie(req);

      expect(result).toBe(false);
    });
  });

  // ================================================================
  // requireAdminSession
  // ================================================================
  describe('requireAdminSession', () => {
    it('devrait appeler next() si la session isAdmin est true', () => {
      const req = { session: { isAdmin: true }, cookies: {} };
      const res = {};
      const next = jest.fn();

      requireAdminSession(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('devrait appeler next() si le cookie restaure la session', () => {
      const req = { session: {}, cookies: { adminAuth: computeValidToken() } };
      const res = {};
      const next = jest.fn();

      requireAdminSession(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.session.isAdmin).toBe(true);
    });

    it('devrait retourner 401 si ni session ni cookie valide', () => {
      const req = { session: {}, cookies: {} };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      requireAdminSession(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Session non autorisée' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ================================================================
  // requireAdminPage
  // ================================================================
  describe('requireAdminPage', () => {
    it('devrait appeler next() si la session isAdmin est true', () => {
      const req = { session: { isAdmin: true }, cookies: {} };
      const res = {};
      const next = jest.fn();

      requireAdminPage(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('devrait rediriger vers /admin si non autorisé', () => {
      const req = { session: {}, cookies: {} };
      const res = { redirect: jest.fn() };
      const next = jest.fn();

      requireAdminPage(req, res, next);

      expect(res.redirect).toHaveBeenCalledWith('/admin');
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ================================================================
  // setAdminAuthCookie / clearAdminAuthCookie
  // ================================================================
  describe('setAdminAuthCookie', () => {
    it('devrait définir le cookie adminAuth', () => {
      const res = { cookie: jest.fn() };

      setAdminAuthCookie(res);

      expect(res.cookie).toHaveBeenCalledWith(
        'adminAuth',
        expect.any(String),
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax'
        })
      );
    });
  });

  describe('clearAdminAuthCookie', () => {
    it('devrait supprimer le cookie adminAuth', () => {
      const res = { clearCookie: jest.fn() };

      clearAdminAuthCookie(res);

      expect(res.clearCookie).toHaveBeenCalledWith('adminAuth');
    });
  });
});
