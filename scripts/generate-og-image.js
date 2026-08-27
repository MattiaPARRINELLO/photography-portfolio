// Génère dist/assets/og-image.jpg (1200x1200, ≤ 300 Ko) pour le partage social,
// à partir de l'image source des vignettes (/dist/assets/Avatar.png).
// Utilisation : npm run build:og-image
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SOURCE = path.join(__dirname, '..', 'dist', 'assets', 'Avatar.png');
const OUTPUT = path.join(__dirname, '..', 'dist', 'assets', 'og-image.jpg');

async function main() {
    if (!fs.existsSync(SOURCE)) {
        console.error(`Source introuvable : ${SOURCE}`);
        process.exit(1);
    }
    await sharp(SOURCE)
        .resize(1200, 1200, { fit: 'cover', withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true, progressive: true })
        .toFile(OUTPUT);
    const size = fs.statSync(OUTPUT).size;
    console.log(`og-image générée : ${OUTPUT} (${(size / 1024).toFixed(0)} Ko)`);
    if (size > 300 * 1024) {
        console.warn('⚠️ og-image > 300 Ko : réduire la qualité ou recadrer manuellement.');
    }
}

main().catch((err) => {
    console.error('Erreur génération og-image :', err);
    process.exit(1);
});