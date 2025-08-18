/**
 * User Activity Tracker - Système de logging des actions utilisateur
 * Ce script trace automatiquement les clics, changements de page, et interactions
 */

class UserActivityTracker {
    constructor() {
        this.userId = this.getUserId();
        this.sessionStartTime = Date.now();
        this.lastActivityTime = Date.now();
        this.init();
    }

    // Génère ou récupère un ID utilisateur unique basé sur un cookie
    getUserId() {
        const cookieName = 'user_tracking_id';
        let userId = this.getCookie(cookieName);

        if (!userId) {
            userId = 'user_' + this.generateRandomId();
            this.setCookie(cookieName, userId, 365); // Cookie valide 1 an
        }

        return userId;
    }

    generateRandomId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
        return null;
    }

    setCookie(name, value, days) {
        const expires = new Date();
        expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
        document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
    }

    // Envoie un log au serveur
    async logAction(action, details = {}) {
        try {
            const logData = {
                userId: this.userId,
                action: action,
                timestamp: new Date().toISOString(),
                url: window.location.href,
                page: window.location.pathname,
                sessionDuration: Date.now() - this.sessionStartTime,
                timeSinceLastActivity: Date.now() - this.lastActivityTime,
                ...details
            };

            // Ajouter les informations de campagne si elles sont disponibles
            if (window.campaignInfo) {
                logData.campaignInfo = window.campaignInfo;
            }

            await fetch('/log-action', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(logData)
            });

            this.lastActivityTime = Date.now();
        } catch (error) {
            console.error('❌ Erreur lors de l\'envoi du log:', error);
        }
    }

    // Extrait les paramètres de source depuis l'URL
    extractSourceParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const sourceParams = {};

        // Paramètres de tracking courants
        const trackingParams = [
            'source', 'utm_source', 'utm_medium', 'utm_campaign',
            'utm_term', 'utm_content', 'ref', 'referrer', 'origin'
        ];

        trackingParams.forEach(param => {
            if (urlParams.has(param)) {
                sourceParams[param] = urlParams.get(param);
            }
        });

        // Stocke les paramètres de source pour cette session
        if (Object.keys(sourceParams).length > 0) {
            sessionStorage.setItem('traffic_source', JSON.stringify(sourceParams));
        }

        return sourceParams;
    }

    // Récupère la source de trafic (paramètres URL ou session)
    getTrafficSource() {
        // D'abord, essaie de récupérer depuis les paramètres URL actuels
        const currentSourceParams = this.extractSourceParams();
        if (Object.keys(currentSourceParams).length > 0) {
            return currentSourceParams;
        }

        // Sinon, récupère depuis le sessionStorage
        const storedSource = sessionStorage.getItem('traffic_source');
        if (storedSource) {
            try {
                return JSON.parse(storedSource);
            } catch (error) {
                console.warn('Erreur lors de la lecture de la source de trafic:', error);
            }
        }

        return null;
    }

    // Initialise tous les trackers
    init() {
        const trafficSource = this.getTrafficSource();

        this.logAction('page_visit', {
            referrer: document.referrer,
            userAgent: navigator.userAgent,
            screenResolution: `${screen.width}x${screen.height}`,
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            trafficSource: trafficSource
        });

        this.trackClicks();
        this.trackPageNavigation();
        this.trackScrolling();
        this.trackFormInteractions();
        this.trackPhotoInteractions();
        this.trackTimeSpent();
    }

    // Trace tous les clics
    trackClicks() {
        document.addEventListener('click', (event) => {
            const element = event.target;
            const tagName = element.tagName.toLowerCase();
            const className = element.className;
            const id = element.id;
            const text = element.textContent?.substring(0, 100) || '';

            let actionType = 'click';
            let details = {
                element: tagName,
                className: className,
                id: id,
                text: text.trim(),
                position: {
                    x: event.clientX,
                    y: event.clientY
                }
            };

            // Actions spécifiques selon le type d'élément
            if (tagName === 'button') {
                actionType = 'button_click';
            } else if (tagName === 'a') {
                actionType = 'link_click';
                details.href = element.href;
            } else if (tagName === 'img') {
                // Vérifier si c'est une photo (qui sera traitée par le gestionnaire spécialisé)
                const isPhotoImage = element.src && (
                    element.src.includes('/photos/') ||
                    element.src.match(/\.(jpg|jpeg|png|webp)$/i)
                );

                // Si c'est une photo, ne pas logger ici (sera loggé comme photo_click)
                if (!isPhotoImage) {
                    actionType = 'image_click';
                    details.src = element.src;
                    details.alt = element.alt;
                } else {
                    // Ne pas logger, sera traité par le gestionnaire spécialisé des photos
                    return;
                }
            } else if (element.closest('.photo-item')) {
                actionType = 'photo_click';
                const photoItem = element.closest('.photo-item');
                const img = photoItem.querySelector('img');
                details.photoSrc = img?.src;
                details.photoAlt = img?.alt;
            }

            this.logAction(actionType, details);
        });
    }

    // Trace la navigation entre pages
    trackPageNavigation() {
        // Track page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.logAction('page_hide');
            } else {
                this.logAction('page_show');
            }
        });

        // Track page unload
        window.addEventListener('beforeunload', () => {
            this.logAction('page_leave', {
                timeSpent: Date.now() - this.sessionStartTime
            });
        });
    }

    // Trace le scroll
    trackScrolling() {
        let scrollTimer = null;
        let maxScroll = 0;

        window.addEventListener('scroll', () => {
            clearTimeout(scrollTimer);

            const scrollPercent = Math.round(
                (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100
            );

            if (scrollPercent > maxScroll) {
                maxScroll = scrollPercent;
            }

            scrollTimer = setTimeout(() => {
                this.logAction('scroll', {
                    scrollPercent: scrollPercent,
                    maxScrollPercent: maxScroll,
                    scrollY: window.scrollY
                });
            }, 1000);
        });
    }

    // Trace les interactions avec les formulaires
    trackFormInteractions() {
        document.addEventListener('submit', (event) => {
            const form = event.target;
            this.logAction('form_submit', {
                formId: form.id,
                formClass: form.className,
                action: form.action || window.location.href
            });
        });

        document.addEventListener('input', (event) => {
            const element = event.target;
            if (element.type === 'search') {
                this.logAction('search_input', {
                    searchTerm: element.value.substring(0, 50), // Limite pour la confidentialité
                    inputId: element.id
                });
            }
        });
    }

    // Trace spécifiquement les interactions avec les photos
    trackPhotoInteractions() {
        // Observer les images qui entrent dans le viewport
        if ('IntersectionObserver' in window) {
            const imageObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        this.logAction('photo_view', {
                            photoSrc: img.src,
                            photoAlt: img.alt,
                            viewportPosition: entry.intersectionRatio
                        });
                    }
                });
            }, {
                threshold: 0.5 // 50% de l'image visible
            });

            // Observer toutes les images
            document.querySelectorAll('img').forEach(img => {
                imageObserver.observe(img);
            });

            // Observer les nouvelles images ajoutées dynamiquement
            const mutationObserver = new MutationObserver((mutations) => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1) {
                            const images = node.querySelectorAll('img');
                            images.forEach(img => imageObserver.observe(img));
                        }
                    });
                });
            });

            mutationObserver.observe(document.body, {
                childList: true,
                subtree: true
            });
        }

        // Tracker les clics sur les photos pour les statistiques séparées
        this.trackPhotoClicks();
    }

    // Nouvelle méthode spécifique pour tracker les clics sur les photos
    trackPhotoClicks() {
        // Fonction pour enregistrer un clic de photo
        const recordPhotoClick = async (photoElement, photoSrc) => {
            try {
                // Extraire le nom de fichier depuis l'URL
                const url = new URL(photoSrc, window.location.origin);
                const photoFilename = url.pathname.split('/').pop();

                // Préparer les données du clic
                const clickData = {
                    userId: this.userId,
                    photoFilename: photoFilename,
                    photoFullUrl: photoSrc,
                    clickPosition: this.getElementPosition(photoElement),
                    timestamp: new Date().toISOString(),
                    page: window.location.pathname,
                    userAgent: navigator.userAgent,
                    screenSize: `${screen.width}x${screen.height}`,
                    viewportSize: `${window.innerWidth}x${window.innerHeight}`
                };

                // Envoyer vers l'API de tracking des photos
                const response = await fetch('/photo-click', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(clickData)
                });

                if (response.ok) {
                    console.log(`📸 Clic photo enregistré: ${photoFilename}`);
                } else {
                    console.warn('⚠️ Erreur lors de l\'enregistrement du clic photo');
                }
            } catch (error) {
                console.error('❌ Erreur lors de l\'enregistrement du clic photo:', error);
            }
        };

        // Écouter les clics sur toutes les images existantes
        const attachClickListeners = () => {
            document.querySelectorAll('img').forEach(img => {
                // Éviter de dupliquer les listeners
                if (!img.hasAttribute('data-click-tracked')) {
                    img.setAttribute('data-click-tracked', 'true');

                    img.addEventListener('click', (event) => {
                        // Vérifier que c'est bien une image de photo (pas logo, etc.)
                        const src = img.src;
                        if (src && (
                            src.includes('/photos/') ||
                            src.match(/\.(jpg|jpeg|png|webp)$/i)
                        )) {
                            recordPhotoClick(img, src);

                            // Logger aussi l'action normale pour les logs d'activité
                            this.logAction('photo_click', {
                                photoSrc: src,
                                photoAlt: img.alt,
                                photoFilename: src.split('/').pop()
                            });
                        }
                    });
                }
            });
        };

        // Attacher les listeners initiaux
        attachClickListeners();

        // Observer les nouvelles images ajoutées dynamiquement
        const mutationObserver = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) {
                        // Vérifier si le nœud lui-même est une image
                        if (node.tagName === 'IMG') {
                            if (!node.hasAttribute('data-click-tracked')) {
                                node.setAttribute('data-click-tracked', 'true');
                                node.addEventListener('click', (event) => {
                                    const src = node.src;
                                    if (src && (
                                        src.includes('/photos/') ||
                                        src.match(/\.(jpg|jpeg|png|webp)$/i)
                                    )) {
                                        recordPhotoClick(node, src);
                                        this.logAction('photo_click', {
                                            photoSrc: src,
                                            photoAlt: node.alt,
                                            photoFilename: src.split('/').pop()
                                        });
                                    }
                                });
                            }
                        }
                        // Ou vérifier les images dans les nœuds ajoutés
                        const images = node.querySelectorAll('img');
                        images.forEach(img => {
                            if (!img.hasAttribute('data-click-tracked')) {
                                img.setAttribute('data-click-tracked', 'true');
                                img.addEventListener('click', (event) => {
                                    const src = img.src;
                                    if (src && (
                                        src.includes('/photos/') ||
                                        src.match(/\.(jpg|jpeg|png|webp)$/i)
                                    )) {
                                        recordPhotoClick(img, src);
                                        this.logAction('photo_click', {
                                            photoSrc: src,
                                            photoAlt: img.alt,
                                            photoFilename: src.split('/').pop()
                                        });
                                    }
                                });
                            }
                        });
                    }
                });
            });
        });

        mutationObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // Obtenir la position d'un élément dans la page
    getElementPosition(element) {
        const rect = element.getBoundingClientRect();
        return {
            x: rect.left + window.scrollX,
            y: rect.top + window.scrollY,
            width: rect.width,
            height: rect.height,
            viewportX: rect.left,
            viewportY: rect.top
        };
    }

    // Trace le temps passé sur la page
    trackTimeSpent() {
        setInterval(() => {
            if (!document.hidden) {
                this.logAction('heartbeat', {
                    timeSpent: Date.now() - this.sessionStartTime,
                    activeTime: Date.now() - this.lastActivityTime
                });
            }
        }, 30000); // Toutes les 30 secondes
    }
}

// Initialiser le tracker quand la page est chargée
document.addEventListener('DOMContentLoaded', () => {
    window.userTracker = new UserActivityTracker();
    console.log('🔍 User Activity Tracker initialisé');
});

// Export pour utilisation en module si nécessaire
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UserActivityTracker;
}
