// Privacidade ao sair do app (anotações 46 e 59). A camada opaca (#sf-privacidade) e os eventos ficam no index.html do PWA,
// para valer desde o primeiro instante (antes do app carregar) e aparecer na hora: blur da janela, aba escondida, pagehide e
// freeze. Aqui só há o mesmo comportamento para builds sem esse HTML (web/demo) e os atalhos cobrir()/descobrir().
// Limite: em PWA o Android pode tirar a miniatura antes; a garantia total fica para a versão de loja (FLAG_SECURE).
const h = () => document.documentElement;
export function cobrir() { if (typeof document !== 'undefined') h().classList.add('sf-oculto'); }
export function descobrir() { if (typeof document !== 'undefined' && document.visibilityState !== 'hidden') h().classList.remove('sf-oculto'); }
let ligado = false;
export function iniciarDesfoque() {
  if (ligado || typeof document === 'undefined') return;
  ligado = true;
  if (window.__sfPrivacidade) return; // o index.html do PWA já cuida de tudo
  if (!document.getElementById('sf-privacidade')) {
    const c = document.createElement('div');
    c.id = 'sf-privacidade'; c.setAttribute('aria-hidden', 'true');
    c.style.cssText = 'position:fixed;inset:0;z-index:2147483646;display:none;align-items:center;justify-content:center;background:var(--cor-fundo,#141413)';
    document.body.appendChild(c);
    const st = document.createElement('style'); st.textContent = 'html.sf-oculto #sf-privacidade{display:flex!important}'; document.head.appendChild(st);
  }
  window.addEventListener('blur', cobrir); window.addEventListener('focus', descobrir);
  window.addEventListener('pagehide', cobrir); window.addEventListener('pageshow', descobrir);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') cobrir(); else descobrir(); });
  document.addEventListener('freeze', cobrir); document.addEventListener('resume', descobrir);
}
