<script setup>
// Orbe em degradê (REF-01) como ESFERA DE VIDRO: cores das partes se fundindo com cor intermediária, reflexo, aro e profundidade (mais clara embaixo,
// sombra suave sob ela) e, por fora, um arco fino por parte, com afastamento entre eles: os arcos NÃO se
// encontram e as pontas esmaecem em transparência até o fundo. O percentual fica escrito do lado de fora,
// ao lado de cada arco. NÃO há valor dentro da esfera (o valor vai acima do orbe, escrito pela tela).
// Ao carregar, a esfera gira devagar e vai assentando até as proporções certas, e os arcos se desenham.
//   <Orbe :partes="[{ nome, valor, cor }]" :tamanho="360" />   (tamanho = largura máxima; ocupa 100% do espaço)
// O slot padrão ainda existe (retrocompatível) mas o desenho novo não usa: deixe vazio.
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';

const props = defineProps({
  partes: { type: Array, required: true }, // [{ nome, valor, cor }]  (cor: qualquer cor CSS, inclusive var(--x))
  tamanho: { type: Number, default: 230 }, // largura máxima em px
  arcos: { type: Boolean, default: true }, // false = só a esfera, ocupando todo o espaço (ex.: Login)
  girar: { type: Boolean, default: false }, // gira devagar o tempo todo (decorativo)
});

const total = computed(() => props.partes.reduce((s, p) => s + Math.max(0, p.valor), 0));
const alvo = computed(() => props.partes.map((p) => (total.value > 0 ? Math.max(0, p.valor) / total.value : 1 / props.partes.length)));

const progresso = ref(0); // 0 → 1
let raf = null;
let inicio = 0;
let duracao = 1500;
function animar(ts) {
  if (!inicio) inicio = ts;
  const t = Math.min(1, (ts - inicio) / duracao);
  progresso.value = 1 - Math.pow(1 - t, 3); // desacelera no final, sem quique
  if (t < 1) raf = requestAnimationFrame(animar);
}
function disparar() {
  cancelAnimationFrame(raf);
  const lenta = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--anim-lenta')) || 0;
  if (lenta === 0) { progresso.value = 1; return; }
  duracao = 1500;
  inicio = 0;
  progresso.value = 0;
  raf = requestAnimationFrame(animar);
}
onMounted(disparar);
watch(() => props.partes.map((p) => p.valor).join('|'), disparar);
onBeforeUnmount(() => cancelAnimationFrame(raf));

// Frações em curso: partem de partes iguais e chegam às reais
const fracoes = computed(() => {
  const n = props.partes.length;
  return alvo.value.map((a) => (1 / n) * (1 - progresso.value) + a * progresso.value);
});
const giro = computed(() => (1 - progresso.value) * 220 - 20);

// Esfera: gradiente cônico com interpolação suave (oklab). Cada parte "segura" a sua cor perto do centro da
// sua fatia e, nas fronteiras, entra uma cor intermediária (mistura 50/50), de modo que a passagem é longa e
// sem degrau. A cor média no centro apaga o ponto de encontro das fatias (nada de "pizza").
const mistura = computed(() => {
  const n = props.partes.length;
  const cores = props.partes.map((p) => p.cor);
  if (n === 1) return cores[0];
  const mix = (a, b) => `color-mix(in oklab, ${a}, ${b})`;
  const stops = [];
  let acc = 0;
  const fim = [];
  fracoes.value.forEach((f, i) => {
    const ini = acc * 360;
    acc += f;
    const fatia = f * 360;
    const meio = ini + fatia / 2;
    const seg = Math.min(fatia * 0.2, 28); // trecho de cor "pura"
    stops.push(`${cores[i]} ${(meio - seg).toFixed(2)}deg`, `${cores[i]} ${(meio + seg).toFixed(2)}deg`);
    const prox = cores[(i + 1) % n];
    fim.push(`${mix(cores[i], prox)} ${(acc * 360).toFixed(2)}deg`);
  });
  // intercala as fronteiras (cor intermediária) com os trechos puros, em ordem de ângulo
  const lista = [];
  const bord = fim.slice(0, -1);
  for (let i = 0; i < n; i++) {
    lista.push(stops[i * 2], stops[i * 2 + 1]);
    if (i < n - 1) lista.push(bord[i]);
  }
  const fronteira0 = mix(cores[n - 1], cores[0]);
  return `conic-gradient(in oklab from ${giro.value}deg, ${fronteira0} 0deg, ${lista.join(', ')}, ${fronteira0} 360deg)`;
});
const corMedia = computed(() => {
  const n = props.partes.length;
  if (n === 1) return props.partes[0].cor;
  const itens = props.partes.map((p, i) => `${p.cor} ${(Math.max(fracoes.value[i], 0.04) * 100).toFixed(1)}%`);
  return `color-mix(in oklab, ${itens.join(', ')})`;
});

// Arcos externos: cada parte ocupa sua fatia do círculo menos um afastamento; as pontas esmaecem
const AFASTAMENTO = 18; // graus livres entre um arco e o seguinte
const R_LABEL = 41.2; // raio (em % do orbe) onde fica o percentual
const listaArcos = computed(() => {
  const n = props.partes.length;
  let acc = 0;
  return fracoes.value.map((f, i) => {
    const ini = acc * 360;
    const fatia = f * 360;
    acc += f;
    const folga = n > 1 ? AFASTAMENTO : 10;
    const comp = Math.max(0, (fatia - folga) * progresso.value);
    const desvanece = Math.min(comp * 0.32, 34);
    const cor = props.partes[i].cor;
    const zero = `color-mix(in srgb, ${cor} 0%, transparent)`;
    const grad = comp > 0.5
      ? `conic-gradient(from ${(ini + folga / 2).toFixed(2)}deg, ${zero} 0deg, ${cor} ${desvanece.toFixed(2)}deg, ${cor} ${(comp - desvanece).toFixed(2)}deg, ${zero} ${comp.toFixed(2)}deg, ${zero} 360deg)`
      : 'none';
    const meio = ((ini + fatia / 2) * Math.PI) / 180;
    return {
      cor,
      grad,
      pct: Math.round(alvo.value[i] * 100),
      x: 50 + Math.sin(meio) * R_LABEL,
      y: 50 - Math.cos(meio) * R_LABEL,
      sx: Math.sin(meio).toFixed(3),
      cy: Math.cos(meio).toFixed(3),
    };
  });
});
</script>

<template>
  <div class="orbe" :class="{ 'sem-arcos': !arcos, girando: girar }" :style="{ maxWidth: tamanho + 'px' }" role="img" :aria-label="'Distribuição: ' + partes.map((p, i) => `${p.nome} ${listaArcos[i].pct}%`).join(', ')">
    <div class="chao" aria-hidden="true"></div>
    <div class="esfera" aria-hidden="true">
      <div class="mistura" :style="{ background: mistura, filter: `blur(${partes.length > 2 ? 30 : 20}px) saturate(1.25)` }"></div>
      <div class="nucleo" :style="{ background: `radial-gradient(circle at 38% 34%, color-mix(in srgb, ${corMedia} 78%, white) 0%, ${corMedia} 45%, color-mix(in srgb, ${corMedia} 74%, black) 100%)` }"></div>
      <div class="volume"></div>
      <div class="luz-baixo"></div>
      <div class="reflexo"></div>
      <div class="reflexo-menor"></div>
      <div class="aro"></div>
    </div>
    <template v-if="arcos"><div v-for="(a, i) in listaArcos" :key="'a' + i" class="arco" :style="{ backgroundImage: a.grad }" aria-hidden="true"></div>
    <span v-for="(a, i) in listaArcos" :key="'t' + i" class="pct" :style="{ left: a.x + '%', top: a.y + '%', '--sx': a.sx, '--cy': a.cy, opacity: progresso }" aria-hidden="true">
      <i :style="{ background: a.cor }"></i>{{ a.pct }}%
    </span></template>
    <div v-if="$slots.default" class="centro"><slot /></div>
  </div>
</template>

<style scoped>
.sem-arcos .esfera { inset: 0; }
.sem-arcos .chao { left: 14%; right: 14%; top: 96%; height: 9%; }
.girando .mistura { animation: gira-orbe 26s linear infinite; }
@keyframes gira-orbe { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { html:not([data-reduzir-movimento='0']) .girando .mistura { animation: none; } }
:global(html[data-reduzir-movimento='1']) .girando .mistura { animation: none; }
.orbe { position: relative; width: 100%; aspect-ratio: 1; margin-inline: auto; flex-shrink: 0; container-type: inline-size; }

/* sombra suave sob a esfera: dá peso de objeto */
.chao {
  position: absolute; left: 23%; right: 23%; top: 78%; height: 9%;
  background: radial-gradient(closest-side, rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0));
  filter: blur(7px);
}
:root[data-theme='light'] .chao { background: radial-gradient(closest-side, rgba(19, 23, 38, 0.32), rgba(19, 23, 38, 0)); }

.esfera {
  position: absolute; inset: 18%; border-radius: 50%; overflow: hidden;
  background: var(--cor-fundo-elevado);
  box-shadow: 0 22px 30px -18px rgba(0, 0, 0, 0.55);
}
.mistura { position: absolute; inset: -22%; filter: blur(20px) saturate(1.25); }
/* cor média no centro: apaga o ponto onde as fatias se encontram */
.nucleo { position: absolute; inset: 6%; border-radius: 50%; filter: blur(14px); opacity: 0.65; }
/* volume: bordas mais fundas, miolo translúcido como vidro cheio */
.volume {
  position: absolute; inset: 0; border-radius: 50%;
  background:
    radial-gradient(circle at 32% 26%, rgba(255, 255, 255, 0.34) 0%, rgba(255, 255, 255, 0) 46%),
    radial-gradient(circle at 50% 46%, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0) 50%, rgba(8, 12, 30, 0.34) 100%),
    linear-gradient(200deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0) 40%, rgba(8, 12, 30, 0.2) 100%);
}
/* luz que atravessa o vidro e acumula embaixo (cáustica) — v2: bem mais discreta; a base fica na sombra interna */
.luz-baixo {
  position: absolute; left: 14%; right: 14%; bottom: 3%; height: 38%; border-radius: 50%;
  background: radial-gradient(closest-side, rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0));
  filter: blur(8px); mix-blend-mode: soft-light;
}
/* reflexo principal: janela de luz curva no alto à esquerda */
.reflexo {
  position: absolute; left: 13%; top: 6%; width: 56%; height: 34%; border-radius: 50% 50% 46% 54% / 62% 62% 38% 38%;
  background: linear-gradient(176deg, rgba(255, 255, 255, 0.7), rgba(255, 255, 255, 0.12) 70%, rgba(255, 255, 255, 0));
  transform: rotate(-16deg); filter: blur(1.5px); opacity: 0.62;
}
.reflexo-menor {
  position: absolute; right: 15%; bottom: 14%; width: 22%; height: 10%; border-radius: 50%;
  background: radial-gradient(closest-side, rgba(255, 255, 255, 0.5), rgba(255, 255, 255, 0));
  transform: rotate(-38deg); filter: blur(2px);
}
/* aro de vidro: fio de luz na borda e brilho interno embaixo */
.aro {
  position: absolute; inset: 0; border-radius: 50%; pointer-events: none;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.28), inset 0 -16px 24px -8px rgba(8, 12, 30, 0.42), inset 10px 10px 18px -10px rgba(255, 255, 255, 0.35), inset 0 0 26px rgba(8, 12, 30, 0.16);
}

/* arcos finos por fora: conic-gradient com pontas transparentes, recortado em anel */
.arco {
  position: absolute; inset: 10%; border-radius: 50%;
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2.5px));
  mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2.5px));
}

.pct {
  position: absolute; transform: translate(calc(-50% + var(--sx) * 50%), calc(-50% - var(--cy) * 50%)); display: inline-flex; align-items: center; gap: 5px;
  font-family: var(--fonte-texto); font-size: clamp(11px, 3.6cqw, 14px); font-weight: 700; color: var(--cor-texto);
  font-variant-numeric: tabular-nums; white-space: nowrap;
}
.pct i { width: 6px; height: 6px; border-radius: 50%; flex: none; }

.centro { position: absolute; inset: 18%; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: #fff; text-shadow: 0 1px 8px rgba(0, 0, 0, 0.45); pointer-events: none; padding: 8px; font-size: 12px; }
</style>
