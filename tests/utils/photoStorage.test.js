// Tests de server/utils/photoStorage : chemins des originaux et URL des
// miniatures statiques (repli quand /photos/resize échoue).
var photoStorage = require('../../server/utils/photoStorage');

describe('photoStorage — getThumbnailUrl', function () {
    it('remplace l extension par .webp sous /photos/thumbnails/', function () {
        expect(photoStorage.getThumbnailUrl('20260829_155103_5.jpg'))
            .toBe('/photos/thumbnails/20260829_155103_5.webp');
        expect(photoStorage.getThumbnailUrl('photo.png'))
            .toBe('/photos/thumbnails/photo.webp');
    });

    it('encode les caractères spéciaux du nom de fichier', function () {
        expect(photoStorage.getThumbnailUrl('IMG_2564 (1).jpg'))
            .toBe('/photos/thumbnails/IMG_2564%20(1).webp');
    });

    it('encode les apostrophes pour rester utilisable dans un attribut inline', function () {
        expect(photoStorage.getThumbnailUrl("l'ete.jpg"))
            .toBe('/photos/thumbnails/l%27ete.webp');
    });

    it('retourne null quand le nom de fichier est vide', function () {
        expect(photoStorage.getThumbnailUrl('')).toBeNull();
        expect(photoStorage.getThumbnailUrl(null)).toBeNull();
        expect(photoStorage.getThumbnailUrl(undefined)).toBeNull();
    });
});

describe('photoStorage — isImageFilename', function () {
    it('accepte les extensions image supportées', function () {
        expect(photoStorage.isImageFilename('a.jpg')).toBe(true);
        expect(photoStorage.isImageFilename('a.JPEG')).toBe(true);
        expect(photoStorage.isImageFilename('a.png')).toBe(true);
        expect(photoStorage.isImageFilename('a.webp')).toBe(true);
    });

    it('refuse les autres extensions', function () {
        expect(photoStorage.isImageFilename('a.pdf')).toBe(false);
        expect(photoStorage.isImageFilename('a.js')).toBe(false);
        expect(photoStorage.isImageFilename('')).toBe(false);
    });
});
