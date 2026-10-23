<script setup>
// Barras horizontais em degradê (REF-06, tela 3): uma linha por item, com rótulo, valor e barra.
// Cada item: { id, rotulo, valor, detalhe?, icone?, cor?, de?, ate? }. Se tiver `icone`, mostra o quadrado colorido da categoria.
// Se `aoClicar` for passado, a linha vira botão.
import { computed } from 'vue';
import BarraDegrade from './BarraDegrade.vue';
import IconeCat from './IconeCat.vue';
import { chaveFinalCategoria } from '../utils/iconesCategoria.js';

const props = defineProps({
  itens: { type: Array, default: () => [] },
  formato: { type: Function, default: (v) => String(v) },
  de: { type: String, default: 'var(--saida-ambar-medio)' },
  ate: { type: String, default: 'var(--saida-carmim-medio)' },
  clicavel: { type: Boolean, default: false },
  altura: { type: Number, default: 10 },
});
const emit = defineEmits(['clicar']);
const maior = computed(() => Math.max(1, ...props.itens.map((i) => i.valor)));
const claro = (c) => `color-mix(in srgb, ${c} 55%, var(--cor-fundo-elevado))`;
</script>

<template>
  <ul class="rel-barras">
    <li v-for="i in itens" :key="i.id ?? i.rotulo">
      <component :is="clicavel ? 'button' : 'div'" class="linha" :type="clicavel ? 'button' : undefined" @click="clicavel && emit('clicar', i)">
        <span v-if="i.icone !== undefined" class="quadro" :style="{ '--c': i.cor || 'var(--cor-saida)' }" aria-hidden="true"><IconeCat :chave="chaveFinalCategoria(i.icone, i.tipoIcone || 'saida')" :tamanho="18" /></span>
        <span class="miolo">
          <span class="topo">
            <b>{{ i.rotulo }}</b>
            <span class="valor numero-tabular">{{ formato(i.valor) }}</span>
          </span>
          <BarraDegrade :pct="(i.valor / maior) * 100" :de="i.cor ? claro(i.cor) : (i.de || de)" :ate="i.cor || i.ate || ate" :altura="altura" :marcador="false" />
          <small v-if="i.detalhe">{{ i.detalhe }}</small>
        </span>
      </component>
    </li>
  </ul>
</template>

<style scoped>
.rel-barras { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.linha { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 52px; padding: 6px 4px; border: none; background: none; border-radius: 12px; font: inherit; color: var(--cor-texto); text-align: left; }
button.linha { cursor: pointer; }
button.linha:hover, button.linha:active { background: var(--cor-realce); }
.quadro { width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex: none; font-size: 19px; background: color-mix(in srgb, var(--c) 18%, transparent); box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--c) 45%, transparent); }
.miolo { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.topo { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; min-width: 0; }
.topo b { font-size: 14px; font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.valor { font-family: var(--fonte-display); font-size: 13.5px; font-weight: 600; flex: none; }
small { font-size: 12px; color: var(--cor-texto-suave); }
</style>
