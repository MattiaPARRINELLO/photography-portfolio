const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const sharp = require('sharp');
const serverConfig = require('../config');
const { requireAdminSession } = require('../middleware/auth');
const photoService = require('../utils/photoService');

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
    try {
        const photos = await photoService.getPhotosList();
        res.json(photos);
    } catch (err) {
        console.error('Erreur lors de la récupération des photos:', err);
        res.status(500).json({ error: 'Impossible de lire le dossier photos' });
    }
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
                originalExifData = await photoService.readExif(file.path);
                originalDate = originalExifData?.DateTimeOriginal || originalExifData?.DateTime;
            } catch (error) {
                // EXIF illisible: le nom sera basé sur le timestamp actuel
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
            try {
                // failOnError: false permet de tolérer les fichiers JPEG légèrement corrompus (ex: fin prématurée)
                // limitInputPixels: false permet de traiter de très grandes images
                const sharpInstance = sharp(file.path, {
                    failOnError: false,
                    limitInputPixels: false
                })
                    .jpeg({ quality: 95 });

                // Préserver les métadonnées EXIF si elles existent
                if (originalExifData) {
                    sharpInstance.withMetadata();
                }

                await sharpInstance.toFile(finalPath);

                // VÉRIFICATION POST-OPTIMISATION :
                // Si l'image originale avait des EXIF mais que le résultat n'en a plus (ex: corruption gérée par sharp en supprimant les métadonnées),
                // on rétablit le fichier original.
                if (originalExifData) {
                    try {
                        const newExif = await photoService.readExif(finalPath);
                        if (!newExif) {
                            console.warn(`⚠️ Sharp a supprimé les métadonnées de ${file.originalname} (probablement dû à une corruption). Rétablissement du fichier original.`);
                            fs.copyFileSync(file.path, finalPath);
                        }
                    } catch (e) {
                        console.warn(`⚠️ Impossible de vérifier les EXIF du fichier optimisé ${file.originalname}. Rétablissement du fichier original par précaution.`);
                        fs.copyFileSync(file.path, finalPath);
                    }
                }
            } catch (error) {
                console.warn(`⚠️ Erreur optimisation Sharp pour ${file.originalname}, utilisation du fichier original:`, error.message);
                fs.copyFileSync(file.path, finalPath);
            }

            // Créer la thumbnail
            const thumbName = uniqueName.replace(/\.[^.]+$/, '.webp');
            const thumbPath = path.join(thumbsDir, thumbName);

            try {
                await sharp(file.path, {
                    failOnError: false,
                    limitInputPixels: false
                })
                    .resize(config.thumbnails.width, config.thumbnails.height, {
                        fit: config.thumbnails.fit,
                        withoutEnlargement: config.thumbnails.withoutEnlargement
                    })
                    .webp({ quality: config.thumbnails.quality })
                    .toFile(thumbPath);
            } catch (error) {
                console.error(`❌ Impossible de créer la miniature pour ${file.originalname}:`, error.message);
                // Fallback: on copie l'original en tant que "thumbnail" (attention au poids)
                // On change l'extension pour .webp pour que le front le trouve, même si c'est du jpeg
                fs.copyFileSync(file.path, thumbPath);
            }

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
