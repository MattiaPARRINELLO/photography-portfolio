# Architecture Modulaire du Serveur Photography Portfolio

## 📁 Structure du Projet

Le serveur a été refactorisé en une architecture modulaire pour améliorer la maintenabilité et la lisibilité du code.

```
server/
├── config.js                 # Configuration centralisée
├── middleware/
│   ├── auth.js               # Authentification admin
│   └── tracking.js           # Tracking utilisateurs et campagnes
├── routes/
│   ├── admin.js              # Routes administration générales
│   ├── content.js            # Routes textes et campagnes
│   ├── pages.js              # Routes pages publiques
│   ├── photos.js             # Routes gestion photos
│   └── stats.js              # Routes logs et statistiques
└── utils/
    ├── campaignService.js    # Service de gestion des campagnes
    └── textUtils.js          # Utilitaires pour textes et meta tags
```

## 🔧 Modules Principaux

### 1. **Configuration (`server/config.js`)**

- Configuration centralisée du serveur
- Gestion des chemins de fichiers
- Variables d'environnement
- Configuration par défaut

### 2. **Utilitaires**

#### `server/utils/textUtils.js`

- Chargement des textes depuis `texts.json`
- Injection des meta tags dans les pages HTML
- Gestion des Open Graph tags
- Support des campagnes marketing

#### `server/utils/campaignService.js`

- Cache des associations utilisateur-campagne
- Traitement des paramètres de campagne depuis l'URL
- Nettoyage automatique du cache (24h)
- Récupération d'informations de campagne multi-sources

### 3. **Middleware**

#### `server/middleware/auth.js`

- `checkAdminPassword()` : Vérification par header
- `requireAdminSession()` : Vérification session pour API
- `requireAdminPage()` : Vérification session pour pages

#### `server/middleware/tracking.js`

- `userTrackingMiddleware()` : Tracking utilisateurs et logging
- `campaignMiddleware()` : Traitement des campagnes URL

### 4. **Routes Modulaires**

#### `server/routes/pages.js` - Pages Publiques

- Route `/` (accueil avec support campagnes)
- Route `/contact`
- Route `/a-propos`
- Route `/texts.json`
- Redirections propres

#### `server/routes/admin.js` - Administration

- Interface admin principale
- Authentification (login/logout)
- Gestion configuration
- Éditeur de texte

#### `server/routes/photos.js` - Gestion Photos

- Liste photos avec métadonnées EXIF
- Upload avec génération thumbnails
- Administration photos
- Suppression photos

#### `server/routes/content.js` - Contenu

- CRUD textes (admin)
- CRUD campagnes (admin)
- Gestion campagnes marketing

#### `server/routes/stats.js` - Statistiques et Logs

- Envoi emails
- Tracking legacy (`/track`)
- Logs d'actions utilisateurs
- Statistiques photos
- Administration logs
- Nettoyage automatique

## 🚀 Avantages de la Modularisation

### **Maintenabilité**

- Code organisé par responsabilité
- Fichiers plus petits et focalisés
- Réduction de la complexité

### **Lisibilité**

- Structure claire et logique
- Séparation des préoccupations
- Documentation modulaire

### **Évolutivité**

- Ajout facile de nouvelles fonctionnalités
- Modification isolée des modules
- Tests unitaires simplifiés

### **Réutilisabilité**

- Utilitaires réutilisables
- Middleware configurables
- Services indépendants

## 🔄 Migration depuis l'Ancien Serveur

L'ancien serveur monolithique (1117 lignes) a été sauvegardé dans `server-original.js` et décomposé en :

- **1 fichier de configuration** (65 lignes)
- **2 utilitaires** (191 lignes total)
- **2 middleware** (133 lignes total)
- **5 fichiers de routes** (634 lignes total)
- **1 serveur principal** (119 lignes)

**Total** : ~1142 lignes réparties sur 11 fichiers modulaires (vs 1117 lignes en 1 fichier).

## 🛠️ Utilisation

Le serveur fonctionne exactement de la même manière qu'avant :

```bash
node server.js
```

Toutes les fonctionnalités sont préservées :

- ✅ Portfolio de photographie
- ✅ Système de tracking utilisateurs
- ✅ Gestion des campagnes marketing
- ✅ Interface d'administration
- ✅ Upload et gestion photos
- ✅ Logs et statistiques avancés
- ✅ Système de textes dynamiques
- ✅ Support des meta tags SEO

## 📝 Notes de Développement

- **Compatibilité** : 100% compatible avec l'ancien système
- **Performance** : Aucun impact sur les performances
- **Sécurité** : Toutes les mesures de sécurité préservées
- **API** : Toutes les routes et endpoints identiques
- **Configuration** : Même configuration `.env` requise

---

_Cette refactorisation améliore significativement la structure du code tout en conservant toutes les fonctionnalités existantes._
