<script setup>
// <TopoValor> — card de topo de valores de TODAS as páginas (exceto o Dashboard).
// Homologação 1.0, seção 2 (aprovada em 30/10/2026, prévia previa-cards-discretos.png): card DISCRETO — fundo igual aos
// outros cards, o degradê do tema/sinal vira só ACENTO (faixa fina no topo + brilho bem suave no canto), valor menor (26 px)
// na cor do sinal, ações no estilo normal dos botões. Sem a assinatura de arcos no fundo.
// Modelo: card "Saldo total" do Dashboard — degradê do tema da página, rótulo pequeno, valor grande,
// linhas de informação embaixo e um círculo decorativo se misturando ao fundo. Texto sempre branco
// (--cor-sobre-cor): os degradês dos temas foram escolhidos para dar contraste nos dois temas claro/escuro.
//
// REGRA DO SINAL (v2): o card muda de cor pelo sinal do valor — positivo = verde (↓ entrada), zerado = menta (=), negativo = carmim (↑ saída) —
// e o valor sempre aparece com sinal (+/−) e ícone, nunca só cor. tema 'entrada': sinal do próprio valor; 'saida': negativo (zero = menta);
// 'neutro': sinal do valor; 'meta' e 'investimento' mantêm a cor própria (roxo / petróleo). Prop `sinal` força ('pos'|'zero'|'neg') ou desliga ('none').
//
// Props
//   sinal   'auto' (padrão) | 'pos' | 'zero' | 'neg' | 'none'
//   tema    'entrada' | 'saida' | 'meta' | 'investimento' | 'neutro'  (padrão 'neutro')
//   rotulo  texto pequeno acima do valor (ex.: "Saldo do mês")
//   valor   number (formatado em R$) ou string já formatada
//   periodo texto opcional ao lado do rótulo (ex.: "outubro")
//   linhas  [{ rotulo, valor, destaque? }]  — valor number (vira R$) ou string; destaque = linha de total
//   negativo boolean opcional; por padrão detecta valor < 0 e mostra o valor com leve alerta (ícone ▼ não usado)
//   variante 1..4 — assinatura decorativa do fundo (arcos finos + ponto, lado direito, bem transparentes).
//            Cada variante muda tamanho, posição e rotação; use variantes DIFERENTES em cards vizinhos/telas
//            diferentes (a identidade se repete, a decoração não). Padrão 1. `semAssinatura` desliga.
// Slots: #rotulo, #valor (substitui o número), #linhas (substitui o array), default (extra abaixo das linhas,
//        ex.: BarraDegrade), #lateral (canto superior direito: botão/ícone),
//        #acoes (RODAPÉ DO PRÓPRIO CARD: ações da página, compactas e em branco-translúcido sobre o degradê).
//        Alias: #rodape. Use <BarraAcoes compacto> + <BotaoAcao compacto> (ver exemplo abaixo).
// Exemplo com ações dentro do card:
//   <TopoValor tema="saida" variante="2" rotulo="Dívidas" :valor="total">
//     <template #acoes><BarraAcoes compacto :colunas="3"><BotaoAcao compacto :icone="Plus" rotulo="Nova" destaque /> ...</BarraAcoes></template>
//   </TopoValor>
// Exemplo:
//   <TopoValor tema="saida" rotulo="Gasto do mês" :valor="2310.5" :linhas="[{rotulo:'Limite',valor:3000},{rotulo:'Disponível',valor:689.5,destaque:true}]" />
import { computed, onMounted, onBeforeUnmount } from 'vue';
import { ArrowDown, ArrowUp, Equal } from 'lucide-vue-next';
import BotaoOlho from './BotaoOlho.vue';
import { ocultar, topoValorMontados, MASCARA } from '../services/privacidade.js';
import { intervaloTxt } from '../services/mes.js';

const props = defineProps({
  tema: { type: String, default: 'neutro', validator: (v) => ['entrada', 'saida', 'meta', 'investimento', 'neutro'].includes(v) },
  rotulo: { type: String, default: '' },
  valor: { type: [Number, String], default: 0 },
  periodo: { type: String, default: '' },
  linhas: { type: Array, default: () => [] },
  variante: { type: [Number, String], default: 1 },
  semAssinatura: { type: Boolean, default: false },
  sinal: { type: String, default: 'auto' },
  semOlho: { type: Boolean, default: false }, // sem o botão de olho (ocultar valores) no canto do card
});
// Anotação 57: com o mês financeiro fora do dia 1, a legenda mostra o período real ("Saldo do mês · 07/10 a 08/11")
// no lugar do nome do mês. O filtro de meses mostra só o ano embaixo do mês.
const periodoMostrado = computed(() => (props.periodo && intervaloTxt.value ? intervaloTxt.value : props.periodo));

onMounted(() => { topoValorMontados.value += 1; });
onBeforeUnmount(() => { topoValorMontados.value -= 1; });
// tamanho (px), deslocamentos e rotação da assinatura por variante
const VARIANTES = {
  1: { t: 210, r: -56, y: 8, rot: -20, a: [1, 1, 1] },
  2: { t: 150, r: -24, y: -34, rot: 35, a: [1, 1, 0] },
  3: { t: 250, r: -96, y: 30, rot: 120, a: [1, 0, 1] },
  4: { t: 120, r: -4, y: 52, rot: -75, a: [0, 1, 1] },
};
const v = computed(() => VARIANTES[Number(props.variante)] || VARIANTES[1]);
const estiloAss = computed(() => ({ width: v.value.t + 'px', height: v.value.t + 'px', right: v.value.r + 'px', top: v.value.y + 'px', transform: `rotate(${v.value.rot}deg)` }));
const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
// com "ocultar valores" ligado, todo valor do card (total e linhas) vira ••••
const f = (v) => (ocultar.value ? MASCARA : typeof v === 'number' ? fmt.format(v) : v);
const num = computed(() => (typeof props.valor === 'number' && Number.isFinite(props.valor) ? props.valor : null));
// estado do sinal: 'pos' | 'zero' | 'neg' | null (sem regra do sinal)
const estado = computed(() => {
  if (props.sinal === 'none') return null;
  if (['pos', 'zero', 'neg'].includes(props.sinal)) return props.sinal;
  const n = num.value;
  const zero = n !== null && Math.abs(n) < 0.005;
  if (props.tema === 'saida') return zero ? 'zero' : 'neg';
  if (props.tema === 'entrada') return zero ? 'zero' : n !== null && n < 0 ? 'neg' : 'pos';
  if (props.tema === 'neutro' && n !== null) return zero ? 'zero' : n < 0 ? 'neg' : 'pos';
  return null;
});
const valorTxt = computed(() => {
  const n = num.value;
  const e = estado.value;
  if (n === null || !e || ocultar.value) return f(props.valor);
  if (e === 'zero') return fmt.format(0);
  return (e === 'neg' ? '− ' : '+ ') + fmt.format(Math.abs(n));
});
const ROTULO_ESTADO = { pos: 'Entrada', zero: 'Zerado', neg: 'Saída' };
const negativo = computed(() => estado.value === 'neg');
</script>

<template>
  <section :class="['topo-valor', 'tema-' + tema, estado ? 'sinal-' + estado : '', { comAcoes: $slots.acoes || $slots.rodape }]" :aria-label="rotulo">
    <svg v-if="!semAssinatura" class="assinatura" :style="estiloAss" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <circle v-if="v.a[0]" cx="50" cy="50" r="46" pathLength="100" stroke-dasharray="34 6 22 38" />
      <circle v-if="v.a[1]" cx="50" cy="50" r="34" pathLength="100" stroke-dasharray="40 60" transform="rotate(110 50 50)" />
      <circle v-if="v.a[2]" cx="50" cy="50" r="22" pathLength="100" stroke-dasharray="28 72" transform="rotate(230 50 50)" />
      <circle class="ponto" cx="88" cy="26" r="3.4" />
    </svg>
    <div v-if="$slots.lateral || !semOlho" class="lateral">
      <slot name="lateral" />
      <BotaoOlho v-if="!semOlho" claro :tamanho="34" />
    </div>
    <span class="rotulo"><slot name="rotulo">{{ rotulo }}</slot><span v-if="periodoMostrado" class="periodo"> · {{ periodoMostrado }}</span></span>
    <strong class="valor numero-tabular" :class="{ negativo }">
      <span v-if="estado" class="sinal-ico" aria-hidden="true"><ArrowUp v-if="estado === 'neg'" :size="15" :stroke-width="2.6" /><ArrowDown v-else-if="estado === 'pos'" :size="15" :stroke-width="2.6" /><Equal v-else :size="15" :stroke-width="2.6" /></span>
      <span v-if="estado" class="so-leitor">{{ ROTULO_ESTADO[estado] }}: </span><slot name="valor">{{ valorTxt }}</slot>
    </strong>
    <slot name="linhas">
      <dl v-if="linhas.length" class="linhas">
        <div v-for="(l, i) in linhas" :key="i" :class="{ destaque: l.destaque }">
          <dt>{{ l.rotulo }}</dt><dd class="numero-tabular">{{ f(l.valor) }}</dd>
        </div>
      </dl>
    </slot>
    <slot />
    <div v-if="$slots.acoes || $slots.rodape" class="acoes-topo"><slot name="acoes"><slot name="rodape" /></slot></div>
  </section>
</template>

<style scoped>
.topo-valor {
  --acento-1: var(--meta-violeta-medio, #5E18D8); --acento-2: var(--cor-investimento, #1597A8); --valor-cor: var(--cor-texto); --cor-sobre-cor: var(--cor-texto);
  position: relative; overflow: hidden; border-radius: var(--raio-card, 16px); padding: 16px 16px 14px; color: var(--cor-texto);
  background: var(--cor-card); border: 1px solid var(--cor-card-borda, var(--cor-borda)); display: flex; flex-direction: column; gap: 4px;
  font-family: var(--fonte-texto); min-width: 0;
}
/* acento: faixa fina no topo + brilho suave no canto superior esquerdo */
.topo-valor::before { content: ''; position: absolute; inset: 0 0 auto 0; height: 3px; z-index: 0; background: linear-gradient(90deg, var(--acento-1), var(--acento-2) 60%, transparent); }
.topo-valor::after { content: ''; position: absolute; inset: 0; z-index: 0; pointer-events: none; background: radial-gradient(120% 70% at 0% 0%, color-mix(in srgb, var(--acento-1) 13%, transparent), transparent 60%); }
.tema-meta { --acento-1: var(--meta-violeta-medio, #5E18D8); --acento-2: var(--meta-orquidea-medio, #AF32BD); --valor-cor: var(--cor-texto); }
.tema-investimento { --acento-1: #22C3D6; --acento-2: var(--investimento-esmeralda-escuro, #0B5C68); }
.sinal-pos { --acento-1: #4CC27A; --acento-2: #167A42; --valor-cor: var(--cor-entrada-texto, var(--cor-entrada)); }
.sinal-zero { --acento-1: #B9EBD6; --acento-2: #9FE3C8; --valor-cor: var(--sinal-zero-texto, var(--cor-texto)); }
.sinal-neg { --acento-1: #CE2239; --acento-2: #DFA511; --valor-cor: var(--cor-saida-texto, var(--cor-saida)); }
.assinatura { display: none; }
.topo-valor > :not(.assinatura) { position: relative; z-index: 1; }
.acoes-topo { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--cor-borda);
  --acao-bolha: 36px; --acao-cor: var(--acento-1); --acao-texto: var(--cor-texto-suave);
  --acao-destaque-bg: linear-gradient(135deg, var(--acento-1), var(--acento-2)); --acao-destaque-cor: #fff; }
.acoes-topo :deep(.barra-acoes) { grid-template-columns: repeat(auto-fit, minmax(56px, 1fr)); gap: 4px 2px; }
.acoes-topo :deep(.acao) { gap: 4px; padding: 2px; font-size: 11px; }
.topo-valor > .lateral { position: absolute; top: 8px; right: 8px; z-index: 2; display: flex; align-items: center; gap: 6px; color: var(--cor-texto-suave); }
.rotulo { font-size: 13px; font-weight: 600; color: var(--cor-texto-suave); padding-right: 40px; }
.periodo { font-weight: 400; }
.valor { font-family: var(--fonte-display); font-size: 26px; line-height: 1.15; overflow-wrap: anywhere; color: var(--valor-cor); }
.valor .sinal-ico { vertical-align: 0.12em; margin-right: 6px; }
.sinal-ico { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%;
  background: color-mix(in srgb, var(--valor-cor) 14%, transparent); box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--valor-cor) 50%, transparent); }
.so-leitor { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.linhas { margin: 6px 0 0; padding-top: 8px; border-top: 1px solid var(--cor-borda); display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.linhas > div { display: flex; justify-content: space-between; gap: 12px; }
.linhas dt { color: var(--cor-texto-suave); }
.linhas dd { margin: 0; font-weight: 600; }
.linhas .destaque { padding-top: 6px; border-top: 1px dashed var(--cor-borda); font-size: 14px; }
.linhas .destaque dt { color: var(--cor-texto); font-weight: 600; }
</style>
