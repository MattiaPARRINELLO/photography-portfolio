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
- `server/middleware/` — `language.js` (détection de langue), `photosStatic.js` (statique des miniatures). Le tracking par cookies (`userTrackingMiddleware`/`campaignMiddleware`) a été supprimé : la collecte est désormais assurée par `dist/js/analytics-tracker.js` (sendBeacon, zéro cookie).
- `server/routes/` — `pages.js` (pages publiques + galeries + sitemap + page service `/photographe-de-concert-paris`), `admin.js` (login, config, liens, uploads…), `photos.js` (`/photos-list`, `/admin/upload`, `/admin/photos`), `image-resize.js` (`/photos/resize?file=X&w=N`), `content.js` (textes + campagnes admin), `contact.js` (`/send-mail`), `analytics.js` (`POST /api/track` public + `GET /admin/api/analytics` KPI), `signed-images.js` (`/api/request-hd-access`, `/api/hd-image`, HMAC `IMAGE_SECRET_KEY`, validité 1 h), `event-banner.js` (handler partagé de l'API bandeau événement, monté par `server.js` et `admin.js`).
- `server/utils/` — `galleryService.js` (CRUD galeries, slugify), `linksService.js` (liens + bandeau événement + JSON-LD de /links), `photoService.js` (liste photos triée par date), `analyticsStore.js` (JSONL append-only, rétention 90 j), `analyticsService.js` (calcul des KPI), `campaignService.js` (parsing `?c`/`?ref`/`?utm_*`, sans état ni cookie), `textUtils.js` (textes + injection meta/JSON-LD `@graph` à `@id` stables), `imageMeta.js` (dimensions des photos via sharp, cache mémoire → `width`/`height` anti-CLS), `dataSanity.js` (garde-fou prod : exclut des pages publiques les galeries aux données manifestement fictives, l'admin reste non filtré).
- `scripts/` — `CampaignManager.js` (instancié dans `server.js`, CRUD des campagnes déclarées), `build-css.js`, `build-assets.js`, `generate-og-image.js` (og:image 1200×1200), `generate-name-glyphs.js` (tracés SVG du nom du H1, nécessite le `.ttf` Switzer 600 en argument), `convert-thumbnails-to-webp.js`, `generate-placeholders.js`, `migrate-gallery-only-photos.js`, `test-email.js`, `untrack-config.sh`.
- `pages/` — templates HTML publics + `pages/admin/` (admin.html, analytics, campaigns, galleries, links, text-editor). **Refactoring JS inline en cours** (voir `REFACTORING_PLAN.md` / `REFACTORING_STATUS.md`). `home.html` a été refait (planche contact, ~230 lignes) et ne charge plus que `dist/js/home-sheet.js` + `analytics-tracker.js`. Nouveau JS à placer dans `dist/js/`. Les pages intérieures (galeries, galerie, prestations, à propos, contact, liens, mentions, 404) partagent le socle `.cs-top` (nom + navigation) et `.cs-footer` (déjà sur l'accueil) : recopier exactement ces deux blocs, la palette vient de `<body class="cs">`. `/prestations` (`pages/prestations.html`, route `servePage` avec injection des 3 dernières couvertures) est la page service qui répond à « photographe de concert à Paris » : aucun prix affiché, chaque projet se discute.
- `dist/js/home-sheet.js` — accueil : filtres année/concert du carnet de route, lightbox Fancybox, mouvement GSAP (carton-titre : une photo paysage du dernier concert en plein écran, le nom blanc en deux lignes qui convergent vers les deux mots du H1 pendant le repli de la feuille vers sa cellule ; voiles colonne par colonne pour le développement ; parallaxe de la planche ; entrées par ScrollTrigger). L'intro ne joue qu'une fois par session (`sessionStorage`, clé `cs-intro`) et dure ~2,4 s ; le carton n'est posé à la première peinture par un script inline de `pages/home.html` que si l'intro doit jouer (même décision que le JS via `window.__csBoot`), sinon un rechargement dans la session montrait la première image de l'intro puis la retirait d'un coup : écart assumé avec la règle des 1,2 s du skill design (l'inspecteur signale `late-title`). Aucun filtre animé : les voiles sont des opacités, pas des `filter`, accordéon au survol des bandes (la cible est lue sous le curseur à chaque `pointermove` : quitter un cadre pour son voisin ne remet pas la rangée à plat, sinon la largeur bougeait sous le pointeur et l'animation sautait sur un troisième cadre ; le test se fait sur la géométrie visée, sans lecture de layout, et 70 ms d'arrêt sont exigés avant de changer de photo dans une rangée ouverte, sinon un balayage relançait l'animation à chaque cadre ; les images non survolées gardent leur largeur au repos et sont masquées par leur cadre (sinon chaque photo se recadrait à chaque déplacement, d'où le tremblement) ; pointeur `mouse` uniquement, jamais au doigt). Les bandes de concerts sont justifiées : `homeSheetService.buildStrips` rend une réserve de 12 photos (6 visibles sans JS), le client garde les 5 à 12 premières dont la hauteur justifiée colle le mieux à 190 px, fixe `--row-h` (160 à 240 px) et les largeurs, donc chaque rangée remplit la largeur sans recadrage ; un `ResizeObserver` sur `.cs-strip-frames` recalcule (barre de défilement, filtres, zoom). Sous 901 px, la grille CSS reprend la main : deux colonnes de trois tirages à hauteur fixe (`32vw`, recadrés) pour que les deux colonnes aient la même hauteur, sinon une colonne de portraits laissait un grand vide sous l'autre ; l'intro ne se replie plus sur le panneau (le panneau est au-dessus de la planche en flux, le carton rétréci laissait voir la planche) : le nom s'efface, puis la feuille entière glisse vers le bas et découvre le panneau déjà composé, du titre vers la planche. Aucun état caché n'est posé en CSS : sans JS, tout reste lisible ; `prefers-reduced-motion` désactive la couche. Le carton-titre est retiré au bout de 3 s par un filet de sécurité si GSAP ne se charge pas.
- `dist/js/vendor/` — GSAP 3.13 + ScrollTrigger + MorphSVGPlugin, servis en local (pas de CDN, compatible CSP `script-src 'self'`). Licence standard GreenSock, gratuite.
- `dist/js/name-glyphs.js` — tracés SVG du nom du H1 de l'accueil (généré par `scripts/generate-name-glyphs.js` à partir du `.ttf` Switzer 600, avances et crénage inclus). Au survol, le H1 reste du texte (SEO, lecteurs d'écran) mais passe en transparent et un SVG posé dessus morphe les cinq lettres gardées vers `MPRNL` (MorphSVGPlugin, une seule timeline : les autres lettres glissent et s'effacent). Actif à partir de 901 px et si `prefers-reduced-motion` est absent.
- `dist/js/analytics-tracker.js` — tracker maison : temps engagé (`visibilitychange`), scroll, photos vues (IntersectionObserver), ouvertures Fancybox, conversions (`mailto`/`tel`/CTA/liens externes), capture de campagne depuis l'URL. Envoie un `session_flush` cumulé toutes les 10 s et à la sortie de page via `navigator.sendBeacon` (repli `fetch keepalive`). Continuité de session via `sessionStorage` (éphémère, jamais un cookie). Zéro donnée personnelle : hash SHA-256 quotidien (`sel + UA court + écran + timezone + jour`).
- `dist/` — sorties de build **partiellement trackées par git** (voir « Fichiers générés »).
- `photos-originals/` — originaux (hors statique, `PHOTOS_ORIGINALS_DIR`) ; `photos/thumbnails/` (générés à l'upload, seul `.gitkeep` + README trackés) ; `photos/resized/` (cache de redimensionnement, gitignoré).
- `tests/` — 42 suites / 721 tests (voir Commandes). `tests/setup.js` injecte les variables d'env factices (chargé via `jest.config.js` → `setupFiles`).
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
| Générer l'og:image de partage (1200×1200) | `npm run build:og-image` |
| Tests + coverage | `npm test` (alias: jest --coverage --verbose) |
| Tests rapides, sortie silencieuse | `npx jest --ci --silent` |
| Tests en watch | `npm run test:watch` |
| Tests CI | `npm run test:ci` |
| Thumbnails → WebP | `npm run convert-thumbnails` |
| Test d'envoi SMTP | `npm run test:email` |
| Migration photos « galerie seulement » | `npm run migrate:gallery-only` |
| Migration des originaux hors du statique | `npm run migrate:originals` (dry-run), puis `-- --apply` |
| Recette de sécurité HTTP (instance locale isolée) | `npm run test:security` |

**État vérifié** : `npx jest --ci --silent` → 42 suites passantes, 721 tests passants, 0 skip. `TESTS_REPORT.md` est daté (445 tests, 14 skips) et ne reflète plus l'état actuel.

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
- Les pages HTML utilisent des **placeholders côté serveur** : `<!-- SEO_HERO_PLACEHOLDER -->`, `<!-- SEO_BOTTOM_PLACEHOLDER -->`, `<!-- GALLERIES_LIST_PLACEHOLDER -->`, `<!-- GALLERY_HERO_PLACEHOLDER -->`, `<!-- GALLERY_DESCRIPTION_PLACEHOLDER -->`, `<!-- GALLERY_PHOTOS_PLACEHOLDER -->`, `<!-- META_PLACEHOLDER_END -->`, `{{DYNAMIC_TITLE}}`, `{{DYNAMIC_DESCRIPTION}}`. La page d'accueil ajoute `<!-- HOME_SHEET_PLACEHOLDER -->`, `<!-- HOME_STRIPS_PLACEHOLDER -->`, `<!-- HOME_INDEX_PLACEHOLDER -->` et `<!-- HOME_MOSAIC_PLACEHOLDER -->`, remplis par `server/utils/homeSheetService.js` à partir des galeries publiques. Ne pas supprimer les placeholders attendus par `server/routes/pages.js`.
- **Contenu (données)** : `config/galleries.json`, `texts.json`, `links.json`, `campaigns.json`, `seo.json` **ne sont pas trackés** (gitignorés via `config/*.json`) — les `*.example` sont trackés : `texts.json.example`, `config.json.example`, `campaigns.json.example`, **`seo.json.example`, `galleries.json.example`, `links.json.example`** (modèles). Structure observée : `galleries.json` = `{metadata, galleries[]}` avec `id`, `slug`, `title`, `artist`, `venue`, `date`, `description`, `cover`, `photos[]`, `published`, `createdAt`, `updatedAt`, `excludeFromMain`, `galleryOnlyPhotos` ; `texts.json` = `{main, meta, "a propos", footer}` ; `seo.json` = `{site, pages, artists, venues, intro_text, footer_seo}`.
- **Photos** : originaux dans `paths.photoOriginals` (`PHOTOS_ORIGINALS_DIR`, hors DocumentRoot en prod, **jamais servis en statique**) ; les galeries référencent des fichiers par nom ; le redimensionnement se fait à la volée via `/photos/resize?file=...&w=...` (largeurs en liste blanche, 1600 px max) ; l'accès HD (3 photos/galerie, kit presse) passe par des URLs signées HMAC valables 1 h. Pour ajouter des photos : via l'admin (POST `/admin/upload`, multer → `temp/`), pas à la main. Migration du dossier : `npm run migrate:originals` (dry-run) puis `-- --apply`.
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
- `CONFIG_FILE` (optionnel, chemin absolu du JSON de config),
- `PHOTOS_ORIGINALS_DIR` (dossier des originaux, **hors DocumentRoot** en prod ; défaut `./photos-originals`).

Les tests injectent leurs propres valeurs via `tests/setup.js` — ne pas y mettre de vrais secrets.

## Fichiers générés, sensibles ou interdits de modification

- **Ne jamais modifier** : `dist/manifest.json`, `dist/css/output.<hash>.css(+.br/.gz)` (générés), les refs CSS dans `pages/*.html` (réécrites par le build), `coverage/`, `logs/`, `temp/`, `photos/resized/`, `photos/*.{jpg,jpeg,png,webp,gif}` et `photos/thumbnails/*` (contenu/utilisateur, gitignorés), `server.log`.
- **Sensibles** : `.env` (non tracké, porteur de secrets — ne jamais afficher ses valeurs), `config/*.json` réels (non trackés), `data/analytics/` (journaux de session anonymisés, non trackés).
- `data/analytics/` — stockage des analytics (JSONL append-only, rétention 90 j). Gitignoré, et protégé en prod par `BLOCKED_DIRS_RE` (`server.js`) + `RedirectMatch` (`.htaccess`). **Ne jamais y écrire de données identifiantes** : le serveur ne doit stocker ni IP, ni User-Agent, ni cookie.
- Ancien artefact `dist/output.css` (legacy Tailwind) supprimé en `389a22b` — seul `dist/css/output.css` (pré-fingerprint) existe, ne pas le confondre avec `dist/css/output.<hash>.css`.
- `AUDIT.md`, `REFACTORING_PLAN.md`, `REFACTORING_STATUS.md`, `photos/README.md`, `CONFIG_README.md`, `server/README.md` : documentation active, à tenir à jour en cas de changement correspondant.
- `*.local.json` / `*.secret.json` dans `config/` : overrides locaux jamais commités (voir `CONFIG_README.md`).

## Procédure recommandée avant toute modification

1. Lire `AGENTS.md`, puis le fichier concerné et ses tests existants. Pour toute question cross-module, consulter `graphify-out/GRAPH_REPORT.md`.
2. Vérifier l'état git (`git status`) — ne pas écraser un travail en cours.
3. Ne pas toucher les fichiers listés ci-dessus sauf nécessité avérée.
4. Après modification : `git diff` ciblé, puis exécuter les tests relatifs (cf. checklist).

## Checklist de validation avant livraison

- [ ] `npx jest --ci --silent` → tout vert (42 suites / 721 tests).
- [ ] Le CSS modifié passe par le build : `npm run build:css && npm run build:assets`, puis `git status` cohérent (HTML + manifest + fingerprint).
- [ ] Aucune valeur d'env réelle ajoutée/commitée.
- [ ] Toujours relancer le serveur après un build CSS (`npm run dev`) et tester dans un vrai navigateur — les tests Jest ne couvrent pas le rendu client ni la CSP en conditions réelles.
- [ ] Vérifier les routes exposées : pas de `express.static(root)` (statics ciblés `/dist`, `/photos` uniquement) ; pas de nouveau secret en dur ; pas de suppression de directive CSP nécessaire au site (scriptSrcAttr/unsafe-inline, jsdelivr, unpkg…).

## Déploiement

Vérifié sur le serveur de production (`~/photo.mprnl.fr` sur `web2-fr.hosterfy.com`) :

- **Phusion Passenger 6** (hébergement CloudLinux/cPanel), pas de proxy Apache vers un port Node : `PassengerAppRoot`, `PassengerBaseURI "/"`, `PassengerStartupFile server.js`. Passenger sert **tout** le site, y compris les fichiers statiques de la racine du projet.
- Conséquence de sécurité : `.env`, `config/*.json`, `*.md`, `package.json` étaient téléchargeables publiquement. Deux couches protègent désormais : les règles `<FilesMatch>`/`RedirectMatch` du `.htaccess` **et** le middleware de refus dans `server.js` (robuste au chemin URL-encodé). Ne jamais faire confiance à une seule.
- Le `.htaccess` versionné contient la config Passenger générée par cPanel : c'est le seul `.htaccess` qui fonctionne en prod. Ne pas le remplacer par une version « Apache + proxy :3000 ».
- Redémarrage après déploiement : `touch tmp/restart.txt`.
- Déploiement : `git pull --ff-only` sur le serveur (branche `main`). Toute modif manuelle sur le serveur est perdue au pull — et un pull échoue s'il y a des fichiers modifiés localement.
- Domaine de production : `https://www.photo.mprnl.fr`. Pas de CI/CD dans le dépôt (`.github/` ne contient que FUNDING.yml + templates d'issues).

## Particularités et pièges

- **Ne jamais laisser de fichier sensible dans la racine du projet** : c'est la racine du DocumentRoot. Les sauvegardes (`.env.bak*`, `config/*.bak*`, `photos.zip`) y ont longtemps traîné et étaient téléchargeables. Les stocker hors du DocumentRoot (`~/hors-ligne-mprnl/`, `chmod 700`).
- Les noms de variables SMTP en prod sont `SMTP_USER`/`SMTP_PASS`/`SMTP_HOST`/`SMTP_PORT` (`.env.example` documente encore `GMAIL_*`, conservé comme repli dans `server/config.js`).

- **Express 5** : les patterns de routes diffèrent d'Express 4 (attention aux wildcards et aux handlers d'erreur).
- **Helmet 8 + CSP** : directives à maintenir explicitement, sinon tout casse silencieusement : `scriptSrcAttr: ["'unsafe-inline'"]` (événements inline), `scriptSrc` incluant jsdelivr/unpkg/`'unsafe-inline'`/`'unsafe-eval'`, `styleSrc` incluant jsdelivr + fonts.googleapis + `'unsafe-inline'`, `connectSrc` jsdelivr, `crossOriginEmbedderPolicy: false`, `crossOriginResourcePolicy: cross-origin`. Helmet 8 ajoute `upgrade-insecure-requests` automatiquement.
- Le serveur pré-compresse (`Content-Encoding: br/gz`) les assets avec `Cache-Control: immutable` ; un nouveau type d'asset précompressé doit être ajouté au middleware de `server.js:93-142` et au serveur Express statique ciblé.
- **Les scripts ne sont pas fingerprintés** : `/dist/js` est donc servi à part avec `Cache-Control: no-cache` (revalidation ETag). Sans ça, une correction JS n'arrive jamais chez un visiteur déjà venu (le `/dist` global est en `immutable, 1 an`).
- `sharp` est une dépendance native ; si l'install échoue : `SHARP_IGNORE_INSTALL_ERROR=1`.
- `photos/thumbnails/` doit exister pour que l'upload fonctionne (`.gitkeep` tracké).
- Ne pas coder en dur des URLs externes ou domaines dans le code serveur sans raison : canonical et sitemap utilisent `https://www.photo.mprnl.fr` en dur dans `pages.js` (cohérent avec `SITE_URL`).
- Ne pas ajouter de logs de debug dans les routes (les anciens logs bruyants ont été purgés en `389a22b`).

## Outillage local (agents)

- `graphify-out/` (tracké) : graphe de connaissance avec `GRAPH_REPORT.md`, `graph.html`, `graph.svg`, `graph.json`. Le plugin est chargé via `.opencode/opencode.json` → `.opencode/plugins/graphify.js`. Pour l'exploration cross-module, y jeter un œil d'abord.
- `.mimocode/`, `.claude/`, `.vscode/` : configs d'outils locaux, observer mais ne pas modifier sans demande.