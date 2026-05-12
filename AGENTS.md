# AGENTS.md — Photography Portfolio

## Commands

| Task | Command |
|---|---|
| Dev server (nodemon) | `npm run dev` |
| Production server | `npm start` |
| Build CSS (autoprefixer) | `npm run build:css` |
| Minify + fingerprint + precompress + update HTML refs | `npm run build:assets` |
| Full build (both) | `npm run build:css && npm run build:assets` |
| Convert thumbnails to WebP | `npm run convert-thumbnails` |
| Test email sending | `npm run test:email` |

**No test suite.** `npm test` exits with error.

**Build order:** `build:css` first, then `build:assets`. The latter auto-updates all `pages/*.html` CSS references.

## CSS Pipeline

```
src/input.css → (autoprefixer) → dist/css/output.css → (minify+fingerprint) → dist/css/output.<hash>.css
```

- `src/input.css` is the **single source of truth**. Edit it directly — no Tailwind directives, no build-only abstractions.
- `npm run build:css` passes it through autoprefixer into `dist/css/output.css`.
- `npm run build:assets` minifies with csso, fingerprints (sha256 truncated), writes `.br`/`.gz` precompressed versions, updates every `*.html` in `pages/`, writes `dist/manifest.json`, and cleans old fingerprinted files.
- After a CSS build, restart the dev server (`npm run dev`) to pick up changes.

## Architecture

- **Entry point:** `server.js` — Express 5 app.
- **Config:** `server/config.js` — singleton. Precedence: `CONFIG_FILE` env → `config/config.json` → `config/config.local.json` → `config/config.json.example`. Shallow-merges local overrides.
- **Routes:** `server/routes/` (admin, content, pages, photos, stats, signed-images, image-resize).
- **Middleware:** `server/middleware/auth.js` (cookie HMAC admin auth), `tracking.js`.
- **Utils:** `server/utils/` (galleryService, linksService, photoService, campaignService, textUtils, globalErrorManager).
- **Pages:** `pages/` — HTML pages served by Express.
- **Client JS:** `dist/js/` (gallery-loader, cinematic-intro, photo-protection, animated-blobs, etc.). Uses Alpine.js, Fancybox, Masonry, exifr from CDN.
- **Photos:** `photos/` (originals) + `photos/thumbnails/`. Both gitignored except structure files.
- **Config JSON:** `config/` — `galleries.json`, `links.json`, `seo.json`, `texts.json`. Local variants (`*.local.json`, `*.secret.json`) are gitignored.

## Env Vars

Required in `.env` (see `.env.example`):
- `PORT` (default 3000)
- `ADMIN_PASSWORD` — admin login
- `GMAIL_USER` / `GMAIL_PASS` — SMTP for contact form
- `IMAGE_SECRET_KEY` — HMAC key for signed HD image URLs

## Key Conventions

- **All comments and UI text are in French.**
- **Admin auth:** Cookie HMAC token (`adminAuth`) + Express session. `requireAdminSession` / `requireAdminPage` middleware.
- **Signed images:** `server/routes/signed-images.js` generates HMAC-signed URLs for HD photo requests.
- **Some HTML pages still contain inline JS.** Refactoring is in progress (see `REFACTORING_PLAN.md`). New extracted JS goes into `dist/js/`.

## Gotchas

- **Express 5** is used — route handler patterns differ from Express 4.
- `sharp` is a native dependency. `pnpm-workspace.yaml` disables its build. If sharp install fails: `SHARP_IGNORE_INSTALL_ERROR=1`.
- `photos/thumbnails/` must exist for uploads to work.
- Config JSON files in `config/` that contain real data are gitignored. Only `*.example` files are tracked. Copy an example and remove `.example` suffix to use.
- The old CSS was built with Tailwind v3 but the build pipeline no longer uses Tailwind — the frozen Tailwind utility classes live in `src/input.css`/`output.css` as plain CSS.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- ALWAYS read graphify-out/GRAPH_REPORT.md before reading any source files, running grep/glob searches, or answering codebase questions. The graph is your primary map of the codebase.
- IF graphify-out/wiki/index.md EXISTS, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
