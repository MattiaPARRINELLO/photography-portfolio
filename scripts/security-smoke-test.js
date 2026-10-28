#!/usr/bin/env node
/**
 * Recette de sécurité HTTP — protection des photos.
 *
 * À lancer contre une instance réellement démarrée (dev, staging ou prod) :
 *
 *   SMOKE_BASE_URL=http://127.0.0.1:3499 \
 *   SMOKE_PHOTO_FILE=concert.jpg \
 *   node scripts/security-smoke-test.js
 *
 * Le script ne modifie rien côté serveur, sauf le cache de redimensionnement
 * (via un appel /photos/resize légitime).
 */
const BASE_URL = (process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3499').replace(/\/$/, '');
const FILE = process.env.SMOKE_PHOTO_FILE || 'concert.jpg';
const BASE_NAME = FILE.replace(/\.[^.]+$/, '');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

const results = [];

function record(name, ok, detail) {
    results.push({ name, ok, detail });
    const status = ok ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`;
    console.log(`[${status}] ${name}${detail ? ` ${DIM}— ${detail}${RESET}` : ''}`);
}

async function get(path) {
    const res = await fetch(`${BASE_URL}${path}`, { redirect: 'manual' });
    const body = await res.text().catch(() => '');
    return { status: res.status, headers: res.headers, body };
}

async function expectStatus(name, path, expected) {
    const res = await get(path);
    const ok = res.status === expected;
    record(name, ok, `attendu ${expected}, obtenu ${res.status}`);
    if (res.status >= 500) {
        record(`${name} (aucun 500)`, false, `le serveur a renvoyé ${res.status}`);
    }
    return res;
}

async function main() {
    console.log(`\nRecette de sécurité photos — ${BASE_URL}`);
    console.log(`Fichier de test : ${FILE}\n`);

    // 0) Pré-remplissage du cache pour que le test « cache direct » soit réel.
    await get(`/photos/resize?file=${encodeURIComponent(FILE)}&w=1600&fmt=webp`);

    // 1) Aucun accès direct à l'original
    await expectStatus('Accès direct à l\'original', `/photos/${encodeURIComponent(FILE)}`, 404);

    // 2) Aucun accès direct au cache de redimensionnement
    await expectStatus(
        'Accès direct au cache resized/',
        `/photos/resized/webp/1600/${encodeURIComponent(BASE_NAME)}.webp`,
        404
    );

    // 3) Redimensionnement légitime + headers
    const resize = await expectStatus(
        'Redimensionnement légitime w=1600',
        `/photos/resize?file=${encodeURIComponent(FILE)}&w=1600`,
        200
    );

    const robots = resize.headers.get('x-robots-tag') || '';
    record('En-tête X-Robots-Tag: noimageindex', robots.toLowerCase() === 'noimageindex', `obtenu « ${robots || '(absent)'} »`);

    const cacheControl = resize.headers.get('cache-control') || '';
    record('En-tête Cache-Control immutable sur le resize', /immutable/.test(cacheControl), `obtenu « ${cacheControl || '(absent)'} »`);

    // 4) Sur-résolution refusée
    await expectStatus(
        'Sur-résolution w=5000 refusée',
        `/photos/resize?file=${encodeURIComponent(FILE)}&w=5000`,
        400
    );

    // 5) Path traversal refusé
    await expectStatus(
        'Path traversal refusé',
        `/photos/resize?file=${encodeURIComponent('../../package.json')}&w=640`,
        400
    );

    // 6) Kit presse : URL signée valide
    const hdRequest = await fetch(`${BASE_URL}/api/request-hd-access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagePath: `photos/${FILE}` })
    });
    const hdPayload = await hdRequest.json().catch(() => ({}));

    if (hdRequest.status !== 200 || !hdPayload.url) {
        record('Kit presse : obtention d\'une URL signée', false, `attendu 200 + url, obtenu ${hdRequest.status}`);
        console.log(`\n${RED}RÉSULTAT : ${results.filter((r) => !r.ok).length} échec(s) — arrêt.${RESET}`);
        process.exit(1);
    }
    record('Kit presse : obtention d\'une URL signée', true, 'HTTP 200 + url');

    const hd = await get(hdPayload.url);
    record('Kit presse : téléchargement HD autorisé', hd.status === 200, `attendu 200, obtenu ${hd.status}`);
    const hdCache = hd.headers.get('cache-control') || '';
    record(
        'Kit presse : Cache-Control private, no-store',
        /private/.test(hdCache) && /no-store/.test(hdCache),
        `obtenu « ${hdCache || '(absent)'} »`
    );

    // 7) Signature tronquée → 403, jamais 500
    const truncated = `${BASE_URL}/api/hd-image?path=${encodeURIComponent(FILE)}&expires=9999999999&signature=abc`;
    const truncatedRes = await fetch(truncated);
    record('Kit presse : signature tronquée → 403', truncatedRes.status === 403, `obtenu ${truncatedRes.status}`);

    // 8) Signature altérée → 403, jamais 500
    const url = new URL(hdPayload.url, BASE_URL);
    const sig = url.searchParams.get('signature') || '';
    const tamperedSig = sig.slice(0, -1) + (sig.endsWith('a') ? 'b' : 'a');
    url.searchParams.set('signature', tamperedSig);
    const tamperedRes = await fetch(url.toString());
    record('Kit presse : signature altérée → 403', tamperedRes.status === 403, `obtenu ${tamperedRes.status}`);

    // 9) Expiration → 403
    const expired = new URL(hdPayload.url, BASE_URL);
    expired.searchParams.set('expires', '1');
    const expiredRes = await fetch(expired.toString());
    record('Kit presse : URL expirée → 403', expiredRes.status === 403, `obtenu ${expiredRes.status}`);

    const failures = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failures.length}/${results.length} vérifications réussies.`);
    if (failures.length > 0) {
        console.log(`${RED}RÉSULTAT : ÉCHEC${RESET}`);
        process.exit(1);
    }
    console.log(`${GREEN}RÉSULTAT : 100% VERT${RESET}`);
}

main().catch((err) => {
    console.error(`${RED}Erreur d'exécution :${RESET}`, err.message);
    process.exit(1);
});
