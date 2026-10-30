<script setup>
// Barras por mês (Entradas · Saídas · Resultado) que também ESCOLHEM o mês (homologação 1.0, seção 5 — Extrato).
// Nesta tela o filtro de meses some: tocar ou arrastar nas barras troca o mês. Regra do degradê: cada barra em degradê
// vertical. Resultado é um ponto/traço sobre o par de barras (positivo verde, negativo carmim).
//   <RelBarrasMes :meses="[{ chave, rotulo, entradas, saidas }]" :selecionado="i" :formato="fn" @escolher="i => …" />
import { computed, ref } from 'vue';

const props = defineProps({
  meses: { type: Array, default: () => [] },
  selecionado: { type: Number, default: -1 },
  formato: { type: Function, default: (v) => String(v) },
});
const emit = defineEmits(['escolher']);
const maior = computed(() => Math.max(1, ...props.meses.flatMap((m) => [m.entradas || 0, m.saidas || 0])));
const alt = (v) => `${Math.max(2, ((v || 0) / maior.value) * 100)}%`;
const sel = computed(() => props.meses[props.selecionado] || null);
const resultado = (m) => (m.entradas || 0) - (m.saidas || 0);

const area = ref(null);
let arrastando = false;
function indice(e) {
  const r = area.value?.getBoundingClientRect();
  if (!r || !props.meses.length) return -1;
  const i = Math.floor(((e.clientX - r.left) / r.width) * props.meses.length);
  return Math.max(0, Math.min(props.meses.length - 1, i));
}
function no(e) { const i = indice(e); if (i >= 0 && i !== props.selecionado) emit('escolher', i); }
function desce(e) { arrastando = true; area.value?.setPointerCapture?.(e.pointerId); no(e); }
function move(e) { if (arrastando) no(e); }
function sobe() { arrastando = false; }
function tecla(e) {
  if (e.key === 'ArrowLeft' && props.selecionado > 0) { e.preventDefault(); emit('escolher', props.selecionado - 1); }
  if (e.key === 'ArrowRight' && props.selecionado < props.meses.length - 1) { e.preventDefault(); emit('escolher', props.selecionado + 1); }
}
</script>

<template>
  <div class="barras-mes">
    <ul class="legenda" aria-hidden="true">
      <li><i class="ent"></i>Entradas<b v-if="sel" class="numero-tabular">{{ formato(sel.entradas) }}</b></li>
      <li><i class="sai"></i>Saídas<b v-if="sel" class="numero-tabular">{{ formato(sel.saidas) }}</b></li>
      <li><i class="res"></i>Resultado<b v-if="sel" class="numero-tabular" :class="resultado(sel) < 0 ? 'neg' : 'pos'">{{ formato(resultado(sel)) }}</b></li>
    </ul>
    <div ref="area" class="area" role="slider" tabindex="0" :aria-valuemin="0" :aria-valuemax="Math.max(0, meses.length - 1)" :aria-valuenow="selecionado"
      :aria-valuetext="sel ? `${sel.rotulo}: entradas ${formato(sel.entradas)}, saídas ${formato(sel.saidas)}` : ''" aria-label="Escolha o mês: toque ou arraste nas barras" data-barras-mes
      @pointerdown="desce" @pointermove="move" @pointerup="sobe" @pointercancel="sobe" @keydown="tecla">
      <div v-for="(m, i) in meses" :key="m.chave" class="coluna" :class="{ sel: i === selecionado }">
        <div class="par">
          <span class="barra ent" :style="{ height: alt(m.entradas) }"></span>
          <span class="barra sai" :style="{ height: alt(m.saidas) }"></span>
        </div>
        <span class="rot">{{ m.rotulo }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.barras-mes { display: flex; flex-direction: column; gap: 8px; }
.legenda { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12.5px; color: var(--cor-texto-suave); }
.legenda li { display: inline-flex; align-items: center; gap: 6px; }
.legenda i { width: 8px; height: 8px; border-radius: 50%; }
.legenda i.ent { background: var(--cor-entrada); }
.legenda i.sai { background: var(--cor-saida); }
.legenda i.res { background: var(--cor-texto); }
.legenda b { color: var(--cor-texto); font-weight: 600; }
.legenda b.pos { color: var(--cor-entrada-texto, var(--cor-entrada)); }
.legenda b.neg { color: var(--cor-saida-texto, var(--cor-saida)); }
.area { display: flex; align-items: stretch; gap: 2px; height: 140px; touch-action: pan-y; cursor: ew-resize; outline: none; border-radius: 10px; }
.area:focus-visible { box-shadow: 0 0 0 2px var(--cor-primaria); }
.coluna { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 4px 0 0; border-radius: 10px; opacity: 0.55; transition: opacity var(--anim-rapida) ease, background var(--anim-rapida) ease; }
.coluna.sel { opacity: 1; background: var(--cor-realce); }
.par { flex: 1; width: 100%; display: flex; align-items: flex-end; justify-content: center; gap: 2px; }
.barra { width: min(9px, 34%); border-radius: 4px 4px 2px 2px; }
.barra.ent { background: linear-gradient(180deg, #4CC27A, #167A42); }
.barra.sai { background: linear-gradient(180deg, #E15F0E, #CE2239); }
.rot { font-size: 9.5px; font-weight: 600; color: var(--cor-texto-suave); letter-spacing: 0.02em; }
.coluna.sel .rot { color: var(--cor-texto); }
</style>
