# Portfolio photo

Portfolio photographique personnel, en production sur **[photo.mprnl.fr](https://photo.mprnl.fr)**.

Parti d'un template statique (fork de [`JoaoFranco03/photography-portfolio`](https://github.com/JoaoFranco03/photography-portfolio)), je l'ai transformé en application Node.js/Express avec un back-office complet : galeries, textes, liens, SEO et campagnes se gèrent depuis l'interface d'administration, sans toucher au code.

## Fonctionnalités

- **Galeries dynamiques** : upload, tri, couverture, légendes, lecture des métadonnées EXIF
- **Back-office** protégé par mot de passe et session, sans base de données (config JSON)
- **Images** : redimensionnement et conversion WebP à la volée (`sharp`), URLs signées pour les originaux
- **SEO** : sitemap, `robots.txt`, Open Graph, et `llms.txt` pour les crawlers IA
- **Multilingue** : contenu et interface en plusieurs langues
- **Suivi d'audience** : statistiques de consultation, liens trackés, campagnes et bannière d'événement
- **Sécurité** : `helmet`, limitation de débit, blocage des fichiers sensibles, tests dédiés

## Stack

Node.js, Express 5, `sharp`, `multer`, `helmet`, `express-session`, `nodemailer`, Tailwind CSS 4, Jest.

## Lancer en local

```bash
git clone https://github.com/MattiaPARRINELLO/photography-portfolio.git
cd photography-portfolio
npm install
cp .env.example .env     # renseigner les variables
npm run build:css
npm run dev              # nodemon, ou npm start
```

Variables d'environnement principales (voir `.env.example`) : `PORT`, `SESSION_SECRET`, `ADMIN_PASSWORD`, `IMAGE_SECRET_KEY`, `PHOTOS_ORIGINALS_DIR`, `SITE_URL`, `GMAIL_USER` et `GMAIL_PASS` pour l'envoi d'e-mails.

## Tests

```bash
npm test              # Jest avec couverture
npm run test:security # smoke tests de sécurité
```

Les tests couvrent les routes, les services (galeries, SEO, campagnes, stockage), et un ensemble dédié à la sécurité (authentification, en-têtes, fichiers sensibles, images non publiques).

## Structure

```
server.js              point d'entrée Express
server/
  config.js            chargement de la configuration
  middleware/          auth, i18n, statique protégé, tracking
  routes/              admin, contenu, photos, images signées, stats, pages
  utils/               galeries, SEO, campagnes, stockage, EXIF, i18n
config/                exemples de configuration (galeries, textes, SEO, liens)
pages/                 vues
photos/                images servies
tests/                 Jest (routes, services, sécurité)
scripts/               build CSS, assets, migrations, smoke tests
```

## Origine du projet

Le point de départ est le template statique de [`JoaoFranco03/photography-portfolio`](https://github.com/JoaoFranco03/photography-portfolio). Le rendu dynamique, le back-office, les services et les tests ont été ajoutés par-dessus.
