// Logique de chargement de la galerie
// Ce fichier gère le chargement des photos, Masonry, et Fancybox

// Start fetching photos list immediately
const photosListPromise = window.INJECTED_PHOTOS 
  ? Promise.resolve(window.INJECTED_PHOTOS) 
  : fetch('/photos-list').then(res => res.json()).catch(err => []);

// Masonry instance holder
let masonryInstance = null;

// Skeleton helpers
function showSkeleton(container, count = 12) {
  if (container.children.length > 0 && !container.querySelector('.skeleton-grid')) {
    return;
  }
  const sk = document.createElement('div');
  sk.className = 'skeleton-grid';
  for (let i = 0; i < count; i++) {
    const it = document.createElement('div');
    it.className = 'skeleton-item';
    sk.appendChild(it);
  }
  container.appendChild(sk);
}

function removeSkeletons(container) {
  const sk = container.querySelector('.skeleton-grid');
  if (sk) sk.remove();
}

// Voir le fichier complet pour la suite...
// Ce fichier contient toute la logique de la galerie avec Fancybox
