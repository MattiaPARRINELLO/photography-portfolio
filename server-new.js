require('dotenv').config();
const express = require('express');
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

// Fonction pour créer les routes de campagnes avec accès au campaignManager
function createCampaignRoutes() {
    const router = express.Router();

    // Route admin API : créer une nouvelle campagne
    router.post('/admin/api/campaigns', (req, res) => {
        // Vérifier la session d'abord
        if (!req.session.isAdmin) {
            return res.status(401).json({ error: 'Session non autorisée' });
        }

        try {
            const { id, name, source, medium, description } = req.body;

            // Validation
            if (!id || !name || !source) {
                return res.status(400).json({ error: 'ID, nom et source sont requis' });
            }

            // Vérifier que l'ID n'existe pas déjà
            if (campaignManager.campaignExists(id)) {
                return res.status(400).json({ error: 'Cet ID de campagne existe déjà' });
            }

            const campaign = campaignManager.createCampaign({
                id, name, source, medium, description
            });

            res.json({ success: true, campaign });
        } catch (error) {
            console.error('❌ Erreur lors de la création de la campagne:', error);
            res.status(500).json({ error: 'Erreur lors de la création de la campagne' });
        }
    });

    // Route admin API : obtenir toutes les campagnes avec leurs stats
    router.get('/admin/api/campaigns', (req, res) => {
        // Vérifier la session d'abord
        if (!req.session.isAdmin) {
            return res.status(401).json({ error: 'Session non autorisée' });
        }

        try {
            const campaigns = campaignManager.getAllCampaigns();
            const stats = campaignManager.getCampaignStats();
            res.json({ campaigns, stats });
        } catch (error) {
            console.error('❌ Erreur lors de la récupération des campagnes:', error);
            res.status(500).json({ error: 'Erreur lors de la récupération des campagnes' });
        }
    });

    // Route admin API : supprimer une campagne
    router.delete('/admin/api/campaigns/:id', (req, res) => {
        // Vérifier la session d'abord
        if (!req.session.isAdmin) {
            return res.status(401).json({ error: 'Session non autorisée' });
        }

        try {
            const campaignId = req.params.id;
            const success = campaignManager.deleteCampaign(campaignId);

            if (success) {
                res.json({ success: true });
            } else {
                res.status(404).json({ error: 'Campagne non trouvée' });
            }
        } catch (error) {
            console.error('❌ Erreur lors de la suppression de la campagne:', error);
            res.status(500).json({ error: 'Erreur lors de la suppression de la campagne' });
        }
    });

    return router;
}

// Configuration des routes
app.use('/', pagesRouter);
app.use('/admin', adminRouter);
app.use('/', photosRouter);
app.use('/', contentRouter);
app.use('/', statsRouter);
app.use('/', createCampaignRoutes());

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
