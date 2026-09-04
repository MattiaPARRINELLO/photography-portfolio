function languageMiddleware(req, res, next) {
    let lang = null;
    if (req.query && (req.query.lang === 'en' || req.query.lang === 'fr')) {
        lang = req.query.lang;
        res.cookie('lang', lang, {
            maxAge: 365 * 24 * 60 * 60 * 1000,
            httpOnly: false,
            sameSite: 'Lax',
            path: '/'
        });
    } else if (req.cookies && (req.cookies.lang === 'en' || req.cookies.lang === 'fr')) {
        lang = req.cookies.lang;
    } else {
        const accept = (req.headers['accept-language'] || '').toLowerCase();
        lang = accept.startsWith('en') ? 'en' : 'fr';
    }
    req.lang = lang === 'en' ? 'en' : 'fr';
    next();
}

module.exports = languageMiddleware;
