// Convite nativo onde disponível; Apple e navegadores sem convite recebem passos em janela própria.
import { ref } from 'vue';
import { ehAppleMovel, ehApple, orientacaoInstalacao } from './instalacaoOrientacoes.js';
export { ehApple, orientacaoInstalacao };
export const ehIOS = ehAppleMovel;
export const standalone = () => {
  try { return !!window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true; } catch { return false; }
};
export const jaInstalado = ref(standalone());
export const conviteDisponivel = ref(typeof window !== 'undefined' && !!window.__sfInstalar);
if (typeof window !== 'undefined') {
  window.addEventListener('sf:instalar-pronto', () => { conviteDisponivel.value = !!window.__sfInstalar; });
  window.addEventListener('appinstalled', () => { jaInstalado.value = true; });
}
export const instrucoes = () => orientacaoInstalacao().passos.join(' ');
// A prévia só mostra os passos: não oferece um prompt que ela não consegue concluir.
export async function instalarApp({ previa = false } = {}) {
  if (previa) return 'instrucoes';
  const e = typeof window !== 'undefined' && window.__sfInstalar;
  if (!e || typeof e.prompt !== 'function') return 'instrucoes';
  try {
    await e.prompt();
    const r = await e.userChoice;
    if (!r || !['accepted', 'dismissed'].includes(r.outcome)) return 'instrucoes';
    return r.outcome === 'accepted' ? 'aceito' : 'recusado';
  } catch {
    // Convites expirados/rejeitados também precisam dar uma resposta visível ao toque.
    return 'instrucoes';
  } finally {
    window.__sfInstalar = null;
    conviteDisponivel.value = false;
  }
}
