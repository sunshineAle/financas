<script setup>
import IconeBanco from './IconeBanco.vue';
// Detalhe de um ativo, em LISTAS TABULARES sem cards: Compras (Data | Cotas | Preço | Total) e Proventos (Data | Provento/cota | Total).
// Também mostra vendas/resgates e rendimentos. Tema verde dos Investimentos.
import { ref, watch, onMounted, computed } from 'vue';
import TopoValor from './TopoValor.vue';
import BarraAcoes from './BarraAcoes.vue';
import BotaoAcao from './BotaoAcao.vue';
import MenuPontos from './MenuPontos.vue';
import { PiggyBank, ArrowUpFromLine, Coins, TrendingUp, ChevronLeft } from 'lucide-vue-next';
import { api, moeda, moeda4, numeroBR, dataBR } from '../services/investimentos.js';

const props = defineProps({ ativoId: { type: String, required: true }, versao: { type: Number, default: 0 } });
const emit = defineEmits(['voltar', 'operar', 'editar', 'apagar']);

const d = ref(null);
const erro = ref('');
async function carregar() {
  const r = await api('GET', `/api/investimentos/ativos/${props.ativoId}`);
  if (!r.ok) { erro.value = r.json?.erro || 'Não foi possível abrir o ativo.'; return; }
  d.value = r.json;
}
onMounted(carregar);
watch(() => [props.ativoId, props.versao], carregar);

const a = computed(() => d.value?.ativo);
const comCotas = computed(() => !!a.value?.usa_cotas);
const titulo = computed(() => (a.value ? a.value.ticker || a.value.nome : ''));
const linhasTopo = computed(() => {
  if (!a.value) return [];
  const l = [];
  if (comCotas.value) {
    l.push({ rotulo: 'Cotas', valor: numeroBR(a.value.cotas) });
    l.push({ rotulo: 'Preço médio', valor: a.value.preco_medio == null ? '—' : moeda(a.value.preco_medio) });
  } else if (a.value.rendimentos) l.push({ rotulo: 'Rendimentos', valor: a.value.rendimentos });
  if (a.value.proventos) l.push({ rotulo: 'Proventos recebidos', valor: a.value.proventos });
  if (a.value.realizado) l.push({ rotulo: 'Resultado de vendas', valor: a.value.realizado });
  return l;
});
</script>

<template>
  <div v-if="d" class="detalhe">
    <button type="button" class="voltar" @click="emit('voltar')"><ChevronLeft :size="20" /> Investimentos</button>

    <TopoValor tema="investimento" variante="2" :rotulo="`${titulo} · ${a.tipo_rotulo}`" :valor="a.valor_atual" :linhas="linhasTopo">
      <template #acoes>
        <BarraAcoes compacto :colunas="3" rotulo="Ações do ativo">
          <BotaoAcao compacto :icone="PiggyBank" rotulo="Guardar" tema="investimento" destaque @click="emit('operar', 'guardar', a)" />
          <BotaoAcao compacto :icone="ArrowUpFromLine" rotulo="Resgatar" tema="investimento" @click="emit('operar', 'resgatar', a)" />
          <BotaoAcao v-if="comCotas" compacto :icone="Coins" rotulo="Provento" tema="investimento" @click="emit('operar', 'provento', a)" />
          <BotaoAcao v-else compacto :icone="TrendingUp" rotulo="Rendimento" tema="investimento" @click="emit('operar', 'rendimento', a)" />
        </BarraAcoes>
      </template>
    </TopoValor>
    <p v-if="a.corretora_nome" class="info">Corretora: <IconeBanco :nome="a.corretora_nome" :tamanho="18" /> <strong>{{ a.corretora_nome }}</strong> · {{ a.liquidez === 'rapida' ? 'liquidez rápida (pode entrar em metas)' : 'liquidez lenta (só em Investimentos)' }}</p>
    <p v-else class="info">Sem corretora vinculada · {{ a.liquidez === 'rapida' ? 'liquidez rápida (pode entrar em metas)' : 'liquidez lenta (só em Investimentos)' }}</p>
    <p v-if="d.aviso" class="sf-erro">{{ d.aviso }}</p>

    <section class="bloco" aria-label="Compras">
      <h2>Compras</h2>
      <table v-if="d.compras.length" class="tab">
        <thead><tr><th>Data</th><th class="n">Cotas</th><th class="n">Preço</th><th class="n">Total</th><th class="m"></th></tr></thead>
        <tbody>
          <tr v-for="c in d.compras" :key="c.id">
            <td>{{ dataBR(c.data) }}<small v-if="c.meta_nome" class="meta">meta {{ c.meta_nome }}</small></td>
            <td class="n numero-tabular">{{ c.cotas == null ? '—' : numeroBR(c.cotas) }}</td>
            <td class="n numero-tabular">{{ c.preco == null ? '—' : moeda4(c.preco) }}</td>
            <td class="n numero-tabular"><b>{{ moeda(c.total) }}</b></td>
            <td class="m"><MenuPontos><button type="button" @click="emit('editar', c)">Editar</button><button type="button" class="perigo" @click="emit('apagar', c)">Apagar</button></MenuPontos></td>
          </tr>
        </tbody>
      </table>
      <p v-else class="vazio">Nenhuma compra registrada.</p>
    </section>

    <section v-if="d.vendas.length" class="bloco" aria-label="Vendas e resgates">
      <h2>{{ comCotas ? 'Vendas' : 'Resgates' }}</h2>
      <table class="tab">
        <thead><tr><th>Data</th><th class="n">Cotas</th><th class="n">Preço</th><th class="n">Total</th><th class="m"></th></tr></thead>
        <tbody>
          <tr v-for="c in d.vendas" :key="c.id">
            <td>{{ dataBR(c.data) }}<small v-if="c.meta_nome" class="meta">meta {{ c.meta_nome }}</small></td>
            <td class="n numero-tabular">{{ c.cotas == null ? '—' : numeroBR(c.cotas) }}</td>
            <td class="n numero-tabular">{{ c.preco == null ? '—' : moeda4(c.preco) }}</td>
            <td class="n numero-tabular"><b>{{ moeda(c.total) }}</b></td>
            <td class="m"><MenuPontos><button type="button" @click="emit('editar', c)">Editar</button><button type="button" class="perigo" @click="emit('apagar', c)">Apagar</button></MenuPontos></td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="bloco" aria-label="Proventos">
      <h2>Proventos</h2>
      <table v-if="d.proventos.length" class="tab">
        <thead><tr><th>Data</th><th class="n">Provento/cota</th><th class="n">Total</th><th class="m"></th></tr></thead>
        <tbody>
          <tr v-for="p in d.proventos" :key="p.id">
            <td>{{ dataBR(p.data) }}</td>
            <td class="n numero-tabular">{{ p.por_cota == null ? '—' : moeda4(p.por_cota) }}</td>
            <td class="n numero-tabular"><b>{{ moeda(p.total) }}</b></td>
            <td class="m"><MenuPontos><button type="button" class="perigo" @click="emit('apagar', p)">Apagar</button></MenuPontos></td>
          </tr>
        </tbody>
      </table>
      <p v-else class="vazio">Nenhum provento registrado.</p>
    </section>

    <section v-if="d.rendimentos.length" class="bloco" aria-label="Rendimentos">
      <h2>Rendimentos</h2>
      <table class="tab">
        <thead><tr><th>Data</th><th class="n">Total</th><th class="m"></th></tr></thead>
        <tbody>
          <tr v-for="p in d.rendimentos" :key="p.id">
            <td>{{ dataBR(p.data) }}</td>
            <td class="n numero-tabular"><b>{{ moeda(p.total) }}</b></td>
            <td class="m"><MenuPontos><button type="button" class="perigo" @click="emit('apagar', p)">Apagar</button></MenuPontos></td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
  <p v-else-if="erro" class="sf-erro">{{ erro }}</p>
</template>

<style scoped>
.detalhe { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.voltar { align-self: flex-start; display: inline-flex; align-items: center; gap: 2px; min-height: 44px; padding: 0 14px 0 6px; border: none; border-radius: 99px; background: none; color: var(--cor-texto); font: 600 15px var(--fonte-texto); cursor: pointer; }
.voltar:hover { background: var(--cor-realce); }
.info { margin: 0 4px; font-size: 12.5px; color: var(--cor-texto-suave); }
.info strong { color: var(--cor-texto); }
.bloco { padding: 0 4px; }
.bloco h2 { margin: 4px 0 4px; font-family: var(--fonte-display); font-size: 16px; color: var(--cor-investimento); }
.tab { width: 100%; border-collapse: collapse; font-size: 13.5px; table-layout: auto; }
.tab th { text-align: left; font-weight: 600; font-size: 11.5px; letter-spacing: .02em; color: var(--cor-texto-suave); padding: 6px 6px 6px 0; border-bottom: 1px solid var(--cor-borda); white-space: nowrap; }
.tab td { padding: 10px 6px 10px 0; border-bottom: 1px solid var(--cor-borda); vertical-align: middle; }
.tab tr:last-child td { border-bottom: none; }
.tab .n { text-align: right; white-space: nowrap; }
.tab th.n { text-align: right; }
.tab .m { width: 40px; text-align: right; padding-right: 0; }
.meta { display: block; color: var(--cor-texto-suave); font-size: 11px; }
.vazio { margin: 6px 0 0; color: var(--cor-texto-suave); font-size: 13px; }
@media (max-width: 480px) { .tab { font-size: 12.5px; } .tab td { padding: 9px 4px 9px 0; } }
</style>
