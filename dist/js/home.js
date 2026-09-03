      // Protection et logs conditionnels
      const isProduction = !window.location.hostname.match(
        /localhost|127\.0\.0\.1/,
      );
      const devLog = isProduction ? function () {} : console.log.bind(console);
      window.devLog = devLog;
      const devWarn = isProduction
        ? function () {}
        : console.warn.bind(console);
      window.devWarn = devWarn;
      const devError = isProduction
        ? function () {}
        : console.error.bind(console);
      window.devError = devError;

      if (isProduction) {
        console.log(
          "%c\n" +
            "═══════════════════════════════════════════════════════════════════\n" +
            "║                                                                 ║\n" +
            "║               ⚠️  AVERTISSEMENT DE SÉCURITÉ  ⚠️                ║\n" +
            "║                                                                 ║\n" +
            "═══════════════════════════════════════════════════════════════════",
          "color: #ff3333; font-size: 16px; font-weight: bold; font-family: monospace; line-height: 1.5;",
        );

        console.log(
          "%c\n🚫 ACCÈS NON AUTORISÉ À LA CONSOLE DE DÉVELOPPEMENT 🚫\n",
          "color: #ff6600; font-size: 22px; font-weight: bold; text-shadow: 2px 2px 4px rgba(0,0,0,0.8); background: linear-gradient(90deg, #330000, #000000); padding: 15px 20px; border-radius: 5px;",
        );

        console.log(
          "%c┌────────────────────────────────────────────────────────────┐\n" +
            "│  Vous tentez d'accéder aux photos de ce site ?            │\n" +
            "│                                                            │\n" +
            "│  ❌ TÉLÉCHARGEMENT INTERDIT                                │\n" +
            "│  ❌ COPIE INTERDITE                                        │\n" +
            "│  ❌ UTILISATION NON AUTORISÉE INTERDITE                    │\n" +
            "└────────────────────────────────────────────────────────────┘",
          "color: #ffff00; font-size: 15px; font-weight: bold; font-family: monospace; line-height: 1.8; background: #1a1a1a; padding: 20px; border-left: 5px solid #ff0000;",
        );

        console.log(
          "%c\n📸 PROTECTION DU DROIT D'AUTEUR\n",
          "color: #00ffff; font-size: 18px; font-weight: bold; text-decoration: underline;",
        );

        console.log(
          "%c© Mattia Parrinello - Tous droits réservés\n\n" +
            "Toutes les photographies publiées sur ce site sont protégées par le droit d'auteur.\n" +
            "Toute reproduction, représentation, modification, publication, transmission,\n" +
            "dénaturation, totale ou partielle du site ou de son contenu, par quelque\n" +
            "procédé que ce soit, sans autorisation écrite préalable est interdite et\n" +
            "constitue un délit de contrefaçon sanctionné par les articles L.335-2 et\n" +
            "suivants du Code de la propriété intellectuelle.\n",
          "color: #ffffff; font-size: 14px; line-height: 1.6; background: #1a1a1a; padding: 15px; border-left: 4px solid #00ff00;",
        );

        console.log(
          "%c⚖️  SANCTIONS PÉNALES\n",
          "color: #ff6666; font-size: 16px; font-weight: bold; text-decoration: underline;",
        );

        console.log(
          "%cLa contrefaçon est punie de :\n" +
            "• 300 000 € d'amende\n" +
            "• 3 ans d'emprisonnement\n" +
            "(Articles L.335-2 et suivants du Code de la propriété intellectuelle)\n",
          "color: #ff9999; font-size: 13px; line-height: 1.8; font-weight: bold; background: #2a0000; padding: 15px; border-left: 4px solid #ff0000;",
        );

        console.log(
          "%c📋 Pour toute demande d'utilisation légitime :\n" +
            "→ Utilisez le formulaire de contact : " +
            window.location.origin +
            "/contact\n",
        );

        console.log(
          "%c\n" +
            "═══════════════════════════════════════════════════════════════════\n",
          "color: #ff3333; font-size: 16px; font-weight: bold; font-family: monospace;",
        );
      }

      // Start fetching photos list immediately to improve LCP (fallback if not injected)
      const photosListPromise = window.INJECTED_PHOTOS
        ? Promise.resolve(window.INJECTED_PHOTOS)
        : fetch("/photos-list")
            .then((res) => res.json())
            .catch((err) => []);

      // Masonry instance holder
      let masonryInstance = null;

      // Skeleton helpers (show/remove placeholders while loading)
      function showSkeleton(container, count = 12) {
        // If we have server-rendered items, don't show skeleton!
        if (
          container.children.length > 0 &&
          !container.querySelector(".skeleton-grid")
        ) {
          return;
        }
        const sk = document.createElement("div");
        sk.className = "skeleton-grid";
        for (let i = 0; i < count; i++) {
          const it = document.createElement("div");
          it.className = "skeleton-item";
          sk.appendChild(it);
        }
        container.appendChild(sk);
      }

      function removeSkeletons(container) {
        const sk = container.querySelector(".skeleton-grid");
        if (sk) sk.remove();
      }

      // Fonction pour charger les images et initialiser la grille justifiée
      async function loadGallery() {
        const gallery = document.getElementById("gallery");

        // Check if we have server-rendered items
        const hasServerItems = gallery.children.length > 0;

        // Show skeleton placeholders immediately while fetching and loading
        if (!hasServerItems) {
          showSkeleton(gallery, 12);
        }

        const photos = await photosListPromise;

        // Skeleton will be removed once the first real thumbnail finishes loading

        const galleryItems = [];

        // If we have server items, we need to rebuild galleryItems array for Fancybox
        // and attach event listeners to existing items
        if (hasServerItems) {
          const existingItems = Array.from(
            gallery.querySelectorAll(".gallery-item"),
          );
          existingItems.forEach((div, index) => {
            const a = div.querySelector("a");
            const img = div.querySelector("img");
            if (a && img) {
              // Reconstruct photo object from attributes
              const photoUrl = a.getAttribute("data-original");
              const photoFilename = a.getAttribute("data-file");

              // Add to galleryItems for Fancybox
              galleryItems.push({
                src: a.href,
                type: "image",
                thumb: img.src,
                caption: "",
                original: photoUrl,
              });

              // Attach click listener
              const itemIndex = index;
              a.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                openFancybox(itemIndex);
              });

              // EXIF display disabled: attachExifLoader removed to prevent EXIF caption on click
              // attachExifLoader(img, photoUrl, a, itemIndex);
            }
          });
        }

        // Helper to open Fancybox (extracted to avoid duplication)
        function openFancybox(startIndex) {
          try {
            if (window.Fancybox) {
              Fancybox.show(galleryItems, {
                startIndex: startIndex,
                on: {
                  reveal: (fancybox, slide) => {
                    handleFancyboxReveal(slide);
                  },
                },
              });
            } else {
              window.open(galleryItems[startIndex].src, "_blank");
            }
          } catch (err) {
            devError("Fancybox show failed", err);
          }
        }

        // Helper for Fancybox reveal logic (extracted)
        function handleFancyboxReveal(slide) {
          // Debug: log slide structure once per slide index to help find where the original URL is stored
          try {
            try {
              window.__fb_logged_slides =
                window.__fb_logged_slides || new Set();
              const sidx =
                slide &&
                (typeof slide.index !== "undefined"
                  ? slide.index
                  : slide && slide.$index);
              if (!window.__fb_logged_slides.has(sidx)) {
                window.__fb_logged_slides.add(sidx);
                devDebug(
                  "Fancybox: reveal called for slide",
                  sidx,
                  " - dumping slide object once",
                );
                try {
                  console.dir && console.dir(slide);
                } catch (e) {
                  devDebug("Fancybox: cannot dir slide", e);
                }
              }
            } catch (e) {}
            const original =
              (slide &&
                slide.$trigger &&
                slide.$trigger.dataset &&
                slide.$trigger.dataset.original) ||
              (slide && slide.item && slide.item.original) ||
              (slide && slide.original) ||
              (typeof galleryItems !== "undefined" &&
                galleryItems[slide && slide.index] &&
                galleryItems[slide.index].original);
            if (!original) {
              devDebug(
                "Fancybox: original HD url not found for slide",
                slide && slide.index,
                slide,
              );
              return;
            }

            let highLoaded = false;

            // Resolve slide content element once and reuse
            const container =
              (slide &&
                (slide.$content ||
                  slide.contentEl ||
                  (slide.content && slide.content.el) ||
                  slide.html)) ||
              null;
            if (!container) {
              devDebug(
                "Fancybox: no slide content element for HD bindings",
                slide && slide.index,
              );
              return;
            }

            const imgEl = () => {
              try {
                if (container && container.querySelector)
                  return container.querySelector("img");
                if (slide && slide.imageEl) return slide.imageEl;
                if (slide && slide.image && slide.image.el)
                  return slide.image.el.querySelector("img");
              } catch (e) {}
              return null;
            };

            function loadHighRes() {
              if (highLoaded) return;
              const target = imgEl();
              if (!target) return;

              // If an HD request button exists in the slide, hide it immediately
              try {
                const existingHdBtn =
                  container.querySelector(".hd-request-btn");
                if (existingHdBtn) {
                  existingHdBtn.style.display = "none";
                }
              } catch (e) {
                /* ignore */
              }

              // Create / show loading badge (but animate icon -> badge first when possible)
              function createNotice() {
                let notice = container.querySelector(".hd-loading");
                if (!notice) {
                  notice = document.createElement("div");
                  notice.className = "hd-loading";
                  // styling: small semi-transparent badge (moved to top-left)
                  notice.style.position = "absolute";
                  notice.style.top = "8px";
                  notice.style.left = "8px";
                  notice.style.padding = "6px 8px";
                  notice.style.background = "rgba(0,0,0,0.6)";
                  notice.style.color = "#fff";
                  notice.style.borderRadius = "6px";
                  notice.style.fontSize = "12px";
                  notice.style.zIndex = "9999";
                  // Include a small SVG icon (clone from HD button if available) for a consistent look
                  try {
                    // ensure badge contents stay on one line
                    notice.style.display = "inline-flex";
                    notice.style.alignItems = "center";
                    notice.style.gap = "8px";
                    notice.style.whiteSpace = "nowrap";

                    const hdBtn = container.querySelector(".hd-request-btn");
                    let svgClone = null;
                    if (hdBtn) {
                      const s =
                        hdBtn.querySelector && hdBtn.querySelector("svg");
                      if (s) svgClone = s.cloneNode(true);
                    }
                    if (svgClone) {
                      svgClone.style.width = "14px";
                      svgClone.style.height = "14px";
                      svgClone.style.display = "inline-block";
                      svgClone.style.marginRight = "8px";
                      svgClone.style.opacity = "0.95";
                      svgClone.style.verticalAlign = "middle";
                      notice.appendChild(svgClone);
                    }
                  } catch (e) {
                    // ignore svg clone errors
                  }
                  const span = document.createElement("span");
                  span.textContent = "Chargement HD...";
                  span.style.display = "inline-block";
                  span.style.lineHeight = "1";
                  span.style.whiteSpace = "nowrap";
                  notice.appendChild(span);
                  try {
                    container.appendChild(notice);
                  } catch (e) {
                    /* ignore */
                  }
                }
                return notice;
              }

              // Try to animate the HD icon into the small badge for a nicer transition.
              function animateIconToBadge() {
                return new Promise((resolve) => {
                  try {
                    // Respect reduced motion
                    if (
                      window.matchMedia &&
                      window.matchMedia("(prefers-reduced-motion: reduce)")
                        .matches
                    ) {
                      return resolve();
                    }

                    const hdBtn = container.querySelector(".hd-request-btn");
                    const containerRect = container.getBoundingClientRect();
                    if (!containerRect) return resolve();

                    let startRect = null;
                    if (hdBtn) {
                      const r = hdBtn.getBoundingClientRect();
                      if (r && r.width > 2 && r.height > 2) startRect = r;
                    }
                    if (!startRect) {
                      startRect = {
                        left: containerRect.left + 12,
                        top: containerRect.top + 12,
                        width: 36,
                        height: 36,
                      };
                    }

                    // target (top-left badge) - align with badge left:8px inside container
                    const targetLeft = containerRect.left + 8;
                    const targetTop = containerRect.top + 8;
                    const targetWidth = 140; // wider to fit the text during morph
                    const targetHeight = 28;

                    // Build a morphing clone: a pill that contains the svg and a hidden text span
                    const wrap = document.createElement("div");
                    wrap.className = "hd-anim-clone";
                    wrap.style.position = "fixed";
                    wrap.style.left = startRect.left + "px";
                    wrap.style.top = startRect.top + "px";
                    wrap.style.width = startRect.width + "px";
                    wrap.style.height = startRect.height + "px";
                    wrap.style.padding = "6px";
                    wrap.style.display = "inline-flex";
                    wrap.style.alignItems = "center";
                    wrap.style.justifyContent = "center";
                    wrap.style.borderRadius =
                      Math.max(6, startRect.height / 2) + "px";
                    wrap.style.background = "transparent";
                    wrap.style.overflow = "hidden";
                    wrap.style.boxSizing = "border-box";
                    // disable transition initially to avoid abrupt start
                    wrap.style.transition = "none";
                    wrap.style.willChange =
                      "transform, width, height, border-radius, background, opacity";

                    // inner svg
                    let svgEl = null;
                    // compute sizes: keep starting svg size consistent and animate scale
                    const startSvgSize = Math.max(
                      12,
                      Math.min(startRect.height - 6, startRect.width - 6),
                    );
                    const targetSvgSize = 14;
                    try {
                      if (hdBtn) {
                        const s =
                          hdBtn.querySelector && hdBtn.querySelector("svg");
                        if (s) svgEl = s.cloneNode(true);
                      }
                    } catch (e) {
                      svgEl = null;
                    }
                    if (svgEl) {
                      svgEl.style.width = startSvgSize + "px";
                      svgEl.style.height = startSvgSize + "px";
                      svgEl.style.transform = "scale(1)";
                      svgEl.style.transition =
                        "transform 520ms cubic-bezier(.2,.9,.2,1), opacity 260ms ease";
                      svgEl.style.opacity = "1";
                      wrap.appendChild(svgEl);
                    }

                    // text that will appear (initially hidden)
                    const text = document.createElement("span");
                    text.textContent = "Chargement HD...";
                    text.style.color = "#fff";
                    text.style.fontSize = "12px";
                    text.style.marginLeft = svgEl ? "8px" : "6px";
                    text.style.opacity = "0";
                    text.style.whiteSpace = "nowrap";
                    text.style.transition = "opacity 260ms ease 220ms";
                    wrap.appendChild(text);

                    document.body.appendChild(wrap);
                    // Force layout
                    wrap.getBoundingClientRect();

                    const deltaX = targetLeft - startRect.left;
                    const deltaY = targetTop - startRect.top;

                    // enable smooth transitions now that layout is settled
                    wrap.style.transition =
                      "transform 520ms cubic-bezier(.2,.9,.2,1), width 520ms cubic-bezier(.2,.9,.2,1), height 520ms cubic-bezier(.2,.9,.2,1), border-radius 420ms ease, background-color 420ms ease, padding 420ms ease, opacity 260ms ease";

                    // compute svg scale to keep visual size consistent at the end
                    const svgScale = targetSvgSize / Math.max(1, startSvgSize);

                    // Animate: move + expand + become pill + background
                    requestAnimationFrame(() => {
                      // move via transform for smoother motion
                      wrap.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0)`;
                      // expand to target size
                      wrap.style.width = targetWidth + "px";
                      wrap.style.height = targetHeight + "px";
                      wrap.style.padding = "6px 12px";
                      wrap.style.borderRadius = targetHeight / 2 + 2 + "px";
                      wrap.style.background = "rgba(0,0,0,0.6)";

                      // smoothly scale svg (rather than changing its width/height)
                      try {
                        if (svgEl) svgEl.style.transform = `scale(${svgScale})`;
                      } catch (e) {}
                      try {
                        text.style.opacity = "1";
                      } catch (e) {}
                    });

                    // When the expansion transition ends, cross-fade into the real badge to avoid jumps
                    const onEnd = async (ev) => {
                      if (
                        ev &&
                        ev.propertyName &&
                        ev.propertyName !== "width" &&
                        ev.propertyName !== "transform"
                      )
                        return;
                      wrap.removeEventListener("transitionend", onEnd);
                      try {
                        // Create the persistent notice but keep it invisible for smooth crossfade
                        const notice =
                          typeof createNotice === "function"
                            ? createNotice()
                            : null;
                        if (notice) {
                          notice.style.transition = "opacity 220ms ease";
                          notice.style.opacity = "0";
                          // Force layout application
                          // eslint-disable-next-line no-unused-expressions
                          notice.getBoundingClientRect();
                          // Fade in notice and fade out clone
                          requestAnimationFrame(() => {
                            try {
                              notice.style.opacity = "1";
                            } catch (e) {}
                            try {
                              wrap.style.transition = "opacity 220ms ease";
                              wrap.style.opacity = "0";
                            } catch (e) {}
                          });
                          // After the badge is visible, animate hiding the small svg logo inside it
                          try {
                            setTimeout(() => {
                              try {
                                if (notice) notice.classList.add("hide-logo");
                              } catch (e) {}
                            }, 260);
                          } catch (e) {}
                          // Remove clone after fade completes
                          setTimeout(() => {
                            try {
                              if (wrap && wrap.parentNode)
                                wrap.parentNode.removeChild(wrap);
                            } catch (e) {}
                            resolve();
                          }, 260);
                        } else {
                          try {
                            if (wrap && wrap.parentNode)
                              wrap.parentNode.removeChild(wrap);
                          } catch (e) {}
                          resolve();
                        }
                      } catch (e) {
                        try {
                          if (wrap && wrap.parentNode)
                            wrap.parentNode.removeChild(wrap);
                        } catch (err) {}
                        resolve();
                      }
                    };
                    wrap.addEventListener("transitionend", onEnd);

                    // Safety fallback
                    setTimeout(() => {
                      try {
                        if (wrap && wrap.parentNode)
                          wrap.parentNode.removeChild(wrap);
                      } catch (e) {}
                      resolve();
                    }, 1100);
                  } catch (e) {
                    resolve();
                  }
                });
              }

              // Start animation (if possible), then show badge and preload
              animateIconToBadge()
                .then(async () => {
                  const notice = createNotice();

                  // Demander l'URL signée pour la version HD
                  let hdUrl = original;
                  if (typeof window.requestHDImage === "function") {
                    try {
                      const signedUrl = await window.requestHDImage(original);
                      if (signedUrl) hdUrl = signedUrl;
                    } catch (err) {
                      devWarn(
                        "Erreur lors de la demande d'URL signée, utilisation de l'URL originale",
                        err,
                      );
                    }
                  }

                  const preload = new Image();
                  preload.onload = () => {
                    try {
                      const cur = imgEl();
                      if (cur) {
                        cur.src = preload.src;
                      }
                      highLoaded = true;
                      // animate the badge logo disappearance before removing the badge
                      try {
                        if (notice) {
                          // add class to trigger svg hide animation
                          notice.classList.add("hide-logo");
                          // fade out the badge after logo hides
                          setTimeout(() => {
                            try {
                              if (notice && notice.parentNode)
                                notice.parentNode.removeChild(notice);
                            } catch (e) {}
                          }, 360);
                        } else {
                          if (notice && notice.parentNode)
                            notice.parentNode.removeChild(notice);
                        }
                      } catch (e) {
                        try {
                          if (notice && notice.parentNode)
                            notice.parentNode.removeChild(notice);
                        } catch (err) {}
                      }
                      devDebug(
                        "Fancybox: HD image loaded and swapped",
                        preload.src,
                      );
                    } catch (e) {
                      devWarn("HD swap failed", e);
                    }
                  };
                  preload.onerror = () => {
                    try {
                      if (notice) {
                        // gracefully fade out when error
                        notice.style.transition = "opacity 220ms ease";
                        notice.style.opacity = "0";
                        setTimeout(() => {
                          try {
                            if (notice && notice.parentNode)
                              notice.parentNode.removeChild(notice);
                          } catch (e) {}
                        }, 260);
                      }
                    } catch (e) {}
                    devWarn("Fancybox: failed to preload HD original", hdUrl);
                  };
                  preload.src = hdUrl;
                })
                .catch(async () => {
                  // fallback: if animation code throws, just do the minimal behaviour
                  const notice = createNotice();

                  let hdUrl = original;
                  if (typeof window.requestHDImage === "function") {
                    try {
                      const signedUrl = await window.requestHDImage(original);
                      if (signedUrl) hdUrl = signedUrl;
                    } catch (err) {
                      devWarn(
                        "Erreur lors de la demande d'URL signée (fallback)",
                        err,
                      );
                    }
                  }

                  const preload = new Image();
                  preload.onload = () => {
                    try {
                      const cur = imgEl();
                      if (cur) cur.src = preload.src;
                      highLoaded = true;
                      if (notice && notice.parentNode)
                        notice.parentNode.removeChild(notice);
                    } catch (e) {}
                  };
                  preload.onerror = () => {
                    if (notice && notice.parentNode)
                      notice.parentNode.removeChild(notice);
                  };
                  preload.src = hdUrl;
                });
            }

            // container already resolved above

            // Add a visible HD button for testing (and to let users explicitly request HD)
            try {
              if (!slide.__hd_button_added) {
                const hdBtn = document.createElement("button");
                hdBtn.className = "hd-request-btn";
                hdBtn.setAttribute(
                  "aria-label",
                  "Charger la version HD de l’image",
                );
                hdBtn.style.position = "absolute";
                hdBtn.style.left = "8px";
                hdBtn.style.top = "8px";
                hdBtn.style.zIndex = "9999";
                // Insert SVG icon + label for subtlety
                hdBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 12h4M17 12h4M12 3v4M12 17v4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="sr-only">Charger HD</span>`;
                try {
                  container && container.appendChild(hdBtn);
                } catch (e) {}
                slide.__hd_button_added = true;
                hdBtn.addEventListener("click", (ev) => {
                  ev.stopPropagation();
                  devDebug(
                    "Fancybox: HD button clicked for slide",
                    slide && slide.index,
                  );
                  loadHighRes();
                  hdBtn.style.display = "none";
                });
                slide.$el &&
                  slide.$el.addEventListener("fancybox:close", () => {
                    try {
                      if (hdBtn && hdBtn.parentNode)
                        hdBtn.parentNode.removeChild(hdBtn);
                    } catch (e) {}
                  });
              }
            } catch (e) {
              /* ignore */
            }

            // Prevent double-binding when reveal called multiple times for same slide
            if (!container.__hd_bindings_added) {
              const dbl = (e) => {
                devDebug("Fancybox: dblclick -> load HD", slide && slide.index);
                try {
                  e.preventDefault && e.preventDefault();
                } catch (er) {}
                loadHighRes();
              };
              const wheel = (e) => {
                if (e.deltaY < 0) {
                  devDebug(
                    "Fancybox: wheel up -> load HD",
                    slide && slide.index,
                  );
                  loadHighRes();
                }
              };

              // Bind dblclick to container as a broad catch, but also bind directly on the image element
              container.addEventListener("dblclick", dbl, { passive: false });
              container.addEventListener("wheel", wheel, { passive: true });

              // Try to bind directly to the <img> inside the slide for more reliable dblclick handling
              let boundImg = null;
              let boundClick = null;
              try {
                const directImg = imgEl();
                if (directImg) {
                  directImg.addEventListener("dblclick", dbl, {
                    passive: false,
                  });
                  // also listen to wheel on image as fallback
                  directImg.addEventListener("wheel", wheel, { passive: true });
                  // Also start HD load on single click - do not prevent default so Fancybox's zoom still runs
                  const clickHandler = (ev) => {
                    try {
                      /* don't prevent Fancybox zoom */
                    } catch (er) {}
                    loadHighRes();
                  };
                  directImg.addEventListener("click", clickHandler, {
                    passive: true,
                  });
                  boundClick = clickHandler;
                  boundImg = directImg;
                }
              } catch (e) {
                // ignore
              }

              container.__hd_bindings_added = true;

              slide.$el &&
                slide.$el.addEventListener("fancybox:close", () => {
                  try {
                    container.removeEventListener("dblclick", dbl);
                    container.removeEventListener("wheel", wheel);
                    if (boundImg) {
                      try {
                        boundImg.removeEventListener("dblclick", dbl);
                      } catch (e) {}
                      try {
                        boundImg.removeEventListener("wheel", wheel);
                      } catch (e) {}
                      try {
                        if (boundClick)
                          boundImg.removeEventListener("click", boundClick);
                      } catch (err) {}
                      boundImg = null;
                      boundClick = null;
                    }
                    container.__hd_bindings_added = false;
                  } catch (e) {}
                });
            }
          } catch (e) {
            devWarn("Fancybox reveal handler error", e);
          }
        }

        // Helper to attach EXIF loader
        function attachExifLoader(img, photoUrl, a, itemIndex) {
          img.addEventListener("load", async () => {
            try {
              const exif = await exifr.parse(photoUrl, {
                translateValues: false,
              });
              if (exif) {
                let infos = [];
                if (exif.Model)
                  infos.push(`📷 <b>Appareil :</b> ${exif.Model}`);
                if (exif.LensModel)
                  infos.push(`🔍 <b>Objectif :</b> ${exif.LensModel}`);
                // Focale (mm) - prefer the actual FocalLength, fall back to 35mm equivalent if available
                try {
                  const focal =
                    typeof exif.FocalLength !== "undefined"
                      ? exif.FocalLength
                      : typeof exif.FocalLengthIn35mmEquivalent !== "undefined"
                        ? exif.FocalLengthIn35mmEquivalent
                        : null;
                  if (focal !== null) {
                    const fnum = Number(focal);
                    const focalText =
                      !Number.isNaN(fnum) &&
                      Math.abs(fnum - Math.round(fnum)) > 0.05
                        ? `${fnum.toFixed(1)}mm`
                        : `${Math.round(fnum)}mm`;
                    infos.push(`🔭 <b>Focale :</b> ${focalText}`);
                  }
                } catch (e) {
                  // ignore parse errors
                }
                if (exif.FNumber)
                  infos.push(`🌞 <b>Ouverture :</b> f/${exif.FNumber}`);
                if (exif.ExposureTime)
                  infos.push(
                    `⏱️ <b>Vitesse :</b> 1/${Math.round(
                      1 / exif.ExposureTime,
                    )}s`,
                  );
                if (exif.ISO) infos.push(`🧬 <b>ISO :</b> ${exif.ISO}`);
                if (infos.length) {
                  const captionHtml = `<div class='exif-info-fb text-xs text-gray-200 bg-black/70 rounded p-2 mt-2'>${infos.join(" | ")}</div>`;
                  a.setAttribute("data-caption", captionHtml);
                  try {
                    if (galleryItems && galleryItems[itemIndex])
                      galleryItems[itemIndex].caption = captionHtml;
                  } catch (e) {
                    /* ignore */
                  }
                }
              }
            } catch (e) {
              devError("Error parsing EXIF data:", e);
            }
          });
        }

        photos.forEach((photo, index) => {
          // Check if this item is already in DOM (server-rendered)
          // We assume server renders the first N items in order.
          const existingItem =
            hasServerItems && index < gallery.children.length
              ? gallery.children[index]
              : null;

          let a, img;

          if (existingItem) {
            // Already handled above
            return;
          } else {
            // Create new item
            const div = document.createElement("div");
            div.className = "gallery-item";
            div.style.opacity = "0";
            div.style.willChange = "transform, opacity";
            div.style.transition =
              "opacity 0.6s ease-out, transform 0.6s ease-out";
            div.style.transform = "translate3d(0,10px,0)";

            a = document.createElement("a");
            // When clicking a photo, open a resized/full proxy to reduce payload
            const fileParam = encodeURIComponent(photo.filename);
            const clickWidth = 1600; // width used when opening the image in the lightbox
            a.href = `/photos/resize?file=${fileParam}&w=${clickWidth}`;
            a.setAttribute("data-fancybox", "gallery");
            a.setAttribute("data-file", photo.filename);
            // Keep the original full-size URL so we can swap to it on zoom
            a.setAttribute("data-original", photo.url);

            img = document.createElement("img");
            // Use dynamic resizing for thumbnails with srcset
            img.src = `/photos/resize?file=${fileParam}&w=640`;
            img.srcset = `/photos/resize?file=${fileParam}&w=320 320w, /photos/resize?file=${fileParam}&w=400 400w, /photos/resize?file=${fileParam}&w=480 480w, /photos/resize?file=${fileParam}&w=640 640w`;
            img.sizes =
              "(max-width: 480px) 50vw, (max-width: 1024px) 33vw, (max-width: 1440px) 25vw, 20vw";

            // Store the resized-full URL on the element so we can preload it when appropriate
            try {
              img.dataset.full = `/photos/resize?file=${fileParam}&w=${clickWidth}`;
            } catch (e) {
              /* ignore */
            }
            img.alt =
              "Photo de concert par Mattia Parrinello - " +
              photo.filename
                .replace(/^\d+_*/, "")
                .replace(/\.[^.]+$/, "")
                .replace(/_/g, " ");

            // LCP OPTIMIZATION: Eager load first images and remove animation delay
            if (index < 4) {
              img.loading = "eager";
              if (index < 2) img.setAttribute("fetchpriority", "high");
              // Remove animate-fade-in for LCP elements to reduce render delay
              img.className =
                "gallery-image rounded-xl shadow-lg transition-all duration-700 transform-gpu";
            } else {
              img.loading = "lazy";
              img.className =
                "gallery-image rounded-xl shadow-lg animate-fade-in transition-all duration-700 transform-gpu";
            }

            img.style.willChange = "transform, opacity, filter, box-shadow";

            const overlay = document.createElement("div");
            overlay.className =
              "gallery-overlay absolute inset-0 bg-black bg-opacity-0 transition-all duration-500 rounded-xl flex items-center justify-center opacity-0 hover:opacity-100 hover:bg-opacity-20";
            const zoomIcon = document.createElement("div");
            zoomIcon.innerHTML =
              '<svg class="w-8 h-8 text-white drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"/></svg>';
            overlay.appendChild(zoomIcon);

            const imageContainer = document.createElement("div");
            imageContainer.className =
              "relative overflow-hidden rounded-xl group";
            imageContainer.appendChild(img);
            imageContainer.appendChild(overlay);

            a.appendChild(imageContainer);
            div.appendChild(a);
            gallery.appendChild(div);

            // Prepare galleryItems for Fancybox and attach click handler to open via Fancybox
            const itemIndex = galleryItems.length;
            galleryItems.push({
              src: a.href,
              type: "image",
              thumb: img.src,
              caption: "",
              original: photo.url,
            });

            a.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();
              openFancybox(itemIndex);
            });

            // EXIF display disabled: attachExifLoader removed to prevent EXIF caption on click
            // attachExifLoader(img, photo.url, a, itemIndex);
          }
        });

        // Initialize Masonry with imagesLoaded - with gaps
        const isMobile = window.innerWidth < 768;
        const gutterSize = isMobile ? 6 : 10; // Reduced mobile gaps for more compact view

        // Destroy previous instance if exists
        if (masonryInstance) {
          masonryInstance.destroy();
        }

        // Initialize Masonry with gaps
        masonryInstance = new Masonry(gallery, {
          itemSelector: ".gallery-item",
          columnWidth: ".gallery-item",
          percentPosition: true,
          gutter: gutterSize,
          transitionDuration: "0.3s",
          fitWidth: false,
          initLayout: false,
        });

        // Use imagesLoaded to reveal items progressively as each thumbnail finishes loading
        const imgLoad = imagesLoaded(gallery);
        imgLoad.on("progress", function (instance, image) {
          try {
            const imgEl = image.img;
            const item =
              imgEl && imgEl.closest && imgEl.closest(".gallery-item");
            if (item && item.style.opacity !== "1") {
              // Remove skeletons once the first real image has loaded
              removeSkeletons(gallery);
              // Reveal this single item with a small animation
              item.style.opacity = "1";
              item.style.transform = "translate3d(0,0,0)";
              // Layout Masonry incrementally to place the newly visible item
              if (masonryInstance) masonryInstance.layout();
            }
          } catch (e) {
            devWarn("Reveal error", e);
          }
        });

        // When all images are done (or errored), ensure final layout and bind Fancybox + preloader
        imgLoad.on("always", function () {
          try {
            // Ensure all items are visible
            Array.from(gallery.querySelectorAll(".gallery-item")).forEach(
              (item) => {
                item.style.opacity = "1";
                item.style.transform = "translate3d(0,0,0)";
              },
            );

            if (masonryInstance) masonryInstance.layout();

            // Fancybox handling is performed when opening via Fancybox.show (click handler)

            // --- Preload full-size images (when appropriate) ---
            (function setupPreloader() {
              try {
                // Honor Save-Data preference
                if (navigator.connection && navigator.connection.saveData)
                  return;

                // Helper to actually start loading an image and report progress to console
                const startPreload = (url, el) => {
                  if (!url) return;
                  const i = new Image();
                  devLog(
                    "[preload] start",
                    url,
                    el &&
                      (el.getAttribute("alt") ||
                        (el.dataset && el.dataset.file)),
                  );
                  i.onload = () => {
                    devLog(
                      "[preload] loaded",
                      url,
                      el &&
                        (el.getAttribute("alt") ||
                          (el.dataset && el.dataset.file)),
                    );
                  };
                  i.onerror = (err) => {
                    devWarn("[preload] error", url, err);
                  };
                  // Kick off load
                  i.src = url;
                };

                // IntersectionObserver to preload when thumbnail becomes near-viewport
                const io = new IntersectionObserver(
                  (entries, obs) => {
                    entries.forEach((ent) => {
                      if (ent.isIntersecting) {
                        const imgEl = ent.target;
                        const full = imgEl.dataset && imgEl.dataset.full;
                        if (full) startPreload(full, imgEl);
                        obs.unobserve(imgEl);
                      }
                    });
                  },
                  { rootMargin: "600px 0px", threshold: 0.01 },
                );

                // Observe all gallery images that have a data-full attribute
                document
                  .querySelectorAll(".gallery-image[data-full]")
                  .forEach((img) => {
                    try {
                      io.observe(img);
                    } catch (e) {
                      /* ignore */
                    }
                  });

                // Eagerly preload the first few full-size images to improve first interactions
                const firstToPreload = Array.from(
                  document.querySelectorAll(".gallery-image[data-full]"),
                ).slice(0, 4);
                firstToPreload.forEach((img) => {
                  const full = img.dataset && img.dataset.full;
                  if (full) startPreload(full, img);
                });
              } catch (e) {
                devError("Preloader setup failed", e);
              }
            })();
          } catch (e) {
            devError("imagesLoaded always handler error", e);
          }
        });

        // Handle window resize
        let resizeTimer;
        window.addEventListener("resize", () => {
          clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => {
            if (masonryInstance) {
              masonryInstance.layout();
            }
          }, 150);
        });
      }

      // Cinematic intro: large centered name that writes line-by-line then moves to header
      async function cinematicIntro() {
        if (
          window.matchMedia &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ) {
          return Promise.resolve();
        }

        return new Promise((resolve) => {
          // Create overlay
          const overlay = document.createElement("div");
          overlay.id = "intro-overlay";
          overlay.innerHTML = `
            <div class="intro-inner">
              <div class="intro-line" data-line="1">MATTIA PARRINELLO</div>
            </div>
          `;
          document.body.appendChild(overlay);

          // Hide the header label to avoid duplicate during transition
          const headerLink = document.querySelector("a.font-signika");
          if (headerLink) headerLink.style.visibility = "hidden";

          const inner = overlay.querySelector(".intro-inner");

          // Adapt overlay/text colors to the user's color scheme (dark / light)
          try {
            const prefersDark =
              window.matchMedia &&
              window.matchMedia("(prefers-color-scheme: dark)").matches;
            const bg = prefersDark ? "#000" : "#fff";
            const textColor = prefersDark ? "#fff" : "#111";
            // Apply initial colors inline so the animation matches the page theme
            overlay.style.backgroundColor = bg;
            inner.style.color = textColor;
            // subtle text shadow on light bg for contrast
            if (!prefersDark)
              inner.style.textShadow =
                "0 1px 0 rgba(255,255,255,0.02), 0 2px 12px rgba(0,0,0,0.06)";
            else inner.style.textShadow = "none";
          } catch (e) {
            // ignore if matchMedia unsupported
          }

          // Build letters for a typewriter effect
          const title = "MATTIA PARRINELLO";
          inner.innerHTML = "";

          // Match the intro font to the final header title for a seamless transition
          try {
            const headerComputed = window.getComputedStyle(headerLink);
            if (headerComputed) {
              inner.style.fontFamily =
                headerComputed.fontFamily ||
                getComputedStyle(document.body).fontFamily;
              inner.style.fontWeight = headerComputed.fontWeight || "700";
              inner.style.letterSpacing = headerComputed.letterSpacing || "0em";
              inner.style.textTransform =
                headerComputed.textTransform || "none";
              inner.style.color = headerComputed.color || "#fff";
              // Start with larger font size that will shrink to header size
              inner.style.fontSize = "9vw"; // Adjusted to take ~90% of screen width
              inner.style.lineHeight = headerComputed.lineHeight || "0.9";
            }
          } catch (e) {
            // ignore if any issue reading computed style
          }
          const letters = [];
          for (const ch of title) {
            const span = document.createElement("span");
            span.className = "intro-letter";
            span.textContent = ch === " " ? "\u00A0" : ch;
            inner.appendChild(span);
            letters.push(span);
          }

          // Force GPU layer creation for smoother animations
          overlay.style.willChange = "opacity";
          inner.style.willChange = "transform, opacity";

          // Reveal each letter with a stagger (typewriter)
          const startDelay = 300;
          const perLetter = 60;
          letters.forEach((el, i) => {
            setTimeout(
              () => {
                el.classList.add("show");
                // Clean up will-change after letter animation completes
                setTimeout(() => {
                  el.style.willChange = "auto";
                }, 520 + 420); // letter-duration + opacity duration
              },
              startDelay + i * perLetter,
            );
          });

          // After typing, add slight tracking and a light sweep
          const afterTyping = startDelay + letters.length * perLetter + 250;
          setTimeout(() => inner.classList.add("tracking"), afterTyping);

          // After reveal, wait a bit then animate to header
          const totalDelay = afterTyping + 400;
          setTimeout(() => {
            // Compute target rect (header link)
            const target = document.querySelector("a.font-signika");
            const inner = overlay.querySelector(".intro-inner");
            if (!target || !inner) {
              // cleanup
              overlay.remove();
              if (headerLink) headerLink.style.visibility = "";
              resolve();
              return;
            }

            const tRect = target.getBoundingClientRect();
            const iRect = inner.getBoundingClientRect();

            // Calculate scale to match width roughly
            const scale = Math.min(1, tRect.width / iRect.width);
            const translateX =
              tRect.left + tRect.width / 2 - (iRect.left + iRect.width / 2);
            const translateY =
              tRect.top + tRect.height / 2 - (iRect.top + iRect.height / 2);

            // Apply transform with a tuned duration and easing, using translate3d + RAF
            const dur =
              getComputedStyle(document.documentElement).getPropertyValue(
                "--intro-duration",
              ) || "2200ms";
            const durMs = parseInt(dur) || 2200;
            // Use a cinematic ease curve: slow start, smooth acceleration, gentle landing
            const ease = "ease-in-out";
            // Transform happens over full duration, but opacity fades 110ms after the transforms end
            const opacityDelay = durMs + 110;
            const opacityDur = 600;

            inner.style.transition = `transform ${dur} ${ease}, opacity ${opacityDur}ms ${ease} ${opacityDelay}ms`;
            inner.style.transformOrigin = "center center";

            // Force composite layer for GPU acceleration
            inner.style.willChange = "transform, opacity";
            inner.style.backfaceVisibility = "hidden";
            inner.style.perspective = "1000px";

            // ensure the browser has applied the transition property before setting transform
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                inner.style.transform = `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`;
                inner.style.opacity = "0";
              });
            });

            // Fade out overlay background while moving - match duration
            const overlayDur = parseInt(dur) || 2200;
            overlay.style.willChange = "opacity, background-color";
            overlay.style.transition = `background-color ${overlayDur}ms ${ease}, opacity ${overlayDur}ms ${ease}`;
            // Fade to transparent using the correct color channel depending on initial bg
            try {
              const prefersDark =
                window.matchMedia &&
                window.matchMedia("(prefers-color-scheme: dark)").matches;
              overlay.style.backgroundColor = prefersDark
                ? "rgba(0,0,0,0)"
                : "rgba(255,255,255,0)";
            } catch (e) {
              overlay.style.backgroundColor = "rgba(0,0,0,0)";
            }

            // After transition, remove overlay and reveal header (slightly after transform end)
            const cleanupDelay = overlayDur + 180; // small buffer
            setTimeout(() => {
              // Clean up GPU resources before removal
              inner.style.willChange = "auto";
              overlay.style.willChange = "auto";

              overlay.remove();
              if (headerLink) headerLink.style.visibility = "";
              resolve();
            }, cleanupDelay);
          }, totalDelay);
        });
      }

      // Start gallery loading in background while running the cinematic intro
      document.addEventListener("DOMContentLoaded", () => {
        // Kick off gallery load immediately in background
        const galleryPromise = loadGallery();
        // Run intro in foreground; gallery continues loading underneath
        cinematicIntro().catch(() => {});
        // optional: you could later await galleryPromise if you want to ensure it's done
      });
