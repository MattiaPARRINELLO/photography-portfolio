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
    var bootWords = boot ? Array.prototype.slice.call(boot.querySelectorAll(".cs-boot-word")) : [];
    var panel = document.querySelector(".cs-panel");
    var title = document.querySelector(".cs-title");

    // L'intro ne joue qu'une fois toutes les 20 minutes : au retour immédiat
    // (navigation, rechargement), la page est là tout de suite ; après une
    // pause on la revoit. `?intro=1` la force.
    var forceIntro = /(?:\?|&)intro=1(?:&|$)/.test(window.location.search);
    var introSeen = false;
    try {
      var introAt = parseInt(window.sessionStorage.getItem("cs-intro-at") || "0", 10);
      introSeen = introAt > 0 && (Date.now() - introAt) < 20 * 60 * 1000;
    } catch (e) {}
    if (forceIntro) introSeen = false;

    var bootActive = !!(
      boot && bootName && bootCard && bootPhoto && bootScrim && bootVeil &&
      bootWords.length === 2 && panel && title && hasMotion && !introSeen
    );

    // Bandeau de diagnostic : ?debug=1
    if (/(?:\?|&)debug=1(?:&|$)/.test(window.location.search)) {
      var badge = document.createElement("div");
      badge.style.cssText =
        "position:fixed;left:8px;bottom:8px;z-index:9999;padding:8px 10px;" +
        "font:12px/1.4 monospace;background:#101421;color:#fff;border:1px solid #ff488b;border-radius:4px";
      badge.textContent =
        "gsap:" + (window.gsap ? "ok" : "KO") +
        " · scrolltrigger:" + (window.ScrollTrigger ? "ok" : "KO") +
        " · reduced:" + (window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "oui" : "non") +
        " · intro:" + (bootActive ? "jouee" : "sautee") +
        " · vue:" + (function () {
          try {
            var at = parseInt(window.sessionStorage.getItem("cs-intro-at") || "0", 10);
            return at ? Math.round((Date.now() - at) / 60000) + " min" : "jamais";
          } catch (e) { return "?"; }
        })() +
        " · scenes:" + (window.gsap ? "v" + String(window.gsap.version) : "-");
      document.body.appendChild(badge);
      window.__dbgBadge = badge;
    }

    function endBoot() {
      if (boot) boot.style.display = "none";
      if (title) title.style.visibility = "";
      document.documentElement.classList.remove("cs-boot-on");
      // Nettoyage différé : retirer six nœuds pendant le basculement
      // provoquerait un à-coup sur les machines modestes.
      window.setTimeout(function () {
        var shades = document.querySelectorAll(".cs-col-shade");
        for (var i = 0; i < shades.length; i++) {
          if (shades[i].parentNode) shades[i].parentNode.removeChild(shades[i]);
        }
      }, 600);
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
          // On ne garde que les photos en paysage : c'est le cadrage qui
          // remplit le mieux la feuille, sur ordinateur comme sur téléphone.
          var ratio = img.naturalWidth / (img.naturalHeight || 1);
          if (ratio < 1.2) return;
          try {
            var canvas = document.createElement("canvas");
            canvas.width = canvas.height = 24;
            var ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, 24, 24);
            var data = ctx.getImageData(0, 0, 24, 24).data;
            var good = 0;
            var total = 0;
            // Bande centrale (le cadrage « cover » ne garde que le milieu).
            for (var row = 7; row < 17; row++) {
              for (var col = 7; col < 17; col++) {
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
        if (bootActive) return; // la planche est couverte : inutile de l'animer
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
      // Une photo du dernier concert occupe tout l'écran, le nom est posé
      // dessus en deux lignes. Pendant le repli, les deux mots convergent
      // vers les deux mots du H1 et se posent exactement dessus.
      if (bootActive) {
        boot.style.pointerEvents = "none";
        // Le vrai H1 attend sous le nom du carton : on le masque pour qu'il
        // n'y ait pas deux titres superposés pendant l'intro.
        title.style.visibility = "hidden";
        try { window.sessionStorage.setItem("cs-intro-at", String(Date.now())); } catch (e) {}

        var panelBits = ".cs-panel .cs-lede, .cs-panel .cs-btn, .cs-panel-foot";
        gsap.set(panelBits, { autoAlpha: 0, y: 18 });

        // Développement : un voile opaque par colonne, animé en opacité
        // (aucun filtre animé, donc aucun recalcul d'image).
        var shades = cols.map(function (col) {
          var shade = document.createElement("div");
          shade.className = "cs-col-shade";
          col.appendChild(shade);
          return shade;
        });
        gsap.set(shades, { opacity: 0.66 });

        // Les tirages arrivent par les côtés : moitié gauche depuis la
        // gauche, moitié droite depuis la droite, en se resserrant vers le
        // centre. Animé par colonne (six éléments) et non par image.
        gsap.set(cols, {
          x: function (i) { return i < cols.length / 2 ? -60 : 60; },
          opacity: 0.55
        });

        var fontsReady = document.fonts && document.fonts.ready
          ? Promise.race([
              document.fonts.ready,
              new Promise(function (resolve) { window.setTimeout(resolve, 1200); })
            ])
          : Promise.resolve();
        var minHold = new Promise(function (resolve) { window.setTimeout(resolve, 350); });
        var photoUrl = null;
        var hasPhoto = false;
        var applyPhoto = function (url) {
          if (!url) return;
          photoUrl = url;
          hasPhoto = true;
          bootPhoto.src = url;
          if (bootPhoto.decode) bootPhoto.decode().catch(function () {});
          gsap.to([bootPhoto, bootScrim], { autoAlpha: 1, duration: 0.7, ease: "power2.out" });
        };
        pickBootPhoto().then(applyPhoto);

        // Sur petit écran, le nom n'essaie pas d'épouser le H1 (deux lignes
        // contre une) : on n'attend donc pas la police, l'intro démarre tout
        // de suite et reste courte.
        Promise.all(narrow ? [minHold] : [fontsReady, minHold]).then(function () {
          var p = panel.getBoundingClientRect();
          var card = bootCard.getBoundingClientRect();

          // Rectangles d'encre de chaque mot du H1, pour y poser les mots du
          // carton au pixel près.
          var inkRects = (function () {
            var node = title.firstChild;
            if (!node || node.nodeType !== 3) return null;
            var text = node.nodeValue;
            var cut = text.indexOf(" ");
            if (cut < 0) return null;
            var range = document.createRange();
            var rects = [];
            range.setStart(node, 0);
            range.setEnd(node, cut);
            rects.push(range.getBoundingClientRect());
            range.setStart(node, cut + 1);
            range.setEnd(node, text.length);
            rects.push(range.getBoundingClientRect());
            return rects;
          })();

          var targets = null;
          if (inkRects && !narrow) {
            targets = bootWords.map(function (word, i) {
              var box = word.getBoundingClientRect();
              var range = document.createRange();
              range.selectNodeContents(word);
              var ink = range.getBoundingClientRect();
              var to = inkRects[i];
              if (!ink.width || !to.width || !box.width) return null;
              var scale = to.width / ink.width;
              // Origine au centre du mot : il rétrécit sur place au lieu de
              // dériver vers son bord gauche, puis rejoint sa cible.
              var bc = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
              var ic = { x: ink.left + ink.width / 2, y: ink.top + ink.height / 2 };
              var tc = { x: to.left + to.width / 2, y: to.top + to.height / 2 };
              return {
                x: tc.x - bc.x - scale * (ic.x - bc.x),
                y: tc.y - bc.y - scale * (ic.y - bc.y),
                scale: scale
              };
            });
          }

          var tl = gsap.timeline();
          var S = narrow ? 0.45 : 0.55;
          var move = narrow ? 0.95 : 1.15;

          // Les mots vont être transformés : on les promeut une fois pour
          // éviter de rastériser le texte à chaque image.
          gsap.set(bootWords, { willChange: "transform" });

          // Repli de la feuille, exactement sur le panneau.
          // Repli de la feuille sur le panneau : la photo garde son cadrage
          // (aucune déformation), c'est la feuille entière qui rétrécit.
          tl.to(
            bootCard,
            {
              x: p.left - card.left,
              y: p.top - card.top,
              width: p.width,
              height: p.height,
              duration: move,
              ease: "power2.inOut"
            },
            S
          );

          if (narrow) {
            // Sur téléphone : le nom se contracte vers le titre et s'efface.
            var titleBox = title.getBoundingClientRect();
            var nameRect = bootName.getBoundingClientRect();
            var hMid2 = {
              x: titleBox.left + titleBox.width / 2,
              y: titleBox.top + titleBox.height / 2
            };
            var nMid = {
              x: nameRect.left + nameRect.width / 2,
              y: nameRect.top + nameRect.height / 2
            };
            tl.to(
              bootName,
              {
                x: hMid2.x - nMid.x,
                y: hMid2.y - nMid.y,
                scale: 0.34,
                duration: move * 0.8,
                ease: "power2.inOut"
              },
              S
            ).to(bootName, { autoAlpha: 0, duration: move * 0.35, ease: "power2.in" }, S + move * 0.55);
          } else if (targets && targets[0] && targets[1]) {
            bootWords.forEach(function (word, i) {
              // Un seul mouvement continu : réduction, glissement et montée
              // démarrent et finissent ensemble. La réduction est menée plus
              // vite (power3.out), donc les mots sont déjà petits quand ils se
              // rapprochent : ils ne se croisent pas.
              tl.to(
                word,
                // Réduction et glissement ensemble, sur les deux lignes.
                { scale: targets[i].scale, duration: move * 0.7, ease: "power2.out" },
                S
              ).to(
                word,
                { x: targets[i].x, duration: move * 0.85, ease: "power2.out" },
                S
              ).to(
                word,
                // La montée n'arrive qu'à la fin : les mots sont alors à leur
                // taille finale et côte à côte, donc ils ne se chevauchent pas.
                { y: targets[i].y, duration: move * 0.3, ease: "power2.inOut" },
                S + move * 0.7
              );
            });
            // Le blanc de la photo devient l'encre du papier.
            if (hasPhoto) {
              // Le nom reste blanc tant que la photo est là, puis passe à
              // l'encre quand le voile blanc prend le dessus.
              // Le nom reste blanc tant que la photo est là, puis bascule
              // franchement en encre quand le voile a pris le dessus.
              tl.to(bootName, { color: "#101421", duration: 0.22, ease: "power2.in" }, S + 0.8);
            }
          } else {
            // Repli sans mesure fiable : le nom s'efface.
            tl.to(bootName, { autoAlpha: 0, duration: 0.4, ease: "power2.in" }, S + 0.3);
          }

          // La photo se lave de blanc : la feuille devient le panneau.
          if (hasPhoto) {
            // La photo se lave tout de suite : le reste du repli se fait sur
            // une feuille blanche, bien moins coûteuse à redessiner.
            // La photo se lave vite : le repli se fait ensuite sur du blanc,
            // seule façon de rester à 60 fps pendant un mouvement long.
            // Le voile blanc doit être complet avant l'atterrissage, sinon le
            // panneau apparaîtrait sur une feuille encore grise.
            tl.to(bootVeil, { autoAlpha: 1, duration: 0.85, ease: "power1.inOut" }, S + 0.2);
          }


          // Les colonnes se remettent en place en se resserrant.
          tl.to(
            cols,
            {
              x: 0,
              opacity: 1,
              duration: 0.8,
              ease: "power3.out",
              stagger: { each: 0.05, from: "center" }
            },
            // Démarre avec le repli (la timeline commence ~0,55 s après le
            // chargement) : l'arrivée est encore en cours quand la feuille
            // découvre la planche.
            S
          );

          // Les voiles se lèvent colonne par colonne, depuis le centre :
          // c'est le « développement » des tirages.
          tl.to(
            shades,
            {
              opacity: 0,
              duration: 0.9,
              ease: "power2.out",
              stagger: { each: 0.06, from: "center" }
            },
            S
          );

          if (!bootActive) landFrames(S);
          // Fondu très court de la feuille avant de la retirer : la planche
          // se peint progressivement au lieu d'apparaître d'un coup.
          tl.to(bootCard, { autoAlpha: 0, duration: 0.22, ease: "power1.out" }, S + move - 0.12);
          tl.add(endBoot, S + move + 0.02);

          // La feuille a disparu : la phrase, le bouton puis le pied du
          // panneau se posent en cascade sous le nom déjà en place.
          tl.to(
            panelBits,
            { autoAlpha: 1, y: 0, duration: 0.55, ease: "power3.out", stagger: 0.07 },
            S + move + 0.04
          );
        }).catch(function (error) {
          console.error("Intro:", error);
          gsap.set(".cs-col-shade", { opacity: 0 });
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
