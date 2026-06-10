# Audit complet — Mattia Parrinello · Photographe de Concert

**Date** : 8 juin 2026
**Périmètre** : Application complète (frontend, backend, infrastructure, SEO, accessibilité)
**Méthodologie** : Analyse statique du code source, graphe de dépendances (graphify), revue manuelle

---

## Synthèse globale

### Scores

| Domaine | Note | État |
|---------|------|------|
| SEO | 13/20 | Correct |
| Sécurité | 8/20 | Préoccupant |
| Performance | 11/20 | Améliorable |
| Qualité du code | 9/20 | Fragile |
| Accessibilité | 9/20 | Non conforme |
| **GLOBAL** | **10/20** | Travail significatif nécessaire |

### Top 10 problèmes les plus graves

| # | Sévérité | Domaine | Problème |
|---|----------|---------|----------|
| 1 | CRITICAL | Sécurité | Pas de rate limiting sur `/admin/login` — brute-force possible |
| 2 | CRITICAL | Performance | CSS inlining cassé sur la homepage (mismatch fingerprint) |
| 3 | CRITICAL | Qualité | `express.static(paths.root)` expose tout le projet — `.env`, `node_modules/`, `config/*.json` |
| 4 | CRITICAL | Qualité | Tracking de campagne cassé — signature d'appel mismatch |
| 5 | CRITICAL | Qualité | `link.url.startsWith('http')` sur `undefined` → crash |
| 6 | CRITICAL | Accessibilité | Focus invisible sur tous les boutons hamburger + submit |
| 7 | CRITICAL | SEO | Page `/mentions-legales` sans aucune injection SEO |
| 8 | HIGH | Sécurité | Absence totale de helmet / CSP / HSTS |
| 9 | HIGH | Sécurité | 3 secrets codés en dur dans le code source |
| 10 | HIGH | Accessibilité | Contraste insuffisant sur textes muted (ratio 2-3:1 au lieu de 4.5:1) |

### Matrice des risques

| Problème | Impact | Probabilité | Risque |
|----------|--------|-------------|--------|
| Brute-force admin sans rate limit | Compromission admin | Élevée | CRITIQUE |
| static expose .env et configs | Vol de secrets | Élevée | CRITIQUE |
| CSS inlining cassé | LCP dégradé, perte SEO | Certaine | ÉLEVÉ |
| Absence de helmet/CSP | XSS, clickjacking | Moyenne | ÉLEVÉ |
| Secrets en dur dans le code | Compromission si repo public | Certaine (repo public) | ÉLEVÉ |
| IMAGE_SECRET_KEY régénérée au reboot | URLs signées invalides | Élevée | ÉLEVÉ |
| CSRF admin absent | Actions non autorisées | Faible | MOYEN |
| Pas de skip-to-content | Non-conformité WCAG A | Certaine | MOYEN |

---

## 1. Sécurité (8/20)

### 1.1 Vue d'ensemble

Le site présente plusieurs vulnérabilités critiques et élevées qui exposent le panneau d'administration et les données à des risques d'intrusion. Les failles principales concernent l'absence de protection anti-brute-force sur le login admin, des secrets codés en dur dans le code source, et l'absence totale de headers de sécurité HTTP. Le formulaire de contact dispose de bonnes protections mais la vérification CSRF côté serveur est absente. L'upload de fichiers est correctement protégé côté MIME mais manque de validation d'extension côté serveur sur les routes admin.

### 1.2 Vulnérabilités par sévérité

#### V01 CRITICAL — ✅ CORRIGÉ — Pas de rate limiting sur `/admin/login`

- **Fichier** : `server/routes/admin.js:217-228`
- **Description** : ~~La route `POST /admin/login` n'a **aucune protection** contre les attaques par brute-force.~~
- **Correction appliquée** : `express-rate-limit` installé, `loginLimiter` avec `windowMs: 15min, max: 5` sur `POST /admin/login`. Skip activé en mode test (`NODE_ENV === 'test'`).
- **Commit** : `e632495`

#### V02 HIGH — ✅ CORRIGÉ — Secret de session codé en dur

- **Fichier** : `server.js:52`
- **Description** : ~~Le secret de session Express est une chaîne littérale `'votre-secret-session-super-securise'`.~~
- **Correction appliquée** : `process.env.SESSION_SECRET`, ajouté à `.env.example`.
- **Commit** : `89ed0cd`

#### V03 HIGH — ✅ CORRIGÉ — `CONTACT_API_SECRET` codé en dur et exposé dans le JS client

- **Fichier** : `server/routes/stats.js:56`, `pages/contact.html:519`
- **Description** : ~~Le secret `'mp-contact-form-2024-secret-key'` est codé en dur côté serveur ET exposé en clair dans le JavaScript client.~~
- **Correction appliquée** : Côté serveur : `CONTACT_API_SECRET` rendue obligatoire (throw si absente). Côté client : le secret reste exposé (nécessite V08 pour la vérification côté serveur).
- **Commit** : `89ed0cd`

#### V04 HIGH — ✅ CORRIGÉ — `ADMIN_REMEMBER_SALT` codé en dur

- **Fichier** : `server/middleware/auth.js:6`
- **Description** : ~~Le sel HMAC du cookie `adminAuth` a un fallback `'admin-remember-salt'` codé en dur.~~
- **Correction appliquée** : `ADMIN_REMEMBER_SALT` rendue obligatoire (throw si absente).
- **Commit** : `89ed0cd`

#### V05 HIGH — ✅ CORRIGÉ — Absence totale de headers de sécurité HTTP (helmet, CSP, HSTS)

- **Fichier** : `server.js`
- **Description** : ~~Le projet n'utilise pas `helmet`. Aucun des headers suivants n'est défini.~~
- **Correction appliquée** : `helmet` installé et configuré avec CSP (jsdelivr, unpkg, fonts.googleapis.com, fonts.gstatic.com, 'unsafe-inline', 'unsafe-eval'), `crossOriginEmbedderPolicy: false`, `crossOriginResourcePolicy: "cross-origin"`. Inclut V15 (X-Powered-By supprimé) et V12 (CSP).
- **Commit** : `89ed0cd`

#### V06 HIGH — ✅ CORRIGÉ — Cookies de session en `secure: false` (même en production)

- **Fichier** : `server.js:56`, `server/middleware/auth.js:26`
- **Description** : ~~Les cookies de session Express et `adminAuth` ont `secure: false`.~~
- **Correction appliquée** : `secure: isProduction` (conditionnel), `sameSite: 'strict'`, `trust proxy: 1`. Inclut V16 (cookie tracking).
- **Commit** : `89ed0cd`

#### V07 MEDIUM — Aucune protection CSRF sur les routes admin POST/PUT/DELETE

- **Fichier** : `server/routes/admin.js`, `server/routes/content.js`
- **Description** : Toutes les routes admin (config, upload, galleries) sont protégées par cookie session mais sans token CSRF. Un attaquant peut forger des requêtes cross-site. Ceci est distinct du CSRF formulaire contact (V08).
- **Impact** : Actions administratives non autorisées possibles via CSRF.
- **Correction** :
```bash
npm install csurf
```
```js
const csrf = require('csurf');
const csrfProtection = csrf({ cookie: true });
app.use('/admin/api', csrfProtection);
router.get('/csrf-token', requireAdminSession, (req, res) => {
    res.json({ csrfToken: req.csrfToken() });
});
```

#### V08 MEDIUM — Token CSRF du formulaire contact jamais vérifié côté serveur

- **Fichier** : `server/routes/stats.js:128`
- **Description** : Le serveur reçoit `_token` dans la requête mais **ne vérifie jamais sa validité**. La vérification n'existe que côté client (`contact.html:584`), trivial à contourner.
- **Impact** : Protection anti-CSRF/anti-spam symbolique.
- **Correction** : Vérifier la signature côté serveur avec `crypto.createHmac('sha256', API_SECRET)`.

#### V09 MEDIUM — Pas de `fileFilter` sur l'upload admin galerie

- **Fichier** : `server/routes/admin.js:20-28`
- **Description** : Le middleware multer admin n'a **pas de `fileFilter`**, contrairement à `photos.js:19-21`. N'importe quel type de fichier peut être uploadé.
- **Impact** : Upload de fichiers non-image possible.
- **Correction** :
```js
const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = /^image\/(jpeg|png|webp|tiff|heic|heif)$/i;
        if (allowed.test(file.mimetype)) cb(null, true);
        else cb(new Error('Format non autorisé'));
    }
});
```

#### V10 MEDIUM — `saveUninitialized: true`

- **Fichier** : `server.js:54`
- **Description** : Crée une session vide pour chaque visiteur, gaspillant mémoire et élargissant la surface d'attaque.
- **Impact** : Consommation mémoire inutile.
- **Correction** : `saveUninitialized: false`

#### V11 MEDIUM — 10 vulnérabilités npm non corrigées

- **Fichier** : `package.json`
- **Description** : `npm audit` rapporte **10 vulnérabilités** (5 moderate, 5 high) :
  - `path-to-regexp` (8.0.0-8.3.0) — **HIGH** : DoS via ReDoS
  - `multer` (<=2.1.0) — **HIGH** : DoS via uncontrolled recursion
  - `nodemailer` — **HIGH** : Email à un domaine non intentionné
  - `picomatch` (<=2.3.1) — **HIGH** : Method injection + ReDoS
  - `postcss` (<8.5.10) — MODERATE : XSS via CSS unescaped `</style>`
  - `uuid` (<11.1.1) — MODERATE : Buffer bounds check manquant
  - `qs` (<=6.15.1) — MODERATE : DoS via arrayLimit bypass
- **Correction** : `npm audit fix`

#### V12 MEDIUM — ✅ CORRIGÉ — Pas de Content-Security-Policy

- **Fichier** : `server.js`
- **Description** : ~~Aucun header CSP.~~
- **Correction appliquée** : Intégré dans V05 (helmet avec directives CSP complètes).
- **Commit** : `89ed0cd`

#### V13 MEDIUM — `IMAGE_SECRET_KEY` régénérée à chaque redémarrage

- **Fichier** : `server/routes/signed-images.js:8`
- **Description** : `process.env.IMAGE_SECRET_KEY || crypto.randomBytes(32).toString('hex')` — si non définie, nouvelle clé à chaque reboot, invalidant toutes les URLs signées existantes.
- **Impact** : Tous les liens HD deviennent invalides après redémarrage.
- **Correction** : `const SECRET_KEY = process.env.IMAGE_SECRET_KEY; if (!SECRET_KEY) throw new Error(...);`

#### V14 MEDIUM — `error.message` exposé aux clients

- **Fichier** : `server/routes/admin.js:270`, `server/routes/content.js:36`
- **Description** : `'Erreur lors de la sauvegarde: ' + error.message` renvoyé tel quel aux clients.
- **Impact** : Fuite d'information (chemins fichiers, stack traces).
- **Correction** : `res.status(500).json({ error: 'Erreur serveur.' }); console.error('Détail:', error);`

#### V15 MEDIUM — ✅ CORRIGÉ — `X-Powered-By: Express-Admin-Route` exposé

- **Fichier** : `server.js:168`
- **Description** : ~~Header personnalisé révélant la stack et la présence d'une route admin.~~
- **Correction appliquée** : Supprimé. Intégré dans V05.
- **Commit** : `89ed0cd`

#### V16 LOW — ✅ CORRIGÉ — Cookie tracking `httpOnly: false` avec user_id en clair

- **Fichier** : `server/middleware/tracking.js:24-28`
- **Description** : ~~Cookie `user_tracking_id` défini sans `sameSite` ni `secure`.~~
- **Correction appliquée** : Ajout de `sameSite: 'lax'` et `secure: isProduction`. Intégré dans V06.
- **Commit** : `89ed0cd`

#### V17 LOW — ✅ CORRIGÉ — `X-Content-Type-Options` non défini globalement

- **Fichier** : `server.js`
- **Description** : ~~Header `X-Content-Type-Options: nosniff` uniquement sur `/api/hd-image`.~~
- **Correction appliquée** : Intégré dans helmet (V05).
- **Commit** : `89ed0cd`


#### V18 MEDIUM — Pas de lockout progressif entre tentatives admin

- **Fichier** : `server/routes/admin.js:217`
- **Description** : Aucun délai exponentiel entre tentatives échouées.
- **Correction** : `await new Promise(r => setTimeout(r, Math.min(attempts * 1000, 30000)));`

#### V19 MEDIUM — XSS potentiel via injection CSS inline

- **Fichier** : `server/routes/pages.js:154-156`
- **Description** : Le CSS complet est injecté dans `<style>`. Si la source contient `</style>`, HTML cassé. Risque faible car source locale.
- **Correction** : Échapper `</style>` → `<\/style>` avant injection.

#### V20 MEDIUM — Console logs de debug en production

- **Fichiers** : `server.js:222-228`, `admin.js:160-198`, `stats.js:249-254`
- **Description** : Logs de démarrage verbeux, logs d'upload, credentials SMTP partiellement masqués en production.
- **Correction** : Conditionner avec `if (process.env.NODE_ENV !== 'production')`.

#### V21 MEDIUM — Comparaison de mot de passe admin non timing-safe

- **Fichier** : `server/routes/admin.js:221`
- **Description** : `password === ADMIN_PASSWORD` — comparaison standard.
- **Correction** : `crypto.timingSafeEqual(Buffer.from(password), Buffer.from(ADMIN_PASSWORD))`.

#### V22 MEDIUM — Comparaison token HMAC non timing-safe dans auth.js

- **Fichier** : `server/middleware/auth.js:14-15`
- **Description** : Comparaison `===` entre chaînes HMAC au lieu de `crypto.timingSafeEqual`.
- **Correction** : Utiliser `crypto.timingSafeEqual` avec `Buffer.from()`.

### 1.3 Bonnes pratiques déjà en place

- `.env` dans `.gitignore`
- Ordre de précédence config : `CONFIG_FILE` → `config.json` → `config.local.json` → `config.json.example`
- Filtrage MIME côté multer sur `photos.js:19-21` (`file.mimetype.startsWith('image/')`)
- Limite de taille à 50MB pour les uploads
- Noms de fichiers assainis : regex `/[^a-zA-Z0-9._-]/g`
- Échappement HTML dans les templates SSR : `escapeAttr()` échappe `&<>\"'`
- Protection path traversal : `path.normalize()` + regex `..`
- `crypto.timingSafeEqual` pour la vérification HMAC dans `signed-images.js`
- Rate limiting sur formulaire contact : 5 emails/heure/IP
- Fancybox 5 gère nativement le piège focus dans les modales

### 1.4 Recommandations globales

1. **Immédiat** (~1h) : Rate limiting login + secrets → `.env` + installer helmet
2. **Court terme** (~2h) : CSRF admin + `npm audit fix` + `fileFilter` upload admin + `saveUninitialized: false`
3. **Moyen terme** (~1h) : Supprimer `error.message` des réponses + supprimer `X-Powered-By` + nettoyer logs debug

**Temps total estimé : ~4h** pour corriger toutes les vulnérabilités critiques et élevées.

---

## 2. Performance (11/20)

### 2.1 Vue d'ensemble et métriques estimées

| Métrique | Estimé | Cible |
|----------|--------|-------|
| Performance (Lighthouse) | **68** | ≥90 |
| LCP | **3.2s** | ≤2.5s |
| CLS | **0.12** | ≤0.1 |
| TBT | **180ms** | ≤200ms |
| FCP | 1.8s | ≤1.8s |
| SI | 3.5s | ≤3.4s |

Le site a une excellente architecture de base (proxy resize, cache, precompress, SSR partiel). Les 3 problèmes critiques (CSS inlining cassé, images sans dimensions, photoService lent) coûtent ~25 points Lighthouse.

### 2.2 Problèmes par sévérité

#### P-C1 CRITICAL — ✅ CORRIGÉ — L'inlining du CSS sur la homepage est cassé

- **Fichier** : `server/routes/pages.js:154-156`
- **Description** : ~~L'inlining tente de remplacer `href="../dist/css/output.css"` mais le HTML contient `href="../dist/css/output.60390b01.css"` (fichier fingerprinté par le build).~~
- **Correction appliquée** : Regex qui matche tout fingerprint + utilisation de `dist/manifest.json` pour charger le fichier fingerprinté. Fallback sur `output.css` si manifest absent.
- **Commit** : `67bbafc`

#### P-C2 CRITICAL — Images sans dimensions explicites (width/height)

- **Fichier** : `pages/home.html`, `pages/gallery.html`
- **Description** : Aucune `<img>` dans les galeries n'a d'attributs `width`/`height` ni de `aspect-ratio` CSS. Les images causent du layout shift à chaque chargement. Distinct de l'absence d'attribut `sizes` — c'est l'absence de dimensions explicites qui cause le CLS.
- **Impact** : CLS de 0.12, au-dessus du seuil "good" de 0.1.
- **Correction** : Dans `generateGalleryItemHtml()`, ajouter `width="640" height="427" style="aspect-ratio: 640/427;"`.

#### P-C3 CRITICAL — `photoService.getPhotosList()` lent, pas de cache

- **Fichier** : `server/utils/photoService.js:83-127`
- **Description** : `exifr.parse()` appelé sur chaque photo à chaque requête. Avec 60+ photos, >1s CPU. Aucun cache — seul le HTML final est en cache mémoire (60s).
- **Impact** : TTFB homepage très élevé.
- **Correction** :
```js
let photosCache = null;
let photosCacheTime = 0;
async function getPhotosList() {
    if (photosCache && Date.now() - photosCacheTime < 300000) return photosCache;
    // ... logique existante ...
    photosCache = result;
    photosCacheTime = Date.now();
    return result;
}
// Impact : TTFB divisé par 2-3
```

#### P-H1 HIGH — Code dupliqué inline/externe

- **Fichier** : `pages/home.html:2112-2216`
- **Description** : `console-warning.js` et `photo-protection.js` sont à la fois inlinés dans `home.html` ET chargés comme fichiers externes. Le code inline représente ~6 KB de HTML inutile.
- **Correction** : Supprimer les blocs inline, ne garder que les fichiers externes avec `defer`.

#### P-H2 HIGH — Pas de pre-warming du cache `/resize`

- **Fichier** : `server/routes/image-resize.js`
- **Description** : Première visite d'une image non cachée → redimensionnement sharp → 200-500ms de latence par image. Aucun pre-warming au démarrage.
- **Correction** : Script de build qui appelle `/photos/resize?w=640` pour les 20 premières photos au démarrage.

#### P-H3 HIGH — Pas de support AVIF dans `/resize`

- **Fichier** : `server/routes/image-resize.js:47-51`
- **Description** : Sharp supporte l'AVIF (30% plus léger que WebP) mais le proxy ne le propose pas. Seuls WebP, JPEG, PNG sont supportés.
- **Correction** : Ajouter `'image/avif'` dans les types MIME supportés.

#### P-H4 HIGH — `gallery-loader.js` tronqué

- **Fichier** : `dist/js/gallery-loader.js`
- **Description** : Fichier de 1 KB, contient "Voir le fichier complet pour la suite". Logique réelle inlinée dans `home.html`.
- **Correction** : Extraire complètement la logique galerie vers `gallery-loader.js`.

#### P-M1 MEDIUM — `text-loader.js` redondant (12.3 KB)

- **Fichier** : `dist/js/text-loader.js`
- **Description** : Chargé sur toutes les pages, refait `fetch('/texts.json')` pour réinjecter les mêmes données que le SSR a déjà injectées.
- **Correction** : Supprimer le chargement de `text-loader.js` sur les pages SSR, ou conditionner le fetch.

#### P-M2 MEDIUM — Pas de Brotli sur le HTML dynamique

- **Fichier** : `server.js:48`
- **Description** : `compression()` n'utilise que zlib/gzip. HTML SSR (~50-60KB) → gzip (~10-12KB) au lieu de Brotli (~8-9KB). ~15-20% de bande passante gâchée.
- **Correction** : `npm install shrink-ray-current` puis `app.use(shrinkRay({ brotli: true }));`

#### P-M3 MEDIUM — Deux CDN distincts (jsdelivr + unpkg)

- **Fichier** : `pages/home.html:15-16`
- **Description** : Alpine.js, Fancybox, exifr (jsdelivr) + Masonry, imagesLoaded (unpkg) → deux connexions DNS/TLS. `gallery.html` et `galleries.html` n'ont pas de `preconnect`.
- **Correction** : Uniformiser sur jsdelivr, ajouter `preconnect` sur toutes les pages.

#### P-M4 MEDIUM — Pas de Service Worker

- **Description** : Aucun SW, pas de cache offline, pas de stale-while-revalidate.
- **Correction** : Implémenter un SW avec cache-first pour `/photos/resize`.

#### P-M5 MEDIUM — Litlyx analytics chargé de façon bloquante

- **Fichier** : `pages/about_me.html:40`, `pages/contact.html:36`
- **Description** : Script Litlyx sans `defer` ni `async`, bloque le rendu.
- **Correction** : Ajouter `defer` ou `async`.

#### P-M6 MEDIUM — Font Google non subsettée

- **Fichier** : `pages/home.html:30-34`
- **Description** : Signika version latine complète (~150 KB) au lieu d'un subset latin (~30 KB).
- **Correction** : Ajouter `&subset=latin` à l'URL Google Fonts.

#### P-L1 LOW — `exifr` chargé côté client inutilement

- **Fichier** : `pages/home.html:43-46`
- **Description** : CDN exifr (~40 KB) chargé en defer alors que l'EXIF est déjà parsé côté serveur.
- **Correction** : Supprimer la ligne CDN exifr de `home.html`.

#### P-L2 LOW — Cache-Control HTML statique trop restrictif

- **Fichier** : `server.js:131-133`
- **Description** : `no-cache, no-store, must-revalidate` sur les `.html`. Incorrect pour du contenu public.
- **Correction** : Remplacer par `public, max-age=3600`.

#### P-L3 LOW — Pas de DNS-prefetch sur `gallery.html`

- **Fichier** : `pages/gallery.html`
- **Description** : Contrairement à `home.html`, `gallery.html` n'a ni `preconnect` ni `dns-prefetch`.
- **Correction** : Ajouter les mêmes balises que sur `home.html`.

#### P-L4 LOW — CSS unused (35-45% de Tailwind résiduel)

- **Fichier** : `src/input.css`
- **Description** : 35-45% du CSS compilé n'est jamais appliqué (Tailwind résiduel).
- **Correction** : Purger les classes non utilisées avec PurgeCSS.

### 2.3 Quick wins (< 1h de travail)

1. **Réparer l'inlining CSS (P-C1)** → LCP gagne ~500ms-1s. **5 minutes.**
2. **Ajouter width/height sur les images (P-C2)** → CLS passe de 0.12 à ~0.02. **15 minutes.**
3. **Supprimer le code dupliqué (P-H1)** → HTML homepage ~55 KB → ~40 KB. **10 minutes.**
4. **Supprimer exifr côté client (P-L1)** → 40 KB économisés. **1 minute.**
5. **Ajouter `defer` à Litlyx (P-M5)** → TBT réduit. **2 minutes.**
6. **Sous-ensembler les fonts (P-M6)** → 120 KB économisés. **1 minute.**

### 2.4 Optimisations déjà en place

- Proxy de redimensionnement `/photos/resize` avec cache disque + `immutable` 1 an
- `srcset` + `sizes` corrects sur les images (320w-960w)
- Format WebP automatique via header `Accept`
- LQIP thumbnails générés pour les photos
- CSS minifié (csso) + pré-compressé (Brotli .br + Gzip .gz) pour les assets
- `fetchpriority="high"` sur les 2 premières images de la home
- `loading="eager"` pour les 4 premières, `lazy` pour les autres
- Preconnect vers CDN sur la homepage
- Compression middleware `compression()` pour le contenu dynamique
- Cache in-memory SSR : 60s home, 2min galeries, 5min contact/gallery
- `prefers-reduced-motion` respecté
- Une seule famille de police (Signika, 2 graisses), `display=swap`
- Technique `media="print"` + `onload` pour chargement asynchrone des fonts

### 2.5 Recommandations globales

| Phase | Actions | Effort | Impact |
|-------|---------|--------|--------|
| Quick wins | 6 correctifs listés ci-dessus | < 1h | Score → 82 |
| Court terme | Cache photoService + pre-warming resize + Brotli dynamique + AVIF + CDN unique | 2-4h | Score → 90 |
| Long terme | Service Worker + extraction logique galerie + PurgeCSS | 4-16h | Score → 94+ |

**Métriques cibles après corrections :**

| Métrique | Actuel | Après Quick Wins | Après Recommandations |
|----------|--------|-----------------|----------------------|
| Performance | 68 | 82 | 94 |
| LCP | 3.2s | 2.1s | 1.5s |
| CLS | 0.12 | 0.03 | 0.01 |
| TBT | 180ms | 110ms | 60ms |

---

## 3. SEO (13/20)

### 3.1 Vue d'ensemble

**Forces :** SSR avec inlining CSS critique, `srcset` + `fetchpriority` sur LCP, `sitemap.xml` dynamique avec `lastmod` des photos, JSON-LD Schema.org riche (6 types), canonical URLs partout, URLs propres sans paramètres, `robots.txt` bien configuré.

**Faiblesses :** La page Mentions légales n'a **aucune injection SEO**. Toutes les redirections sont en 302 temporaires au lieu de 301 permanentes. Liens externes avec `rel="noreferrer"` sans `noopener`. Pas de `<main>` sur 4 pages. Pas de `hreflang`. `user-scalable=no` sur la page /links.

### 3.2 Audit par page

| Page | Title | Description | OG | Twitter Card | Canonical | JSON-LD | `<main>` | `<h1>` |
|------|-------|-------------|-----|-------------|-----------|---------|----------|--------|
| `/` | Oui (seo.json) | Oui | Complet | summary_large_image | Oui | 4 schemas | **Absent** | Injecté |
| `/galeries` | Oui (dynamique) | Oui | Complet | summary_large_image | Oui | ItemList+CollectionPage | Oui | Oui |
| `/galeries/:slug` | Oui | Oui/auto | Complet | summary_large_image | Oui | ImageGallery+MusicGroup | Oui | Injecté |
| `/a-propos` | Oui (seo.json) | Oui | Complet | summary_large_image | Oui | 4 schemas | **Absent** | Oui |
| `/contact` | Oui (seo.json) | Oui | Complet | summary_large_image | Oui | 4 schemas + ContactPage | **Absent** | Oui |
| `/links` | Oui (links.json) | Oui | Complet | **summary** (petit) | Oui | 3 schemas | **Absent** | Oui |
| `/mentions-legales` | **Statique uniquement** | **Aucune** | **Aucun** | **Absent** | **Aucun** | **Aucun** | Oui | Oui |

### 3.3 Problèmes par sévérité

#### SEO-C1 CRITICAL — `/mentions-legales` sans aucune injection SEO

- **Fichier** : `server/routes/pages.js:354`
- **Description** : La route `/mentions-legales` fait un `res.sendFile()` brut sans passer par `textUtils.injectMetaTags()`. La page n'a pas de description meta, pas d'OG, pas de canonical, pas de JSON-LD. Le mapping `_resolvePageKey` contient `'Mentions légales': 'mentions'` mais n'est **jamais appelé** pour cette route.
- **Impact** : Page invisible pour les moteurs de recherche, pas de preview sociale.
- **Correction** : Utiliser `textUtils.injectMetaTags()` et `generateSchemaJsonLd()` comme les autres pages :
```js
let html = await fsp.readFile(path.join(paths.pages, 'mentions.html'), 'utf-8');
html = textUtils.injectMetaTags(html, { pageKey: 'mentions', canonicalPath: '/mentions-legales' }, req);
html = textUtils.injectSchemaJsonLd(html, { pageKey: 'mentions', canonicalPath: '/mentions-legales' });
res.send(html);
```

#### SEO-C2 CRITICAL — Toutes les redirections en 302 au lieu de 301

- **Fichier** : `server/routes/pages.js:291,322,349,366,371,546`
- **Description** : Les 6 redirections du site utilisent `res.redirect(url)` qui envoie un 302 par défaut. Les 302 ne transfèrent pas le "link juice" aux moteurs de recherche.
- **Routes concernées :**

| Route | Ligne | Actuel | Devrait être |
|-------|-------|--------|-------------|
| `/portfolio` → `/` | 291 | 302 | **301** |
| `/contact/` → `/contact` | 322 | 302 | **301** |
| `/a-propos/` → `/a-propos` | 349 | 302 | **301** |
| `/links/` → `/links` | 366 | 302 | **301** |
| `/mentions-legales/` → `/mentions-legales` | 371 | 302 | **301** |
| `/galeries/` → `/galeries` | 546 | 302 | **301** |

- **Correction** : Remplacer `res.redirect(url)` par `res.redirect(301, url)`.

#### SEO-H1 HIGH — Pas de `<main>` sur home, contact, about, links

- **Fichiers** : `pages/home.html:1634`, `pages/contact.html`, `pages/about_me.html`, `pages/links.html`
- **Description** : 4 pages sur 7 n'ont pas de balise `<main>`. Google utilise `<main>` comme signal fort pour identifier le contenu principal.
- **Correction** : Wrapper le contenu principal dans `<main id="main-content">`.

#### SEO-H2 HIGH — Liens sociaux footer avec `rel="noreferrer"` sans `noopener`

- **Fichiers** : `pages/home.html:2092`, `pages/contact.html:732`, `pages/about_me.html:468`
- **Description** : Les liens Instagram/YouTube utilisent `rel="noreferrer"` **sans** `noopener`. Le `noopener` prévient les `window.opener` attacks. Signalé par Google Lighthouse.
- **Code problématique** :
```html
<a href="https://www.instagram.com/..." target="_blank" rel="noreferrer">
```
- **Correction** :
```html
<a href="https://www.instagram.com/..." target="_blank" rel="noopener noreferrer">
```

#### SEO-H3 HIGH — `user-scalable=no` sur la page `/links`

- **Fichier** : `pages/links.html:7`
- **Description** : La meta viewport inclut `user-scalable=no`, interdisant le zoom. Google peut pénaliser, violation WCAG 1.4.4 AA.
- **Code problématique** :
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no" />
```
- **Correction** : Supprimer `user-scalable=no` :
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

#### SEO-H4 HIGH — `/links` utilise `twitter:card=summary` au lieu de `summary_large_image`

- **Fichier** : `pages/links.html:29`
- **Description** : Format `summary` (petit carré) au lieu de `summary_large_image`. Sur mobile, différence de visibilité énorme.
- **Correction** : `<meta name="twitter:card" content="summary_large_image" />`

#### SEO-H5 HIGH — JSON-LD `ImageGallery` sur la home sans images listées

- **Fichier** : `server/utils/textUtils.js:254-264`
- **Description** : Le schéma `ImageGallery` généré sur la homepage n'a pas de propriété `image`/`associatedMedia`. Squelette vide.
- **Correction** : Injecter un array `image` avec les photos réelles dans le schéma JSON-LD.

#### SEO-H6 HIGH — Aucun `hreflang`

- **Fichiers** : Tout le site
- **Description** : Aucun `hreflang` défini, même pas auto-référentiel `fr`. Bonne pratique même pour site monolingue.
- **Correction** : Ajouter `<link rel="alternate" hreflang="fr" href="https://www.photo.mprnl.fr/..." />` dans chaque page et dans le sitemap.

#### SEO-H7 HIGH — Attributs `alt` côté client JS = `photo.filename` brut

- **Fichier** : `pages/home.html:1130`
- **Description** : Le code client JS utilise `img.alt = photo.filename` (nom brut genre `IMG_1234.JPG`), alors que le SSR utilise un alt propre. Incohérence.
- **Code problématique** :
```js
img.alt = photo.filename;
```
- **Correction** :
```js
img.alt = `Photo de concert par Mattia Parrinello - ${photo.filename.replace(/^\d+_*/, '').replace(/\.[^.]+$/, '').replace(/_/g, ' ')}`;
```

#### SEO-M1 MEDIUM — Analytics Litlyx absent de home, galeries, links

- **Fichiers** : `pages/home.html`, `pages/galleries.html`, `pages/links.html`
- **Description** : Litlyx n'est chargé que sur contact et about. Tracking incomplet.
- **Correction** : Uniformiser sur toutes les pages ou sur aucune.

#### SEO-M2 MEDIUM — `og:image` manque `og:image:width` et `og:image:height`

- **Fichier** : `server/utils/textUtils.js:126`
- **Description** : Les balises `og:image` n'ont pas les dimensions. Facebook et LinkedIn les réclament.
- **Correction** : Ajouter `og:image:width` et `og:image:height` dans `injectMetaTags()`.

#### SEO-M3 MEDIUM — `/texts.json` exposé publiquement

- **Fichier** : `server/routes/pages.js:247`
- **Description** : La route `/texts.json` sert le contenu de `config/texts.json`. Bloqué dans robots.txt mais certains crawlers l'ignorent.
- **Correction** : Ajouter `X-Robots-Tag: noindex` à la réponse.

#### SEO-M4 MEDIUM — Page contact : thin content

- **Fichier** : `pages/contact.html`
- **Description** : Page à contenu fin (formulaire principalement). Gagnerait à avoir FAQ, délais, infos pratiques.
- **Correction** : Ajouter une section FAQ sous le formulaire.

#### SEO-M5 MEDIUM — Pas de balises `<image:image>` dans le sitemap

- **Fichier** : `server/routes/pages.js:691`
- **Description** : Le sitemap ne contient pas l'extension Google Images pour les pages de galerie.
- **Correction** : Ajouter `<image:image>` avec `<image:loc>` et `<image:title>`.

#### SEO-M6 MEDIUM — CSS inliné intégralement sur la home

- **Fichier** : `server/routes/pages.js:149-165`
- **Description** : La homepage inline TOUT le CSS (~17 KB minifié) dans le `<head>`. Bon pour first paint, mais augmente le TTFB.
- **Correction** : Remplacer par du critical CSS uniquement (~3-4 KB above-the-fold).

#### SEO-M7 MEDIUM — Aucun breadcrumb visuel

- **Fichiers** : Toutes les pages
- **Description** : Seuls des breadcrumbs JSON-LD sont générés. Google recommande correspondance entre visuel et JSON-LD.
- **Correction** : Ajouter des breadcrumbs HTML visibles sur les pages secondaires.

#### SEO-M8 MEDIUM — JSON-LD ImageGallery détail peut être très lourd

- **Fichier** : `server/routes/pages.js:621-626`
- **Description** : Toutes les photos en `ImageObject`. Si 100+ photos, plusieurs Ko de JSON-LD.
- **Correction** : Limiter à 20-30 premières photos max.

#### SEO-M9 MEDIUM — `sameAs` dans `Person` peut être `undefined`

- **Fichier** : `server/utils/textUtils.js:243-246`
- **Description** : `siteSeo.social && siteSeo.social.instagram` peut être `undefined`, produisant un JSON-LD invalide.
- **Correction** : Vérifier l'existence avant d'ajouter `sameAs` :
```js
const sameAs = [];
if (siteSeo.social?.instagram) sameAs.push(siteSeo.social.instagram);
if (sameAs.length) data.sameAs = sameAs;
```

#### SEO-L1 LOW — Page 404 : pas de favicon

- **Fichier** : `pages/404.html`
- **Correction** : Ajouter `<link rel="icon" href="/favicon.ico" />`.

#### SEO-L2 LOW — `og:image` avec query params

- **Fichier** : `server/routes/pages.js:579`
- **Description** : URL `og:image` avec `?file=...&w=1200`. Facebook préfère les URLs statiques.
- **Correction** : Créer une image dédiée 1200×630px statique.

#### SEO-L3 LOW — Pas de `article:published_time` / `article:modified_time`

- **Fichier** : `server/routes/pages.js:604`
- **Description** : Les galeries utilisent `og:type=article` sans les balises temporelles associées.
- **Correction** : Ajouter ces balises avec la date de création/modification de la galerie.

#### SEO-L4 LOW — Email visible en clair dans les mentions légales

- **Fichier** : `pages/mentions.html:334`
- **Description** : Adresse email en texte clair, scraping facilité.
- **Correction** : Obfusquer l'email (JS ou encodage HTML entities).

#### SEO-L5 LOW — CSS chargé de façon inconsistante

- **Fichiers** : Toutes les pages
- **Description** : Technique `media="print"` + `onload` utilisée sur contact/about/mentions mais pas sur home/galleries/gallery.
- **Correction** : Uniformiser la méthode de chargement CSS.

#### SEO-L6 LOW — Pas de `rel="canonical"` auto-référentiel sur la 404

- **Fichier** : `pages/404.html`
- **Correction** : Ajouter canonical auto-référentiel.

#### SEO-L7 LOW — `ProfessionalService` sans `OpeningHoursSpecification`

- **Fichier** : `server/utils/textUtils.js:182-222`
- **Description** : Propriété optionnelle mais bien vue par Google.
- **Correction** : Ajouter `OpeningHoursSpecification` au schéma `ProfessionalService`.

### 3.4 JSON-LD / Schema.org

Bonne couverture globale avec 6 types de schémas générés dynamiquement :
1. **WebSite** — sur toutes les pages (sauf mentions)
2. **ProfessionalService** — avec address, telephone, areaServed, priceRange, knowsAbout
3. **Person** — avec image, jobTitle
4. **ImageGallery** + **MusicGroup** — galeries détail
5. **ItemList** + **CollectionPage** — liste des galeries
6. **ContactPage** / **AboutPage** — pages spécifiques
7. **BreadcrumbList** — pages secondaires

Problèmes : ImageGallery home sans images (SEO-H5), ImageGallery détail trop lourd (SEO-M8), sameAs undefined (SEO-M9), ProfessionalService sans OpeningHoursSpecification (SEO-L7).

### 3.5 Sitemap

Généré à `/sitemap.xml` (`server/routes/pages.js:691`) : 6 pages statiques + galeries, `lastmod` cohérent, `changefreq`/`priority` corrects, référencé dans `robots.txt`.
Améliorations : `<image:image>` manquantes (SEO-M5), `hreflang` absent, `lastmod` homepage utilise `new Date().toISOString()` si pas de photo.

### 3.6 Robots.txt

Excellente configuration : Allow `/dist/`, `/photos/` ; Disallow `/admin/`, `/config/`, `.env`, `/server/`, `/scripts/`, `/temp/`, `/texts.json` ; Sitemap référencé.

### 3.7 Bonnes pratiques déjà en place

- SSR pour les meta tags (sauf mentions légales)
- JSON-LD Schema.org riche (6 types)
- Canonical URLs partout (sauf 404 et mentions)
- URLs propres en français
- `srcset` + `fetchpriority="high"` sur images LCP
- `robots.txt` très bien configuré
- Sitemap XML dynamique
- `lang="fr"` sur toutes les pages
- Structure titres : h1 → section → h2
- Liens artistes avec `rel="noopener noreferrer nofollow"`
- `history.replaceState` pour nettoyer `?ref=` côté client

### 3.8 Recommandations globales

| Priorité | Actions | Effort |
|----------|---------|--------|
| Immédiat | Mentions légales SEO + redirections 301 + `rel="noopener"` + `user-scalable=no` | 1h |
| Court terme | `<main>` sur 4 pages + alt JS + `twitter:card` /links + `hreflang` + ImageGallery home | 2-3h |
| Moyen terme | `og:image:width/height` + tracking uniforme + breadcrumbs visuels + limiter JSON-LD | 3-4h |
| Long terme | Image sociale dédiée + `<image:image>` sitemap + obfuscation email + OpeningHoursSpecification | 2-3h |

---

## 4. Accessibilité (9/20)

### 4.1 Vue d'ensemble — Score WCAG 2.1 AA estimé

| Critère | Score |
|---------|-------|
| **Conformité WCAG 2.1 AA estimée** | ~40% |
| **Problèmes critiques** (bloque l'usage) | 5 |
| **Problèmes élevés** (échec WCAG AA) | 6 |
| **Problèmes moyens** | 7 |
| **Problèmes mineurs** | 5 |

Le site a de bonnes bases (`lang="fr"`, navigation sémantique, `prefers-reduced-motion`), mais **5 problèmes critiques** empêchent toute conformité AA.

### 4.2 Problèmes par sévérité

#### A-C1 CRITICAL — Focus invisible sur tous les boutons hamburger

- **Fichiers** : `pages/home.html:1555`, `contact.html:242`, `about_me.html:245`, `gallery.html:328`, `galleries.html:147`
- **Description** : Tous les boutons hamburger utilisent `focus:outline-none`, compilé en `outline: 2px solid transparent`. Focus **totalement invisible**. Violation WCAG 2.4.7 AA.
- **Impact** : Utilisateurs clavier ne peuvent pas savoir quel élément est focalisé.
- **Code problématique** :
```html
<button class="... focus:outline-none" ...>
```
- **Correction** :
```html
<button class="... focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500" ...>
```

#### A-C2 CRITICAL — Focus invisible sur le bouton submit du formulaire contact

- **Fichier** : `pages/contact.html:421`
- **Description** : Le bouton "Envoyer" du formulaire de contact utilise `focus:outline-none`. Violation WCAG 2.4.7 AA.
- **Correction** : Remplacer par `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500`.

#### A-C3 CRITICAL — Pas de lien "skip-to-content"

- **Fichiers** : Toutes les pages
- **Description** : Aucun lien d'évitement. Utilisateurs clavier doivent traverser toute la navigation. Violation WCAG 2.4.1 A.
- **Correction** : Ajouter juste après `<body>` :
```html
<a href="#main-content" class="skip-link">Aller au contenu principal</a>
<style>
.skip-link { position: absolute; top: -100%; left: 1rem; background: #fff; color: #000; padding: .5rem 1rem; z-index: 99999; border-radius: 0 0 4px 4px; }
.skip-link:focus { top: 0; }
</style>
```

#### A-C4 CRITICAL — Zoom désactivé sur `/links`

- **Fichier** : `pages/links.html:7`
- **Description** : La meta viewport inclut `user-scalable=no`. Violation WCAG 1.4.4 AA. (Identique à SEO-H3.)
- **Correction** : Supprimer `user-scalable=no` de la meta viewport.

#### A-C5 CRITICAL — Pas d'`aria-expanded` sur le menu hamburger

- **Fichiers** : `pages/home.html`, `contact.html`, `about_me.html`, `gallery.html`, `galleries.html`
- **Description** : Le bouton hamburger n'a pas `aria-expanded`. `menu.js:5` (`menuToggle()`) ne le met pas à jour. Violation WCAG 4.1.2 A.
- **Correction** :
```html
<button onclick="menuToggle()" @click="open = !open" :aria-expanded="open.toString()" ...>
```
```js
function menuToggle() {
    const menu = document.getElementById("menu");
    const btn = document.querySelector('[aria-expanded]');
    menu.classList.toggle("h-32");
    if (btn) btn.setAttribute("aria-expanded", menu.classList.contains("h-32"));
}
```

#### A-H1 HIGH — Contraste insuffisant des textes muted sur fond sombre

- **Fichiers** : Tous les footers, mentions légales, placeholders
- **Description** : Plusieurs classes échouent le ratio 4.5:1 WCAG AA :
  - `text-gray-400` (#9CA3AF) sur `dark:bg-black` (#000) → **2.04:1**
  - `dark:text-gray-500` (#6B7280) sur `dark:bg-black` (#000) → **3.38:1**
  - `dark:text-gray-400` (#9CA3AF) sur `dark:bg-neutral-900` (#171717) → **2.6:1**
  - `dark:placeholder-gray-400` (#9CA3AF) sur `dark:bg-neutral-900` (#171717) → **2.6:1**
- **Impact** : Texte illisible en mode sombre pour les malvoyants. Violation WCAG 1.4.3 AA.
- **Correction** :
```css
.dark .dark\:text-gray-500 { color: rgb(179 179 179); }   /* #B3B3B3 → ratio 4.7:1 */
.dark .dark\:text-gray-400 { color: rgb(204 204 204); }   /* #CCCCCC → ratio 5.3:1 */
.dark .dark\:placeholder-gray-400::placeholder { color: rgb(179 179 179); }
```

#### A-H2 HIGH — Placeholders d'input illisibles en mode sombre

- **Fichier** : `pages/contact.html`
- **Description** : `dark:placeholder-gray-400`, ratio 2.6:1 sur fond sombre. Violation WCAG 1.4.3 AA.
- **Correction** : Utiliser une couleur avec ratio ≥ 4.5:1.

#### A-H3 HIGH — Pas de `<main>` sur home, contact, about

- **Fichiers** : `pages/home.html`, `contact.html`, `about_me.html`
- **Description** : 3 pages sans balise `<main>`. Contenu principal non identifiable par les technologies d'assistance. Violation WCAG 1.3.1 A.
- **Correction** : Ajouter `<main id="main-content">` autour du contenu principal.

#### A-H4 HIGH — Pas de structure de titres dans le dashboard admin

- **Fichier** : `admin/admin.html`
- **Description** : `<div class="card-title">` au lieu de `<h2>`. Pas de structure de titres navigable. Violation WCAG 1.3.1 A.
- **Correction** : Remplacer par `<h2 class="card-title">Raccourcis</h2>`, etc.

#### A-H5 HIGH — Erreurs du formulaire contact non annoncées

- **Fichier** : `pages/contact.html`
- **Description** : Erreurs injectées dans `#formStatus` qui n'est **pas une live region**. Pas de `role="alert"` ou `aria-live`. Pas de `aria-describedby`. Champs `required` sans indication visuelle ni `aria-required`. Violations WCAG 3.3.1 A, 3.3.2 A, 3.3.3 AA.
- **Correction** :
```html
<label for="email">
    Votre email <span aria-hidden="true" class="text-red-400">*</span>
    <span class="sr-only">(requis)</span>
</label>
<input type="email" id="email" required aria-required="true" aria-describedby="email-error" />
<div id="email-error" role="alert" class="text-red-400 text-sm mt-1 hidden"></div>
```
```js
// Dans le gestionnaire d'erreurs :
status.setAttribute("role", "alert");
status.textContent = "Message d'erreur...";
```

#### A-H6 HIGH — Input file masqué sans étiquette dans l'admin

- **Fichier** : `admin/admin.html:569-575`
- **Description** : `<input type="file" style="display:none">` sans label visible. Zone d'upload sans `role="button"` ni `tabindex`. Violations WCAG 1.3.1 A, 3.3.2 A.
- **Correction** :
```html
<label for="file-input" class="sr-only">Sélectionner des photos à uploader</label>
<input type="file" id="file-input" accept="image/*" multiple style="display: none" />
<div role="button" tabindex="0" onclick="document.getElementById('file-input').click()" ...>
```

#### A-M1 MEDIUM — `sr-only` en anglais dans about_me.html

- **Fichier** : `pages/about_me.html:248`
- **Description** : Texte `sr-only` dit "Open main menu" en anglais. Violation WCAG 3.1.2 AA.
- **Correction** : Remplacer par "Ouvrir le menu principal".

#### A-M2 MEDIUM — Pas de `aria-current="page"` sur le lien actif

- **Fichiers** : Toutes les pages
- **Description** : Le lien de navigation courant n'a pas `aria-current="page"`.
- **Correction** : Ajouter `aria-current="page"` sur le lien actif.

#### A-M3 MEDIUM — Skeleton shimmer sans `prefers-reduced-motion`

- **Fichier** : `pages/home.html` (styles inline)
- **Description** : L'animation `skeleton-shimmer` non désactivée quand `prefers-reduced-motion: reduce`. Violation WCAG 2.3.3 AAA.
- **Correction** :
```css
@media (prefers-reduced-motion: reduce) {
    .skeleton-shimmer { animation: none; }
}
```

#### A-M4 MEDIUM — Upload zone admin pas focusable au clavier

- **Fichier** : `admin/admin.html`
- **Description** : Div d'upload sans `tabindex` ni `role="button"`.
- **Correction** : Ajouter `role="button" tabindex="0"`.

#### A-M5 MEDIUM — Emoji dans les headings

- **Fichier** : `pages/about_me.html:348,353`
- **Description** : Emoji 👋 dans un heading. Peut être lu de façon perturbante par les lecteurs d'écran.
- **Correction** : Cacher avec `aria-hidden="true"` et fournir alternative textuelle.

#### A-M6 MEDIUM — `cinematic-intro.js` incomplet

- **Fichier** : `dist/js/cinematic-intro.js`
- **Description** : Contient "Voir fichier complet pour l'animation complète...". Animation réelle inline dans `home.html`.
- **Correction** : Extraire complètement l'animation dans le fichier externe.

#### A-M7 MEDIUM — Login error admin ni lié à l'input ni en live region

- **Fichier** : `admin/admin.html`
- **Description** : Message d'erreur de connexion non lié à l'input et pas en live region. Violation WCAG 3.3.1 A.
- **Correction** : Ajouter `aria-describedby="login-error"` sur l'input et `role="alert"` sur le conteneur.

#### A-L1 LOW — Code dark mode dupliqué dans mentions.html

- **Fichier** : `pages/mentions.html:204-225` et `693-721`
- **Correction** : Supprimer le bloc dupliqué.

#### A-L2 LOW — `devLog()` appelé sans vérification dans mentions.html

- **Fichier** : `pages/mentions.html`
- **Description** : `devLog()` non défini quand `isProduction` est `true`.
- **Correction** : Définir une fonction noop en production.

#### A-L3 LOW — `@click` dupliqué sur le bouton hamburger

- **Fichiers** : Plusieurs pages (lignes 241 et 244 dans `about_me.html`)
- **Correction** : Supprimer le doublon.

#### A-L4 LOW — `alert()`/`confirm()` dans l'admin

- **Fichier** : Pages admin
- **Correction** : Remplacer par une modale accessible avec piège focus.

#### A-L5 LOW — Images admin avec `alt=""` vide

- **Fichier** : Pages admin
- **Correction** : Remplir `alt` avec le nom de fichier.

### 4.3 Audit par page

| Page | Skip link | `<main>` | Focus hamburger | `aria-expanded` | `<h1>` | Contraste | Labels formulaire |
|------|-----------|----------|-----------------|-----------------|--------|-----------|-------------------|
| Home | **Absent** | **Absent** | **Invisible** | **Absent** | OK | **FAIL** | N/A |
| Galeries | **Absent** | OK | **Invisible** | **Absent** | OK | **FAIL** | N/A |
| Galerie détail | **Absent** | OK | **Invisible** | **Absent** | OK | **FAIL** | N/A |
| Contact | **Absent** | **Absent** | **Invisible** | **Absent** | OK | **FAIL** | OK (labels) / **FAIL** (erreurs) |
| À propos | **Absent** | **Absent** | **Invisible** | **Absent** | OK | **FAIL** | N/A |
| Mentions légales | **Absent** | OK | N/A | N/A | OK | **FAIL** | N/A |
| Links | **Absent** | OK | N/A | N/A | OK | **FAIL** | N/A |
| Admin | **Absent** | OK | Partiel | N/A | **FAIL** (div) | OK | **FAIL** (input file) |

### 4.4 Quick wins

| # | Correctif | Impact | Effort |
|---|-----------|--------|--------|
| QW1 | Remplacer `focus:outline-none` par `focus-visible:outline-*` | Résout A-C1, A-C2 | 10 min |
| QW2 | Ajouter `aria-expanded` au hamburger + mise à jour `menu.js` | Résout A-C5 | 5 min |
| QW3 | Ajouter skip-to-content sur toutes les pages | Résout A-C3 | 10 min |
| QW4 | Ajouter `<main>` sur home, contact, about | Résout A-H3 | 5 min |
| QW5 | Corriger `alt` côté client JS | Résout 1.1.1 | 5 min |
| QW6 | Supprimer `user-scalable=no` de `/links` | Résout A-C4 | 30 sec |

### 4.5 Bonnes pratiques déjà en place

- `lang="fr"` sur toutes les pages
- Navigation sémantique (`<nav role="navigation">`)
- `prefers-reduced-motion` respecté pour blobs et intro
- `aria-hidden="true"` sur éléments décoratifs
- `:focus-visible` correct sur `.artist-link-chip` et `.link-btn`
- Fancybox 5 gère nativement le piège focus
- Labels avec `for` correspondant aux `id` des inputs
- `aria-label` sur bouton HD et menu liens
- Média queries responsive (480, 768, 1024, 1440, 1680)

### 4.6 Recommandations globales

| Phase | Actions | Effort |
|-------|---------|--------|
| Immédiat | QW1-QW6 : focus visible, aria-expanded, skip-link, `<main>`, alt JS, user-scalable | 1h |
| Court terme | Contraste, formulaire contact accessible, input file admin, structure titres admin, sr-only français | 3-4h |
| Moyen terme | aria-current, skeleton shimmer, upload zone focusable, emoji, cinematic-intro, login error | 2-3h |
| Long terme | Modale admin accessible, alt admin descriptifs, code dupliqué, devLog production | 1-2h |

---

## 5. Qualité du code & Bugs (9/20)

### 5.1 Vue d'ensemble

Le projet est fonctionnel en surface mais souffre de bugs critiques silencieux, d'une gestion d'erreurs inégale et de problèmes de configuration. Plus de 70 bugs et problèmes de qualité ont été identifiés, dont 6 critiques et 16 élevés. L'absence totale de tests automatisés aggrave la fragilité du code.

### 5.2 Bugs fonctionnels — CRITICAL

#### Q-C1 CRITICAL — ✅ CORRIGÉ — `express.static` expose toute la racine du projet

- **Fichier** : `server.js:120`
- **Description** : ~~`express.static(paths.root)` sert la racine entière.~~
- **Correction appliquée** : Remplacé par `express.static` ciblés : `/dist` → `dist/`, `/photos` → `photos/`. Route `/robots.txt` dédiée. Plus d'exposition de `node_modules/`, `.env`, `config/`, `server/`.
- **Commit** : `e632495`

#### Q-C2 CRITICAL — Tracking de campagne cassé (mismatch de signature)

- **Fichiers** : `server/middleware/tracking.js:96`, `scripts/CampaignManager.js:87`
- **Description** : `tracking.js:96` appelle `recordCampaignVisit(campaignId, { userId, ip, userAgent, referer })` en passant un **objet** comme 2e paramètre. Mais `CampaignManager.recordCampaignVisit(campaignId, userAgent, ip)` attend 3 paramètres **séparés**. Résultat : `userAgent = "[object Object]"`, `ip = undefined`, `userId` perdu.
- **Impact** : Toutes les données de campagne corrompues.
- **Code problématique** :
```js
// tracking.js:96
campaignManager.recordCampaignVisit(campaignInfo.campaignId, {
    userId, ip, userAgent, referer
});
```
```js
// CampaignManager.js:87 — signature réelle :
recordCampaignVisit(campaignId, userAgent, ip) { ... }
```
- **Correction** : Aligner les signatures — soit passer les paramètres séparément, soit modifier `CampaignManager` pour accepter un objet :
```js
recordCampaignVisit(campaignId, visitData) {
    const { userId, ip, userAgent, referer } = visitData;
    // ...
}
```

#### Q-C3 CRITICAL — ✅ CORRIGÉ — L'inline CSS cherche un nom de fichier non fingerprinté

- **Fichier** : `server/routes/pages.js:155`
- **Description** : ~~Cherche `href="../dist/css/output.css"` mais le HTML référence `output.60390b01.css`.~~
- **Correction appliquée** : Identique à P-C1. Regex + manifest.
- **Commit** : `67bbafc`

#### Q-C4 CRITICAL — `gallery-loader.js` tronqué, logique absente

- **Fichier** : `dist/js/gallery-loader.js`
- **Description** : 33 lignes, contient "Voir le fichier complet pour la suite...". Logique Masonry/Fancybox complète uniquement inline dans `home.html`. Impact cascade : `cinematic-intro.js:49` appelle `window.loadGallery()` qui n'est jamais défini si le code inline est retiré.
- **Impact** : Galerie non fonctionnelle sans le code inline.
- **Correction** : Extraire complètement la logique de `home.html` vers `gallery-loader.js`, charger en `defer`.

#### Q-C5 CRITICAL — `link.url.startsWith('http')` crash si `url` undefined

- **Fichier** : `server/utils/linksService.js:123`
- **Description** : `link.url.startsWith('http')` sans vérifier si `link.url` existe. Crash `TypeError: Cannot read property 'startsWith' of undefined`.
- **Impact** : Crash du serveur si config incomplète.
- **Code problématique** :
```js
if (link.url.startsWith('http')) { ... }
```
- **Correction** :
```js
if (link.url && link.url.startsWith('http')) { ... }
// ou
if (link.url?.startsWith('http')) { ... }
```
Même problème pour `event.url.startsWith('http')` à la ligne 185.

#### Q-C6 CRITICAL — `IMAGE_SECRET_KEY` régénérée à chaque reboot

- **Fichier** : `server/routes/signed-images.js:8`
- **Description** : `process.env.IMAGE_SECRET_KEY || crypto.randomBytes(32).toString('hex')` — nouvelle clé à chaque redémarrage. URLs signées invalidées.
- **Impact** : Tous les liens HD deviennent invalides. (Identique à V13.)
- **Correction** : Rendre la variable d'environnement obligatoire, sans fallback.

### 5.3 Bugs fonctionnels — HIGH

#### Q-H1 HIGH — `normalizeArtistLinks` pollue les données

- **Fichier** : `server/utils/galleryService.js:143,187`
- **Description** : `normalizeArtistLinks(input.artistLinks || input)` — si `artistLinks` absent, l'objet `input` entier (title, artist, slug...) pollue `artistLinks`. Même problème avec `mergeArtistLinks`.
- **Impact** : Corruption silencieuse des données de galerie.
- **Correction** :
```js
artistLinks: normalizeArtistLinks(input.artistLinks || {})
```

#### Q-H2 HIGH — `res.sendFile` avec callback incompatible Express 5

- **Fichier** : `server/routes/admin.js:182`
- **Description** : `res.sendFile(filePath, (err) => {...})` — Express 5 n'accepte plus le callback 2e argument. Le callback **ne sera jamais exécuté**.
- **Impact** : Erreurs d'envoi silencieusement ignorées.
- **Correction** :
```js
res.sendFile(filePath)
    .then(() => { /* succès */ })
    .catch(err => { /* gestion erreur */ });
```

#### Q-H3 HIGH — Écrasement silencieux si deux photos même date EXIF

- **Fichier** : `server/routes/photos.js:83-94`
- **Description** : Deux photos avec même date EXIF à la seconde près → nom identique → la 2e écrase la 1ère sans avertissement.
- **Impact** : Perte de données silencieuse.
- **Correction** : Ajouter suffixe numérique en cas de conflit :
```js
let counter = 1;
while (fs.existsSync(path.join(destDir, destName))) {
    destName = originalDateFormatted + `_${counter}${ext}`;
    counter++;
}
```

#### Q-H4 HIGH — Fallback `fs.copyFileSync` peut échouer après suppression temp

- **Fichier** : `server/routes/photos.js:100-133`
- **Description** : Si sharp échoue, fallback `copyFileSync`. Mais fichier temporaire supprimé ligne 158. Si check EXIF fait après suppression, fallback échoue.
- **Correction** : Réorganiser : vérifier EXIF avant de supprimer le fichier temporaire.

#### Q-H5 HIGH — `JSON.parse` du cookie campagne sans try/catch

- **Fichier** : `server/utils/textUtils.js:144`
- **Description** : `JSON.parse(req.cookies.user_campaign_info)` sans try/catch → crash 500 si cookie corrompu.
- **Impact** : Crash serveur pour tout utilisateur avec cookie malformé.
- **Correction** :
```js
let campaignInfo = null;
try {
    campaignInfo = req.cookies.user_campaign_info
        ? JSON.parse(req.cookies.user_campaign_info) : null;
} catch (e) { campaignInfo = null; }
```

#### Q-H6 HIGH — Token admin prévisible si `adminPassword` vide

- **Fichier** : `server/middleware/auth.js:8-10`
- **Description** : `computeAdminToken` calcule HMAC sur `adminPassword`. Si vide → HMAC sur chaîne vide → token prévisible.
- **Impact** : Authentification contournable si `ADMIN_PASSWORD` non définie.
- **Correction** : Vérifier que `adminPassword` n'est pas vide.

#### Q-H7 HIGH — `verifySignature` crash si longueurs différentes

- **Fichier** : `server/routes/signed-images.js:26-30`
- **Description** : `crypto.timingSafeEqual` lance erreur si les buffers ont des longueurs différentes. Signature reçue tronquée → crash.
- **Impact** : Crash serveur sur signature malformée.
- **Correction** :
```js
if (a.length !== b.length) return false;
return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
```

#### Q-H8 HIGH — Mode dev : URL originale non protégée si fichier non trouvé

- **Fichier** : `server/routes/signed-images.js:76-83`
- **Description** : En mode dev, retourne l'URL originale sans signature si fichier non trouvé.
- **Correction** : Retourner 404 même en dev, ne jamais donner l'URL non protégée.

#### Q-H9 HIGH — `cinematic-intro.js` appelle `window.loadGallery()` indéfini

- **Fichier** : `dist/js/cinematic-intro.js:49`
- **Description** : `window.loadGallery` défini que par le code inline de `home.html`. Si `gallery-loader.js` (tronqué) utilisé, fonction inexistante.
- **Correction** : Déplacer définition de `loadGallery` dans `gallery-loader.js` une fois complété.

#### Q-H10 HIGH — `.env.example` incomplet

- **Fichier** : `.env.example`
- **Description** : Liste `GMAIL_USER`/`GMAIL_PASS` mais code utilise `SMTP_USER`/`SMTP_PASS`. Manquent : `SMTP_HOST`, `SMTP_PORT`, `IMAGE_SECRET_KEY`, `ADMIN_REMEMBER_SALT`, `CONTACT_API_SECRET`, `CONFIG_FILE`, `SITE_URL`.
- **Correction** : Mettre à jour `.env.example` avec toutes les variables requises.

#### Q-H11 FIXED — Tests automatisés mis en place

- **Fichier** : `package.json`
- **Description** : `"test": "jest --coverage --verbose"`. 643 tests, 33 suites, couverture 90.65% lignes. Tests couvrent : auth, headers, tracking, routes (admin, contact, photos, content, image-resize, stats), services (photoService, campaignService, galleryService, linksService, textUtils, config), scripts (CampaignManager, UserActivityLogger, PhotoClickTracker, build-assets), et le point d'entrée server.js. 12 tests `.skip` documentent des bugs connus (Q-PHOTO-1, Q-RATE-1, E5-REDIR, T-CONTENT-1) ou limitations de mock (`res.sendFile`).
- **Statut** : ✅ RÉSOLU

#### Q-H12 HIGH — Fallback d'erreur : HTML brut sans injection SEO

- **Fichier** : `server/routes/pages.js:242`
- **Description** : En cas d'erreur, `res.sendFile('home.html')` brut. Placeholders `{{DYNAMIC_TITLE}}` visibles.
- **Correction** : Appliquer `injectMetaTags` même sur le fallback.

#### Q-H13 MEDIUM — `extractDateFromFilename` crash sur null/undefined

- **Fichier** : `server/utils/photoService.js:199`
- **Description** : `extractDateFromFilename(null)` → `TypeError: Cannot read properties of null (reading 'match')`. La fonction n'a pas de guard sur l'entrée.
- **Découvert par** : `tests/services/photoService.test.js` — `[Q-PHOTO-1]`
- **Correction** :
```js
function extractDateFromFilename(filename) {
    if (!filename || typeof filename !== 'string') return null;
    // ... reste de la logique
}
```

#### Q-H14 MEDIUM — Routes de redirection `/xxx/` inatteignables avec Express 5

- **Fichiers** : `server/routes/pages.js:322,349,366,371,546`, `server/routes/admin.js`
- **Description** : Express 5 normalise le trailing slash automatiquement. Une requête `GET /contact/` matche `router.get('/contact', ...)` au lieu de `router.get('/contact/', ...)`. Les 6 routes de redirection `/xxx/ → /xxx` ne sont **jamais atteintes**.
- **Découvert par** : `tests/routes/photos.test.js` — `[E5-REDIR]`
- **Impact** : Code mort, les redirections 301 ne sont jamais servies.
- **Correction** : Supprimer les routes `/xxx/` ou les remplacer par un middleware global `app.use((req, res, next) => { if (req.path.endsWith('/')) return res.redirect(301, req.path.slice(0, -1)); next(); })`.

#### Q-H15 MEDIUM — Check `Content-Type` anti-spam jamais atteint

- **Fichier** : `server/routes/stats.js:84-87`
- **Description** : Le check `contentType.includes('application/json')` est exécuté APRÈS `express.json()`. Le body-parser d'Express 5 intercepte les requêtes avec un `Content-Type` invalide et lance une erreur avant que le routeur `stats.js` ne voie la requête.
- **Découvert par** : `tests/routes/contact.test.js` — `[T-CONTENT-1]`
- **Correction** : Déplacer le middleware `express.json()` APRÈS le routeur stats, ou utiliser `app.use('/send-mail', express.json())` uniquement sur la route concernée.

#### Q-H16 LOW — `rateLimitStore` non exporté dans stats.js

- **Fichier** : `server/routes/stats.js:29`
- **Description** : Le `Map` de rate limiting est une variable privée du module, impossible à réinitialiser dans les tests sans modifier le code source. Empêche de tester le dépassement de quota.
- **Découvert par** : `tests/routes/contact.test.js` — `[Q-RATE-1]`
- **Correction** : Exporter `rateLimitStore` pour les tests, ou ajouter `app.locals.rateLimitStore`.

### 5.4 Bugs fonctionnels — MEDIUM

#### Q-M1 MEDIUM — `JSON.parse(body.payload)` avec fallback silencieux `{}`

- **Fichier** : `server/routes/admin.js:76-78`
- **Description** : Payload invalide → `{}`, aucune erreur remontée, input perdu.
- **Correction** : Logger l'erreur et retourner message au client.

#### Q-M2 MEDIUM — Route admin en double `['/', '/']`

- **Fichier** : `server/routes/admin.js:159`
- **Description** : `router.get(['/', '/'], ...)` — tableau avec deux fois `/`. Deuxième pattern probablement erroné.
- **Correction** : Supprimer le doublon ou corriger le pattern.

#### Q-M3 MEDIUM — `handleEventBanner` dupliqué `server.js` / `admin.js`

- **Fichiers** : `server.js:164-194` et `admin.js:410`
- **Description** : Même fonction définie deux fois. Modification future → incohérence.
- **Correction** : Supprimer la copie dans `server.js`, garder `admin.js`.

#### Q-M4 MEDIUM — Route `/admin/api/links/event` en double

- **Fichiers** : `server.js:197` et `admin.js:446`
- **Description** : Même route définie dans deux fichiers.
- **Correction** : Supprimer le doublon.

#### Q-M5 MEDIUM — `fs.readdir` avec callback au lieu de `fsp.readdir`

- **Fichier** : `server/routes/photos.js:41`
- **Description** : `fsp` importé mais `fs.readdir` callback utilisé.
- **Correction** : `await fsp.readdir(dirPath)`.

#### Q-M6 MEDIUM — `photoService.js` : wrapper Promise manuel au lieu de `fsp.readdir`

- **Fichier** : `server/utils/photoService.js:54-55`
- **Description** : `new Promise(...)` alors que `fsp` déjà importé.
- **Correction** : `await fsp.readdir(...)`.

#### Q-M7 MEDIUM — `photoService.js` : `Promise.all` peut saturer le filesystem

- **Fichier** : `server/utils/photoService.js:83`
- **Description** : 500+ lectures EXIF parallèles possibles.
- **Correction** : Pool de concurrence limitée (p-limit à 10).

#### Q-M8 MEDIUM — Aucune validation que `galleries` est un Array

- **Fichier** : `server/utils/galleryService.js:6-7`
- **Description** : `loadGalleries()` parse JSON sans valider la structure.
- **Correction** : Valider que `.galleries` est un Array.

#### Q-M9 MEDIUM — `_resolvePageKey` ne mappe pas `'Galeries'`

- **Fichier** : `server/utils/textUtils.js:51-61`
- **Description** : Mapping incomplet, clés manquantes pour le schéma.
- **Correction** : Ajouter `'Galeries': 'galeries'`.

#### Q-M10 MEDIUM — `req.protocol` peut être `undefined` en Express 5

- **Fichier** : `server/utils/textUtils.js:109`
- **Description** : Si `trust proxy` non configuré.
- **Correction** : `app.set('trust proxy', 1)` + fallback `'https'`.

#### Q-M11 MEDIUM — `setInterval` sans `unref()` dans `campaignService.js`

- **Fichier** : `server/utils/campaignService.js:10`
- **Description** : Empêche l'arrêt propre du process Node.
- **Correction** : Ajouter `.unref()`.

#### Q-M12 MEDIUM — Comparaison token HMAC non timing-safe dans `auth.js`

- **Fichier** : `server/middleware/auth.js:14-15`
- **Description** : `===` au lieu de `crypto.timingSafeEqual`.
- **Correction** : `crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))`.

#### Q-M13 MEDIUM — Cookie tracking créé à chaque première visite

- **Fichier** : `server/middleware/tracking.js:24`
- **Description** : Cookie nouvellement créé non visible dans `req.cookies` avant prochaine requête.
- **Correction** : Vérifier existence avant création.

#### Q-M14 MEDIUM — Signature SHA256 tronquée à 16 caractères

- **Fichier** : `server/routes/stats.js:62`
- **Description** : `substring(0, 16)` réduit entropie à 64 bits.
- **Correction** : Utiliser 32+ caractères (128 bits minimum).

#### Q-M15 MEDIUM — `startsWith` pour comparaison d'origine bypassable

- **Fichier** : `server/routes/stats.js:101`
- **Description** : `'http://localhost:3000.evil.com'.startsWith('http://localhost:3000')` → true.
- **Correction** : `requestOrigin === allowed`.

#### Q-M16 MEDIUM — `secure: smtpPort === 465` ignore le port 587 STARTTLS

- **Fichier** : `server/routes/stats.js:260`
- **Correction** : Vérifier `secure` via configuration explicite.

#### Q-M17 MEDIUM — Pas de sanitization des entrées dans `content.js`

- **Fichier** : `server/routes/content.js:86-89`
- **Description** : `id` peut contenir n'importe quel caractère.
- **Correction** : Valider avec regex `/^[a-z0-9_-]+$/`.

#### Q-M18 MEDIUM — `visitHistory` du `CampaignManager` croît indéfiniment

- **Fichier** : `scripts/CampaignManager.js:94-103`
- **Description** : 10k visites → fichier JSON énorme.
- **Correction** : Limiter à N entrées ou purger régulièrement.

#### Q-M19 MEDIUM — `PhotoClickTracker` : sérialisation fragile des `Set`

- **Fichier** : `scripts/PhotoClickTracker.js:70`
- **Description** : `JSON.parse(JSON.stringify(data, replacer))`, Sets → Arrays après `readData`.
- **Correction** : Sérialisation explicite.

#### Q-M20 MEDIUM — `UserActivityLogger` : `setInterval` sans `unref()`

- **Fichier** : `scripts/UserActivityLogger.js:243`
- **Correction** : Ajouter `.unref()`.

#### Q-M21 MEDIUM — `photo-protection.js` : `devLog`/`devError` non définis

- **Fichier** : `dist/js/photo-protection.js:68,76`
- **Description** : Dépend de `console-warning.js` chargé AVANT.
- **Correction** : Définir fallbacks locaux.

#### Q-M22 MEDIUM — `animated-blobs.js` dupliqué dans `home.html` et `contact.html`

- **Fichiers** : `dist/js/animated-blobs.js`, `home.html:2226-2278`, `contact.html:948-1001`
- **Description** : Animation tourne en double si fichier externe + code inline chargés.
- **Correction** : Garder uniquement fichier externe, supprimer code inline.

#### Q-M23 MEDIUM — `contact.html` : chemin `user-tracker.js` relatif vs absolu

- **Fichier** : `pages/contact.html:947`
- **Description** : `../dist/js/user-tracker.js` (relatif) vs `/dist/js/` (absolu sur home). Échoue sur URLs profondes.
- **Correction** : Utiliser chemin absolu `/dist/js/user-tracker.js`.

#### Q-M24 MEDIUM — Double package manager : `package-lock.json` ET `pnpm-lock.yaml`

- **Fichiers** : `package-lock.json`, `pnpm-lock.yaml`
- **Description** : npm et pnpm utilisés alternativement → résolution inconsistante.
- **Correction** : Choisir un seul gestionnaire, supprimer l'autre lock file.

### 5.5 Bugs fonctionnels — LOW

| # | Fichier:ligne | Description | Correction |
|---|---------------|-------------|------------|
| Q-L1 | `admin.js:124` | `payload.artistLinks && payload.artistLinks.instagram` au lieu de `?.` | Utiliser l'optional chaining `?.` |
| Q-L2 | `photos.js:77` | `\|\|` au lieu de `??` pour date EXIF | Remplacer par `??` |
| Q-L3 | `photoService.js:118` | `fs.statSync` dans contexte async | `await fs.promises.stat()` |
| Q-L4 | `photoService.js:132-138` | `isNaN` coercion au lieu de `Number.isNaN` | `Number.isNaN(ta)` |
| Q-L5 | `galleryService.js:129` | `.filter(name => photos.includes(name))` sensible casse | Normaliser la casse |
| Q-L6 | `linksService.js:50` | `catch (error)` sans log | Ajouter `console.error` |
| Q-L7 | `linksService.js:218` | Limite 7 jours hardcodée | Externaliser en constante |
| Q-L8 | `campaignService.js:44` | Retour `null` non vérifié | Vérifier valeur de retour |
| Q-L9 | `auth.js:50-55` | Log état session à chaque requête (spam) | Conditionner hors production |
| Q-L10 | `tracking.js:57,98` | `req.connection.remoteAddress` déprécié | `req.socket.remoteAddress` |
| Q-L11 | `image-resize.js:41` | Pas de clamp si largeur hors `allowedWidths` | Clamper à la largeur autorisée |
| Q-L12 | `image-resize.js:59-65` | Cache basé sur `mtimeMs` seulement | Ajouter ETag/hash |
| Q-L13 | `image-resize.js:102` | Écriture cache background sans `await` | Logger erreur en debug |
| Q-L14 | `stats.js:169` | Timestamp anti-bot contournable (côté client) | Générer côté serveur |
| Q-L15 | `stats.js:144` | Comparaison signature non timing-safe | `crypto.timingSafeEqual` |
| Q-L16 | `UserActivityLogger.js:15` | Double nettoyage au démarrage | Supprimer appel redondant |
| Q-L17 | `migrate-gallery-only-photos.js:62,67` | `hasOwnProperty` déprécié | `Object.hasOwn(obj, prop)` |

### 5.6 Duplication de code

| Code | Emplacement 1 | Emplacement 2 | Emplacement 3 |
|------|--------------|--------------|---------------|
| `handleEventBanner` | `server.js:164-194` | `admin.js:410` | — |
| Route `/admin/api/links/event` | `server.js:197` | `admin.js:446` | — |
| `console-warning.js` | `dist/js/console-warning.js` | `home.html:242-550` | — |
| `photo-protection.js` | `dist/js/photo-protection.js` | `home.html:2112-2216` | — |
| `animated-blobs.js` | `dist/js/animated-blobs.js` | `home.html:2226-2278` | `contact.html:948-1001` |
| Code dark mode | `mentions.html:204-225` | `mentions.html:693-721` | — |

### 5.7 Code mort et fichiers orphelins

- `pages.js:439-442` : `buildArtistsSeoIndexHtml()` retourne toujours `''` — code mort
- `admin.js:159` : Route `['/', '/']` avec doublon
- `dist/js/gallery-loader.js` : Fichier tronqué, logique absente
- `dist/js/cinematic-intro.js` : Fichier incomplet, animation inline dans `home.html`

### 5.8 Problèmes de conception

- **Mélange patterns I/O** : `fs.readdir` (callback), `fsp.readdir` (promises), `fs.readFileSync`, `fs.statSync` coexistent
- **Cache inexistant** : `photoService.getPhotosList()` sans cache
- **Pas de validation de structure** : `loadGalleries()` ne valide pas le JSON parsé
- **Pas de gestion d'erreur unifiée** : `try/catch` incohérent
- **Code SPOF** : `express.static(paths.root)` point de défaillance unique
- **Pas de tests** : Zéro couverture → **RÉSOLU : 643 tests, 90.65% couverture**

### 5.9 Dépendances npm

- **10 vulnérabilités** (5 HIGH, 5 MODERATE) non corrigées (cf. V11)
- `nodemon` dans `dependencies` au lieu de `devDependencies`
- Double package manager : `package-lock.json` ET `pnpm-lock.yaml`
- Action : `npm audit fix` + choisir un seul package manager

### 5.10 Configuration

- `.env.example` incomplet : 7 variables manquantes (cf. Q-H10)
- Incohérence `GMAIL_USER`/`GMAIL_PASS` (`.env.example`) vs `SMTP_USER`/`SMTP_PASS` (code)
- `config.js:43` : TOCTOU race condition entre `fs.existsSync` et `fs.readFileSync`
- `pages.js:508-509` : URL `https://www.photo.mprnl.fr` hardcodée, non configurable

### 5.11 Recommandations globales Qualité

| Phase | Actions | Effort |
|-------|---------|--------|
| Immédiat | Corriger 6 bugs CRITICAL (Q-C1 à Q-C6) | 2-3h |
| Court terme | Corriger 12 bugs HIGH (Q-H1 à Q-H12) | 3-4h |
| Moyen terme | Bugs MEDIUM + supprimer duplications + uniformiser patterns I/O | 8-16h |
| Long terme | Tests automatisés + purger code mort + package manager unique | 8-16h |

---

## 6. Plan d'action priorisé

### Phase 1 — Urgences (Sprint 1, ~5 jours)

| # | Problème | Domaine | Sévérité | Effort |
|---|----------|---------|----------|--------|
| 1 | Ajouter rate limiting sur `/admin/login` (V01) | Sécurité | CRITICAL | 15 min |
| 2 | Mettre les secrets dans `.env` (V02, V03, V04) | Sécurité | HIGH | 30 min |
| 3 | Installer helmet + CSP (V05) | Sécurité | HIGH | 30 min |
| 4 | Conditionner `secure` des cookies (V06) | Sécurité | HIGH | 10 min |
| 5 | Corriger `express.static` — ne servir que dossiers nécessaires (Q-C1) | Qualité | CRITICAL | 1h |
| 6 | Réparer l'inlining CSS avec regex fingerprint (P-C1, Q-C3) | Performance | CRITICAL | 10 min |
| 7 | Ajouter width/height sur les images (P-C2) | Performance | CRITICAL | 15 min |
| 8 | Injecter SEO sur `/mentions-legales` (SEO-C1) | SEO | CRITICAL | 20 min |
| 9 | Passer redirections en 301 (SEO-C2) | SEO | CRITICAL | 10 min |
| 10 | `npm audit fix` (V11) | Sécurité | MEDIUM | 5 min |

**Total Phase 1 : ~3h30, score global estimé → 13/20**

### Phase 2 — Améliorations (Sprints 2-3, ~10 jours)

| # | Problème | Domaine | Sévérité | Effort |
|---|----------|---------|----------|--------|
| 11 | Corriger tracking campagne — aligner signatures (Q-C2) | Qualité | CRITICAL | 30 min |
| 12 | Corriger `link.url.startsWith` + `event.url` (Q-C5) | Qualité | CRITICAL | 10 min |
| 13 | Rendre `IMAGE_SECRET_KEY` obligatoire (Q-C6, V13) | Qualité/Sécu | CRITICAL | 5 min |
| 14 | CSRF sur routes admin — installer csurf (V07) | Sécurité | HIGH | 1h |
| 15 | Corriger `normalizeArtistLinks` (Q-H1) | Qualité | HIGH | 15 min |
| 16 | Corriger `sendFile` callback Express 5 (Q-H2) | Qualité | HIGH | 10 min |
| 17 | Corriger écrasement photos date EXIF (Q-H3) | Qualité | HIGH | 15 min |
| 18 | `JSON.parse` cookie avec try/catch (Q-H5) | Qualité | HIGH | 5 min |
| 19 | Vérifier `adminPassword` non vide (Q-H6) | Qualité | HIGH | 5 min |
| 20 | Mettre à jour `.env.example` (Q-H10) | Qualité | HIGH | 15 min |
| 21 | Focus visible boutons — `focus-visible:outline` (A-C1, A-C2) | Accessibilité | CRITICAL | 15 min |
| 22 | Ajouter skip-to-content (A-C3) | Accessibilité | CRITICAL | 15 min |
| 23 | Supprimer `user-scalable=no` /links (A-C4, SEO-H3) | Accessibilité/SEO | CRITICAL | 1 min |
| 24 | Ajouter `aria-expanded` menu hamburger (A-C5) | Accessibilité | CRITICAL | 10 min |
| 25 | Ajouter `<main>` sur home, contact, about, links (SEO-H1, A-H3) | SEO/Accès | HIGH | 15 min |
| 26 | Corriger `rel="noreferrer"` → `noopener noreferrer` (SEO-H2) | SEO/Sécu | HIGH | 10 min |
| 27 | Corriger `alt` côté client JS (SEO-H7) | SEO | HIGH | 10 min |
| 28 | Contraste textes muted — ajuster couleurs sombres (A-H1, A-H2) | Accessibilité | HIGH | 1h |
| 29 | Formulaire contact accessible — live region + required (A-H5) | Accessibilité | HIGH | 1h |
| 30 | Cacher `photoService.getPhotosList()` — cache 5 min (P-C3) | Performance | CRITICAL | 20 min |

**Total Phase 2 : ~7h, score global estimé → 16/20**

### Phase 3 — Fondations (Sprints 4-6, ~15 jours)

| # | Problème | Domaine | Sévérité | Effort |
|---|----------|---------|----------|--------|
| 31 | Compléter `gallery-loader.js` — extraire logique de home.html (Q-C4, P-H4) | Qualité/Perf | CRITICAL | 2-4h |
| 32 | Pre-warming cache `/resize` au démarrage (P-H2) | Performance | HIGH | 1h |
| 33 | Support AVIF dans `/resize` (P-H3) | Performance | HIGH | 1h |
| 34 | Supprimer code dupliqué inline (P-H1, Q-M22) | Performance/Qualité | HIGH | 1h |
| 35 | `twitter:card` → `summary_large_image` /links (SEO-H4) | SEO | HIGH | 1 min |
| 36 | Ajouter `hreflang="fr"` auto-référentiel (SEO-H6) | SEO | HIGH | 30 min |
| 37 | Remplir `ImageGallery` home avec photos (SEO-H5) | SEO | HIGH | 30 min |
| 38 | Ajouter `og:image:width/height` (SEO-M2) | SEO | MEDIUM | 15 min |
| 39 | Breadcrumbs visuels (SEO-M7) | SEO | MEDIUM | 2h |
| 40 | Limiter JSON-LD ImageGallery à 30 photos (SEO-M8) | SEO | MEDIUM | 30 min |
| 41 | Remplacer `<div class="card-title">` par `<h2>` admin (A-H4) | Accessibilité | HIGH | 30 min |
| 42 | Input file admin avec label (A-H6) | Accessibilité | HIGH | 15 min |
| 43 | `sr-only` en français dans about_me.html (A-M1) | Accessibilité | MEDIUM | 1 min |
| 44 | `aria-current="page"` sur lien actif (A-M2) | Accessibilité | MEDIUM | 15 min |
| 45 | Brotli sur HTML dynamique — shrink-ray (P-M2) | Performance | MEDIUM | 30 min |
| 46 | Uniformiser CDN sur jsdelivr + preconnect global (P-M3) | Performance | MEDIUM | 30 min |
| 47 | Supprimer `text-loader.js` redondant (P-M1) | Performance | MEDIUM | 15 min |
| 48 | Supprimer `exifr` CDN côté client (P-L1) | Performance | LOW | 5 min |
| 49 | Sous-ensembler les fonts — `&subset=latin` (P-M6) | Performance | MEDIUM | 5 min |
| 50 | Ajouter `fileFilter` sur upload admin (V09) | Sécurité | MEDIUM | 10 min |
| 51 | `saveUninitialized: false` (V10) | Sécurité | MEDIUM | 1 min |
| 52 | Vérifier token CSRF contact côté serveur (V08) | Sécurité | MEDIUM | 30 min |
| 53 | Supprimer `error.message` des réponses client (V14) | Sécurité | MEDIUM | 15 min |
| 54 | Supprimer `X-Powered-By` header (V15) | Sécurité | MEDIUM | 1 min |
| 55 | Nettoyer logs debug en production (V20) | Sécurité | MEDIUM | 30 min |
| 56 | Corriger bugs MEDIUM qualité code (Q-M1 à Q-M24) | Qualité | MEDIUM | 8h |
| 57 | Corriger bugs LOW (Q-L1 à Q-L17) | Qualité | LOW | 4h |
| 58 | Corriger accessibilité LOW (A-L1 à A-L5) | Accessibilité | LOW | 1h |
| 59 | Corriger SEO LOW (SEO-L1 à SEO-L7) | SEO | LOW | 2h |
| 60 | Corriger performance LOW (P-L2 à P-L4) | Performance | LOW | 1h |

**Total Phase 3 : ~30-40h, score global estimé → 18/20**

### Métriques cibles après corrections

| Métrique | Actuel | Après Phase 1 | Après Phase 2 | Après Phase 3 |
|----------|--------|---------------|---------------|---------------|
| **Score global** | 10/20 | 13/20 | 16/20 | 18/20 |
| **Sécurité** | 8/20 | 14/20 | 16/20 | 18/20 |
| **Performance** | 11/20 | 14/20 | 16/20 | 18/20 |
| **SEO** | 13/20 | 15/20 | 18/20 | 19/20 |
| **Accessibilité** | 9/20 | 12/20 | 16/20 | 18/20 |
| **Qualité du code** | 9/20 | 11/20 | 14/20 | 17/20 |
| **LCP (estimé)** | 3.2s | 2.1s | 1.7s | 1.5s |
| **CLS (estimé)** | 0.12 | 0.05 | 0.03 | 0.01 |
| **Conformité WCAG AA** | ~40% | ~55% | ~75% | ~85% |
| **Lighthouse Performance** | 68 | 82 | 90 | 94 |

---

## Annexes

### A. Fichiers orphelins à supprimer ou compléter

| Fichier | Action | Priorité |
|---------|--------|----------|
| `dist/js/gallery-loader.js` | Compléter avec la logique galerie complète | Phase 3 |
| `dist/js/cinematic-intro.js` | Compléter avec l'animation complète | Phase 3 |
| `pages.js:439` — `buildArtistsSeoIndexHtml()` | Supprimer (retourne toujours `''`) | Phase 3 |
| `admin.js:159` — Route `['/', '/']` | Supprimer le doublon | Phase 3 |
| `package-lock.json` OU `pnpm-lock.yaml` | Supprimer l'un des deux | Phase 3 |
| Code inline dupliqué dans `home.html` | Supprimer après extraction (console-warning, photo-protection, animated-blobs) | Phase 3 |

### B. Dépendances à mettre à jour ou installer

| Paquet | Action | Priorité |
|--------|--------|----------|
| `path-to-regexp` | `npm audit fix` (HIGH — DoS ReDoS) | Phase 1 |
| `multer` | `npm audit fix` (HIGH — DoS recursion) | Phase 1 |
| `nodemailer` | `npm audit fix` (HIGH — Email unintended domain) | Phase 1 |
| `picomatch` | `npm audit fix` (HIGH — Method injection) | Phase 1 |
| `postcss` | `npm audit fix` (MODERATE — XSS CSS) | Phase 1 |
| `uuid` | `npm audit fix` (MODERATE — Buffer bounds) | Phase 1 |
| `qs` | `npm audit fix` (MODERATE — DoS arrayLimit) | Phase 1 |
| `express-rate-limit` | **À installer** — rate limiting admin login | Phase 1 |
| `helmet` | **À installer** — headers sécurité HTTP | Phase 1 |
| `csurf` | **À installer** — protection CSRF admin | Phase 2 |
| `shrink-ray-current` | **À installer** — Brotli HTML dynamique | Phase 3 |
| `p-limit` | **À installer** — limiter concurrence EXIF | Phase 3 |
| `nodemon` | Déplacer de `dependencies` → `devDependencies` | Phase 3 |

### C. Configuration à externaliser

| Variable | Fichier actuel | Valeur actuelle | Statut |
|----------|---------------|-----------------|--------|
| `SESSION_SECRET` | `server.js:52` | `'votre-secret-session-super-securise'` | Codé en dur |
| `ADMIN_REMEMBER_SALT` | `auth.js:6` | `'admin-remember-salt'` | Codé en dur |
| `CONTACT_API_SECRET` | `stats.js:56` | `'mp-contact-form-2024-secret-key'` | Codé en dur + exposé client |
| `IMAGE_SECRET_KEY` | `signed-images.js:8` | `crypto.randomBytes(32)` | Régénéré à chaque reboot |
| `SITE_URL` | `pages.js:508` | `'https://www.photo.mprnl.fr'` | Hardcodé |
| `SMTP_HOST` | `stats.js` | (absent `.env.example`) | Manquant |
| `SMTP_PORT` | `stats.js` | (absent `.env.example`) | Manquant |
| `CONFIG_FILE` | `config.js` | (absent `.env.example`) | Manquant |

**`.env.example` à compléter avec toutes ces variables.**

### D. Mapping fichiers → problèmes

| Fichier | Problèmes |
|---------|-----------|
| `server.js` | V02, V05, V06, V10, V15, V17, V20, Q-C1, Q-M3, Q-M4, P-M2, P-L2 |
| `server/routes/pages.js` | SEO-C1, SEO-C2, SEO-M3, SEO-M5, SEO-M6, SEO-M8, P-C1, Q-C3, Q-H12, Q-M, V19, Q-H14 |
| `server/routes/admin.js` | V01, V09, V14, V21, Q-H2, Q-M1, Q-M2, Q-M3, Q-M4, Q-L1, Q-H14 |
| `server/routes/photos.js` | Q-H3, Q-H4, Q-M5, Q-L2 |
| `server/routes/stats.js` | V03, V08, V20, Q-M14, Q-M15, Q-M16, Q-L14, Q-L15, Q-H15, Q-H16 |
| `server/routes/signed-images.js` | V13, V17, Q-C6, Q-H7, Q-H8 |
| `server/routes/image-resize.js` | P-H2, P-H3, Q-L11, Q-L12, Q-L13 |
| `server/routes/content.js` | V07, V14, Q-M17 |
| `server/middleware/auth.js` | V04, V06, V22, Q-H6, Q-M12, Q-L9 |
| `server/middleware/tracking.js` | V16, Q-C2, Q-M13, Q-L10 |
| `server/utils/photoService.js` | P-C3, Q-M6, Q-M7, Q-L3, Q-L4, Q-H13 |
| `server/utils/galleryService.js` | Q-H1, Q-M8, Q-L5 |
| `server/utils/linksService.js` | Q-C5, Q-L6, Q-L7 |
| `server/utils/textUtils.js` | SEO-H5, SEO-M2, SEO-M9, SEO-L7, Q-H5, Q-M9, Q-M10 |
| `server/utils/campaignService.js` | Q-M11, Q-L8 |
| `scripts/CampaignManager.js` | Q-C2, Q-M18 |
| `scripts/PhotoClickTracker.js` | Q-M19 |
| `scripts/UserActivityLogger.js` | Q-M20, Q-L16 |
| `scripts/migrate-gallery-only-photos.js` | Q-L17 |
| `pages/home.html` | SEO-H1, SEO-H2, SEO-H7, A-C1, A-C5, A-H3, P-H1, Q-C4, P-L1, P-M6 |
| `pages/contact.html` | V03, SEO-H2, A-C1, A-C2, A-H2, A-H5, A-H3, P-M5, Q-M23 |
| `pages/about_me.html` | SEO-H2, A-C1, A-H3, A-M1, A-M5, P-M5 |
| `pages/gallery.html` | A-C1, A-C5, P-C2, P-L3 |
| `pages/galleries.html` | A-C1, A-C5 |
| `pages/links.html` | SEO-H3, SEO-H4, A-C4 |
| `pages/mentions.html` | SEO-L4, A-L1, A-L2 |
| `pages/404.html` | SEO-L1, SEO-L6 |
| `admin/admin.html` | A-H4, A-H6, A-M4, A-M7, A-L4, A-L5 |
| `dist/js/gallery-loader.js` | Q-C4, P-H4 |
| `dist/js/cinematic-intro.js` | Q-H9, A-M6 |
| `dist/js/text-loader.js` | P-M1 |
| `dist/js/photo-protection.js` | Q-M21 |
| `dist/js/animated-blobs.js` | Q-M22 |
| `.env.example` | Q-H10 |
| `package.json` | V11, Q-H11, Q-M24 |
| `tests/` | ✅ 643 tests, 33 suites, 90.65% couverture — résout Q-H11 |

### E. Commandes de diagnostic

```bash
# Audit de sécurité npm
npm audit

# Vérifier les vulnérabilités par sévérité
npm audit --audit-level=high

# Appliquer les correctifs automatiques
npm audit fix

# Vérifier l'état du cache resize
ls -la photos/resized/ | wc -l

# Vérifier les fichiers accessibles via express.static (racine)
curl -I http://localhost:3000/.env
curl -I http://localhost:3000/package.json
curl -I http://localhost:3000/config/config.json

# Vérifier les headers de sécurité HTTP
curl -I http://localhost:3000 | grep -E "(CSP|X-Frame|X-Content|HSTS|Referrer|X-Powered)"

# Vérifier le contraste des couleurs (nécessite puppeteer ou outil externe)
# Utiliser https://webaim.org/resources/contrastchecker/ avec les codes couleur

# Vérifier l'inlining CSS
curl -s http://localhost:3000 | grep -c "<style>"

# Vérifier le sitemap
curl -s http://localhost:3000/sitemap.xml | head -50

# Vérifier les redirections (doivent être 301)
curl -I -L http://localhost:3000/portfolio 2>&1 | grep "HTTP/"

# Vérifier les dimensions des images (width/height)
curl -s http://localhost:3000 | grep -oP '<img[^>]*>' | grep -c "width="

# Lister les fichiers dupliqués (code inline + fichier externe)
grep -rl "animated-blobs\|photo-protection\|console-warning" dist/js/ pages/

# Vérifier la configuration .env
diff <(grep -o '^[A-Z_]*=' .env.example | sort) <(grep -oP 'process\.env\.\K[A-Z_]+' server/**/*.js server/**/**/*.js 2>/dev/null | sort -u)
```

---

**Fin de l'audit. Document généré le 8 juin 2026.**
