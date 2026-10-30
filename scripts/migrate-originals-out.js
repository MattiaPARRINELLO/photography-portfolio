#!/usr/bin/env node
/**
 * Migration : sort les photos originales du dossier statique public.
 *
 *   node scripts/migrate-originals-out.js           # dry-run (par défaut)
 *   node scripts/migrate-originals-out.js --apply   # effectue le déplacement
 *
 * Ne touche JAMAIS à `photos/thumbnails/` ni à `photos/resized/`.
 * Vérifie le nombre de fichiers avant/après et s'arrête si un écart est détecté.
 */
const fs = require('fs');
const path = require('path');
const serverConfig = require('../server/config');

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif)$/i;
const apply = process.argv.includes('--apply');

function listImages(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && IMAGE_EXT_RE.test(entry.name))
        .map((entry) => entry.name);
}

function main() {
    const paths = serverConfig.getPaths();
    const sourceDir = paths.photos;
    const targetDir = paths.photoOriginals;

    if (!targetDir) {
        console.error('❌ paths.photoOriginals absent de la configuration.');
        process.exit(1);
    }
    if (path.resolve(sourceDir) === path.resolve(targetDir)) {
        console.error('❌ Source et destination identiques, rien à faire.');
        process.exit(1);
    }

    const files = listImages(sourceDir);
    console.log(`Source      : ${sourceDir}`);
    console.log(`Destination : ${targetDir}`);
    console.log(`Fichiers à déplacer : ${files.length}`);
    console.log(`Mode        : ${apply ? 'APPLY' : 'DRY-RUN (ajoutez --apply pour exécuter)'}`);

    if (files.length === 0) {
        console.log('Rien à déplacer.');
        return;
    }

    if (!apply) {
        files.slice(0, 10).forEach((f) => console.log(`  - ${f}`));
        if (files.length > 10) console.log(`  … et ${files.length - 10} autre(s)`);
        return;
    }

    fs.mkdirSync(targetDir, { recursive: true });

    // Refus d'écraser un fichier existant : on s'arrête avant toute perte.
    const collisions = files.filter((f) => fs.existsSync(path.join(targetDir, f)));
    if (collisions.length > 0) {
        console.error(`❌ ${collisions.length} fichier(s) déjà présent(s) dans la destination :`);
        collisions.slice(0, 10).forEach((f) => console.error(`  - ${f}`));
        console.error('Aucun fichier déplacé. Résolvez les doublons manuellement.');
        process.exit(1);
    }

    const before = files.length;
    let moved = 0;
    for (const file of files) {
        fs.renameSync(path.join(sourceDir, file), path.join(targetDir, file));
        moved += 1;
    }

    const remaining = listImages(sourceDir).length;
    const present = listImages(targetDir).length;

    console.log(`Déplacés     : ${moved}/${before}`);
    console.log(`Restants src : ${remaining}`);
    console.log(`Présents dst : ${present}`);

    if (moved !== before || remaining !== 0) {
        console.error('❌ Écart détecté dans le décompte des fichiers.');
        process.exit(1);
    }
    console.log('✅ Migration terminée.');
}

main();
