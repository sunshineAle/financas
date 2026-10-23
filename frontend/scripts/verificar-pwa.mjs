// npm run verificar:pwa [pasta]  — falha se o dist-pwa tiver caracteres de controle/U+FFFD, charset fora do lugar etc.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const pasta = path.resolve(process.argv[2] || path.join(aqui, '..', 'dist-pwa'));
if (!fs.existsSync(pasta)) { console.error('Pasta não existe: ' + pasta); process.exit(2); }

const TEXTO = /\.(html|js|mjs|css|json|webmanifest|svg|txt|map)$/i;
const RUIM = /[\u0000-\u0008\u000b\u000c\u000e-\u001f�]/;
const erros = [];
const andar = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? andar(path.join(d, e.name)) : [path.join(d, e.name)]));

for (const f of andar(pasta)) {
  const rel = path.relative(pasta, f);
  if (!TEXTO.test(f) && path.basename(f) !== '_headers') continue;
  const bytes = fs.readFileSync(f);
  const txt = bytes.toString('utf8');
  if (txt.includes('�')) erros.push(`${rel}: U+FFFD (byte solto/inválido)`);
  const m = RUIM.exec(txt);
  if (m) {
    const i = m.index;
    erros.push(`${rel}: caractere U+${m[0].charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')} na posição ${i}: ${JSON.stringify(txt.slice(Math.max(0, i - 20), i + 20))}`);
  }
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf && /\.html$/.test(f)) erros.push(`${rel}: BOM no início`);
}
for (const h of ['index.html', '404.html']) {
  const f = path.join(pasta, h);
  if (!fs.existsSync(f)) { erros.push(`${h}: não existe`); continue; }
  const t = fs.readFileSync(f, 'utf8');
  const head = t.slice(t.search(/<head[^>]*>/i) + t.match(/<head[^>]*>/i)[0].length);
  if (!/^\s*<meta\s+charset=["']?utf-8["']?\s*\/?>/i.test(head)) erros.push(`${h}: <meta charset="utf-8"> precisa ser o primeiro item do <head>`);
}
for (const n of ['sw.js', 'manifest.webmanifest', 'version.json', '.nojekyll']) if (!fs.existsSync(path.join(pasta, n))) erros.push(`${n}: não existe`);

if (erros.length) { console.error('verificar:pwa FALHOU\n - ' + erros.join('\n - ')); process.exit(1); }
console.log('verificar:pwa OK — ' + pasta);
