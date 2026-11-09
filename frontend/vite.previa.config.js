import { defineConfig, mergeConfig } from 'vite';
import pwa from './vite.pwa.config.js';
import path from 'node:path';
// A prévia usa arquivos separados: importar o app antes de desbloquear contornaria a tela de acesso.
const base = { ...pwa, plugins: pwa.plugins.filter(p => p.name !== 'sf-service-worker') };
export default mergeConfig(base, defineConfig({
  root: path.resolve('demo/previa'),
  define: { 'import.meta.env.VITE_PREVIA': 'true' },
  build: { outDir: path.resolve('dist-previa') },
}));
