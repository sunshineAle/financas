<script setup>
// Carrossel de cards (Contas e Cartões e Crédito).
//  - Arrastar para o lado (dedo OU mouse) troca de card; pontinhos clicáveis; setas do teclado nos pontinhos.
//  - Fim do carrossel: botão FINO "+" como ÚLTIMO ITEM do trilho (à direita, mesma altura do card, só o "+", aparece ao rolar)
//    e, arrastando além do último card, o trilho estica (efeito elástico/chicote) e emite 'novo' ao soltar (o pai abre o cadastro).
//  - Visão EMPILHADA = lista de blocos inteiros, um embaixo do outro, SEM botão para alternar: arrastar um card
//    PARA BAIXO (dedo ou mouse) entra na lista; tocar num bloco volta ao carrossel com ele selecionado;
//    arrastar para CIMA também volta. O gesto só vale quando começa em cima de um card.
//  - Marcado com data-sem-deslizar: deslizar aqui NÃO troca de mês (v-deslizar-mes).
//
// Toque longo (~0,5 s) sobre um card (prop `reordenavel`): o card "levanta" e treme (vibração leve), arrasta-se para a nova posição
// (no carrossel: para os lados; na lista empilhada: para cima/baixo) e, ao soltar, emite `reordenar` com { de, para }.
// O pai grava a ordem (services/ordem.js). Mexer o dedo antes de 0,5 s cancela o toque longo (vira arrasto normal).
//
//   <Carrossel :itens="cartoes" v-model:indice="sel" v-model:empilhado="pilha" :chave="(c) => c.id" temNovo @novo="abrirNovo">
//     <template #item="{ item, selecionado }"> ...face do card... </template>
//     <template #total> ...total no topo da lista (aparece só na visão empilhada)... </template>   (opcional)
//   </Carrossel>
// `largura` (px, % ou min()) = largura de cada card; `larguraMax` limita (tela grande NÃO aumenta o card: lado a lado, com arraste).
// Padrão do celular: preenche a largura deixando aparecer a ponta do próximo. O slot #novo foi aposentado (ignorado).
// `alturaPilha` é mantida só por compatibilidade (não é mais usada: os blocos aparecem inteiros).
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { Plus } from 'lucide-vue-next';

const props = defineProps({
  itens: { type: Array, required: true },
  indice: { type: Number, default: 0 },
  empilhado: { type: Boolean, default: false },
  chave: { type: Function, default: (x, i) => i },
  largura: { type: String, default: 'calc(100% - 40px)' },
  larguraMax: { type: String, default: '380px' },
  alturaPilha: { type: Number, default: 78 },
  temNovo: { type: Boolean, default: false },
  rotuloNovo: { type: String, default: 'Adicionar' },
  reordenavel: { type: Boolean, default: false },
});
const emit = defineEmits(['update:indice', 'update:empilhado', 'novo', 'reordenar']);

const trilho = ref(null);
const arrastando = ref(false);
const chicote = ref(false);
const reordenando = ref(false);
const puxe = ref(0); // 0..1 intensidade do esticão no fim (para o botão "+")

const slots = () => (trilho.value ? [...trilho.value.querySelectorAll(':scope > .slot')] : []);
function alvoDe(i) {
  const t = trilho.value, el = slots()[i];
  if (!t || !el) return 0;
  const max = t.scrollWidth - t.clientWidth;
  return Math.max(0, Math.min(max, el.offsetLeft - (t.clientWidth - el.clientWidth) / 2));
}
function maisProximo(pos = trilho.value ? trilho.value.scrollLeft : 0) {
  let melhor = 0, dist = Infinity;
  slots().forEach((_, i) => { const d = Math.abs(alvoDe(i) - pos); if (d < dist) { dist = d; melhor = i; } });
  return melhor;
}

let raf = 0;
function animarPara(destino, dur = 340) {
  const t = trilho.value;
  cancelAnimationFrame(raf);
  if (!t) return;
  const de = t.scrollLeft, delta = destino - de;
  if (Math.abs(delta) < 1 || dur <= 0) { t.scrollLeft = destino; return; }
  const t0 = performance.now();
  const passo = (agora) => {
    const p = Math.min(1, (agora - t0) / dur);
    t.scrollLeft = de + delta * (1 - Math.pow(1 - p, 3));
    if (p < 1) raf = requestAnimationFrame(passo);
  };
  raf = requestAnimationFrame(passo);
}
const reduzido = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
function centralizar(i, suave = true) { animarPara(alvoDe(i), suave && !reduzido() ? 340 : 0); }

// Rolagem nativa (roda do mouse, trackpad, teclado) também atualiza o índice
function aoRolar() {
  if (props.empilhado || !trilho.value) return;
  const m = maisProximo();
  if (m !== props.indice && m < props.itens.length) emit('update:indice', m);
}
// O pai mudou o índice (ex.: cadastrou um novo): só rola se o trilho ainda não está lá (evita brigar com o arrasto)
watch(() => props.indice, (i) => { if (!props.empilhado && !arrastando.value && maisProximo() !== i) centralizar(i); });
watch(() => props.empilhado, async (v) => { if (!v) { await nextTick(); trilho.value && (trilho.value.scrollLeft = alvoDe(props.indice)); } });
watch(() => props.itens.length, async () => { await nextTick(); if (!props.empilhado && !arrastando.value) centralizar(Math.min(props.indice, props.itens.length - 1), false); });
onMounted(() => { centralizar(props.indice, false); });
onBeforeUnmount(() => { cancelAnimationFrame(raf); cancelAnimationFrame(rafAuto); clearTimeout(tLongo); });

function irPara(i) {
  emit('update:indice', i);
  centralizar(i);
}
function teclaPonto(e, n) {
  const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
  if (!d) return;
  e.preventDefault();
  const j = Math.max(0, Math.min(props.itens.length - 1, n + d));
  irPara(j);
  nextTick(() => document.getElementById(idPonto(j))?.focus());
}
const uid = Math.random().toString(36).slice(2, 7);
const idPonto = (n) => `car-${uid}-p${n}`;

// ---- Gesto (dedo e mouse): horizontal = arrasta o trilho; vertical = entra/sai da lista empilhada
let g = null;
let engoliuClique = false;
const elastico = (sobra) => 120 * (1 - Math.exp(-sobra / 170)); // quanto o trilho "estica" para uma sobra de arrasto
const LIMITE_NOVO = 70;
const setEl = (px) => { trilho.value && trilho.value.style.setProperty('--el', px + 'px'); };

function aoDescer(e) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  const sl = e.target.closest && e.target.closest('.slot');
  if (!sl || !trilho.value || !trilho.value.contains(sl)) return; // o gesto só vale começando sobre um card
  cancelAnimationFrame(raf);
  chicote.value = false;
  g = { id: e.pointerId, x: e.clientX, y: e.clientY, cx: e.clientX, cy: e.clientY, i: slots().indexOf(sl), sl0: trilho.value.scrollLeft, modo: null, vx: 0, ux: e.clientX, ut: performance.now(), el: sl, over: 0, tipo: e.pointerType };
  clearTimeout(tLongo);
  if (props.reordenavel && props.itens.length > 1) tLongo = setTimeout(iniciarReordem, 500);
}
function aoMover(e) {
  if (!g || e.pointerId !== g.id) return;
  const t = trilho.value;
  const dx = e.clientX - g.x, dy = e.clientY - g.y;
  if (!g.modo) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 7) return;
    clearTimeout(tLongo);
    g.modo = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
    try { t.setPointerCapture(e.pointerId); } catch { /* ok */ }
    arrastando.value = true;
  }
  g.cx = e.clientX; g.cy = e.clientY;
  if (g.modo === 'r') { moverReordem(); return; }
  const agora = performance.now();
  if (agora - g.ut > 16) { g.vx = (e.clientX - g.ux) / (agora - g.ut); g.ux = e.clientX; g.ut = agora; }
  if (g.modo === 'h' && !props.empilhado) {
    const max = t.scrollWidth - t.clientWidth;
    const pos = g.sl0 - dx;
    t.scrollLeft = Math.max(0, Math.min(max, pos));
    const sobra = pos < 0 ? pos : pos > max ? pos - max : 0; // <0 antes do início, >0 além do fim
    g.over = sobra;
    setEl(sobra === 0 ? 0 : -Math.sign(sobra) * elastico(Math.abs(sobra)));
    puxe.value = sobra > 0 && props.temNovo ? Math.min(1, sobra / LIMITE_NOVO) : 0;
  } else if (g.modo === 'v') {
    // o card acompanha o dedo (com resistência) na direção que dispara o gesto
    const ok = props.empilhado ? dy < 0 : dy > 0;
    g.el.style.setProperty('--puxa', (ok ? Math.sign(dy) * Math.min(90, Math.abs(dy) * 0.5) : 0) + 'px');
  }
}
function aoSoltar(e) {
  if (!g || e.pointerId !== g.id) return;
  const t = trilho.value, gg = g;
  clearTimeout(tLongo);
  g = null;
  try { t.releasePointerCapture(e.pointerId); } catch { /* ok */ }
  gg.el.style.removeProperty('--puxa');
  const dx = e.clientX - gg.x, dy = e.clientY - gg.y;
  const moveu = gg.modo !== null;
  if (gg.modo === 'r') { terminarReordem(gg, e.type === 'pointerup'); return; }
  if (moveu) { engoliuClique = true; setTimeout(() => { engoliuClique = false; }, 0); }
  arrastando.value = false;
  puxe.value = 0;
  if (!moveu) { // toque
    if (props.empilhado && e.type === 'pointerup') { emit('update:indice', gg.i); emit('update:empilhado', false); }
    return;
  }
  if (gg.modo === 'v') {
    if (!props.empilhado && dy > 46) emit('update:empilhado', true);
    else if (props.empilhado && dy < -40) emit('update:empilhado', false);
    return;
  }
  if (props.empilhado) return;
  // horizontal: chicote no fim / encaixe no card mais próximo
  if (gg.over > 0 && gg.over >= LIMITE_NOVO && props.temNovo && e.type === 'pointerup') emit('novo');
  if (gg.over !== 0) { chicote.value = true; setEl(0); setTimeout(() => { chicote.value = false; }, 700); }
  const proj = t.scrollLeft - gg.vx * 220;
  let j = maisProximo(proj);
  if (j === gg.i && Math.abs(dx) > 40 && Math.abs(gg.vx) > 0.25) j = Math.max(0, Math.min(props.itens.length - 1, gg.i + (dx < 0 ? 1 : -1)));
  j = Math.min(j, props.itens.length - 1);
  emit('update:indice', j);
  centralizar(j);
}

// ---- Toque longo: reordenar
let tLongo = 0, rafAuto = 0;
const eixoY = () => props.empilhado;
function iniciarReordem() {
  if (!g || g.modo) return;
  g.modo = 'r';
  g.sl0r = trilho.value.scrollLeft;
  g.st0r = trilho.value.scrollTop;
  g.step = passoSlots();
  reordenando.value = true;
  arrastando.value = true;
  try { trilho.value.setPointerCapture(g.id); } catch { /* ok */ }
  try { if (g.tipo !== 'mouse' && navigator.vibrate) navigator.vibrate(18); } catch { /* ok */ }
  g.el.classList.add('levantado');
  g.alvo = g.i;
  rafAuto = requestAnimationFrame(autoRolar);
}
function passoSlots() {
  const s = slots();
  if (s.length < 2) return 0;
  return eixoY() ? s[1].offsetTop - s[0].offsetTop : s[1].offsetLeft - s[0].offsetLeft;
}
function moverReordem() {
  if (!g || g.modo !== 'r') return;
  const t = trilho.value, y = eixoY();
  const d = y ? (g.cy - g.y) + (t.scrollTop - g.st0r) : (g.cx - g.x) + (t.scrollLeft - g.sl0r);
  g.el.style.setProperty(y ? '--ry' : '--rx', d + 'px');
  const n = props.itens.length, passo = g.step || 1;
  const alvo = Math.max(0, Math.min(n - 1, Math.round(g.i + d / passo)));
  g.alvo = alvo;
  slots().forEach((el, k) => {
    if (k === g.i) return;
    let desloc = 0;
    if (g.i < alvo && k > g.i && k <= alvo) desloc = -passo;
    else if (g.i > alvo && k < g.i && k >= alvo) desloc = passo;
    el.style.setProperty(y ? '--ry' : '--rx', desloc + 'px');
  });
}
// Perto da borda do trilho, rola sozinho para dar para levar o card mais longe
function autoRolar() {
  if (!g || g.modo !== 'r') return;
  const t = trilho.value, r = t.getBoundingClientRect(), B = 48;
  let v = 0;
  if (eixoY()) { /* a página rola sozinha na lista; sem autoscroll interno */ }
  else if (g.cx > r.right - B) v = Math.min(14, (g.cx - (r.right - B)) / 3);
  else if (g.cx < r.left + B) v = -Math.min(14, ((r.left + B) - g.cx) / 3);
  if (v) { t.scrollLeft += v; moverReordem(); }
  rafAuto = requestAnimationFrame(autoRolar);
}
function terminarReordem(gg, confirmar) {
  cancelAnimationFrame(rafAuto);
  engoliuClique = true; setTimeout(() => { engoliuClique = false; }, 0);
  const todos = slots();
  const de = gg.i, para = confirmar ? gg.alvo : gg.i;
  // sem transição ao zerar: o trilho vai se reordenar (Vue) e o card já está no lugar certo
  todos.forEach((el) => { el.style.transition = 'none'; el.style.removeProperty('--rx'); el.style.removeProperty('--ry'); el.classList.remove('levantado'); });
  reordenando.value = false;
  arrastando.value = false;
  try { trilho.value.releasePointerCapture(gg.id); } catch { /* ok */ }
  requestAnimationFrame(() => requestAnimationFrame(() => todos.forEach((el) => el.style.removeProperty('transition'))));
  if (para !== de) {
    emit('reordenar', { de, para });
    emit('update:indice', para);
    nextTick(() => centralizar(para, false));
  } else {
    centralizar(props.indice, false);
  }
}
// Com touch-action: pan-y o navegador rola a página no vertical; quando o gesto é nosso (horizontal, puxar para empilhar,
// reordenar) cancelamos o início da rolagem no touchmove (precisa ser listener NÃO passivo).
function aoTocarMover(e) {
  if (!g || !g.modo) return;
  const querVertical = g.modo === 'v' && (props.empilhado ? g.cy - g.y < 0 : g.cy - g.y > 0);
  if (g.modo === 'h' || g.modo === 'r' || querVertical) { if (e.cancelable) e.preventDefault(); }
}
function aoMenuContexto(e) { if (props.reordenavel) e.preventDefault(); }
function aoCancelar(e) { aoSoltar(Object.assign(e, { type: 'pointercancel' })); }
function aoClicar(e) { if (engoliuClique) { e.stopPropagation(); e.preventDefault(); } }
</script>

<template>
  <div class="carrossel-wrap" :class="{ vazio: !itens.length }" data-sem-deslizar>
    <div v-if="empilhado" class="total-topo"><slot name="total" /></div>
    <div
      ref="trilho"
      class="trilho"
      :class="{ pilha: empilhado, arrasta: arrastando, chicote, reordenando }"
      :style="{ '--larg': largura, '--larg-max': larguraMax }"
      @pointerdown="aoDescer"
      @pointermove="aoMover"
      @pointerup="aoSoltar"
      @pointercancel="aoCancelar"
      @click.capture="aoClicar"
      @dragstart.prevent
      @contextmenu="aoMenuContexto"
      @touchmove="aoTocarMover"
      @scroll.passive="aoRolar"
    >
      <div
        v-for="(item, i) in itens"
        :key="chave(item, i)"
        class="slot"
        :class="{ sel: i === indice }"
        :style="{ '--n': i, zIndex: empilhado ? i + 1 : null }"
      >
        <slot name="item" :item="item" :i="i" :selecionado="i === indice" :empilhado="empilhado" />
      </div>
      <button
        v-if="temNovo"
        type="button"
        class="novo-fino"
        :class="{ puxando: puxe > 0 }"
        :style="{ '--puxe': puxe }"
        :aria-label="rotuloNovo"
        :title="rotuloNovo"
        @click="emit('novo')"
      ><Plus :size="22" :stroke-width="1.8" /></button>
    </div>
    <div v-if="!empilhado && itens.length > 1" class="pontos" role="tablist" aria-label="Escolher item">
      <button
        v-for="(item, n) in itens"
        :id="idPonto(n)"
        :key="'p' + chave(item, n)"
        type="button"
        role="tab"
        class="ponto"
        :class="{ ativo: n === indice }"
        :aria-selected="n === indice"
        :aria-label="`Item ${n + 1} de ${itens.length}`"
        :tabindex="n === indice ? 0 : -1"
        @click="irPara(n)"
        @keydown="teclaPonto($event, n)"
      ><i></i></button>
    </div>
  </div>
</template>

<style scoped>
.carrossel-wrap { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.trilho {
  --el: 0px; position: relative; display: flex; gap: 12px; overflow-x: auto; overscroll-behavior-x: contain;
  scroll-snap-type: x mandatory; scrollbar-width: none; padding: 4px 2px 8px;
  touch-action: pan-y; /* horizontal é nosso (pointer events); a rolagem vertical da página segue livre, salvo quando o gesto vertical é nosso (touchmove cancelado) */
  user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;
}
.trilho::-webkit-scrollbar { display: none; }
.trilho.arrasta { scroll-snap-type: none; cursor: grabbing; }
.trilho.arrasta:not(.reordenando) .slot { transition: none; }
.slot {
  flex: 0 0 min(var(--larg), var(--larg-max)); scroll-snap-align: center; min-width: 0; cursor: grab; --puxa: 0px;
  transform: translate(var(--el), var(--puxa)); translate: var(--rx, 0px) var(--ry, 0px);
  transition: translate var(--anim-padrao) var(--anim-curva), opacity var(--anim-padrao) ease, transform var(--anim-padrao) var(--anim-curva);
}
.trilho.chicote .slot { transition: transform 620ms cubic-bezier(.2, 1.9, .4, 1), opacity var(--anim-padrao) ease; }
.slot:not(.sel) { opacity: 0.92; }
/* Reordenar: o card levantado treme de leve e acompanha o dedo; os outros abrem espaço */
.slot.levantado { z-index: 60 !important; opacity: 1; cursor: grabbing; scale: 1.05; transition: none; filter: drop-shadow(0 14px 22px rgb(0 0 0 / 0.35)); animation: tremer 0.22s ease-in-out infinite alternate; }
.trilho.reordenando .slot:not(.levantado) { opacity: 0.85; }
/* na lista empilhada mantém a animação de entrada (não reinicia ao soltar), sem tremor */
.trilho.pilha .slot.levantado { animation-name: desce; }
@keyframes tremer { from { rotate: -0.7deg; } to { rotate: 0.7deg; } }
.slot :deep(img) { -webkit-user-drag: none; }

/* Visão empilhada: lista de blocos inteiros, um embaixo do outro, com espaço entre eles */
.total-topo:empty { display: none; }
.total-topo { padding: 2px 2px 8px; }
.trilho.pilha { flex-direction: column; gap: 14px; overflow-x: visible; scroll-snap-type: none; padding: 4px 2px 8px; }
.trilho.pilha .slot { flex: none; width: 100%; max-width: var(--larg-max); cursor: pointer; opacity: 1; transform: translateY(var(--puxa)); animation: desce var(--anim-lenta) var(--anim-curva) both; animation-delay: calc(var(--n) * 55ms); }
@keyframes desce {
  from { opacity: 0; transform: translateY(calc(var(--n) * -1 * (100% + 14px) - 12px)) scale(0.96); }
  60% { opacity: 1; }
  to { opacity: 1; transform: translateY(var(--puxa)) scale(1); }
}

/* Pontinhos clicáveis (alvo de toque ≥ 24 px de altura, 28 de largura) */
.pontos { display: flex; justify-content: center; align-items: center; }
.ponto { appearance: none; border: 0; background: none; padding: 0; min-width: 28px; height: 28px; display: grid; place-items: center; cursor: pointer; border-radius: 99px; }
.ponto i { display: block; width: 7px; height: 7px; border-radius: 50%; background: var(--cor-borda); transition: width var(--anim-padrao) var(--anim-curva), background var(--anim-padrao) ease, transform var(--anim-rapida) ease; }
.ponto:hover i { transform: scale(1.3); background: var(--cor-texto-suave); }
.ponto.ativo i { width: 20px; border-radius: 99px; background: var(--cor-primaria); transform: none; }
.ponto:focus-visible { outline: 2px solid var(--cor-primaria); outline-offset: -2px; }

/* Botão fino "+": último item do trilho, mesma altura do card (stretch), só o "+" */
.novo-fino {
  --puxe: 0; flex: 0 0 52px; align-self: stretch; scroll-snap-align: end; display: grid; place-items: center; cursor: pointer; padding: 0;
  background: color-mix(in srgb, var(--cor-primaria) calc(var(--puxe) * 14%), transparent); color: var(--cor-texto-suave);
  border: 2px dashed color-mix(in srgb, var(--cor-primaria) calc(var(--puxe) * 100%), var(--cor-borda)); border-radius: 18px;
  transform: translate(var(--el), 0) scale(calc(1 + var(--puxe) * 0.04)); transition: transform var(--anim-padrao) var(--anim-curva), border-color var(--anim-rapida) ease, color var(--anim-rapida) ease, background var(--anim-rapida) ease;
}
.trilho.chicote .novo-fino { transition: transform 620ms cubic-bezier(.2, 1.9, .4, 1); }
.novo-fino:hover, .novo-fino:focus-visible { border-color: var(--cor-primaria); color: var(--cor-primaria); }
.novo-fino.puxando { color: var(--cor-primaria); }
.trilho.pilha .novo-fino { flex: none; width: 100%; min-height: 48px; align-self: auto; transform: none; }
@media (prefers-reduced-motion: reduce) { .trilho.pilha .slot { animation: none; } .slot.levantado { animation: none; } }
</style>
