const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Configuration
const thumbnailsDir = path.join(__dirname, '..', 'photos', 'thumbnails');

async function convertThumbnailsToWebP() {
    try {
        const files = fs.readdirSync(thumbnailsDir);
        const jpegThumbnails = files.filter(f => f.match(/\.(jpg|jpeg)$/i));

        console.log(`🖼️ ${jpegThumbnails.length} thumbnails JPEG trouvées à convertir en WebP`);

        let converted = 0;
        let totalSizeBefore = 0;
        let totalSizeAfter = 0;

        for (let i = 0; i < jpegThumbnails.length; i++) {
            const filename = jpegThumbnails[i];
            const jpegPath = path.join(thumbnailsDir, filename);
            const webpName = filename.replace(/\.(jpg|jpeg)$/i, '.webp');
            const webpPath = path.join(thumbnailsDir, webpName);

            // Vérifier si la version WebP existe déjà
            if (fs.existsSync(webpPath)) {
                console.log(`⏭️ WebP déjà existant: ${webpName}`);
                continue;
            }

            try {
                // Obtenir la taille du fichier JPEG
                const jpegStats = fs.statSync(jpegPath);
                totalSizeBefore += jpegStats.size;

                // Convertir en WebP
                await sharp(jpegPath)
                    .webp({ quality: 80 })
                    .toFile(webpPath);

                // Obtenir la taille du fichier WebP
                const webpStats = fs.statSync(webpPath);
                totalSizeAfter += webpStats.size;

                const reduction = ((jpegStats.size - webpStats.size) / jpegStats.size * 100).toFixed(1);

                console.log(`✅ Converti: ${filename} → ${webpName} (${i + 1}/${jpegThumbnails.length})`);
                console.log(`   📊 ${(jpegStats.size / 1024).toFixed(2)} KB → ${(webpStats.size / 1024).toFixed(2)} KB (-${reduction}%)`);

                // Supprimer l'ancienne version JPEG
                fs.unlinkSync(jpegPath);
                console.log(`   🗑️ Ancien JPEG supprimé`);

                converted++;
            } catch (error) {
                console.error(`❌ Erreur pour ${filename}:`, error.message);
            }
        }

        console.log('\n🎉 Conversion terminée!');
        console.log(`\n📊 Statistiques:`);
        console.log(`   ✅ Thumbnails converties: ${converted}`);
        console.log(`   📦 Taille totale avant: ${(totalSizeBefore / 1024).toFixed(2)} KB`);
        console.log(`   📦 Taille totale après: ${(totalSizeAfter / 1024).toFixed(2)} KB`);
        if (totalSizeBefore > 0) {
            const totalReduction = ((totalSizeBefore - totalSizeAfter) / totalSizeBefore * 100).toFixed(1);
            console.log(`   🚀 Réduction totale: ${totalReduction}%`);
            console.log(`   💾 Espace économisé: ${((totalSizeBefore - totalSizeAfter) / 1024).toFixed(2)} KB`);
        }

    } catch (error) {
        console.error('❌ Erreur générale:', error);
    }
}

convertThumbnailsToWebP();
