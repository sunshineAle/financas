// Tela de acesso antes do app: o app de verdade só é carregado depois de desbloquear.
// Transição login -> Início (anotação 34): a esfera do login é copiada para uma camada fixa e, ENQUANTO o app carrega por baixo,
// cresce e sobe até o lugar do orbe principal, com fusão de cores e os anéis girando; some em até ~600 ms. Não atrasa nada:
// o resolve() acontece antes da animação. Com "reduzir movimento", não há animação.
import { createApp } from 'vue';
import Acesso from '../../src/views/Acesso.vue';
import '../../src/styles/tokens.css';

const reduzir = () => {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.reduzirMovimento === '1'; } catch { return true; }
};

function transicao(info) {
  if (!info || !info.rect || !info.html || reduzir() || !document.body.animate) return;
  const { x, y, w, h } = info.rect;
  const camada = document.createElement('div');
  camada.setAttribute('aria-hidden', 'true');
  camada.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:${w}px;height:${h}px;z-index:9999;pointer-events:none;will-change:transform,opacity,filter`;
  camada.innerHTML = info.html;
  document.body.appendChild(camada);
  // Destino aproximado: o orbe grande do topo do Início (centro da coluna de conteúdo, perto do topo).
  const larguraConteudo = innerWidth >= 900 ? innerWidth - 220 : innerWidth;
  const cx = (innerWidth - larguraConteudo) + larguraConteudo / 2;
  const cy = Math.min(innerHeight * 0.3, 260);
  const alvo = Math.min(larguraConteudo * 0.62, 300);
  const dx = cx - (x + w / 2);
  const dy = cy - (y + h / 2);
  const s = alvo / Math.max(1, w);
  const anim = camada.animate([
    { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1, filter: 'saturate(1) hue-rotate(0deg) blur(0)' },
    { transform: `translate(${dx * 0.7}px,${dy * 0.7}px) scale(${1 + (s - 1) * 0.7}) rotate(-50deg)`, opacity: 0.9, filter: 'saturate(1.25) hue-rotate(-18deg) blur(0)', offset: 0.6 },
    { transform: `translate(${dx}px,${dy}px) scale(${s * 1.08}) rotate(-80deg)`, opacity: 0, filter: 'saturate(1.4) hue-rotate(-30deg) blur(6px)' },
  ], { duration: 600, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'forwards' });
  const arcos = camada.querySelector('.giro-arcos');
  if (arcos) arcos.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(240deg)' }], { duration: 600, easing: 'ease-out', fill: 'forwards' });
  const tirar = () => camada.remove();
  anim.onfinish = tirar;
  setTimeout(tirar, 900);
}

export function mostrarAcesso() {
  return new Promise((resolve) => {
    const app = createApp(Acesso, {
      onLiberado: (info) => { app.unmount(); transicao(info); resolve(); },
    });
    app.mount('#app');
  });
}
