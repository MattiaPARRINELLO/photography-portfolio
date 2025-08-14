require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
const PORT = 3000;
const statsFile = path.join(__dirname, 'stats.json');

// Sert les fichiers statiques
app.use(express.static(__dirname));
app.use(express.json());

// Route pour lister les images du dossier photos
app.get('/photos-list', (req, res) => {
    const photosDir = path.join(__dirname, 'photos');
    fs.readdir(photosDir, (err, files) => {
        if (err) return res.status(500).json({ error: 'Impossible de lire le dossier photos' });
        const images = files.filter(f => f.match(/\.(jpg|jpeg|png|webp)$/i));
        res.json(images);
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
    } catch (e) { }
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
        res.status(500).json({ error: 'Erreur lecture stats' });
    }
});

app.listen(PORT, () => {
    console.log(`Serveur en ligne sur http://localhost:${PORT}`);
});
