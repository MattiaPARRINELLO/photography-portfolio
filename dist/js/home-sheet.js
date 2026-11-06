/* Accueil « planche contact » : filtres du carnet de route, lightbox et
   couche de mouvement GSAP. Tout le contenu est rendu par le serveur ; sans
   JavaScript il reste lisible, seuls les filtres et le mouvement manquent. */
(function () {
  "use strict";

  var state = { year: "", gig: "" };

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  ready(function () {
    var strips = Array.prototype.slice.call(document.querySelectorAll(".cs-strip"));
    var tiles = Array.prototype.slice.call(document.querySelectorAll(".cs-tile"));
    var rows = Array.prototype.slice.call(document.querySelectorAll("[data-filter-gig]"));
    var yearButtons = Array.prototype.slice.call(document.querySelectorAll("[data-filter-year]"));
    var stateEl = document.getElementById("cs-filter-state");
    var indexStatus = document.querySelector(".cs-index-status");
    var titles = {};

    strips.forEach(function (strip) {
      var name = strip.querySelector(".cs-strip-name");
      if (name) titles[strip.dataset.gig] = name.textContent.trim();
    });

    var gsap = window.gsap;
    var ScrollTrigger = window.ScrollTrigger;
    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var hasMotion = gsap && ScrollTrigger && !reduceMotion;

    if (hasMotion) {
      gsap.registerPlugin(ScrollTrigger);
    }

    // Affiche avec un léger décalage les éléments qui viennent de réapparaître
    // après un changement de filtre.
    function revealFiltered() {
      if (!hasMotion) return;
      var visibleStrips = strips.filter(function (s) { return !s.hidden; });
      var visibleTiles = tiles.filter(function (t) { return !t.hidden; });
      gsap.fromTo(
        visibleStrips,
        { autoAlpha: 0, y: 18 },
        { autoAlpha: 1, y: 0, duration: 0.45, stagger: 0.04, overwrite: true, ease: "power2.out" }
      );
      gsap.fromTo(
        visibleTiles,
        { autoAlpha: 0, y: 14 },
        { autoAlpha: 1, y: 0, duration: 0.4, stagger: 0.02, overwrite: true, ease: "power2.out" }
      );
      ScrollTrigger.refresh();
    }

    function apply() {
      var visible = 0;

      strips.forEach(function (strip) {
        var hidden =
          (state.year && strip.dataset.year !== state.year) ||
          (state.gig && strip.dataset.gig !== state.gig);
        strip.hidden = !!hidden;
        if (!hidden) visible++;
      });

      tiles.forEach(function (tile) {
        tile.hidden = !!(
          (state.year && tile.dataset.year !== state.year) ||
          (state.gig && tile.dataset.gig !== state.gig)
        );
      });

      rows.forEach(function (row) {
        var on = !!state.gig && row.dataset.filterGig === state.gig;
        row.classList.toggle("is-active", on);
        row.setAttribute("aria-pressed", on ? "true" : "false");
      });

      yearButtons.forEach(function (btn) {
        var on = (btn.dataset.filterYear || "") === state.year;
        btn.classList.toggle("is-active", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      });

      if (stateEl) {
        if (!state.year && !state.gig) stateEl.textContent = "";
        else stateEl.textContent = visible + (visible > 1 ? " concerts affichés" : " concert affiché");
      }

      if (indexStatus) {
        indexStatus.textContent = state.gig ? titles[state.gig] || "" : "";
      }
    }

    yearButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.year = btn.dataset.filterYear || "";
        state.gig = "";
        apply();
        revealFiltered();
      });
    });

    rows.forEach(function (row) {
      row.addEventListener("click", function () {
        var gig = row.dataset.filterGig || "";
        if (!gig) {
          state.gig = "";
          state.year = "";
        } else if (state.gig === gig) {
          state.gig = "";
        } else {
          state.gig = gig;
          state.year = "";
        }
        apply();
        revealFiltered();
      });
    });

    apply();

    // Lightbox des bandes et de la planche.
    if (window.Fancybox && typeof window.Fancybox.bind === "function") {
      window.Fancybox.bind('[data-fancybox="strips"]', {});
      window.Fancybox.bind('[data-fancybox="planche"]', {});
    }

    // --- Loupe au survol des bandes de concerts -------------------------
    // L'image survolée se détache au centre de l'écran, les autres tirages de
    // la bande reculent. Uniquement sur les appareils à pointeur fin, et
    // jamais si l'utilisateur a demandé moins de mouvement.
    function initHoverPreview() {
      if (!gsap || reduceMotion) return;

      var preview = document.createElement("div");
      preview.className = "cs-preview";
      preview.setAttribute("aria-hidden", "true");
      var previewImg = document.createElement("img");
      previewImg.alt = "";
      preview.appendChild(previewImg);
      document.body.appendChild(preview);

      var active = null;
      var origin = null;
      var rest = null;

      function open(frame) {
        var img = frame.querySelector("img");
        if (!img) return;
        var rect = img.getBoundingClientRect();
        if (!rect.width) return;

        var vw = window.innerWidth;
        var vh = window.innerHeight;
        var w = Math.min(vw * 0.62, 560);
        var h = w * (rect.height / rect.width);
        if (h > vh * 0.72) {
          h = vh * 0.72;
          w = h * (rect.width / rect.height);
        }

        origin = {
          x: rect.left + rect.width / 2 - vw / 2,
          y: rect.top + rect.height / 2 - vh / 2,
          scale: rect.width / w
        };

        preview.style.backgroundImage = 'url("' + img.currentSrc.replace(/"/g, "") + '")';
        previewImg.src = frame.dataset.preview || img.src;
        gsap.killTweensOf(preview);
        gsap.set(preview, {
          width: w,
          height: h,
          xPercent: -50,
          yPercent: -50,
          x: origin.x,
          y: origin.y,
          scale: origin.scale,
          autoAlpha: 1
        });
        gsap.to(preview, { x: 0, y: 0, scale: 1, duration: 0.55, ease: "power3.out" });

        rest = Array.prototype.filter.call(
          frame.parentElement.children,
          function (other) { return other !== frame; }
        );
        gsap.to(frame, { autoAlpha: 0.18, duration: 0.3, overwrite: true });
        gsap.to(rest, {
          scale: 0.88,
          autoAlpha: 0.4,
          duration: 0.38,
          ease: "power2.out",
          overwrite: true
        });
      }

      function close() {
        if (!origin) return;
        gsap.to(preview, {
          x: origin.x,
          y: origin.y,
          scale: origin.scale,
          autoAlpha: 0,
          duration: 0.32,
          ease: "power2.inOut",
          overwrite: true
        });
        if (active) gsap.to(active, { autoAlpha: 1, duration: 0.3, overwrite: true });
        if (rest) {
          gsap.to(rest, { scale: 1, autoAlpha: 1, duration: 0.3, ease: "power2.out", overwrite: true });
        }
        active = null;
        rest = null;
        origin = null;
      }

      // On écoute le pointeur, pas la souris : au doigt, un tap doit ouvrir
      // la lightbox, jamais la loupe. Seul un vrai pointeur "mouse" déclenche.
      gsap.utils.toArray(".cs-strip-frame").forEach(function (frame) {
        frame.addEventListener("pointerenter", function (e) {
          if (e.pointerType !== "mouse") return;
          if (active === frame) return;
          if (active) close();
          active = frame;
          open(frame);
        });
        frame.addEventListener("pointerleave", function (e) {
          if (e.pointerType !== "mouse") return;
          if (active === frame) close();
        });
      });

      window.addEventListener("resize", close);
      // La loupe ne doit pas rester collée à l'écran quand on fait défiler.
      window.addEventListener("scroll", close, { passive: true });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") close();
      });
    }

    initHoverPreview();

    if (!hasMotion) return;

    var mm = gsap.matchMedia();

    mm.add("(prefers-reduced-motion: no-preference)", function () {
      // --- Ouverture : les tirages se posent sur la table -----------------
      // Chaque image arrive de sa propre direction, légèrement inclinée, puis
      // se cale dans la planche. Le panneau s'ouvre ensuite comme un
      // obturateur.
      var panelContent = ".cs-panel .cs-lede, .cs-panel .cs-btn, .cs-panel-foot";
      var frames = gsap.utils.toArray(".cs-sheet .cs-frame");
      var title = document.querySelector(".cs-title");
      // Sur un écran étroit, le panneau est dans le flux : le masquer pour
      // l'ouvrir laisserait un trou. Il reste en place, seules les lettres
      // du titre montent.
      var narrow = window.matchMedia("(max-width: 900px)").matches;

      gsap.set(frames, {
        x: function () { return gsap.utils.random(-180, 180); },
        y: function () { return gsap.utils.random(-150, 150); },
        rotation: function () { return gsap.utils.random(-11, 11); },
        scale: function () { return gsap.utils.random(0.7, 0.86); },
        autoAlpha: 0
      });
      if (!narrow) gsap.set(panelContent, { autoAlpha: 0, y: 16 });

      // Découpe le titre en lettres pour un relevé caractère par caractère.
      // L'aria-label garde la phrase entière pour les lecteurs d'écran.
      var chars = [];
      if (title) {
        var label = title.textContent;
        title.setAttribute("aria-label", label);
        title.textContent = "";
        Array.prototype.forEach.call(label, function (ch) {
          if (ch === " ") {
            title.appendChild(document.createTextNode(" "));
            return;
          }
          var span = document.createElement("span");
          span.className = "cs-char";
          span.setAttribute("aria-hidden", "true");
          span.textContent = ch;
          title.appendChild(span);
          chars.push(span);
        });
        // Masque le temps du relevé : les lettres montent depuis sous la
        // ligne du titre sans traverser la phrase en dessous.
        title.style.overflow = "hidden";
        gsap.set(chars, { yPercent: 115, autoAlpha: 0, rotation: 4 });
      }

      var intro = gsap.timeline();

      intro.to(frames, {
        x: 0,
        y: 0,
        rotation: 0,
        scale: 1,
        autoAlpha: 1,
        duration: 1,
        ease: "expo.out",
        stagger: { each: 0.012, from: "random" }
      });

      if (!narrow) {
        intro
          .fromTo(
            ".cs-panel",
            { clipPath: "inset(0% 0% 100% 0%)" },
            { clipPath: "inset(0% 0% 0% 0%)", duration: 0.65, ease: "power4.inOut" },
            0.34
          )
          // Un éclair d'obturateur, bref, au moment où le panneau s'ouvre.
          .fromTo(
            ".cs-flash",
            { autoAlpha: 0 },
            {
              keyframes: [
                { autoAlpha: 0.18, duration: 0.05 },
                { autoAlpha: 0, duration: 0.18, ease: "power2.out" }
              ]
            },
            0.48
          );
      }

      intro
        .to(
          chars,
          {
            yPercent: 0,
            autoAlpha: 1,
            rotation: 0,
            duration: 0.8,
            ease: "power4.out",
            stagger: 0.028,
            onComplete: function () {
              title.style.overflow = "";
            }
          },
          narrow ? 0.1 : 0.5
        );

      if (!narrow) {
        intro.to(
          panelContent,
          { autoAlpha: 1, y: 0, duration: 0.5, ease: "power3.out", stagger: 0.06 },
          0.72
        );
      }

      // --- La planche glisse doucement pendant la sortie du hero -----------
      gsap.utils.toArray(".cs-col").forEach(function (col, i) {
        var drift = [46, 24, 62, 34, 54, 18][i % 6];
        gsap.to(col, {
          y: -drift,
          ease: "none",
          scrollTrigger: {
            trigger: ".cs-hero",
            start: "top top",
            end: "bottom top",
            scrub: true
          }
        });
      });

      // --- Une seule image bouge en continu : le premier tirage -----------
      gsap.to(".cs-col:first-child .cs-frame:first-child img", {
        scale: 1.07,
        duration: 22,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1
      });

      // --- Titres et paragraphes, une entrée par bloc ---------------------
      gsap.utils
        .toArray(
          ".cs-h2, .cs-statement, .cs-index-note, .cs-facts, .cs-bio p, .cs-proof-kind, .cs-proof-list, .cs-proof-col, .cs-cta-sentence, .cs-cta .cs-btn, .cs-footer > *"
        )
        .forEach(function (el) {
          gsap.from(el, {
            autoAlpha: 0,
            y: 26,
            duration: 0.7,
            ease: "power2.out",
            scrollTrigger: { trigger: el, start: "top 92%", once: true }
          });
        });

      // --- Chaque bande de concert arrive de la droite --------------------
      gsap.utils.toArray(".cs-strip").forEach(function (strip) {
        gsap.from(strip, {
          autoAlpha: 0,
          x: 44,
          duration: 0.85,
          ease: "power3.out",
          scrollTrigger: { trigger: strip, start: "top 88%", once: true }
        });
      });

      // --- Le carnet de route se remplit ligne à ligne --------------------
      ScrollTrigger.batch(".cs-index-group", {
        start: "top 88%",
        once: true,
        onEnter: function (groups) {
          groups.forEach(function (group) {
            gsap.from(group.querySelectorAll(".cs-row, .cs-index-year"), {
              autoAlpha: 0,
              y: 14,
              duration: 0.5,
              stagger: 0.045,
              ease: "power1.out"
            });
          });
        }
      });

      // --- La planche se pose tuile par tuile -----------------------------
      ScrollTrigger.batch(".cs-tile", {
        start: "top 94%",
        once: true,
        interval: 0.08,
        batchMax: 12,
        onEnter: function (batch) {
          gsap.from(batch, {
            autoAlpha: 0,
            y: 22,
            scale: 0.985,
            duration: 0.6,
            stagger: 0.045,
            ease: "power2.out"
          });
        }
      });

      return function () {
        intro.kill();
      };
    });
  });
})();
