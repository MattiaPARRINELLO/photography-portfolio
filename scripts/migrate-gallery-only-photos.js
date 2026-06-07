const fs = require('fs');
const path = require('path');

const galleriesPath = path.join(__dirname, '..', 'config', 'galleries.json');
const backupPath = path.join(__dirname, '..', 'config', 'galleries.json.backup-' + Date.now());

function uniqueStrings(values) {
    return Array.from(
        new Set(
            (values || [])
                .filter(v => typeof v === 'string')
                .map(v => v.trim())
                .filter(Boolean)
        )
    );
}

function migrate() {
    if (!fs.existsSync(galleriesPath)) {
        console.log('Aucun fichier galleries.json trouvé. Rien à migrer.');
        return;
    }

    const data = JSON.parse(fs.readFileSync(galleriesPath, 'utf-8'));
    if (!data.galleries || !Array.isArray(data.galleries)) {
        console.log('Format galleries.json invalide. Rien à migrer.');
        return;
    }

    // Sauvegarde
    fs.writeFileSync(backupPath, JSON.stringify(data, null, 2));
    console.log(`Sauvegarde créée: ${path.basename(backupPath)}`);

    let fixedCount = 0;
    let untouchedCount = 0;

    data.galleries.forEach(gallery => {
        if (!Array.isArray(gallery.photos)) {
            gallery.photos = [];
        }

        const oldGalleryOnly = Array.isArray(gallery.galleryOnlyPhotos) ? gallery.galleryOnlyPhotos : [];

        // Filtrer galleryOnlyPhotos pour ne garder que les photos encore présentes dans la galerie
        const updatedGalleryOnly = oldGalleryOnly.filter(name => gallery.photos.includes(name));

        const added = updatedGalleryOnly.filter(n => !oldGalleryOnly.includes(n));
        const removed = oldGalleryOnly.filter(n => !updatedGalleryOnly.includes(n));

        if (added.length > 0 || removed.length > 0) {
            console.log(`  Galerie "${gallery.title}" (${gallery.id}):`);
            if (removed.length > 0) console.log(`    Retirées de galleryOnly (plus dans les photos): ${removed.join(', ')}`);
            if (added.length > 0) console.log(`    Ajoutées (étaient manquantes): ${added.join(', ')}`);
            fixedCount++;
        } else {
            untouchedCount++;
        }

        gallery.galleryOnlyPhotos = updatedGalleryOnly;

        // S'assurer que galleryOnlyPhotos existe toujours
        if (!gallery.hasOwnProperty('galleryOnlyPhotos')) {
            gallery.galleryOnlyPhotos = [];
        }

        // S'assurer que excludeFromMain existe
        if (!gallery.hasOwnProperty('excludeFromMain')) {
            gallery.excludeFromMain = false;
        }
    });

    // Sauvegarder
    data.metadata = data.metadata || {};
    data.metadata.lastUpdated = new Date().toISOString();
    data.metadata.migrated = true;
    fs.writeFileSync(galleriesPath, JSON.stringify(data, null, 2));

    console.log(`\nMigration terminée:`);
    console.log(`  ${fixedCount} galerie(s) corrigée(s)`);
    console.log(`  ${untouchedCount} galerie(s) intacte(s)`);
    console.log(`  Fichier sauvegardé: ${galleriesPath}`);
}

try {
    migrate();
} catch (error) {
    console.error('Erreur lors de la migration:', error.message);
    console.error('Restaurez la sauvegarde si nécessaire:', backupPath);
    process.exit(1);
}
