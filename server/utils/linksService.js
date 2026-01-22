/**
 * Links Service - Gestion des liens pour la page /links (carte de visite digitale)
 * Service centralisé pour charger, sauvegarder et manipuler les liens configurables
 */

const fs = require('fs');
const path = require('path');

const LINKS_CONFIG_PATH = path.join(__dirname, '../../config/links.json');

// Icons SVG pour les différents types de liens
const ICONS = {
    camera: `<svg class="link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
    
    instagram: `<svg class="link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>`,
    
    mail: `<svg class="link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
    
    whatsapp: `<svg class="link-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`,
    
    twitter: `<svg class="link-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
    
    youtube: `<svg class="link-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
    
    tiktok: `<svg class="link-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>`,
    
    spotify: `<svg class="link-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>`,
    
    link: `<svg class="link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
    
    phone: `<svg class="link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
    
    facebook: `<svg class="link-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`,
    
    linkedin: `<svg class="link-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>`
};

/**
 * Charge la configuration des liens depuis le fichier JSON
 * @returns {Object} Configuration des liens
 */
function loadLinksConfig() {
    try {
        if (fs.existsSync(LINKS_CONFIG_PATH)) {
            const data = fs.readFileSync(LINKS_CONFIG_PATH, 'utf-8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Erreur lors du chargement de links.json:', error);
    }
    
    // Configuration par défaut
    return {
        profile: {
            name: 'Mattia Parrinello',
            role: 'Photographe',
            tagline: 'Concerts • Lives • Backstage',
            avatar: { enabled: true, url: '/dist/assets/Avatar.png' }
        },
        links: [],
        appearance: { theme: 'dark', accentColor: '#667eea', showWatermark: true },
        seo: {
            title: 'Mattia Parrinello | Photographe',
            description: 'Photographe spécialisé concerts et lives'
        }
    };
}

/**
 * Sauvegarde la configuration des liens
 * @param {Object} config - Configuration à sauvegarder
 * @returns {boolean} Succès de la sauvegarde
 */
function saveLinksConfig(config) {
    try {
        fs.writeFileSync(LINKS_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
        console.log('✅ Configuration links.json sauvegardée');
        return true;
    } catch (error) {
        console.error('❌ Erreur lors de la sauvegarde de links.json:', error);
        return false;
    }
}

/**
 * Récupère les liens actifs triés par ordre
 * @returns {Array} Liens actifs et triés
 */
function getActiveLinks() {
    const config = loadLinksConfig();
    return config.links
        .filter(link => link.enabled)
        .sort((a, b) => a.order - b.order);
}

/**
 * Génère le HTML pour l'avatar
 * @param {Object} profile - Configuration du profil
 * @returns {string} HTML de l'avatar
 */
function generateAvatarHtml(profile) {
    if (!profile.avatar || !profile.avatar.enabled) {
        return '';
    }
    
    return `
            <div class="avatar-wrapper">
                <img src="${profile.avatar.url}" alt="${profile.name}" class="avatar" loading="eager" fetchpriority="high">
                <span class="status-dot" aria-label="Disponible"></span>
            </div>`;
}

/**
 * Génère le HTML pour un lien
 * @param {Object} link - Configuration du lien
 * @returns {string} HTML du lien
 */
function generateLinkHtml(link) {
    const icon = ICONS[link.icon] || ICONS.link;
    const styleClass = link.style === 'primary' ? ' primary' : '';
    const externalAttrs = link.url.startsWith('http') || link.url.startsWith('mailto:') || link.url.startsWith('tel:') || link.url.startsWith('https://wa.me')
        ? ' target="_blank" rel="noopener noreferrer"'
        : '';
    
    return `
            <a href="${link.url}" class="link-btn${styleClass}" data-link-id="${link.id}"${externalAttrs}>
                ${icon}
                <span>${link.label}</span>
            </a>`;
}

/**
 * Génère le HTML du watermark
 * @param {Object} appearance - Configuration d'apparence
 * @returns {string} HTML du watermark
 */
function generateWatermarkHtml(appearance) {
    if (!appearance.showWatermark) {
        return '';
    }
    
    return `<a href="/" class="watermark">photo.mprnl.fr</a>`;
}

/**
 * Vérifie si le bandeau événement est actif et non expiré
 * @param {Object} event - Configuration de l'événement
 * @returns {boolean} True si l'événement doit être affiché
 */
function isEventActive(event) {
    if (!event || !event.enabled || !event.message) {
        return false;
    }
    
    // Vérifier l'expiration
    if (event.expiresAt) {
        const expirationDate = new Date(event.expiresAt);
        if (expirationDate <= new Date()) {
            return false;
        }
    }
    
    return true;
}

/**
 * Génère le HTML du bandeau événement
 * @param {Object} event - Configuration de l'événement
 * @returns {string} HTML du bandeau ou chaîne vide
 */
function generateEventBannerHtml(event) {
    if (!isEventActive(event)) {
        return '';
    }
    
    const icon = ICONS[event.icon] || ICONS.camera;
    // Remplacer la classe link-icon par event-icon
    const eventIcon = icon.replace('link-icon', 'event-icon');
    
    const hasUrl = event.url && event.url.trim() !== '';
    const tag = hasUrl ? 'a' : 'div';
    const hrefAttr = hasUrl ? ` href="${event.url}"` : '';
    const targetAttr = hasUrl && (event.url.startsWith('http') || event.url.startsWith('mailto:')) ? ' target="_blank" rel="noopener noreferrer"' : '';
    
    const arrowSvg = hasUrl ? `<svg class="event-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>` : '';
    
    // Calculer le temps restant
    const timeRemaining = getEventTimeRemaining(event);
    let timeHtml = '';
    if (timeRemaining) {
        if (timeRemaining.days > 0) {
            timeHtml = `<span class="event-time">${timeRemaining.days}j restant${timeRemaining.days > 1 ? 's' : ''}</span>`;
        } else if (timeRemaining.hours > 0) {
            timeHtml = `<span class="event-time">${timeRemaining.hours}h restante${timeRemaining.hours > 1 ? 's' : ''}</span>`;
        } else {
            timeHtml = `<span class="event-time">Dernières minutes</span>`;
        }
    }
    
    return `
        <${tag}${hrefAttr}${targetAttr} class="event-banner">
            ${eventIcon}
            <span class="event-text">${event.message}</span>
            ${timeHtml}
            ${arrowSvg}
        </${tag}>`;
}

/**
 * Crée ou met à jour un bandeau événement
 * @param {Object} eventData - Données de l'événement
 * @param {number} daysUntilExpiration - Nombre de jours avant expiration (max 7)
 * @returns {Object} Configuration mise à jour
 */
function setEventBanner(eventData, daysUntilExpiration = 7) {
    const config = loadLinksConfig();
    
    // Limiter à 7 jours maximum
    const days = Math.min(Math.max(1, daysUntilExpiration), 7);
    
    const now = new Date();
    const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    
    config.event = {
        enabled: true,
        message: eventData.message || '',
        url: eventData.url || '',
        icon: eventData.icon || 'camera',
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString()
    };
    
    saveLinksConfig(config);
    console.log(`📢 Bandeau événement créé, expire le ${expiresAt.toLocaleDateString('fr-FR')}`);
    
    return config;
}

/**
 * Désactive le bandeau événement
 * @returns {Object} Configuration mise à jour
 */
function clearEventBanner() {
    const config = loadLinksConfig();
    
    config.event = {
        enabled: false,
        message: '',
        url: '',
        icon: 'camera',
        createdAt: null,
        expiresAt: null
    };
    
    saveLinksConfig(config);
    console.log('🗑️ Bandeau événement désactivé');
    
    return config;
}

/**
 * Calcule le temps restant avant expiration du bandeau
 * @param {Object} event - Configuration de l'événement
 * @returns {Object|null} Temps restant ou null si pas d'événement actif
 */
function getEventTimeRemaining(event) {
    if (!isEventActive(event) || !event.expiresAt) {
        return null;
    }
    
    const now = new Date();
    const expiresAt = new Date(event.expiresAt);
    const diffMs = expiresAt - now;
    
    if (diffMs <= 0) {
        return null;
    }
    
    const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    const hours = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    
    return {
        days,
        hours,
        expiresAt: expiresAt.toISOString(),
        formattedExpiry: expiresAt.toLocaleDateString('fr-FR', { 
            weekday: 'long', 
            day: 'numeric', 
            month: 'long',
            hour: '2-digit',
            minute: '2-digit'
        })
    };
}

/**
 * Injecte les données dans le template HTML
 * @param {string} html - Template HTML
 * @param {Object} config - Configuration des liens
 * @param {Object} req - Requête Express (pour URL canonique)
 * @returns {string} HTML avec données injectées
 */
function injectLinksData(html, config, req) {
    const { profile, links, appearance, seo, event } = config;
    const activeLinks = links.filter(l => l.enabled).sort((a, b) => a.order - b.order);
    
    // Générer l'URL canonique
    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const canonicalUrl = `${protocol}://${req.get('host')}/links`;
    
    // SEO
    html = html.replace(/\{\{SEO_TITLE\}\}/g, seo.title || profile.name);
    html = html.replace(/\{\{SEO_DESCRIPTION\}\}/g, seo.description || '');
    html = html.replace(/\{\{CANONICAL_URL\}\}/g, canonicalUrl);
    html = html.replace(/\{\{PROFILE_AVATAR\}\}/g, profile.avatar?.url || '/dist/assets/Avatar.png');
    
    // Profile
    html = html.replace(/\{\{PROFILE_NAME\}\}/g, profile.name);
    html = html.replace(/\{\{PROFILE_ROLE\}\}/g, profile.role);
    html = html.replace(/\{\{PROFILE_TAGLINE\}\}/g, profile.tagline);
    
    // Event Banner
    const eventBannerHtml = generateEventBannerHtml(event);
    html = html.replace('<!-- EVENT_BANNER_PLACEHOLDER -->', eventBannerHtml);
    
    // Avatar
    const avatarHtml = generateAvatarHtml(profile);
    html = html.replace('<!-- AVATAR_PLACEHOLDER -->', avatarHtml);
    
    // Links
    const linksHtml = activeLinks.map(link => generateLinkHtml(link)).join('');
    html = html.replace('<!-- LINKS_PLACEHOLDER -->', linksHtml);
    
    // Watermark
    const watermarkHtml = generateWatermarkHtml(appearance);
    html = html.replace('<!-- WATERMARK_PLACEHOLDER -->', watermarkHtml);
    
    return html;
}

/**
 * Ajoute un nouveau lien
 * @param {Object} linkData - Données du nouveau lien
 * @returns {Object} Configuration mise à jour
 */
function addLink(linkData) {
    const config = loadLinksConfig();
    
    // Générer un ID unique si non fourni
    if (!linkData.id) {
        linkData.id = `link_${Date.now()}`;
    }
    
    // Définir l'ordre si non fourni
    if (typeof linkData.order !== 'number') {
        const maxOrder = config.links.reduce((max, l) => Math.max(max, l.order || 0), 0);
        linkData.order = maxOrder + 1;
    }
    
    // Valeurs par défaut
    linkData.enabled = linkData.enabled !== false;
    linkData.style = linkData.style || 'default';
    linkData.icon = linkData.icon || 'link';
    linkData.tracking = linkData.tracking !== false;
    
    config.links.push(linkData);
    saveLinksConfig(config);
    
    return config;
}

/**
 * Met à jour un lien existant
 * @param {string} linkId - ID du lien à mettre à jour
 * @param {Object} updates - Mises à jour à appliquer
 * @returns {Object|null} Configuration mise à jour ou null si non trouvé
 */
function updateLink(linkId, updates) {
    const config = loadLinksConfig();
    const linkIndex = config.links.findIndex(l => l.id === linkId);
    
    if (linkIndex === -1) {
        return null;
    }
    
    config.links[linkIndex] = { ...config.links[linkIndex], ...updates };
    saveLinksConfig(config);
    
    return config;
}

/**
 * Supprime un lien
 * @param {string} linkId - ID du lien à supprimer
 * @returns {Object|null} Configuration mise à jour ou null si non trouvé
 */
function deleteLink(linkId) {
    const config = loadLinksConfig();
    const initialLength = config.links.length;
    
    config.links = config.links.filter(l => l.id !== linkId);
    
    if (config.links.length === initialLength) {
        return null;
    }
    
    saveLinksConfig(config);
    return config;
}

/**
 * Réordonne les liens
 * @param {Array} orderedIds - Tableau des IDs dans le nouvel ordre
 * @returns {Object} Configuration mise à jour
 */
function reorderLinks(orderedIds) {
    const config = loadLinksConfig();
    
    orderedIds.forEach((id, index) => {
        const link = config.links.find(l => l.id === id);
        if (link) {
            link.order = index + 1;
        }
    });
    
    saveLinksConfig(config);
    return config;
}

/**
 * Met à jour le profil
 * @param {Object} profileData - Nouvelles données du profil
 * @returns {Object} Configuration mise à jour
 */
function updateProfile(profileData) {
    const config = loadLinksConfig();
    config.profile = { ...config.profile, ...profileData };
    saveLinksConfig(config);
    return config;
}

/**
 * Met à jour les paramètres d'apparence
 * @param {Object} appearanceData - Nouvelles données d'apparence
 * @returns {Object} Configuration mise à jour
 */
function updateAppearance(appearanceData) {
    const config = loadLinksConfig();
    config.appearance = { ...config.appearance, ...appearanceData };
    saveLinksConfig(config);
    return config;
}

/**
 * Met à jour les paramètres SEO
 * @param {Object} seoData - Nouvelles données SEO
 * @returns {Object} Configuration mise à jour
 */
function updateSeo(seoData) {
    const config = loadLinksConfig();
    config.seo = { ...config.seo, ...seoData };
    saveLinksConfig(config);
    return config;
}

/**
 * Récupère la liste des icônes disponibles
 * @returns {Array} Liste des noms d'icônes
 */
function getAvailableIcons() {
    return Object.keys(ICONS);
}

module.exports = {
    loadLinksConfig,
    saveLinksConfig,
    getActiveLinks,
    injectLinksData,
    addLink,
    updateLink,
    deleteLink,
    reorderLinks,
    updateProfile,
    updateAppearance,
    updateSeo,
    getAvailableIcons,
    // Event banner functions
    isEventActive,
    generateEventBannerHtml,
    setEventBanner,
    clearEventBanner,
    getEventTimeRemaining,
    ICONS
};
