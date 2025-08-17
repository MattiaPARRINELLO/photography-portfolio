const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const sharp = require('sharp');
const exifr = require('exifr');
const serverConfig = require('../config');
const { requireAdminSession } = require('../middleware/auth');

const router = express.Router();
const paths = serverConfig.getPaths();
const config = serverConfig.getConfig();

// Configuration multer pour l'upload
const upload = multer({
    dest: paths.temp,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Seules les images sont autorisées'));
        }
    }
});

// Route pour lister les images du dossier photos, triées par date de prise de vue EXIF
router.get('/photos-list', async (req, res) => {
    fs.readdir(paths.photos, async (err, files) => {
        if (err) return res.status(500).json({ error: 'Impossible de lire le dossier photos' });

        const images = files.filter(f => f.match(/\.(jpg|jpeg|png|webp)$/i));
        const withDates = await Promise.all(images.map(async (f) => {
            try {
                const url = '/photos/' + f;
                const filename = f;
                const thumbnailUrl = `/photos/thumbnails/${f.replace(/\.[^.]+$/, '.jpg')}`;
                const filePath = path.join(paths.photos, f);
                const exifData = await exifr.parse(filePath);
                const date = exifData?.DateTimeOriginal || exifData?.DateTime || fs.statSync(filePath).mtime;
                return { url, filename: f, thumbnailUrl, date };
            } catch (error) {
                console.error('Erreur EXIF pour', f, ':', error.message);
                return null;
            }
        }));
        const filtered = withDates.filter(obj => obj?.filename && obj?.date);
        const sorted = filtered.sort((a, b) => b.date - a.date);
        res.json(sorted);
    });
});

// Route admin : lister toutes les photos avec métadonnées
router.get('/admin/photos', requireAdminSession, (req, res) => {
    fs.readdir(paths.photos, (err, files) => {
        if (err) return res.status(500).json({ error: 'Impossible de lire le dossier photos' });

        const images = files.filter(f => f.match(/\.(jpg|jpeg|png|webp)$/i));
        const photosWithInfo = images.map(filename => {
            const filePath = path.join(paths.photos, filename);
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
router.post('/admin/upload', requireAdminSession, upload.array('photos'), async (req, res) => {
    try {
        const uploadedFiles = [];
        const thumbsDir = path.join(paths.photos, 'thumbnails');
        
        // S'assurer que le dossier thumbnails existe
        if (!fs.existsSync(thumbsDir)) {
            fs.mkdirSync(thumbsDir, { recursive: true });
        }

        for (const file of req.files) {
            // Générer un nom de fichier unique
            const uniqueName = Date.now() + '_' + file.originalname;
            const finalPath = path.join(paths.photos, uniqueName);
            
            // Optimiser et sauvegarder l'image principale
            await sharp(file.path)
                .jpeg({ quality: 90 })
                .toFile(finalPath);

            // Créer la thumbnail
            const thumbName = uniqueName.replace(/\.[^.]+$/, '.jpg');
            const thumbPath = path.join(thumbsDir, thumbName);
            
            await sharp(file.path)
                .resize(config.thumbnails.width, config.thumbnails.height, {
                    fit: config.thumbnails.fit,
                    withoutEnlargement: config.thumbnails.withoutEnlargement
                })
                .jpeg({ quality: config.thumbnails.quality })
                .toFile(thumbPath);

            // Supprimer le fichier temporaire
            fs.unlinkSync(file.path);

            uploadedFiles.push({
                filename: uniqueName,
                originalName: file.originalname,
                size: fs.statSync(finalPath).size
            });
        }

        res.json({
            success: true,
            message: `${uploadedFiles.length} photo(s) uploadée(s) avec succès`,
            files: uploadedFiles
        });
    } catch (error) {
        console.error('Erreur lors de l\'upload:', error);
        res.status(500).json({ error: 'Erreur lors de l\'upload: ' + error.message });
    }
});

// Route admin : supprimer une photo
router.delete('/admin/photos/:filename', requireAdminSession, (req, res) => {
    try {
        const filename = req.params.filename;
        const photoPath = path.join(paths.photos, filename);
        const thumbName = filename.replace(/\.[^.]+$/, '.jpg');
        const thumbnailPath = path.join(paths.photos, 'thumbnails', thumbName);

        // Vérifier que la photo existe
        if (!fs.existsSync(photoPath)) {
            return res.status(404).json({ error: 'Photo non trouvée' });
        }

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

module.exports = router;
