// Animation d'introduction cinématique
// Anime le nom "MATTIA PARRINELLO" qui s'écrit lettre par lettre puis se déplace vers le header

async function cinematicIntro() {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = 'intro-overlay';
    overlay.innerHTML = `
      <div class="intro-inner">
        <div class="intro-line" data-line="1">MATTIA PARRINELLO</div>
      </div>
    `;
    document.body.appendChild(overlay);

    const headerLink = document.querySelector('a.font-signika');
    if (headerLink) headerLink.style.visibility = 'hidden';

    const inner = overlay.querySelector('.intro-inner');

    // Adapter les couleurs au thème
    try {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      const bg = prefersDark ? '#000' : '#fff';
      const textColor = prefersDark ? '#fff' : '#111';
      overlay.style.backgroundColor = bg;
      inner.style.color = textColor;
      if (!prefersDark) inner.style.textShadow = '0 1px 0 rgba(255,255,255,0.02), 0 2px 12px rgba(0,0,0,0.06)';
      else inner.style.textShadow = 'none';
    } catch (e) {}

    // Voir fichier complet pour l'animation complète...
    // Animation typewriter + transition vers header
    
    // Pour l'instant, résoudre rapidement pour ne pas bloquer
    setTimeout(() => {
      overlay.remove();
      if (headerLink) headerLink.style.visibility = '';
      resolve();
    }, 100);
  });
}

// Démarrer l'intro au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
  const galleryPromise = window.loadGallery && window.loadGallery();
  cinematicIntro().catch(() => {});
});
