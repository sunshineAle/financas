<script setup>
// Guardar / Resgatar / Provento / Rendimento de um ativo, em TEMA VERDE (investimento). Serve a aba Investimentos e o detalhe do ativo.
//  - ativos negociados em cotas (ações, FIIs, ETFs, cripto...): cotas × preço = total; provento por cota;
//  - renda fixa: valor total; pode ser vinculada a uma META (só ativos de liquidez rápida);
//  - o dinheiro sai/entra na CORRETORA do ativo; sem corretora, concilie pela transferência do extrato.
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import FormularioModal from './FormularioModal.vue';
import CampoTipo from './CampoTipo.vue';
import CampoTexto from './CampoTexto.vue';
import CampoValor from './CampoValor.vue';
import CampoData from './CampoData.vue';
import CampoSelecao from './CampoSelecao.vue';
import { PiggyBank, ArrowUpFromLine, TrendingUp } from 'lucide-vue-next';
import { api, comCdi, moeda, hojeISO, dataBR, TIPOS_COTAS } from '../services/investimentos.js';

const props = defineProps({
  aberto: Boolean,
  carteira: { type: Object, default: () => ({ ativos: [], tipos: [], corretoras: [], contas: [] }) },
  metas: { type: Array, default: () => [] },
  ativoId: { type: String, default: '' }, // ativo já escolhido (vindo do detalhe)
  operacaoInicial: { type: String, default: 'guardar' },
  edicao: { type: Object, default: null }, // operação existente (linha de compras/vendas/proventos do detalhe)
  metaInicial: { type: String, default: '' },
});
const emit = defineEmits(['fechar', 'salvo']);
const router = useRouter();

const NOVO = '__novo__';
const f = ref({});
const erro = ref('');
const erros = ref({});
const salvando = ref(false);
const candidatas = ref([]);

const vazio = () => ({
  operacao: props.operacaoInicial === 'provento' ? 'rendimento' : props.operacaoInicial, ativo: props.ativoId || (props.carteira.ativos.find((a) => !a.encerrado)?.id ?? NOVO),
  tipoAtivo: '', tipoManual: false, nome: '', corretoraId: '', modoQtd: 'cotas', tipoRenda: 'dividendo',
  cotas: '', preco: '', total: 0, data: hojeISO(), metaId: props.metaInicial || '', conta: '', transacaoId: '', descricao: '',
});

// Tipo detectado pelo nome/ticker (o usuário pode trocar). Ex.: PETR4 -> Ações, MXRF11 -> FII, AAPL34 -> BDR, BTC -> Cripto.
const CRIPTOS = ['BTC', 'ETH', 'SOL', 'USDT', 'USDC', 'BNB', 'XRP', 'ADA', 'DOGE', 'LTC', 'DOT', 'MATIC', 'AVAX', 'LINK'];
const ETFS = ['BOVA11', 'IVVB11', 'SMAL11', 'HASH11', 'BOVV11', 'DIVO11', 'NASD11', 'SPXI11', 'GOLD11', 'XINA11', 'ACWI11', 'FIND11', 'BOVB11', 'ECOO11', 'IMAB11', 'B5P211', 'FIXA11'];
function detectarTipo(nome) {
  const t = String(nome || '').trim();
  const u = t.toUpperCase().replace(/\s+/g, ' ');
  if (!u) return '';
  if (CRIPTOS.includes(u)) return 'cripto';
  if (ETFS.includes(u)) return 'etf';
  if (/^[A-Z]{4}(3|4|5|6|7|8)F?$/.test(u)) return 'acoes';
  if (/^[A-Z]{4}3[2-5]$/.test(u)) return 'bdr';
  if (/^[A-Z]{4}11$/.test(u)) return 'fii';
  if (/TESOURO|SELIC|IPCA\+|PREFIXADO/.test(u)) return 'tesouro';
  if (/\bLCI\b/.test(u)) return 'lci';
  if (/\bLCA\b/.test(u)) return 'lca';
  if (/\bCDB\b|\bRDB\b|CAIXINHA/.test(u)) return 'cdb';
  if (/POUPAN|PORQUINHO/.test(u)) return 'poupanca';
  if (/DEB[ÊE]NTURE/.test(u)) return 'debentures';
  if (/\bCRI\b|\bCRA\b/.test(u)) return 'cri_cra';
  if (/PREVID|PGBL|VGBL/.test(u)) return 'previdencia';
  if (/FIAGRO/.test(u)) return 'fiagro';
  if (/\bFUNDO\b|\bFI\b|\bDI\b/.test(u)) return 'fundo';
  if (/OURO|GOLD/.test(u)) return 'ouro';
  return '';
}
const TIPOS_RENDA = [
  { valor: 'dividendo', rotulo: 'Dividendos' },
  { valor: 'jcp', rotulo: 'JCP (juros sobre capital próprio)' },
  { valor: 'rendimento_fii', rotulo: 'Rendimento de FII / Fiagro' },
  { valor: 'outro', rotulo: 'Outro provento' },
];
const ROTULO_RENDA = { dividendo: 'Dividendos', jcp: 'JCP', rendimento_fii: 'Rendimento FII', outro: 'Provento' };

watch(() => props.aberto, async (v) => {
  if (!v) return;
  erro.value = ''; erros.value = {};
  f.value = vazio();
  if (props.edicao) {
    const e = props.edicao;
    f.value = {
      ...vazio(), ativo: e.ativo_id || props.ativoId, operacao: e.tipo === 'compra' ? 'guardar' : e.tipo === 'venda' ? 'resgatar' : 'rendimento',
      modoQtd: e.cotas ? 'cotas' : 'valor',
      cotas: e.cotas ?? '', preco: e.preco ?? '', total: e.total, data: String(e.data).slice(0, 10), metaId: e.meta_id || '', conta: e.conta_id || '', descricao: e.descricao || '',
    };
  } else if (ativoSel.value) {
    f.value.conta = ativoSel.value.corretora_conta_id || '';
  }
  const r = await api('GET', '/api/investimentos/conciliacao');
  candidatas.value = r.ok ? r.json.transacoes : [];
});

const novo = computed(() => f.value.ativo === NOVO);
const ativoSel = computed(() => props.carteira.ativos.find((a) => a.id === f.value.ativo) || null);
const tipoAtivo = computed(() => (novo.value ? f.value.tipoAtivo : ativoSel.value?.tipo));
const tipoEscolhido = computed(() => !!tipoAtivo.value);
const ativoDeCotas = computed(() => TIPOS_COTAS.includes(tipoAtivo.value) || (ativoSel.value?.usa_cotas && !novo.value));
// Compra/venda: cotas x preço nos ativos de bolsa; só o valor na renda fixa. No resgate de ativo com cotas, pode ser por valor também.
const comCotas = computed(() => ativoDeCotas.value && (op.value !== 'resgatar' || f.value.modoQtd === 'cotas'));
// Auto-detecta o tipo enquanto o usuário digita o nome do ativo novo (até ele escolher um tipo à mão).
watch(() => f.value.nome, (n) => { if (novo.value && !f.value.tipoManual) f.value.tipoAtivo = detectarTipo(n); });
const tipoDetectado = computed(() => novo.value && !f.value.tipoManual && f.value.tipoAtivo ? (props.carteira.tipos || []).find((t) => t.valor === f.value.tipoAtivo)?.rotulo : '');
function escolherTipo(v) { f.value.tipoAtivo = v; f.value.tipoManual = true; }
const liquidezRapida = computed(() => (novo.value ? props.carteira.tipos_liquidez_rapida?.includes(f.value.tipoAtivo) : ativoSel.value?.liquidez === 'rapida'));
const op = computed(() => f.value.operacao);
// "Rendimento" = provento manual (dividendos, JCP, FII) nos ativos de cotas; na renda fixa, rendimento do extrato.
const ehProvento = computed(() => op.value === 'rendimento' && ativoDeCotas.value);
const ehSaida = computed(() => op.value === 'resgatar');
const corretoraDoAtivo = computed(() => (novo.value ? f.value.corretoraId : ativoSel.value?.corretora_conta_id) || '');

const opcoesOperacao = [
  { id: 'guardar', rotulo: 'Guardar', tema: 'investimento', icone: PiggyBank },
  { id: 'rendimento', rotulo: 'Rendimento', tema: 'investimento', icone: TrendingUp },
  { id: 'resgatar', rotulo: 'Resgatar', tema: 'investimento', icone: ArrowUpFromLine },
];
const opcoesModo = [{ id: 'cotas', rotulo: 'Por quantidade', tema: 'investimento' }, { id: 'valor', rotulo: 'Por valor', tema: 'investimento' }];
// Posição atual do ativo escolhido (total acumulado e preço médio), mostrada no próprio formulário.
const posicao = computed(() => {
  const a = ativoSel.value;
  if (!a || novo.value) return null;
  return { total: a.valor_atual, custo: a.custo, cotas: a.cotas, pm: a.preco_medio, usaCotas: a.usa_cotas };
});
// Resgate: lucro/prejuízo pelo preço médio (cotas) ou pela fração do custo (renda fixa), como o backend calcula.
const resultadoResgate = computed(() => {
  const p = posicao.value;
  if (!p || op.value !== 'resgatar') return null;
  if (comCotas.value) {
    const c = Number(f.value.cotas), pr = Number(f.value.preco);
    if (!(c > 0 && pr > 0) || !(p.pm > 0)) return null;
    if (p.cotas && c > p.cotas + 1e-9) return { erro: `Você tem ${p.cotas.toLocaleString('pt-BR')} cotas.` };
    return { valor: Math.round((pr - p.pm) * c * 100) / 100 };
  }
  const v = Number(f.value.total);
  if (!(v > 0) || !(p.total > 0)) return null;
  if (v > p.total + 0.005) return { erro: `O saldo deste ativo é ${moeda(p.total)}.` };
  return { valor: Math.round((v - p.custo * (v / p.total)) * 100) / 100 };
});

const opcoesAtivo = computed(() => [
  ...props.carteira.ativos.filter((a) => !a.encerrado || a.id === props.ativoId).map((a) => ({ valor: a.id, rotulo: `${a.ticker || a.nome} · ${a.tipo_rotulo}` })),
  { valor: NOVO, rotulo: '+ Novo ativo' },
]);
const opcoesTipo = computed(() => [{ valor: '', rotulo: 'Escolha o tipo…' }, ...(props.carteira.tipos || []).map((t) => ({ valor: t.valor, rotulo: t.rotulo }))]);
const opcoesCorretora = computed(() => [{ valor: '', rotulo: 'Sem corretora (conciliar pelo extrato)' }, ...(props.carteira.corretoras || []).map((c) => ({ valor: c.id, rotulo: c.nome }))]);
const opcoesMeta = computed(() => [
  { valor: '', rotulo: 'Nenhuma meta' },
  ...props.metas.filter((m) => !m.tipo_investimento || m.tipo_investimento === tipoAtivo.value).map((m) => ({ valor: m.id, rotulo: m.nome })),
]);
const CONCILIAR = '__conciliar__';
const opcoesConta = computed(() => {
  const todas = (props.carteira.contas || []).map((c) => ({ valor: c.id, rotulo: c.tipo === 'corretora' ? `${c.nome} (corretora)` : c.nome }));
  return [{ valor: '', rotulo: 'Nenhuma (não mexe em saldo)' }, ...todas, { valor: CONCILIAR, rotulo: 'Conciliar com uma transferência do extrato…' }];
});
const opcoesCandidatas = computed(() => [
  { valor: '', rotulo: 'Escolha a transferência...' },
  ...candidatas.value.map((t) => ({ valor: t.id, rotulo: `${dataBR(t.data)} · ${t.descricao} · ${moeda(Math.abs(t.valor))}${t.provavel ? ' ★' : ''}` })),
]);
const conciliando = computed(() => f.value.conta === CONCILIAR);
const semCorretora = computed(() => (props.carteira.corretoras || []).length === 0);

const totalCalculado = computed(() => Math.round(Number(f.value.cotas) * Number(f.value.preco) * 100) / 100 || 0);
const temMeta = computed(() => tipoEscolhido.value && liquidezRapida.value && !ehProvento.value && props.metas.length > 0);

watch(() => f.value.ativo, () => {
  if (props.edicao) return;
  if (ativoSel.value) f.value.conta = ativoSel.value.corretora_conta_id || '';
  if (!liquidezRapida.value) f.value.metaId = '';
});
watch(() => f.value.corretoraId, (v) => { if (novo.value) f.value.conta = v || ''; });
watch(() => f.value.tipoAtivo, () => { if (!liquidezRapida.value) f.value.metaId = ''; });

const titulo = computed(() => (props.edicao ? 'Editar lançamento' : ({ guardar: 'Guardar', resgatar: 'Resgatar', rendimento: 'Registrar rendimento' }[op.value])));

async function salvar() {
  erro.value = ''; erros.value = {};
  const v = f.value;
  if (novo.value && !v.nome.trim()) erros.value.nome = 'Informe o ticker ou nome do ativo.';
  if (novo.value && !v.tipoAtivo) erros.value.tipo = 'Escolha o tipo do investimento.';
  if (resultadoResgate.value && resultadoResgate.value.erro) erros.value.total = resultadoResgate.value.erro;
  if (ehProvento.value && !v.conta) erros.value.conta = 'Escolha a conta onde o dinheiro caiu.';
  if (comCotas.value && !ehProvento.value) {
    if (!(Number(v.cotas) > 0)) erros.value.cotas = 'Informe as cotas.';
    if (!(Number(v.preco) > 0)) erros.value.preco = 'Informe o preço.';
  } else if (ehProvento.value && comCotas.value) {
    if (!(Number(v.preco) > 0) && !(Number(v.total) > 0)) erros.value.preco = 'Informe o provento por cota (ou o total).';
  } else if (!(Number(v.total) > 0)) erros.value.total = 'Informe um valor maior que zero.';
  if (conciliando.value && !v.transacaoId) erros.value.transacao = 'Escolha a transferência do extrato.';
  if (Object.keys(erros.value).length) return;

  const tipoApi = ehProvento.value ? 'provento' : v.operacao;
  const descricao = ehProvento.value ? [ROTULO_RENDA[v.tipoRenda], v.descricao.trim()].filter(Boolean).join(' · ') : v.descricao;
  const corpo = { tipo: tipoApi, data: v.data || hojeISO(), descricao, metaId: temMeta.value ? v.metaId || null : null };
  if (novo.value) {
    const nome = v.nome.trim();
    Object.assign(corpo, { nome, ticker: comCotas.value ? nome.toUpperCase() : null, tipoAtivo: v.tipoAtivo, corretoraContaId: v.corretoraId || null });
  } else corpo.ativoId = v.ativo;
  if (comCotas.value && !ehProvento.value) { corpo.cotas = Number(v.cotas); corpo.preco = Number(v.preco); }
  else if (ehProvento.value && comCotas.value) { if (Number(v.preco) > 0) corpo.preco = Number(v.preco); else corpo.total = Number(v.total); if (Number(v.cotas) > 0) corpo.cotas = Number(v.cotas); }
  else corpo.total = Number(v.total);
  if (conciliando.value) corpo.transacaoId = v.transacaoId;
  else corpo.contaId = v.conta || null;

  salvando.value = true;
  try {
    const r = await api(props.edicao ? 'PUT' : 'POST', props.edicao ? `/api/investimentos/operacoes/${props.edicao.id}` : '/api/investimentos/operacoes', corpo);
    if (!r.ok) { erro.value = r.json?.erro || 'Não foi possível salvar.'; return; }
    emit('salvo', r.json);
  } finally { salvando.value = false; }
}
</script>

<template>
  <FormularioModal :aberto="aberto" :titulo="titulo" tema="investimento" :carregando="salvando" :erro="erro" :rotulo-salvar="edicao ? 'Salvar alterações' : op === 'resgatar' ? 'Resgatar' : op === 'guardar' ? 'Guardar' : 'Registrar'" @salvar="salvar" @fechar="emit('fechar')">
    <CampoTipo v-if="!edicao" v-model="f.operacao" :opcoes="opcoesOperacao" />
    <CampoSelecao v-if="!edicao && !ativoId" v-model="f.ativo" rotulo="Ativo" :opcoes="opcoesAtivo" tema="investimento" />
    <template v-if="novo">
      <CampoTexto v-model="f.nome" rotulo="Nome ou ticker (ex.: PETR4, MXRF11, CDB Inter)" maxlength="60" tema="investimento" obrigatorio :erro="erros.nome" />
      <CampoSelecao :model-value="f.tipoAtivo" rotulo="Tipo" :opcoes="opcoesTipo" tema="investimento" :erro="erros.tipo" :dica="tipoDetectado ? `Detectado: ${tipoDetectado}. Troque se não for.` : ''" @update:model-value="escolherTipo" />
      <CampoSelecao v-if="(carteira.corretoras || []).length" v-model="f.corretoraId" rotulo="Corretora" :opcoes="opcoesCorretora" tema="investimento" />
    </template>

    <div v-if="posicao" class="posicao" data-posicao>
      <span><small>Total acumulado</small><b>{{ moeda(posicao.total) }}</b></span>
      <span v-if="posicao.usaCotas"><small>Cotas</small><b>{{ (posicao.cotas || 0).toLocaleString('pt-BR', { maximumFractionDigits: 6 }) }}</b></span>
      <span v-if="posicao.usaCotas"><small>Preço médio</small><b>{{ moeda(posicao.pm) }}</b></span>
      <span v-else><small>Valor aplicado</small><b>{{ moeda(posicao.custo) }}</b></span>
    </div>

    <template v-if="tipoEscolhido">
      <CampoTipo v-if="op === 'resgatar' && ativoDeCotas" v-model="f.modoQtd" :opcoes="opcoesModo" />
      <template v-if="comCotas && !ehProvento">
        <div class="duas">
          <CampoTexto v-model="f.cotas" rotulo="Quantidade" type="number" step="any" min="0" tema="investimento" :erro="erros.cotas" />
          <CampoTexto v-model="f.preco" :rotulo="op === 'resgatar' ? 'Preço de venda' : 'Preço pago'" type="number" step="any" min="0" tema="investimento" :erro="erros.preco" />
        </div>
        <p class="total-calc">Total: <b>{{ moeda(totalCalculado) }}</b></p>
      </template>
      <template v-else-if="ehProvento">
        <CampoSelecao v-model="f.tipoRenda" rotulo="Tipo de rendimento" :opcoes="TIPOS_RENDA" tema="investimento" />
        <CampoValor v-model="f.total" rotulo="Valor recebido" tema="investimento" :erro="erros.total || erros.preco" />
      </template>
      <CampoValor v-else v-model="f.total" :rotulo="op === 'rendimento' ? 'Rendimento recebido' : op === 'resgatar' ? 'Valor resgatado' : 'Valor'" tema="investimento" :erro="erros.total" />
      <p v-if="op === 'rendimento' && !ativoDeCotas" class="nota">Renda fixa e metas rendem sozinhas pelo CDI/Selic do Bacen no histórico. Registre aqui só o rendimento real do extrato, se quiser.</p>
      <p v-if="resultadoResgate && !resultadoResgate.erro" class="resultado" :class="resultadoResgate.valor >= 0 ? 'lucro' : 'prejuizo'" data-resultado>
        {{ resultadoResgate.valor >= 0 ? 'Lucro' : 'Prejuízo' }} estimado pelo preço médio: <b>{{ moeda(Math.abs(resultadoResgate.valor)) }}</b></p>

      <CampoData v-model="f.data" rotulo="Data" atalhos tema="investimento" />

      <CampoSelecao v-if="temMeta" v-model="f.metaId" rotulo="Vincular a uma meta (opcional)" :opcoes="opcoesMeta" tema="investimento" />
      <p v-else-if="!liquidezRapida && op !== 'rendimento' && metas.length" class="nota">Liquidez lenta: este ativo não entra em metas, fica só em Investimentos.</p>

      <div class="grupo-conta">
        <CampoSelecao v-model="f.conta" :rotulo="op === 'guardar' ? 'De onde sai o dinheiro' : 'Conta que recebe o dinheiro'" :opcoes="opcoesConta" tema="investimento" :erro="erros.conta" />
        <CampoSelecao v-if="conciliando" v-model="f.transacaoId" rotulo="Transferência no extrato" :opcoes="opcoesCandidatas" tema="investimento" :erro="erros.transacao" dica="Marcada com ★ quando parece uma transferência para corretora. Ela deixa de contar como gasto." />
        <p v-else-if="corretoraDoAtivo && f.conta === corretoraDoAtivo && op === 'guardar'" class="nota">A compra sai da conta da corretora. Se o dinheiro ainda está no banco, faça antes a transferência banco → corretora.</p>
        <p v-else-if="semCorretora && ativoDeCotas && op === 'guardar'" class="nota">Sem corretora cadastrada: cadastre-a como conta (tipo Corretora) ou concilie com a transferência do extrato.
          <button type="button" class="link" @click="router.push('/contas')">Ir para Contas</button></p>
      </div>
      <CampoTexto v-model="f.descricao" rotulo="Observação (opcional)" maxlength="200" tema="investimento" />
    </template>
  </FormularioModal>
</template>

<style scoped>
.grupo-conta { display: flex; flex-direction: column; gap: 16px; }
.duas { display: grid; gap: 14px; grid-template-columns: 1fr 1fr; }
.nota { margin: 0; font-size: 12px; color: var(--cor-texto-suave); }
.link { background: none; border: none; color: var(--cor-investimento); font: inherit; font-weight: 600; text-decoration: underline; cursor: pointer; padding: 0 0 0 4px; min-height: 32px; }
.posicao { display: flex; flex-wrap: wrap; gap: 6px 18px; padding: 10px 14px; border-radius: 12px; background: color-mix(in srgb, var(--cor-investimento) 9%, transparent); }
.posicao span { display: flex; flex-direction: column; gap: 1px; }
.posicao small { font-size: 11.5px; color: var(--cor-texto-suave); }
.posicao b { font-size: 14.5px; font-variant-numeric: tabular-nums; }
.total-calc { margin: -6px 0 0; font-size: 13.5px; color: var(--cor-texto-suave); }
.total-calc b { color: var(--cor-texto); font-variant-numeric: tabular-nums; }
.resultado { margin: 0; font-size: 13.5px; }
.resultado.lucro b { color: var(--cor-entrada, #1f9d55); }
.resultado.prejuizo b { color: var(--cor-saida, #b4233c); }
</style>
