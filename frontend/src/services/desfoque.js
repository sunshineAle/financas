// Desfoque ao sair do app (anotação 46): quando o app vai para segundo plano (trocar de app, de aba, minimizar), cobre a tela
// com uma camada opaca e desfocada, para a miniatura de "apps recentes" não mostrar valores. Some ao voltar.
// Limite: em PWA o sistema às vezes tira a miniatura antes; a garantia total fica para a versão de loja (FLAG_SECURE).
let camada = null;
function criar() {
  if (camada || typeof document === 'undefined') return camada;
  camada = document.createElement('div');
  camada.id = 'sf-desfoque';
  camada.setAttribute('aria-hidden', 'true');
  camada.style.cssText = 'position:fixed;inset:0;z-index:2147483646;display:none;align-items:center;justify-content:center;'
    + 'background:color-mix(in srgb, var(--cor-fundo, #111) 88%, transparent);-webkit-backdrop-filter:blur(28px) saturate(.6);backdrop-filter:blur(28px) saturate(.6)';
  camada.innerHTML = '<span style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#5e18d8,#1597a8);opacity:.85;box-shadow:0 10px 30px rgba(48,14,120,.35)"></span>';
  document.body.appendChild(camada);
  return camada;
}
export function cobrir() { const c = criar(); if (c) c.style.display = 'flex'; }
export function descobrir() { if (camada) camada.style.display = 'none'; }
let ligado = false;
export function iniciarDesfoque() {
  if (ligado || typeof document === 'undefined') return;
  ligado = true;
  criar();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') cobrir(); else descobrir(); });
  window.addEventListener('pagehide', cobrir);
  window.addEventListener('pageshow', descobrir);
  window.addEventListener('focus', descobrir);
}
