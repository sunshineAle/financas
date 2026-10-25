<script setup>
import { iconeDoItem } from '../utils/iconesCategoria.js';
// Extrato da conta agrupado por data (visão anual: por mês). Linhas no padrão da lista de Transações:
// ícone da categoria, descrição, categoria, valor com sinal e menu ⋮.
import { computed } from 'vue';
import IconeCategoria from './IconeCategoria.vue';
import MenuPontos from './MenuPontos.vue';

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
const catDe = (t) => props.categorias.find((c) => c.id === t.categoria_id);
const nomeCat = (t) => t.categoria_nome || t.categoria_receita || 'Sem categoria';
// Anotação 37: ícone do item (escolhido ou reconhecido pela descrição) antes do ícone da categoria; resgate com ícone próprio.
const iconeDe = (t) => (/^reserva_/.test(String(t.tipo_mov || '')) ? (t.valor > 0 ? 'cat-entrada-resgate' : 'cat-grupo-financas') : '')
  || t.icone || (t.valor < 0 ? iconeDoItem(t.descricao, 'saida') : null) || (t.valor < 0 ? catDe(t)?.icone : null) || '';
const corDe = (t) => (t.valor < 0 ? catDe(t)?.cor : '') || '';
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
      <div v-for="t in g.itens" :key="t.id" class="linha" :class="{ ignorada: t.ignorada }" tabindex="0" role="button" :aria-label="`Abrir ${t.descricao} em Transações`" @click="emit('abrir', t)" @keydown.enter="emit('abrir', t)">
        <IconeCategoria :valor="iconeDe(t)" :tipo="t.valor < 0 ? 'saida' : 'entrada'" :cor="corDe(t)" :tamanho="40" />
        <span class="textos">
          <span class="descricao">{{ t.descricao }}</span>
          <span class="secundario">{{ nomeCat(t) }}<span v-if="t.ignorada" class="chip">ignorada</span></span>
        </span>
        <span class="valor numero-tabular" :class="t.valor < 0 ? 'negativo' : 'positivo'">{{ sinal(t.valor) }} {{ moeda.format(Math.abs(t.valor)) }}</span>
        <span class="menu" @click.stop @keydown.enter.stop>
          <MenuPontos rotulo="Opções da transação">
            <button type="button" @click="emit('abrir', t)">Ver em Transações</button>
          </MenuPontos>
        </span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.extrato { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.vazio { margin: 0; font-size: 13px; color: var(--cor-texto-suave); padding: 18px 0; text-align: center; }
.grupo header { display: flex; justify-content: space-between; align-items: baseline; margin: 0 6px 2px; }
.grupo h3 { margin: 0; font-size: 12px; font-weight: 600; color: var(--cor-texto-suave); text-transform: capitalize; letter-spacing: 0.02em; }
.total { font-size: 12px; color: var(--cor-texto-suave); }
.linha { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto 36px; align-items: center; gap: 10px; padding: 10px 0 10px 4px; min-height: 56px; border-radius: 14px; cursor: pointer; transition: background var(--anim-rapida) ease; }
.linha:hover, .linha:focus-visible { background: var(--cor-realce); outline: none; }
.textos { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.descricao { font-size: 15px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; line-height: 1.3; }
.secundario { display: flex; align-items: center; flex-wrap: nowrap; gap: 5px; font-size: 12px; color: var(--cor-texto-suave); min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.conta { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.chip { font-size: 10.5px; font-weight: 600; padding: 1px 6px; border-radius: 999px; border: 1px solid var(--cor-borda); flex: none; }
.valor { font-family: var(--fonte-display); font-weight: 600; font-size: 15px; white-space: nowrap; text-align: right; }
.valor.positivo { color: var(--cor-entrada); }
.valor.negativo { color: var(--cor-saida); }
.menu { display: grid; place-items: center; width: 44px; height: 44px; }
.linha.ignorada { opacity: 0.5; }
.linha.ignorada .descricao { text-decoration: line-through; }
</style>
