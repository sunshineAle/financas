// Reset de demo (Mais). Restaura os dados de exemplo. Não existe rota de seed no servidor, então só funciona
// no navegador (build demo / PWA). Ordem de tentativa:
//  1) evento 'sf:reset-demo' (CustomEvent) — o PWA (services/acesso.js / backup) escuta, limpa o IndexedDB e marca
//     `e.detail.tratado = true` (pode pôr uma Promise em `e.detail.promessa`). Depois a página recarrega.
//  2) window.__SF_CONFIG__.resetarDemo() — gancho opcional, síncrono ou assíncrono.
//  3) globalThis.__BANCO_DEMO.apagarSalvo() — build demo atual (banco em localStorage).
export const resetDisponivel = () => !!(import.meta.env.VITE_DEMO || import.meta.env.VITE_PWA);

export async function resetarDemo() {
  const detail = { tratado: false, promessa: null };
  window.dispatchEvent(new CustomEvent('sf:reset-demo', { detail }));
  if (detail.promessa) await detail.promessa;
  if (!detail.tratado) {
    const gancho = window.__SF_CONFIG__ && window.__SF_CONFIG__.resetarDemo;
    if (typeof gancho === 'function') await gancho();
    else if (globalThis.__BANCO_DEMO && typeof globalThis.__BANCO_DEMO.apagarSalvo === 'function') globalThis.__BANCO_DEMO.apagarSalvo();
    else throw new Error('Não há como restaurar os dados de exemplo neste ambiente.');
  }
  window.location.reload();
}
