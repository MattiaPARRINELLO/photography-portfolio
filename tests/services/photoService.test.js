// Mock fs and exifr for photoService
jest.mock('fs', function () {
  var actual = jest.requireActual('fs');
  return Object.assign({}, actual, {
    readdir: jest.fn(),
    statSync: jest.fn()
  });
});

jest.mock('exifr', function () {
  return {
    parse: jest.fn()
  };
});

// Mock server config
jest.mock('../../server/config', function () {
  return {
    getPaths: jest.fn().mockReturnValue({
      photos: '/fake/photos',
      root: '/fake/root'
    }),
    getConfig: jest.fn().mockReturnValue({}),
    getPort: jest.fn().mockReturnValue(3000)
  };
});

// Mock galleryService
jest.mock('../../server/utils/galleryService', function () {
  return {
    loadGalleries: jest.fn().mockReturnValue({ galleries: [] })
  };
});

var fs = require('fs');
var exifr = require('exifr');
var photoService = require('../../server/utils/photoService');

describe('photoService — extractDateFromFilename', function () {

  beforeEach(function () {
    jest.clearAllMocks();
  });

  it('extrait la date du pattern YYYYMMDD_HHMMSS_', function () {
    var result = photoService.extractDateFromFilename('20250115_203000_DSC_0001.jpg');
    expect(result).toBeInstanceOf(Date);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(0); // janvier
    expect(result.getDate()).toBe(15);
    expect(result.getHours()).toBe(20);
    expect(result.getMinutes()).toBe(30);
    expect(result.getSeconds()).toBe(0);
  });

  it('extrait la date du pattern YYYYMMDD_HHMMSS (sans underscore final)', function () {
    var result = photoService.extractDateFromFilename('20250115_203000');
    expect(result).toBeInstanceOf(Date);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(0);
  });

  it('extrait la date du pattern timestamp 13 chiffres', function () {
    var result = photoService.extractDateFromFilename('1736899200000_photo.jpg');
    var expected = new Date(1736899200000);
    expect(result.getTime()).toBe(expected.getTime());
  });

  it('retourne null si aucun pattern ne correspond', function () {
    var result = photoService.extractDateFromFilename('photo_sans_date.jpg');
    expect(result).toBeNull();
  });

  it('retourne null pour une chaine vide', function () {
    var result = photoService.extractDateFromFilename('');
    expect(result).toBeNull();
  });

  it.skip('[Q-PHOTO-1] extractDateFromFilename ne gère pas null — manque un guard', function () {
    var result = photoService.extractDateFromFilename(null);
    // Attendu: null, Reel: TypeError
  });

  it.skip('[Q-PHOTO-1] extractDateFromFilename ne gère pas undefined — manque un guard', function () {
    var result = photoService.extractDateFromFilename(undefined);
    // Attendu: null, Reel: TypeError
  });
});

describe('photoService — getPhotosList', function () {

  beforeEach(function () {
    jest.clearAllMocks();
  });

  it('retourne la liste des photos triees par date', function (done) {
    fs.readdir.mockImplementation(function (dir, cb) {
      cb(null, ['p1.jpg', 'p2.jpg', 'notes.txt', 'p3.webp']);
    });
    fs.statSync.mockReturnValue({ mtime: new Date('2025-01-01'), size: 1024 });
    exifr.parse.mockResolvedValue(null);

    photoService.getPhotosList().then(function (photos) {
      expect(Array.isArray(photos)).toBe(true);
      expect(photos.length).toBe(3);
      expect(photos[0]).toHaveProperty('url');
      expect(photos[0]).toHaveProperty('filename');
      expect(photos[0]).toHaveProperty('date');
      expect(photos[0].dateSource).toBe('file_mtime');
      done();
    }).catch(done);
  });

  it('filtre les fichiers non-images', function (done) {
    fs.readdir.mockImplementation(function (dir, cb) {
      cb(null, ['photo.jpg', 'video.mp4', 'doc.pdf']);
    });
    fs.statSync.mockReturnValue({ mtime: new Date(), size: 1024 });
    exifr.parse.mockResolvedValue(null);

    photoService.getPhotosList().then(function (photos) {
      expect(photos.length).toBe(1);
      expect(photos[0].filename).toBe('photo.jpg');
      done();
    }).catch(done);
  });

  it('retourne un tableau vide si le dossier est vide', function (done) {
    fs.readdir.mockImplementation(function (dir, cb) {
      cb(null, []);
    });

    photoService.getPhotosList().then(function (photos) {
      expect(photos).toEqual([]);
      done();
    }).catch(done);
  });

  it('rejette si readdir echoue', function (done) {
    fs.readdir.mockImplementation(function (dir, cb) {
      cb(new Error('Permission denied'));
    });

    photoService.getPhotosList().catch(function (err) {
      expect(err.message).toBe('Permission denied');
      done();
    });
  });

  it('utilise la date EXIF si disponible', function (done) {
    fs.readdir.mockImplementation(function (dir, cb) {
      cb(null, ['p1.jpg']);
    });
    fs.statSync.mockReturnValue({ mtime: new Date(), size: 1024 });
    exifr.parse.mockResolvedValue({ DateTimeOriginal: '2025-03-15T20:00:00' });

    photoService.getPhotosList().then(function (photos) {
      expect(photos[0].dateSource).toBe('exif_original');
      expect(new Date(photos[0].date).getMonth()).toBe(2); // mars = index 2
      done();
    }).catch(done);
  });

  it('utilise le fallback DateTime si DateTimeOriginal absent', function (done) {
    fs.readdir.mockImplementation(function (dir, cb) {
      cb(null, ['p1.jpg']);
    });
    fs.statSync.mockReturnValue({ mtime: new Date(), size: 1024 });
    exifr.parse.mockResolvedValue({ DateTime: '2025-04-10T10:00:00' });

    photoService.getPhotosList().then(function (photos) {
      expect(photos[0].dateSource).toBe('exif_datetime');
      done();
    }).catch(done);
  });

  it('utilise le nom de fichier si pas d EXIF mais pattern dans le nom', function (done) {
    fs.readdir.mockImplementation(function (dir, cb) {
      cb(null, ['20250301_120000_concert.jpg']);
    });
    fs.statSync.mockReturnValue({ mtime: new Date(), size: 1024 });
    exifr.parse.mockResolvedValue(null);

    photoService.getPhotosList().then(function (photos) {
      expect(photos[0].dateSource).toBe('filename');
      done();
    }).catch(done);
  });
});
