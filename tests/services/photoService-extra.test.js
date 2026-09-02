'use strict';

jest.mock('fs', function () {
    var actual = jest.requireActual('fs');
    return Object.assign({}, actual, {
        readFileSync: jest.fn(function () { return Buffer.alloc(64 * 1024); }),
        readdir: jest.fn(),
        statSync: jest.fn()
    });
});

jest.mock('exifr', function () {
    return { parse: jest.fn() };
});

jest.mock('../../server/config', function () {
    return {
        getPaths: jest.fn().mockReturnValue({ photos: '/fake/photos', root: '/fake' }),
        getConfig: jest.fn().mockReturnValue({}),
        getPort: jest.fn().mockReturnValue(3000)
    };
});

jest.mock('../../server/utils/galleryService', function () {
    return {
        loadGalleries: jest.fn().mockReturnValue({ galleries: [] })
    };
});

var fs = require('fs');
var exifr = require('exifr');
var galleryService = require('../../server/utils/galleryService');
var photoService = require('../../server/utils/photoService');

describe('photoService — branches supplementaires', function () {

    beforeEach(function () {
        jest.clearAllMocks();
        fs.statSync.mockReturnValue({ mtime: new Date('2025-06-01'), size: 1024 });
        exifr.parse.mockResolvedValue(null);
        galleryService.loadGalleries.mockReturnValue({ galleries: [] });
    });

    it('utilise file_mtime quand exifr.parse leve une erreur', function (done) {
        fs.readdir.mockImplementation(function (dir, cb) {
            cb(null, ['photo-error.jpg']);
        });
        exifr.parse.mockRejectedValue(new Error('EXIF read error'));
        fs.statSync.mockReturnValue({ mtime: new Date('2025-03-01'), size: 2048 });

        photoService.getPhotosList().then(function (photos) {
            expect(photos.length).toBe(1);
            expect(photos[0].filename).toBe('photo-error.jpg');
            expect(photos[0].dateSource).toBe('file_mtime');
            expect(photos[0].date.getTime()).toBe(new Date('2025-03-01').getTime());
            done();
        }).catch(done);
    });

    it('utilise file_mtime quand exifr.parse retourne null et pas de pattern dans le nom', function (done) {
        fs.readdir.mockImplementation(function (dir, cb) {
            cb(null, ['DSC_0001.jpg']);
        });
        exifr.parse.mockResolvedValue(null);
        fs.statSync.mockReturnValue({ mtime: new Date('2025-04-15'), size: 4096 });

        photoService.getPhotosList().then(function (photos) {
            expect(photos.length).toBe(1);
            expect(photos[0].dateSource).toBe('file_mtime');
            done();
        }).catch(done);
    });

    it('utilise file_mtime quand exifr.parse retourne un objet vide', function (done) {
        fs.readdir.mockImplementation(function (dir, cb) {
            cb(null, ['sans_exif.jpg']);
        });
        exifr.parse.mockResolvedValue({});
        fs.statSync.mockReturnValue({ mtime: new Date('2025-05-20'), size: 1024 });

        photoService.getPhotosList().then(function (photos) {
            expect(photos.length).toBe(1);
            expect(photos[0].dateSource).toBe('file_mtime');
            done();
        }).catch(done);
    });

    it('garde dateSource exif_original meme avec une DateTimeOriginal invalide', function (done) {
        fs.readdir.mockImplementation(function (dir, cb) {
            cb(null, ['bad-exif.jpg']);
        });
        exifr.parse.mockResolvedValue({ DateTimeOriginal: 'totalement-invalide' });
        fs.statSync.mockReturnValue({ mtime: new Date('2025-01-15'), size: 1024 });

        photoService.getPhotosList().then(function (photos) {
            expect(photos.length).toBe(1);
            expect(photos[0].dateSource).toBe('exif_original');
            expect(isNaN(photos[0].date.getTime())).toBe(true);
            done();
        }).catch(done);
    });

    it('gere un melange de photos avec EXIF, sans EXIF, et erreurs EXIF', function (done) {
        fs.readdir.mockImplementation(function (dir, cb) {
            cb(null, ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'poubelle.txt']);
        });
        fs.statSync.mockReturnValue({ mtime: new Date('2025-02-01'), size: 1024 });

        // readExif lit un buffer et appelle exifr.parse(buffer) — on ne peut plus
        // identifier le fichier par le nom dans le mock exifr. On utilise un compteur
        // d'appels pour mapper l'ordre connu : a.jpg, b.jpg, c.jpg, d.jpg.
        var callIndex = 0;
        exifr.parse.mockImplementation(function () {
            var idx = callIndex++;
            if (idx === 0) return Promise.resolve({ DateTimeOriginal: '2025-06-01T12:00:00' }); // a.jpg
            if (idx === 1) throw new Error('EXIF crash');  // b.jpg → readExif catch → null → file_mtime
            if (idx === 2) return Promise.resolve(null);    // c.jpg
            if (idx === 3) return Promise.resolve({ DateTime: '2025-05-01T10:00:00' }); // d.jpg
            return Promise.resolve(null);
        });

        photoService.getPhotosList().then(function (photos) {
            expect(photos.length).toBe(4);

            var a = photos.find(function (p) { return p.filename === 'a.jpg'; });
            var b = photos.find(function (p) { return p.filename === 'b.jpg'; });
            var c = photos.find(function (p) { return p.filename === 'c.jpg'; });
            var d = photos.find(function (p) { return p.filename === 'd.jpg'; });

            expect(a.dateSource).toBe('exif_original');
            expect(b.dateSource).toBe('file_mtime');
            expect(c.dateSource).toBe('file_mtime');
            expect(d.dateSource).toBe('exif_datetime');

            expect(photos[0].filename).toBe('a.jpg');
            expect(photos[1].filename).toBe('d.jpg');
            expect(photos[2].filename).toBe('b.jpg');
            expect(photos[3].filename).toBe('c.jpg');
            done();
        }).catch(done);
    });

    it('affiche console.warn et retourne les photos quand loadGalleries leve une erreur', function (done) {
        fs.readdir.mockImplementation(function (dir, cb) {
            cb(null, ['img1.jpg']);
        });
        var consoleSpy = jest.spyOn(console, 'warn').mockImplementation(function () {});
        galleryService.loadGalleries.mockImplementation(function () {
            throw new Error('Config file corrupted');
        });

        photoService.getPhotosList().then(function (photos) {
            expect(photos.length).toBe(1);
            expect(photos[0].filename).toBe('img1.jpg');
            expect(consoleSpy).toHaveBeenCalledWith(
                'Could not load galleries to compute excluded photos:',
                'Config file corrupted'
            );
            consoleSpy.mockRestore();
            done();
        }).catch(done);
    });

    it('exclut les photos marquees galleryOnlyPhotos', function (done) {
        fs.readdir.mockImplementation(function (dir, cb) {
            cb(null, ['public.jpg', 'gallerie-secrete.jpg', 'commune.jpg']);
        });
        galleryService.loadGalleries.mockReturnValue({
            galleries: [
                {
                    name: 'Galerie privee',
                    galleryOnlyPhotos: ['gallerie-secrete.jpg', null]
                }
            ]
        });

        photoService.getPhotosList().then(function (photos) {
            expect(photos.length).toBe(2);
            var filenames = photos.map(function (p) { return p.filename; });
            expect(filenames).toEqual(expect.arrayContaining(['public.jpg', 'commune.jpg']));
            expect(filenames).not.toEqual(expect.arrayContaining(['gallerie-secrete.jpg']));
            done();
        }).catch(done);
    });

    it('exclut toutes les photos des galeries avec excludeFromMain', function (done) {
        fs.readdir.mockImplementation(function (dir, cb) {
            cb(null, ['vacances-1.jpg', 'vacances-2.jpg', 'portrait.jpg']);
        });
        galleryService.loadGalleries.mockReturnValue({
            galleries: [
                {
                    name: 'Vacances',
                    excludeFromMain: true,
                    photos: ['vacances-1.jpg', 'vacances-2.jpg']
                },
                {
                    name: 'Portraits',
                    photos: ['portrait.jpg']
                }
            ]
        });

        photoService.getPhotosList().then(function (photos) {
            expect(photos.length).toBe(1);
            expect(photos[0].filename).toBe('portrait.jpg');
            done();
        }).catch(done);
    });

    it('ignore une photo dont le statSync echoue', function (done) {
        fs.readdir.mockImplementation(function (dir, cb) {
            cb(null, ['bonne.jpg', 'corrompue.jpg', 'autre.jpg']);
        });
        fs.statSync.mockImplementation(function (filePath) {
            if (filePath.indexOf('corrompue') !== -1) {
                throw new Error('ENOENT: file disappeared');
            }
            return { mtime: new Date('2025-01-01'), size: 1024 };
        });

        photoService.getPhotosList().then(function (photos) {
            expect(photos.length).toBe(2);
            var filenames = photos.map(function (p) { return p.filename; });
            expect(filenames).toEqual(expect.arrayContaining(['bonne.jpg', 'autre.jpg']));
            expect(filenames).not.toEqual(expect.arrayContaining(['corrompue.jpg']));
            done();
        }).catch(done);
    });

    it('utilise le nom de fichier quand EXIF leve une erreur mais le pattern correspond', function (done) {
        fs.readdir.mockImplementation(function (dir, cb) {
            cb(null, ['20250315_120000_concert.jpg']);
        });
        exifr.parse.mockRejectedValue(new Error('File not readable'));
        fs.statSync.mockReturnValue({ mtime: new Date('2025-06-10'), size: 1024 });

        photoService.getPhotosList().then(function (photos) {
            expect(photos.length).toBe(1);
            expect(photos[0].dateSource).toBe('filename');
            expect(photos[0].date.getFullYear()).toBe(2025);
            expect(photos[0].date.getMonth()).toBe(2);
            expect(photos[0].date.getDate()).toBe(15);
            done();
        }).catch(done);
    });

    it('combine galleryOnlyPhotos et excludeFromMain pour exclure les deux types', function (done) {
        fs.readdir.mockImplementation(function (dir, cb) {
            cb(null, ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg']);
        });
        galleryService.loadGalleries.mockReturnValue({
            galleries: [
                {
                    name: 'Galerie A',
                    galleryOnlyPhotos: ['a.jpg', null]
                },
                {
                    name: 'Galerie B',
                    excludeFromMain: true,
                    photos: ['b.jpg', 'c.jpg']
                }
            ]
        });

        photoService.getPhotosList().then(function (photos) {
            expect(photos.length).toBe(2);
            var filenames = photos.map(function (p) { return p.filename; });
            expect(filenames).toEqual(expect.arrayContaining(['d.jpg', 'e.jpg']));
            expect(filenames).not.toEqual(expect.arrayContaining(['a.jpg', 'b.jpg', 'c.jpg']));
            done();
        }).catch(done);
    });

});
