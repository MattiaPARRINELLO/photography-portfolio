// Test réel de l'utilitaire de dimensions : génère une vraie image sharp
// dans un dossier temporaire et vérifie la lecture des dimensions.
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');

// Préfixe « mock » requis par jest pour les variables référencées dans la fabrique
const mockTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imagemeta-'));

jest.mock('../../server/config', function () {
    return {
        getPaths: jest.fn().mockReturnValue({ photos: mockTmpDir })
    };
});

describe('imageMeta — dimensions intrinsèques des photos', function () {
    let imageMeta;

    beforeAll(async function () {
        imageMeta = require('../../server/utils/imageMeta');
        // Vraie image 800x600 au format JPEG
        await sharp({ create: { width: 800, height: 600, channels: 3, background: '#123456' } })
            .jpeg()
            .toFile(path.join(mockTmpDir, 'test-photo.jpg'));
    });

    afterAll(function () {
        fs.rmSync(mockTmpDir, { recursive: true, force: true });
    });

    it('retourne les dimensions d un fichier présent', async function () {
        const dims = await imageMeta.getImageDimensions('test-photo.jpg');
        expect(dims).toEqual({ width: 800, height: 600 });
    });

    it('retourne null pour un fichier absent (sans planter)', async function () {
        const dims = await imageMeta.getImageDimensions('inexistant.jpg');
        expect(dims).toBeNull();
    });

    it('neutralise les chemins d accès (basename uniquement)', async function () {
        const dims = await imageMeta.getImageDimensions('../../etc/passwd');
        expect(dims).toBeNull();
    });
});