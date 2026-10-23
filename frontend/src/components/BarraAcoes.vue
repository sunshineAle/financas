<script setup>
// <BarraAcoes> — grade de <BotaoAcao>: colunas iguais, centralizadas, sem rolagem horizontal.
//   <BarraAcoes :colunas="4"> <BotaoAcao .../> <BotaoAcao .../> </BarraAcoes>
// Props: colunas (número; padrão = quantidade de filhos até 5, via auto-fit), rotulo (aria-label),
//   compacto (boolean: espaços menores; os BotaoAcao filhos NÃO mudam sozinhos — passe `compacto` neles,
//   ou use o slot #acoes do <TopoValor>, que já deixa tudo compacto).
defineProps({ colunas: { type: Number, default: 0 }, rotulo: { type: String, default: 'Ações' }, compacto: { type: Boolean, default: false } });
</script>

<template>
  <nav :class="['barra-acoes', { compacto }]" :aria-label="rotulo" :style="colunas ? { gridTemplateColumns: `repeat(${colunas}, minmax(0, 1fr))` } : null"><slot /></nav>
</template>

<style scoped>
.barra-acoes { display: grid; grid-template-columns: repeat(auto-fit, minmax(72px, 1fr)); gap: 8px 4px; align-items: start; }
.barra-acoes.compacto { grid-template-columns: repeat(auto-fit, minmax(56px, 1fr)); gap: 4px 2px; }
</style>
