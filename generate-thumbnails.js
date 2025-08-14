// Affichage ASCII art
function printAsciiArt() {
    console.log('\x1b[36m' + `

 /$$$$$$$$ /$$                               /$$                                                                          /$$                        
|__  $$__/| $$                              | $$                                                                         | $$                        
   | $$   | $$$$$$$  /$$   /$$ /$$$$$$/$$$$ | $$$$$$$         /$$$$$$   /$$$$$$  /$$$$$$$   /$$$$$$   /$$$$$$  /$$$$$$  /$$$$$$    /$$$$$$   /$$$$$$ 
   | $$   | $$__  $$| $$  | $$| $$_  $$_  $$| $$__  $$       /$$__  $$ /$$__  $$| $$__  $$ /$$__  $$ /$$__  $$|____  $$|_  $$_/   /$$__  $$ /$$__  $$
   | $$   | $$  \ $$| $$  | $$| $$ \ $$ \ $$| $$  \ $$      | $$  \ $$| $$$$$$$$| $$  \ $$| $$$$$$$$| $$  \__/ /$$$$$$$  | $$    | $$  \ $$| $$  \__/
   | $$   | $$  | $$| $$  | $$| $$ | $$ | $$| $$  | $$      | $$  | $$| $$_____/| $$  | $$| $$_____/| $$      /$$__  $$  | $$ /$$| $$  | $$| $$      
   | $$   | $$  | $$|  $$$$$$/| $$ | $$ | $$| $$$$$$$/      |  $$$$$$$|  $$$$$$$| $$  | $$|  $$$$$$$| $$     |  $$$$$$$  |  $$$$/|  $$$$$$/| $$      
   |__/   |__/  |__/ \______/ |__/ |__/ |__/|_______/        \____  $$ \_______/|__/  |__/ \_______/|__/      \_______/   \___/   \______/ |__/      
                                                             /$$  \ $$                                                                               
                                                            |  $$$$$$/                                                                               
                                                             \______/                                                                                

` + '\x1b[0m');
}
// Script Node.js pour générer des miniatures pour toutes les images du dossier photos/
// Utilise la librairie sharp

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const readline = require('readline');

const photosDir = path.join(__dirname, 'photos');
const thumbsDir = path.join(photosDir, 'thumbnails');

function askQuestion(query) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(query, ans => { rl.close(); resolve(ans); }));
}

async function main() {
    printAsciiArt();
    if (fs.existsSync(thumbsDir)) {
        const ans = await askQuestion('Le dossier thumbnails existe déjà. Supprimer toutes les miniatures existantes ? (o/n) ');
        if (ans.trim().toLowerCase() === 'o') {
            fs.readdirSync(thumbsDir).forEach(f => fs.unlinkSync(path.join(thumbsDir, f)));
            console.log('Miniatures supprimées.');
        }
    } else {
        fs.mkdirSync(thumbsDir);
    }

    const files = fs.readdirSync(photosDir).filter(file => ['.jpg', '.jpeg', '.png', '.webp'].includes(path.extname(file).toLowerCase()));
    const total = files.length;
    let done = 0;

    function printProgress(currentFile, status) {
        const percent = Math.round((done / total) * 100);
        process.stdout.write(`\r${status} ${currentFile}   Progression : ${done}/${total} (${percent}%)   `);
    }

    await Promise.all(files.map(async (file) => {
        const inputPath = path.join(photosDir, file);
        const outputPath = path.join(thumbsDir, file);
        try {
            printProgress(file, 'Traitement de');
            await sharp(inputPath)
                .resize({ width: 1000, height: 1000, fit: 'inside' })
                .toFile(outputPath);
            done++;
            printProgress(file, 'OK         ');
        } catch (err) {
            done++;
            printProgress(file, 'Erreur     ');
            console.error(`\nErreur pour ${file} :`, err);
        }
    }));
    process.stdout.write(`\nGénération des miniatures terminée.\n`);
}

main();
