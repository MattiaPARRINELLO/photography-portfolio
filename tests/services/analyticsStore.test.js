var os = require('os');
var path = require('path');
var fs = require('fs');

var AnalyticsStore = require('../../server/utils/analyticsStore');

// Chaque test travaille dans son propre dossier temporaire réel (aucun mock).
var BASE_DIR = path.join(os.tmpdir(), 'pp-store-' + process.pid + '-' + Date.now());
var compteur = 0;
var DIR;

function nextDir() {
    DIR = path.join(BASE_DIR, 'cas-' + (compteur++));
    return DIR;
}

function files() {
    return fs.readdirSync(DIR).sort();
}

describe('AnalyticsStore', function () {
    var store;

    beforeEach(function () {
        store = new AnalyticsStore({ dir: nextDir(), retentionDays: 90 });
    });

    afterAll(function () {
        try { fs.rmSync(BASE_DIR, { recursive: true, force: true }); } catch (e) { /* déjà nettoyé */ }
    });

    // ================================================================
    // Création du dossier
    // ================================================================
    describe('création du stockage', function () {
        it('crée le dossier s\'il n\'existe pas', function () {
            expect(fs.existsSync(DIR)).toBe(true);
        });

        it('ne recrée pas un dossier existant', function () {
            expect(function () {
                new AnalyticsStore({ dir: DIR, retentionDays: 90 });
            }).not.toThrow();
            expect(fs.existsSync(DIR)).toBe(true);
        });
    });

    // ================================================================
    // Append
    // ================================================================
    describe('append', function () {
        it('ajoute une ligne JSON au fichier du jour', function () {
            var ok = store.append({ v: 1, sid: 's1', ts: Date.now(), pages: [] });

            expect(ok).toBe(true);
            var contenu = fs.readFileSync(store.filePathFor(), 'utf-8');
            expect(contenu).toContain('"sid":"s1"');
            expect(contenu.split('\n').filter(Boolean)).toHaveLength(1);
        });

        it('empile les signaux sans jamais réécrire les précédents', function () {
            store.append({ v: 1, sid: 's1', ts: 1 });
            store.append({ v: 1, sid: 's2', ts: 2 });

            var lignes = fs.readFileSync(store.filePathFor(), 'utf-8')
                .split('\n').filter(Boolean);
            expect(lignes).toHaveLength(2);
            expect(lignes[0]).toContain('s1');
            expect(lignes[1]).toContain('s2');
        });

        it('nomme le fichier par jour', function () {
            var jour = '2026-03-04';
            expect(store.fileNameFor(new Date(jour + 'T10:00:00'))).toBe('sessions-2026-03-04.jsonl');
            expect(store.filePathFor(new Date(jour + 'T10:00:00')))
                .toBe(path.join(DIR, 'sessions-2026-03-04.jsonl'));
        });
    });

    // ================================================================
    // Read
    // ================================================================
    describe('read', function () {
        it('relit les signaux écrits', function () {
            store.append({ v: 1, sid: 's1', ts: Date.now(), pages: [] });
            store.append({ v: 1, sid: 's2', ts: Date.now(), pages: [] });

            expect(store.read()).toHaveLength(2);
        });

        it('retourne un tableau vide si le stockage est vide', function () {
            expect(store.read()).toEqual([]);
        });

        it('ignore les lignes corrompues au lieu de tout perdre', function () {
            store.append({ v: 1, sid: 's1', ts: Date.now() });
            fs.appendFileSync(store.filePathFor(), '{json cassé\n\n');

            var resultats = store.read();
            expect(resultats).toHaveLength(1);
            expect(resultats[0].sid).toBe('s1');
        });

        it('filtre sur la fenêtre de jours demandée', function () {
            var maintenant = Date.now();
            var vieuxTs = maintenant - 40 * 24 * 60 * 60 * 1000;
            var recentTs = maintenant - 2 * 24 * 60 * 60 * 1000;

            fs.appendFileSync(store.filePathFor(new Date(vieuxTs)),
                JSON.stringify({ v: 1, sid: 'vieux', ts: vieuxTs }) + '\n');
            fs.appendFileSync(store.filePathFor(new Date(recentTs)),
                JSON.stringify({ v: 1, sid: 'recent', ts: recentTs }) + '\n');

            expect(store.read(7).map(function (r) { return r.sid; })).toEqual(['recent']);
            // 40 jours entrent dans une fenetre de 90 jours
            expect(store.read(90).map(function (r) { return r.sid; }).sort()).toEqual(['recent', 'vieux']);
            // Sans fenetre explicite, tout l'historique est relu
            expect(store.read()).toHaveLength(2);
        });

        it('lit tous les fichiers quand la fenêtre est nulle', function () {
            fs.appendFileSync(store.filePathFor(new Date(Date.now() - 50 * 86400000)),
                JSON.stringify({ v: 1, sid: 'loin', ts: Date.now() - 50 * 86400000 }) + '\n');
            fs.appendFileSync(store.filePathFor(),
                JSON.stringify({ v: 1, sid: 'proche', ts: Date.now() }) + '\n');

            expect(store.read(null).map(function (r) { return r.sid; }).sort()).toEqual(['loin', 'proche']);
        });
    });

    // ================================================================
    // Rotation
    // ================================================================
    describe('rotate', function () {
        it('supprime les fichiers plus vieux que la rétention', function () {
            var ancien = new Date(Date.now() - 100 * 86400000);
            fs.appendFileSync(store.filePathFor(ancien), JSON.stringify({ v: 1, sid: 'x', ts: 1 }) + '\n');
            store.append({ v: 1, sid: 'actuel', ts: Date.now() });

            var supprimes = store.rotate();

            expect(supprimes).toBe(1);
            expect(files()).toHaveLength(1);
        });

        it('conserve les fichiers dans la fenêtre de rétention', function () {
            var dansLaFenetre = new Date(Date.now() - 80 * 86400000);
            fs.appendFileSync(store.filePathFor(dansLaFenetre), JSON.stringify({ v: 1, sid: 'y', ts: 1 }) + '\n');

            expect(store.rotate()).toBe(0);
            expect(files()).toHaveLength(1);
        });

        it('ne fait rien sur un stockage vide', function () {
            expect(store.rotate()).toBe(0);
        });

        it('respecte une rétention personnalisée', function () {
            var court = new AnalyticsStore({ dir: DIR, retentionDays: 7 });
            var vieuxDe10Jours = new Date(Date.now() - 10 * 86400000);
            fs.appendFileSync(court.filePathFor(vieuxDe10Jours), JSON.stringify({ v: 1, sid: 'z', ts: 1 }) + '\n');

            expect(court.rotate()).toBe(1);
            expect(files()).toHaveLength(0);
        });
    });

    // ================================================================
    // Clear
    // ================================================================
    describe('clear', function () {
        it('vide entièrement le stockage', function () {
            store.append({ v: 1, sid: 's1' });
            store.append({ v: 1, sid: 's2' });
            expect(files()).toHaveLength(1);

            store.clear();
            expect(files()).toHaveLength(0);
        });

        it('ne touche pas aux fichiers étrangers', function () {
            store.append({ v: 1, sid: 's1' });
            fs.writeFileSync(path.join(DIR, 'notes.txt'), 'a conserver');

            store.clear();

            expect(fs.existsSync(path.join(DIR, 'notes.txt'))).toBe(true);
        });
    });

    // ================================================================
    // dayKey
    // ================================================================
    describe('dayKey', function () {
        it('formate une date locale AAAA-MM-JJ', function () {
            expect(AnalyticsStore.dayKey(new Date(2026, 2, 4, 23, 30))).toBe('2026-03-04');
            expect(AnalyticsStore.dayKey(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01');
        });

        it('accepte un horodatage numérique', function () {
            var ts = new Date(2026, 11, 31, 12, 0).getTime();
            expect(AnalyticsStore.dayKey(ts)).toBe('2026-12-31');
        });
    });
});
