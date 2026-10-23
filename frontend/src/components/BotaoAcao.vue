<script setup>
// <BotaoAcao :icone="FileText" rotulo="Ver fatura" tema="saida" @click="..." /> — ação rápida: ícone pequeno
// dentro de um círculo + título CURTO embaixo (padrão de Cartões e Crédito). Vários juntos: <BarraAcoes>.
//
// Props
//   icone     componente lucide-vue-next (obrigatório)
//   rotulo    texto curto (1–2 palavras; quebra em 2 linhas no máximo)
//   tema      cor do ícone/hover: 'entrada'|'saida'|'meta'|'investimento'|'neutro' (padrão neutro)
//   destaque  boolean: círculo cheio em degradê do tema (ação principal, ex.: "Adicionar")
//   disabled  boolean
//   titulo    tooltip (ex.: motivo de estar desabilitado)
//   compacto  boolean: bolha 38px, rótulo 11px, espaços menores (padrão dentro de <TopoValor #acoes> / <CardPadrao #rodape>)
// Variáveis opcionais (o contêiner pode definir; ex.: TopoValor sobre fundo colorido): --acao-bolha (tamanho),
//   --acao-bolha-bg, --acao-bolha-borda, --acao-cor (ícone), --acao-texto (rótulo), --acao-destaque-bg, --acao-destaque-cor.
// Emite 'click' (nativo). Alvo de toque >= 44px.
defineProps({
  icone: { type: [Object, Function], required: true },
  rotulo: { type: String, default: '' },
  tema: { type: String, default: 'neutro' },
  destaque: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  titulo: { type: String, default: '' },
  compacto: { type: Boolean, default: false },
});
</script>

<template>
  <button type="button" :class="['acao', 'tema-' + tema, { destaque, compacto }]" :disabled="disabled" :title="titulo || undefined">
    <span class="bolha"><component :is="icone" :size="compacto ? 18 : 20" :stroke-width="1.9" /></span>
    <span class="rot">{{ rotulo }}</span>
  </button>
</template>

<style scoped>
.acao { --_b: var(--acao-bolha, 48px); display: flex; flex-direction: column; align-items: center; gap: 6px; background: none; border: none; padding: 4px 2px; min-height: 44px; color: var(--acao-texto, var(--cor-texto)); font: 500 11.5px/1.2 var(--fonte-texto); text-align: center; cursor: pointer; width: 100%; min-width: 0; }
.acao.compacto { --_b: var(--acao-bolha, 38px); gap: 4px; padding: 2px; font-size: 11px; }
.bolha { width: var(--_b); height: var(--_b); border-radius: 50%; display: grid; place-items: center; background: var(--acao-bolha-bg, var(--cor-card)); border: 1px solid var(--acao-bolha-borda, var(--cor-card-borda)); color: var(--acao-cor, var(--tema-cor)); transition: transform var(--anim-rapida) ease, background var(--anim-padrao) ease; }
.acao:hover .bolha { background: var(--acao-bolha-hover, var(--tema-fundo)); }
.acao:active .bolha { transform: scale(0.94); }
.acao:focus-visible { outline: none; }
.acao:focus-visible .bolha { box-shadow: 0 0 0 3px color-mix(in srgb, var(--acao-cor, var(--tema-cor)) 35%, transparent); }
.acao.destaque .bolha { background: var(--acao-destaque-bg, var(--tema-degrade)); border-color: transparent; color: var(--acao-destaque-cor, var(--cor-sobre-cor)); }
.acao.destaque:hover .bolha { background: var(--acao-destaque-bg, var(--tema-degrade)); filter: brightness(1.08); }
.acao:disabled { opacity: 0.4; cursor: default; }
.acao:disabled:hover .bolha { background: var(--acao-bolha-bg, var(--cor-card)); }
.rot { overflow-wrap: anywhere; }
</style>
