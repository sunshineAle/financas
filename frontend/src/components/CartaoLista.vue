<script setup>
// Lista de compras do cartão com a LinhaTransacao (anotação 53), a mesma de Transações: ícone do item com selo do
// cartão, pílula "Crédito" com a bandeira, categoria, parcela embaixo do valor e menu ⋮. Tocar na linha edita a compra
// (cartão manual). Usada no extrato do cartão (CartaoExtrato.vue) e na lista da tela Cartões (Cartoes.vue).
import { computed } from 'vue';
import LinhaTransacao from './LinhaTransacao.vue';
import { infoTransacao } from '../utils/infoTransacao.js';

const props = defineProps({
  lancamentos: { type: Array, default: () => [] },
  categorias: { type: Array, default: () => [] },
  manual: { type: Boolean, default: false },
  // Cartão da lista (nome, icone, cor, bandeira, tipoCredito). Sem ele, usa cartaoNome/cartaoIcone.
  cartao: { type: Object, default: null },
  cartaoNome: { type: String, default: '' },
  cartaoIcone: { type: String, default: '' },
});
const emit = defineEmits(['editar', 'remover']);

// Compra do cartão no formato de /api/transacoes (o que a LinhaTransacao lê).
const linhas = computed(() => props.lancamentos.map((l) => {
  const k = props.cartao || {};
  const t = {
    id: l.id,
    cartao: true,
    descricao: l.descricao,
    valor: -(Number(l.valor) || 0),
    data: l.dataCompra,
    conta_nome: k.nome || props.cartaoNome,
    conta_icone: k.icone || props.cartaoIcone || null,
    conta_cor: k.cor || null,
    cartao_bandeira: k.bandeira || null,
    cartao_tipo_credito: k.tipoCredito || k.tipo_credito || null,
    meio: l.meio || null,
    rotulo_parcela: l.rotuloParcela || null,
    total_parcelas: l.totalParcelas,
    parcela_numero: l.parcelaNumero,
    categoria_id: l.categoriaId,
    subcategoria: l.subcategoria || null,
    icone: l.icone || null,
    recorrente: !!l.recorrente,
  };
  // Valor negativo na fatura = estorno/crédito: cor neutra, como em Transações (anotação 38).
  const info = t.valor > 0 ? { nome: 'Estorno', cor: null, icone: null, neutra: true, tipoNeutro: 'transf' } : infoTransacao(t, { categorias: props.categorias });
  return { l, t, info };
}));
</script>

<template>
  <div class="lista" role="list">
    <div v-for="x in linhas" :key="x.t.id" role="listitem">
      <LinhaTransacao :t="x.t" :info="x.info" :clicavel="manual" rotulo-abrir="editar a compra" @abrir="emit('editar', x.l)">
        <template #menu>
          <button v-if="manual" type="button" @click="emit('editar', x.l)">Editar</button>
          <button type="button" class="perigo" @click="emit('remover', x.l)">Remover</button>
        </template>
      </LinhaTransacao>
    </div>
  </div>
</template></span>
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
.lista { display: flex; flex-direction: column; min-width: 0; }
</style>
