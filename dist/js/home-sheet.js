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
    // L'hébergement mutualisé renvoie parfois un 508 quand trop d'images
    // arrivent en même temps (limite de ressources Apache, pas de notre code).
    // On retente une fois, en décalé, plutôt que de laisser un trou dans la
    // planche pour toute la visite.
    document.addEventListener(
      "error",
      function (e) {
        var img = e.target;
        if (!img || img.tagName !== "IMG" || img.getAttribute("data-retried")) return;
        var src = img.getAttribute("src") || "";
        if (src.indexOf("/photos/") < 0) {
          if (!src && img.getAttribute("data-src")) src = img.getAttribute("data-src");
          else return;
        }
        img.setAttribute("data-retried", "1");
        window.setTimeout(function () {
          img.src = src + (src.indexOf("?") > -1 ? "&" : "?") + "retry=1";
        }, 1200);
      },
      true
    );

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

    // Connexion faible : on allège l'intro (photo plus petite, pas d'arrivée
    // des colonnes, pas de tirages supplémentaires).
    var conn = navigator.connection || {};
    var slowNet = !!(
      conn.saveData ||
      /(^|-)2g$/.test(conn.effectiveType || "") ||
      (conn.effectiveType === "3g" && typeof conn.downlink === "number" && conn.downlink < 1)
    );

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
    var bootMark = boot ? boot.querySelector(".cs-boot-mark") : null;
    // Garde du repli du nom : le H1 n'est découpé qu'une fois.
    var nameFoldReady = false;
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

    // Le carton n'est posé par le document que si l'intro doit jouer (même
    // décision que le script inline de pages/home.html).
    var bootActive = !!(
      window.__csBoot === true && boot && bootName && bootCard && bootPhoto &&
      bootScrim && bootVeil && bootWords.length === 2 && panel && title &&
      hasMotion && !introSeen
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
      // Le repli du nom ne s'arme qu'une fois le carton retiré : pendant
      // l'intro le H1 est masqué, un survol y replierait le titre à l'aveugle.
      initNameFold();
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
          var url = chosen.replace(/([?&])w=\d+/, slowNet ? "$1w=640" : "$1w=1600");
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
    // La rangée est aussi justifiée : elle affiche autant de photos qu'il en
    // faut pour remplir la largeur, et sa hauteur suit (les portraits, étroits,
    // demandent une rangée plus haute que les paysages).
    function initRowAccordion() {
      if (!gsap || reduceMotion) return;

      var GAP = 8;
      var ROW_HEIGHT = 190; // hauteur de référence, cible de la justification
      var ROW_MIN = 160;
      var ROW_MAX = 240;
      var HOT_RISE = 40; // débordement de l'image survolée dans l'interstice
      var MIN_FRAMES = 5; // en dessous, la rangée paraît vide
      var DWELL = 70; // ms d'arret avant de changer de photo dans une rangee ouverte
      var DURATION = 0.5;
      var EASE = "power3.out";
      var wide = window.matchMedia("(min-width: 901px)");

      gsap.utils.toArray(".cs-strip").forEach(function (strip) {
        var box = strip.querySelector(".cs-strip-frames");
        if (!box) return;
        var pool = gsap.utils.toArray(box.children);
        if (pool.length < 2) return;
        var frames = pool;
        var ratios = pool.map(ratioOf);
        var natural = [];
        var targets = []; // largeurs visees : celles de repos ou celles de l'ouverture
        var lefts = []; // bords gauches vises, dans la boite
        var boxRect = null; // dernier rectangle connu de la boite
        var rowH = ROW_HEIGHT;
        var hotIndex = -1;
        var lastWidth = -1;
        var pending = 0;

        function ratioOf(frame) {
          var img = frame.querySelector("img");
          if (!img) return 1;
          var w = parseFloat(img.getAttribute("width"));
          var h = parseFloat(img.getAttribute("height"));
          if (!w || !h) {
            w = img.naturalWidth;
            h = img.naturalHeight;
          }
          return w && h ? w / h : 1;
        }

        // Le test de survol se fait sur la géométrie visée, pas sur le DOM :
        // aucune lecture de layout pendant l'animation.
        function setTargets(widths) {
          targets = widths.slice();
          lefts = [];
          var x = 0;
          for (var i = 0; i < targets.length; i++) {
            lefts.push(x);
            x += targets[i] + GAP;
          }
        }

        function cacheBox() {
          boxRect = box.getBoundingClientRect();
        }

        // Découpage retenu : celui dont la hauteur justifiée tombe le plus près
        // de la hauteur de référence, donc le moins de recadrage possible.
        function fit(total) {
          var best = pool.length;
          var bestScore = Infinity;
          var sum = 0;
          for (var k = 1; k <= pool.length; k++) {
            sum += ratios[k - 1];
            if (k < MIN_FRAMES) continue;
            var score = Math.abs((total - GAP * (k - 1)) / sum - ROW_HEIGHT);
            if (score < bestScore - 0.01) {
              bestScore = score;
              best = k;
            }
          }
          return best;
        }

        // L'image d'un cadre chaud n'est pas recadrée : sa hauteur suit sa
        // largeur. Quand le cadre redevient froid, on ramène cette hauteur à
        // celle de la rangée au lieu de la couper net.
        function settleImage(frame, animate, duration) {
          var img = frame.querySelector("img");
          if (!img) return;
          var from = img.getBoundingClientRect().height;
          frame.classList.remove("is-hot");
          if (!animate || Math.abs(from - rowH) < 0.5) {
            gsap.killTweensOf(img);
            img.style.height = "";
            frame.style.overflow = "";
            return;
          }
          // Le cadre laisse déborder l'image le temps qu'elle reprenne sa
          // hauteur, sinon le haut serait coupé d'un coup.
          frame.style.overflow = "visible";
          gsap.fromTo(img, { height: from }, {
            height: rowH,
            duration: duration,
            ease: EASE,
            overwrite: true,
            onComplete: function () {
              img.style.height = "";
              frame.style.overflow = "";
            }
          });
        }

        function reset(animate) {
          var wasHot = hotIndex > -1;
          hotIndex = -1;
          if (wasHot && animate) {
            // La bande laisse déborder l'image qui se referme le temps qu'elle
            // retrouve sa hauteur, sinon le haut serait coupé d'un coup.
            gsap.delayedCall(DURATION * 0.9, function () {
              if (hotIndex < 0) strip.classList.remove("is-hot-row");
            });
          } else {
            strip.classList.remove("is-hot-row");
          }
          frames.forEach(function (f, j) {
            if (f.classList.contains("is-hot")) settleImage(f, animate, 0.45);
            if (animate) {
              gsap.to(f, { width: natural[j], opacity: 1, duration: 0.45, ease: EASE, overwrite: true });
            } else {
              gsap.set(f, { width: natural[j], opacity: 1 });
            }
          });
          setTargets(natural);
        }

        function open(index) {
          if (!wide.matches) return;
          var total = box.clientWidth;
          var gaps = GAP * (frames.length - 1);
          // L'image garde son format : on plafonne sa largeur par la hauteur
          // qu'elle peut prendre sans manger la légende du dessus.
          var ratio = ratios[index] || 1;
          var hot = Math.min(total * 0.42, (rowH + HOT_RISE) * ratio);
          hot = Math.max(hot, natural[index] * 1.05);
          var left = Math.max(total - hot - gaps, 80);
          var sum = natural.reduce(function (a, w, j) { return j === index ? a : a + w; }, 0) || 1;

          var next = [];
          frames.forEach(function (f, j) {
            var width = Math.max(j === index ? hot : Math.min(left * (natural[j] / sum), natural[j]), 24);
            next.push(width);
            if (j === index) {
              var img = f.querySelector("img");
              if (img) {
                gsap.killTweensOf(img);
                img.style.height = "";
              }
              f.style.overflow = "";
              f.classList.add("is-hot");
            } else if (f.classList.contains("is-hot")) {
              settleImage(f, true, DURATION);
            }
            gsap.to(f, {
              width: width,
              opacity: j === index ? 1 : 0.75,
              duration: DURATION,
              ease: EASE,
              overwrite: true
            });
          });
          setTargets(next);
          strip.classList.add("is-hot-row");
        }

        // Range la bande : photos retenues, hauteur de rangée et largeurs. Sous
        // 901 px la grille CSS reprend la main (trois photos par ligne).
        function layout(total) {
          var fill = wide.matches && total > 0;
          var count = fill ? fit(total) : Math.min(pool.length, 6);

          pool.forEach(function (f, i) { f.hidden = i >= count; });
          frames = pool.slice(0, count);
          hotIndex = -1;

          if (!fill) {
            rowH = ROW_HEIGHT;
            box.style.removeProperty("--row-h");
            strip.classList.remove("cs-accordion", "is-hot-row");
            frames.forEach(function (f) {
              f.classList.remove("is-hot");
              gsap.killTweensOf(f);
              f.style.width = "";
              f.style.opacity = "";
              f.style.removeProperty("--col-w");
            });
            natural = [];
            setTargets(natural);
            return;
          }

          var sum = 0;
          for (var i = 0; i < count; i++) sum += ratios[i];
          var gaps = GAP * (count - 1);
          rowH = Math.max(ROW_MIN, Math.min(ROW_MAX, (total - gaps) / sum));
          box.style.setProperty("--row-h", Math.round(rowH) + "px");
          var scale = (total - gaps) / (sum * rowH);
          natural = ratios.slice(0, count).map(function (r) {
            return Math.max(r * rowH * scale, 24);
          });

          frames.forEach(function (f, j) {
            f.style.setProperty("--col-w", natural[j] + "px");
          });
          strip.classList.add("cs-accordion");
          reset(false);
          cacheBox();
        }

        function relayout() {
          // Une bande filtrée n'a plus de largeur : on lit celle de sa colonne.
          var total = box.clientWidth || (strip.parentElement && strip.parentElement.clientWidth) || 0;
          if (!total || total === lastWidth) return;
          lastWidth = total;
          layout(total);
        }

        relayout();

        // La largeur bouge aussi sans redimensionnement de la fenêtre :
        // apparition de la barre de défilement, filtres, zoom. On suit la boîte.
        if (typeof ResizeObserver === "function") {
          new ResizeObserver(relayout).observe(box);
        } else {
          window.addEventListener("resize", relayout);
        }

        // La cible est lue sous le pointeur à chaque déplacement, et non à
        // l'entrée dans un cadre : quitter un cadre pour son voisin remettrait
        // la rangée à plat, le cadre visé glisserait sous le curseur et
        // l'animation repartirait sur un troisième.
        function frameUnder(e) {
          var r = boxRect;
          if (!r || e.clientY < r.top || e.clientY > r.bottom) return -1;
          var x = e.clientX - r.left;
          for (var i = 0; i < targets.length; i++) {
            if (x < lefts[i] + targets[i]) return x >= lefts[i] ? i : -1;
          }
          return -1;
        }

        strip.addEventListener("pointerenter", function (e) {
          if (e.pointerType && e.pointerType !== "mouse") return;
          cacheBox();
        });

        strip.addEventListener("pointermove", function (e) {
          if (e.pointerType !== "mouse") return;
          var index = frameUnder(e);
          if (index < 0 || index === hotIndex) return;
          clearTimeout(pending);
          if (hotIndex < 0) {
            // Première entrée dans la rangée : on répond tout de suite.
            hotIndex = index;
            open(index);
            return;
          }
          // Changement de photo dans une rangée déjà ouverte : on attend que
          // le curseur s'arrête. Sans ça, un balayage relance l'animation à
          // chaque cadre et toute la rangée tremble.
          pending = setTimeout(function () {
            if (hotIndex === index) return;
            hotIndex = index;
            open(index);
          }, DWELL);
        });

        strip.addEventListener("pointerleave", function (e) {
          if (e.pointerType && e.pointerType !== "mouse") return;
          clearTimeout(pending);
          if (hotIndex > -1) reset(true);
        });

      });
    }

    initRowAccordion();

    // --- Repli du nom en marque ------------------------------------------
    // Au survol, « Mattia Parrinello » se replie sur les cinq lettres de
    // MPRNL : les autres se ferment et s'effacent, les gardées passent en
    // capitales et se resserrent. Le texte du document ne change pas (SEO,
    // copie, dictée) : seules des largeurs de lettres sont animées.
    function initNameFold() {
      if (nameFoldReady || !gsap || reduceMotion) return;
      var h1 = document.querySelector(".cs-title");
      if (!h1) return;
      var raw = h1.textContent;
      // Uniquement le nom : si le H1 SEO change, l'effet se retire de lui-même.
      if (raw.replace(/\s+/g, " ").trim().toUpperCase() !== "MATTIA PARRINELLO") return;
      if (!window.matchMedia("(min-width: 901px)").matches) return;
      if (!window.matchMedia("(hover: hover)").matches) return;
      nameFoldReady = true;

      // Lettres conservées : M de « Mattia », puis P, R, N et L de « Parrinello ».
      var KEEP = [0, 7, 9, 12, 14];
      var chars = [];
      var frag = document.createDocumentFragment();
      var i;
      for (i = 0; i < raw.length; i++) {
        var span = document.createElement("span");
        span.className = "cs-fold-char";
        span.dataset.index = String(i);
        // Espace insécable : une espace ordinaire se replie à zéro dans un
        // inline-block, et la séparation des deux mots disparaîtrait.
        span.textContent = raw.charAt(i) === " " ? "\u00a0" : raw.charAt(i);
        span._glyph = span.textContent;
        frag.appendChild(span);
        chars.push(span);
      }
      h1.textContent = "";
      h1.appendChild(frag);
      h1.setAttribute("aria-label", raw.replace(/\s+/g, " ").trim());

      var kept = [];
      var dropped = [];
      chars.forEach(function (char, index) {
        (KEEP.indexOf(index) > -1 ? kept : dropped).push(char);
      });

      // Les lettres gardées ne bougent pas : elles s'effacent un court instant,
      // changent de glyphe à ce moment-là, puis reviennent en capitale. Aucun
      // mouvement vertical ni pincement, aucune superposition visible.
      var CLOSE = 0.34;
      var FADE = 0.09;
      var BACK = 0.13;
      var EASE = "power3.inOut";
      var STAGGER = { each: 0.006, from: "center" };
      var openWidths = [];
      var folded = false;
      var tl = null;

      function widthsOf(nodes) {
        return nodes.map(function (node) { return node.getBoundingClientRect().width; });
      }

      function reset() {
        if (tl) {
          tl.kill();
          tl = null;
        }
        chars.forEach(function (char) {
          char.classList.remove("is-mark");
          char.style.width = "";
          char.style.opacity = "";
          char.style.transform = "";
        });
      }

      function fold() {
        if (folded) return;
        folded = true;
        reset();
        openWidths = widthsOf(chars);

        kept.forEach(function (char) { char.classList.add("is-mark"); });
        var upper = widthsOf(kept);
        kept.forEach(function (char) { char.classList.remove("is-mark"); });

        var dip = 0.15;
        tl = gsap.timeline();
        tl.to(dropped, {
          width: 0,
          opacity: 0,
          duration: CLOSE,
          ease: EASE,
          stagger: STAGGER
        }, 0);
        tl.to(kept, { opacity: 0, duration: FADE, ease: "power1.in" }, dip);
        tl.call(function () {
          kept.forEach(function (char, j) {
            char.classList.add("is-mark");
            char.style.width = upper[j] + "px";
          });
        }, null, dip + FADE);
        tl.to(kept, { opacity: 1, duration: BACK, ease: "power1.out" }, dip + FADE);
      }

      function unfold() {
        if (!folded) return;
        folded = false;
        if (tl) {
          tl.kill();
          tl = null;
        }
        var natural = openWidths;

        tl = gsap.timeline();
        tl.to(kept, { opacity: 0, duration: FADE, ease: "power1.in" }, 0);
        tl.call(function () {
          kept.forEach(function (char) {
            char.classList.remove("is-mark");
            char.style.width = "";
          });
        }, null, FADE);
        tl.to(kept, { opacity: 1, duration: BACK, ease: "power1.out" }, FADE);
        tl.to(dropped, {
          width: function (j) { return natural[Number(dropped[j].dataset.index)] + "px"; },
          opacity: 1,
          duration: CLOSE,
          ease: EASE,
          stagger: STAGGER,
          onComplete: function () {
            dropped.forEach(function (char) { char.style.width = ""; });
          }
        }, FADE * 0.7);
      }

      h1.addEventListener("pointerenter", function (e) {
        if (e.pointerType && e.pointerType !== "mouse") return;
        fold();
      });
      h1.addEventListener("pointerleave", function (e) {
        if (e.pointerType && e.pointerType !== "mouse") return;
        unfold();
      });
    }

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
        if (!slowNet) {
          gsap.set(cols, {
            x: function (i) { return i < cols.length / 2 ? -60 : 60; },
            opacity: 0.55
          });
        }

        var fontsReady = document.fonts && document.fonts.ready
          ? Promise.race([
              document.fonts.ready,
              new Promise(function (resolve) { window.setTimeout(resolve, 1200); })
            ])
          : Promise.resolve();

        // Décodage des premiers tirages avant de lancer le mouvement : la
        // planche est déjà peinte quand la feuille commence à se replier,
        // ce qui évite un gros à-coup au milieu de l'animation.
        var heroImgs = gsap.utils.toArray(".cs-sheet .cs-frame img").slice(0, 10);
        var imagesReady = Promise.race([
          Promise.all(heroImgs.map(function (img) {
            return img.decode ? img.decode().catch(function () {}) : Promise.resolve();
          })),
          new Promise(function (resolve) { window.setTimeout(resolve, 600); })
        ]).catch(function () {});
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
        Promise.all(narrow ? [minHold, imagesReady] : [fontsReady, minHold, imagesReady]).then(function () {
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

          // La marque s'efface au début du repli : elle signe l'ouverture,
          // elle n'accompagne pas le nom vers le H1.
          if (bootMark) {
            tl.to(bootMark, { autoAlpha: 0, duration: 0.35, ease: "power2.in" }, S);
          }

          // Repli de la feuille sur le panneau : la photo garde son cadrage
          // (aucune déformation), c'est la feuille entière qui rétrécit.
          // Sur téléphone on ne replie pas : le panneau est au-dessus de la
          // planche, le carton rétréci laissait voir la planche derrière lui.
          if (!narrow) {
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
          }

          if (!narrow && targets && targets[0] && targets[1]) {
            // Un seul mouvement, conduit par un paramètre unique :
            //  - les deux mots rétrécissent autour du centre du bloc, donc
            //    l'interligne suit la taille des lettres ;
            //  - en fin de course, le bloc se déplie doucement sur la ligne
            //    du titre (fondu de lissage, sans rupture de rythme).
            var centres = bootWords.map(function (w) {
              var r = w.getBoundingClientRect();
              return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
            });
            var gy = (centres[0].y + centres[1].y) / 2;
            var state = { u: 0 };

            function smoothstep(x) {
              x = Math.max(0, Math.min(1, x));
              return x * x * (3 - 2 * x);
            }

            function poseAt(u) {
              // Les trois transformations sont pilotées par le même u, de 0 à
              // 1 : elles démarrent et finissent ensemble. La montée suit une
              // courbe plus douce au début pour que les mots ne se heurtent
              // pas en se rejoignant.
              var uy = Math.pow(u, 4);
              bootWords.forEach(function (w, i) {
                var s = 1 + (targets[i].scale - 1) * u;
                gsap.set(w, {
                  scale: s,
                  x: targets[i].x * u,
                  y: targets[i].y * uy
                });
              });
            }

            tl.to(
              state,
              {
                u: 1,
                duration: move,
                ease: "power2.inOut",
                onUpdate: function () { poseAt(state.u); }
              },
              S
            );
            // Le blanc de la photo devient l'encre du papier.
            if (hasPhoto) {
              // Le nom reste blanc tant que la photo est là, puis passe à
              // l'encre quand le voile blanc prend le dessus.
              // Le nom reste blanc tant que la photo est là, puis bascule
              // franchement en encre quand le voile a pris le dessus.
              tl.to(bootName, { color: "#101421", duration: 0.35, ease: "power2.in" }, S + 0.55);
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
            tl.to(bootVeil, { autoAlpha: 1, duration: 0.6, ease: "power1.inOut" }, S + 0.5);
          }


          // Les colonnes se remettent en place en se resserrant.
          if (!slowNet) tl.to(
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
          if (narrow) {
            // Téléphone : le nom s'efface sur la photo, puis la feuille glisse
            // vers le bas et découvre la page déjà composée, du titre vers la
            // planche. Pas de fondu croisé : la photo reste opaque.
            tl.to(bootName, { autoAlpha: 0, duration: 0.22, ease: "power1.in" }, S);
            tl.add(function () {
              if (title) title.style.visibility = "";
            }, S + 0.08);
            tl.to(panelBits, { autoAlpha: 1, y: 0, duration: 0.2, ease: "none" }, S + 0.08);
            tl.to(bootCard, { yPercent: 100, duration: 0.62, ease: "power3.inOut" }, S + 0.1);
            tl.add(endBoot, S + 0.75);
          } else {
            tl.to(bootCard, { autoAlpha: 0, duration: 0.22, ease: "power1.out" }, S + move - 0.12);
            tl.add(endBoot, S + move + 0.02);
            // La feuille a disparu : la phrase, le bouton puis le pied du
            // panneau se posent en cascade sous le nom déjà en place.
            tl.to(
              panelBits,
              { autoAlpha: 1, y: 0, duration: 0.55, ease: "power3.out", stagger: 0.07 },
              S + move + 0.04
            );
          }
          tl.add(initScrollAnimations, S + move + 0.1);
          tl.add(function () { gsap.set(bootWords, { willChange: "auto" }); }, S + move + 0.15);
          if (!slowNet) tl.add(loadLateFrames, S + move + 0.6);
        }).catch(function (error) {
          console.error("Intro:", error);
          gsap.set(".cs-col-shade", { opacity: 0 });
          endBoot();
          gsap.set(panelBits, { autoAlpha: 1, y: 0 });
        });
      } else {
        // Pas d'intro (déjà vue) : la planche et les animations de
        // défilement sont là tout de suite.
        if (!introSeen) {
          scrambleFrames();
          landFrames(0);
        }
        initScrollAnimations();
        if (!slowNet) loadLateFrames();
      }

      // --- Animations de défilement ---------------------------------------
      // Créées seulement une fois l'intro terminée : leur initialisation
      // (mesures, ScrollTrigger.refresh) bloquait le fil principal pendant
      // l'animation d'ouverture.
      function initScrollAnimations() {
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
            ".cs-h2, .cs-statement, .cs-index-note, .cs-facts, .cs-bio p, .cs-proof-kind, .cs-proof-list, .cs-proof-col, .cs-cta-sentence, .cs-cta .cs-btn"
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

        // Le pied est au bout de la page : on le fait entrer dès qu'il pointe,
        // sinon sa dernière ligne restait invisible quand on était déjà en bas
        // (le seuil « top 92% » n'est jamais atteint au maximum de défilement).
        gsap.utils.toArray(".cs-foot-top, .cs-foot-bottom").forEach(function (el) {
          gsap.from(el, {
            autoAlpha: 0,
            y: 20,
            duration: 0.7,
            ease: "power2.out",
            scrollTrigger: { trigger: el, start: "top bottom", once: true }
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

      }

      // Complète les colonnes avec le tirage mis de côté, une fois l'intro
      // terminée : rien à charger pendant le mouvement.
      function loadLateFrames() {
        gsap.utils.toArray(".cs-frame-late img").forEach(function (img) {
          var src = img.getAttribute("data-src");
          if (!src) return;
          img.addEventListener("load", function () {
            var figure = img.closest(".cs-frame-late");
            if (figure) figure.classList.add("is-in");
          }, { once: true });
          img.setAttribute("src", src);
          img.removeAttribute("data-src");
        });
      }

      return function () {
        intro.kill();
      };
    });
  });
})();
