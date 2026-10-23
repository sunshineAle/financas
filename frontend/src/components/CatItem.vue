<script setup>
// Linha de categoria (padrão REF-05/REF-06): ícone em quadrado colorido (cor da categoria), nome, gasto/limite
// e barra em degradê. Despesa: quente, estoura em carmim. Receita: azul. O slot `acoes` recebe o "+" e o menu ⋮.
//   <CatItem nome="Mercado" icone="cat-saida-mercado" cor="#CE2239" :valor="320" :limite="800" tipo="despesa" :formato="moeda" @abrir="..."> ...ações... </CatItem>
import { computed } from 'vue';
import { AlertTriangle, Check } from 'lucide-vue-next';
import BarraDegrade from './BarraDegrade.vue';
import IconeCategoria from './IconeCategoria.vue';

const props = defineProps({
  nome: { type: String, required: true },
  icone: { type: String, default: '' },
  padraoIcone: { type: String, default: '' },
  cor: { type: String, default: 'var(--cor-saida)' },
  valor: { type: Number, default: 0 },
  limite: { type: Number, default: 0 }, // despesa: teto do período (0 = sem limite)
  escala: { type: Number, default: 0 }, // receita: maior valor da lista, para dimensionar a barra
  tipo: { type: String, default: 'despesa' }, // 'despesa' | 'receita'
  detalhe: { type: String, default: '' },
  formato: { type: Function, default: (v) => String(v) },
});
defineEmits(['abrir']);

const ehDespesa = computed(() => props.tipo === 'despesa');
const pct = computed(() => {
  if (ehDespesa.value) return props.limite > 0 ? (props.valor / props.limite) * 100 : 0;
  return props.escala > 0 ? (props.valor / props.escala) * 100 : 0;
});
const estourou = computed(() => ehDespesa.value && props.limite > 0 && props.valor > props.limite + 0.004);
const perto = computed(() => ehDespesa.value && props.limite > 0 && pct.value >= 95 && !estourou.value); // 95–100%: menta, nunca cinza
// Barra no padrão de Transações (degradê + marcador). Despesa: degradê da cor da categoria; no limite: menta; passou: alerta.
const escuro = (c, p) => `color-mix(in srgb, ${c} ${p}%, black)`;
const cores = computed(() => {
  if (!ehDespesa.value) return { de: props.cor, ate: escuro(props.cor, 78) };
  if (estourou.value) return { de: 'var(--cor-alerta, #D5211A)', ate: 'var(--cor-alerta-escuro, #9E1610)' };
  if (perto.value) return { de: 'var(--menta-claro, #B9EBD6)', ate: 'var(--menta-medio, #9FE3C8)' };
  return { de: props.cor, ate: escuro(props.cor, 78) };
});
const restante = computed(() => Math.max(0, props.limite - props.valor));
const mostrarBarra = computed(() => (ehDespesa.value ? props.limite > 0 : props.escala > 0 && props.valor > 0));
</script>

<template>
  <div class="cat-item" role="button" tabindex="0" :aria-label="`Ver lançamentos de ${nome}`" @click="$emit('abrir')" @keydown.enter="$emit('abrir')">
    <IconeCategoria class="ico" :valor="icone || padraoIcone" :tipo="ehDespesa ? 'saida' : 'entrada'" :cor="cor" :tamanho="44" />
    <span class="corpo">
      <span class="linha-topo">
        <b class="nome">{{ nome }}</b>
        <span class="valores numero-tabular">
          <span :class="['gasto', { alerta: estourou, receita: !ehDespesa }]">{{ formato(valor) }}</span>
        </span>
      </span>
      <BarraDegrade v-if="mostrarBarra" :pct="Math.min(100, pct)" :de="cores.de" :ate="cores.ate" :altura="8" />
      <span class="linha-base">
        <small v-if="estourou" class="selo alerta"><AlertTriangle :size="13" :stroke-width="2.2" /> Passou {{ formato(valor - limite) }} · {{ Math.round(pct) }}% de {{ formato(limite) }}</small>
        <small v-else-if="perto" class="selo menta"><Check :size="13" :stroke-width="2.4" /> Orçamento no limite · {{ Math.round(pct) }}%</small>
        <small v-else-if="ehDespesa && limite > 0" class="selo ok">Ainda pode gastar {{ formato(restante) }} · {{ Math.round(pct) }}% de {{ formato(limite) }}</small>
        <small v-else-if="ehDespesa">sem limite definido</small>
        <small v-else-if="detalhe">{{ detalhe }}</small>
      </span>
    </span>
    <span class="acoes" @click.stop><slot name="acoes" /></span>
  </div>
</template>

<style scoped>
.cat-item { display: flex; align-items: center; gap: 12px; padding: 10px 8px; min-height: 64px; border-radius: 14px; cursor: pointer; transition: background var(--anim-rapida) ease; -webkit-tap-highlight-color: transparent; }
.cat-item:hover, .cat-item:focus-visible { background: var(--cor-realce); outline: none; }
.ico { flex: none; }
.corpo { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.linha-topo { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; min-width: 0; }
.nome { font-size: 15px; font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.valores { display: flex; align-items: baseline; gap: 5px; flex: none; text-align: right; }
.gasto { font-family: var(--fonte-display); font-size: 14px; font-weight: 700; }
.gasto.alerta { color: var(--cor-alerta-texto, var(--cor-grave)); }
.gasto.receita { color: var(--cor-entrada-texto, var(--cor-entrada, var(--cor-positivo))); }
.linha-base { min-height: 0; }
small { font-size: 12px; color: var(--cor-texto-suave); }
.selo { display: inline-flex; align-items: center; gap: 4px; font-weight: 600; }
.selo.alerta { color: var(--cor-alerta-texto, var(--cor-grave)); }
.selo.menta { color: var(--menta-texto, var(--cor-texto)); }
.selo.ok { color: var(--cor-entrada-texto, var(--cor-positivo)); font-weight: 600; }
.acoes { display: flex; align-items: center; gap: 2px; flex: none; }
@media (max-width: 480px) { .cat-item { gap: 10px; } .linha-topo { flex-wrap: wrap; gap: 0 10px; } .nome { white-space: normal; overflow-wrap: anywhere; flex: 1 1 90px; } }
</style>
