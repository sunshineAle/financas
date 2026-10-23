// npm run build:pages — build do PWA com base /financas/ (GitHub Pages), verificação e cópia para ../docs
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const front = path.join(aqui, '..');
const out = path.resolve(process.env.PWA_OUT_DIR || path.join(front, 'dist-pwa'));
const docs = path.resolve(process.env.DOCS_DIR || path.join(front, '..', 'docs'));
const env = { ...process.env, PAGES_BASE: process.env.PAGES_BASE || '/financas/', PWA_OUT_DIR: out };
const rodar = (args) => { const r = spawnSync(process.execPath, args, { cwd: front, env, stdio: 'inherit' }); if (r.status !== 0) process.exit(r.status || 1); };

rodar([path.join(front, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '-c', 'vite.pwa.config.js']);
rodar([path.join(aqui, 'verificar-pwa.mjs'), out]);
fs.rmSync(docs, { recursive: true, force: true });
fs.cpSync(out, docs, { recursive: true });
console.log('docs/ atualizado: ' + docs);
