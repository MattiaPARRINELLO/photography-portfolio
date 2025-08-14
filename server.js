require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
const statsFile = path.join(__dirname, 'stats.json');
const configFile = path.join(__dirname, 'config.json');
const textsFile = path.join(__dirname, 'texts.json');
const multer = require('multer');
const sharp = require('sharp');
const session = require('express-session');

// Charger la configuration
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
    saveUninitialized: false,
    cookie: {
        secure: false, // Mettre à true en HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24h
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

// Sert les fichiers statiques
app.use(express.static(__dirname));
app.use(express.json());

// Routes pour les pages sans extension
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// Redirection pour /admin/ vers /admin
app.get('/admin/', (req, res) => {
    res.redirect('/admin');
});

app.get('/admin/text-editor', (req, res) => {
    res.sendFile(path.join(__dirname, 'text-editor.html'));
});

// Redirection pour /admin/text-editor/ vers /admin/text-editor
app.get('/admin/text-editor/', (req, res) => {
    res.redirect('/admin/text-editor');
});

app.get('/contact', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'contact.html'));
});

// Redirection pour /contact/ vers /contact
app.get('/contact/', (req, res) => {
    res.redirect('/contact');
});

app.get('/a-propos', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'about_me.html'));
});

// Redirection pour /a-propos/ vers /a-propos
app.get('/a-propos/', (req, res) => {
    res.redirect('/a-propos');
});

app.get('/portfolio', (req, res) => {
    res.redirect('/');
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
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

// Middleware de vérification de session admin
function requireAdminSession(req, res, next) {
    console.log('Vérification session admin:', req.session.isAdmin);
    if (!req.session.isAdmin) {
        console.log('Session non autorisée, retour de 401');
        return res.status(401).json({ error: 'Session non autorisée' });
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
app.get('/text-editor', (req, res) => {
    res.sendFile(path.join(__dirname, 'text-editor.html'));
});

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
