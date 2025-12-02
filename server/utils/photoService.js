const fs = require('fs');
const path = require('path');
const exifr = require('exifr');
const serverConfig = require('../config');

const paths = serverConfig.getPaths();

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

async function getPhotosList() {
    return new Promise((resolve, reject) => {
        fs.readdir(paths.photos, async (err, files) => {
            if (err) return reject(err);

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
                        // console.log(`⚠️ Pas de données EXIF pour ${f}:`, exifError.message);
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
