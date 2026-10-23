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
import { PiggyBank, ArrowUpFromLine, Coins, TrendingUp } from 'lucide-vue-next';
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
  operacao: props.operacaoInicial, ativo: props.ativoId || (props.carteira.ativos[0]?.id ?? NOVO), tipoAtivo: 'cdb', nome: '', corretoraId: '',
  cotas: '', preco: '', total: 0, data: hojeISO(), metaId: props.metaInicial || '', conta: '', transacaoId: '', descricao: '',
});

watch(() => props.aberto, async (v) => {
  if (!v) return;
  erro.value = ''; erros.value = {};
  f.value = vazio();
  if (props.edicao) {
    const e = props.edicao;
    f.value = {
      ...vazio(), ativo: e.ativo_id || props.ativoId, operacao: e.tipo === 'compra' ? 'guardar' : e.tipo === 'venda' ? 'resgatar' : e.tipo,
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
const comCotas = computed(() => TIPOS_COTAS.includes(tipoAtivo.value) || (ativoSel.value?.usa_cotas && !novo.value));
const liquidezRapida = computed(() => (novo.value ? props.carteira.tipos_liquidez_rapida?.includes(f.value.tipoAtivo) : ativoSel.value?.liquidez === 'rapida'));
const op = computed(() => f.value.operacao);
const ehProvento = computed(() => op.value === 'provento');
const ehSaida = computed(() => op.value === 'resgatar');
const corretoraDoAtivo = computed(() => (novo.value ? f.value.corretoraId : ativoSel.value?.corretora_conta_id) || '');

const opcoesOperacao = computed(() => [
  { id: 'guardar', rotulo: 'Guardar', tema: 'investimento', icone: PiggyBank },
  { id: 'resgatar', rotulo: 'Resgatar', tema: 'investimento', icone: ArrowUpFromLine },
  comCotas.value ? { id: 'provento', rotulo: 'Provento', tema: 'investimento', icone: Coins } : { id: 'rendimento', rotulo: 'Rendimento', tema: 'investimento', icone: TrendingUp },
]);
watch(comCotas, () => { if (op.value === 'provento' && !comCotas.value) f.value.operacao = 'rendimento'; if (op.value === 'rendimento' && comCotas.value) f.value.operacao = 'provento'; });

const opcoesAtivo = computed(() => [
  ...props.carteira.ativos.filter((a) => !a.encerrado || a.id === props.ativoId).map((a) => ({ valor: a.id, rotulo: `${a.ticker || a.nome} · ${a.tipo_rotulo}` })),
  { valor: NOVO, rotulo: '+ Novo ativo' },
]);
const opcoesTipo = computed(() => (props.carteira.tipos || []).map((t) => ({ valor: t.valor, rotulo: `${t.rotulo}${t.liquidez === 'rapida' ? '' : ' (liquidez lenta)'}` })));
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
const temMeta = computed(() => liquidezRapida.value && ['guardar', 'resgatar', 'rendimento'].includes(op.value) && props.metas.length > 0);

watch(() => f.value.ativo, () => {
  if (props.edicao) return;
  if (ativoSel.value) f.value.conta = ativoSel.value.corretora_conta_id || '';
  if (!liquidezRapida.value) f.value.metaId = '';
});
watch(() => f.value.corretoraId, (v) => { if (novo.value) f.value.conta = v || ''; });
watch(() => f.value.tipoAtivo, () => { if (!liquidezRapida.value) f.value.metaId = ''; });

const titulo = computed(() => (props.edicao ? 'Editar lançamento' : ({ guardar: 'Guardar', resgatar: 'Resgatar', provento: 'Registrar provento', rendimento: 'Registrar rendimento' }[op.value])));

async function salvar() {
  erro.value = ''; erros.value = {};
  const v = f.value;
  if (novo.value && !v.nome.trim()) erros.value.nome = 'Informe o ticker ou nome do ativo.';
  if (comCotas.value && !ehProvento.value) {
    if (!(Number(v.cotas) > 0)) erros.value.cotas = 'Informe as cotas.';
    if (!(Number(v.preco) > 0)) erros.value.preco = 'Informe o preço.';
  } else if (ehProvento.value && comCotas.value) {
    if (!(Number(v.preco) > 0) && !(Number(v.total) > 0)) erros.value.preco = 'Informe o provento por cota (ou o total).';
  } else if (!(Number(v.total) > 0)) erros.value.total = 'Informe um valor maior que zero.';
  if (conciliando.value && !v.transacaoId) erros.value.transacao = 'Escolha a transferência do extrato.';
  if (Object.keys(erros.value).length) return;

  const corpo = { tipo: v.operacao, data: v.data || hojeISO(), descricao: v.descricao, metaId: temMeta.value ? v.metaId || null : null };
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
      <CampoSelecao v-model="f.tipoAtivo" rotulo="Tipo de investimento" :opcoes="opcoesTipo" tema="investimento" />
      <CampoTexto v-model="f.nome" :rotulo="comCotas ? 'Ticker (ex.: PETR4, MXRF11)' : 'Nome (ex.: CDB Inter 110% CDI)'" maxlength="60" tema="investimento" obrigatorio :erro="erros.nome" />
      <CampoSelecao v-model="f.corretoraId" rotulo="Corretora" :opcoes="opcoesCorretora" tema="investimento" />
    </template>

    <template v-if="comCotas && !ehProvento">
      <div class="duas">
        <CampoTexto v-model="f.cotas" rotulo="Cotas" type="number" step="any" min="0" tema="investimento" :erro="erros.cotas" />
        <CampoTexto v-model="f.preco" rotulo="Preço por cota" type="number" step="any" min="0" tema="investimento" :erro="erros.preco" />
      </div>
      <CampoTexto :model-value="totalCalculado" rotulo="Total (cotas × preço)" type="number" disabled />
    </template>
    <template v-else-if="ehProvento">
      <CampoTexto v-model="f.preco" rotulo="Provento por cota" type="number" step="any" min="0" tema="investimento" :erro="erros.preco" dica="O total usa as cotas que você tinha na data." />
      <CampoValor v-model="f.total" rotulo="Ou o valor total recebido" tema="investimento" />
    </template>
    <CampoValor v-else v-model="f.total" :rotulo="op === 'rendimento' ? 'Rendimento recebido' : 'Valor total'" tema="investimento" :erro="erros.total" />

    <CampoData v-model="f.data" rotulo="Data" atalhos tema="investimento" />

    <CampoSelecao v-if="temMeta" v-model="f.metaId" rotulo="Vincular a uma meta (opcional)" :opcoes="opcoesMeta" tema="investimento" />
    <p v-else-if="!liquidezRapida && !ehProvento && metas.length" class="nota">Este ativo tem liquidez lenta, então não entra em metas: ele fica só em Investimentos.</p>

    <div class="grupo-conta">
      <CampoSelecao v-model="f.conta" :rotulo="ehSaida || ehProvento || op === 'rendimento' ? 'Conta que recebe o dinheiro' : 'De onde sai o dinheiro'" :opcoes="opcoesConta" tema="investimento" />
      <CampoSelecao v-if="conciliando" v-model="f.transacaoId" rotulo="Transferência no extrato" :opcoes="opcoesCandidatas" tema="investimento" :erro="erros.transacao" dica="Marcada com ★ quando parece uma transferência para corretora. Ela deixa de contar como gasto." />
      <p v-else-if="corretoraDoAtivo && f.conta === corretoraDoAtivo" class="nota">A compra sai da conta da corretora. Se o dinheiro ainda está no banco, faça antes a transferência banco → corretora.</p>
      <p v-else-if="semCorretora && comCotas" class="nota">Você ainda não cadastrou uma corretora. Cadastre-a como conta (tipo Corretora) em Contas, ou concilie esta compra com a transferência que aparece no extrato do banco.
        <button type="button" class="link" @click="router.push('/contas')">Ir para Contas</button></p>
    </div>
    <CampoTexto v-model="f.descricao" rotulo="Observação (opcional)" maxlength="200" tema="investimento" />
  </FormularioModal>
</template>

<style scoped>
.grupo-conta { display: flex; flex-direction: column; gap: 16px; }
.duas { display: grid; gap: 14px; grid-template-columns: 1fr 1fr; }
@media (max-width: 480px) { .duas { grid-template-columns: 1fr; } }
.nota { margin: 0; font-size: 12px; color: var(--cor-texto-suave); }
.link { background: none; border: none; color: var(--cor-investimento); font: inherit; font-weight: 600; text-decoration: underline; cursor: pointer; padding: 0 0 0 4px; min-height: 32px; }
</style>
