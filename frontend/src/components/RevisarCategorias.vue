<script setup>
// 1.2.2 (05/11, 17h13): lançamentos sem categoria (ou na "Geral") na página A revisar.
// Ali mesmo: escolher a categoria e Salvar, ou Ignorar (só lançamentos de conta: sai dos totais e do saldo).
import { ref, onMounted } from 'vue';
import CardPadrao from './CardPadrao.vue';
import LinhaTransacao from './LinhaTransacao.vue';
import { avisar } from '../services/avisos.js';
import { confirmar } from '../services/confirmar.js';

const emit = defineEmits(['quantidade']);
const itens = ref([]);
const despesas = ref([]);
const receitas = ref([]);
const escolha = ref({});
const ocupado = ref('');
const MOSTRAR = 20;
const limite = ref(MOSTRAR);

async function pedir(metodo, url, corpo) {
  const r = await fetch(url, { method: metodo, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, json: j };
}
async function carregar() {
  const [a, c, pe] = await Promise.all([pedir('GET', '/api/transacoes/sem-categoria'), despesas.value.length ? null : pedir('GET', '/api/categorias'), pedir('GET', '/api/reserva/auto/pendentes')]);
  // o que já está no bloco "Guardar e resgatar" não repete aqui
  const pend = new Set(((pe.ok && pe.json.pendentes) || []).map((x) => x.transacao && x.transacao.id));
  if (c && c.ok) despesas.value = (c.json || []).filter((x) => !/^geral$/i.test(x.nome || '')).map((x) => ({ id: x.id, nome: x.nome }));
  itens.value = (a.ok ? a.json.itens || [] : []).filter((i) => !pend.has(i.id));
  itens.value.forEach((i) => { if (escolha.value[i.id] === undefined) escolha.value[i.id] = ''; });
  receitas.value = a.ok ? (a.json.receitas || []).filter((n) => !/^geral$/i.test(n)) : [];
  emit('quantidade', itens.value.length);
}
onMounted(carregar);

const opcoes = (it) => (it.valor < 0 ? despesas.value.map((d) => ({ v: d.id, r: d.nome })) : receitas.value.map((n) => ({ v: n, r: n })));
const linha = (it) => ({ id: it.id, descricao: it.descricao, valor: it.valor, data: it.data, conta_nome: it.onde, icone: it.icone, a_revisar: true });

function tirar(it) {
  itens.value = itens.value.filter((x) => x.id !== it.id);
  emit('quantidade', itens.value.length);
}
async function salvar(it) {
  const v = escolha.value[it.id]; if (!v) return;
  ocupado.value = it.id;
  try {
    const r = it.origem === 'cartao'
      ? await pedir('PATCH', `/api/cartoes/${it.cartaoId}/lancamentos/${it.compraId}/categoria`, { categoriaId: v })
      : await pedir('PUT', `/api/transacoes/${it.id}`, it.valor < 0 ? { categoriaId: v } : { categoriaReceita: v });
    if (!r.ok) { avisar(r.json.erro || 'Não foi possível salvar.', { tipo: 'aviso' }); return; }
    tirar(it);
    avisar('Categoria salva.', { tipo: 'ok' });
  } finally { ocupado.value = ''; }
}
async function ignorar(it) {
  if (!(await confirmar({ titulo: 'Ignorar este lançamento?', acao: 'Ignorar', perigo: false,
    texto: `${it.descricao} sai das entradas e saídas e do saldo da conta. Dá para desfazer depois no detalhe da transação.` }))) return;
  ocupado.value = it.id;
  try {
    const r = await pedir('PUT', `/api/transacoes/${it.id}/ignorar`, { ignorada: true });
    if (!r.ok) { avisar(r.json.erro || 'Não foi possível ignorar.', { tipo: 'aviso' }); return; }
    tirar(it);
    avisar('Lançamento ignorado.', { tipo: 'ok' });
  } finally { ocupado.value = ''; }
}
</script>

<template>
  <CardPadrao v-if="itens.length" tema="entrada" titulo="Sem categoria" :subtitulo="itens.length + (itens.length === 1 ? ' lançamento' : ' lançamentos')" data-revisar-categorias>
    <ul class="lista">
      <li v-for="it in itens.slice(0, limite)" :key="it.id" class="item">
        <LinhaTransacao :t="linha(it)" :info="{ nome: it.onde }" :clicavel="false" />
        <div class="campos" :class="{ tres: it.origem === 'conta' }">
          <select v-model="escolha[it.id]" class="sf-entrada" :aria-label="'Categoria para ' + it.descricao">
            <option value="" disabled>Escolha a categoria</option>
            <option v-for="o in opcoes(it)" :key="o.v" :value="o.v">{{ o.r }}</option>
          </select>
          <button type="button" class="sf-botao primario" :disabled="!escolha[it.id] || ocupado === it.id" @click="salvar(it)">Salvar</button>
          <button v-if="it.origem === 'conta'" type="button" class="sf-botao secundario" :disabled="ocupado === it.id" @click="ignorar(it)">Ignorar</button>
        </div>
      </li>
    </ul>
    <button v-if="itens.length > limite" type="button" class="mais" @click="limite += MOSTRAR">Ver mais {{ Math.min(MOSTRAR, itens.length - limite) }}</button>
  </CardPadrao>
</template>

<style scoped>
.lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.item { display: flex; flex-direction: column; gap: 8px; padding: 12px 0; border-top: 1px solid var(--cor-borda); }
.item:first-child { border-top: none; padding-top: 2px; }
.item :deep(.linha-tx) { margin: 0 -6px; }
.campos { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center; }
.campos.tres { grid-template-columns: minmax(0, 1fr) auto auto; }
.campos select { min-height: 44px; width: 100%; min-width: 0; }
.campos .sf-botao { min-height: 44px; padding: 0 14px; }
.mais { margin-top: 10px; width: 100%; min-height: 40px; border-radius: 12px; border: 1px solid var(--cor-borda); background: none; color: var(--cor-texto); font: 600 14px var(--fonte-texto); cursor: pointer; }
</style>
