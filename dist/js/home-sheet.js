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
    var bootCard = boot ? boot.querySelector(".cs-boot-card") : null;
    var panel = document.querySelector(".cs-panel");
    var title = document.querySelector(".cs-title");
    var bootActive = !!(boot && bootName && bootCard && panel && title && hasMotion);

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
          strip.classList.remove("is-hot-row");
          frames.forEach(function (f, j) {
            f.classList.remove("is-hot");
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
          var rowHeight = 190;
          var maxHeight = 230; // 40 px de débordement, la taille de l'interstice
          // L'image garde son format : on plafonne sa largeur par la hauteur
          // qu'elle peut prendre sans manger la légende du dessus.
          var ratio = natural[index] / rowHeight;
          var hot = Math.min(total * 0.42, maxHeight * ratio);
          hot = Math.max(hot, natural[index] * 1.05);
          var left = Math.max(total - hot - gaps, 80);
          var sum = natural.reduce(function (a, w, j) { return j === index ? a : a + w; }, 0) || 1;

          frames.forEach(function (f, j) {
            var width = j === index ? hot : Math.min(left * (natural[j] / sum), natural[j]);
            f.classList.toggle("is-hot", j === index);
            gsap.to(f, {
              width: Math.max(width, 24),
              opacity: j === index ? 1 : 0.75,
              duration: 0.5,
              ease: "power3.out",
              overwrite: true
            });
          });
          strip.classList.add("is-hot-row");
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
      var narrow = window.matchMedia("(max-width: 900px)").matches;

      // --- Les tirages se posent sur la table ------------------------------
      gsap.set(frames, {
        x: function () { return gsap.utils.random(-180, 180); },
        y: function () { return gsap.utils.random(-150, 150); },
        rotation: function () { return gsap.utils.random(-11, 11); },
        scale: function () { return gsap.utils.random(0.7, 0.86); },
        autoAlpha: 0
      });

      function landFrames() {
        gsap.to(frames, {
          x: 0,
          y: 0,
          rotation: 0,
          scale: 1,
          autoAlpha: 1,
          duration: 1,
          ease: "expo.out",
          stagger: { each: 0.012, from: "random" }
        });
      }

      // --- Carton-titre ----------------------------------------------------
      // La feuille du panneau occupe tout l'écran, le nom s'y inscrit lettre
      // à lettre, puis la feuille se replie jusqu'à sa cellule dans la
      // planche et le nom se pose sur le H1. Un seul mouvement continu.
      //
      // L'inscription démarre tout de suite ; le repli attend seulement que
      // Switzer soit chargée, parce qu'il se cale sur la largeur réelle du H1.
      if (bootActive) {
        boot.style.pointerEvents = "none";

        // Le panneau est couvert par la feuille : son texte et ses actions
        // n'entrent qu'une fois la feuille repliée, à la suite du nom.
        var panelBits = ".cs-panel .cs-lede, .cs-panel .cs-btn, .cs-panel-foot";
        gsap.set(panelBits, { autoAlpha: 0, y: 18 });

        // Découpage par mots puis par lettres : les lettres sont des blocs
        // en ligne, donc la coupure de ligne doit rester entre deux mots.
        var label = bootName.textContent;
        var chars = [];
        bootName.textContent = "";
        label.split(" ").forEach(function (word, wi) {
          if (wi > 0) bootName.appendChild(document.createTextNode(" "));
          var box = document.createElement("span");
          box.className = "cs-boot-word";
          box.setAttribute("aria-hidden", "true");
          Array.prototype.forEach.call(word, function (ch) {
            var span = document.createElement("span");
            span.className = "cs-boot-char";
            span.textContent = ch;
            box.appendChild(span);
            chars.push(span);
          });
          bootName.appendChild(box);
        });

        if (chars.length) {
          gsap.set(chars, { yPercent: 55, autoAlpha: 0 });
          gsap.to(chars, {
            yPercent: 0,
            autoAlpha: 1,
            duration: 0.4,
            ease: "power4.out",
            stagger: 0.012
          });
        }

        var fontsReady = document.fonts && document.fonts.ready
          ? document.fonts.ready
          : Promise.resolve();
        var minHold = new Promise(function (resolve) { window.setTimeout(resolve, 550); });

        Promise.all([fontsReady, minHold]).then(function () {
          var p = panel.getBoundingClientRect();
          var card = bootCard.getBoundingClientRect();
          var tl = gsap.timeline();

          // Le H1 et le nom du carton n'ont pas les mêmes métriques de ligne
          // (line-height 0.95, boîte du bloc contre boîte en ligne). On cale
          // donc l'encre sur l'encre : sans ça, le titre saute de 2-3 px au
          // moment où le carton disparaît.
          var inkOf = function (el) {
            var range = document.createRange();
            range.selectNodeContents(el);
            return range.getBoundingClientRect();
          };
          var hInk = inkOf(title);
          var bInk = inkOf(bootName);
          var bBox = bootName.getBoundingClientRect();
          var scale = parseFloat(getComputedStyle(title).fontSize) /
            parseFloat(getComputedStyle(bootName).fontSize);

          // Repli de la feuille : elle atterrit exactement sur le panneau.
          tl.to(
            bootCard,
            {
              x: p.left - card.left,
              y: p.top - card.top,
              width: p.width,
              height: p.height,
              duration: 0.7,
              ease: "power4.inOut"
            },
            0
          );

          // Le nom suit le même chemin et se pose sur le H1.
          if (narrow || !bInk.width || !hInk.width) {
            tl.to(bootName, { scale: 0.9, autoAlpha: 0, duration: 0.4, ease: "power2.in" }, 0.05);
          } else {
            tl.to(
              bootName,
              {
                x: hInk.left - bBox.left - scale * (bInk.left - bBox.left),
                y: hInk.top - bBox.top - scale * (bInk.top - bBox.top),
                scale: scale,
                duration: 0.7,
                ease: "power4.inOut"
              },
              0
            );
          }

          // Les photos se posent pendant que la feuille découvre la planche.
          tl.add(landFrames, 0);
          tl.add(endBoot, 0.72);

          // La feuille a disparu : la phrase, le bouton puis le pied du
          // panneau se posent en cascade sous le nom déjà en place.
          tl.to(
            panelBits,
            {
              autoAlpha: 1,
              y: 0,
              duration: 0.55,
              ease: "power3.out",
              stagger: 0.07
            },
            0.74
          );
        });
      } else {
        landFrames();
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
