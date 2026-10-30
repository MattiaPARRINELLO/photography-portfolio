process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-session-secret';
process.env.CONTACT_API_SECRET = 'test-contact-api-secret';
process.env.ADMIN_REMEMBER_SALT = 'test-admin-remember-salt';
process.env.IMAGE_SECRET_KEY = 'test-image-secret-key-min-32-chars!!';
process.env.ADMIN_PASSWORD = 'admin-test-password';
process.env.SITE_URL = 'http://localhost:3000';

// Originaux isolés dans un dossier temporaire dédié aux tests : aucun fichier
// réel du dépôt ne peut être lu ou écrit par la suite de tests.
const fs = require('fs');
const os = require('os');
const path = require('path');

const testOriginalsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-originals-'));
process.env.PHOTOS_ORIGINALS_DIR = testOriginalsDir;

// setupFiles s'exécute avant le framework de test : pas de afterAll ici.
// Le dossier est dans os.tmpdir(), il est supprimé par l'OS.
process.on('exit', () => {
    try {
        fs.rmSync(testOriginalsDir, { recursive: true, force: true });
    } catch (e) {
        // nettoyage best-effort
    }
});
