# Dossier Photos

Ce dossier contient toutes vos photos de portfolio.

## Structure :

- `photos-originals/` : Photos originales en haute qualité (hors du dossier statique public)
- `/photos/thumbnails/` : Miniatures générées automatiquement (seul contenu servi en statique)
- `/photos/resized/` : Cache de redimensionnement (généré, jamais servi en statique)

> **Important :** les originaux ne sont **jamais** servis en statique. Ils vivent
> dans `paths.photoOriginals` (`PHOTOS_ORIGINALS_DIR`, par défaut
> `photos-originals/`, et **hors du DocumentRoot en production**).
> Le site sert uniquement `/photos/resize?file=…&w=…` (1600 px max) et les URLs
> signées du kit presse (`/api/hd-image`).
> Migration : `node scripts/migrate-originals-out.js` (dry-run par défaut),
> puis `node scripts/migrate-originals-out.js --apply`.

## Formats supportés :

- JPG/JPEG
- PNG
- WebP

## Notes :

- Les photos sont automatiquement redimensionnées
- Les miniatures sont générées lors de l'upload
- Ce dossier n'est pas synchronisé avec Git pour des raisons de taille

## TODO - Fonctionnalités à développer :

### 📝 Modification des métadonnées

- [ ] Interface admin pour modifier les métadonnées des photos
- [ ] Édition des titres et descriptions personnalisées
- [ ] Modification des données EXIF affichées
- [ ] Gestion des tags et catégories
- [ ] Réorganisation de l'ordre des photos dans la galerie
- [ ] Ajout de légendes personnalisées
- [ ] Gestion des albums/collections
