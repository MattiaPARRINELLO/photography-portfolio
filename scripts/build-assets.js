const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const csso = require('csso');
const zlib = require('zlib');

async function fileExists(p) {
    try { await fsp.access(p); return true; } catch { return false; }
}

function hashContent(content) {
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 8);
}

async function writeCompressedOutputs(outPath, content) {
    const gz = zlib.gzipSync(Buffer.from(content), { level: zlib.constants.Z_BEST_COMPRESSION });
    await fsp.writeFile(outPath + '.gz', gz);
    if (zlib.brotliCompressSync) {
        try {
            const br = zlib.brotliCompressSync(Buffer.from(content), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } });
            await fsp.writeFile(outPath + '.br', br);
        } catch (e) {
            console.warn('Brotli compress failed:', e.message);
        }
    }
}

async function buildCss() {
    const root = path.resolve(__dirname, '..');
    const cssSrc = path.join(root, 'dist', 'css', 'output.css');
    if (!(await fileExists(cssSrc))) {
        console.warn('No CSS source found at', cssSrc);
        return null;
    }

    const css = await fsp.readFile(cssSrc, 'utf-8');
    const min = csso.minify(css).css;
    const h = hashContent(min);
    const outName = `output.${h}.css`;
    const outPath = path.join(root, 'dist', 'css', outName);
    await fsp.writeFile(outPath, min, 'utf-8');
    await writeCompressedOutputs(outPath, min);
    return { name: outName, path: outPath };
}

async function loadOldFingerprintedName() {
    const root = path.resolve(__dirname, '..');
    const manifestPath = path.join(root, 'dist', 'manifest.json');
    try {
        const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf-8'));
        const oldValue = manifest['dist/css/output.css'];
        if (oldValue) return path.basename(oldValue);
    } catch (e) {}
    return null;
}

async function updateHtmlReferences(newName) {
    const root = path.resolve(__dirname, '..');
    const pagesDir = path.join(root, 'pages');
    const oldFingerprintedName = await loadOldFingerprintedName();

    async function walk(dir) {
        const entries = await fsp.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                await walk(fullPath);
            } else if (entry.name.endsWith('.html')) {
                let txt = await fsp.readFile(fullPath, 'utf-8');
                let updated = false;

                // Replace base name output.css
                let newTxt = txt.split('output.css').join(newName);
                if (newTxt !== txt) { updated = true; txt = newTxt; }

                // Replace old fingerprinted name (e.g. output.b5468ae2.css)
                if (oldFingerprintedName && oldFingerprintedName !== newName) {
                    newTxt = txt.split(oldFingerprintedName).join(newName);
                    if (newTxt !== txt) { updated = true; txt = newTxt; }
                }

                // Replace any other old fingerprinted names (output.<hex>.css)
                newTxt = txt.replace(/output\.[a-f0-9]{8}\.css/g, newName);
                if (newTxt !== txt) { updated = true; txt = newTxt; }

                if (updated) {
                    await fsp.writeFile(fullPath, txt, 'utf-8');
                    console.log(`Updated ${path.relative(pagesDir, fullPath)} -> ${newName}`);
                }
            }
        }
    }

    await walk(pagesDir);
}

async function writeManifest(manifest) {
    const root = path.resolve(__dirname, '..');
    const manifestPath = path.join(root, 'dist', 'manifest.json');
    await fsp.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    console.log('Wrote manifest to', manifestPath);
}

async function cleanupOldFingerprinted(keepName) {
    const root = path.resolve(__dirname, '..');
    const cssDir = path.join(root, 'dist', 'css');
    const entries = await fsp.readdir(cssDir);
    for (const entry of entries) {
        if (/^output\.[a-f0-9]{8}\.css(\.(gz|br))?$/.test(entry)) {
            if (entry.startsWith(keepName)) continue;
            const fullPath = path.join(cssDir, entry);
            fs.unlinkSync(fullPath);
        }
    }
}

async function main() {
    console.log('Building assets: minify + fingerprint + precompress');
    try {
        const cssRes = await buildCss();
        if (!cssRes) return process.exit(0);

        await cleanupOldFingerprinted(cssRes.name);
        await updateHtmlReferences(cssRes.name);

        const manifest = { 'dist/css/output.css': `dist/css/${cssRes.name}` };
        await writeManifest(manifest);
        console.log('Build complete. New CSS:', cssRes.name);
    } catch (e) {
        console.error('Build failed:', e);
        process.exit(1);
    }
}

main();
