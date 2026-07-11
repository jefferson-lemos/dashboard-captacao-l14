/**
 * Monta o dashboard final: injeta os dados agregados e a logo
 * dentro do template e grava dist/index.html (arquivo único, sem dependências).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const template = fs.readFileSync(path.join(ROOT, 'src', 'template.html'), 'utf8');
const data = fs.readFileSync(path.join(ROOT, 'data', 'data.json'), 'utf8');
const logo = fs.readFileSync(path.join(ROOT, 'assets', 'etek-img.png'));

const parsed = JSON.parse(data); // valida o JSON antes de injetar
// "</" vira "<\/" para o JSON nunca fechar a tag <script> sem querer
const safeJson = JSON.stringify(parsed).replace(/</g, '\\u003c');

const html = template
  .replace('/*__DATA_JSON__*/ null', safeJson)
  .replace('__LOGO_DATA_URI__', 'data:image/png;base64,' + logo.toString('base64'));

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'dist', 'index.html'), html);
console.log(`OK: dist/index.html gerado (${(html.length / 1024).toFixed(0)} KB, ${parsed.total} leads${parsed.sampleData ? ', dados de exemplo' : ''}).`);
