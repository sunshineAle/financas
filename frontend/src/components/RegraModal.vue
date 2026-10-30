<script setup>
// Criar OU editar regra de categorização ("Padaria do José" → Mercado): trecho do nome, tipo, categoria + subcategoria,
// ícone do item, conta (opcional), faixa de valor (opcional) e "aplicar nos antigos" (mostra quantos serão afetados).
// Props: aberto, inicial { id?, tipo, padrao, categoriaId, categoriaReceita, subcategoria, icone, contaId, valorMin, valorMax, valor, ativa }, tipoFixo.
//   Com `inicial.id` a janela edita (PUT /api/regras/:id) e mostra Excluir e Pausar/Ativar; sem id cria (POST /api/regras).
// Eventos: fechar, salvo({ regra, aplicadas, editada }), excluir(regra), alternar(regra).
// Homologação 1.0, seção 15: tipo 'reserva' (Regras de metas e investimentos) — o destino deixa de ser categoria:
// Guardar em meta · Resgatar de meta · Aporte em investimento · Resgate de investimento (inicial.destino/metaId/ativoId).
// Sem `tipoFixo`, a janela oferece os três tipos: Saída · Entrada · Metas e investimentos.
import { ref, computed, watch } from 'vue';
import { Trash2, Pause, Play } from 'lucide-vue-next';
import FormularioModal from './FormularioModal.vue';
import CampoTexto from './CampoTexto.vue';
import CampoTipo from './CampoTipo.vue';
import CampoValor from './CampoValor.vue';
import CampoSelecao from './CampoSelecao.vue';
import CampoCategoria from './CampoCategoria.vue';
import CampoIconeItem from './CampoIconeItem.vue';
import CampoSubcategoria from './CampoSubcategoria.vue';

const props = defineProps({ aberto: Boolean, inicial: { type: Object, default: () => ({}) }, tipoFixo: Boolean });
const emit = defineEmits(['fechar', 'salvo', 'excluir', 'alternar']);

const f = ref({ tipo: 'saida', padrao: '', categoriaId: '', categoriaReceita: '', subcategoria: '', icone: '', contaId: '', usarValor: false, valorMin: 0, valorMax: 0, aplicar: true, destino: 'guardar', metaId: '', ativoId: '' });
const contas = ref([]);
const metas = ref([]);
const ativos = ref([]);
const sugestoesSub = ref([]);
const ehReserva = computed(() => f.value.tipo === 'reserva');
const destinoMeta = computed(() => f.value.destino === 'guardar' || f.value.destino === 'resgatar');
const temaForm = computed(() => (ehReserva.value ? (destinoMeta.value ? 'meta' : 'investimento') : f.value.tipo));
const TIPOS = [{ id: 'saida', rotulo: 'Saída', tema: 'saida' }, { id: 'entrada', rotulo: 'Entrada', tema: 'entrada' }, { id: 'reserva', rotulo: 'Metas e invest.', tema: 'meta' }];
const DESTINOS = [{ id: 'guardar', rotulo: 'Guardar', tema: 'meta' }, { id: 'resgatar', rotulo: 'Resgatar', tema: 'meta' }, { id: 'aporte', rotulo: 'Aporte', tema: 'investimento' }, { id: 'resgate_inv', rotulo: 'Resgate', tema: 'investimento' }];
async function carregarReserva() {
  try {
    const [rm, ra] = await Promise.all([fetch('/api/reserva', { credentials: 'include' }), fetch('/api/investimentos', { credentials: 'include' })]);
    const jm = rm.ok ? await rm.json() : null;
    metas.value = (jm && (jm.metas || jm.reserva?.metas)) || [];
    const ja = ra.ok ? await ra.json() : null;
    ativos.value = (ja && (ja.ativos || ja.carteira?.ativos)) || [];
  } catch { metas.value = []; ativos.value = []; }
}
const previa = ref(null);
const erro = ref('');
const salvando = ref(false);
const editando = computed(() => !!(props.inicial && props.inicial.id));
const ativa = computed(() => !editando.value || props.inicial.ativa !== false);

watch(() => props.aberto, async (a) => {
  if (!a) return;
  const i = props.inicial || {};
  const v = Number(i.valor) || 0;
  const temFaixa = i.valorMin !== null && i.valorMin !== undefined || i.valorMax !== null && i.valorMax !== undefined;
  f.value = {
    tipo: i.tipo === 'entrada' ? 'entrada' : 'saida', padrao: i.padrao || '', categoriaId: i.categoriaId || '', categoriaReceita: i.categoriaReceita || '',
    subcategoria: i.subcategoria || '', icone: i.icone || '', contaId: i.id ? (i.contaId || '') : '',
    usarValor: !!(i.id && temFaixa), valorMin: temFaixa ? Number(i.valorMin) || 0 : v, valorMax: temFaixa ? Number(i.valorMax) || 0 : v,
    aplicar: !i.id,
    destino: i.destino || 'guardar', metaId: i.metaId || '', ativoId: i.ativoId || '',
  };
  if (i.tipo === 'reserva') f.value.tipo = 'reserva';
  erro.value = ''; previa.value = null;
  carregarReserva();
  try { const r = await fetch('/api/contas', { credentials: 'include' }); contas.value = r.ok ? await r.json() : []; } catch { contas.value = []; }
});

const opcoesConta = computed(() => [{ valor: '', rotulo: 'Qualquer conta ou cartão' }, ...contas.value.map((c) => ({ valor: c.id, rotulo: `Só na conta ${c.nome}` }))]);

const corpo = () => {
  const x = f.value;
  if (x.tipo === 'reserva') {
    return { tipo: 'reserva', padrao: x.padrao.trim(), destino: x.destino, metaId: destinoMeta.value ? x.metaId : undefined, ativoId: destinoMeta.value ? undefined : x.ativoId,
      contaId: x.contaId || '', valorMin: x.usarValor ? x.valorMin : '', valorMax: x.usarValor ? x.valorMax : '' };
  }
  return {
    tipo: x.tipo, padrao: x.padrao.trim(),
    categoriaId: x.tipo === 'saida' ? x.categoriaId : undefined, categoriaReceita: x.tipo === 'entrada' ? x.categoriaReceita : undefined,
    contaId: x.contaId || '', valorMin: x.usarValor ? x.valorMin : '', valorMax: x.usarValor ? x.valorMax : '',
  };
};
let t = null;
watch(() => [props.aberto, JSON.stringify(corpo())], () => {
  clearTimeout(t); previa.value = null;
  const x = f.value;
  if (!props.aberto || x.padrao.trim().length < 2 || !(x.tipo === 'reserva' ? (destinoMeta.value ? x.metaId : x.ativoId) : x.tipo === 'saida' ? x.categoriaId : x.categoriaReceita)) return;
  t = setTimeout(async () => {
    const q = new URLSearchParams(Object.entries(corpo()).filter(([, v]) => v !== undefined && v !== '' && v !== null).map(([k, v]) => [k, String(v)]));
    try { const r = await fetch(`/api/regras/previa?${q}`, { credentials: 'include' }); previa.value = r.ok ? await r.json() : null; } catch { previa.value = null; }
  }, 250);
});

watch(() => [props.aberto, f.value.tipo, f.value.categoriaId, f.value.categoriaReceita], async () => {
  const x = f.value;
  if (!props.aberto || x.tipo === 'reserva') { sugestoesSub.value = []; return; }
  const qs = new URLSearchParams(x.tipo === 'saida' ? { categoriaId: x.categoriaId || '' } : { categoriaReceita: x.categoriaReceita || '' });
  try { const r = await fetch(`/api/transacoes/subcategorias?${qs}`, { credentials: 'include' }); sugestoesSub.value = r.ok ? await r.json() : []; } catch { sugestoesSub.value = []; }
});
async function salvar() {
  erro.value = '';
  salvando.value = true;
  try {
    const x = f.value;
    const body = { ...corpo(), ...(x.tipo === 'reserva' ? {} : { subcategoria: x.subcategoria.trim(), icone: x.icone || '' }), aplicarAntigas: x.aplicar };
    if (editando.value) {
      if (body.valorMin === '') body.valorMin = null;
      if (body.valorMax === '') body.valorMax = null;
    }
    const url = editando.value ? `/api/regras/${props.inicial.id}` : '/api/regras';
    const r = await fetch(url, { method: editando.value ? 'PUT' : 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) { erro.value = d.erro || (editando.value ? 'Não foi possível salvar a regra.' : 'Não foi possível criar a regra.'); return; }
    emit('salvo', editando.value ? { regra: d, aplicadas: d.aplicadas || 0, editada: true } : { ...d, editada: false });
  } finally { salvando.value = false; }
}
</script>

<template>
  <FormularioModal :aberto="aberto" ajuda="regras" :titulo="editando ? 'Editar regra' : ehReserva ? 'Nova regra de meta ou investimento' : 'Nova regra de categoria'" :tema="temaForm" :rotulo-salvar="editando ? 'Salvar' : 'Criar regra'" :sem-cancelar="editando" :carregando="salvando" :erro="erro" @salvar="salvar" @fechar="emit('fechar')">
    <div v-if="editando" class="estado" :class="{ pausada: !ativa }">
      <span><b>{{ ativa ? 'Regra ativa' : 'Regra pausada' }}</b><small>{{ ativa ? 'Categoriza os próximos lançamentos.' : 'Não categoriza nada até ser ativada.' }}</small></span>
      <button type="button" class="alternar" @click="emit('alternar', inicial)">
        <component :is="ativa ? Pause : Play" :size="16" :stroke-width="2.2" aria-hidden="true" /> {{ ativa ? 'Pausar' : 'Ativar' }}
      </button>
    </div>
    <CampoTipo v-if="!tipoFixo" v-model="f.tipo" :opcoes="TIPOS" />
    <CampoTexto v-model="f.padrao" rotulo="Quando o nome contiver" :placeholder="ehReserva ? 'Ex: APLICACAO RDB, COMPRA MXRF11' : 'Ex: Padaria do José'" obrigatorio :tema="temaForm" />
    <template v-if="ehReserva">
      <CampoTipo v-model="f.destino" rotulo="O que a regra faz" :opcoes="DESTINOS" />
      <CampoSelecao v-if="destinoMeta" v-model="f.metaId" :rotulo="f.destino === 'guardar' ? 'Guardar na meta' : 'Resgatar da meta'" :opcoes="[{ valor: '', rotulo: 'Escolha a meta' }, ...metas.map((m) => ({ valor: m.id, rotulo: m.nome }))]" tema="meta" />
      <CampoSelecao v-else v-model="f.ativoId" :rotulo="f.destino === 'aporte' ? 'Aporte no investimento' : 'Resgate do investimento'" :opcoes="[{ valor: '', rotulo: ativos.length ? 'Escolha o investimento' : 'Cadastre um investimento em Objetivos' }, ...ativos.map((a) => ({ valor: a.id, rotulo: a.ticker || a.nome }))]" tema="investimento" />
      <p class="nota">{{ f.destino === 'guardar' ? 'Saídas com esse nome viram Guardar na meta.' : f.destino === 'resgatar' ? 'Entradas com esse nome viram Resgatar da meta; o que passar do guardado vira Rendimento.' : f.destino === 'aporte' ? 'Saídas com esse nome viram aporte no investimento.' : 'Entradas com esse nome viram resgate do investimento.' }} Não contam como entrada nem saída.</p>
    </template>
    <template v-else>
      <CampoCategoria v-if="f.tipo === 'saida'" :key="'s'" v-model="f.categoriaId" tipo="saida" :tema="f.tipo" rotulo="Vai para a categoria" />
      <CampoCategoria v-else :key="'e'" v-model="f.categoriaReceita" tipo="entrada" :tema="f.tipo" rotulo="Vai para a categoria" />
      <CampoSubcategoria v-model="f.subcategoria" :sugestoes="sugestoesSub" :tema="f.tipo" />
      <CampoIconeItem v-model="f.icone" :tipo="f.tipo" :descricao="f.padrao" />
    </template>
    <CampoSelecao v-model="f.contaId" rotulo="Conta ou cartão (opcional)" :opcoes="opcoesConta" :tema="temaForm" dica="Sem conta escolhida, vale para todas." dica-ao-focar />
    <label class="opcao"><input v-model="f.usarValor" type="checkbox" /> Só para uma faixa de valor</label>
    <div v-if="f.usarValor" class="faixa">
      <CampoValor v-model="f.valorMin" :tipo="ehReserva ? 'saida' : f.tipo" rotulo="De" />
      <CampoValor v-model="f.valorMax" :tipo="ehReserva ? 'saida' : f.tipo" rotulo="Até" />
    </div>
    <label class="opcao"><input v-model="f.aplicar" type="checkbox" /> Aplicar às transações antigas</label>
    <p v-if="previa" class="previa" role="status">{{ previa.quantidade === 0 ? (ehReserva ? 'Nenhum lançamento antigo combina.' : 'Nenhum lançamento antigo muda de categoria.') : `${previa.quantidade} ${previa.quantidade === 1 ? 'lançamento antigo' : 'lançamentos antigos'} ${f.aplicar ? (previa.quantidade === 1 ? 'será movido' : 'serão movidos') : (previa.quantidade === 1 ? 'poderia ser movido' : 'poderiam ser movidos')} ${ehReserva ? 'para este destino' : 'para esta categoria'}` }}{{ previa.exemplos && previa.exemplos.length ? ` (ex.: ${previa.exemplos.slice(0, 2).join(', ')})` : '' }}.</p>
    <template v-if="editando" #extra>
      <button type="button" class="sf-botao secundario excluir" :disabled="salvando" @click="emit('excluir', inicial)"><Trash2 :size="16" :stroke-width="2" aria-hidden="true" /> Excluir</button>
    </template>
  </FormularioModal>
</template>

<style scoped>
.nota { margin: 0; font-size: 13px; color: var(--cor-texto-suave); }
.opcao { display: flex; align-items: center; gap: 10px; min-height: 44px; font-size: 14px; cursor: pointer; }
.opcao input { width: 20px; height: 20px; }
.faixa { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.previa { margin: 0; font-size: 13px; border: 1px dashed var(--cor-borda); border-radius: 10px; padding: 10px 12px; color: var(--cor-texto); }
.estado { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 12px; background: color-mix(in srgb, var(--cor-entrada) 10%, transparent); border: 1px solid color-mix(in srgb, var(--cor-entrada) 35%, transparent); }
.estado.pausada { background: color-mix(in srgb, var(--cor-interface) 10%, transparent); border-color: color-mix(in srgb, var(--cor-interface) 35%, transparent); }
.estado > span { flex: 1; display: flex; flex-direction: column; gap: 2px; font-size: 14px; }
.estado small { font-size: 12px; color: var(--cor-texto-suave); }
.alternar { min-height: 44px; padding: 0 14px; border-radius: 10px; border: 1.5px solid currentColor; background: transparent; color: var(--cor-interface); font: 700 13px var(--fonte-texto); display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
.estado.pausada .alternar { color: var(--cor-entrada-texto, var(--cor-entrada)); }
.excluir { display: inline-flex; align-items: center; justify-content: center; gap: 6px; color: var(--cor-saida-texto, var(--cor-saida)); }
</style>
