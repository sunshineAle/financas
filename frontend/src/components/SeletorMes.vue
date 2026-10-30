<script setup>
// Seletor de mês em FILEIRA FINA (substitui o quadradinho + janelinha flutuante). UM componente para o sistema inteiro.
//  - A fileira de meses se move ao arrastar (dedo ou mouse); o mês selecionado é uma ABA DE FICHÁRIO fixa no centro
//    (cantos de cima arredondados, "curvas" concordando com a base, ano pequeno embaixo do mês), na cor principal
//    da página (prop `cor`). Os vizinhos ficam mais claros/apagados; tocar num vizinho seleciona.
//  - "Ano inteiro" e "Voltar ao mês atual" são botões pequenos na própria fileira (sem popup).
//  - No modo "ano inteiro" a fileira passa a mostrar anos.
//  - No PC aparecem setas ‹ › nas pontas; teclado: ← → com a fileira focada.
// Props (todas opcionais): cor (cor de DESTAQUE do tema da página: só o texto do mês/ano usa; padrão var(--cor-primaria)),
// compacto (fileira mais baixa), semSetas (esconde ‹ › do PC), semAtalhos (esconde "Ano"/"Hoje"),
// ligada (a aba se funde ao bloco logo abaixo, com curvas de concordância; CabecalhoPagina liga sozinho quando
// recebe o slot `corpo`. Sem `ligada` a aba aparece "solta", com contorno e linha de base, como antes).
// Aba DISCRETA: fundo = var(--mes-fundo) (padrão var(--cor-fundo-elevado), a mesma cor do bloco), sem degradê nem sombra.
// Mostra só 1-2 meses de cada lado, sumindo em transparência. Variáveis expostas: --mes-cor (destaque), --mes-fundo.
import { ref, computed, onBeforeUnmount, onMounted } from 'vue';
import { ChevronLeft, ChevronRight, ChevronDown, RotateCcw, Check } from 'lucide-vue-next';
import { ano, mesNum, anoInteiro, ehAtual, rotuloPeriodo, MESES_CURTOS, mover, voltarAtual, trocarAno, anoAtual, intervaloTxt } from '../services/mes.js';

const props = defineProps({
  cor: { type: String, default: 'var(--cor-primaria)' },
  compacto: { type: Boolean, default: false },
  semSetas: { type: Boolean, default: false },
  semAtalhos: { type: Boolean, default: false },
  ligada: { type: Boolean, default: false },
});

const ALCANCE = 5; // meses renderizados de cada lado (só ~2 aparecem: o resto some em transparência; os demais existem para o arrasto)
const alcance = computed(() => (anoInteiro.value ? 4 : ALCANCE));
const viewport = ref(null);
const dx = ref(0);          // deslocamento do arrasto em px
const animando = ref(false);
const arrastando = ref(false);
let passoPx = 60;

function rotulo(o) {
  if (anoInteiro.value) return { topo: String(ano.value + o), baixo: '' };
  const t = ano.value * 12 + (mesNum.value - 1) + o;
  const m = ((t % 12) + 12) % 12, a = Math.floor(t / 12);
  return { topo: MESES_CURTOS[m], baixo: m === 0 || o === 0 ? String(a) : '', ano: a };
}
const itens = computed(() => {
  const r = [];
  for (let o = -alcance.value; o <= alcance.value; o++) r.push({ o, ...rotulo(o) });
  return r;
});
const passosPrevia = computed(() => Math.max(-alcance.value, Math.min(alcance.value, -Math.round(dx.value / passoPx))));
const aba = computed(() => rotulo(passosPrevia.value));
const mostrarAno = computed(() => (anoInteiro.value ? 'ano inteiro' : aba.value.ano ?? ano.value));
// Seletor de ano (anotação 47): tocar no mês selecionado abre os anos com dados (+ o seguinte); troca o ano e mantém o mês.
const menuAno = ref(false);
const anos = ref([anoAtual - 1, anoAtual, anoAtual + 1]);
onMounted(async () => {
  try { const r = await fetch('/api/transacoes/anos', { credentials: 'include' }); if (r.ok) { const j = await r.json(); if (j.anos && j.anos.length) anos.value = j.anos; } } catch { /* mantém o padrão */ }
});
function escolherAno(a) { trocarAno(a); menuAno.value = false; }
function abrirAnos() { if (engolirClique) return; menuAno.value = !menuAno.value; }

function medir() {
  const el = viewport.value?.querySelector('.item');
  if (el) passoPx = el.getBoundingClientRect().width || passoPx;
}
let timer = null;
function irPara(n) {
  if (!n) { dx.value = 0; return; }
  medir();
  n = Math.max(-alcance.value, Math.min(alcance.value, n));
  animando.value = true;
  dx.value = -n * passoPx;
  clearTimeout(timer);
  timer = setTimeout(() => { mover(n); animando.value = false; dx.value = 0; }, 200);
}
onBeforeUnmount(() => clearTimeout(timer));

// ---- arrastar (pointer events: dedo, caneta e mouse) ----
let g = null; // gesto em andamento
let engolirClique = false;
function aoApertar(e) {
  if (animando.value || (e.pointerType === 'mouse' && e.button !== 0)) return;
  medir();
  g = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, vx: 0, ult: { x: e.clientX, t: performance.now() }, ativo: false };
}
function aoMover(e) {
  if (!g || e.pointerId !== g.id) return;
  const ddx = e.clientX - g.x, ddy = e.clientY - g.y;
  if (!g.ativo) {
    if (Math.abs(ddx) < 6 || Math.abs(ddx) < Math.abs(ddy)) return;
    g.ativo = true; arrastando.value = true;
    try { viewport.value.setPointerCapture(e.pointerId); } catch { /* ok */ }
  }
  const lim = alcance.value * passoPx;
  dx.value = Math.max(-lim, Math.min(lim, ddx));
  const agora = performance.now();
  if (agora - g.ult.t > 40) { g.vx = (e.clientX - g.ult.x) / (agora - g.ult.t); g.ult = { x: e.clientX, t: agora }; }
}
function aoSoltar(e) {
  if (!g || e.pointerId !== g.id) return;
  const foi = g.ativo, vx = g.vx;
  g = null; arrastando.value = false;
  if (!foi) return;
  engolirClique = true; setTimeout(() => { engolirClique = false; }, 0);
  const bonus = Math.max(-passoPx * 1.5, Math.min(passoPx * 1.5, vx * 140)); // inércia limitada a ~1,5 mês
  irPara(-Math.round((dx.value + bonus) / passoPx));
}
function aoCancelar() { g = null; arrastando.value = false; dx.value = 0; }
function tocar(o) { if (engolirClique) return; if (o) irPara(o); }
function tecla(e) {
  if (e.key === 'ArrowLeft') { e.preventDefault(); irPara(-1); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); irPara(1); }
}
</script>

<template>
  <div class="mes-fileira" :class="{ compacto, 'ano-modo': anoInteiro, ligada, solta: !ligada }" :style="{ '--mes-cor': props.cor }">
    <button v-if="!semSetas" type="button" class="seta setas-pc" :aria-label="anoInteiro ? 'Ano anterior' : 'Mês anterior'" @click="irPara(-1)"><ChevronLeft :size="18" :stroke-width="2" /></button>

    <div
      ref="viewport"
      class="fileira-mes-viewport"
      data-sem-deslizar
      role="group"
      tabindex="0"
      :aria-label="`Período: ${rotuloPeriodo}. Arraste ou use as setas do teclado para trocar`"
      @pointerdown="aoApertar" @pointermove="aoMover" @pointerup="aoSoltar" @pointercancel="aoCancelar" @keydown="tecla"
    >
      <div class="trilho" :class="{ anima: animando, arrasto: arrastando }" :style="{ transform: `translate3d(calc(-50% + ${dx}px), 0, 0)` }">
        <button v-for="it in itens" :key="it.o" type="button" class="item" :class="{ centro: it.o === 0 }" :style="{ '--d': Math.abs(it.o - passosPrevia) }"
          :tabindex="-1" :aria-label="it.o === 0 ? undefined : `Ir para ${it.topo} ${it.ano ?? ''}`" :disabled="it.o === 0" @click="tocar(it.o)">
          <b>{{ it.topo }}</b><small v-if="it.baixo">{{ it.baixo }}</small>
        </button>
      </div>
      <button type="button" class="aba" aria-live="polite" :aria-label="`${rotuloPeriodo}. Tocar para escolher o ano`" :aria-expanded="menuAno" data-aba-mes @click="abrirAnos" @pointerdown.stop>
        <b class="aba-mes">{{ aba.topo }}<ChevronDown :size="12" :stroke-width="2.4" class="aba-seta" /></b>
        <small class="aba-ano">{{ mostrarAno }}</small>
      </button>
      <i class="base" aria-hidden="true"></i>
    </div>

    <button v-if="!semSetas" type="button" class="seta setas-pc" :aria-label="anoInteiro ? 'Próximo ano' : 'Próximo mês'" @click="irPara(1)"><ChevronRight :size="18" :stroke-width="2" /></button>

    <!-- O botão "Ano" saiu (anotação 47): a visão anual consolidada fica em Relatórios (Mês | Ano). -->
    <div v-if="!semAtalhos" class="atalhos">
      <transition name="atalho-anim">
        <button v-if="!ehAtual" type="button" class="atalho hoje" aria-label="Voltar ao mês atual" title="Voltar ao mês atual" @click="voltarAtual">
          <RotateCcw :size="16" :stroke-width="2" /><span>Hoje</span>
        </button>
      </transition>
    </div>
    <div v-if="menuAno" class="menu-ano" role="listbox" aria-label="Escolher o ano" data-menu-ano>
      <!-- Anotação 57: o período do mês financeiro aparece aqui (e na legenda do card de topo), não embaixo do mês. -->
      <p v-if="intervaloTxt" class="mes-fin">Mês financeiro: {{ intervaloTxt }}<RouterLink to="/mais/financas" @click="menuAno = false">mudar</RouterLink></p>
      <button v-for="a in anos" :key="a" type="button" role="option" :aria-selected="a === ano" :class="{ ativo: a === ano }" @click="escolherAno(a)">
        {{ a }}<small v-if="a === anoAtual">atual</small><Check v-if="a === ano" :size="14" :stroke-width="2.4" />
      </button>
    </div>
    <div v-if="menuAno" class="menu-fundo" @click="menuAno = false"></div>
  </div>
</template>


<style scoped>
.mes-fileira {
  /* Homologação 1.0, seção 4: aba ainda menor (largura e altura); embaixo do mês só o ano, centralizado */
  --item-w: 54px; --aba-w: 78px; --alt: 38px; --raio: 12px;
  position: relative; display: flex; align-items: flex-end; gap: 6px; width: 100%; max-width: 100%; min-width: 0;
}
.mes-fileira.compacto { --alt: 36px; --item-w: 50px; --aba-w: 72px; --raio: 11px; }
@media (min-width: 769px) { .mes-fileira { --item-w: 66px; --aba-w: 88px; } .mes-fileira.compacto { --item-w: 60px; --aba-w: 80px; } }

.fileira-mes-viewport {
  position: relative; flex: 1 1 auto; min-width: 0; height: var(--alt); overflow: hidden; cursor: grab; outline: none;
  touch-action: pan-y; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent;
}
.fileira-mes-viewport:active { cursor: grabbing; }
.fileira-mes-viewport:focus-visible { box-shadow: 0 0 0 2px color-mix(in srgb, var(--mes-cor) 55%, transparent); border-radius: var(--raio); }
/* linha de base (só na aba "solta"; na aba ligada o bloco logo abaixo faz esse papel) */
.base { position: absolute; left: 0; right: 0; bottom: 0; height: 2px; border-radius: 2px; background: var(--cor-borda); pointer-events: none; }
.ligada .base { display: none; }

.trilho {
  position: absolute; left: 50%; top: 0; bottom: 0; display: flex; align-items: center; padding-bottom: 2px;
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent); mask-image: linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent);
  will-change: transform;
}
.ligada .trilho { padding-bottom: 0; }
.trilho.anima { transition: transform 200ms var(--anim-curva, ease); }
/* vizinhos: 1º ~60%, 2º ~30%, 3º+ invisível (a distância é contada a partir da aba, também durante o arrasto) */
.item {
  flex: 0 0 var(--item-w); width: var(--item-w); height: calc(var(--alt) - 6px); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;
  background: none; border: 0; padding: 0; cursor: pointer; font-family: var(--fonte-display); color: var(--cor-texto-suave);
  opacity: max(0, calc(0.9 - var(--d) * 0.3)); transition: opacity var(--anim-rapida) ease, color var(--anim-rapida) ease;
}
.item:hover { color: var(--cor-texto); }
.item b { font-size: 12px; letter-spacing: 0.04em; font-weight: 600; }
.item small { font-size: 9px; font-family: var(--fonte-texto); opacity: 0.8; line-height: 1; }
.item:disabled { cursor: default; opacity: 0; }

/* ABA DE FICHÁRIO — larga, fixa no centro, discreta: mesma cor do bloco; só o texto usa o destaque do tema */
.aba {
  position: absolute; left: 50%; bottom: 0; transform: translateX(-50%); width: var(--aba-w); height: var(--alt);
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; padding: 0; border: 0; cursor: pointer; font: inherit;
  border-radius: var(--raio) var(--raio) 0 0; background: var(--mes-fundo, var(--cor-fundo-elevado)); color: var(--mes-cor);
}
.solta .aba { border: 1px solid var(--cor-borda); border-bottom: 0; height: calc(var(--alt) - 2px); bottom: 2px; }
/* curvas de concordância (só ligada): a aba "nasce" do bloco */
.ligada .aba::before, .ligada .aba::after { content: ''; position: absolute; bottom: 0; width: 12px; height: 12px; pointer-events: none; }
.ligada .aba::before { left: -12px; background: radial-gradient(circle at 0 0, transparent 11.5px, var(--mes-fundo, var(--cor-fundo-elevado)) 12px); }
.ligada .aba::after { right: -12px; background: radial-gradient(circle at 100% 0, transparent 11.5px, var(--mes-fundo, var(--cor-fundo-elevado)) 12px); }
.aba-mes { position: relative; display: inline-block; font-family: var(--fonte-display); font-size: 14px; font-weight: 600; letter-spacing: 0.06em; line-height: 1.1; }
/* a setinha fica fora do fluxo: o nome do mês e o ano ficam no mesmo eixo, centralizados */
.aba-mes .aba-seta { position: absolute; left: 100%; top: 50%; transform: translateY(-50%); margin-left: 1px; }
.aba-ano { font-family: var(--fonte-texto); font-size: 9.5px; text-align: center; opacity: 0.7; line-height: 1; letter-spacing: 0.04em; }
.ano-modo .aba-mes { font-size: 15px; letter-spacing: 0; }
.ano-modo .aba-ano { font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; }

.seta { flex: 0 0 auto; align-self: center; width: 36px; height: 36px; border-radius: 10px; display: none; align-items: center; justify-content: center; background: none; border: 1px solid var(--cor-borda); color: var(--cor-texto-suave); cursor: pointer; }
.seta:hover { color: var(--cor-texto); background: var(--cor-realce); }
@media (min-width: 769px) { .seta.setas-pc { display: inline-flex; } }

.atalhos { flex: 0 0 auto; align-self: center; display: flex; gap: 6px; }
.atalho {
  min-height: 44px; min-width: 44px; padding: 0 10px; border-radius: 12px; display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;
  background: none; border: 1px solid var(--cor-borda); color: var(--cor-texto-suave); font-family: var(--fonte-texto); font-size: 10px; font-weight: 600; cursor: pointer;
  transition: background var(--anim-rapida) ease, color var(--anim-rapida) ease, border-color var(--anim-rapida) ease; -webkit-tap-highlight-color: transparent;
}
.atalho:hover { color: var(--cor-texto); background: var(--cor-realce); }
.atalho.ligado { color: var(--cor-sobre-cor); background: var(--mes-cor); border-color: var(--mes-cor); }
.atalho.hoje { color: var(--mes-cor); border-color: color-mix(in srgb, var(--mes-cor) 55%, var(--cor-borda)); }
.compacto .atalho { min-height: 40px; }
@media (min-width: 769px) { .atalho { flex-direction: row; gap: 6px; font-size: 12px; padding: 0 12px; } }
.atalho-anim-enter-active, .atalho-anim-leave-active { transition: opacity var(--anim-rapida) ease, transform var(--anim-padrao) var(--anim-curva); }
.atalho-anim-enter-from, .atalho-anim-leave-to { opacity: 0; transform: scale(0.85); }
@media (prefers-reduced-motion: reduce) { .trilho.anima { transition: none; } }
.aba-seta { opacity: 0.6; }
.aba:focus-visible { outline: 2px solid color-mix(in srgb, var(--mes-cor) 55%, transparent); outline-offset: -2px; }
.seta { width: 40px; height: 40px; }
.atalho { min-height: 40px; }
.menu-ano { position: absolute; left: 50%; top: calc(100% + 6px); transform: translateX(-50%); z-index: 30; min-width: 150px; max-height: 260px; overflow-y: auto; padding: 6px; border-radius: 14px; background: var(--cor-fundo-elevado); border: 1px solid var(--cor-borda); box-shadow: 0 16px 36px -14px rgba(0, 0, 0, .45); display: flex; flex-direction: column; gap: 2px; }
.menu-ano button { min-height: 44px; display: flex; align-items: center; gap: 8px; padding: 0 12px; border: none; border-radius: 10px; background: none; color: var(--cor-texto); font: 600 15px var(--fonte-texto); cursor: pointer; text-align: left; }
.menu-ano button:hover { background: var(--cor-realce); }
.menu-ano button.ativo { color: var(--mes-cor); background: color-mix(in srgb, var(--mes-cor) 10%, transparent); }
.mes-fin { margin: 2px 4px 6px; padding: 0 8px 8px; border-bottom: 1px solid var(--cor-borda); font-size: 12px; line-height: 1.4; color: var(--cor-texto-suave); white-space: nowrap; display: flex; gap: 8px; align-items: baseline; }
.mes-fin a { color: var(--mes-cor, var(--cor-primaria)); font-weight: 600; text-decoration: underline; }
.menu-ano small { font-size: 11px; font-weight: 500; color: var(--cor-texto-suave); }
.menu-ano svg { margin-left: auto; }
.menu-fundo { position: fixed; inset: 0; z-index: 29; }
</style>
