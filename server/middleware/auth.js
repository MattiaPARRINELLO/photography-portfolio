const serverConfig = require('../config');

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
    if (!req.session.isAdmin) {
        console.log('Session non autorisée, retour de 401');
        return res.status(401).json({ error: 'Session non autorisée' });
    }
    next();
}

/**
 * Middleware de vérification de session admin (pour les pages HTML)
 */
function requireAdminPage(req, res, next) {
    console.log('Vérification session admin (page):', req.session.isAdmin);
    if (!req.session.isAdmin) {
        console.log('Session non autorisée, redirection vers /admin');
        return res.redirect('/admin');
    }
    next();
}

module.exports = {
    checkAdminPassword,
    requireAdminSession,
    requireAdminPage
};
