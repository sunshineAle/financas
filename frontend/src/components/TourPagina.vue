<script setup>
// Tour da página (Versão 1.0): "Como usar …" com 3 passos numerados (ícone em círculo, título curto e uma linha),
// o passo atual em destaque, e Entendi · Pular. Global (AppLayout): abre na primeira visita a cada página, espera se
// houver outra janela aberta ("uma janela por vez") e também abre pelo Manual › Rever tour (reverTour).
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';
import Modal from './Modal.vue';
import { marcarNovidadesVistas } from '../services/novidades.js';
import TEMPOS from '../../public-pwa/tours/tempos.json';
import { TOURS, tourAberto, chaveDaRota, jaVisto, marcarVisto, toursLigados, ligarTours, temJanelaAberta, precisaOQueMudou, ehContaNova } from '../services/tour.js';

const route = useRoute();
const passo = ref(0);
// Animação da página (gravada da demonstração; scripts/gravar-tours.cjs): roda em loop e o passo destacado acompanha
// os tempos de tempos.json. Tocar num passo ou em "Próximo" passa a controlar à mão.
const BASE = (import.meta.env && import.meta.env.BASE_URL) || './';
const tempos = ref(TEMPOS || {}); // vem no próprio app (gerado junto com as animações)
const srcAnim = computed(() => (tourAberto.value ? `${BASE}tours/${tourAberto.value}.webp${tourAberto.value === 'revisar' ? '?v=20261110-14' : tourAberto.value === 'regras' ? '?v=20261110-gravado' : ''}` : ''));
const animOk = ref(true);
let relogio = null; let inicioAnim = 0; let manual = false;
function pararRelogio() { if (relogio) { clearInterval(relogio); relogio = null; } }
function aoCarregarAnim() {
  animOk.value = true; manual = false; inicioAnim = performance.now(); pararRelogio();
  const t = tempos.value[tourAberto.value];
  if (!t || !t.total) return;
  relogio = setInterval(() => {
    if (manual || !tour.value) return;
    const s = ((performance.now() - inicioAnim) / 1000) % t.total;
    let i = 0; t.passos.forEach((ini, k) => { if (s >= ini) i = k; });
    passo.value = Math.min(i, tour.value.passos.length - 1);
  }, 200);
}
function escolherPasso(i) { manual = true; passo.value = i; }
const tour = computed(() => (tourAberto.value ? TOURS[tourAberto.value] : null));
const ultimo = computed(() => tour.value && passo.value >= tour.value.passos.length - 1);
watch(tourAberto, () => { passo.value = 0; manual = false; animOk.value = true; pararRelogio(); });

let espera = null;
function cancelar() { if (espera) { clearTimeout(espera); espera = null; } }
// Escolhe o tour da vez: "O que mudou" (quem já usava) → geral (conta nova, no Início) → o da página.
function candidato() {
  if (precisaOQueMudou()) return 'o-que-mudou';
  if (!toursLigados()) return null;
  const k = chaveDaRota(route);
  if (k === 'inicio' && ehContaNova() && !jaVisto('geral')) return 'geral';
  return k && !jaVisto(k) ? k : null;
}
function tentar(tentativas = 0) {
  cancelar();
  if (tourAberto.value) return;
  const k = candidato();
  if (!k) return;
  if (temJanelaAberta() || document.hidden) { if (tentativas < 40) espera = setTimeout(() => tentar(tentativas + 1), 1500); return; }
  tourAberto.value = k;
}
watch(() => [route.fullPath, route.name], () => { if (route.name && route.name !== 'login') { cancelar(); espera = setTimeout(() => tentar(), 1100); } }, { immediate: true });
onBeforeUnmount(() => { cancelar(); pararRelogio(); });

function concluir() {
  const k = tourAberto.value;
  if (k) marcarVisto(k);
  if (k === 'o-que-mudou') marcarNovidadesVistas('1.0'); // não repete as Novidades da mesma versão
  tourAberto.value = null;
  setTimeout(() => tentar(), 600); // ex.: depois do geral, o do Início
}
function seguir() { if (ultimo.value) concluir(); else { manual = true; passo.value++; } }
function responderDicas(sim) { ligarTours(sim); if (!sim) marcarVisto('geral'); concluir(); }
</script>

<template>
  <Modal :aberto="!!tour" :titulo="tour ? tour.titulo : ''" tema="neutro" :largura="620" @fechar="concluir">
    <div v-if="tour" class="tour" data-tour :data-tour-chave="tourAberto">
      <figure v-if="animOk" class="anim">
        <img :key="srcAnim" :src="srcAnim" :alt="`Animação: ${tour.titulo}, passo a passo`" width="300" draggable="false" @load="aoCarregarAnim" @error="animOk = false" />
      </figure>
      <ol class="passos">
        <li v-for="(p, i) in tour.passos" :key="i" :class="{ atual: i === passo, feito: i < passo }" @click="escolherPasso(i)">
          <span class="num" aria-hidden="true"><component :is="p.icone" :size="18" :stroke-width="2" /></span>
          <span class="txt"><b><small>{{ i + 1 }}.</small> {{ p.titulo }}</b><span>{{ p.texto }}</span></span>
        </li>
      </ol>
      <p v-if="tour.mudou && ultimo" class="pergunta">Mostrar as dicas de cada página na primeira visita?</p>
    </div>
    <template #rodape>
      <div class="rodape-tour">
        <template v-if="tour && tour.mudou && ultimo">
          <button type="button" class="b-sec" @click="responderDicas(false)">Não</button>
          <button type="button" class="b-prim" data-tour-sim @click="responderDicas(true)">Sim, mostrar</button>
        </template>
        <template v-else>
          <button type="button" class="b-sec" data-tour-pular @click="concluir">Pular</button>
          <button type="button" class="b-prim" data-tour-seguir @click="seguir">{{ ultimo ? 'Entendi' : 'Próximo' }}</button>
        </template>
      </div>
    </template>
  </Modal>
</template>

<style scoped>
.tour { display: flex; flex-direction: column; gap: 10px; }
.anim { margin: 0 auto; width: min(100%, 160px); aspect-ratio: 300 / 585; border-radius: 18px; overflow: hidden; border: 1px solid var(--cor-borda); background: var(--cor-fundo); box-shadow: 0 14px 30px -18px rgb(0 0 0 / .6); }
.anim img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top; pointer-events: none; user-select: none; }
@media (min-width: 769px) { .tour { display: grid; grid-template-columns: 200px minmax(0, 1fr); align-items: start; gap: 16px; } .anim { width: 200px; } .pergunta { grid-column: 1 / -1; } }
@media (max-height: 700px) { .anim { width: min(100%, 130px); } }
.passos { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.passos li { display: grid; grid-template-columns: 40px minmax(0, 1fr); gap: 12px; align-items: center; padding: 10px; border-radius: 14px; border: 1px solid transparent; cursor: pointer; opacity: .55; transition: opacity var(--anim-rapida, .15s) ease, background var(--anim-rapida, .15s) ease, border-color var(--anim-rapida, .15s) ease; }
.passos li.feito { opacity: .8; }
.passos li.atual { opacity: 1; background: var(--cor-card); border-color: color-mix(in srgb, var(--cor-primaria) 45%, var(--cor-borda)); }
.num { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; color: #fff; background: linear-gradient(135deg, #5e18d8, #1597a8); }
.txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.txt b { font: 600 15px var(--fonte-display); color: var(--cor-texto); }
.txt b small { font-size: 13px; color: var(--cor-texto-suave); font-weight: 600; }
.txt span { font-size: 13.5px; line-height: 1.4; color: var(--cor-texto-suave); }
.pergunta { margin: 4px 2px 0; font-size: 14px; font-weight: 600; color: var(--cor-texto); }
.rodape-tour { display: flex; gap: 10px; justify-content: flex-end; }
.b-sec, .b-prim { min-height: 44px; padding: 0 18px; border-radius: 12px; font: 600 15px var(--fonte-texto); cursor: pointer; }
.b-sec { background: none; border: 1px solid var(--cor-borda); color: var(--cor-texto); }
.b-prim { flex: 1; max-width: 220px; border: none; color: #fff; background: linear-gradient(135deg, #5e18d8, #1597a8); }
@media (prefers-reduced-motion: reduce) { .passos li { transition: none; } }
</style>
