const crypto = require('crypto');
const serverConfig = require('../config');

const ADMIN_COOKIE_NAME = 'adminAuth';
const ADMIN_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 jours
const ADMIN_COOKIE_SALT = process.env.ADMIN_REMEMBER_SALT || 'admin-remember-salt';

function computeAdminToken() {
    const password = serverConfig.adminPassword || '';
    return crypto.createHmac('sha256', ADMIN_COOKIE_SALT).update(password).digest('hex');
}

function restoreAdminSessionFromCookie(req) {
    const token = req.cookies ? req.cookies[ADMIN_COOKIE_NAME] : null;
    if (token && token === computeAdminToken()) {
        req.session.isAdmin = true;
        return true;
    }
    return false;
}

function setAdminAuthCookie(res) {
    res.cookie(ADMIN_COOKIE_NAME, computeAdminToken(), {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        maxAge: ADMIN_COOKIE_MAX_AGE
    });
}

function clearAdminAuthCookie(res) {
    res.clearCookie(ADMIN_COOKIE_NAME);
}

/**
 * Middleware de vérification du mot de passe admin (pour les requêtes avec header)
 */
function checkAdminPassword(req, res, next) {
    const password = req.headers['x-admin-password'];
    if (password !== serverConfig.adminPassword) {
        return res.status(401).json({ error: 'Accès non autorisé' });
    }
    next();
}

/**
 * Middleware de vérification de session admin (pour les API)
 */
function requireAdminSession(req, res, next) {
    console.log('Vérification session admin:', req.session.isAdmin);
    if (req.session.isAdmin || restoreAdminSessionFromCookie(req)) {
        return next();
    }
    console.log('Session non autorisée, retour de 401');
    return res.status(401).json({ error: 'Session non autorisée' });
}

/**
 * Middleware de vérification de session admin (pour les pages HTML)
 */
function requireAdminPage(req, res, next) {
    console.log('Vérification session admin (page):', req.session.isAdmin);
    if (req.session.isAdmin || restoreAdminSessionFromCookie(req)) {
        return next();
    }
    console.log('Session non autorisée, redirection vers /admin');
    return res.redirect('/admin');
}

module.exports = {
    checkAdminPassword,
    requireAdminSession,
    requireAdminPage,
    restoreAdminSessionFromCookie,
    setAdminAuthCookie,
    clearAdminAuthCookie
};
