# Migration des Thumbnails vers WebP

## ✅ Migration effectuée le 6 novembre 2025

### Changements apportés

1. **Format des thumbnails** : Toutes les thumbnails sont désormais au format **WebP** au lieu de JPEG
2. **Réduction de taille** : ~58.7% d'économie d'espace pour les thumbnails existantes
3. **Configuration mise à jour** : `config/config.json` spécifie maintenant `format: "webp"`

### Modifications des fichiers

#### Scripts
- `scripts/convert-thumbnails-to-webp.js` : Nouveau script pour convertir les thumbnails existantes
- `scripts/generate-placeholders.js` : Génère maintenant des placeholders en WebP

#### Serveur
- `server/routes/photos.js` : 
  - Génération de thumbnails en WebP lors de l'upload
  - URLs des thumbnails pointent vers des fichiers `.webp`
  - Suppression des thumbnails WebP lors de la suppression d'une photo

#### Configuration
- `config/config.json` : 
  - `thumbnails.format` : `"jpeg"` → `"webp"`
  - `thumbnails.quality` : `92` → `85` (WebP offre une meilleure compression)

### Commandes disponibles

```bash
# Convertir les thumbnails existantes (déjà fait)
npm run convert-thumbnails

# Générer les placeholders en WebP
node scripts/generate-placeholders.js
```

### Résultats de la migration

- **60 thumbnails** converties
- **Taille avant** : 7085.38 KB (7.09 MB)
- **Taille après** : 2926.86 KB (2.93 MB)
- **Économie** : 4158.53 KB (4.16 MB) - **58.7%** de réduction

### Compatibilité

Le format WebP est supporté par tous les navigateurs modernes :
- Chrome 23+
- Firefox 65+
- Safari 14+
- Edge 18+

### Notes pour le futur

- Les nouvelles photos uploadées généreront automatiquement des thumbnails en WebP
- Les placeholders (si utilisés) seront également en WebP
- Aucune modification nécessaire dans le code frontend (les URLs sont gérées automatiquement)
