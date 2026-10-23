<script setup>
// Ícone do sistema. Ponto único: nada de importar lucide nas telas para ícones de significado.
//   <Icone nome="mercado" />                       outline (traço 1,5)
//   <Icone nome="inicio" :tamanho="22" preenchido /> estado ativo (menu, aba, seleção)
//   <Icone nome="🛒" />                            também aceita emoji legado
// Ordem de busca: SVG do designer (src/assets/icones) > lucide do catálogo > ícone genérico.
// Herda a cor do texto (currentColor). Props: nome, tamanho (px), preenchido, traco, titulo (acessibilidade).
import { computed } from 'vue';
import { CATALOGO, definicao, resolverChave } from '../utils/icones.js';
import { svgDoDesigner, temPreenchidoDoDesigner } from '../utils/iconesSvg.js';

const props = defineProps({
  nome: { type: String, default: '' },
  tipo: { type: String, default: '' }, // contexto p/ emojis ambíguos: 'entrada' | 'saida' | 'meta'
  tamanho: { type: [Number, String], default: 20 },
  preenchido: { type: Boolean, default: false },
  traco: { type: Number, default: 1.5 },
  titulo: { type: String, default: '' }, // sem título = decorativo (aria-hidden)
});

const chave = computed(() => resolverChave(props.nome, props.tipo) || 'generico');
const def = computed(() => definicao(chave.value));
const svg = computed(() => svgDoDesigner(chave.value, props.preenchido));
const simularPreenchido = computed(() => props.preenchido && !def.value.linha && !def.value.solido && !temPreenchidoDoDesigner(chave.value));
const solido = computed(() => !!def.value.solido); // marcadores (bolinhas) são sempre cheios
const cor = computed(() => def.value.cor || null);
const a11y = computed(() => (props.titulo ? { role: 'img', 'aria-label': props.titulo } : { 'aria-hidden': 'true' }));
</script>

<template>
  <!-- SVG do designer: 24x24, stroke currentColor -->
  <svg
    v-if="svg"
    class="icone" :width="tamanho" :height="tamanho" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    :stroke-width="traco" stroke-linecap="round" stroke-linejoin="round" v-bind="a11y" v-html="svg"
  />
  <component
    :is="def.c" v-else class="icone" :class="{ 'icone-cheio': simularPreenchido }"
    :size="tamanho" :stroke-width="preenchido && def.linha ? traco + 0.75 : traco"
    :fill="solido || simularPreenchido ? (cor || 'currentColor') : 'none'"
    :color="cor || 'currentColor'" v-bind="a11y"
  />
</template>

<style scoped>
.icone { flex: none; display: inline-block; vertical-align: middle; }
/* "Preenchido" do lucide: miolo com a cor do ícone em transparência (mantém os detalhes internos legíveis) */
.icone-cheio { fill-opacity: var(--icone-preenchimento, 0.28); }
</style>
