<script setup>
// Criar OU editar regra de categorização ("Padaria do José" → Mercado): trecho do nome, tipo, categoria + subcategoria,
// ícone do item, conta (opcional), faixa de valor (opcional) e "aplicar nos antigos" (mostra quantos serão afetados).
// Props: aberto, inicial { id?, tipo, padrao, categoriaId, categoriaReceita, subcategoria, icone, contaId, valorMin, valorMax, valor, ativa }, tipoFixo.
//   Com `inicial.id` a janela edita (PUT /api/regras/:id) e mostra Excluir e Pausar/Ativar; sem id cria (POST /api/regras).
// Eventos: fechar, salvo({ regra, aplicadas, editada }), excluir(regra), alternar(regra).
import { ref, computed, watch } from 'vue';
import { Trash2, Pause, Play } from 'lucide-vue-next';
import FormularioModal from './FormularioModal.vue';
import CampoTexto from './CampoTexto.vue';
import CampoTipo from './CampoTipo.vue';
import CampoValor from './CampoValor.vue';
import CampoSelecao from './CampoSelecao.vue';
import CampoCategoria from './CampoCategoria.vue';
import CampoIconeItem from './CampoIconeItem.vue';

const props = defineProps({ aberto: Boolean, inicial: { type: Object, default: () => ({}) }, tipoFixo: Boolean });
const emit = defineEmits(['fechar', 'salvo', 'excluir', 'alternar']);

const f = ref({ tipo: 'saida', padrao: '', categoriaId: '', categoriaReceita: '', subcategoria: '', icone: '', contaId: '', usarValor: false, valorMin: 0, valorMax: 0, aplicar: true });
const contas = ref([]);
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
  };
  erro.value = ''; previa.value = null;
  try { const r = await fetch('/api/contas', { credentials: 'include' }); contas.value = r.ok ? await r.json() : []; } catch { contas.value = []; }
});

const opcoesConta = computed(() => [{ valor: '', rotulo: 'Qualquer conta ou cartão' }, ...contas.value.map((c) => ({ valor: c.id, rotulo: `Só na conta ${c.nome}` }))]);

const corpo = () => {
  const x = f.value;
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
  if (!props.aberto || x.padrao.trim().length < 2 || !(x.tipo === 'saida' ? x.categoriaId : x.categoriaReceita)) return;
  t = setTimeout(async () => {
    const q = new URLSearchParams(Object.entries(corpo()).filter(([, v]) => v !== undefined && v !== '' && v !== null).map(([k, v]) => [k, String(v)]));
    try { const r = await fetch(`/api/regras/previa?${q}`, { credentials: 'include' }); previa.value = r.ok ? await r.json() : null; } catch { previa.value = null; }
  }, 250);
});

async function salvar() {
  erro.value = '';
  salvando.value = true;
  try {
    const x = f.value;
    const body = { ...corpo(), subcategoria: x.subcategoria.trim(), icone: x.icone || '', aplicarAntigas: x.aplicar };
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
  <FormularioModal :aberto="aberto" :titulo="editando ? 'Editar regra' : 'Nova regra de categoria'" :tema="f.tipo" :rotulo-salvar="editando ? 'Salvar' : 'Criar regra'" :sem-cancelar="editando" :carregando="salvando" :erro="erro" @salvar="salvar" @fechar="emit('fechar')">
    <p class="nota">Toda vez que o nome tiver esse trecho, o lançamento vai para a categoria escolhida.</p>
    <div v-if="editando" class="estado" :class="{ pausada: !ativa }">
      <span><b>{{ ativa ? 'Regra ativa' : 'Regra pausada' }}</b><small>{{ ativa ? 'Categoriza os próximos lançamentos.' : 'Não categoriza nada até ser ativada.' }}</small></span>
      <button type="button" class="alternar" @click="emit('alternar', inicial)">
        <component :is="ativa ? Pause : Play" :size="16" :stroke-width="2.2" aria-hidden="true" /> {{ ativa ? 'Pausar' : 'Ativar' }}
      </button>
    </div>
    <CampoTipo v-if="!tipoFixo" v-model="f.tipo" />
    <CampoTexto v-model="f.padrao" rotulo="Quando o nome contiver" placeholder="Ex: Padaria do José" obrigatorio :tema="f.tipo" />
    <CampoCategoria v-if="f.tipo === 'saida'" :key="'s'" v-model="f.categoriaId" tipo="saida" :tema="f.tipo" rotulo="Vai para a categoria" />
    <CampoCategoria v-else :key="'e'" v-model="f.categoriaReceita" tipo="entrada" :tema="f.tipo" rotulo="Vai para a categoria" />
    <CampoTexto v-model="f.subcategoria" rotulo="Subcategoria (opcional)" maxlength="80" placeholder="Ex: Delivery, Uber do trabalho" :tema="f.tipo" />
    <CampoIconeItem v-model="f.icone" :tipo="f.tipo" :descricao="f.padrao" />
    <CampoSelecao v-model="f.contaId" rotulo="Conta ou cartão (opcional)" :opcoes="opcoesConta" :tema="f.tipo" dica="Sem conta escolhida, a regra vale para todas as contas e para as compras no cartão." />
    <label class="opcao"><input v-model="f.usarValor" type="checkbox" /> Só para uma faixa de valor</label>
    <div v-if="f.usarValor" class="faixa">
      <CampoValor v-model="f.valorMin" :tipo="f.tipo" rotulo="De" />
      <CampoValor v-model="f.valorMax" :tipo="f.tipo" rotulo="Até" />
    </div>
    <label class="opcao"><input v-model="f.aplicar" type="checkbox" /> Aplicar às transações antigas</label>
    <p v-if="previa" class="previa" role="status">{{ previa.quantidade === 0 ? 'Nenhum lançamento antigo muda de categoria.' : `${previa.quantidade} ${previa.quantidade === 1 ? 'lançamento antigo' : 'lançamentos antigos'} ${f.aplicar ? (previa.quantidade === 1 ? 'será movido' : 'serão movidos') : (previa.quantidade === 1 ? 'poderia ser movido' : 'poderiam ser movidos')} para esta categoria` }}{{ previa.exemplos && previa.exemplos.length ? ` (ex.: ${previa.exemplos.slice(0, 2).join(', ')})` : '' }}.</p>
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
