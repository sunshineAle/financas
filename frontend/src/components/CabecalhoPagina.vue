<script setup>
// Cabeçalho único das telas: título pequeno + fileira de meses em FICHÁRIO (SeletorMes) + slot de ações à direita.
// Props: titulo (String), semMes (Boolean — sem fileira, título CENTRALIZADO e ações à direita), cor (cor de DESTAQUE
// do tema da página; é a cor só do texto do mês/ano na aba), compacto, semSetas, semAtalhos (repassados ao SeletorMes).
// Slots: padrão (ações à direita, ex.: botões de ícone), `esquerda` (opcional, antes do título, ex.: botão voltar),
//   `corpo` (NOVO, recomendado): todo o conteúdo da página que depende do mês. Ele vira UM BLOCO ÚNICO com o fundo
//   da aba, da aba para baixo (acima da aba a página fica sem fundo). Sem o slot, a aba aparece "solta" (compatível).
//     <CabecalhoPagina titulo="Transações" cor="var(--entrada-cobalto-medio)">
//       <template #corpo> <div v-deslizar-mes> ...TopoValor, ações, listas... </div> </template>
//     </CabecalhoPagina>
//   Dentro do bloco os cards (CardPadrao) usam um tom um pouco mais fundo (--cor-card sobrescrito) para continuarem
//   visíveis sobre o fundo do bloco. Quem não usar o componente pode aplicar a classe global `.bloco-mes` num <div>
//   logo abaixo de um <SeletorMes ligada> (ficando sem espaço entre os dois).
//   Com `sem-mes` o slot `corpo` é só renderizado, sem bloco.
// PC: tudo numa linha (título | fileira | ações). Celular: linha 1 título + ações; linha 2 fileira.
import { computed, useSlots, Comment, Fragment, Text } from 'vue';
import { useRoute } from 'vue-router';
import SeletorMes from './SeletorMes.vue';
import { voltarDaRota } from '../config/menu.js';
import { ehCelular } from '../services/layout.js';
// Anotações 62/63: o título de TODAS as páginas fica no TopoApp (centralizado no celular, à esquerda no PC), então aqui
// ele não aparece (o prop `titulo` segue aceito). O slot `esquerda` some quando o topo já mostra a seta "Voltar".
// Sem título, sem ações e sem fileira de meses, o cabeçalho não ocupa espaço (nenhuma margem extra acima do conteúdo).
const props = defineProps({
  titulo: { type: String, default: '' },
  semMes: { type: Boolean, default: false },
  cor: { type: String, default: 'var(--cor-primaria)' },
  compacto: { type: Boolean, default: false },
  semSetas: { type: Boolean, default: false },
  semAtalhos: { type: Boolean, default: false },
});
const route = useRoute();
const slots = useSlots();
// Slot "vazio" = só comentários de v-if (ex.: botão que aparece só às vezes). Avaliado na renderização, então é reativo.
const temNos = (nos) => (nos || []).some((n) => n.type !== Comment && (n.type === Fragment ? temNos(n.children) : n.type !== Text || String(n.children).trim()));
const temSlot = (nome) => !!slots[nome] && temNos(slots[nome]());
const comEsq = () => temSlot('esquerda') && !voltarDaRota(route, ehCelular.value);
const linhaVazia = () => !comEsq() && !temSlot('default');
const faixaVazia = () => linhaVazia() && props.semMes;
</script>

<template>
  <div class="cabecalho-pagina" :class="{ 'com-bloco': $slots.corpo && !semMes, oculto: faixaVazia() && !$slots.corpo }">
    <header v-if="!faixaVazia()" class="faixa" :class="{ 'sem-mes': semMes }">
      <div v-if="!linhaVazia()" class="linha-titulo">
        <div v-if="comEsq()" class="esq"><slot name="esquerda" /></div>
        <div class="acoes"><slot /></div>
      </div>
      <div v-if="!semMes" class="linha-mes">
        <SeletorMes :cor="cor" :compacto="compacto" :sem-setas="semSetas" :sem-atalhos="semAtalhos" :ligada="!!$slots.corpo" />
      </div>
    </header>
    <div v-if="$slots.corpo && !semMes" class="bloco-mes"><slot name="corpo" /></div>
    <slot v-else name="corpo" />
  </div>
</template>

<style>
/* BLOCO ÚNICO do mês (global): fundo da aba, da aba para baixo. */
.bloco-mes {
  --cor-card: color-mix(in srgb, var(--mes-fundo, var(--cor-fundo-elevado)) 55%, var(--cor-fundo));
  background: var(--mes-fundo, var(--cor-fundo-elevado)); border-radius: var(--raio-card, 16px);
  padding: var(--espaco-card, 16px); display: flex; flex-direction: column; gap: var(--espaco-secao, 12px); min-width: 0;
}
@media (max-width: 600px) { .bloco-mes { padding: 8px; gap: var(--espaco-secao, 10px); } }
</style>

<style scoped>
.cabecalho-pagina { display: flex; flex-direction: column; gap: 0; width: 100%; min-width: 0; }
.cabecalho-pagina.oculto { display: none; }
.cabecalho-pagina:not(.com-bloco) { gap: var(--espaco-secao, 12px); }
.faixa { display: flex; flex-direction: column; gap: 6px; width: 100%; min-width: 0; }
.linha-titulo { display: flex; align-items: center; gap: 10px; min-height: 36px; }
.esq { display: flex; align-items: center; flex: 0 0 auto; }
.acoes { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; margin-left: auto; }
.linha-mes { min-width: 0; }
@media (min-width: 769px) {
  .faixa:not(.sem-mes) { flex-direction: row; align-items: flex-end; gap: 16px; }
  .faixa:not(.sem-mes) .linha-titulo { display: contents; }
  .faixa:not(.sem-mes) .esq { order: 0; align-self: center; }
  .faixa:not(.sem-mes) .linha-mes { order: 2; flex: 1 1 auto; }
  .faixa:not(.sem-mes) .acoes { order: 3; align-self: center; }
}
</style>
