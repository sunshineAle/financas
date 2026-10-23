<script setup>
// Lista de compras do cartão no MESMO padrão da lista de Transações: ícone da categoria, título,
// "data · categoria · cartão", parcela, valor e menu ⋮.
import IconeCategoria from './IconeCategoria.vue';
import MenuPontos from './MenuPontos.vue';
import IconeBanco from './IconeBanco.vue';

const props = defineProps({
  lancamentos: { type: Array, default: () => [] },
  categorias: { type: Array, default: () => [] },
  manual: { type: Boolean, default: false },
  cartaoNome: { type: String, default: '' },
  cartaoIcone: { type: String, default: '' },
});
const emit = defineEmits(['editar', 'remover']);

const moeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const dm = (iso) => { const [, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}`; };
const cat = (l) => props.categorias.find((c) => c.id === l.categoriaId) || null;
</script>

<template>
  <ul class="lista">
    <li v-for="l in lancamentos" :key="l.id" class="linha">
      <IconeCategoria :valor="cat(l)?.icone" tipo="saida" :tamanho="40" />
      <div class="textos">
        <span class="desc">{{ l.descricao }}</span>
        <span class="meta">
          <span>{{ dm(l.dataCompra) }}</span>
          <span v-if="cat(l)">· {{ cat(l).nome }}<template v-if="l.subcategoria"> · {{ l.subcategoria }}</template></span>
          <span v-if="cartaoNome" class="cart">· <IconeBanco :icone="cartaoIcone" :nome="cartaoNome" padrao="💳" :tamanho="13" /> {{ cartaoNome }}</span>
          <span v-if="l.totalParcelas > 1">· total {{ moeda(l.valorTotalCompra) }}</span>
        </span>
      </div>
      <span v-if="l.rotuloParcela" class="parcela">{{ l.rotuloParcela }}</span>
      <span class="valor numero-tabular">− {{ moeda(l.valor) }}</span>
      <MenuPontos>
        <button v-if="manual" type="button" @click="emit('editar', l)">Editar</button>
        <button type="button" class="perigo" @click="emit('remover', l)">Remover</button>
      </MenuPontos>
    </li>
  </ul>
</template>

<style scoped>
.lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.linha { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto auto auto; align-items: center; gap: 4px 12px; padding: 10px 4px 10px 6px; min-height: 56px; border-radius: 14px; transition: background var(--anim-rapida) ease; }
.linha:hover { background: var(--cor-realce); }
.textos { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.desc { font-size: 15px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 480px) { .desc { white-space: normal; overflow-wrap: anywhere; } }
.meta { display: flex; flex-wrap: wrap; align-items: center; gap: 0 5px; font-size: 12px; color: var(--cor-texto-suave); min-width: 0; }
.cart { display: inline-flex; align-items: center; gap: 4px; }
.parcela { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--cor-borda); color: var(--cor-texto-suave); white-space: nowrap; }
.valor { font-family: var(--fonte-display); font-size: 15px; font-weight: 600; color: var(--cor-saida-texto); white-space: nowrap; text-align: right; }
@media (max-width: 480px) {
  .cart { display: none; }
  .linha { grid-template-columns: 40px minmax(0, 1fr) auto auto; }
  .parcela { grid-column: 2; grid-row: 2; justify-self: start; }
  .textos { grid-column: 2; }
  .valor { grid-column: 3; grid-row: 1; }
  .linha > :last-child { grid-column: 4; grid-row: 1; }
}
</style>
