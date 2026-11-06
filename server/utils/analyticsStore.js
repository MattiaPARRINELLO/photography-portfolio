const fs = require('fs');
const path = require('path');

// ============================================
// STOCKAGE DES ANALYTICS — JSONL APPEND-ONLY
// ============================================
//
// Principe : une ligne par signal reçu. On n'écrit JAMAIS par-dessus un
// enregistrement existant, ce qui évite la lecture + resérialisation complète
// du fichier à chaque requête (le défaut de l'ancien PhotoClickTracker qui
// réécrivait 200 Ko à chaque clic).
//
// Organisation : un fichier par jour (`sessions-AAAA-MM-JJ.jsonl`).
// La purge supprime les fichiers dont la date dépasse la rétention (90 jours
// par défaut) : aucune donnée personnelle n'est stockée, aucun identifiant
// individuel n'est persisté côté serveur.
//
// Conformité RGPD : le serveur ne conserve ni IP, ni User-Agent, ni cookie.
// Les seules données écrites sont des signaux de session déjà anonymisés
// côté client (hash haché, tournant quotidiennement).

const FILE_PREFIX = 'sessions-';
const FILE_SUFFIX = '.jsonl';

class AnalyticsStore {
    /**
     * @param {Object} options
     * @param {string} options.dir - Dossier de stockage des journaux
     * @param {number} [options.retentionDays=90] - Rétention en jours
     */
    constructor(options = {}) {
        this.dir = options.dir;
        this.retentionDays = options.retentionDays || 90;
        this.ensureDir();
    }

    ensureDir() {
        try {
            if (!fs.existsSync(this.dir)) {
                fs.mkdirSync(this.dir, { recursive: true });
            }
        } catch (error) {
            console.error('❌ Impossible de créer le dossier analytics:', error.message);
        }
    }

    /** Nom du fichier du jour */
    fileNameFor(date) {
        return FILE_PREFIX + AnalyticsStore.dayKey(date) + FILE_SUFFIX;
    }

    /** Clé de jour locale AAAA-MM-JJ */
    static dayKey(date) {
        const d = date instanceof Date ? date : new Date(date);
        const pad = (n) => String(n).padStart(2, '0');
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }

    /** Chemin absolu du fichier du jour */
    filePathFor(date = new Date()) {
        return path.join(this.dir, this.fileNameFor(date));
    }

    /**
     * Ajoute un signal en fin de fichier (append seul).
     * @param {Object} record Signal à persister
     * @returns {boolean} succès
     */
    append(record) {
        const line = JSON.stringify(record) + '\n';
        try {
            fs.appendFileSync(this.filePathFor(), line);
            return true;
        } catch (error) {
            console.error('❌ Erreur écriture analytics:', error.message);
            return false;
        }
    }

    /**
     * Lit tous les signaux dont l'horodatage entre dans la fenêtre demandée.
     * @param {number|null} [days=null] - Fenêtre en jours (null = tout l'historique)
     * @returns {Array<Object>} Signaux bruts
     */
    read(days = null) {
        let files = [];
        try {
            files = fs.readdirSync(this.dir).filter(f => f.startsWith(FILE_PREFIX) && f.endsWith(FILE_SUFFIX));
        } catch (error) {
            return [];
        }

        // Les lignes invalides sont ignorées silencieusement : un fichier
        // tronqué par un crash ne doit pas faire échouer tout le tableau de bord.
        const cutoff = (typeof days === 'number' && days > 0)
            ? Date.now() - days * 24 * 60 * 60 * 1000
            : null;

        const records = [];
        for (const file of files) {
            let raw;
            try {
                raw = fs.readFileSync(path.join(this.dir, file), 'utf-8');
            } catch (error) {
                continue;
            }
            const lines = raw.split('\n');
            for (const line of lines) {
                if (!line.trim()) continue;
                let parsed;
                try {
                    parsed = JSON.parse(line);
                } catch (e) {
                    continue;
                }
                if (cutoff !== null && typeof parsed.ts === 'number' && parsed.ts < cutoff) continue;
                records.push(parsed);
            }
        }
        return records;
    }

    /**
     * Supprime les fichiers plus vieux que la rétention.
     * @returns {number} Nombre de fichiers supprimés
     */
    rotate() {
        let files = [];
        try {
            files = fs.readdirSync(this.dir).filter(f => f.startsWith(FILE_PREFIX) && f.endsWith(FILE_SUFFIX));
        } catch (error) {
            return 0;
        }

        const now = Date.now();
        const maxAge = this.retentionDays * 24 * 60 * 60 * 1000;
        let removed = 0;
        for (const file of files) {
            const day = file.slice(FILE_PREFIX.length, -FILE_SUFFIX.length);
            const fileDay = Date.parse(day + 'T00:00:00');
            if (Number.isNaN(fileDay)) continue;
            if (now - fileDay > maxAge) {
                try {
                    fs.unlinkSync(path.join(this.dir, file));
                    removed++;
                } catch (error) {
                    console.error('❌ Erreur suppression analytics:', file, error.message);
                }
            }
        }
        return removed;
    }

    /** Vide complètement le stockage (usage admin/tests) */
    clear() {
        let files = [];
        try {
            files = fs.readdirSync(this.dir).filter(f => f.startsWith(FILE_PREFIX) && f.endsWith(FILE_SUFFIX));
        } catch (error) {
            return;
        }
        for (const file of files) {
            try {
                fs.unlinkSync(path.join(this.dir, file));
            } catch (error) {
                console.error('❌ Erreur purge analytics:', file, error.message);
            }
        }
    }
}

module.exports = AnalyticsStore;
