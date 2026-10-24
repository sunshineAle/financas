<script setup>
// Uma linha de lançamento da página Transações: ícone da categoria em quadrado colorido, descrição com
// conta/cartão em texto secundário, valor à direita com sinal e cor. No celular é uma linha limpa;
// no PC ganha uma coluna leve de categoria. Componente exclusivo da frente "transações".
import { computed } from 'vue';
import { CreditCard } from 'lucide-vue-next';
import IconeCategoria from './IconeCategoria.vue';
import IconeBanco from './IconeBanco.vue';

const props = defineProps({
  t: { type: Object, required: true },
  info: { type: Object, required: true }, // { nome, cor, icone, neutra, tipoNeutro }
  mostrarData: { type: Boolean, default: false },
});
defineEmits(['abrir', 'menu']);

const moeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const ehSaida = computed(() => props.t.valor < 0);
const classeValor = computed(() => (props.info.neutra ? 'neutro' : ehSaida.value ? 'negativo' : 'positivo'));
const iconeValor = computed(() => (props.info.neutra ? (props.info.tipoNeutro === 'fatura' ? 'fatura-fechada' : 'transferir') : (props.info.icone || '')));
const dataCurta = computed(() => { const [, m, d] = String(props.t.data).slice(0, 10).split('-'); return `${d}/${m}`; });
const sub = computed(() => props.t.subcategoria);
</script>

<template>
  <div class="linha" :class="{ ignorada: t.ignorada === 1, 'fora-totais': t.ignorada === 2 }" tabindex="0" role="button" :aria-label="`Ver detalhes de ${t.descricao}`" @click="$emit('abrir', t)" @keydown.enter="$emit('abrir', t)">
    <IconeCategoria class="ic" :valor="iconeValor" :tipo="ehSaida ? 'saida' : 'entrada'" :cor="info.neutra ? 'var(--cor-texto-suave)' : (info.cor || '')" :tamanho="40" />

    <span class="textos">
      <span class="descricao">{{ t.descricao }}</span>
      <span class="secundario">
        <span class="cat-mobile">{{ info.nome }}<template v-if="sub"> › {{ sub }}</template></span><span class="ponto">·</span>
        <IconeBanco :icone="t.conta_icone" :nome="t.conta_nome" :tamanho="14" :padrao="t.cartao ? '💳' : '🏦'" />
        <span class="conta">{{ t.conta_nome }}</span>
        <span v-if="t.cartao" class="chip-mini"><CreditCard :size="11" :stroke-width="2.2" />cartão</span>
        <span v-else-if="t.origem === 'conectada'" class="chip-mini">banco</span>
        <span v-if="mostrarData" class="ponto">·</span><span v-if="mostrarData">{{ dataCurta }}</span>
        <span v-if="t.tipo_mov" class="chip-mini">{{ String(t.tipo_mov).startsWith('transferencia') ? 'transferência' : t.tipo_mov === 'estornada' ? 'estornada' : 'estorno' }}</span>
        <span v-else-if="t.ignorada" class="chip-mini">ignorada</span>
      </span>
    </span>

    <span class="col-cat">
      <span class="nome-cat">{{ info.nome }}</span>
      <span v-if="sub" class="sub">{{ sub }}</span>
    </span>

    <span class="valor numero-tabular" :class="classeValor">{{ t.valor > 0 ? '+' : '−' }} {{ moeda(Math.abs(t.valor)) }}</span>

    <button type="button" class="pontos" aria-label="Opções da transação" @click.stop="$emit('menu', t, $event)">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" /></svg>
    </button>
  </div>
</template>

<style scoped>
.linha {
  display: grid; grid-template-columns: 40px minmax(0, 1fr) auto 36px; grid-template-areas: 'ic tx vl mn'; align-items: center; gap: 10px;
  padding: 10px 0 10px 4px; min-height: 56px; border-radius: 14px; cursor: pointer;
  transition: background var(--anim-rapida) ease; -webkit-tap-highlight-color: transparent;
}
.linha:hover, .linha:focus-visible { background: var(--cor-realce); outline: none; }
.ic { grid-area: ic; }
.textos { grid-area: tx; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.descricao { font-size: 15px; font-weight: 600; color: var(--cor-texto); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; line-height: 1.3; }
/* Linha de baixo (anotação 34): categoria, conta/cartão e etiquetas numa linha só, cortando com reticências. */
.secundario { display: flex; align-items: center; flex-wrap: nowrap; gap: 5px; font-size: 12px; color: var(--cor-texto-suave); min-width: 0; white-space: nowrap; overflow: hidden; }
.conta { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.chip-mini { display: inline-flex; align-items: center; gap: 3px; font-size: 10.5px; font-weight: 600; padding: 1px 6px; border-radius: 999px; border: 1px solid var(--cor-borda); flex: none; }
.col-cat { display: none; }
.cat-mobile { display: inline-flex; gap: 5px; flex: 0 1 auto; min-width: 0; color: var(--cor-texto); opacity: 0.8; overflow: hidden; text-overflow: ellipsis; }
.valor { grid-area: vl; font-family: var(--fonte-display); font-weight: 600; font-size: 15px; white-space: nowrap; text-align: right; }
.valor.positivo { color: var(--txt-entrada, var(--cor-entrada)); }
.valor.negativo { color: var(--txt-saida, var(--cor-saida)); }
.valor.neutro { color: var(--cor-texto-suave); }
.pontos {
  grid-area: mn; width: 36px; height: 44px; display: grid; place-items: center; padding: 0; border: none; background: transparent; color: var(--cor-texto-suave);
  border-radius: 12px; cursor: pointer; font-family: inherit;
}
.pontos:hover { background: var(--cor-realce); color: var(--cor-texto); }
.linha.ignorada { opacity: 0.5; }
.linha.ignorada .descricao { text-decoration: line-through; }
.linha.fora-totais .descricao { color: var(--cor-texto-suave); }

@media (min-width: 769px) {
  .linha { grid-template-columns: 40px minmax(0, 1fr) minmax(120px, auto) 44px; grid-template-areas: 'ic tx vl mn'; gap: 16px; }
}
</style>
