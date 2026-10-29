<script setup>
// <CardPadrao> — molde ÚNICO de card do sistema (o de Objetivos): fundo --cor-card, borda, raio e espaçamento
// iguais em todas as telas. Nada de fundo arroxeado/colorido em card comum; use o `tema` só para um
// filete de acento opcional. Cards de DESTAQUE de valores usam <TopoValor>, não este.
//
// Props
//   titulo    título opcional (h2) no cabeçalho
//   subtitulo texto pequeno ao lado/abaixo do título
//   tema      opcional: 'entrada'|'saida'|'meta'|'investimento'|'neutro' -> filete de acento no topo
//   tag       elemento HTML (padrão 'section'); 'button'/'a' quando o card inteiro é clicável (use `clicavel`)
//   clicavel  hover + foco + cursor (emite 'abrir' com clique/Enter)
//   semPadding remove o padding (listas que vão até a borda)
// Slots: default, #cabecalho (substitui título), #acoes (canto direito do cabeçalho, ex.: <MenuPontos>), #rodape.
// Ações no rodapé (padrão do card da fatura): <template #rodape><BarraAcoes compacto><BotaoAcao compacto .../></BarraAcoes></template>
// — o rodapé já compacta BarraAcoes/BotaoAcao (bolha 38px) e dispensa a linha divisória extra.
// Exemplo: <CardPadrao titulo="Contas"><template #acoes><MenuPontos>...</MenuPontos></template> ...conteúdo... </CardPadrao>
// ajuda (opcional): id em config/ajudaSecoes.js — "?" minúsculo ao lado do título com a explicação (anotação 64).
import AjudaSecao from './AjudaSecao.vue';
defineProps({
  titulo: { type: String, default: '' },
  subtitulo: { type: String, default: '' },
  tema: { type: String, default: '' },
  tag: { type: String, default: 'section' },
  clicavel: { type: Boolean, default: false },
  semPadding: { type: Boolean, default: false },
  ajuda: { type: String, default: '' },
});
defineEmits(['abrir']);
</script>

<template>
  <component :is="tag" :class="['card-padrao', tema && 'tema-' + tema, { comAcento: tema, clicavel, semPadding }]" :tabindex="clicavel ? 0 : undefined" :role="clicavel ? 'button' : undefined" @click="clicavel && $emit('abrir')" @keydown.enter.self="clicavel && $emit('abrir')">
    <header v-if="titulo || $slots.cabecalho || $slots.acoes" class="cab">
      <slot name="cabecalho"><div class="tit"><h2 v-if="titulo">{{ titulo }}<AjudaSecao v-if="ajuda" :secao="ajuda" /></h2><small v-if="subtitulo">{{ subtitulo }}</small></div></slot>
      <div v-if="$slots.acoes" class="acoes"><slot name="acoes" /></div>
    </header>
    <slot />
    <footer v-if="$slots.rodape" class="rod"><slot name="rodape" /></footer>
  </component>
</template>

<style scoped>
.card-padrao { position: relative; background: var(--cor-card); border: 1px solid var(--cor-card-borda); border-radius: var(--raio-card); padding: var(--espaco-card); display: flex; flex-direction: column; gap: 12px; min-width: 0; color: var(--cor-texto); font-family: var(--fonte-texto); text-align: left; }
.card-padrao.semPadding { padding: 0; gap: 0; overflow: hidden; }
.card-padrao.semPadding .cab { padding: var(--espaco-card) var(--espaco-card) 0; }
.card-padrao.comAcento { overflow: hidden; }
.card-padrao.comAcento::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 3px; background: var(--tema-degrade); }
.card-padrao.clicavel { cursor: pointer; transition: transform var(--anim-rapida) ease, border-color var(--anim-padrao) ease; }
.card-padrao.clicavel:hover { border-color: color-mix(in srgb, var(--cor-texto-suave) 45%, var(--cor-card-borda)); }
.card-padrao.clicavel:active { transform: scale(0.99); }
.card-padrao.clicavel:focus-visible { outline: 2px solid var(--tema-cor, var(--cor-primaria)); outline-offset: 2px; }
.cab { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.tit { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.tit h2 { margin: 0; font-family: var(--fonte-display); font-size: 17px; }
.tit small { font-size: 12px; color: var(--cor-texto-suave); }
.acoes { flex: none; display: flex; align-items: center; gap: 4px; }
.rod { border-top: 1px solid var(--cor-card-borda); padding-top: 8px; --acao-bolha: 38px; }
.rod :deep(.barra-acoes) { grid-template-columns: repeat(auto-fit, minmax(56px, 1fr)); gap: 4px 2px; }
.rod :deep(.acao) { gap: 4px; padding: 2px; font-size: 11px; }
</style>
