<script setup>
// Extrato da meta: lista limpa (sem cards) de Guardar, Resgatar e rendimentos, com aviso discreto no rodapé.
// O rendimento é SIMULADO pelo CDI (dados públicos do Bacen); o valor acumulado já o inclui.
import { ref, watch, onMounted, computed } from 'vue';
import CardPadrao from './CardPadrao.vue';
import BarraDegrade from './BarraDegrade.vue';
import BarraAcoes from './BarraAcoes.vue';
import BotaoAcao from './BotaoAcao.vue';
import MenuPontos from './MenuPontos.vue';
import IconeCategoria from './IconeCategoria.vue';
import Valor from './Valor.vue';
import { PiggyBank, ArrowUpFromLine, ArrowDownToLine, TrendingUp, ChevronLeft } from 'lucide-vue-next';
import { api, comCdi, moeda, dataBR, infoCdi } from '../services/investimentos.js';

const props = defineProps({
  metaId: { type: String, required: true },
  cor: { type: String, default: 'var(--cor-meta)' },
  corClara: { type: String, default: 'var(--cor-meta-clara)' },
  versao: { type: Number, default: 0 },
});
const emit = defineEmits(['voltar', 'guardar', 'resgatar', 'editar-meta', 'editar-lancamento', 'apagar-lancamento']);

const extrato = ref(null);
const carregando = ref(true);
const erro = ref('');
async function carregar() {
  const r = await api('GET', comCdi(`/api/reserva/metas/${props.metaId}/extrato`));
  carregando.value = false;
  if (!r.ok) { erro.value = r.json?.erro || 'Não foi possível abrir o extrato.'; return; }
  extrato.value = r.json;
}
onMounted(carregar);
watch(() => [props.metaId, props.versao], carregar);

const nomeExibir = (n) => (/reserva de emerg[êe]ncia/i.test(n || '') ? 'Reserva de Liberdade' : n);
const ROTULO_PRAZO = { adiantado: 'Adiantado', no_ritmo: 'No ritmo', atrasado: 'Atrasado', concluida: 'Concluída' };
const prazoBR = (t) => { const [a, m] = String(t || '').slice(0, 10).split('-'); return `${m}/${a}`; };
const ROTULO = { guardar: 'Guardar', resgatar: 'Resgatar', rendimento: 'Rendimento' };
const icones = { guardar: ArrowDownToLine, resgatar: ArrowUpFromLine, rendimento: TrendingUp };
const nota = computed(() => extrato.value?.nota || 'Rendimentos simulados com dados públicos do Bacen');
const origemCdi = computed(() => (infoCdi().origem === 'snapshot' || infoCdi().origem === 'estimativa' ? ' (valor aproximado, sem conexão com o Bacen)' : ''));
</script>

<template>
  <div class="extrato" v-if="extrato" :style="{ '--cm': cor }">
    <button type="button" class="voltar" @click="emit('voltar')"><ChevronLeft :size="20" /> Metas</button>

    <CardPadrao>
      <div class="topo">
        <span class="nome"><IconeCategoria :valor="extrato.meta.icone || '🎯'" tipo="meta" :cor="cor" :tamanho="40" /> {{ nomeExibir(extrato.meta.nome) }}</span>
        <MenuPontos><button type="button" @click="emit('editar-meta', extrato.meta.id)">Editar meta</button></MenuPontos>
      </div>
      <div class="barra"><BarraDegrade :pct="extrato.pct" :altura="12" :de="corClara" :ate="cor" /></div>
      <div class="numeros">
        <div><small>Acumulado</small><strong class="grande numero-tabular"><Valor :valor="extrato.valor_acumulado" /></strong></div>
        <div><small>Meta</small><strong class="numero-tabular"><Valor :valor="extrato.meta.valor_meta" /></strong></div>
        <div><small>Saldo restante</small><strong class="numero-tabular"><Valor :valor="extrato.saldo_restante" /></strong></div>
      </div>
      <p class="pct">{{ extrato.pct }}% da meta<template v-if="extrato.saldo_restante <= 0"> · meta concluída</template></p>
      <p v-if="extrato.prazo_info && extrato.prazo_info.status !== 'concluida'" class="pct">
        <span :class="['selo', extrato.prazo_info.status]">{{ ROTULO_PRAZO[extrato.prazo_info.status] }} · até {{ prazoBR(extrato.meta.prazo) }}</span>
        precisa de {{ moeda(extrato.prazo_info.necessario_mes) }}/mês · você guarda {{ moeda(extrato.prazo_info.ritmo_mes) }}/mês
      </p>
      <template #rodape>
        <BarraAcoes compacto :colunas="2" rotulo="Ações da meta">
          <BotaoAcao compacto :icone="PiggyBank" rotulo="Guardar" tema="meta" destaque @click="emit('guardar', extrato.meta.id)" />
          <BotaoAcao compacto :icone="ArrowUpFromLine" rotulo="Resgatar" tema="meta" @click="emit('resgatar', extrato.meta.id)" />
        </BarraAcoes>
      </template>
    </CardPadrao>

    <h2 class="titulo-lista">Extrato</h2>
    <ul v-if="extrato.linhas.length" class="linhas">
      <li v-for="(l, i) in extrato.linhas" :key="l.id || 'sim' + i">
        <span class="ic" :class="l.tipo"><component :is="icones[l.tipo]" :size="18" :stroke-width="2.2" /></span>
        <span class="info">
          <span class="t">{{ ROTULO[l.tipo] }}<template v-if="l.ativo"> · {{ l.ativo }}</template></span>
          <span class="s">{{ dataBR(l.data) }}<template v-if="l.descricao"> · {{ l.descricao }}</template></span>
        </span>
        <span :class="['v', 'numero-tabular', l.valor < 0 ? 'neg' : 'pos']">{{ l.valor > 0 ? '+' : '' }}{{ moeda(l.valor) }}</span>
        <MenuPontos v-if="l.id && l.tipo !== 'rendimento'">
          <button type="button" @click="emit('editar-lancamento', l.id)">Editar</button>
          <button type="button" class="perigo" @click="emit('apagar-lancamento', l.id)">Apagar</button>
        </MenuPontos>
        <span v-else class="sem-menu"></span>
      </li>
    </ul>
    <p v-else class="vazio">Nada guardado nesta meta ainda. Toque em Guardar para começar.</p>
    <p class="rodape-nota">{{ nota }}{{ origemCdi }}.</p>
  </div>
  <p v-else-if="erro" class="sf-erro">{{ erro }}</p>
  <p v-else-if="carregando" class="vazio">Carregando...</p>
</template>

<style scoped>
.extrato { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.voltar { align-self: flex-start; display: inline-flex; align-items: center; gap: 2px; min-height: 44px; padding: 0 14px 0 6px; border: none; border-radius: 99px; background: none; color: var(--cor-texto); font: 600 15px var(--fonte-texto); cursor: pointer; }
.voltar:hover { background: var(--cor-realce); }
.topo { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.nome { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 17px; min-width: 0; overflow-wrap: anywhere; }
.barra { padding: 14px 0 10px; }
.numeros { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.numeros small { display: block; color: var(--cor-texto-suave); font-size: 12px; }
.numeros strong { font-size: 14px; overflow-wrap: anywhere; }
.numeros .grande { font-family: var(--fonte-display); font-size: clamp(16px, 4.6vw, 22px); color: var(--cm); }
.pct { margin: 8px 0 0; color: var(--cor-texto-suave); font-size: 13px; }
.selo { display: inline-block; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 999px; background: var(--cor-meta-fundo); color: var(--cor-texto); margin-right: 6px; }
.selo.atrasado { background: var(--cor-saida-fundo); color: var(--cor-saida); }
.selo.adiantado { background: var(--cor-investimento-fundo); }
.titulo-lista { margin: 6px 4px 0; font-family: var(--fonte-display); font-size: 16px; }
.linhas { list-style: none; margin: 0; padding: 0 4px; display: flex; flex-direction: column; }
.linhas li { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--cor-borda); min-height: 52px; }
.linhas li:last-child { border-bottom: none; }
.ic { flex: none; width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; background: var(--cor-meta-fundo); color: var(--cm); }
.ic.rendimento { background: var(--cor-investimento-fundo); color: var(--cor-investimento); }
.ic.resgatar { background: var(--cor-saida-fundo); color: var(--cor-saida); }
.info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.t { font-weight: 600; font-size: 14px; overflow-wrap: anywhere; }
.s { color: var(--cor-texto-suave); font-size: 12px; overflow-wrap: anywhere; }
.v { flex: none; font-weight: 700; font-size: 14px; }
.v.pos { color: var(--cor-investimento); }
.v.neg { color: var(--cor-saida); }
.sem-menu { flex: none; width: 36px; }
.vazio { color: var(--cor-texto-suave); font-size: 14px; margin: 8px 4px; }
.rodape-nota { margin: 6px 4px 0; text-align: center; font-size: 11.5px; color: var(--cor-texto-suave); opacity: 0.85; }
</style>
