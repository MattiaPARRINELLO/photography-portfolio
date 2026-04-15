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
    // gzip
    const gz = zlib.gzipSync(Buffer.from(content), { level: zlib.constants.Z_BEST_COMPRESSION });
    await fsp.writeFile(outPath + '.gz', gz);
    // brotli
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

async function updateHtmlReferences(oldName, newName) {
    const root = path.resolve(__dirname, '..');
    const pagesDir = path.join(root, 'pages');
    const files = await fsp.readdir(pagesDir);
    for (const f of files) {
        if (!f.endsWith('.html')) continue;
        const p = path.join(pagesDir, f);
        let txt = await fsp.readFile(p, 'utf-8');
        const replaced = txt.split(oldName).join(newName);
        if (replaced !== txt) {
            await fsp.writeFile(p, replaced, 'utf-8');
            console.log(`Updated ${f}: ${oldName} -> ${newName}`);
        }
    }
}

async function writeManifest(manifest) {
    const root = path.resolve(__dirname, '..');
    const manifestPath = path.join(root, 'dist', 'manifest.json');
    await fsp.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    console.log('Wrote manifest to', manifestPath);
}

async function main() {
    console.log('Building assets: minify + fingerprint + precompress');
    try {
        const cssRes = await buildCss();
        if (!cssRes) return process.exit(0);
        // Update HTML references from output.css to new name
        await updateHtmlReferences('output.css', cssRes.name);
        const manifest = { 'dist/css/output.css': `dist/css/${cssRes.name}` };
        await writeManifest(manifest);
        console.log('Build complete. New CSS:', cssRes.name);
    } catch (e) {
        console.error('Build failed:', e);
        process.exit(1);
    }
}

main();
