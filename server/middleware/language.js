// La langue ne se négocie plus via l'en-tête Accept-Language : Googlebot
// envoie « en-US » et recevait donc la version anglaise de /, avec un canonical
// vers /?lang=en. Deux sources seulement, dans cet ordre : ?lang= (prioritaire,
// indexable) puis le cookie lang (choix explicite du visiteur).
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
    }
    req.lang = lang === 'en' ? 'en' : 'fr';
    next();
}

module.exports = languageMiddleware;
