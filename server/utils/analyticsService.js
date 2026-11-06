const galleryService = require('./galleryService');
const AnalyticsStore = require('./analyticsStore');

// ============================================
// AGRÉGATION DES ANALYTICS — CALCUL DES KPI
// ============================================
//
// Ce module transforme les signaux bruts de session en indicateurs
// directement exploitables. Aucun listing de logs, aucune IP : uniquement
// des métriques calculées.
//
// Un visiteur n'est PAS en rebond (« smart bounce ») s'il remplit AU MOINS
// UN des critères d'engagement ci-dessous.

const ENGAGED_MIN_MS = 15000;        // temps d'attention active minimum
const ENGAGED_MIN_PHOTOS = 3;        // photos vues minimum
const GALLERY_PATH_RE = /^\/galerie\/([^\/?#]+)/;

// Pondération du score d'engagement d'une galerie :
// l'intérêt visuel (plein écran) pèse plus lourd que la non-sortie immédiate.
const WEIGHT_INTEREST = 0.6;
const WEIGHT_RETENTION = 0.4;

/** Coerce une valeur en nombre positif fini */
function num(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Borne un ratio entre 0 et 1 */
function ratio(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

/** Moyenne arithmétique (0 si la liste est vide) */
function average(values) {
    if (!values.length) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Médiane — robuste aux sessions aberrantes */
function median(values) {
    if (!values.length) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

class AnalyticsService {
    /**
     * @param {Object} store - Instance de AnalyticsStore
     */
    constructor(store) {
        this.store = store;
        this.galleryIndex = new Map();
        this.refreshGalleryIndex();
    }

    /**
     * Construit l'index des galeries (slug -> métadonnées) pour libeller
     * les pages visitées. Accepte directement un tableau de galeries afin de
     * rester testable sans dépendre de la configuration réelle.
     * @param {Array<Object>} [galleries] Galeries à indexer (défaut: config réelle)
     */
    refreshGalleryIndex(galleries) {
        const list = Array.isArray(galleries) ? galleries : this._loadGalleries();
        this.galleryIndex = new Map();
        for (const g of list) {
            if (g && g.slug) {
                this.galleryIndex.set(g.slug, {
                    slug: g.slug,
                    title: g.title || g.artist || g.slug,
                    artist: g.artist || null,
                    venue: g.venue || null,
                    date: g.date || null
                });
            }
        }
    }

    _loadGalleries() {
        try {
            const data = galleryService.loadGalleries();
            return (data && data.galleries) || [];
        } catch (error) {
            console.warn('⚠️ Index des galeries indisponible:', error.message);
            return [];
        }
    }

    /** Résout le libellé d'une page depuis son URL */
    _resolvePage(id) {
        const raw = typeof id === 'string' ? id : '';
        const match = GALLERY_PATH_RE.exec(raw);
        if (match && this.galleryIndex.has(match[1])) {
            const g = this.galleryIndex.get(match[1]);
            return { type: 'gallery', title: g.title, artist: g.artist, venue: g.venue, slug: g.slug };
        }
        return { type: 'page', title: raw || '(inconnu)', artist: null, venue: null, slug: null };
    }

    // ================================================================
    // COLLECTE DES SESSIONS
    // ================================================================

    /**
     * Déduplique les signaux par identifiant de session.
     * Chaque signal contient des compteurs CUMULATIFS par page : le dernier
     * signal reçu pour une session contient donc déjà tout l'historique.
     * @param {Array<Object>} records Signaux bruts
     * @returns {Array<Object>} Une session par identifiant
     */
    _collectSessions(records) {
        const bySid = new Map();
        for (const record of records) {
            if (!record || typeof record.sid !== 'string') continue;
            const existing = bySid.get(record.sid);
            if (!existing || num(record.ts) >= num(existing.ts)) {
                bySid.set(record.sid, record);
            }
        }
        return Array.from(bySid.values());
    }

    // ================================================================
    // TABLEAU DE BORD
    // ================================================================

    /**
     * Calcule l'ensemble des indicateurs pour une période donnée.
     * @param {number|null} [days=30] Fenêtre en jours (null = tout l'historique)
     * @returns {Object} Indicateurs prêts à afficher
     */
    getDashboard(days = 30) {
        const effectiveDays = (typeof days === 'number' && days > 0) ? days : null;
        const sessions = this._collectSessions(this.store.read(effectiveDays));

        const prepared = sessions.map(record => this._prepareSession(record));

        return {
            period: {
                days: effectiveDays,
                sessions: prepared.length,
                generatedAt: new Date().toISOString()
            },
            kpis: this._computeKpis(prepared),
            daily: this._computeDaily(prepared),
            galleries: this._computeGalleries(prepared),
            sources: this._computeSources(prepared),
            campaigns: this._computeCampaigns(prepared),
            artists: this._computeArtists(prepared)
        };
    }

    /** Normalise une session et calcule ses totaux */
    _prepareSession(record) {
        const pages = Array.isArray(record.pages) ? record.pages : [];
        const preparedPages = pages.map(p => {
            const id = p && typeof p.id === 'string' ? p.id : '';
            const meta = this._resolvePage(id);
            return {
                id,
                ...meta,
                engagedMs: num(p && p.engagedMs),
                scrollMax: ratio(p && p.scrollMax),
                fullscreenOpens: num(p && p.fullscreenOpens),
                photosViewed: num(p && p.photosViewed),
                contactClicks: num(p && p.contactClicks),
                mailtoClicks: num(p && p.mailtoClicks)
            };
        });

        const totals = {
            engagedMs: preparedPages.reduce((s, p) => s + p.engagedMs, 0),
            fullscreenOpens: preparedPages.reduce((s, p) => s + p.fullscreenOpens, 0),
            photosViewed: preparedPages.reduce((s, p) => s + p.photosViewed, 0),
            contactClicks: preparedPages.reduce((s, p) => s + p.contactClicks, 0),
            mailtoClicks: preparedPages.reduce((s, p) => s + p.mailtoClicks, 0),
            pageViews: preparedPages.length
        };
        totals.conversions = totals.contactClicks + totals.mailtoClicks;
        totals.isEngaged = this._isEngaged(totals);
        totals.scrollAvg = average(preparedPages.map(p => p.scrollMax));

        return {
            sid: record.sid,
            hash: typeof record.hash === 'string' ? record.hash : null,
            ts: num(record.ts),
            source: typeof record.src === 'string' ? record.src : 'direct',
            campaign: (record.camp && typeof record.camp === 'object') ? record.camp : null,
            pages: preparedPages,
            totals
        };
    }

    // ================================================================
    // KPI 1 — REBOND QUALIFIÉ
    // ================================================================

    /**
     * Un visiteur est en rebond UNIQUEMENT s'il n'a démontré aucun signe
     * d'intérêt : ni temps d'attention, ni interaction visuelle, ni
     * conversion, ni navigation multi-pages.
     */
    _isEngaged(totals) {
        return totals.engagedMs > ENGAGED_MIN_MS
            || totals.fullscreenOpens >= 1
            || totals.photosViewed >= ENGAGED_MIN_PHOTOS
            || totals.conversions >= 1
            || totals.pageViews >= 2;
    }

    // ================================================================
    // KPI GLOBAUX
    // ================================================================

    _computeKpis(sessions) {
        const total = sessions.length;
        const engaged = sessions.filter(s => s.totals.isEngaged);
        const visitors = new Set(sessions.map(s => s.hash).filter(Boolean));
        const conversions = sessions.filter(s => s.totals.conversions >= 1);

        if (!total) {
            return {
                sessions: 0, visitors: 0, engagedSessions: 0,
                smartBounceRate: 0, avgEngagedMs: 0, medianEngagedMs: 0,
                avgScrollDepth: 0, contactConversionRate: 0,
                totalFullscreen: 0, totalPhotoViews: 0, totalConversions: 0
            };
        }

        return {
            sessions: total,
            visitors: visitors.size,
            engagedSessions: engaged.length,
            smartBounceRate: this._pct(total - engaged.length, total),
            avgEngagedMs: Math.round(average(sessions.map(s => s.totals.engagedMs))),
            medianEngagedMs: Math.round(median(sessions.map(s => s.totals.engagedMs))),
            avgScrollDepth: Math.round(average(sessions.map(s => s.totals.scrollAvg)) * 100),
            contactConversionRate: this._pct(conversions.length, total),
            totalFullscreen: sessions.reduce((sum, s) => sum + s.totals.fullscreenOpens, 0),
            totalPhotoViews: sessions.reduce((sum, s) => sum + s.totals.photosViewed, 0),
            totalConversions: conversions.length
        };
    }

    // ================================================================
    // SÉRIE QUOTIDIENNE (graphiques)
    // ================================================================

    _computeDaily(sessions) {
        const byDay = new Map();
        for (const s of sessions) {
            if (!s.ts) continue;
            const key = AnalyticsStore.dayKey(new Date(s.ts));
            if (!byDay.has(key)) {
                byDay.set(key, { date: key, sessions: 0, engaged: 0, engagedMsSum: 0, conversions: 0 });
            }
            const day = byDay.get(key);
            day.sessions++;
            if (s.totals.isEngaged) day.engaged++;
            day.engagedMsSum += s.totals.engagedMs;
            if (s.totals.conversions >= 1) day.conversions++;
        }

        return Array.from(byDay.values())
            .sort((a, b) => a.date.localeCompare(b.date))
            .map(day => ({
                date: day.date,
                sessions: day.sessions,
                engaged: day.engaged,
                bounceRate: this._pct(day.sessions - day.engaged, day.sessions),
                avgEngagedMs: Math.round(day.engagedMsSum / day.sessions),
                conversions: day.conversions
            }));
    }

    // ================================================================
    // KPI 2 & 3 — PAR GALERIE (temps engagé + intérêt visuel)
    // ================================================================

    _computeGalleries(sessions) {
        const byId = new Map();
        for (const s of sessions) {
            for (const p of s.pages) {
                if (p.type !== 'gallery') continue;
                if (!byId.has(p.id)) {
                    byId.set(p.id, {
                        id: p.id, slug: p.slug, title: p.title,
                        artist: p.artist, venue: p.venue,
                        sessions: 0, engagedMsSum: 0, interested: 0,
                        photoViewsSum: 0, scrollSum: 0, conversions: 0
                    });
                }
                const g = byId.get(p.id);
                g.sessions++;
                g.engagedMsSum += p.engagedMs;
                if (p.fullscreenOpens >= 1) g.interested++;
                g.photoViewsSum += p.photosViewed;
                g.scrollSum += p.scrollMax;
                if (p.contactClicks + p.mailtoClicks >= 1) g.conversions++;
            }
        }

        return Array.from(byId.values())
            .map(g => {
                const visualInterest = this._pct(g.interested, g.sessions);
                const scrollDepth = this._pct(g.scrollSum / g.sessions);
                const avgPhotosViewed = Math.round((g.photoViewsSum / g.sessions) * 10) / 10;
                return {
                    id: g.id, slug: g.slug, title: g.title,
                    artist: g.artist, venue: g.venue,
                    sessions: g.sessions,
                    avgEngagedMs: Math.round(g.engagedMsSum / g.sessions),
                    visualInterestRate: visualInterest,
                    avgPhotosViewed,
                    scrollDepth,
                    conversions: g.conversions,
                    // Score composite : intérêt visuel + rétention (scroll profond)
                    score: Math.round(g.sessions * (WEIGHT_INTEREST * (visualInterest / 100) + WEIGHT_RETENTION * (scrollDepth / 100)))
                };
            })
            .sort((a, b) => b.score - a.score || b.sessions - a.sessions);
    }

    // ================================================================
    // KPI 4 — SOURCES DE TRAFIC NETTOYÉES
    // ================================================================

    _computeSources(sessions) {
        const bySource = new Map();
        for (const s of sessions) {
            const key = s.source || 'direct';
            if (!bySource.has(key)) {
                bySource.set(key, { source: key, sessions: 0, engaged: 0, engagedMsSum: 0, conversions: 0 });
            }
            const entry = bySource.get(key);
            entry.sessions++;
            if (s.totals.isEngaged) entry.engaged++;
            entry.engagedMsSum += s.totals.engagedMs;
            if (s.totals.conversions >= 1) entry.conversions++;
        }

        return Array.from(bySource.values())
            .map(e => ({
                source: e.source,
                sessions: e.sessions,
                engagedSessions: e.engaged,
                // Une source est « qualifiée » si ses visiteurs s'engagent
                engagementRate: this._pct(e.engaged, e.sessions),
                avgEngagedMs: Math.round(e.engagedMsSum / e.sessions),
                conversions: e.conversions,
                conversionRate: this._pct(e.conversions, e.sessions)
            }))
            .sort((a, b) => b.sessions - a.sessions);
    }

    // ================================================================
    // CAMPAGNES
    // ================================================================

    _computeCampaigns(sessions) {
        const byCampaign = new Map();
        for (const s of sessions) {
            if (!s.campaign || typeof s.campaign.id !== 'string') continue;
            const key = s.campaign.id;
            if (!byCampaign.has(key)) {
                byCampaign.set(key, {
                    id: key, source: s.campaign.source || null,
                    sessions: 0, engaged: 0, engagedMsSum: 0, conversions: 0
                });
            }
            const c = byCampaign.get(key);
            c.sessions++;
            if (s.totals.isEngaged) c.engaged++;
            c.engagedMsSum += s.totals.engagedMs;
            if (s.totals.conversions >= 1) c.conversions++;
        }

        return Array.from(byCampaign.values())
            .map(c => ({
                id: c.id,
                source: c.source,
                sessions: c.sessions,
                avgEngagedMs: Math.round(c.engagedMsSum / c.sessions),
                engagementRate: this._pct(c.engaged, c.sessions),
                conversions: c.conversions,
                conversionRate: this._pct(c.conversions, c.sessions)
            }))
            .sort((a, b) => b.sessions - a.sessions);
    }

    // ================================================================
    // KPI 5 — TOP ARTISTES / SALLES
    // ================================================================

    _computeArtists(sessions) {
        const byArtist = new Map();
        const byVenue = new Map();

        for (const s of sessions) {
            for (const p of s.pages) {
                if (p.type !== 'gallery') continue;
                if (p.artist) {
                    if (!byArtist.has(p.artist)) {
                        byArtist.set(p.artist, { name: p.artist, sessions: 0, engagedMsSum: 0, interested: 0, photoViewsSum: 0 });
                    }
                    const a = byArtist.get(p.artist);
                    a.sessions++;
                    a.engagedMsSum += p.engagedMs;
                    if (p.fullscreenOpens >= 1) a.interested++;
                    a.photoViewsSum += p.photosViewed;
                }
                if (p.venue) {
                    if (!byVenue.has(p.venue)) {
                        byVenue.set(p.venue, { name: p.venue, sessions: 0, engagedMsSum: 0, interested: 0 });
                    }
                    const v = byVenue.get(p.venue);
                    v.sessions++;
                    v.engagedMsSum += p.engagedMs;
                    if (p.fullscreenOpens >= 1) v.interested++;
                }
            }
        }

        const rank = (entry) => ({
            name: entry.name,
            sessions: entry.sessions,
            avgEngagedMs: Math.round(entry.engagedMsSum / entry.sessions),
            visualInterestRate: this._pct(entry.interested, entry.sessions),
            avgPhotosViewed: entry.photoViewsSum === undefined ? null : Math.round((entry.photoViewsSum / entry.sessions) * 10) / 10
        });

        return {
            artists: Array.from(byArtist.values()).map(rank).sort((a, b) => b.sessions - a.sessions),
            venues: Array.from(byVenue.values()).map(rank).sort((a, b) => b.sessions - a.sessions)
        };
    }

    // ================================================================
    // UTILITAIRES
    // ================================================================

    /** Pourcentage entier (0 si le dénominateur est nul) */
    _pct(part, total) {
        if (!total) return 0;
        return Math.round((part / total) * 100);
    }
}

module.exports = AnalyticsService;
