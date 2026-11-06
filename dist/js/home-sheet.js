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
    var bootPhoto = boot ? boot.querySelector(".cs-boot-photo") : null;
    var bootScrim = boot ? boot.querySelector(".cs-boot-scrim") : null;
    var bootVeil = boot ? boot.querySelector(".cs-boot-veil") : null;
    var bootLight = boot ? boot.querySelector(".cs-boot-name-light") : null;
    var bootInk = boot ? boot.querySelector(".cs-boot-name-ink") : null;
    var panel = document.querySelector(".cs-panel");
    var title = document.querySelector(".cs-title");

    // L'intro ne joue qu'une fois par session : au retour, la page est là.
    var introSeen = false;
    try { introSeen = window.sessionStorage.getItem("cs-intro") === "1"; } catch (e) {}

    var bootActive = !!(
      boot && bootName && bootCard && bootPhoto && bootScrim && bootVeil &&
      bootLight && bootInk && panel && title && hasMotion && !introSeen
    );

    function endBoot() {
      if (boot) boot.style.display = "none";
      document.documentElement.classList.remove("cs-boot-on");
    }

    if (!bootActive) {
      endBoot();
    }

    // Choisit, parmi les tirages déjà chargés, celui qui se lit le mieux une
    // fois découpé dans les lettres : on mesure la bande centrale (la seule
    // que le cadrage laisse voir) et on garde le plus de pixels dans la plage
    // de gris qui reste lisible sur le blanc du carton.
    function pickBootPhoto() {
      return new Promise(function (resolve) {
        var nodes = Array.prototype.slice.call(
          document.querySelectorAll(".cs-sheet .cs-frame img")
        ).slice(0, 14);
        if (!nodes.length) return resolve(null);

        var best = null;
        var pending = 0;
        var settled = false;
        var deadline = window.setTimeout(finish, 550);

        function scan(img) {
          if (!img.complete || !img.naturalWidth) return;
          try {
            var canvas = document.createElement("canvas");
            canvas.width = canvas.height = 24;
            var ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, 24, 24);
            var data = ctx.getImageData(0, 0, 24, 24).data;
            var good = 0;
            var total = 0;
            for (var row = 0; row < 24; row++) {
              for (var col = 0; col < 24; col++) {
                var i = (row * 24 + col) * 4;
                var v = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
                if (v > 45 && v < 145) good++;
                total++;
              }
            }
            var share = good / Math.max(total, 1);
            if (!best || share > best.share) {
              best = { share: share, url: img.getAttribute("src") || "" };
            }
          } catch (e) { /* canvas indisponible : on garde la première */ }
        }

        function finish() {
          if (settled) return;
          settled = true;
          window.clearTimeout(deadline);
          var chosen = (best && best.url) || nodes[0].getAttribute("src") || "";
          var url = chosen.replace(/([?&])w=\d+/, "$1w=1600");
          var probe = new Image();
          probe.onload = function () { resolve(url); };
          probe.onerror = function () { resolve(null); };
          probe.src = url;
        }

        nodes.forEach(function (img) {
          if (img.complete && img.naturalWidth) {
            scan(img);
            return;
          }
          pending++;
          img.addEventListener("load", function () {
            pending--;
            scan(img);
            if (!pending) finish();
          }, { once: true });
          img.addEventListener("error", function () {
            pending--;
            if (!pending) finish();
          }, { once: true });
        });

        if (!pending) finish();
      });
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
      var cols = gsap.utils.toArray(".cs-col");
      var narrow = window.matchMedia("(max-width: 900px)").matches;

      function scrambleFrames() {
        gsap.set(frames, {
          x: function () { return gsap.utils.random(-180, 180); },
          y: function () { return gsap.utils.random(-150, 150); },
          rotation: function () { return gsap.utils.random(-11, 11); },
          scale: function () { return gsap.utils.random(0.7, 0.86); },
          autoAlpha: 0
        });
      }

      function landFrames(at) {
        gsap.to(frames, {
          x: 0,
          y: 0,
          rotation: 0,
          scale: 1,
          autoAlpha: 1,
          duration: 1,
          ease: "expo.out",
          stagger: { each: 0.012, from: "random" },
          delay: at || 0
        });
      }

      // --- Carton-titre ----------------------------------------------------
      // Une photo du dernier concert occupe tout l'écran, le nom est découpé
      // dedans en blanc, puis la feuille se replie, se lave de blanc et
      // devient le panneau de la page.
      if (bootActive) {
        boot.style.pointerEvents = "none";
        try { window.sessionStorage.setItem("cs-intro", "1"); } catch (e) {}

        var panelBits = ".cs-panel .cs-lede, .cs-panel .cs-btn, .cs-panel-foot";
        gsap.set(panelBits, { autoAlpha: 0, y: 18 });
        gsap.set([bootLight, bootInk], { autoAlpha: 0 });

        // Les tirages se développent dans le sillage de la feuille.
        gsap.set(cols, { filter: "grayscale(1) brightness(0.5)" });

        var fontsReady = document.fonts && document.fonts.ready
          ? document.fonts.ready
          : Promise.resolve();
        var minHold = new Promise(function (resolve) { window.setTimeout(resolve, 250); });
        var photoReady = pickBootPhoto();

        Promise.all([fontsReady, minHold, photoReady]).then(function (result) {
          var photoUrl = result[2];
          var hasPhoto = !!photoUrl;
          var p = panel.getBoundingClientRect();
          var card = bootCard.getBoundingClientRect();

          // Le nom prend toute la largeur possible. On cale la taille sur le
          // mot le plus long, mesuré au canvas avec la police et
          // l'interlettrage réels : c'est le maximum admissible sans déborder.
          var vw = window.innerWidth;
          var target = vw * (narrow ? 0.92 : 0.96);
          var cs = getComputedStyle(bootName);
          var longest = "Mattia Parrinello".split(" ").reduce(function (a, b) {
            return b.length > a.length ? b : a;
          }, "");
          var emTrack = parseFloat(cs.letterSpacing) / (parseFloat(cs.fontSize) || 1);
          var canvas = document.createElement("canvas");
          var ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.font = cs.fontWeight + " 100px " + cs.fontFamily;
            var wordAt100 = ctx.measureText(longest).width + (longest.length - 1) * emTrack * 100;
            if (wordAt100 > 0) {
              bootName.style.fontSize = Math.round((target / wordAt100) * 100) + "px";
            }
          }

          var nameBox = bootName.getBoundingClientRect();
          var hInk = (function () {
            var range = document.createRange();
            range.selectNodeContents(title);
            return range.getBoundingClientRect();
          })();
          var nameMid = {
            x: nameBox.left + nameBox.width / 2,
            y: nameBox.top + nameBox.height / 2
          };
          var hMid = {
            x: hInk.left + hInk.width / 2,
            y: hInk.top + hInk.height / 2
          };

          var tl = gsap.timeline();
          var S = 0.5;

          if (hasPhoto) {
            bootPhoto.style.backgroundImage = 'url("' + photoUrl.replace(/"/g, "") + '")';
            gsap.set([bootPhoto, bootScrim], { autoAlpha: 1 });
            // Inscription : le nom blanc se découvre par le bas.
            tl.fromTo(
              bootLight,
              { clipPath: "inset(100% 0% 0% 0%)", autoAlpha: 1 },
              { clipPath: "inset(0% 0% 0% 0%)", duration: 0.55, ease: "power3.out" },
              0
            );
          } else {
            tl.to(bootInk, { autoAlpha: 1, duration: 0.4, ease: "power2.out" }, 0);
          }

          // Repli de la feuille, exactement sur le panneau.
          tl.to(
            bootCard,
            {
              x: p.left - card.left,
              y: p.top - card.top,
              width: p.width,
              height: p.height,
              duration: 0.74,
              ease: "power4.inOut"
            },
            S
          );

          // Le nom se contracte vers le H1 et se dissout dans la feuille.
          tl.to(
            bootName,
            {
              x: hMid.x - nameMid.x,
              y: hMid.y - nameMid.y,
              scale: 0.34,
              duration: 0.7,
              ease: "power3.inOut"
            },
            S
          );
          tl.to(bootName, { autoAlpha: 0, duration: 0.32, ease: "power2.in" }, S + 0.4);

          // La photo se lave de blanc : la feuille devient le panneau.
          if (hasPhoto) {
            tl.to(bootVeil, { autoAlpha: 1, duration: 0.72, ease: "power2.inOut" }, S);
          }

          // Les tirages se développent, colonne par colonne, depuis le centre.
          tl.to(
            cols,
            {
              filter: "grayscale(0) brightness(1)",
              duration: 1.1,
              ease: "power2.out",
              stagger: { each: 0.08, from: "center" },
              clearProps: "filter"
            },
            S
          );

          landFrames(S);
          tl.add(endBoot, S + 0.76);

          // La feuille a disparu : la phrase, le bouton puis le pied du
          // panneau se posent en cascade sous le nom déjà en place.
          tl.to(
            panelBits,
            { autoAlpha: 1, y: 0, duration: 0.55, ease: "power3.out", stagger: 0.07 },
            S + 0.78
          );
        }).catch(function (error) {
          console.error("Intro:", error);
          endBoot();
          gsap.set(panelBits, { autoAlpha: 1, y: 0 });
        });
      } else if (!introSeen) {
        scrambleFrames();
        landFrames(0);
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
