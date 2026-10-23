// Persistência do banco SQLite do PWA em IndexedDB (substitui o localStorage da demonstração).
// O shim (demo/shims/sqlite.cjs) chama `agendar(produtor)` a cada gravação; aqui há debounce e "flush" ao sair da aba.
import { kvGet, kvSet, kvDel } from '../../src/services/idb.js';

const CHAVE = 'banco:principal';
const MARCA = 'sf:banco:marca'; // existe = este aparelho já gravou um banco (se o IndexedDB vier vazio, o cache foi limpo)

let produtor = null;
let timer = null;
let gravando = Promise.resolve();

async function gravarAgora() {
  if (!produtor) return;
  const p = produtor;
  produtor = null;
  if (timer) { clearTimeout(timer); timer = null; }
  const bytes = p();
  gravando = gravando.then(async () => {
    const ok = await kvSet(CHAVE, bytes);
    if (ok) { try { localStorage.setItem(MARCA, new Date().toISOString()); } catch { /* ignora */ } }
  });
  await gravando;
}

export async function prepararPersistencia() {
  const bytes = await kvGet(CHAVE);
  let marca = null;
  try { marca = localStorage.getItem(MARCA); } catch { /* ignora */ }
  globalThis.__SF_PWA = { bancoSumiu: !bytes && !!marca, primeiraVez: !bytes };
  globalThis.__PERSISTENCIA_BANCO = {
    bytes: bytes && bytes.length ? bytes : null,
    agendar(p) {
      produtor = p;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { gravarAgora(); }, 700);
    },
    flush: gravarAgora,
    // Grava bytes prontos (restauração do "banco completo") descartando qualquer gravação pendente.
    async gravarAgora(bytesNovos) {
      produtor = null;
      if (timer) { clearTimeout(timer); timer = null; }
      await kvSet(CHAVE, bytesNovos);
      try { localStorage.setItem(MARCA, new Date().toISOString()); } catch { /* ignora */ }
    },
    async apagar() {
      produtor = null;
      if (timer) { clearTimeout(timer); timer = null; }
      await kvDel(CHAVE);
      try { localStorage.removeItem(MARCA); } catch { /* ignora */ }
    },
  };
  const sair = () => { gravarAgora(); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') sair(); });
  window.addEventListener('pagehide', sair);
  // Reset de demonstração (disparado pela tela Mais): apaga o banco local e recarrega.
  window.addEventListener('sf:reset-demo', async () => {
    await globalThis.__PERSISTENCIA_BANCO.apagar();
    location.reload();
  });
}
