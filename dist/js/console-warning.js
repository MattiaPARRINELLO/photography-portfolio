// Protection et logs conditionnels
const isProduction = !window.location.hostname.match(/localhost|127\.0\.0\.1/);
const devLog = isProduction ? function(){} : console.log.bind(console);
const devWarn = isProduction ? function(){} : console.warn.bind(console);
const devError = isProduction ? function(){} : console.error.bind(console);

if (isProduction) {
  console.log('%c\n' +
    '═══════════════════════════════════════════════════════════════════\n' +
    '║                                                                 ║\n' +
    '║               ⚠️  AVERTISSEMENT DE SÉCURITÉ  ⚠️                ║\n' +
    '║                                                                 ║\n' +
    '═══════════════════════════════════════════════════════════════════',
    'color: #ff3333; font-size: 16px; font-weight: bold; font-family: monospace; line-height: 1.5;'
  );
  
  console.log('%c\n🚫 ACCÈS NON AUTORISÉ À LA CONSOLE DE DÉVELOPPEMENT 🚫\n',
    'color: #ff6600; font-size: 22px; font-weight: bold; text-shadow: 2px 2px 4px rgba(0,0,0,0.8); background: linear-gradient(90deg, #330000, #000000); padding: 15px 20px; border-radius: 5px;'
  );
  
  console.log(
    '%c┌────────────────────────────────────────────────────────────┐\n' +
    '│  Vous tentez d\'accéder aux photos de ce site ?            │\n' +
    '│                                                            │\n' +
    '│  ❌ TÉLÉCHARGEMENT INTERDIT                                │\n' +
    '│  ❌ COPIE INTERDITE                                        │\n' +
    '│  ❌ UTILISATION NON AUTORISÉE INTERDITE                    │\n' +
    '└────────────────────────────────────────────────────────────┘',
    'color: #ffff00; font-size: 15px; font-weight: bold; font-family: monospace; line-height: 1.8; background: #1a1a1a; padding: 20px; border-left: 5px solid #ff0000;'
  );
  
  console.log(
    '%c\n📸 PROTECTION DU DROIT D\'AUTEUR\n',
    'color: #00ffff; font-size: 18px; font-weight: bold; text-decoration: underline;'
  );
  
  console.log(
    '%c© Mattia Parrinello - Tous droits réservés\n\n' +
    'Toutes les photographies publiées sur ce site sont protégées par le droit d\'auteur.\n' +
    'Toute reproduction, représentation, modification, publication, transmission,\n' +
    'dénaturation, totale ou partielle du site ou de son contenu, par quelque\n' +
    'procédé que ce soit, sans autorisation écrite préalable est interdite et\n' +
    'constitue un délit de contrefaçon sanctionné par les articles L.335-2 et\n' +
    'suivants du Code de la propriété intellectuelle.\n',
    'color: #ffffff; font-size: 14px; line-height: 1.6; background: #1a1a1a; padding: 15px; border-left: 4px solid #00ff00;'
  );
  
  console.log(
    '%c⚖️  SANCTIONS PÉNALES\n',
    'color: #ff6666; font-size: 16px; font-weight: bold; text-decoration: underline;'
  );
  
  console.log(
    '%cLa contrefaçon est punie de :\n' +
    '• 300 000 € d\'amende\n' +
    '• 3 ans d\'emprisonnement\n' +
    '(Articles L.335-2 et suivants du Code de la propriété intellectuelle)\n',
    'color: #ff9999; font-size: 13px; line-height: 1.8; font-weight: bold; background: #2a0000; padding: 15px; border-left: 4px solid #ff0000;'
  );
  
  console.log(
    '%c📋 Pour toute demande d\'utilisation légitime :\n' +
    '→ Utilisez le formulaire de contact : ' + window.location.origin + '/contact\n' +
    '→ Consultez les mentions légales : ' + window.location.origin + '/mentions-legales\n',
    'color: #90EE90; font-size: 13px; line-height: 1.8; font-style: italic; padding: 10px;'
  );
  
  console.log('%c\n' +
    '═══════════════════════════════════════════════════════════════════\n',
    'color: #ff3333; font-size: 16px; font-weight: bold; font-family: monospace;'
  );
}
