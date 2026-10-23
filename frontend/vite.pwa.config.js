import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const d = (p) => path.join(aqui, 'demo', p);

// PWA local: o MESMO backend (rotas Express via shim) + banco SQLite (sql.js) rodando no navegador,
// mas multi-arquivo (cache offline), com banco em IndexedDB, senha de acesso, backup .sfin e Bacen.
// Base de vite.demo.config.js; entrada própria em demo/pwa/. Gera frontend/dist-pwa.
// Uso: npm run build:pwa   (servir a pasta dist-pwa por HTTPS ou localhost para instalar).
// Caracteres de controle (U+0000-U+001F exceto \t \n \r) e U+FFFD aparecem crus em strings de bibliotecas
// (pdf.js, xlsx). Hospedagens que servem sem charset mostram "negocinhos": trocamos por escapes \uXXXX.
const CONTROLE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd]/g;
const escapar = (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0');
function limparControle() {
  return {
    name: 'sf-limpar-controle',
    apply: 'build',
    generateBundle(_o, pacote) {
      for (const arq of Object.values(pacote)) {
        if (arq.type === 'chunk' && CONTROLE.test(arq.code)) arq.code = arq.code.replace(CONTROLE, escapar);
        CONTROLE.lastIndex = 0;
      }
    },
  };
}

// Versão do build = hash do conteúdo de todos os arquivos (muda só quando o app muda). Vai para o sw.js
// (cache sf-app-<versao>), para window.__SF_BUILD__ (Sobre) e para version.json.
function serviceWorker() {
  return {
    name: 'sf-service-worker',
    apply: 'build',
    writeBundle(opcoes, pacote) {
      const saida = opcoes.dir;
      const nomes = Object.keys(pacote).filter((n) => n !== 'sw.js');
      const arquivos = ['./', './index.html', './manifest.webmanifest', ...nomes.map((n) => './' + n)];
      for (const extra of fs.readdirSync(path.join(saida, 'icons'))) arquivos.push('./icons/' + extra);
      const unicos = [...new Set(arquivos)];
      const h = crypto.createHash('sha1');
      for (const n of [...unicos].sort()) {
        const f = path.join(saida, n);
        if (n !== './' && fs.existsSync(f) && fs.statSync(f).isFile()) h.update(n).update(fs.readFileSync(f));
      }
      const versao = h.digest('hex').slice(0, 10);
      const modelo = fs.readFileSync(path.join(saida, 'sw.js'), 'utf8');
      fs.writeFileSync(path.join(saida, 'sw.js'), modelo.replace('__VERSAO__', versao).replace('__ARQUIVOS__', JSON.stringify(unicos)));
      fs.writeFileSync(path.join(saida, 'version.json'), JSON.stringify({ versao, gerado: BUILD_DATA }) + '\n');
      // GitHub Pages: .nojekyll (serve arquivos como estão) e 404.html (mesma página do app; rotas usam #).
      fs.writeFileSync(path.join(saida, '.nojekyll'), '');
      fs.copyFileSync(path.join(saida, 'index.html'), path.join(saida, '404.html'));
    },
  };
}

const BUILD_DATA = new Date().toISOString();
// Base: './' (relativa, funciona em qualquer subcaminho) ou PAGES_BASE (ex.: /financas/ no GitHub Pages).
const normalizaBase = (b) => { if (!b) return './'; let x = b.startsWith('/') ? b : '/' + b; if (!x.endsWith('/')) x += '/'; return x; };
const BASE = normalizaBase(process.env.PAGES_BASE);

export default defineConfig({
  root: path.join(aqui, 'demo', 'pwa'),
  publicDir: path.join(aqui, 'public-pwa'),
  base: BASE,
  plugins: [vue(), limparControle(), serviceWorker()],
  esbuild: { charset: 'ascii' },
  define: { '__dirname': '"/"', 'process.env.APP_TIMEZONE': 'undefined', 'process.env.DATA_DIR': 'undefined', 'process.env.DESTINO': 'undefined', 'process.env.HOST': 'undefined', 'process.env.PORT': 'undefined', 'process.env.COOKIE_SECURE': 'undefined', 'process.env.JWT_SECRET': 'undefined', 'import.meta.env.VITE_DEMO': 'true', 'import.meta.env.VITE_PWA': 'true', '__SF_BUILD_DATA__': JSON.stringify(BUILD_DATA) },
  resolve: {
    alias: [
      { find: /^express$/, replacement: d('shims/express.cjs') },
      { find: /^better-sqlite3$/, replacement: d('shims/sqlite.cjs') },
      { find: /^\.\/utils\/bancoSqlite$/, replacement: d('shims/sqlite.cjs') },
      { find: /^fs$/, replacement: d('shims/fs.cjs') },
      { find: /^path$/, replacement: d('shims/path.cjs') },
      { find: /^crypto$/, replacement: d('shims/crypto.cjs') },
      { find: /^\.\/config\/destino$/, replacement: d('shims/destino.cjs') },
      { find: /^\.\.\/middleware\/auth$/, replacement: d('stubs/auth-middleware.cjs') },
    ],
  },
  build: {
    outDir: process.env.PWA_OUT_DIR ? path.resolve(process.env.PWA_OUT_DIR) : path.join(aqui, 'dist-pwa'),
    emptyOutDir: true,
    target: 'esnext', // usa top-level await
    chunkSizeWarningLimit: 6000,
    commonjsOptions: {
      include: [/node_modules/, /backend[\\/]src/, /demo[\\/](shims|stubs)/],
      transformMixedEsModules: true,
    },
  },
  server: { fs: { strict: false } },
});
