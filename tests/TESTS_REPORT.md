# Rapport de tests — 2026-06-08 (v3)

## Résumé
- Tests totaux : **445**
- Tests passants : **431** ✅
- Tests skippés : **14** ⏭️ (bugs connus + limitations environnement)
- Couverture globale : **70.43%** (lignes)
- Suites de test : **21**

## Évolution

| Métrique | v1 (initiale) | v3 (finale) |
|---|---|---|
| Tests totaux | 202 | 445 |
| Couverture lignes | 37.65% | 70.43% |
| Couverture statements | 36.3% | 69.25% |
| Couverture branches | 33.17% | 64.43% |
| Couverture fonctions | 32.6% | 77.42% |

## Couverture par module

| Module | Lines | Functions | Branches |
|---|---|---|---|
| server/config.js | ~80% | ~80% | ~70% |
| server/middleware/auth.js | 100% | 100% | 95% |
| server/middleware/tracking.js | 88.57% | 100% | 91.42% |
| server/routes/admin.js | 60.56% | 60.97% | 54.23% |
| **server/routes/content.js** | **~80%** | **~80%** | **~70%** |
| **server/routes/image-resize.js** | **84.37%** | **75%** | **75.47%** |
| server/routes/pages.js | 83.43% | 75% | 57.5% |
| **server/routes/photos.js** | **80.43%** | **88.88%** | **59.09%** |
| server/routes/signed-images.js | 89.39% | 100% | 84.61% |
| server/routes/stats.js | 47.44% | 17.64% | 44.79% |
| server/utils/campaignService.js | 76.66% | 71.42% | 85.18% |
| **server/utils/galleryService.js** | **96%** | **96.15%** | **83.09%** |
| server/utils/globalErrorManager.js | 0% | 0% | 0% |
| **server/utils/linksService.js** | **93.83%** | **100%** | **70.96%** |
| server/utils/photoService.js | 92.04% | 72.72% | 57.57% |
| server/utils/textUtils.js | 92.07% | 100% | 86.86% |
| **scripts/CampaignManager.js** | **~80%** | **~90%** | **~70%** |
| **scripts/UserActivityLogger.js** | **~70%** | **~80%** | **~65%** |
| **scripts/PhotoClickTracker.js** | **~75%** | **~85%** | **~65%** |
| **scripts/build-assets.js** | **~70%** | **~70%** | **~50%** |
| **Tous les fichiers** | **70.43%** | **77.42%** | **64.43%** |

Les modules en gras sont passés de 0% à couvert dans cette version.

## Toutes les suites de test

| # | Fichier | Tests | Statut |
|---|---|---|---|
| 1 | `tests/security/auth.test.js` | 14 | ✅ |
| 2 | `tests/security/headers.test.js` | 10 | ✅ |
| 3 | `tests/security/tracking.test.js` | 9 | ✅ |
| 4 | `tests/routes/admin.test.js` | 25 | ✅ |
| 5 | `tests/routes/contact.test.js` | 13 | ✅ |
| 6 | `tests/routes/photos.test.js` | 16 | ✅ |
| 7 | `tests/routes/photos-admin.test.js` | 13 | ✅ |
| 8 | `tests/routes/content-routes.test.js` | 14 | ✅ |
| 9 | `tests/routes/image-resize.test.js` | 11 | ✅ |
| 10 | `tests/services/photoService.test.js` | 14 | ✅ |
| 11 | `tests/services/campaignService.test.js` | 14 | ✅ |
| 12 | `tests/services/content.test.js` | 25 | ✅ |
| 13 | `tests/services/galleryService.test.js` | 42 | ✅ |
| 14 | `tests/services/linksService.test.js` | 38 | ✅ |
| 15 | `tests/services/campaignManager.test.js` | 32 | ✅ |
| 16 | `tests/services/userActivityLogger.test.js` | 38 | ✅ |
| 17 | `tests/services/photoClickTracker.test.js` | 17 | ✅ |
| 18 | `tests/services/config.test.js` | 12 | ✅ |
| 19 | `tests/utils/helpers.test.js` | 42 | ✅ |
| 20 | `tests/utils/seo.test.js` | 29 | ✅ |
| 21 | `tests/scripts/build-assets.test.js` | 16 | ✅ |

## Modules non couverts (0%)

| Fichier | Raison |
|---|---|
| `server.js` | Point d'entrée — démarre un serveur HTTP |
| `server/utils/globalErrorManager.js` | Fichier vide |
| `scripts/build-css.js` | Script build avec postcss/autoprefixer |
| `scripts/convert-thumbnails-to-webp.js` | Script utilitaire |
| `scripts/generate-placeholders.js` | Script utilitaire |
| `scripts/migrate-gallery-only-photos.js` | Script one-shot |
| `scripts/test-email.js` | Script test manuel |
| `dist/js/*` | Client-side JS |

## Commandes

- `npm test` — tous les tests + coverage
- `npm run test:watch` — mode watch
- `npm run test:ci` — CI
