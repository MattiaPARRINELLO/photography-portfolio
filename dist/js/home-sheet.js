/* Accueil « planche contact » : filtres du carnet de route, lightbox,
   et entrées discrètes. Aucun rendu de contenu ici : tout est rendu par le
   serveur, ce fichier ne fait que réagir. */
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
      });
    });

    apply();

    // Lightbox des bandes et de la planche.
    if (window.Fancybox && typeof window.Fancybox.bind === "function") {
      window.Fancybox.bind('[data-fancybox="strips"]', {});
      window.Fancybox.bind('[data-fancybox="planche"]', {});
    }

    // Entrées : les blocs montent une seule fois, en cascade courte.
    var targets = document.querySelectorAll(
      ".cs-h2, .cs-statement, .cs-strip, .cs-row, .cs-facts, .cs-bio p, .cs-proof-cols, .cs-cta-sentence, .cs-btn"
    );

    if (!("IntersectionObserver" in window)) return;

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.08 }
    );

    targets.forEach(function (el) {
      el.classList.add("cs-reveal");
      var parent = el.parentElement;
      var index = parent ? Array.prototype.indexOf.call(parent.children, el) : 0;
      el.style.transitionDelay = Math.min(index % 5, 4) * 70 + "ms";
      io.observe(el);
    });

    // Filet de sécurité : rien ne reste invisible, même si l'observateur ne
    // se déclenche pas (saut de page, onglet en arrière-plan, capture).
    window.setTimeout(function () {
      targets.forEach(function (el) {
        el.classList.add("is-in");
      });
      io.disconnect();
    }, 1200);
  });
})();
