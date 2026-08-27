# SEO — Questions à confirmer (Mattia Parrinello / MPRNL)

Toutes les réponses servent à rendre le site **cohérent et non contradictoire**
entre le contenu visible, les métadonnées et les données structurées (JSON-LD).
Aucune de ces informations n'a été inventée : chaque point ci-dessous est un
écart constaté entre les sources du dépôt (configs, pages, galeries) ou une
information manquante.

## Identité et noms

1. **Nom professionnel exact** — Le site utilise « Mattia Parrinello » partout,
   et « MPRNL » comme nom de marque (domaine `mprnl.fr`, email, alternates JSON-LD).
   Confirme la formulation officielle à afficher : « Mattia Parrinello — MPRNL »,
   « Mattia Parrinello (MPRNL) », ou autre.
   → Utilisé dans : H1, metas, JSON-LD `alternateName`, footer, approche artistique.

2. **Relation Mattia Parrinello ↔ MPRNL** — « MPRNL » est-il simplement un
   pseudonyme/scène de diffusion, ou une entité distincte (marque déposée,
   société, collectif) ?
   → JSON-LD `Person.alternateName` (déjà posé) ; si entité distincte, ajouter une
   `Organization` avec `brand`.

3. **Cyrus / Cyrus.wrld** — Les galeries indiquent « Cyrus.wrld » ; `seo.json`,
   la page À propos et le hero indiquent « Cyrus ». Quelle est l'orthographe
   officielle ?
   → Titres de galeries, pages artistes, JSON-LD `MusicGroup.name`, listes.

4. **The French Kris / The French Kriss / TheFrenchKris** — Trois variantes
   coexistent : galeries « TheFrenchKris », `seo.json` « The French Kris »,
   page À propos « The French Kriss ». Laquelle est correcte ?
   → Listes artistes (home, À propos), JSON-LD, cohérence éditoriale.

5. **Romsi / Romsii (et « romsii-retourne-la-cigale »)** — Galerie « Romsii »,
   `seo.json` « Romsi ». Orthographe officielle ?
   → Listes artistes, JSON-LD `MusicGroup`.

## Coordonnées

6. **Email officiel** — Deux emails publics coexistent : `contact@mprnl.fr`
   (config SEO) et `contact.mprnl@gmail.com` (page liens, mentions légales).
   Lequel est l'adresse de contact officielle (l'autre doit être aligné ou retiré) ?
   → Footer, page contact, `/links`, mentions légales, JSON-LD `ContactPage`.

7. **Adresse personnelle affichée** — Le footer de la page À propos affiche une
   adresse personnelle complète (« 1 rue Victor Basch Franconville 95130 »).
   Souhaites-tu la retirer du pied de page (recommandé : publier uniquement la
   ville/zone et l'email) ? Une adresse restera nécessaire dans les mentions
   légales si tu exerces en nom propre.
   → Footer À propos (retrait éventuel), mentions légales (conservation).

8. **Téléphone et WhatsApp** — Le `+33 6 50 58 62 51` et le lien WhatsApp
   (`wa.me/33650586251`) sont-ils des coordonnées professionnelles à conserver
   publiquement ?
   → Footer, `/links`, JSON-LD `telephone`.

## Activité et biographie

9. **Ville de base et zone d'intervention** — Le site dit « Paris » / « Île-de-France »
   et « disponible partout en France ». Confirme : base réelle, déplacements
   (France entière ? Europe ?).
   → Textes visibles, `areaServed` JSON-LD, sitemap.

10. **Spécialités prioritaires** — Actuellement : « rap et musiques actuelles »,
    concerts, festivals, showcases, backstage. Y a-t-il d'autres spécialités à
    mettre en avant (captation promo, portraits d'artistes, pochettes, making-of) ?
    → Bio visible, listes de prestations, `knowsAbout` JSON-LD.

11. **Types de clients recherchés** — Le site mentionne « médias musicaux,
    artistes émergents, labels, salles de concert ». Confirme les cibles
    prioritaires (ex. presse, maisons de disques, festivals, artistes).
    → Bio, page contact, CTA.

12. **Biographie courte** — Valider les 3 paragraphes actuels de la page À propos
    (véridiques ? à ajuster ?), avec : parcours (comment tu as débuté), années
    d'expérience si pertinent, formations éventuelles.
    → Page À propos.

13. **Approche artistique et matériel** — La bio évoque « lumière de scène,
    images cinématiques ». Peux-tu confirmer 1-2 phrases sur ta signature visuelle
    (post-traitement, formats, équipement si tu veux le partager) ?
    → Page À propos, descriptions de galeries.

14. **Collaborations et publications vérifiables** — Une galerie mentionne un
    reportage « pour Rapstar ». Liste les médias/labels/salles/artistes avec qui
    tu as collaboré et que tu acceptes de citer publiquement.
    → Page À propos, page contact, mentions « crédits », autorité éditoriale.
    (Aucun nom ne sera ajouté sans ta confirmation.)

15. **Profils sociaux officiels** — Confirme les comptes publics à relier en
    `sameAs` : Instagram `mattia_jpeg`, TikTok `@mattia_jpeg` (vérifiés dans la
    config SEO). D'autres plateformes officielles (Behance, 500px, YouTube) ?
    → JSON-LD `sameAs`, footer, `/links`.

16. **Disponibilités et délais** — Mentionner une disponibilité (immédiate, X
    semaines) et la possibilité de déplacements longue distance ?
    → Page contact, page À propos.

## Site et langues

17. **Langues** — Le site est 100 % français. Une version anglaise (partielle ou
    complète) est-elle souhaitée pour les labels/artistes internationaux ?
    → Si oui : `hreflang`, traduction des pages clés, `inLanguage` JSON-LD.

18. **Crédits clients** — Autorises-tu l'affichage du nom des artistes/structures
    photographiés en légende ou en page crédits ?
    → Descriptions de galeries, légendes, crédits photo.

19. **Adresse dans les mentions légales** — À confirmer pour la conformité
    (éditeur) : nom, adresse ou siège professionnel, contact, hébergeur.
    → `pages/mentions.html`.

---

### Consigne transversale
Pour chaque point : **aucune donnée ne sera ajoutée ou modifiée sans ta réponse** ;
les écarts restent listés ici tant qu'ils ne sont pas tranchés.