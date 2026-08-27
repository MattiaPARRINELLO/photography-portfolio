# AGENTS.md — Photography Portfolio

Guide opérationnel pour les agents IA. Site vitrine de photographie de concert (Mattia Parrinello, photographe concert à Paris) : galeries par artiste, carte de visite digitale, formulaire de contact, interface d'administration, tracking utilisateur et campagnes marketing, SEO.

Tout ce qui suit est vérifié dans le dépôt sauf mention explicite « À confirmer ».

## Stack technique

- **Backend** : Node.js + Express 5.1 (CommonJS, pas de TypeScript), serveur monolithique `server.js`.
- **Templating** : pages HTML statiques servies par Express avec injection serveur (meta, JSON-LD, placeholders). Pas de moteur de template.
- **Images** : `sharp` 0.34 (redimensionnement dynamique), `exifr` (métadonnées EXIF), `multer` (upload), WebP/AVIF pré-générés.
- **CSS** : `src/input.css` (CSS brut, snapshot figé d'un build Tailwind v3.2.7) → autoprefixer → csso (minify) → fingerprint sha256-8p + pré-compression `.br`/`.gz`.
- **Client** : JS vanilla dans `dist/js/` + CDN (Alpine.js, Fancybox 5, Masonry, imagesloaded, exifr, Google Fonts).
- **Tests** : Jest 30 + Supertest.
- **Gestionnaire de paquets** : **npm** (le seul tracked : `package-lock.json`). `pnpm-lock.yaml` et `pnpm-workspace.yaml` sont exclus en local via `.git/info/exclude` — ne pas s'en servir.
- **Pas de lint, pas de formateur, pas de typecheck configurés.** Aucun script `lint`/`typecheck` dans `package.json`.

## Architecture du dépôt

- `server.js` — point d'entrée : helmet 8 + CSP, compression, express-session (`trust proxy: 1`), middleware de pré-compression `.br`/`.gz`, statics ciblés `/dist` et `/photos`, route dédiée `/robots.txt`, API bandeau événement, montage des routers, 404 → `pages/404.html`, gestionnaire d'erreur global.
- `server/config.js` — singleton. Précédence : `CONFIG_FILE` (env) → `config/config.json` → `config/config.local.json` → `config/config.json.example`. Fusion superficielle des overrides locaux.
- `server/middleware/auth.js` — auth admin : cookie HMAC `adminAuth` (+ session), header `x-admin-password`, `requireAdminSession` / `requireAdminPage`. `ADMIN_REMEMBER_SALT` obligatoire (throw au chargement).
- `server/middleware/tracking.js` — `userTrackingMiddleware` (logs d'activité) et `campaignMiddleware` (campagnes via `?ref=`/`utm_campaign`).
- `server/routes/` — `pages.js` (pages publiques + galeries + sitemap), `admin.js` (login, config, liens, uploads…), `photos.js` (`/photos-list`, `/admin/upload`, `/admin/photos`), `image-resize.js` (`/photos/resize?file=X&w=N`), `content.js` (textes + campagnes admin), `stats.js` (`/send-mail`, `/track`, `/stats`, `/log-action`, `/photo-click`, logs admin), `signed-images.js` (`/api/request-hd-access`, `/api/hd-image`, HMAC `IMAGE_SECRET_KEY`, validité 1 h), `event-banner.js` (handler partagé de l'API bandeau événement, monté par `server.js` et `admin.js`).
- `server/utils/` — `galleryService.js` (CRUD galeries, slugify), `linksService.js` (liens + bandeau événement), `photoService.js` (liste photos triée par date), `campaignService.js`, `textUtils.js` (textes + injection meta/JSON-LD).
- `scripts/` — `UserActivityLogger.js`, `PhotoClickTracker.js`, `CampaignManager.js` (instanciés dans `server.js`), `build-css.js`, `build-assets.js`, `convert-thumbnails-to-webp.js`, `generate-placeholders.js`, `migrate-gallery-only-photos.js`, `test-email.js`, `untrack-config.sh`.
- `pages/` — templates HTML publics + `pages/admin/` (admin.html, campaigns, galleries, links, logs, text-editor). **Refactoring JS inline en cours** : `home.html` fait encore 2282 lignes (voir `REFACTORING_PLAN.md` / `REFACTORING_STATUS.md`). Nouveau JS à placer dans `dist/js/`.
- `dist/` — sorties de build **partiellement trackées par git** (voir « Fichiers générés »).
- `photos/` — originaux ; `photos/thumbnails/` (générés à l'upload, seul `.gitkeep` + README trackés) ; `photos/resized/` (cache de redimensionnement, gitignoré).
- `tests/` — 33 suites / 638 tests (voir Commandes). `tests/setup.js` injecte les variables d'env factices (chargé via `jest.config.js` → `setupFiles`).
- `graphify-out/` — graphe de connaissance du code (voir « Outillage local »).
- `AUDIT.md` — registre d'audit (sécurité/perf/SEO/a11y/qualité) avec identifiants d'items (ex. `Q-C2`, `V11`, `E5-REDIR`). Convention : les commits de correction marquent les items `CORRIGÉ` dans ce fichier.

## Commandes

| Tâche | Commande |
|---|---|
| Installer les dépendances | `npm install` |
| Serveur dev (nodemon) | `npm run dev` |
| Serveur prod | `npm start` (PORT, défaut 3000) |
| Build CSS (autoprefixer) | `npm run build:css` |
| Minify + fingerprint + précompresser + réécrire les refs HTML | `npm run build:assets` |
| Build complet (ordre imposé) | `npm run build:css && npm run build:assets` |
| Tests + coverage | `npm test` (alias: jest --coverage --verbose) |
| Tests rapides, sortie silencieuse | `npx jest --ci --silent` |
| Tests en watch | `npm run test:watch` |
| Tests CI | `npm run test:ci` |
| Thumbnails → WebP | `npm run convert-thumbnails` |
| Test d'envoi SMTP | `npm run test:email` |
| Migration photos « galerie seulement » | `npm run migrate:gallery-only` |

**État vérifié** : `npx jest --ci --silent` → 33 suites passantes, 638 tests passants, 0 skip. `TESTS_REPORT.md` est daté (445 tests, 14 skips) et ne reflète plus l'état actuel.

## Build, lint, tests et vérifications de types

- **Ordre de build obligatoire** : `build:css` (produit `dist/css/output.css`) **puis** `build:assets` (le consomme).
- `build:assets` : minifie avec csso, calcule un fingerprint sha256 (8 premiers hex), écrit `dist/css/output.<hash>.css` + `.br`/`.gz`, réécrit **toutes** les références `output*.css` dans `pages/**/*.html`, écrit `dist/manifest.json`, supprime les anciens fichiers fingerprintés.
- **Le build modifie des fichiers trackés** : `pages/*.html`, `dist/manifest.json`, `dist/css/output.<hash>.css(.br/.gz)`. Vérifier `git status` après build et committer les changements ensemble ; ne pas committer un HTML pointant vers un vieux fingerprint.
- Aucun lint ni typecheck. La validation se limite à : tests Jest + build + test manuel navigateur.

## Conventions de code et de nommage

- Commentaires et textes UI **en français** (commits souvent en français, format `fix(...)`, `feat: ...`, `docs: ...`).
- CommonJS : `require`/`module.exports`.
- Indentation 4 espaces (serveur), style simple quote.
- Ne pas durcir un nom fingerprinté (`output.<hash>.css`) en dur — il change à chaque build ; toujours passer par `dist/manifest.json` (voir `server/routes/pages.js:154-186` pour le pattern d'inlining CSS).
- Ne pas ajouter de logs de debug par requête : les anciens `console.log` bruyants (dont « DEBUG SPÉCIAL » dans `pages.js`) ont été supprimés en `389a22b` — ne pas les réintroduire ; garder `console.warn`/`console.error` pour les cas d'abus et les chemins d'erreur.
- Tests : tester l'implémentation réelle (fichiers, vrai serveur via supertest), éviter les mocks. Prolonger `tests/routes/` (routes), `tests/services/` (utils), `tests/security/` (auth/headers), etc.

## Règles relatives aux pages, styles et contenus

- **CSS** : éditer uniquement `src/input.css` (source unique). Le pipeline de build ne fait plus tourner Tailwind : les classes d'utilitaires sont figées dedans en CSS brut.
- Les pages HTML utilisent des **placeholders côté serveur** : `<!-- SEO_HERO_PLACEHOLDER -->`, `<!-- SEO_BOTTOM_PLACEHOLDER -->`, `<!-- GALLERIES_LIST_PLACEHOLDER -->`, `<!-- GALLERY_HERO_PLACEHOLDER -->`, `<!-- GALLERY_DESCRIPTION_PLACEHOLDER -->`, `<!-- GALLERY_PHOTOS_PLACEHOLDER -->`, `<!-- META_PLACEHOLDER_END -->`, `{{DYNAMIC_TITLE}}`, `{{DYNAMIC_DESCRIPTION}}`. Ne pas supprimer les placeholders attendus par `server/routes/pages.js`.
- **Contenu (données)** : `config/galleries.json`, `texts.json`, `links.json`, `campaigns.json`, `seo.json` **ne sont pas trackés** (gitignorés via `config/*.json`) — seuls les `*.example` sont trackés. Structure observée : `galleries.json` = `{metadata, galleries[]}` avec `id`, `slug`, `title`, `artist`, `venue`, `date`, `description`, `cover`, `photos[]`, `published`, `createdAt`, `updatedAt`, `excludeFromMain`, `galleryOnlyPhotos` ; `texts.json` = `{main, meta, "a propos", footer}` ; `seo.json` = `{site, pages, artists, venues, intro_text, footer_seo}`.
- **Photos** : originaux dans `photos/` ; les galeries référencent des fichiers par nom ; le redimensionnement se fait à la volée via `/photos/resize?file=...&w=...` (srcset 320→1600) ; l'accès HD passe par des URLs signées HMAC. Pour ajouter des photos : via l'admin (POST `/admin/upload`, multer → `temp/`), pas à la main.
- SEO : chaque page reçoit meta tags + Schema.org JSON-LD injectés par `textUtils.js` ; `sitemap.xml` est généré dynamiquement ; domaine canonical `https://www.photo.mprnl.fr`.

## Contraintes UX, responsive et accessibilité

- Design existant à préserver : thème clair/sombre, blobs animés, intro cinématique, masonry, Fancybox, typo Signika (Google Fonts).
- Lazy loading des images sauf les 4-6 premières (LCP) ; `fetchpriority` high sur les 2 premières.
- HTML sémantique (h1/h2, aria-label sur les liens externes artistes), `alt` descriptifs sur toutes les images.
- `AUDIT.md` §4 liste des axes accessibilité (score WCAG 2.1 AA estimé) — s'y référer avant toute refonte visuelle.
- Les attributs inline (`onclick`, `onerror`, `onload`) sont utilisés dans les pages → ne pas les retirer sans ajuster la CSP.

## Variables d'environnement

Copier `.env.example` vers `.env` (jamais tracké). **Toutes les valeurs sont obligatoires** — absence → crash au démarrage/chargement. Noms (aucune valeur reproduite ici) :

- `PORT` (défaut 3000), `NODE_ENV=production` en prod (cookies `secure`),
- `ADMIN_PASSWORD` (login + HMAC du cookie admin),
- `ADMIN_REMEMBER_SALT` (sel HMAC cookie `adminAuth`, obligatoire),
- `SESSION_SECRET` (secret express-session),
- `CONTACT_API_SECRET` (signature du formulaire de contact),
- `IMAGE_SECRET_KEY` (signature URLs HD, obligatoire),
- `SITE_URL` (canonical/sitemap),
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (SMTP ; `.env.example` documente un fallback `GMAIL_USER`/`GMAIL_PASS` — le code lit réellement `SMTP_*`, À confirmer si le fallback est effectif),
- `CONFIG_FILE` (optionnel, chemin absolu du JSON de config).

Les tests injectent leurs propres valeurs via `tests/setup.js` — ne pas y mettre de vrais secrets.

## Fichiers générés, sensibles ou interdits de modification

- **Ne jamais modifier** : `dist/manifest.json`, `dist/css/output.<hash>.css(+.br/.gz)` (générés), les refs CSS dans `pages/*.html` (réécrites par le build), `coverage/`, `logs/`, `temp/`, `photos/resized/`, `photos/*.{jpg,jpeg,png,webp,gif}` et `photos/thumbnails/*` (contenu/utilisateur, gitignorés), `server.log`.
- **Sensibles** : `.env` (non tracké, porteur de secrets — ne jamais afficher ses valeurs), `config/*.json` réels (non trackés), `stats.json` (données de tracking).
- Ancien artefact `dist/output.css` (legacy Tailwind) supprimé en `389a22b` — seul `dist/css/output.css` (pré-fingerprint) existe, ne pas le confondre avec `dist/css/output.<hash>.css`.
- `AUDIT.md`, `REFACTORING_PLAN.md`, `REFACTORING_STATUS.md`, `photos/README.md`, `CONFIG_README.md`, `server/README.md` : documentation active, à tenir à jour en cas de changement correspondant.
- `*.local.json` / `*.secret.json` dans `config/` : overrides locaux jamais commités (voir `CONFIG_README.md`).

## Procédure recommandée avant toute modification

1. Lire `AGENTS.md`, puis le fichier concerné et ses tests existants. Pour toute question cross-module, consulter `graphify-out/GRAPH_REPORT.md`.
2. Vérifier l'état git (`git status`) — ne pas écraser un travail en cours.
3. Ne pas toucher les fichiers listés ci-dessus sauf nécessité avérée.
4. Après modification : `git diff` ciblé, puis exécuter les tests relatifs (cf. checklist).

## Checklist de validation avant livraison

- [ ] `npx jest --ci --silent` → tout vert (33 suites / 638 tests).
- [ ] Le CSS modifié passe par le build : `npm run build:css && npm run build:assets`, puis `git status` cohérent (HTML + manifest + fingerprint).
- [ ] Aucune valeur d'env réelle ajoutée/commitée.
- [ ] Toujours relancer le serveur après un build CSS (`npm run dev`) et tester dans un vrai navigateur — les tests Jest ne couvrent pas le rendu client ni la CSP en conditions réelles.
- [ ] Vérifier les routes exposées : pas de `express.static(root)` (statics ciblés `/dist`, `/photos` uniquement) ; pas de nouveau secret en dur ; pas de suppression de directive CSP nécessaire au site (scriptSrcAttr/unsafe-inline, jsdelivr, unpkg…).

## Déploiement

Identifiable uniquement en partie (À confirmer pour la procédure détaillée) :

- Hébergement Apache qui proxyifie `/admin` vers Node (`SetHandler proxy:http://localhost:3000` dans `.htaccess`, désactive gzip/brotli Apache sur `/admin` car Node gère déjà la compression).
- Node sert sur le port 3000 en `NODE_ENV=production` ; domaine de production : `https://www.photo.mprnl.fr`.
- Pas de CI/CD dans le dépôt (`.github/` ne contient que FUNDING.yml + templates d'issues).

## Particularités et pièges

- **Express 5** : les patterns de routes diffèrent d'Express 4 (attention aux wildcards et aux handlers d'erreur).
- **Helmet 8 + CSP** : directives à maintenir explicitement, sinon tout casse silencieusement : `scriptSrcAttr: ["'unsafe-inline'"]` (événements inline), `scriptSrc` incluant jsdelivr/unpkg/`'unsafe-inline'`/`'unsafe-eval'`, `styleSrc` incluant jsdelivr + fonts.googleapis + `'unsafe-inline'`, `connectSrc` jsdelivr, `crossOriginEmbedderPolicy: false`, `crossOriginResourcePolicy: cross-origin`. Helmet 8 ajoute `upgrade-insecure-requests` automatiquement.
- Le serveur pré-compresse (`Content-Encoding: br/gz`) les assets avec `Cache-Control: immutable` ; un nouveau type d'asset précompressé doit être ajouté au middleware de `server.js:93-142` et au serveur Express statique ciblé.
- `sharp` est une dépendance native ; si l'install échoue : `SHARP_IGNORE_INSTALL_ERROR=1`.
- `photos/thumbnails/` doit exister pour que l'upload fonctionne (`.gitkeep` tracké).
- Ne pas coder en dur des URLs externes ou domaines dans le code serveur sans raison : canonical et sitemap utilisent `https://www.photo.mprnl.fr` en dur dans `pages.js` (cohérent avec `SITE_URL`).
- Ne pas ajouter de logs de debug dans les routes (les anciens logs bruyants ont été purgés en `389a22b`).

## Outillage local (agents)

- `graphify-out/` (tracké) : graphe de connaissance avec `GRAPH_REPORT.md`, `graph.html`, `graph.svg`, `graph.json`. Le plugin est chargé via `.opencode/opencode.json` → `.opencode/plugins/graphify.js`. Pour l'exploration cross-module, y jeter un œil d'abord.
- `.mimocode/`, `.claude/`, `.vscode/` : configs d'outils locaux, observer mais ne pas modifier sans demande.