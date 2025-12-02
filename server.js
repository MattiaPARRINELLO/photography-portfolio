require('dotenv').config();
const express = require('express');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const path = require('path');

// Configuration du serveur
const serverConfig = require('./server/config');

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
app.use(express.static(paths.root, {
    index: false, // Désactiver l'index automatique
    setHeaders: (res, path) => {
        // Bloquer l'accès au dossier admin/ en statique
        if (path.includes('/admin/')) {
            res.setHeader('Cache-Control', 'no-store');
        }
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

// Configuration des routes
app.use('/', pagesRouter);
app.use('/admin', adminRouter);
app.use('/', photosRouter);
// Route pour le proxy de redimensionnement d'images
app.use('/photos', imageResizeRouter);
app.use('/', contentRouter);
app.use('/', statsRouter);

// Gestion des erreurs 404
app.use((req, res) => {
    res.status(404).json({ error: 'Page non trouvée' });
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
