// Arrastar para baixo fecha a janela (30/10, pedido do usuário): vale para as folhas que sobem da base no celular
// (Modal, SeletorPopup). Começa em qualquer ponto da folha, desde que a parte tocada não esteja rolada para baixo
// (aí o gesto rola o conteúdo, como sempre). Soltar depois de ~25% da altura (ou com um puxão rápido) fecha;
// antes disso, a folha volta ao lugar. Controles que usam o arraste (barras, linhas arrastáveis) ficam de fora.
import { watch, onBeforeUnmount } from 'vue';

const ehCelular = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;

export function useArrastarParaFechar(caixaRef, fechar) {
  let el = null, ini = null, dy = 0, arrastando = false;

  function rolado(alvo) {
    for (let n = alvo; n && n !== el.parentElement; n = n.parentElement) {
      if (n.scrollTop > 0 && n.scrollHeight > n.clientHeight + 1) return true;
    }
    return false;
  }
  function excluido(alvo) {
    return alvo.closest?.('input[type=range], textarea, [data-sem-arraste], .linha-tx-envoltorio.arrastavel, .rel-mensal, .barras-mes');
  }
  function inicio(e) {
    ini = null;
    if (!ehCelular() || e.touches.length !== 1 || excluido(e.target) || rolado(e.target)) return;
    const t = e.touches[0];
    ini = { x: t.clientX, y: t.clientY, t: Date.now() }; dy = 0; arrastando = false;
  }
  function mover(e) {
    if (!ini) return;
    const t = e.touches[0];
    const ddy = t.clientY - ini.y, ddx = t.clientX - ini.x;
    if (!arrastando) {
      if (Math.abs(ddy) < 8 && Math.abs(ddx) < 8) return;
      if (ddy <= 0 || Math.abs(ddx) > ddy) { ini = null; return; }
      arrastando = true; el.style.transition = 'none';
      document.activeElement?.blur?.();
    }
    if (e.cancelable) e.preventDefault();
    dy = Math.max(0, ddy);
    el.style.transform = `translateY(${dy}px)`;
  }
  function fim() {
    if (!ini) return;
    const vel = dy / Math.max(1, Date.now() - ini.t);
    const deveFechar = arrastando && (dy > Math.min(160, el.offsetHeight * 0.25) || (vel > 0.5 && dy > 40));
    const estava = arrastando;
    ini = null; arrastando = false;
    if (!estava) return;
    el.style.transition = 'transform 0.2s ease';
    if (deveFechar) { el.style.transform = 'translateY(100%)'; fechar(); }
    else { el.style.transform = ''; setTimeout(() => { if (el) el.style.transition = ''; }, 220); }
  }
  function ligar(novo) {
    if (el) { el.removeEventListener('touchstart', inicio); el.removeEventListener('touchmove', mover); el.removeEventListener('touchend', fim); el.removeEventListener('touchcancel', fim); }
    el = novo || null;
    if (el) {
      el.style.transform = ''; el.style.transition = '';
      el.addEventListener('touchstart', inicio, { passive: true });
      el.addEventListener('touchmove', mover, { passive: false });
      el.addEventListener('touchend', fim); el.addEventListener('touchcancel', fim);
    }
  }
  watch(caixaRef, ligar, { flush: 'post' });
  onBeforeUnmount(() => ligar(null));
}
