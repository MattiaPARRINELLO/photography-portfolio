#!/usr/bin/env node
/* Génère les tracés SVG du nom affiché dans le H1 de l'accueil, à partir du
   fichier de police local (Switzer 600). Aucun accès réseau : passer le chemin
   du .ttf en argument.

   Usage : node scripts/generate-name-glyphs.js /chemin/switzer-600.ttf

   Produit dist/js/name-glyphs.js, chargé avant home-sheet.js. Les positions
   sont calculées ici (avances + crénage) pour que le client n'ait aucune
   métrique de police à reproduire. */
'use strict';

const fs = require('fs');
const path = require('path');
const opentype = require('opentype.js');

const NAME = 'Mattia Parrinello';
// letter-spacing du H1 (.cs-title) : -0.045em. Le SVG doit le respecter, sinon
// le nom rendu est plus large que le texte qu'il remplace.
const LETTER_SPACING_EM = -0.045;
// Lettres conservées, en indices dans NAME : M de Mattia, puis P, r, n, l.
const KEPT = [0, 7, 9, 12, 14];

const ttf = process.argv[2];
if (!ttf || !fs.existsSync(ttf)) {
    console.error('Indique le chemin du fichier .ttf Switzer 600.');
    process.exit(1);
}

const font = opentype.loadSync(ttf);
const upm = font.unitsPerEm;

function pathData(char) {
    return font.charToGlyph(char).getPath(0, 0, upm).toPathData(2);
}

const spacing = LETTER_SPACING_EM * upm;

function layout(chars) {
    let x = 0;
    const items = [];
    for (let i = 0; i < chars.length; i++) {
        const glyph = font.charToGlyph(chars[i]);
        items.push({ c: chars[i], x: Math.round(x) });
        x += glyph.advanceWidth + spacing;
        if (i + 1 < chars.length) {
            x += font.getKerningValue(glyph, font.charToGlyph(chars[i + 1]));
        }
    }
    return { width: Math.round(x), items };
}

const openChars = NAME.split('');
const keptChars = KEPT.map(i => NAME[i]);
const closedChars = keptChars.map(c => c.toUpperCase());

const glyphNames = new Set(openChars.concat(closedChars));
const glyphs = {};
glyphNames.forEach(c => { glyphs[c] = pathData(c); });

const data = {
    unitsPerEm: upm,
    ascender: font.ascender,
    descender: font.descender,
    name: NAME,
    kept: KEPT,
    open: layout(openChars),
    closed: layout(closedChars),
    glyphs
};

const outDir = path.join(__dirname, '..', 'dist', 'js');
fs.writeFileSync(
    path.join(outDir, 'name-glyphs.js'),
    '/* Généré par scripts/generate-name-glyphs.js — ne pas modifier à la main. */\n' +
        'window.CS_NAME_GLYPHS = ' + JSON.stringify(data) + ';\n'
);

console.log(
    'name-glyphs.js : ' + glyphNames.size + ' tracés, largeur ouverte ' +
        data.open.width + ', fermée ' + data.closed.width + ', unités ' + upm
);
