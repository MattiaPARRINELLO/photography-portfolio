const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Configuration : les originaux ne sont plus dans photos/ (dossier public)
const serverConfig = require('../server/config');
const photosDir = serverConfig.getPaths().photoOriginals || path.join(__dirname, '..', 'photos-originals');
const placeholdersDir = path.join(photosDir, 'placeholders');

// Créer le dossier placeholders s'il n'existe pas
if (!fs.existsSync(placeholdersDir)) {
    fs.mkdirSync(placeholdersDir, { recursive: true });
    console.log('✅ Dossier placeholders créé');
}

async function generatePlaceholders() {
    try {
        const files = fs.readdirSync(photosDir);
        const images = files.filter(f => f.match(/\.(jpg|jpeg|png|webp)$/i));

        console.log(`🖼️ ${images.length} images trouvées pour générer des placeholders`);

        for (let i = 0; i < images.length; i++) {
            const filename = images[i];
            const placeholderName = filename.replace(/\.[^.]+$/, '.webp');
            const imagePath = path.join(photosDir, filename);
            const placeholderPath = path.join(placeholdersDir, placeholderName);

            // Vérifier si le placeholder existe déjà
            if (fs.existsSync(placeholderPath)) {
                console.log(`⏭️ Placeholder déjà existant: ${placeholderName}`);
                continue;
            }

            try {
                await sharp(imagePath)
                    .resize(50, 50, {
                        fit: 'cover',
                        withoutEnlargement: false
                    })
                    .blur(2) // Léger flou pour masquer la pixelisation
                    .webp({ quality: 20 })
                    .toFile(placeholderPath);

                console.log(`✅ Placeholder créé: ${placeholderName} (${i + 1}/${images.length})`);
            } catch (error) {
                console.error(`❌ Erreur pour ${filename}:`, error.message);
            }
        }

        console.log('🎉 Génération des placeholders terminée!');

        // Afficher les tailles des fichiers
        const placeholderFiles = fs.readdirSync(placeholdersDir);
        let totalSize = 0;

        console.log('\n📊 Tailles des placeholders:');
        placeholderFiles.forEach(file => {
            const filePath = path.join(placeholdersDir, file);
            const stats = fs.statSync(filePath);
            totalSize += stats.size;
            console.log(`   ${file}: ${(stats.size / 1024).toFixed(2)} KB`);
        });

        console.log(`\n📈 Taille totale des placeholders: ${(totalSize / 1024).toFixed(2)} KB`);
        console.log(`📈 Taille moyenne par placeholder: ${(totalSize / placeholderFiles.length / 1024).toFixed(2)} KB`);

    } catch (error) {
        console.error('❌ Erreur générale:', error);
    }
}

generatePlaceholders();
