const fs = require('fs');
const path = require('path');
const postcss = require('postcss');
// Tailwind v4 exposes a separate PostCSS plugin package
const tailwindPostcss = require('@tailwindcss/postcss');
const autoprefixer = require('autoprefixer');

(async () => {
  const inPath = path.resolve(__dirname, '..', 'src', 'input.css');
  const outPath = path.resolve(__dirname, '..', 'dist', 'css', 'output.css');

  let input;
  try {
    input = fs.readFileSync(inPath, 'utf8');
  } catch (e) {
    console.error('Impossible de lire', inPath, e.message);
    process.exit(2);
  }

  try {
    const result = await postcss([
      tailwindPostcss({ content: ['./pages/**/*.html', './server/**/*.js', './src/**/*.*'] }),
      autoprefixer()
    ]).process(input, { from: inPath, to: outPath });

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, result.css, 'utf8');
    console.log('✅ CSS généré:', outPath);
  } catch (err) {
    console.error('❌ Erreur lors de la génération du CSS:', err);
    process.exit(1);
  }
})();
