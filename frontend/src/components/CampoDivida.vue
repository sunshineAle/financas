<script setup>
// <CampoDivida v-model="dividaId" :dividas="vinculaveis" /> — "Vincular a acordo, dívida ou crediário" em LISTA RICA
// (homologação 1.0, seção 14): ícone, nome, tipo/origem, cartão ligado (se houver), saldo devedor e parcela.
import { ref, computed } from 'vue';
import { Landmark, Handshake, ShoppingBag, CreditCard, Ban, TriangleAlert, ChevronDown } from 'lucide-vue-next';
import CampoBase from './CampoBase.vue';
import Valor from './Valor.vue';

const props = defineProps({ modelValue: { type: [String, Number], default: '' }, dividas: { type: Array, default: () => [] }, rotulo: { type: String, default: 'Vincular a acordo, dívida ou crediário (opcional)' }, tema: String });
const emit = defineEmits(['update:modelValue']);
const TIPOS = { acordo: 'Acordo', negativada: 'Negativada', crediario: 'Crediário', emprestimo: 'Empréstimo', financiamento: 'Financiamento', consignado: 'Consignado', fatura_parcelada: 'Fatura parcelada', carne: 'Carnê' };
const icone = (d) => (d.tipo === 'acordo' ? Handshake : d.tipo === 'crediario' || d.tipo === 'carne' ? ShoppingBag : d.cartao_nome ? CreditCard : Landmark);
// Mesmo padrão do "Pagou com": fechado mostra só a escolha; tocar expande a lista.
const aberto = ref(false);
const escolhida = computed(() => props.dividas.find((d) => String(d.id) === String(props.modelValue)) || null);
function escolher(id) { emit('update:modelValue', id); aberto.value = false; }
const sub = (d) => [TIPOS[d.tipo] || 'Dívida', d.credor || d.conta_nome, d.cartao_nome ? `cartão ${d.cartao_nome}` : ''].filter(Boolean).join(' · ');
</script>

<template>
  <CampoBase :rotulo="rotulo" :tema="tema">
    <button type="button" class="item-div on" :aria-expanded="aberto" data-divida-escolhida @click="aberto = !aberto">
      <span class="ic" :class="{ neutro: !escolhida }"><component :is="escolhida ? icone(escolhida) : Ban" :size="18" :stroke-width="2" aria-hidden="true" /></span>
      <span class="txt"><b>{{ escolhida ? escolhida.nome : 'Nenhum' }}</b><small v-if="escolhida">{{ sub(escolhida) }}</small></span>
      <span class="trocar">{{ aberto ? 'Fechar' : 'Trocar' }}<ChevronDown :size="16" :stroke-width="2" :style="{ transform: aberto ? 'rotate(180deg)' : null }" aria-hidden="true" /></span>
    </button>
    <div v-if="aberto" class="lista-div" role="radiogroup" :aria-label="rotulo">
      <button type="button" role="radio" class="item-div nenhum" :class="{ on: !modelValue }" :aria-checked="!modelValue" @click="escolher('')">
        <span class="ic"><Ban :size="18" :stroke-width="2" aria-hidden="true" /></span><span class="txt"><b>Nenhum</b></span>
      </button>
      <button v-for="d in dividas" :key="d.id" type="button" role="radio" class="item-div" :class="{ on: String(modelValue) === String(d.id) }" :aria-checked="String(modelValue) === String(d.id)" @click="escolher(d.id)">
        <span class="ic" :class="{ urgente: d.urgencia === 'vermelho' }"><component :is="d.urgencia === 'vermelho' ? TriangleAlert : icone(d)" :size="18" :stroke-width="2" aria-hidden="true" /></span>
        <span class="txt"><b>{{ d.nome }}</b><small>{{ sub(d) }}</small></span>
        <span class="num numero-tabular"><b><Valor :valor="d.saldo" /></b><small v-if="d.valor_parcela">parcela <Valor :valor="d.valor_parcela" /></small></span>
      </button>
    </div>
  </CampoBase>
</template>

<style scoped>
.trocar { display: inline-flex; align-items: center; gap: 2px; font-size: 12.5px; font-weight: 600; color: var(--tema-cor, var(--cor-primaria)); }
.ic.neutro { background: var(--cor-realce); color: var(--cor-texto-suave); }
.lista-div { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; max-height: 260px; overflow-y: auto; padding: 2px; }
.item-div { display: flex; align-items: center; gap: 10px; min-height: 54px; padding: 6px 12px 6px 8px; border-radius: 14px; border: 1.5px solid var(--cor-borda); background: var(--cor-fundo); color: var(--cor-texto); font: inherit; text-align: left; cursor: pointer; }
.item-div.on { border-color: var(--tema-cor, var(--cor-primaria)); background: var(--tema-fundo, var(--cor-realce)); }
.item-div.nenhum { min-height: 44px; }
.ic { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; flex: none; background: color-mix(in srgb, var(--cor-saida) 14%, transparent); color: var(--cor-saida-texto, var(--cor-saida)); }
.nenhum .ic { background: var(--cor-realce); color: var(--cor-texto-suave); }
.ic.urgente { background: color-mix(in srgb, var(--cor-alerta) 18%, transparent); color: var(--cor-alerta-texto, var(--cor-alerta)); }
.txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.txt b { font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.txt small, .num small { font-size: 11.5px; color: var(--cor-texto-suave); }
.num { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; white-space: nowrap; }
.num b { font-size: 14px; }
</style>
