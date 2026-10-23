// Instalação do PWA: usa o convite do navegador (beforeinstallprompt, guardado em window.__sfInstalar pelo index.html)
// e, onde não existe (iPhone/Safari, Firefox), mostra instruções curtas. Esconde tudo se já estiver instalado.
import { ref } from 'vue';

export const standalone = () => {
  try { return !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; } catch { return false; }
};
export const ehIOS = () => {
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

export const jaInstalado = ref(standalone());
export const conviteDisponivel = ref(!!window.__sfInstalar);
if (typeof window !== 'undefined') {
  window.addEventListener('sf:instalar-pronto', () => { conviteDisponivel.value = !!window.__sfInstalar; });
  window.addEventListener('appinstalled', () => { jaInstalado.value = true; });
}

export const instrucoes = () => (ehIOS()
  ? 'No iPhone: toque em Compartilhar e depois em "Adicionar à Tela de Início".'
  : 'Abra o menu do navegador e escolha "Instalar app" (ou Compartilhar → Adicionar à Tela de Início).');

// Devolve 'aceito' | 'recusado' | 'instrucoes'
export async function instalarApp() {
  const e = window.__sfInstalar;
  if (!e) return 'instrucoes';
  e.prompt();
  const r = await e.userChoice.catch(() => ({ outcome: 'recusado' }));
  window.__sfInstalar = null; conviteDisponivel.value = false;
  if (r.outcome === 'accepted') { jaInstalado.value = true; return 'aceito'; }
  return 'recusado';
}
