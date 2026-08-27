const fs = require('fs');
const path = require('path');
const exifr = require('exifr');
const serverConfig = require('../config');
const galleryService = require('./galleryService');

const paths = serverConfig.getPaths();

// Fonction pour extraire la date du nom de fichier
function extractDateFromFilename(filename) {
    if (!filename || typeof filename !== 'string') return null;

    // Pattern YYYYMMDD_HHMMSS (avec ou sans underscore final)
    const match = filename.match(/(\d{8})_(\d{6})/);
    if (match) {
        const [, dateStr, timeStr] = match;
        return new Date(`${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}T${timeStr.slice(0, 2)}:${timeStr.slice(2, 4)}:${timeStr.slice(4, 6)}`);
    }

    // Pattern timestamp en millisecondes (13 chiffres) en préfixe
    const msMatch = filename.match(/^(\d{13})_/);
    if (msMatch) {
        return new Date(parseInt(msMatch[1]));
    }

    return null;
}

async function getPhotosList() {
    return new Promise((resolve, reject) => {
        fs.readdir(paths.photos, async (err, files) => {
            if (err) return reject(err);

            const images = files.filter(f => f.match(/\.(jpg|jpeg|png|webp)$/i));

            // Exclude photos hidden from main listing:
            // - all photos from galleries marked excludeFromMain
            // - photos explicitly flagged as gallery-only (uploaded via gallery form)
            // - backward-compat: infer gallery uploads by admin-gallery filename pattern
            try {
                const galleries = galleryService.loadGalleries().galleries || [];
                const excluded = new Set();
                galleries.forEach(g => {
                    // Photos explicitly uploaded via the gallery form are gallery-only
                    if (Array.isArray(g.galleryOnlyPhotos)) {
                        g.galleryOnlyPhotos.forEach(p => { if (p) excluded.add(p); });
                    }
                    // Galleries flagged excludeFromMain hide all their photos
                    if (g.excludeFromMain && Array.isArray(g.photos)) {
                        g.photos.forEach(p => { if (p) excluded.add(p); });
                    }
                });
                for (let i = images.length - 1; i >= 0; i--) {
                    if (excluded.has(images[i])) images.splice(i, 1);
                }
            } catch (e) {
                console.warn('Could not load galleries to compute excluded photos:', e && e.message);
            }
            const withDates = await Promise.all(images.map(async (f) => {
                try {
                    const url = '/photos/' + f;
                    const filename = f;
                    const thumbnailUrl = `/photos/resize?file=${encodeURIComponent(f)}&w=320`;
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
                        // Pas de données EXIF: on essaiera le nom de fichier puis le mtime
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

                    return { url, filename: f, thumbnailUrl, date, dateSource };
                } catch (error) {
                    console.error('Erreur traitement photo', f, ':', error.message);
                    return null;
                }
            }));
            const filtered = withDates.filter(obj => obj?.filename && obj?.date);

            // Trier par date numérique (EXIF si présent), mais inverser l'ordre: plus récent -> plus ancien.
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
            resolve(filtered);
        });
    });
}

module.exports = {
    getPhotosList,
    extractDateFromFilename
};
