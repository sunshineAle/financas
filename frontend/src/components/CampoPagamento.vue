<script setup>
// <CampoPagamento v-model:conta-id="x.contaId" v-model:cartao-id="x.cartaoId" v-model:meio="x.pagamento" :contas :cartoes />
// \"Pagou com\" / \"Recebeu em\" (homologação 1.0, 29/10 22h24): UM campo para todas as formas — contas (débito/Pix) e
// cartões de crédito, cartões de loja e crediários (carnê digital) — em lista de quadros. Fechado, mostra só a escolha;
// tocar EXPANDE e mostra as outras opções (agrupadas), detalhadas: logo, nome e tipo. Escolher recolhe de novo.
// meio = 'conta' | 'cartao'. Sem `cartoes` (ex.: entrada) a lista mostra só as contas.
import { ref, computed } from 'vue';
import { ChevronDown } from 'lucide-vue-next';
import IconeBanco from './IconeBanco.vue';
import CampoBase from './CampoBase.vue';

const props = defineProps({
  contaId: { type: [String, Number], default: '' },
  cartaoId: { type: [String, Number], default: '' },
  meio: { type: String, default: 'conta' },
  contas: { type: Array, default: () => [] },
  cartoes: { type: Array, default: () => [] },
  rotulo: { type: String, default: 'Pagou com' },
  erro: String, tema: String,
});
const emit = defineEmits(['update:contaId', 'update:cartaoId', 'update:meio']);
const TIPO_CONTA = { corrente: 'Conta corrente', poupanca: 'Poupança', corretora: 'Corretora', dinheiro: 'Dinheiro', beneficio: 'Benefício', outra: 'Conta' };
const TIPO_CARTAO = { cartao: 'Cartão de crédito', loja: 'Cartão de loja', crediario: 'Crediário' };
const opcoes = computed(() => [
  ...props.contas.map((c) => ({ chave: 'conta:' + c.id, meio: 'conta', id: c.id, nome: c.nome, icone: c.icone, tipo: c.tipo === 'dinheiro' ? 'Dinheiro' : `${TIPO_CONTA[c.tipo] || 'Conta'} · débito ou Pix`, padrao: '🏦' })),
  ...props.cartoes.map((c) => ({ chave: 'cartao:' + c.id, meio: 'cartao', id: c.id, nome: c.nome, icone: c.icone, tipo: TIPO_CARTAO[c.tipoCredito || c.tipo_credito] || 'Cartão de crédito', padrao: '💳' })),
]);
const atual = computed(() => opcoes.value.find((o) => o.meio === props.meio && String(o.id) === String(props.meio === 'cartao' ? props.cartaoId : props.contaId)) || opcoes.value[0] || null);
const aberto = ref(false);
function escolher(o) {
  emit('update:meio', o.meio);
  if (o.meio === 'cartao') emit('update:cartaoId', o.id); else emit('update:contaId', o.id);
  aberto.value = false;
}
const grupos = computed(() => [
  { titulo: 'Contas', itens: opcoes.value.filter((o) => o.meio === 'conta') },
  { titulo: 'Cartões e crediários', itens: opcoes.value.filter((o) => o.meio === 'cartao') },
].filter((g) => g.itens.length));
</script>

<template>
  <CampoBase :rotulo="rotulo" :erro="erro" :tema="tema">
    <p v-if="!opcoes.length" class="sf-dica">Nenhuma conta cadastrada.</p>
    <template v-else>
      <button v-if="atual" type="button" class="quadro escolhido" :aria-expanded="aberto" data-pagou-com @click="aberto = !aberto">
        <IconeBanco :icone="atual.icone" :nome="atual.nome" :tamanho="32" :padrao="atual.padrao" />
        <span class="txt"><b>{{ atual.nome }}</b><small>{{ atual.tipo }}</small></span>
        <span class="trocar">{{ aberto ? 'Fechar' : 'Trocar' }}<ChevronDown :size="16" :stroke-width="2" :class="{ girado: aberto }" aria-hidden="true" /></span>
      </button>
      <div v-if="aberto" class="opcoes" role="radiogroup" :aria-label="rotulo">
        <template v-for="g in grupos" :key="g.titulo">
          <small v-if="grupos.length > 1" class="grupo">{{ g.titulo }}</small>
          <button v-for="o in g.itens" :key="o.chave" type="button" role="radio" :aria-checked="atual && atual.chave === o.chave" :class="['quadro', { ativo: atual && atual.chave === o.chave }]" @click="escolher(o)">
            <IconeBanco :icone="o.icone" :nome="o.nome" :tamanho="28" :padrao="o.padrao" />
            <span class="txt"><b>{{ o.nome }}</b><small>{{ o.tipo }}</small></span>
          </button>
        </template>
      </div>
    </template>
  </CampoBase>
</template>

<style scoped>
.quadro { width: 100%; display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 8px 12px; border-radius: 14px; border: 1.5px solid var(--cor-borda); background: var(--cor-fundo); color: var(--cor-texto); font: inherit; text-align: left; cursor: pointer; }
.quadro.escolhido { border-color: var(--tema-cor, var(--cor-primaria)); background: var(--tema-fundo, var(--cor-realce)); }
.quadro.ativo { border-color: var(--tema-cor, var(--cor-primaria)); }
.quadro:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--tema-cor, var(--cor-primaria)) 35%, transparent); }
.txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.txt b { font-size: 14.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.txt small { font-size: 12px; color: var(--cor-texto-suave); }
.trocar { display: inline-flex; align-items: center; gap: 2px; font-size: 12.5px; font-weight: 600; color: var(--tema-cor, var(--cor-primaria)); }
.trocar svg { transition: transform var(--anim-rapida) ease; }
.trocar svg.girado { transform: rotate(180deg); }
.opcoes { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; max-height: 320px; overflow-y: auto; padding: 2px; }
.grupo { margin: 4px 2px 0; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--cor-texto-suave); }
</style>
