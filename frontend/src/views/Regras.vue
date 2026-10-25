<script setup>
// Regras de categorização: lista, ativar/desativar, excluir e criar. Rota /regras (Minhas finanças).
import { ref, computed, onMounted } from 'vue';
import { Plus, Trash2 } from 'lucide-vue-next';
import CardPadrao from '../components/CardPadrao.vue';
import AbasSeletor from '../components/AbasSeletor.vue';
import IconeCategoria from '../components/IconeCategoria.vue';
import RegraModal from '../components/RegraModal.vue';
import { avisar } from '../services/avisos.js';

const regras = ref([]);
const carregando = ref(true);
const aba = ref('saida');
const modal = ref(false);
const moeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const lista = computed(() => regras.value.filter((r) => r.tipo === aba.value));

async function carregar() {
  try { const r = await fetch('/api/regras', { credentials: 'include' }); regras.value = r.ok ? await r.json() : []; } finally { carregando.value = false; }
}
async function alternar(r) {
  const resp = await fetch(`/api/regras/${r.id}`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ativa: !r.ativa }) });
  if (resp.ok) r.ativa = !r.ativa;
}
async function excluir(r) {
  if (!confirm(`Excluir a regra "${r.padrao}"? Os lançamentos já categorizados continuam como estão.`)) return;
  await fetch(`/api/regras/${r.id}`, { method: 'DELETE', credentials: 'include' });
  await carregar();
}
async function criada({ aplicadas }) {
  modal.value = false;
  avisar(aplicadas ? `Regra criada. ${aplicadas} lançamento(s) antigo(s) movido(s).` : 'Regra criada.');
  await carregar();
}
const detalhe = (r) => [r.contaNome ? `só na conta ${r.contaNome}` : '', r.valorMin !== null || r.valorMax !== null ? `valor ${r.valorMin !== null ? 'de ' + moeda(r.valorMin) : ''}${r.valorMax !== null ? ' até ' + moeda(r.valorMax) : ''}` : '', `usada ${r.aplicacoes}x`].filter(Boolean).join(' · ');
onMounted(carregar);
</script>

<template>
  <div class="pagina">
    <h1>Regras de categorização</h1>
    <p class="nota">Ensine o app: quando o nome de um lançamento tiver certo trecho, ele já entra na categoria certa.</p>
    <AbasSeletor v-model="aba" :abas="[{ id: 'saida', rotulo: 'Despesas' }, { id: 'entrada', rotulo: 'Entradas' }]" :tema="aba" bloco />
    <CardPadrao :titulo="aba === 'saida' ? 'Regras de despesa' : 'Regras de entrada'" :subtitulo="`${lista.length} regra(s)`">
      <p v-if="!carregando && !lista.length" class="nota">Nenhuma regra ainda. Ao corrigir a categoria de um lançamento em Transações, o app sugere criar uma.</p>
      <ul class="lista">
        <li v-for="r in lista" :key="r.id" :class="{ off: !r.ativa }">
          <IconeCategoria :valor="r.categoriaIcone" :tipo="r.tipo" :tamanho="40" />
          <span class="txt"><b>“{{ r.padrao }}” → {{ r.categoriaNome }}</b><small>{{ detalhe(r) }}</small></span>
          <label class="chave"><input type="checkbox" :checked="r.ativa" :aria-label="`${r.ativa ? 'Desativar' : 'Ativar'} regra ${r.padrao}`" @change="alternar(r)" /><span>{{ r.ativa ? 'Ativa' : 'Pausada' }}</span></label>
          <button type="button" class="lixo" :aria-label="`Excluir regra ${r.padrao}`" @click="excluir(r)"><Trash2 :size="18" /></button>
        </li>
      </ul>
    </CardPadrao>
    <button type="button" class="nova" @click="modal = true"><Plus :size="18" :stroke-width="2.4" /> Nova regra</button>
    <RegraModal :aberto="modal" :inicial="{ tipo: aba }" @fechar="modal = false" @salvo="criada" />
  </div>
</template>

<style scoped>
.pagina { padding: 0 0 var(--espaco-fim); max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--espaco-secao); }
h1 { margin: 0; font: 700 22px var(--fonte-display); }
.nota { margin: 0; font-size: 13px; color: var(--cor-texto-suave); }
.lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
li { display: flex; align-items: center; gap: 12px; padding: 8px 4px; min-height: 60px; flex-wrap: wrap; }
li.off .txt { opacity: .55; }
.txt { flex: 1 1 180px; min-width: 0; display: flex; flex-direction: column; gap: 2px; overflow-wrap: anywhere; }
.txt small { color: var(--cor-texto-suave); font-size: 12px; }
.chave { display: flex; align-items: center; gap: 6px; min-height: 44px; font-size: 12px; cursor: pointer; }
.chave input { width: 20px; height: 20px; }
.lixo { width: 44px; height: 44px; border: none; background: none; border-radius: 50%; color: var(--cor-alerta, var(--cor-saida)); cursor: pointer; display: grid; place-items: center; }
.lixo:hover { background: var(--cor-realce); }
.nova { align-self: flex-start; min-height: 44px; padding: 0 18px; border-radius: 12px; border: none; background: var(--cor-interface, var(--cor-primaria)); color: var(--cor-sobre-cor, #fff); font: 600 14px var(--fonte-texto); display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
</style>
