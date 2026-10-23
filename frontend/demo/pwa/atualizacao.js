// Registro do service worker + aviso "Nova versão disponível — atualizar" (skipWaiting controlado).
// Fora de views: o aviso é um elemento simples no rodapé, com as cores por tokens do app.
const ESTILO = 'position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:99999;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-radius:14px;background:var(--cor-card,#fff);color:var(--cor-texto,#1a1a1a);border:1px solid var(--cor-borda,#ddd);box-shadow:0 8px 28px rgba(0,0,0,.28);font:500 14px/1.3 var(--fonte-texto,system-ui,sans-serif);max-width:520px;margin:0 auto';
const BOTAO = 'min-height:40px;padding:0 16px;border:none;border-radius:10px;background:var(--cor-interface,#3446c4);color:#fff;font:600 14px var(--fonte-texto,system-ui,sans-serif);cursor:pointer';

function mostrarAviso(worker) {
  if (document.getElementById('sf-aviso-versao')) return;
  const caixa = document.createElement('div');
  caixa.id = 'sf-aviso-versao';
  caixa.setAttribute('role', 'status');
  caixa.style.cssText = ESTILO;
  const texto = document.createElement('span');
  texto.textContent = 'Nova versão disponível';
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.textContent = 'Atualizar';
  botao.style.cssText = BOTAO;
  botao.addEventListener('click', () => { botao.disabled = true; worker.postMessage({ tipo: 'sf:pular-espera' }); });
  caixa.append(texto, botao);
  document.body.appendChild(caixa);
}

export function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  let recarregando = false;
  const tinhaControle = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!tinhaControle || recarregando) return; // primeira instalação não recarrega
    recarregando = true;
    location.reload();
  });
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) mostrarAviso(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const novo = reg.installing;
      if (!novo) return;
      novo.addEventListener('statechange', () => {
        if (novo.state === 'installed' && navigator.serviceWorker.controller) mostrarAviso(novo);
      });
    });
    // Procura versão nova ao abrir e ao voltar para o app.
    const procurar = () => { reg.update().catch(() => {}); };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') procurar(); });
    setInterval(procurar, 60 * 60 * 1000);
  }).catch(() => { /* sem service worker: segue online */ });
}
