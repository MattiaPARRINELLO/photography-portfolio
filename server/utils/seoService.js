const fs = require('fs');
const path = require('path');

// config/seo.json : source des metas, pages cluster, listes home. Édité via l'admin.
const seoPath = path.resolve(__dirname, '..', '..', 'config', 'seo.json');

function slugify(s) {
    return (s || '').toString().toLowerCase().trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function loadSeoConfig() {
    try {
        return JSON.parse(fs.readFileSync(seoPath, 'utf-8'));
    } catch (e) {
        return {};
    }
}

// Validation minimale : l'important est de ne jamais casser le rendu public
// (metas textUtils, pages /artiste//salle, listes home).
function validateSeoConfig(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return { ok: false, error: 'Le contenu doit être un objet JSON' };
    }
    if (!data.site || typeof data.site !== 'object' || !data.site.url) {
        return { ok: false, error: 'site.url est requis' };
    }
    if (!data.pages || typeof data.pages !== 'object') {
        return { ok: false, error: 'pages est requis (objet)' };
    }
    for (const key of ['artists', 'venues']) {
        if (data[key] !== undefined && !Array.isArray(data[key])) {
            return { ok: false, error: `${key} doit être un tableau` };
        }
        for (const item of data[key] || []) {
            if (!item || typeof item !== 'object' || !item.name) {
                return { ok: false, error: `Chaque élément de ${key} doit avoir un "name"` };
            }
            if (!item.slug) item.slug = slugify(item.name);
        }
    }
    return { ok: true };
}

// Écriture atomique : tmp + rename pour ne jamais laisser un JSON tronqué
function saveSeoConfig(data) {
    const check = validateSeoConfig(data);
    if (!check.ok) return check;
    try {
        const tmpPath = `${seoPath}.tmp`;
        fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2) + '\n');
        fs.renameSync(tmpPath, seoPath);
        return { ok: true };
    } catch (e) {
        return { ok: false, error: 'Erreur d\'écriture : ' + e.message };
    }
}

module.exports = { loadSeoConfig, saveSeoConfig, validateSeoConfig, slugify };
