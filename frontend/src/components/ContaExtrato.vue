<script setup>
// Extrato da conta agrupado por data (visão anual: por mês). Cada linha é a LinhaTransacao (anotação 53),
// a mesma de Transações: ícone com selo do banco, meio de pagamento, categoria, valor com sinal e menu ⋮.
import { computed } from 'vue';
import LinhaTransacao from './LinhaTransacao.vue';
import { infoTransacao } from '../utils/infoTransacao.js';

const props = defineProps({
  transacoes: { type: Array, default: () => [] },
  carregando: { type: Boolean, default: false },
  porMes: { type: Boolean, default: false },
  categorias: { type: Array, default: () => [] }, // categorias de saída (icone/cor)
});
const emit = defineEmits(['abrir']);
const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function rotuloDia(dia) {
  const hoje = new Date();
  const ontem = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1);
  const [, m, d] = dia.split('-').map(Number);
  const curto = `${d} ${MES[m - 1]}`;
  if (dia === iso(hoje)) return `Hoje · ${curto}`;
  if (dia === iso(ontem)) return `Ontem · ${curto}`;
  return curto;
}
const grupos = computed(() => {
  const mapa = new Map();
  for (const t of props.transacoes) {
    const dia = String(t.data).slice(0, 10);
    const chave = props.porMes ? dia.slice(0, 7) : dia;
    if (!mapa.has(chave)) mapa.set(chave, []);
    mapa.get(chave).push(t);
  }
  return [...mapa.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([chave, itens]) => ({
    chave, itens,
    rotulo: props.porMes ? MES_LONGO[Number(chave.slice(5, 7)) - 1] : rotuloDia(chave),
    total: itens.filter((t) => !t.ignorada).reduce((s, t) => s + t.valor, 0),
  }));
});
const infoDe = (t) => infoTransacao(t, { categorias: props.categorias });
const sinal = (v) => (v > 0 ? '+' : v < 0 ? '−' : '');
</script>

<template>
  <div class="extrato">
    <p v-if="carregando" class="vazio">Carregando…</p>
    <p v-else-if="!grupos.length" class="vazio">Nenhuma transação neste período.</p>
    <section v-for="g in grupos" :key="g.chave" class="grupo">
      <header>
        <h3>{{ g.rotulo }}</h3>
        <span class="numero-tabular total">{{ sinal(g.total) }} {{ moeda.format(Math.abs(g.total)) }}</span>
      </header>
      <LinhaTransacao v-for="t in g.itens" :key="t.id" :t="t" :info="infoDe(t)" rotulo-abrir="abrir em Transações" @abrir="emit('abrir', t)">
        <template #menu>
          <button type="button" @click="emit('abrir', t)">Ver em Transações</button>
        </template>
      </LinhaTransacao>
    </section>
  </div>
</template>

<style scoped>
.extrato { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.vazio { margin: 0; font-size: 13px; color: var(--cor-texto-suave); padding: 18px 0; text-align: center; }
.grupo header { display: flex; justify-content: space-between; align-items: baseline; margin: 0 6px 2px; }
.grupo h3 { margin: 0; font-size: 12px; font-weight: 600; color: var(--cor-texto-suave); text-transform: capitalize; letter-spacing: 0.02em; }
.total { font-size: 12px; color: var(--cor-texto-suave); }
</style>
