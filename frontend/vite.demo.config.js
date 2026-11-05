import { defineConfig } from 'vite';
import { readFileSync as lerArq } from 'node:fs';
// versão que ESTE build entrega (topo do changelog): as Novidades só aparecem para ela, nunca para uma versão ainda não instalada
const VERSAO_APP = (() => { try { return JSON.parse(lerArq(new URL('./public-pwa/changelog.json', import.meta.url), 'utf8'))[0].versao; } catch { return null; } })();
import vue from '@vitejs/plugin-vue';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const d = (p) => path.join(aqui, 'demo', p);

// Gera UM arquivo HTML com o sistema inteiro (telas + backend + banco SQLite
// em JavaScript) que abre com duplo clique, sem servidor.
export default defineConfig({
  root: 'demo',
  base: './',
  plugins: [vue(), viteSingleFile()],
  define: { '__SF_VERSAO_APP__': JSON.stringify(VERSAO_APP), '__dirname': '"/"', 'process.env.APP_TIMEZONE': 'undefined', 'process.env.DATA_DIR': 'undefined', 'process.env.DESTINO': 'undefined', 'process.env.HOST': 'undefined', 'process.env.PORT': 'undefined', 'process.env.COOKIE_SECURE': 'undefined', 'process.env.JWT_SECRET': 'undefined', 'import.meta.env.VITE_DEMO': 'true' },
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
    outDir: '../dist-demo',
    emptyOutDir: true,
    target: 'esnext',
    chunkSizeWarningLimit: 6000,
    commonjsOptions: {
      include: [/node_modules/, /backend[\\/]src/, /demo[\\/](shims|stubs)/],
      transformMixedEsModules: true,
    },
  },
  server: { fs: { strict: false } },
});
