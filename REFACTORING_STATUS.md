# REFACTORING HTML - Documentation

## ✅ Travail effectué

### Fichiers JavaScript créés :

1. **`/dist/js/console-warning.js`** (66 lignes)
   - Message d'avertissement stylisé pour la console
   - S'affiche uniquement en production
   - Avertit contre le vol de photos

2. **`/dist/js/photo-protection.js`** (104 lignes)
   - Protection clic droit / F12 / raccourcis clavier
   - Overlay transparent sur les images
   - Fonction `window.requestHDImage()` pour URLs signées

3. **`/dist/js/animated-blobs.js`** (48 lignes)
   - Animation parallax des blobs d'arrière-plan
   - Suit le mouvement de la souris
   - Animation fluide avec RAF

### Structure recommandée pour home.html

Le fichier home.html contient **995 lignes de JavaScript inline** qui doivent être extraites.

**Fichiers à créer :**

- `home-gallery-core.js` - Logique principale de la galerie (500+ lignes)
- `home-fancybox-hd.js` - Gestion du chargement HD dans Fancybox (300+ lignes)
- `home-cinematic-intro.js` - Animation d'introduction (150+ lignes)

**Nouvelle structure HTML recommandée :**

```html
<!DOCTYPE html>
<head>
  <meta charset="UTF-8" />
  <title>Galerie Photo - Mattia Parrinello</title>

  <!-- CSS -->
  <link rel="stylesheet" href="../dist/css/output.css" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fancyapps/ui@5.0/dist/fancybox/fancybox.css" />

  <!-- Bibliothèques externes -->
  <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/exifr/dist/full.umd.min.js"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/@fancyapps/ui@5.0/dist/fancybox/fancybox.umd.js"></script>
  <script defer src="https://unpkg.com/masonry-layout@4/dist/masonry.pkgd.min.js"></script>
  <script defer src="https://unpkg.com/imagesloaded@5/imagesloaded.pkgd.min.js"></script>

  <!-- Scripts de sécurité (chargés en premier) -->
  <script defer src="/dist/js/console-warning.js"></script>

  <!-- Scripts de la galerie (TODO: à créer) -->
  <script defer src="/dist/js/home-gallery-core.js"></script>
  <script defer src="/dist/js/home-fancybox-hd.js"></script>
  <script defer src="/dist/js/home-cinematic-intro.js"></script>

  <!-- CSS inline minimal pour les blobs -->
  <style>
    .animated-bg{ position:fixed; inset:0; z-index:0; pointer-events:none; overflow:hidden; }
    .animated-bg .blob{ position:absolute; width:50vmax; height:50vmax; border-radius:50%; filter:blur(36px); opacity:0.22; }
    /* ... autres styles blobs ... */
  </style>
</head>

<body class="dark:bg-black bg-white">
  <!-- Blobs animés -->
  <div class="animated-bg">
    <div class="blob b1"></div>
    <div class="blob b2"></div>
    <div class="blob b3"></div>
    <div class="blob b4"></div>
    <div class="blob b5"></div>
    <div class="blob b6"></div>
    <div class="blob b7"></div>
  </div>

  <!-- Header/Nav -->
  <header>
    <nav>...</nav>
  </header>

  <!-- Galerie -->
  <main>
    <div id="gallery" class="masonry-grid">
      <!-- Les photos seront injectées ici par JS -->
    </div>
  </main>

  <!-- Footer -->
  <footer>...</footer>

  <!-- Scripts de fin de page -->
  <script defer src="/dist/js/photo-protection.js"></script>
  <script defer src="/dist/js/animated-blobs.js"></script>
  <script defer src="/dist/js/fade_in.js"></script>
  <script defer src="/dist/js/menu.js"></script>
  <script defer src="/dist/js/text-loader.js"></script>
  <script defer src="/dist/js/user-tracker.js"></script>
</body>
</html>
```

## État actuel

**Avant refactoring :**

- home.html : **1612 lignes** (dont ~1000 de JS)
- mentions.html : 754 lignes
- contact.html : 553 lignes
- about_me.html : 430 lignes
- **Total : 3349 lignes**

**Après refactoring (objectif) :**

- home.html : ~250-300 lignes (HTML pur)
- mentions.html : ~200 lignes
- contact.html : ~200 lignes
- about_me.html : ~180 lignes
- **Total HTML : ~830-880 lignes**
- **Total JS (fichiers séparés) : ~2500 lignes**

## Prochaines étapes

1. ✅ Scripts de protection créés
2. 🔲 Extraire le code de la galerie dans home-gallery-core.js
3. 🔲 Extraire la logique Fancybox HD dans home-fancybox-hd.js
4. 🔲 Extraire l'intro cinématique dans home-cinematic-intro.js
5. 🔲 Simplifier home.html
6. 🔲 Simplifier les autres pages
7. 🔲 Tester

## Commande utile pour extraire

```bash
# Extraire les lignes 95-1089 de home.html (le gros bloc JS)
sed -n '95,1089p' /home/mattia/photography-portfolio/pages/home.html > extracted_js.txt
```

Cette extraction nécessite une attention particulière car le code est très complexe avec :

- Gestion Masonry
- Intégration Fancybox
- Chargement progressif des images
- Animation HD avec transitions
- EXIF parsing
- Preloading intelligent
- Skeleton loaders
