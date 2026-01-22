# Restructuration des fichiers HTML - Plan d'action

## Problème actuel

Les fichiers HTML contiennent trop de code JavaScript inline :

- **home.html** : 1612 lignes (trop volumineux !)
- **mentions.html** : 754 lignes
- **contact.html** : 553 lignes
- **about_me.html** : 430 lignes

## Solution : Extraction du JavaScript

### Fichiers créés

#### 1. `/dist/js/console-warning.js`

✅ Créé - Contient le message d'avertissement console en production

#### 2. `/dist/js/photo-protection.js`

✅ Créé - Protection des photos (clic droit, F12, etc.) + fonction `window.requestHDImage()`

#### 3. `/dist/js/animated-blobs.js`

✅ Créé - Animation des blobs de fond avec parallax

#### 4. `/dist/js/gallery-loader.js`

⚠️ Créé mais incomplet - Doit contenir :

- Fonction `loadGallery()` complète (800+ lignes)
- Logique Masonry
- Logique Fancybox avec HD loading
- EXIF parsing
- Preloading des images

#### 5. `/dist/js/cinematic-intro.js`

⚠️ Créé mais incomplet - Doit contenir :

- Animation typewriter complète
- Transition vers header

## Plan de restructuration par page

### home.html (PRIORITAIRE - 1612 lignes)

**À extraire :**

1. Tout le bloc `<script defer>` lignes 95-1089 (995 lignes de JS!)
2. Le déplacer dans les fichiers modulaires appropriés

**Structure finale :**

```html
<head>
  ... (liens CSS, fonts, etc.)

  <!-- Scripts de sécurité et protection -->
  <script defer src="/dist/js/console-warning.js"></script>

  <!-- Bibliothèques externes -->
  <script defer src="...alpinejs..."></script>
  <script defer src="...exifr..."></script>
  <script defer src="...fancybox..."></script>
  <script defer src="...masonry..."></script>
  <script defer src="...imagesloaded..."></script>

  <!-- Scripts de la galerie -->
  <script defer src="/dist/js/gallery-loader.js"></script>
  <script defer src="/dist/js/cinematic-intro.js"></script>
</head>

<body>
  ... (contenu HTML uniquement)

  <!-- Scripts de fin de page -->
  <script defer src="/dist/js/photo-protection.js"></script>
  <script defer src="/dist/js/animated-blobs.js"></script>
  <script defer src="/dist/js/fade_in.js"></script>
  <script defer src="/dist/js/menu.js"></script>
  <script defer src="/dist/js/text-loader.js"></script>
  <script defer src="/dist/js/user-tracker.js"></script>
</body>
```

### mentions.html (754 lignes)

**À extraire :**

- Script de dark mode (50 lignes)
- Console warning (déjà dans console-warning.js)
- Photo protection (déjà dans photo-protection.js)

### contact.html (553 lignes)

**À extraire :**

- Console warning (déjà dans console-warning.js)
- Photo protection (déjà dans photo-protection.js)
- Animated blobs (déjà dans animated-blobs.js)

### about_me.html (430 lignes)

**À extraire :**

- Console warning (déjà dans console-warning.js)
- Photo protection (déjà dans photo-protection.js)
- Animated blobs (déjà dans animated-blobs.js)

## Avantages de la restructuration

1. **Lisibilité** : HTML réduit à sa structure (balises, contenu)
2. **Maintenance** : Code JS centralisé dans des fichiers dédiés
3. **Performance** : Mise en cache des fichiers JS
4. **Réutilisabilité** : Fichiers partagés entre plusieurs pages
5. **Débogage** : Plus facile de localiser et corriger les bugs

## Prochaines étapes

1. ✅ Créer les fichiers JS de base (fait)
2. ⚠️ Compléter gallery-loader.js avec tout le code (en cours)
3. ⚠️ Compléter cinematic-intro.js (en cours)
4. 🔲 Modifier home.html pour référencer les fichiers externes
5. 🔲 Modifier les autres pages HTML
6. 🔲 Tester que tout fonctionne correctement

## Note importante

La fonction `loadGallery()` dans home.html fait environ **800 lignes** de code complexe.
Elle doit être extraite avec précaution pour ne rien casser.
