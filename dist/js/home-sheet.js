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

    // --- Carton-titre ----------------------------------------------------
    // Le nom occupe tout l'écran au chargement, puis se réduit et vient se
    // poser exactement sur le H1 de la page.
    var boot = document.querySelector(".cs-boot");
    var bootName = boot ? boot.querySelector(".cs-boot-name") : null;
    var title = document.querySelector(".cs-title");
    var bootActive = !!(boot && bootName && title && hasMotion);

    function endBoot() {
      if (boot) boot.style.display = "none";
      document.documentElement.classList.remove("cs-boot-on");
    }

    if (!bootActive) {
      endBoot();
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

    // --- Accordéon des bandes de concerts --------------------------------
    // L'image survolée s'élargit sur place, les autres se resserrent pour lui
    // faire de la place. Aucun détachement : tout reste dans la bande.
    function initRowAccordion() {
      if (!gsap || reduceMotion) return;

      gsap.utils.toArray(".cs-strip").forEach(function (strip) {
        var box = strip.querySelector(".cs-strip-frames");
        if (!box) return;
        var frames = gsap.utils.toArray(box.children);
        if (frames.length < 2) return;
        var natural = [];
        var hotIndex = -1;

        function measure() {
          natural = frames.map(function (f) {
            return Math.round(f.getBoundingClientRect().width) || 1;
          });
        }

        function reset(animate) {
          hotIndex = -1;
          frames.forEach(function (f, j) {
            if (animate) {
              gsap.to(f, { width: natural[j], opacity: 1, duration: 0.45, ease: "power3.out", overwrite: true });
            } else {
              gsap.set(f, { width: natural[j], opacity: 1 });
            }
          });
        }

        function open(index) {
          var total = box.clientWidth;
          var gap = 8;
          var gaps = gap * (frames.length - 1);
          var hot = Math.min(Math.max(total * 0.4, natural[index] * 1.2), total * 0.58);
          var left = Math.max(total - hot - gaps, 80);
          var sum = natural.reduce(function (a, w, j) { return j === index ? a : a + w; }, 0) || 1;

          frames.forEach(function (f, j) {
            var width = j === index ? hot : Math.min(left * (natural[j] / sum), natural[j]);
            gsap.to(f, {
              width: Math.max(width, 24),
              opacity: j === index ? 1 : 0.75,
              duration: 0.5,
              ease: "power3.out",
              overwrite: true
            });
          });
        }

        measure();
        strip.classList.add("cs-accordion");
        reset(false);

        frames.forEach(function (frame, index) {
          frame.addEventListener("pointerenter", function (e) {
            if (e.pointerType !== "mouse") return;
            if (hotIndex === index) return;
            hotIndex = index;
            open(index);
          });
          frame.addEventListener("pointerleave", function (e) {
            if (e.pointerType !== "mouse") return;
            if (hotIndex === index) reset(true);
          });
        });

        strip.addEventListener("pointerleave", function () {
          if (hotIndex > -1) reset(true);
        });

        window.addEventListener("resize", function () {
          measure();
          reset(false);
        });
      });
    }

    initRowAccordion();

    if (!hasMotion) return;

    var mm = gsap.matchMedia();

    mm.add("(prefers-reduced-motion: no-preference)", function () {
      var frames = gsap.utils.toArray(".cs-sheet .cs-frame");
      var panelContent = ".cs-panel .cs-lede, .cs-panel .cs-btn, .cs-panel-foot";
      var narrow = window.matchMedia("(max-width: 900px)").matches;

      // --- Les tirages se posent sur la table ------------------------------
      gsap.set(frames, {
        x: function () { return gsap.utils.random(-180, 180); },
        y: function () { return gsap.utils.random(-150, 150); },
        rotation: function () { return gsap.utils.random(-11, 11); },
        scale: function () { return gsap.utils.random(0.7, 0.86); },
        autoAlpha: 0
      });
      if (!narrow) gsap.set(panelContent, { autoAlpha: 0, y: 16 });

      var intro = gsap.timeline({ delay: bootActive ? 0.5 : 0 });

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
            0.2
          )
          .to(
            panelContent,
            { autoAlpha: 1, y: 0, duration: 0.5, ease: "power3.out", stagger: 0.06 },
            0.6
          );
      }

      // --- Carton-titre : le nom se réduit jusqu'au H1 ---------------------
      if (bootActive) {
        var startBoot = function () {
          var h = title.getBoundingClientRect();
          var b = bootName.getBoundingClientRect();
          var tl = gsap.timeline({ delay: 0.35 });

          boot.style.pointerEvents = "none";

          if (narrow || !b.width || !h.width) {
            // Écran étroit : le nom tient sur deux lignes, il ne peut pas
            // épouser la ligne unique du H1. Il se retire en douceur.
            tl.to(bootName, {
              scale: 0.84,
              y: -24,
              autoAlpha: 0,
              duration: 0.6,
              ease: "power3.inOut"
            }).to(".cs-boot-bg", { autoAlpha: 0, duration: 0.5, ease: "power2.in" }, 0.1);
          } else {
            // FLIP : même texte, même graisse, on rapporte la largeur du nom
            // plein écran sur celle du H1.
            tl.to(bootName, {
              x: h.left - b.left,
              y: h.top - b.top,
              scale: h.width / b.width,
              duration: 0.85,
              ease: "power4.inOut"
            })
              .to(".cs-boot-bg", { autoAlpha: 0, duration: 0.55, ease: "power2.in" }, 0.45)
              .fromTo(
                ".cs-flash",
                { autoAlpha: 0 },
                {
                  keyframes: [
                    { autoAlpha: 0.16, duration: 0.06 },
                    { autoAlpha: 0, duration: 0.22, ease: "power2.out" }
                  ]
                },
                0.72
              );
          }

          tl.add(endBoot);
        };

        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(startBoot);
        } else {
          startBoot();
        }
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
