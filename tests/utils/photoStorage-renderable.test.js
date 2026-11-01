// Tests du filtre de disponibilité des photos (server/utils/photoStorage).
// Contexte réel : des entrées de galleries.json référencent des fichiers
// supprimés du serveur ; elles ne doivent jamais produire de tuile cassée.
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-storage-'));
const mockOriginalsDir = path.join(tmpRoot, 'originals');
const mockPhotosDir = path.join(tmpRoot, 'photos');
const thumbsDir = path.join(mockPhotosDir, 'thumbnails');

fs.mkdirSync(mockOriginalsDir, { recursive: true });
fs.mkdirSync(thumbsDir, { recursive: true });

// Original présent
fs.writeFileSync(path.join(mockOriginalsDir, 'avec-original.jpg'), 'x');
// Miniature seule (original supprimé mais miniature encore là)
fs.writeFileSync(path.join(thumbsDir, 'miniature-seule.webp'), 'x');

jest.mock('../../server/config', function () {
    return {
        getPaths: jest.fn().mockReturnValue({
            photos: mockPhotosDir,
            photoOriginals: mockOriginalsDir
        }),
        getConfig: jest.fn().mockReturnValue({})
    };
});

const photoStorage = require('../../server/utils/photoStorage');

describe('photoStorage — isPhotoRenderable', function () {
    it('accepte une photo dont l original existe', function () {
        expect(photoStorage.isPhotoRenderable('avec-original.jpg')).toBe(true);
    });

    it('accepte une photo dont seule la miniature existe', function () {
        expect(photoStorage.isPhotoRenderable('miniature-seule.jpg')).toBe(true);
    });

    it('refuse une photo dont ni original ni miniature n existe', function () {
        expect(photoStorage.isPhotoRenderable('disparue.jpg')).toBe(false);
    });

    it('refuse un nom de fichier non image', function () {
        expect(photoStorage.isPhotoRenderable('notes.txt')).toBe(false);
        expect(photoStorage.isPhotoRenderable('')).toBe(false);
    });
});

describe('photoStorage — filterRenderablePhotos', function () {
    it('retire les photos indisponibles en conservant l ordre', function () {
        expect(photoStorage.filterRenderablePhotos([
            'avec-original.jpg',
            'disparue.jpg',
            'miniature-seule.jpg'
        ])).toEqual(['avec-original.jpg', 'miniature-seule.jpg']);
    });

    it('tolère une valeur non tableau', function () {
        expect(photoStorage.filterRenderablePhotos(null)).toEqual([]);
        expect(photoStorage.filterRenderablePhotos(undefined)).toEqual([]);
    });
});
