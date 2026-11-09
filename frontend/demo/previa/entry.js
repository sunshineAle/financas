import './isolamento.js';
window.__SF_ABRIR_DEMO = () => {
  const url = new URL(location.href); url.searchParams.set('modo', 'demo'); url.hash = '';
  location.assign(url);
};
const exemplo = document.querySelector('#exemplo-previa');
exemplo.textContent = window.__SF_MODO_DEMO ? 'Voltar ao acesso / restaurar backup' : 'Testar com dados fictícios';
exemplo.onclick = () => {
  if (window.__SF_MODO_DEMO) { const url = new URL(location.href); url.searchParams.delete('modo'); url.hash = ''; location.assign(url); }
  else window.__SF_ABRIR_DEMO();
};
document.querySelector('#reiniciar-previa').onclick = () => window.__SF_REINICIAR_PREVIA();
await import('../pwa/entry.js');
