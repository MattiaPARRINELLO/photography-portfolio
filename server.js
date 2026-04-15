require('dotenv').config();
const express = require('express');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

// Configuration du serveur
const serverConfig = require('./server/config');
const { requireAdminSession } = require('./server/middleware/auth');
const linksService = require('./server/utils/linksService');

// Utilitaires
const campaignService = require('./server/utils/campaignService');

// Middleware
const { userTrackingMiddleware, campaignMiddleware } = require('./server/middleware/tracking');

// Routes
const pagesRouter = require('./server/routes/pages');
const adminRouter = require('./server/routes/admin');
const photosRouter = require('./server/routes/photos');
const imageResizeRouter = require('./server/routes/image-resize');
const contentRouter = require('./server/routes/content');
const statsRouter = require('./server/routes/stats');
const signedImagesRouter = require('./server/routes/signed-images');

// Classes de gestion
const UserActivityLogger = require('./scripts/UserActivityLogger');
const PhotoClickTracker = require('./scripts/PhotoClickTracker');
const CampaignManager = require('./scripts/CampaignManager');

// Initialisation des services
const userLogger = new UserActivityLogger();
const photoClickTracker = new PhotoClickTracker();
const campaignManager = new CampaignManager();

// Démarrer le nettoyage automatique des logs (toutes les 24h, rétention 7 jours)
userLogger.startPeriodicCleanup(24, 7);

// Initialisation de l'application Express
const app = express();
const PORT = serverConfig.getPort();
const paths = serverConfig.getPaths();

// Activer la compression Gzip/Brotli pour toutes les réponses
app.use(compression());

// Configuration des sessions
app.use(session({
    secret: 'votre-secret-session-super-securise', // À changer !
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: false, // Mettre à true en HTTPS
        maxAge: 24 * 60 * 60 * 1000, // 24h
        httpOnly: true,
        sameSite: 'lax'
    }
}));

// Middleware de base
app.use(express.json());
app.use(cookieParser());

// Sert les fichiers statiques, mais exclut le dossier /admin pour éviter les conflits
// Middleware: servir les versions pré-compressées si elles existent (.br/.gz)
app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    // Only handle obvious asset extensions
    const assetExt = req.path.split('.').pop();
    const serveExts = ['js', 'css', 'png', 'jpg', 'jpeg', 'webp', 'avif', 'svg', 'json', 'html'];
    if (!serveExts.includes(assetExt)) return next();

    const acceptEnc = req.headers['accept-encoding'] || '';
    const tryBrotli = acceptEnc.includes('br');
    const tryGzip = acceptEnc.includes('gzip');

    const fileOnDisk = path.join(paths.root, decodeURIComponent(req.path));
    // If requested path is a directory or doesn't have an extension, skip
    if (req.path.endsWith('/')) return next();

    // Prefer brotli
    if (tryBrotli) {
        const brPath = fileOnDisk + '.br';
        if (fs.existsSync(brPath)) {
            res.setHeader('Content-Encoding', 'br');
            if (/\.js$/.test(req.path)) res.setHeader('Content-Type', 'application/javascript');
            else if (/\.css$/.test(req.path)) res.setHeader('Content-Type', 'text/css');
            else if (/\.svg$/.test(req.path)) res.setHeader('Content-Type', 'image/svg+xml');
            else if (/\.json$/.test(req.path)) res.setHeader('Content-Type', 'application/json');
            else if (/\.html$/.test(req.path)) res.setHeader('Content-Type', 'text/html; charset=utf-8');
            else if (/\.(png|jpe?g|webp|avif)$/.test(req.path)) res.setHeader('Content-Type', 'image/*');
            res.setHeader('Vary', 'Accept-Encoding');
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            return res.sendFile(brPath);
        }
    }

    if (tryGzip) {
        const gzPath = fileOnDisk + '.gz';
        if (fs.existsSync(gzPath)) {
            res.setHeader('Content-Encoding', 'gzip');
            if (/\.js$/.test(req.path)) res.setHeader('Content-Type', 'application/javascript');
            else if (/\.css$/.test(req.path)) res.setHeader('Content-Type', 'text/css');
            else if (/\.svg$/.test(req.path)) res.setHeader('Content-Type', 'image/svg+xml');
            else if (/\.json$/.test(req.path)) res.setHeader('Content-Type', 'application/json');
            else if (/\.html$/.test(req.path)) res.setHeader('Content-Type', 'text/html; charset=utf-8');
            else if (/\.(png|jpe?g|webp|avif)$/.test(req.path)) res.setHeader('Content-Type', 'image/*');
            res.setHeader('Vary', 'Accept-Encoding');
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            return res.sendFile(gzPath);
        }
    }

    return next();
});

app.use(express.static(paths.root, {
    index: false, // Désactiver l'index automatique
    // Laisser l'option maxAge vide et définir des en-têtes par type
    setHeaders: (res, filePath) => {
        // Bloquer l'accès au dossier admin/ en statique
        if (filePath.includes('/admin/')) {
            res.setHeader('Cache-Control', 'no-store');
            return;
        }

        // HTML: ne pas mettre en cache durablement
        if (/\.html?$/.test(filePath)) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            return;
        }

        // JS / CSS: assets versionnés immutables
        if (/\.(js|css)$/.test(filePath)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            return;
        }

        // Images & fonts: immutables si stockés dans des dossiers générés
        if (/\.(png|jpe?g|webp|avif|svg|gif|ico|ttf|woff2?)$/.test(filePath)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            return;
        }

        // Par défaut: cache court
        res.setHeader('Cache-Control', 'public, max-age=86400');
    }
}));

// Rendre les services disponibles dans les routes
app.locals.userLogger = userLogger;
app.locals.photoClickTracker = photoClickTracker;
app.locals.campaignManager = campaignManager;
app.locals.campaignService = campaignService;

// Middleware de tracking utilisateur et campagnes
app.use(userTrackingMiddleware(userLogger, campaignManager));
app.use(campaignMiddleware(campaignManager));

// Handler pour le bandeau événement (à définir AVANT les routes pour intercepter les appels)
function handleEventBanner(req, res) {
    try {
        if (req.method === 'POST') {
            const { message, url, icon, days, daysUntilExpiration } = req.body || {};
            if (!message || message.trim() === '') {
                return res.status(400).json({ error: 'Le message est requis' });
            }
            const durationDays = days ?? daysUntilExpiration ?? 7;
            const config = linksService.setEventBanner(
                { message: message.trim(), url: url || '', icon: icon || 'camera' },
                durationDays
            );
            const timeRemaining = linksService.getEventTimeRemaining(config.event);
            return res.json({ success: true, event: config.event, timeRemaining });
        }

        if (req.method === 'DELETE') {
            const config = linksService.clearEventBanner();
            return res.json({ success: true, event: config.event });
        }

        const config = linksService.loadLinksConfig();
        const event = config.event || { enabled: false };
        const isActive = linksService.isEventActive(event);
        const timeRemaining = linksService.getEventTimeRemaining(event);
        return res.json({ event, isActive, timeRemaining });
    } catch (error) {
        console.error('Erreur bandeau événement:', error);
        return res.status(500).json({ error: 'Erreur bandeau événement' });
    }
}

// Routes spécifiques pour l'API événement (AVANT les routers pour priorité)
app.all(['/api/links/event', '/api/links/event/', '/admin/api/links/event', '/admin/api/links/event/'], requireAdminSession, handleEventBanner);

// Configuration des routes
app.use('/', pagesRouter);
app.use('/admin', adminRouter);
app.use('/', photosRouter);
// Route pour le proxy de redimensionnement d'images
app.use('/photos', imageResizeRouter);
app.use('/', contentRouter);
app.use('/', statsRouter);
app.use('/api', signedImagesRouter);

// SEO: Page 404 HTML propre au lieu de JSON
app.use((req, res) => {
    res.status(404).sendFile(path.join(paths.pages, '404.html'));
});

// Gestion des erreurs globales
app.use((err, req, res, next) => {
    console.error('Erreur serveur:', err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
});

// Démarrage du serveur
app.listen(PORT, () => {
    console.log(`🚀 Serveur en ligne sur http://localhost:${PORT}`);
    console.log('📁 Structure modulaire chargée:');
    console.log('   ├── Configuration: server/config.js');
    console.log('   ├── Utilitaires: server/utils/');
    console.log('   ├── Middleware: server/middleware/');
    console.log('   ├── Routes: server/routes/');
    console.log('   └── Services: UserActivityLogger, PhotoClickTracker, CampaignManager');
});

module.exports = app;
