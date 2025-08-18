require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const statsFile = path.join(__dirname, 'stats.json');
const configFile = path.join(__dirname, 'config', 'config.json');
const textsFile = path.join(__dirname, 'config', 'texts.json');
const multer = require('multer');
const sharp = require('sharp');
const session = require('express-session');

// Importer le système de logging
const UserActivityLogger = require('./scripts/UserActivityLogger');
const PhotoClickTracker = require('./scripts/PhotoClickTracker');
const CampaignManager = require('./scripts/CampaignManager');

const userLogger = new UserActivityLogger();
const photoClickTracker = new PhotoClickTracker();
const campaignManager = new CampaignManager();

// Cache des associations utilisateur-campagne (expire automatiquement après 24h)
const userCampaignCache = new Map();

// Fonction pour nettoyer le cache des campagnes expirées
function cleanExpiredCampaigns() {
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;
    
    for (const [userId, campaignData] of userCampaignCache.entries()) {
        if (now - new Date(campaignData.timestamp).getTime() > twentyFourHours) {
            userCampaignCache.delete(userId);
            console.log(`🧹 Cache campagne expiré pour utilisateur: ${userId}`);
        }
    }
}

// Nettoyer le cache des campagnes expirées toutes les heures
setInterval(cleanExpiredCampaigns, 60 * 60 * 1000);

// Fonction pour associer un utilisateur à une campagne
function associateUserToCampaign(userId, campaignInfo) {
    if (userId && campaignInfo) {
        userCampaignCache.set(userId, campaignInfo);
        console.log(`💾 Association utilisateur-campagne sauvée: ${userId} -> ${campaignInfo.campaignName}`);
    }
}

// Fonction pour récupérer les infos de campagne d'un utilisateur
function getUserCampaignInfo(userId) {
    return userCampaignCache.get(userId) || null;
}

// Démarrer le nettoyage automatique des logs (toutes les 24h, rétention 7 jours)
userLogger.startPeriodicCleanup(24, 7);

// Fonction pour lire les textes
function loadTexts() {
    try {
        if (fs.existsSync(textsFile)) {
            return JSON.parse(fs.readFileSync(textsFile, 'utf-8'));
        } else {
            // Si texts.json n'existe pas, le créer depuis texts.json.example
            const exampleFile = path.join(__dirname, 'config', 'texts.json.example');
            if (fs.existsSync(exampleFile)) {
                console.log('📋 texts.json introuvable, création depuis texts.json.example');
                const exampleContent = fs.readFileSync(exampleFile, 'utf-8');
                fs.writeFileSync(textsFile, exampleContent);
                return JSON.parse(exampleContent);
            }
        }
    } catch (error) {
        console.error('Erreur lors du chargement des textes:', error);
    }
    return {};
}

// Fonction pour injecter les meta tags dans une page HTML
function injectMetaTags(htmlContent, texts, req, pageType = '', campaignInfo = null) {
    console.log(`🔍 Injection meta tags pour la page: ${pageType || 'Accueil'}`);

    if (!texts.meta) {
        console.log('❌ Aucune section meta trouvée dans texts.json');
        return htmlContent;
    }

    console.log('✅ Section meta trouvée, injection en cours...');
    let injectedHtml = htmlContent;

    // Remplacer les placeholders par les vraies valeurs
    const title = texts.meta.title + (pageType ? ' - ' + pageType : '');
    const description = texts.meta.description || 'Portfolio photographique';

    // Remplacement des placeholders
    injectedHtml = injectedHtml.replace('{{DYNAMIC_TITLE}}', title);
    injectedHtml = injectedHtml.replace('{{DYNAMIC_DESCRIPTION}}', description);

    console.log(`📝 Title injecté: "${title}"`);
    console.log(`� Description injectée: "${description}"`);

    // Construire les meta tags supplémentaires
    const metaPlaceholderEnd = '    <!-- META_PLACEHOLDER_END -->';
    let additionalMetas = '';

    if (texts.meta.keywords) {
        additionalMetas += `    <meta name="keywords" content="${texts.meta.keywords}">\n`;
        console.log(`🏷️ Meta keywords ajoutés: "${texts.meta.keywords}"`);
    }

    if (texts.meta.author) {
        additionalMetas += `    <meta name="author" content="${texts.meta.author}">\n`;
        console.log(`👤 Meta author ajouté: "${texts.meta.author}"`);
    }

    // Open Graph tags
    if (texts.meta.og_title) {
        additionalMetas += `    <meta property="og:title" content="${texts.meta.og_title}${pageType ? ' - ' + pageType : ''}">\n`;
        console.log(`📱 Open Graph title ajouté: "${texts.meta.og_title}${pageType ? ' - ' + pageType : ''}"`);
    }

    if (texts.meta.og_description) {
        additionalMetas += `    <meta property="og:description" content="${texts.meta.og_description}">\n`;
        console.log(`📱 Open Graph description ajoutée: "${texts.meta.og_description}"`);
    }

    // Récupérer les informations de protocole et host une seule fois
    const protocol = req.protocol || 'http';
    const host = req.get('host') || 'localhost';

    if (texts.meta.og_image) {
        const fullImageUrl = `${protocol}://${host}${texts.meta.og_image}`;
        additionalMetas += `    <meta property="og:image" content="${fullImageUrl}">\n`;
        console.log(`🖼️ Open Graph image ajoutée: "${fullImageUrl}"`);
    }

    additionalMetas += `    <meta property="og:type" content="website">\n`;
    const fullUrl = `${protocol}://${host}${req.originalUrl}`;
    additionalMetas += `    <meta property="og:url" content="${fullUrl}">\n`;
    console.log(`🌐 Open Graph type et URL ajoutés: "${fullUrl}"`);

    // Vérifier s'il y a des informations de campagne à injecter (priorité aux données directes)
    let campaignScript = '';
    const activeCampaignInfo = campaignInfo || (req.cookies.user_campaign_info ? JSON.parse(req.cookies.user_campaign_info) : null);
    
    if (activeCampaignInfo) {
        try {
            campaignScript = `
    <script>
        // Informations de campagne disponibles côté client
        window.campaignInfo = ${JSON.stringify(activeCampaignInfo)};
        console.log('🎯 Informations campagne injectées:', window.campaignInfo);
    </script>`;
            console.log(`🎯 Script campagne injecté:`, activeCampaignInfo);
        } catch (error) {
            console.log('⚠️ Erreur parsing campaign info:', error);
        }
    }

    // Injecter les meta tags supplémentaires et le script de campagne avant META_PLACEHOLDER_END
    if (additionalMetas || campaignScript) {
        injectedHtml = injectedHtml.replace(metaPlaceholderEnd, `${additionalMetas}${campaignScript}${metaPlaceholderEnd}`);
        console.log('✅ Meta tags supplémentaires injectés');
        if (campaignScript) {
            console.log('✅ Script campagne injecté');
        }
    }

    console.log(`🎯 Injection terminée pour la page: ${pageType || 'Accueil'}`);
    return injectedHtml;
}// Charger la configuration
let config;
try {
    config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
} catch (error) {
    console.error('Erreur lors du chargement de la configuration:', error);
    // Configuration par défaut
    config = {
        thumbnails: {
            width: 400,
            height: 400,
            quality: 85,
            fit: 'inside',
            withoutEnlargement: true,
            format: 'jpeg'
        }
    };
}

// Configuration des sessions
app.use(session({
    secret: 'votre-secret-session-super-securise', // À changer !
    resave: false,
    saveUninitialized: true, // Changé à true pour le développement
    cookie: {
        secure: false, // Mettre à true en HTTPS
        maxAge: 24 * 60 * 60 * 1000, // 24h
        httpOnly: true,
        sameSite: 'lax' // Ajouté pour la compatibilité
    }
}));

// Configuration multer pour l'upload
const upload = multer({
    dest: 'temp/',
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Seules les images sont autorisées'));
        }
    }
});

// Sert les fichiers statiques, mais exclut le dossier /admin pour éviter les conflits
app.use(express.static(__dirname, {
    index: false, // Désactiver l'index automatique
    setHeaders: (res, path) => {
        // Bloquer l'accès au dossier admin/ en statique
        if (path.includes('/admin/')) {
            res.setHeader('Cache-Control', 'no-store');
        }
    }
}));
app.use(express.json());
app.use(cookieParser());

// Middleware de logging pour toutes les requêtes
app.use((req, res, next) => {
    // Générer un userId à partir du cookie seulement pour les requêtes de pages HTML
    // Pas pour les requêtes AJAX ou d'assets
    const isPageRequest = req.method === 'GET' &&
        !req.url.includes('/api/') &&
        !req.url.includes('/admin/') &&
        !req.url.includes('/dist/') &&
        !req.url.includes('.js') &&
        !req.url.includes('.css') &&
        !req.url.includes('.jpg') &&
        !req.url.includes('.png') &&
        !req.url.includes('.svg');

    let userId = req.cookies.user_tracking_id;

    if (!userId && isPageRequest) {
        userId = 'user_' + Date.now().toString(36) + Math.random().toString(36).substr(2);
        res.cookie('user_tracking_id', userId, {
            maxAge: 365 * 24 * 60 * 60 * 1000, // 1 an
            httpOnly: false, // Permettre l'accès côté client
            path: '/' // Disponible sur tout le site
        });
        console.log(`🆕 Nouvel utilisateur créé: ${userId}`);
    } else if (userId && isPageRequest) {
        console.log(`👤 Utilisateur existant: ${userId}`);
    }

    // Ajouter l'userId à la requête pour usage ultérieur
    req.userId = userId;

    // Logger seulement les requêtes vers les pages principales du portfolio
    const allowedPages = ['/', '/a-propos', '/contact'];
    const isAllowedPage = allowedPages.includes(req.url.split('?')[0]); // Ignorer les query parameters

    if (isAllowedPage && userId) {
        // Récupérer les informations de campagne depuis le cache ou le cookie
        let campaignInfo = getUserCampaignInfo(userId);
        
        if (!campaignInfo && req.cookies.user_campaign_info) {
            try {
                campaignInfo = JSON.parse(req.cookies.user_campaign_info);
                // Sauvegarder dans le cache pour les prochaines requêtes
                associateUserToCampaign(userId, campaignInfo);
            } catch (e) {
                console.log('⚠️ Erreur parsing campaign info dans HTTP request:', e.message);
            }
        }
        
        // Construire les détails du log
        const logDetails = {
            ip: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent'),
            url: req.originalUrl,
            method: req.method,
            extraData: {
                referer: req.get('Referer'),
                host: req.get('Host')
            }
        };
        
        // Ajouter les informations de campagne si disponibles
        if (campaignInfo) {
            logDetails.campaignInfo = {
                campaignId: campaignInfo.campaignId,
                campaignName: campaignInfo.campaignName,
                source: campaignInfo.source,
                medium: campaignInfo.medium,
                campaignTimestamp: campaignInfo.timestamp
            };
            console.log(`🎯 Log HTTP avec campagne: ${req.method} ${req.url} - ${campaignInfo.campaignName} (${campaignInfo.campaignId})`);
        }
        
        userLogger.log(userId, 'http_request', logDetails);
    }

    next();
});

// Routes pour les pages sans extension
app.get('/admin', (req, res) => {
    // Headers pour éviter le cache en développement
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');

    const filePath = path.join(__dirname, 'pages', 'admin', 'admin.html');
    console.log('🔍 Serveur admin: Fichier servi depuis:', filePath);
    console.log('🔍 Fichier existe?', fs.existsSync(filePath));

    res.sendFile(filePath);
});

// Redirection pour /admin/ vers /admin
app.get('/admin/', (req, res) => {
    res.redirect('/admin');
});

app.get('/admin/text-editor', (req, res) => {
    res.sendFile(path.join(__dirname, 'pages', 'admin', 'text-editor.html'));
});

// Redirection pour /admin/text-editor/ vers /admin/text-editor
app.get('/admin/text-editor/', (req, res) => {
    res.redirect('/admin/text-editor');
});

app.get('/contact', (req, res) => {
    console.log('🚀 Route /contact appelée');
    try {
        const texts = loadTexts();
        console.log('📖 Textes chargés pour /contact');
        const htmlPath = path.join(__dirname, 'pages', 'contact.html');
        let htmlContent = fs.readFileSync(htmlPath, 'utf-8');
        htmlContent = injectMetaTags(htmlContent, texts, req, 'Contact');
        res.send(htmlContent);
    } catch (error) {
        console.error('❌ Erreur lors du chargement de contact.html:', error);
        res.sendFile(path.join(__dirname, 'pages', 'contact.html'));
    }
});

// Redirection pour /contact/ vers /contact
app.get('/contact/', (req, res) => {
    res.redirect('/contact');
});

app.get('/a-propos', (req, res) => {
    console.log('🚀 Route /a-propos appelée');
    try {
        const texts = loadTexts();
        console.log('📖 Textes chargés pour /a-propos');
        const htmlPath = path.join(__dirname, 'pages', 'about_me.html');
        let htmlContent = fs.readFileSync(htmlPath, 'utf-8');
        htmlContent = injectMetaTags(htmlContent, texts, req, 'À propos');
        res.send(htmlContent);
    } catch (error) {
        console.error('❌ Erreur lors du chargement de about_me.html:', error);
        res.sendFile(path.join(__dirname, 'pages', 'about_me.html'));
    }
});

// Redirection pour /a-propos/ vers /a-propos
app.get('/a-propos/', (req, res) => {
    res.redirect('/a-propos');
});

app.get('/portfolio', (req, res) => {
    res.redirect('/');
});

app.get('/', (req, res) => {
    console.log('🚀 Route / (accueil) appelée - DEBUG SPÉCIAL');
    console.log('📍 URL demandée:', req.url);
    console.log('📍 Original URL:', req.originalUrl);

    // Détecter les paramètres de campagne
    const campaignRef = req.query.ref;
    let campaignInfo = null;
    
    if (campaignRef) {
        console.log('🎯 Détection campagne:', campaignRef);

        // Enregistrer la visite de campagne (même si inconnue)
        const campaign = campaignManager.recordCampaignVisit(
            campaignRef,
            req.get('User-Agent'),
            req.ip
        );

        // Préparer les informations de campagne (même pour les campagnes inconnues)
        campaignInfo = {
            campaignId: campaignRef,
            campaignName: campaign ? campaign.name : campaignRef,
            source: campaign ? campaign.source : 'unknown',
            medium: campaign ? campaign.medium : 'unknown', 
            timestamp: new Date().toISOString()
        };

        if (campaign) {
            console.log('📊 Visite campagne enregistrée:', campaign.name);
        } else {
            console.log('⚠️ Campagne inconnue, mais association maintenue:', campaignRef);
        }

        // Stocker les informations de campagne dans la session/cookie pour cet utilisateur
        const userId = req.userId;
        if (userId) {
            // Associer l'utilisateur à la campagne dans le cache (même si inconnue)
            associateUserToCampaign(userId, campaignInfo);
            
            // Stocker les infos de campagne dans un cookie pour les futures requêtes
            res.cookie('user_campaign_info', JSON.stringify(campaignInfo), {
                maxAge: 24 * 60 * 60 * 1000, // 24h
                httpOnly: false,
                path: '/'
            });

            // Logger l'activité utilisateur avec la campagne
            userLogger.log(userId, 'campaign_visit', {
                campaign: campaignRef,
                campaignName: campaignInfo.campaignName,
                source: campaignInfo.source,
                medium: campaignInfo.medium
            });
        }
    }

    try {
        const texts = loadTexts();
        console.log('📖 Textes chargés pour la page d\'accueil');
        const htmlPath = path.join(__dirname, 'pages', 'home.html');
        let htmlContent = fs.readFileSync(htmlPath, 'utf-8');
        console.log('📄 HTML lu, taille:', htmlContent.length, 'caractères');
        
        // Injecter les meta tags ET les informations de campagne
        htmlContent = injectMetaTags(htmlContent, texts, req, 'Portfolio', campaignInfo);
        
        // Si on a une campagne, ajouter un script pour nettoyer l'URL côté client
        if (campaignRef) {
            const urlCleanScript = `
    <script>
        // Nettoyer l'URL côté client après chargement de la page
        if (window.location.search.includes('ref=')) {
            console.log('🔄 Nettoyage URL côté client');
            history.replaceState(null, null, window.location.pathname);
        }
    </script>`;
            htmlContent = htmlContent.replace('</body>', `${urlCleanScript}</body>`);
            console.log('🔄 Script de nettoyage URL ajouté');
        }
        
        res.send(htmlContent);
    } catch (error) {
        console.error('❌ Erreur lors du chargement de home.html:', error);
        res.sendFile(path.join(__dirname, 'pages', 'home.html'));
    }
});

// Route pour servir texts.json publiquement
app.get('/texts.json', (req, res) => {
    try {
        let texts = {};
        if (fs.existsSync(textsFile)) {
            texts = JSON.parse(fs.readFileSync(textsFile, 'utf-8'));
        }
        res.json(texts);
    } catch (error) {
        console.error('Erreur lors de la lecture de texts.json:', error);
        res.status(500).json({ error: 'Erreur lors de la lecture des textes' });
    }
});

// Route pour lister les images du dossier photos, triées par date de prise de vue EXIF
const exifr = require('exifr');
app.get('/photos-list', async (req, res) => {
    const photosDir = path.join(__dirname, 'photos');
    fs.readdir(photosDir, async (err, files) => {
        if (err) return res.status(500).json({ error: 'Impossible de lire le dossier photos' });
        const images = files.filter(f => f.match(/\.(jpg|jpeg|png|webp)$/i));
        // Pour chaque image, on lit la date EXIF (ou mtime en fallback)
        const withDates = await Promise.all(images.map(async (f) => {
            const filePath = path.join(photosDir, f);
            let date = null;
            try {
                const exif = await exifr.parse(filePath, ['DateTimeOriginal']);
                if (exif?.DateTimeOriginal) {
                    date = new Date(exif.DateTimeOriginal).getTime();
                }
            } catch (e) { }
            if (!date) {
                try {
                    date = fs.statSync(filePath).mtime.getTime();
                } catch (e) {
                    return null;
                }
            }
            if (!date) return null;
            // Construction des URLs pour l'image et la miniature
            const url = `/photos/${f}`;
            const thumbnailUrl = `/photos/thumbnails/${f}`;
            return { url, filename: f, thumbnailUrl, date };
        }));
        const filtered = withDates.filter(obj => obj && obj.filename && obj.date);
        const sorted = filtered.sort((a, b) => b.date - a.date);
        res.json(sorted);
    });
});

app.post('/send-mail', async (req, res) => {
    const { email, subject, message } = req.body;
    if (!email || !subject || !message) {
        return res.status(400).json({ error: 'Champs manquants' });
    }
    try {
        let transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.GMAIL_USER,
                pass: process.env.GMAIL_PASS
            }
        });
        await transporter.sendMail({
            from: process.env.GMAIL_USER,
            to: process.env.GMAIL_USER,
            replyTo: email,
            subject: `[Portfolio] ${subject}`,
            text: `De: ${email}\n\n${message}`
        });
        res.status(200).json({ success: true });
    } catch (err) {
        console.error('Erreur lors de l\'envoi du mail:', err);
        res.status(500).json({ error: 'Erreur lors de l\'envoi du mail' });
    }
});

// Endpoint pour enregistrer une visite
app.post('/track', (req, res) => {
    const page = req.body.page || 'inconnue';
    const now = new Date().toISOString();
    let stats = { visits: 0, pages: {} };
    try {
        if (fs.existsSync(statsFile)) {
            stats = JSON.parse(fs.readFileSync(statsFile, 'utf-8'));
        }
    } catch (e) {
        console.error('Erreur lors de la lecture du fichier stats:', e);
    }
    stats.visits++;
    if (!stats.pages[page]) stats.pages[page] = { count: 0, last: null };
    stats.pages[page].count++;
    stats.pages[page].last = now;
    fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2));
    res.json({ success: true });
});

// Endpoint pour consulter les stats
app.get('/stats', (req, res) => {
    try {
        const stats = fs.existsSync(statsFile) ? JSON.parse(fs.readFileSync(statsFile, 'utf-8')) : { visits: 0, pages: {} };
        res.json(stats);
    } catch (e) {
        console.error('Erreur lors de la lecture des stats:', e);
        res.status(500).json({ error: 'Erreur lecture stats' });
    }
});

app.listen(PORT, () => {
    console.log(`Serveur en ligne sur http://localhost:${PORT}`);
});

// Middleware de vérification du mot de passe admin
function checkAdminPassword(req, res, next) {
    const password = req.headers['x-admin-password'];
    if (password !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Accès non autorisé' });
    }
    next();
}

// Middleware de vérification de session admin (pour les API)
function requireAdminSession(req, res, next) {
    console.log('Vérification session admin:', req.session.isAdmin);
    if (!req.session.isAdmin) {
        console.log('Session non autorisée, retour de 401');
        return res.status(401).json({ error: 'Session non autorisée' });
    }
    next();
}

// Middleware de vérification de session admin (pour les pages HTML)
function requireAdminPage(req, res, next) {
    console.log('Vérification session admin (page):', req.session.isAdmin);
    if (!req.session.isAdmin) {
        console.log('Session non autorisée, redirection vers /admin');
        return res.redirect('/admin');
    }
    next();
}

// Route pour vérifier le statut de la session
app.get('/admin/session-status', (req, res) => {
    res.json({ isLoggedIn: !!req.session.isAdmin });
});

// Route de connexion admin
app.post('/admin/login', (req, res) => {
    const { password } = req.body;
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

    if (password === ADMIN_PASSWORD) {
        req.session.isAdmin = true;
        res.json({ success: true, message: 'Connexion réussie' });
    } else {
        res.status(401).json({ error: 'Mot de passe incorrect' });
    }
});

// Route de déconnexion admin
app.post('/admin/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Erreur lors de la déconnexion' });
        }
        res.json({ success: true, message: 'Déconnexion réussie' });
    });
});

// Route pour vérifier le statut de connexion
app.get('/admin/status', (req, res) => {
    res.json({ isLoggedIn: !!req.session.isAdmin });
});

// Route admin : lister toutes les photos avec métadonnées
app.get('/admin/photos', requireAdminSession, (req, res) => {
    const photosDir = path.join(__dirname, 'photos');
    fs.readdir(photosDir, (err, files) => {
        if (err) return res.status(500).json({ error: 'Impossible de lire le dossier photos' });

        const images = files.filter(f => f.match(/\.(jpg|jpeg|png|webp)$/i));
        const photosWithInfo = images.map(filename => {
            const filePath = path.join(photosDir, filename);
            const stats = fs.statSync(filePath);
            return {
                filename,
                size: stats.size,
                mtime: stats.mtime
            };
        });

        res.json(photosWithInfo.sort((a, b) => b.mtime - a.mtime));
    });
});

// Route admin : upload de photos avec génération automatique de thumbnails
app.post('/admin/upload', requireAdminSession, upload.array('photos'), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'Aucun fichier reçu' });
        }

        const photosDir = path.join(__dirname, 'photos');
        const thumbnailsDir = path.join(__dirname, 'photos', 'thumbnails');

        // Créer les dossiers s'ils n'existent pas
        if (!fs.existsSync(photosDir)) fs.mkdirSync(photosDir, { recursive: true });
        if (!fs.existsSync(thumbnailsDir)) fs.mkdirSync(thumbnailsDir, { recursive: true });

        for (const file of req.files) {
            const ext = path.extname(file.originalname).toLowerCase();
            const filename = Date.now() + '_' + file.originalname.replace(/[^a-zA-Z0-9._-]/g, '');

            const finalPath = path.join(photosDir, filename);
            const thumbnailPath = path.join(thumbnailsDir, filename);

            // Déplacer le fichier original
            fs.renameSync(file.path, finalPath);

            // Générer la thumbnail avec Sharp
            await sharp(finalPath)
                .resize(config.thumbnails.width, config.thumbnails.height, {
                    fit: config.thumbnails.fit,
                    withoutEnlargement: config.thumbnails.withoutEnlargement
                })
                .jpeg({ quality: config.thumbnails.quality })
                .toFile(thumbnailPath);
        }

        res.json({
            success: true,
            message: `${req.files.length} photo(s) uploadée(s) avec succès`
        });
    } catch (error) {
        console.error('Erreur lors de l\'upload:', error);
        res.status(500).json({ error: 'Erreur lors de l\'upload: ' + error.message });
    }
});

// Route admin : supprimer une photo et sa thumbnail
app.delete('/admin/delete', requireAdminSession, (req, res) => {
    const { filename } = req.body;
    if (!filename) {
        return res.status(400).json({ error: 'Nom de fichier manquant' });
    }

    const photoPath = path.join(__dirname, 'photos', filename);
    const thumbnailPath = path.join(__dirname, 'photos', 'thumbnails', filename);

    try {
        // Supprimer la photo principale
        if (fs.existsSync(photoPath)) {
            fs.unlinkSync(photoPath);
        }

        // Supprimer la thumbnail
        if (fs.existsSync(thumbnailPath)) {
            fs.unlinkSync(thumbnailPath);
        }

        res.json({ success: true, message: 'Photo supprimée avec succès' });
    } catch (error) {
        console.error('Erreur lors de la suppression:', error);
        res.status(500).json({ error: 'Erreur lors de la suppression: ' + error.message });
    }
});

// Route admin : récupérer la configuration
app.get('/admin/config', requireAdminSession, (req, res) => {
    try {
        const currentConfig = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
        res.json(currentConfig);
    } catch (error) {
        res.status(500).json({ error: 'Erreur lors de la lecture de la configuration' });
    }
});

// Route admin : mettre à jour la configuration
app.put('/admin/config', requireAdminSession, (req, res) => {
    try {
        const newConfig = req.body;
        fs.writeFileSync(configFile, JSON.stringify(newConfig, null, 2));

        // Recharger la configuration en mémoire
        config = newConfig;

        res.json({ success: true, message: 'Configuration mise à jour avec succès' });
    } catch (error) {
        console.error('Erreur lors de la sauvegarde de la configuration:', error);
        res.status(500).json({ error: 'Erreur lors de la sauvegarde: ' + error.message });
    }
});

// Route pour l'éditeur de textes
// Route admin : récupérer les textes
app.get('/admin/texts', requireAdminSession, (req, res) => {
    try {
        let texts = {};
        if (fs.existsSync(textsFile)) {
            texts = JSON.parse(fs.readFileSync(textsFile, 'utf-8'));
        }
        res.json(texts);
    } catch (error) {
        console.error('Erreur lors de la lecture des textes:', error);
        res.status(500).json({ error: 'Erreur lors de la lecture des textes: ' + error.message });
    }
});

// Route admin : sauvegarder les textes
app.post('/admin/texts', requireAdminSession, (req, res) => {
    console.log('Session admin lors de la sauvegarde:', req.session.isAdmin);
    try {
        const texts = req.body;
        fs.writeFileSync(textsFile, JSON.stringify(texts, null, 2));
        console.log('Textes sauvegardés avec succès');
        res.json({ success: true, message: 'Textes sauvegardés avec succès' });
    } catch (error) {
        console.error('Erreur lors de la sauvegarde des textes:', error);
        res.status(500).json({ error: 'Erreur lors de la sauvegarde: ' + error.message });
    }
});

// Route admin : récupérer un texte spécifique
app.get('/admin/texts/:key', requireAdminSession, (req, res) => {
    try {
        let texts = {};
        if (fs.existsSync(textsFile)) {
            texts = JSON.parse(fs.readFileSync(textsFile, 'utf-8'));
        }
        const key = req.params.key;
        res.json({ key, value: texts[key] || '' });
    } catch (error) {
        console.error('Erreur lors de la lecture du texte:', error);
        res.status(500).json({ error: 'Erreur lors de la lecture du texte: ' + error.message });
    }
});

// Route admin : mettre à jour un texte spécifique
app.put('/admin/texts/:key', requireAdminSession, (req, res) => {
    try {
        let texts = {};
        if (fs.existsSync(textsFile)) {
            texts = JSON.parse(fs.readFileSync(textsFile, 'utf-8'));
        }

        const key = req.params.key;
        const { value } = req.body;
        texts[key] = value;

        fs.writeFileSync(textsFile, JSON.stringify(texts, null, 2));
        res.json({ success: true, message: `Texte "${key}" mis à jour avec succès` });
    } catch (error) {
        console.error('Erreur lors de la mise à jour du texte:', error);
        res.status(500).json({ error: 'Erreur lors de la mise à jour: ' + error.message });
    }
});

// ===== ROUTES DE LOGGING =====

// Route pour recevoir les logs côté client
app.post('/log-action', (req, res) => {
    try {
        let { userId, action, timestamp, url, page, sessionDuration, timeSinceLastActivity, campaignInfo: clientCampaignInfo, ...otherDetails } = req.body;

        // Pour les requêtes AJAX, utiliser l'userId fourni par le client si disponible
        // et seulement utiliser celui du serveur comme fallback
        const finalUserId = userId || req.userId || req.cookies.user_tracking_id;

        if (userId && userId !== req.userId) {
            console.log(`� Client userId: ${userId}, Server userId: ${req.userId}`);
        }

        // Filtrer les actions selon les pages autorisées
        const allowedPages = ['/', '/a-propos', '/contact'];
        const isAllowedPage = page && allowedPages.includes(page);

        // Exclure les signaux de vie (heartbeat) des logs pour éviter l'encombrement
        const isHeartbeat = action === 'heartbeat';

        // Logger seulement si l'action vient d'une page autorisée ET n'est pas un heartbeat
        if (isAllowedPage && !isHeartbeat) {
            // Récupérer les informations de campagne en priorité : client, puis cache, puis cookie
            let campaignInfo = clientCampaignInfo;
            
            if (!campaignInfo) {
                // Essayer de récupérer depuis le cache
                campaignInfo = getUserCampaignInfo(finalUserId);
            }
            
            if (!campaignInfo && req.cookies.user_campaign_info) {
                try {
                    campaignInfo = JSON.parse(req.cookies.user_campaign_info);
                    // Mettre à jour le cache si on a trouvé des infos dans le cookie
                    if (finalUserId) {
                        associateUserToCampaign(finalUserId, campaignInfo);
                    }
                } catch (e) {
                    console.log('⚠️ Erreur parsing campaign info:', e.message);
                }
            }
            
            // Construire les détails du log avec les infos de campagne si disponibles
            const logDetails = {
                ip: req.ip || req.connection.remoteAddress,
                userAgent: req.get('User-Agent'),
                url: url,
                method: 'CLIENT_ACTION',
                extraData: {
                    page,
                    sessionDuration,
                    timeSinceLastActivity,
                    timestamp,
                    ...otherDetails
                }
            };
            
            // Ajouter les informations de campagne si disponibles
            if (campaignInfo) {
                logDetails.campaignInfo = {
                    campaignId: campaignInfo.campaignId,
                    campaignName: campaignInfo.campaignName,
                    source: campaignInfo.source,
                    medium: campaignInfo.medium,
                    campaignTimestamp: campaignInfo.timestamp
                };
                console.log(`🎯 Log avec campagne: ${action} - ${campaignInfo.campaignName} (${campaignInfo.campaignId})`);
            }
            
            userLogger.log(finalUserId, action, logDetails);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur lors du logging d\'action:', error);
        res.status(500).json({ error: 'Erreur lors du logging' });
    }
});

// Route pour enregistrer un clic sur une photo
app.post('/photo-click', (req, res) => {
    try {
        const { photoFilename, userId, ...additionalData } = req.body;

        if (!photoFilename) {
            return res.status(400).json({ error: 'Nom de photo manquant' });
        }

        // Ajouter les informations de la requête
        const clickData = {
            ip: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent'),
            referer: req.get('Referer'),
            timestamp: new Date().toISOString(),
            ...additionalData
        };

        const success = photoClickTracker.recordPhotoClick(photoFilename, userId, clickData);

        if (success) {
            res.json({ success: true, message: 'Clic photo enregistré' });
        } else {
            res.status(500).json({ error: 'Erreur lors de l\'enregistrement du clic' });
        }
    } catch (error) {
        console.error('❌ Erreur lors de l\'enregistrement du clic photo:', error);
        res.status(500).json({ error: 'Erreur lors de l\'enregistrement du clic' });
    }
});

// Route admin : récupérer les statistiques des photos
app.get('/admin/photo-stats', requireAdminSession, (req, res) => {
    try {
        const stats = photoClickTracker.getAllPhotoStats();
        res.json(stats);
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des stats photos:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération des statistiques photos' });
    }
});

// Route admin : récupérer le top des photos (avec limite optionnelle)
app.get('/admin/photo-stats/top/:limit', requireAdminSession, (req, res) => {
    try {
        const limit = parseInt(req.params.limit) || 10;
        const topPhotos = photoClickTracker.getTopPhotos(limit);
        res.json({ topPhotos });
    } catch (error) {
        console.error('❌ Erreur lors de la récupération du top photos:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération du top photos' });
    }
});

// Route admin : récupérer le top des photos (par défaut 10)
app.get('/admin/photo-stats/top', requireAdminSession, (req, res) => {
    try {
        const topPhotos = photoClickTracker.getTopPhotos(10);
        res.json({ topPhotos });
    } catch (error) {
        console.error('❌ Erreur lors de la récupération du top photos:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération du top photos' });
    }
});

// Route admin : réinitialiser les statistiques photos
app.post('/admin/photo-stats/reset', requireAdminSession, (req, res) => {
    try {
        const success = photoClickTracker.resetStats();
        if (success) {
            res.json({ success: true, message: 'Statistiques photos réinitialisées' });
        } else {
            res.status(500).json({ error: 'Erreur lors de la réinitialisation' });
        }
    } catch (error) {
        console.error('❌ Erreur lors de la réinitialisation des stats photos:', error);
        res.status(500).json({ error: 'Erreur lors de la réinitialisation des statistiques' });
    }
});

// =================== ROUTES CAMPAGNES ===================

// Route admin API : créer une nouvelle campagne
app.post('/admin/api/campaigns', requireAdminSession, (req, res) => {
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

// Route admin : page de gestion des campagnes
app.get('/admin/campaigns', requireAdminPage, (req, res) => {
    console.log('🎯 Route campaigns appelée - session:', req.session.isAdmin);
    res.sendFile(path.join(__dirname, 'pages', 'admin', 'campaigns.html'));
});

// Route admin API : obtenir toutes les campagnes avec leurs stats
app.get('/admin/api/campaigns', requireAdminSession, (req, res) => {
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
app.delete('/admin/api/campaigns/:id', requireAdminSession, (req, res) => {
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

// Route admin : page des logs (pas de vérification de session ici, fait côté client)
app.get('/admin/logs', (req, res) => {
    res.sendFile(path.join(__dirname, 'pages', 'admin', 'logs.html'));
});

// Route admin : récupérer les logs d'une date
app.get('/admin/logs/:date', requireAdminSession, (req, res) => {
    try {
        const date = new Date(req.params.date);
        const logs = userLogger.getLogsForDate(date);
        res.json(logs);
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des logs:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération des logs' });
    }
});

// Route admin : récupérer les dates disponibles
app.get('/admin/logs-dates', requireAdminSession, (req, res) => {
    try {
        const dates = userLogger.getAvailableDates();
        res.json(dates);
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des dates:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération des dates' });
    }
});

// Route admin : récupérer les statistiques des utilisateurs pour une date
app.get('/admin/logs-stats/:date', requireAdminSession, (req, res) => {
    try {
        const date = new Date(req.params.date);
        const stats = userLogger.getUserStats(date);
        const topActions = userLogger.getTopActions(date);
        const trafficSources = userLogger.getTrafficSources(date);

        res.json({
            userStats: stats,
            topActions: topActions,
            trafficSources: trafficSources,
            date: req.params.date
        });
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des stats:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération des statistiques' });
    }
});

// Route admin : nettoyage manuel des logs
app.post('/admin/logs/cleanup', requireAdminSession, (req, res) => {
    try {
        const { maxDays = 7 } = req.body;
        userLogger.cleanOldLogs(maxDays);
        res.json({
            success: true,
            message: `Nettoyage effectué avec succès (rétention: ${maxDays} jours)`
        });
    } catch (error) {
        console.error('❌ Erreur lors du nettoyage manuel:', error);
        res.status(500).json({ error: 'Erreur lors du nettoyage des logs' });
    }
});

// ===== FIN ROUTES DE LOGGING =====
