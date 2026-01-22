// Animated blobs follow the pointer — subtle parallax + idle float
(function () {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const bg = document.querySelector('.animated-bg');
  if (!bg) return;

  const blobs = Array.from(bg.querySelectorAll('.blob'));
  if (!blobs.length) return;

  let mx = 0, my = 0; // target normalized (-0.5..0.5)
  let lx = 0, ly = 0; // last smoothed
  const ease = 0.08;
  let lastTime = performance.now();

  window.addEventListener('pointermove', (e) => {
    mx = (e.clientX / window.innerWidth) - 0.5;
    my = (e.clientY / window.innerHeight) - 0.5;
  }, { passive: true });

  function animate(t) {
    const dt = (t - lastTime) / 1000;
    lastTime = t;

    // smooth
    lx += (mx - lx) * ease;
    ly += (my - ly) * ease;

    blobs.forEach((b, i) => {
      const idx = i + 1;
      const depth = idx / blobs.length; // 0..1
      // base float using time + depth for subtle autonomous motion
      const floatX = Math.sin(t / 2000 + i) * (8 + i * 2) * (0.6);
      const floatY = Math.cos(t / 1800 + i) * (6 + i * 1.5) * (0.5);
      // mouse influence scaled by depth (front blobs move more)
      const mxPx = lx * 140 * (1 - depth * 0.6);
      const myPx = ly * 80 * (1 - depth * 0.6);
      const scale = 1 - depth * 0.06;
      b.style.transform = `translate3d(${mxPx + floatX}px, ${myPx + floatY}px, 0) scale(${scale})`;
    });

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
})();
