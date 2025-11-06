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

// Fonction pour extraire la date du nom de fichier
function extractDateFromFilename(filename) {
    // Pattern pour YYYYMMDD_HHMMSS_
    const pattern1 = /^(\d{8})_(\d{6})_/;
    const match1 = filename.match(pattern1);
    if (match1) {
        const dateStr = match1[1]; // YYYYMMDD
        const timeStr = match1[2]; // HHMMSS
        const year = dateStr.substring(0, 4);
        const month = dateStr.substring(4, 6);
        const day = dateStr.substring(6, 8);
        const hour = timeStr.substring(0, 2);
        const minute = timeStr.substring(2, 4);
        const second = timeStr.substring(4, 6);

        return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
    }

    // Pattern pour YYYYMMDD_HHMMSS
    const pattern2 = /(\d{8})_(\d{6})/;
    const match2 = filename.match(pattern2);
    if (match2) {
        const dateStr = match2[1];
        const timeStr = match2[2];
        const year = dateStr.substring(0, 4);
        const month = dateStr.substring(4, 6);
        const day = dateStr.substring(6, 8);
        const hour = timeStr.substring(0, 2);
        const minute = timeStr.substring(2, 4);
        const second = timeStr.substring(4, 6);

        return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
    }

    // Pattern pour IMG_XXXX avec timestamp au début
    const pattern3 = /^(\d{13})_/;
    const match3 = filename.match(pattern3);
    if (match3) {
        return new Date(parseInt(match3[1]));
    }

    return null;
}

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
                const thumbnailUrl = `/photos/thumbnails/${f.replace(/\.[^.]+$/, '.webp')}`;
                const filePath = path.join(paths.photos, f);

                // Essayer de lire les métadonnées EXIF
                let date = null;
                let dateSource = 'file'; // Indiquer d'où vient la date

                try {
                    const exifData = await exifr.parse(filePath);
                    if (exifData?.DateTimeOriginal) {
                        date = new Date(exifData.DateTimeOriginal);
                        dateSource = 'exif_original';
                    } else if (exifData?.DateTime) {
                        date = new Date(exifData.DateTime);
                        dateSource = 'exif_datetime';
                    }
                } catch (exifError) {
                    console.log(`⚠️ Pas de données EXIF pour ${f}:`, exifError.message);
                }

                // Si pas de date EXIF, essayer d'extraire du nom de fichier
                if (!date) {
                    const dateFromFilename = extractDateFromFilename(f);
                    if (dateFromFilename) {
                        date = dateFromFilename;
                        dateSource = 'filename';
                    }
                }

                // En dernier recours, utiliser la date de modification du fichier
                if (!date) {
                    date = fs.statSync(filePath).mtime;
                    dateSource = 'file_mtime';
                }

                console.log(`📅 ${f}: ${date.toISOString()} (source: ${dateSource})`);

                return { url, filename: f, thumbnailUrl, date, dateSource };
            } catch (error) {
                console.error('Erreur traitement photo', f, ':', error.message);
                return null;
            }
        }));
        const filtered = withDates.filter(obj => obj?.filename && obj?.date);

        // Trier par date numérique (EXIF si présent), mais inverser l'ordre: plus récent -> plus ancien.
        // Les éléments sans date restent en fin; en cas d'égalité, fallback sur filename pour stabilité.
        filtered.sort((a, b) => {
            const ta = (a && a.date) ? new Date(a.date).getTime() : NaN;
            const tb = (b && b.date) ? new Date(b.date).getTime() : NaN;

            // Mettre les éléments sans date à la fin
            if (isNaN(ta) && !isNaN(tb)) return 1;
            if (!isNaN(ta) && isNaN(tb)) return -1;
            if (isNaN(ta) && isNaN(tb)) return (a.filename || '').localeCompare(b.filename || '');

            // Inverser l'ordre pour avoir du plus récent au plus ancien
            if (ta !== tb) return tb - ta;

            // si mêmes timestamp, fallback sur le nom de fichier pour stabilité
            return (a.filename || '').localeCompare(b.filename || '');
        });
        res.json(filtered);
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
            // Lire les métadonnées EXIF avant traitement
            let originalExifData = null;
            let originalDate = null;

            try {
                originalExifData = await exifr.parse(file.path);
                originalDate = originalExifData?.DateTimeOriginal || originalExifData?.DateTime;
                console.log(`📅 Date EXIF trouvée pour ${file.originalname}:`, originalDate);
            } catch (error) {
                console.log(`⚠️ Impossible de lire EXIF pour ${file.originalname}:`, error.message);
            }

            // Générer un nom basé sur la date EXIF si disponible, sinon timestamp actuel
            let uniqueName;
            if (originalDate) {
                // Format: YYYYMMDD_HHMMSS_originalname
                const dateStr = new Date(originalDate).toISOString()
                    .replace(/[-:]/g, '')
                    .replace('T', '_')
                    .substring(0, 15); // YYYYMMDD_HHMMSS
                uniqueName = `${dateStr}_${file.originalname}`;
            } else {
                uniqueName = Date.now() + '_' + file.originalname;
            }

            const finalPath = path.join(paths.photos, uniqueName);

            // Optimiser et sauvegarder l'image principale en préservant les métadonnées
            const sharpInstance = sharp(file.path)
                .jpeg({ quality: 95 });

            // Préserver les métadonnées EXIF si elles existent
            if (originalExifData) {
                sharpInstance.withMetadata();
            }

            await sharpInstance.toFile(finalPath);

            // Créer la thumbnail
            const thumbName = uniqueName.replace(/\.[^.]+$/, '.webp');
            const thumbPath = path.join(thumbsDir, thumbName);

            await sharp(file.path)
                .resize(config.thumbnails.width, config.thumbnails.height, {
                    fit: config.thumbnails.fit,
                    withoutEnlargement: config.thumbnails.withoutEnlargement
                })
                .webp({ quality: config.thumbnails.quality })
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
        const thumbName = filename.replace(/\.[^.]+$/, '.webp');
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
