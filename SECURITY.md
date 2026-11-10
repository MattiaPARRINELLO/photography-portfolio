> **Document interne, ne pas publier.** Il décrit des vulnérabilités non
> corrigées. Ne pas committer sur une branche publiée ni joindre à une PR avant
> correction et vérification.

# Sécurité

Audit automatique du site en production, réalisé le 10 novembre 2026 avec
[Strix](https://github.com/usestrix/strix) (agents IA de pentest), modèle
DeepSeek V4.1 Flash via OpenCode Go, mode `quick`, cible `https://photo.mprnl.fr`.

Scan interrompu volontairement au bout de 1 h 28 pour maîtriser la durée.
84 observations enregistrées, dont **2 vulnérabilités confirmées**. Les 82 autres
sont des points vérifiés sans vulnérabilité démontrée.

Coût du scan : environ 0,80 $ (77 M tokens d'entrée, dont 75 M servis par le cache).

---

## 1. XSS réfléchi via les paramètres de campagne (à corriger en priorité)

- **Sévérité** : moyenne, CVSS 6.5, CWE-79, confiance haute
- **Endpoint** : `/?lang=en&c=`, aussi `utm_campaign`, `ref`, `utm_source`, `source`
- **Correction** : faible effort

La page d'accueil construit un bloc `<script>` avec les paramètres de campagne :

```html
<script>
    // Informations campagnes injectées
    window.campaignInfo = {"id":"...","source":null};
</script>
```

Les valeurs ne sont pas échappées pour le contexte script. Un `</script>` dans le
paramètre ferme l'élément et le reste est interprété comme du HTML, donc du
JavaScript arbitraire s'exécute sur l'origine du site.

Aggravant : le rendu de l'accueil est mis en cache côté serveur avec une clé qui
**exclut la query string**. La page empoisonnée est donc servie aux visiteurs qui
ouvrent l'URL normale, sans lien piégé et sans interaction. La persistance mesurée
est d'environ 62 s et peut être renouvelée indéfiniment. Le cache est partagé entre
l'apex et `www`. Le sink n'existe que sur l'accueil et seulement dans le rendu
anglais.

Preuve observée, valeur de campagne reprise telle quelle dans la réponse :

```html
<script>
    // Informations campagnes injectées
    window.campaignInfo = {"id":"</script><svg onload=document.title='NOQPWN'>","source":null};
</script>
```

### Remédiation

1. Arrêter d'interpoler les paramètres de requête dans le document. Le tracker
   client lit déjà la campagne via `URLSearchParams` : l'injection serveur de
   `window.campaignInfo` peut disparaître entièrement.
2. Si elle est conservée, sérialiser avec un encodeur qui échappe `<`, `>`, `&`
   et `/` en séquences unicode, pour que `</script>` ne puisse jamais se former.
3. Valider les champs de campagne contre une liste blanche de caractères stricte.
4. Durcir la CSP en nonce ou hash, sans `'unsafe-inline'` pour `script-src` et
   `script-src-attr`.
5. Inclure la query string dans la clé du cache de rendu, ou ne plus mettre en
   cache un rendu personnalisé.

---

## 2. Verrouillage global du login admin (déni de service)

- **Sévérité** : moyenne, CWE-400
- **Endpoint** : `POST /admin/login`
- **Correction** : faible effort

L'interface `/admin` limite à 5 tentatives par 15 minutes, mais le compteur n'est
pas rattaché au client. Un tiers anonyme peut épuiser le quota et bloquer l'accès
administratif pour tout le monde. Le panneau n'a qu'un seul administrateur, donc
le verrouillage coupe tout accès à l'administration.

Séquence observée, le quota descend jusqu'à 0 puis répond 429 quel que soit le
client, y compris avec des `X-Forwarded-For` différents :

```http
POST /admin/login  -> 401  RateLimit-Remaining: 4
POST /admin/login  -> 401  RateLimit-Remaining: 3
POST /admin/login  -> 401  RateLimit-Remaining: 2
POST /admin/login  -> 401  RateLimit-Remaining: 1
POST /admin/login  -> 401  RateLimit-Remaining: 0
POST /admin/login  -> 429
```

### Remédiation

1. Indexer le limiteur sur la vraie adresse client. Configurer `trust proxy` pour
   le seul saut Apache (`app.set('trust proxy', 'loopback')`) afin que `req.ip`
   vienne du `X-Forwarded-For` posé par Apache, puis vérifier qu'une autre adresse
   source obtient son propre compteur.
2. Remplacer le refus global par un délai progressif ou un backoff exponentiel par
   client.
3. Garder un budget par client d'environ 5 tentatives par 15 minutes.
4. Renvoyer des `Retry-After` et `RateLimit-Reset` exacts pour le client réellement
   limité.
5. Envisager un CAPTCHA ou une preuve de travail après plusieurs échecs, et
   surveiller les 429 répétés sur le login comme signal de verrouillage en cours.

---

## Couverture et limites

- Scan en boîte noire sur le site déployé, pas sur le code source.
- Mode `quick`, interrompu avant la fin : la couverture restante n'est pas connue.
- Aucune authentification administrateur utilisée pendant le scan.
- Les 82 observations restantes sont disponibles dans le rapport complet, non
  versionné ici : `strix_runs/photo-mprnl-fr_c192/`.

## Relancer un scan

```bash
strix -n -t https://photo.mprnl.fr -m quick \
  --fail-on high --max-budget 2 --max-turns 60
```
