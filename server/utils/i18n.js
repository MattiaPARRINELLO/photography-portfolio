const dict = {
  fr: {
    nav: { portfolio: 'PORTFOLIO', galleries: 'GALERIES', about: 'À PROPOS', contact: 'CONTACT', openMenu: 'Ouvrir le menu principal' },
    home: {
      cta: 'Voir mes projets',
      artists: 'Artistes photographiés',
      venues: 'Salles & festivals',
      collabTitle: 'Collaborations & événements',
      collabP1: (a, v) => `J'ai eu la chance de photographier des artistes comme <strong>${a}</strong>, dans des salles emblématiques : <strong>${v}</strong>.`,
      collabP2: 'Média musical, artiste émergent, label ou salle de concert, je suis disponible pour capturer l\'énergie de vos événements partout en France.',
      collabCta: 'Discutons de votre projet'
    },
    about: {
      h1: 'Mattia Parrinello, photographe de concert à Paris',
      hello: 'Salut, je suis Mattia',
      artistsTitle: 'Artistes photographiés',
      venuesTitle: 'Salles & festivals',
      historyKicker: 'Mon histoire',
      historyTitle: 'Comment j\'ai commencé',
      footer: 'Mattia Parrinello, Photographe de concert à Paris · Disponible en Île-de-France et partout en France'
    },
    contact: {
      h1: 'Contactez Mattia Parrinello, photographe de concert',
      intro1: 'Vous cherchez un <strong>photographe de concert à Paris</strong> ? Que vous soyez un <strong>média musical</strong>, un <strong>artiste émergent</strong>, un <strong>label</strong>, une <strong>salle de concert</strong> ou un <strong>organisateur de festival</strong>, discutons de votre projet.',
      intro2: 'Je suis disponible pour couvrir vos événements en <strong>Île-de-France</strong> et partout en <strong>France</strong> : concerts, festivals, showcases, backstage, soirées de lancement.',
      intro3: 'Réponse sous 24h · Devis gratuit · Déplacement sur toute la France',
      emailLabel: 'Votre email',
      subjectLabel: 'Objet',
      subjectPlaceholder: 'Dites-moi comment je peux vous aider',
      messageLabel: 'Votre message',
      messagePlaceholder: 'Laissez un message...',
      submit: 'Envoyer',
      sending: 'Envoi en cours...',
      success: 'Message envoyé !'
    },
    galleries: {
      h1: 'Galeries de concerts',
      empty: 'Les premières galeries arrivent bientôt.',
      contact: 'Me contacter pour un projet',
      breadcrumbHome: 'Accueil',
      breadcrumbGalleries: 'Galeries'
    },
    gallery: {
      breadcrumbHome: 'Accueil',
      breadcrumbGalleries: 'Galeries',
      noPhotos: 'Aucune photo dans cette galerie.',
      pressKitKicker: 'Kit presse, gratuit avec crédit',
      pressKitTitle: 'Vous êtes l\'artiste, la salle ou un média ?',
      pressKitDesc: (artist, venue) => `Téléchargez <strong>3 photos HD</strong> de <strong>${artist}${venue}</strong> pour vos réseaux, site ou dossier presse. <strong>Usage gratuit contre crédit + lien cliquable.</strong>`,
      pressKitDescCompact: 'Pour l\'artiste, la salle ou la presse : 3 HD libres pour réseaux/site contre crédit + lien.',
      pressKitLicence: 'Usage presse & réseaux avec crédit obligatoire. HD via URL signée valable 1h.',
      pressKitCopyLink: 'Copier le lien',
      pressKitShare: 'Partager',
      pressKitDownload: (n) => `Télécharger HD ${n}`,
      pressKitCredit: 'Crédit :',
      allGalleries: '← Toutes les galeries'
    },
    footer: {
      legal: 'Mentions légales',
      copyright: '© Mattia Parrinello, Toutes les photos publiées sur ce site sont protégées. Toute utilisation non autorisée est passible de sanctions.',
      seo: 'Mattia Parrinello - Photographe de concert à Paris · Disponible en Île-de-France et partout en France',
      address: 'Paris · Île-de-France, Disponible partout en France'
    },
    common: {
      download: 'Télécharger',
      copy: 'Copier',
      copied: 'Copié !',
      share: 'Partager',
      email: 'Email',
      whatsapp: 'WhatsApp'
    }
  },
  en: {
    nav: { portfolio: 'PORTFOLIO', galleries: 'GALLERIES', about: 'ABOUT', contact: 'CONTACT', openMenu: 'Open main menu' },
    bio: [
      "I'm Mattia Parrinello, <strong>concert photographer</strong> based in <strong>Paris</strong>, <strong>MPRNL</strong> is the professional name under which I sign and share my work. What drives me is the raw energy of artists on stage, the moment when light, sound and emotion collide. I capture what the audience feels but doesn't always see: the intensity of a gaze, the sweat under the lights, the controlled chaos of a live show.",
      "Specialized in <strong>rap music</strong> and urban scenes, I've had the chance to shoot artists like <strong>Jok'air, Arma Jackson, Wallace Cleaver, Cyrus.wrld, Trebiz, Aswell</strong> and <strong>The French Kris</strong> in venues like <strong>La Cigale, La Boule Noire, La Bellevilloise, La Maroquinerie, Élispace, EMB Sannois, Paris La Défense Arena, Reims Arena, Zénith d'Amiens</strong> and the <strong>Pagaille Festival</strong>. From intimate showcase to open-air festival, every event is a new story to tell in images.",
      "My approach: being as close as possible to the action, anticipating the highlights, playing with stage light to create cinematic and striking images. No poses, no artifice, just the authenticity of live. My style blends strong contrasts, vibrant colors and an energy that oozes from every shot.",
      "I work with <strong>music media (Rapstar)</strong>, emerging artists, labels and venues. Based in <strong>Île-de-France</strong>, I travel across <strong>France</strong> to cover your events, concerts, festivals, showcases, backstage, promo, making-of, parties. Available immediately. Got a project or a show to cover? <a href=\"/contact?lang=en\">Let's talk.</a>",
      ""
    ],
    presentation: 'Hi, I\'m Mattia',
    home: {
      cta: 'View my work',
      artists: 'Artists photographed',
      venues: 'Venues & festivals',
      collabTitle: 'Collaborations & events',
      collabP1: (a, v) => `I've had the chance to photograph artists like <strong>${a}</strong>, in iconic venues: <strong>${v}</strong>.`,
      collabP2: 'Music media, emerging artist, label or venue, I\'m available to capture the energy of your events across France.',
      collabCta: "Let's talk about your project"
    },
    about: {
      h1: 'Mattia Parrinello, concert photographer in Paris',
      hello: 'Hi, I\'m Mattia',
      artistsTitle: 'Artists photographed',
      venuesTitle: 'Venues & festivals',
      historyKicker: 'My story',
      historyTitle: 'How it started',
      footer: 'Mattia Parrinello, Concert photographer in Paris · Available in Île-de-France and across France'
    },
    contact: {
      h1: 'Contact Mattia Parrinello, concert photographer',
      intro1: 'Looking for a <strong>concert photographer in Paris</strong>? Whether you\'re a <strong>music outlet</strong>, an <strong>emerging artist</strong>, a <strong>label</strong>, a <strong>venue</strong> or a <strong>festival organizer</strong>, let\'s talk about your project.',
      intro2: 'I\'m available to cover your events in <strong>Île-de-France</strong> and across <strong>France</strong>: concerts, festivals, showcases, backstage, launch parties.',
      intro3: 'Reply within 24h · Free quote · Travel across France',
      emailLabel: 'Your email',
      subjectLabel: 'Subject',
      subjectPlaceholder: 'Tell me how I can help',
      messageLabel: 'Your message',
      messagePlaceholder: 'Leave a message...',
      submit: 'Send',
      sending: 'Sending...',
      success: 'Message sent!'
    },
    galleries: {
      h1: 'Concert galleries',
      empty: 'First galleries coming soon.',
      contact: 'Contact me for a project',
      breadcrumbHome: 'Home',
      breadcrumbGalleries: 'Galleries'
    },
    gallery: {
      breadcrumbHome: 'Home',
      breadcrumbGalleries: 'Galleries',
      noPhotos: 'No photos in this gallery.',
      pressKitKicker: 'Press kit, free with credit',
      pressKitTitle: 'Are you the artist, venue or press?',
      pressKitDesc: (artist, venue) => `Download <strong>3 HD photos</strong> of <strong>${artist}${venue}</strong> for your socials, website or press kit. <strong>Free to use with credit + clickable link.</strong>`,
      pressKitDescCompact: 'For artists, venues or press: 3 free HD photos for socials/website with credit + link.',
      pressKitLicence: 'Press & social use with mandatory credit. HD via signed URL valid 1h.',
      pressKitCopyLink: 'Copy link',
      pressKitShare: 'Share',
      pressKitDownload: (n) => `Download HD ${n}`,
      pressKitCredit: 'Credit:',
      allGalleries: '← All galleries'
    },
    footer: {
      legal: 'Legal mentions',
      copyright: '© Mattia Parrinello, All photos on this site are protected. Unauthorized use is prohibited.',
      seo: 'Mattia Parrinello, Concert photographer in Paris · Available in Île-de-France and across France',
      address: 'Paris · Île-de-France, Available across France'
    },
    common: {
      download: 'Download',
      copy: 'Copy',
      copied: 'Copied!',
      share: 'Share',
      email: 'Email',
      whatsapp: 'WhatsApp'
    }
  }
};

function t(lang, path) {
  const parts = path.split('.');
  let cur = dict[lang] || dict.fr;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in cur) cur = cur[p];
    else return null;
  }
  return cur;
}

// Dictionnaire FR→EN plat, ordonné long→court (remplace les 80+ appels r() inline)
const _enDict = {
  // Accueil — planche contact
  'Deux saisons dans la fosse. La lumière tombe mal, les visages bougent, et c\'est exactement ce que je viens chercher.': 'Two seasons in the pit. The light falls wrong, faces move, and that is exactly what I come for.',
  'Cliquez une date pour isoler ce concert dans les bandes et dans la planche. Les images s\'ouvrent en grand.': 'Click a date to isolate that show in the strips and on the sheet. Images open full size.',
  'photographie les concerts depuis la fosse. Tournées rap, festivals, clubs : il cherche la lumière qui tombe mal et le geste qui dure une seconde.': 'photographs shows from the pit. Rap tours, festivals, clubs: he looks for the light that falls wrong and the gesture that lasts a second.',
  'Ses images sont publiées par des médias musicaux, des labels et des artistes. Pour une date, une accréditation ou une série, écrivez-lui.': 'His images are published by music media, labels and artists. For a date, an accreditation or a series, write to him.',
  'Un concert à couvrir ? Dites-moi la date et la salle.': 'A show to cover? Tell me the date and the venue.',
  'Le carnet de route': 'The tour log',
  'Les concerts': 'The shows',
  'La planche': 'The sheet',
  'Tout afficher': 'Show everything',
  'Artistes & salles': 'Artists & venues',
  'Photographe de concert, Paris': 'Concert photographer, Paris',
  '220 images · 11 concerts': '220 images · 11 shows',
  'Me confier un concert': 'Book a show',
  'À propos': 'About',
  '>Tout<': '>All<',
  'Artistes photographiés': 'Artists photographed',
  'Salles & festivals': 'Venues & festivals',
  'Artistes': 'Artists',
  'Salles': 'Venues',
  'Galeries': 'Galleries',
  // Nav
  'GALERIES': 'GALLERIES',
  'À PROPOS': 'ABOUT',
  'Ouvrir le menu principal': 'Open main menu',
  // Footer longs
  '© Mattia Parrinello, Toutes les photos publiées sur ce site sont protégées. Toute utilisation non autorisée est passible de sanctions.': '© Mattia Parrinello, All photos on this site are protected. Unauthorized use is prohibited.',
  'Paris · Île-de-France, Disponible partout en France<br />(+33) 6 50 58 62 51 · contact.mprnl@gmail.com': 'Paris · Île-de-France, Available across France<br />(+33) 6 50 58 62 51 · contact.mprnl@gmail.com',
  'Mattia Parrinello, Photographe de concert à Paris · Disponible en Île-de-France et partout en France': 'Mattia Parrinello, Concert photographer in Paris · Available in Île-de-France and across France',
  'Paris · Île-de-France, Disponible partout en France': 'Paris · Île-de-France, Available across France',
  'Mentions légales': 'Legal mentions',
  'Retour à l\'accueil': 'Back to home',
  'Photographe de concert à Paris': 'Concert photographer in Paris',
  'Toutes les photos publiées sur ce site sont protégées.': 'All photos on this site are protected.',
  'Toute utilisation non autorisée est passible de sanctions.': 'Unauthorized use is prohibited.',
  // Contact
  'Contactez Mattia Parrinello, photographe de concert': 'Contact Mattia Parrinello, concert photographer',
  'Vous cherchez un': 'Looking for a',
  'salle de concert</strong> ou un <strong>organisateur de festival</strong>, discutons de votre projet.': 'venue</strong> or a <strong>festival organizer</strong>, let\'s talk about your project.',
  'Je suis disponible pour couvrir vos événements en': 'I\'m available to cover your events in',
  'Réponse sous 24h · Devis gratuit · Déplacement sur toute la France': 'Reply within 24h · Free quote · Travel across France',
  'Dites-moi comment je peux vous aider': 'Tell me how I can help',
  'Laissez un message...': 'Leave a message...',
  'Votre email': 'Your email',
  '>Objet<': '>Subject<',
  'Votre message': 'Your message',
  // Contact, planche contact
  'Écrivez à Mattia Parrinello, photographe de concert à Paris.': 'Write to Mattia Parrinello, concert photographer in Paris.',
  'Un concert à couvrir ?': 'A show to cover?',
  'Concerts, festivals, showcases, backstage. Dites-moi la date, la salle et l\'usage des images : je réponds sous 24 heures avec une proposition claire.': 'Concerts, festivals, showcases, backstage. Tell me the date, the venue and how the images will be used: I reply within 24 hours with a clear proposal.',
  'Je travaille seul, sans assistant, pour rester mobile dans la fosse. Vous recevez une sélection triée et retouchée, prête à publier.': 'I work alone, without an assistant, to stay mobile in the pit. You get a sorted, retouched selection, ready to publish.',
  'Livraison des images': 'Image delivery',
  'Délai de réponse': 'Reply time',
  'Formats livrés': 'Delivered formats',
  'Zone couverte': 'Coverage',
  'JPEG haute définition, versions web, tirage sur demande': 'High-definition JPEG, web versions, prints on request',
  '48 à 72 heures après le concert': '48 to 72 hours after the show',
  'Paris, Île-de-France et toute la France': 'Paris, Île-de-France and all of France',
  'Sous 24 heures': 'Within 24 hours',
  'Tirage du jour': 'Print of the day',
  'vous@exemple.fr': 'you@example.com',
  'La date, la salle, l\'artiste, ce que vous attendez des images...': 'The date, the venue, the artist, what you expect from the images...',
  'Les trois champs sont obligatoires': 'All three fields are required',
  'Ces informations ne servent qu\'à répondre à votre message.': 'This information is only used to reply to your message.',
  'Ou écrivez directement à': 'Or write directly to',
  'Formulaire': 'Form',
  '>Envoyer<': '>Send<',
  'Aller au contenu': 'Skip to content',
  'Navigation principale': 'Main navigation',
  'Pied de page': 'Footer',
  // About
  'Mattia Parrinello, photographe de concert à Paris': 'Mattia Parrinello, concert photographer in Paris',
  '>Salut, je suis Mattia<': '>Hi, I\'m Mattia<',
  'Je suis Mattia <span class="animate-wave">': 'Hi, I\'m Mattia <span class="animate-wave">',
  'Mon histoire': 'My story',
  'Comment j\'ai commencé': 'How it started',
  // Bio
  'Je suis Mattia Parrinello, <strong>photographe de concert</strong> basé à <strong>Paris</strong>, <strong>MPRNL</strong> est le nom professionnel sous lequel je signe et diffuse mes images.': 'I\'m Mattia Parrinello, <strong>concert photographer</strong> based in <strong>Paris</strong>, <strong>MPRNL</strong> is the professional name under which I sign and share my work.',
  'Mon truc, c\'est l\'énergie brute des artistes': 'What drives me is the raw energy of artists',
  'Spécialisé dans la <strong>musique rap</strong> et les scènes urbaines, j\'ai eu la chance de shooter des artistes comme': 'Specialized in <strong>rap music</strong> and urban scenes, I\'ve had the chance to shoot artists like',
  'Mon approche : être au plus près de l\'action': 'My approach: being as close as possible to the action',
  'Je travaille avec des <strong>médias musicaux (Rapstar)</strong>': 'I work with <strong>music media (Rapstar)</strong>',
  // Galleries
  'Galeries de concerts': 'Concert galleries',
  'Les premières galeries arrivent bientôt.': 'First galleries coming soon.',
  'Me contacter pour un projet': 'Contact me for a project',
  'Aucune photo dans cette galerie.': 'No photos in this gallery.',
  '← Toutes les galeries': '← All galleries',
  // Mentions légales
  'En vigueur au 09/01/2026': 'Effective as of 09/01/2026',
  'Édition du site': 'Site Publisher',
  'Hébergement': 'Hosting',
  'Accès au site': 'Site Access',
  'Propriété intellectuelle': 'Intellectual Property',
  'Données personnelles (RGPD)': 'Personal Data (GDPR)',
  'Cookies et outils de statistiques': 'Cookies and analytics',
  'Responsabilité': 'Liability',
  'Droit applicable et litiges': 'Applicable law and disputes',
  'Éditeur :': 'Publisher:',
  'Statut :': 'Status:',
  'Auto-entrepreneur / Entreprise individuelle': 'Self-employed / Sole proprietorship',
  'Activité :': 'Activity:',
  'Photographe indépendant': 'Independent photographer',
  'Adresse :': 'Address:',
  'SIRET :': 'Company No.:',
  'Numéro de TVA intracommunautaire :': 'Intra-community VAT number:',
  'Non applicable': 'Not applicable',
  'Directeur de la publication :': 'Publication director:',
  'Hébergeur :': 'Hosting provider:',
  'Le Site est normalement accessible à tout moment.': 'The Site is normally accessible at all times.',
  'Accueil</a>': 'Home</a>',
  'Galeries</a>': 'Galleries</a>',
};

function translateHtml(html, lang) {
  if (lang !== 'en') return html;
  let out = html;
  const r = (fr, en) => { out = out.split(fr).join(en); };
  // Dictionnaire principal (déjà ordonné long→court)
  for (const [fr, en] of Object.entries(_enDict)) {
    r(fr, en);
  }
  // Paragraphes histoire (trop longs pour le dictionnaire)
  r('J\'ai toujours été intrigué par la photo depuis petit, sans vraiment m\'y intéresser. À mes <strong>18 ans</strong>, des amis ont découvert la photo et m\'ont offert un appareil. Quelques semaines plus tard, je pars en <strong>Égypte</strong> : je ramène de très belles photos, les retours sont unanimes. Je me suis dit que j\'avais quelque chose à faire si je m\'y mettais sérieusement.', 'I\'ve always been intrigued by photography since I was a kid, without really getting into it. At <strong>18</strong>, some friends discovered photography and gave me a camera. A few weeks later I went to <strong>Egypt</strong>: I came back with great photos and the feedback was unanimous. I told myself I had something to pursue if I took it seriously.');
  r('Avant les concerts, je faisais de la <strong>photo de rue</strong> et je photographiais parfois mes amis à la <strong>danse</strong>. Mon premier vrai concert que j\'ai voulu shooter, c\'était <strong>Jok\'air à Beauvais</strong>. On est en août, juste après l\'Égypte : impossible de trouver des places. J\'ai l\'idée d\'y aller en tant que photographe. Je contacte beaucoup de monde, sans succès, je m\'y prends trop tôt, le concert est en octobre. Je comprends alors qu\'il me faut un <strong>portfolio avec des photos de concert</strong>.', 'Before concerts I was doing <strong>street photography</strong> and sometimes shooting friends who <strong>dance</strong>. The first real concert I wanted to shoot was <strong>Jok\'air in Beauvais</strong>. It was August, right after Egypt: impossible to find tickets. I had the idea to go as a photographer. I contacted a lot of people, with no success, I was too early, the show was in October. I then understood I needed a <strong>portfolio with concert photos</strong>.');
  r('Je contacte la salle à côté de chez moi pour leur prochain concert : ils acceptent gracieusement. J\'y vais, je shoote, et ça me donne mon premier vrai concert. Pour Jok\'air à Beauvais (Élispace), j\'ai la réponse de mon accréditation <strong>la veille du concert</strong> même. C\'est là que je me dis que je veux faire ça : je passe des heures dessus sans voir le temps passer, et ça plaît.', 'I contacted the venue next to my place for their next show: they kindly said yes. I went, I shot, and it became my first real concert. For Jok\'air in Beauvais (Élispace), I got the accreditation answer <strong>the day before the show</strong>. That\'s when I knew I wanted to do this: I could spend hours on it without seeing time pass, and people liked it.');
  r('Je suis <strong>full autodidacte</strong>, j\'ai tout appris seul. Je fais surtout du <strong>rap</strong> parce que c\'est ce que j\'écoute. Pour photographier un concert, il faut comprendre l\'artiste, l\'écouter un minimum. Je pense sincèrement qu\'on voit dans mon portfolio quand j\'écoutais déjà l\'artiste ou non.', 'I\'m <strong>fully self-taught</strong>, I learned everything on my own. I mostly shoot <strong>rap</strong> because that\'s what I listen to. To photograph a concert you need to understand the artist, to listen to them a minimum. I honestly think you can see in my portfolio when I already listened to the artist or not.');
  r('Je n\'ai heureusement jamais eu de vraie galère en fosse. Ma plus grande surprise, c\'est la réaction des gens quand je leur prends leur téléphone en <strong>crash barrière</strong> pour filmer au mieux le concert.', 'Luckily I\'ve never had a real hassle in the pit. My biggest surprise is people\'s reaction when I take their phone at the <strong>crash barrier</strong> to film the show as best as possible.');
  r('Aujourd\'hui j\'aime <strong>absolument tout dans le live</strong> : le stress avant, découvrir la scéno, l\'énergie qui monte, le moment où tout s\'aligne. C\'est pour ça que je continue.', 'Today I love <strong>absolutely everything about live</strong>: the pre-show stress, discovering the stage design, the rising energy, the moment everything aligns. That\'s why I keep going.');
  // Mentions légales (phrases longues)
  r('Conformément à la loi n°2004-575 du 21 juin 2004 pour la Confiance', 'In accordance with French Law No. 2004-575 of 21 June 2004 on Confidence');
  r('en l\'Économie Numérique (LCEN), il est porté à la connaissance des', 'in the Digital Economy (LCEN), users of the site');
  r('utilisateurs du site', 'are hereby informed of these legal mentions');
  r('L\'Éditeur se', 'The Publisher reserves');
  return out;
}

module.exports = { dict, t, translateHtml };
