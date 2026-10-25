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
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import SeletorMes from './SeletorMes.vue';
import { ROTAS_COM_TOPO } from '../config/menu.js';
import { ehCelular } from '../services/layout.js';
defineProps({
  titulo: { type: String, default: '' },
  semMes: { type: Boolean, default: false },
  cor: { type: String, default: 'var(--cor-primaria)' },
  compacto: { type: Boolean, default: false },
  semSetas: { type: Boolean, default: false },
  semAtalhos: { type: Boolean, default: false },
});
// Nas telas com TopoApp (exceto Início) o título aparece CENTRALIZADO no topo, entre a foto e o sino; aqui fica só para leitores de tela.
const route = useRoute();
// No celular o título fica centralizado no topo (TopoApp). Em tela grande, nas páginas com filtro mensal, ele fica aqui, ao lado do filtro.
const noTopo = computed(() => route.name !== 'dashboard' && ROTAS_COM_TOPO.includes(route.name) && ehCelular.value);
</script>

<template>
  <div class="cabecalho-pagina" :class="{ 'com-bloco': $slots.corpo && !semMes }">
    <header class="faixa" :class="{ 'sem-mes': semMes }">
      <div class="linha-titulo" :class="{ vazia: noTopo && !$slots.esquerda && !$slots.default }">
        <div class="esq"><slot name="esquerda" /></div>
        <h1 class="titulo-pequeno" :class="{ 'sr-only': noTopo }">{{ titulo }}</h1>
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
.cabecalho-pagina:not(.com-bloco) { gap: var(--espaco-secao, 12px); }
.faixa { display: flex; flex-direction: column; gap: 6px; width: 100%; min-width: 0; }
.linha-titulo { display: flex; align-items: center; gap: 10px; min-height: 36px; }
.esq { display: flex; align-items: center; flex: 0 0 auto; }
.esq:empty { display: none; }
.titulo-pequeno { margin: 0; font-family: var(--fonte-display); font-size: 15px; font-weight: 600; letter-spacing: 0.02em; color: var(--cor-texto-suave); flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.acoes { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
.linha-mes { min-width: 0; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; flex: 0 0 auto !important; }
.linha-titulo.vazia { display: none; }
.linha-titulo:has(.sr-only) { justify-content: flex-end; }
.sem-mes .linha-titulo { position: relative; justify-content: center; }
.sem-mes .titulo-pequeno { flex: 0 1 auto; text-align: center; color: var(--cor-texto); }
.sem-mes .esq { position: absolute; left: 0; top: 50%; transform: translateY(-50%); }
.sem-mes .acoes { position: absolute; right: 0; top: 50%; transform: translateY(-50%); }
@media (min-width: 769px) {
  .faixa:not(.sem-mes) { flex-direction: row; align-items: flex-end; gap: 16px; }
  .faixa:not(.sem-mes) .linha-titulo { display: contents; }
  .faixa:not(.sem-mes) .esq { order: 0; align-self: center; }
  .faixa:not(.sem-mes) .titulo-pequeno { order: 1; flex: 0 0 auto; align-self: center; max-width: 30%; }
  .faixa:not(.sem-mes) .linha-mes { order: 2; flex: 1 1 auto; }
  .faixa:not(.sem-mes) .acoes { order: 3; align-self: center; }
}
</style>
