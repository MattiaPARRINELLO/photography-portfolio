// Protection des photos
(function () {
  const isProduction = !window.location.hostname.match(/localhost|127\.0\.0\.1/);

  function prevent(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  if (isProduction) {
    // Mode production strict
    document.addEventListener('contextmenu', prevent, true);
    document.addEventListener('keydown', function (e) {
      const k = e.key && e.key.toLowerCase();
      if (e.key === 'F12') prevent(e);
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (k === 'i' || k === 'j' || k === 'c')) prevent(e);
      if ((e.ctrlKey || e.metaKey) && (k === 's' || k === 'u')) prevent(e);
    }, true);
  } else {
    // Mode développement - protection images uniquement
    document.addEventListener('contextmenu', function (e) {
      if (e.target && e.target.tagName === 'IMG') prevent(e);
    }, true);
    document.addEventListener('keydown', function (e) {
      const k = e.key && e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (k === 's' || k === 'u')) prevent(e);
    }, true);
  }

  // Protection drag & drop
  document.addEventListener('dragstart', function (e) {
    if (e.target && e.target.tagName === 'IMG') prevent(e);
  }, true);

  // Désactiver le drag sur toutes les images
  document.querySelectorAll('img').forEach(function (img) {
    try {
      img.setAttribute('draggable', 'false');
      img.style.userSelect = 'none';
      img.style.webkitUserDrag = 'none';
    } catch (e) { }
  });

  // Overlay de protection sur les images dans les liens
  document.querySelectorAll('a > img').forEach(function (img) {
    try {
      var a = img.parentElement;
      if (!a) return;
      if (getComputedStyle(a).position === 'static') a.style.position = 'relative';
      if (a.querySelector('.img-protect-overlay')) return;
      var ov = document.createElement('span');
      ov.className = 'img-protect-overlay';
      ov.style.position = 'absolute';
      ov.style.inset = '0';
      ov.style.display = 'block';
      ov.style.zIndex = '3';
      ov.style.background = 'transparent';
      ov.style.cursor = 'pointer';
      ov.addEventListener('click', function () { a.click(); });
      ov.addEventListener('contextmenu', prevent);
      a.appendChild(ov);
    } catch (e) { }
  });

  // Fonction pour demander une URL signée pour les images HD
  window.requestHDImage = async function (originalPath) {
    try {
      devLog('🔐 Demande URL signée pour:', originalPath);
      const response = await fetch('/api/request-hd-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagePath: originalPath })
      });
      if (!response.ok) {
        const errorText = await response.text();
        devError('❌ Erreur serveur:', response.status, errorText);
        return originalPath;
      }
      const data = await response.json();
      if (data.success) {
        devLog('✅ URL signée reçue:', data.url);
        return data.url;
      }
      throw new Error(data.error || 'Erreur accès HD');
    } catch (err) {
      devError('Erreur requestHDImage:', err);
      return originalPath;
    }
  };
})();
