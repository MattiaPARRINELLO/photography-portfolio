// Régression #63 : config/texts.json.example contenait un paragraphe de prose
// après l objet JSON. loadTexts() copie cet exemple vers config/texts.json quand
// ce dernier est absent : sur une installation neuve, le site démarrait sans
// textes. Le fichier doit donc rester du JSON strict.
const fs = require('fs');
const path = require('path');

const examplePath = path.join(__dirname, '..', '..', 'config', 'texts.json.example');

describe('config/texts.json.example', function () {
    it('est un JSON valide', function () {
        const raw = fs.readFileSync(examplePath, 'utf-8');
        expect(function () { JSON.parse(raw); }).not.toThrow();
    });

    it('contient les sections attendues par loadTexts', function () {
        const data = JSON.parse(fs.readFileSync(examplePath, 'utf-8'));
        expect(data.main).toBeDefined();
        expect(data.meta).toBeDefined();
        expect(data.footer).toBeDefined();
        expect(typeof data.meta.title).toBe('string');
        expect(typeof data.meta.description).toBe('string');
    });
});
