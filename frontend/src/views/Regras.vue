<script setup>
// Regras de categorização (rota /regras, Minhas finanças) — anotação 48.
// Lista por tipo; tocar abre a edição (RegraModal). Gestos na linha (toque e mouse, pointer events):
//   arrastar para a ESQUERDA = pausar/ativar · arrastar para a DIREITA = excluir (com "Desfazer" no aviso).
// Só passa da metade da largura conta; abaixo disso a linha volta suave. O arraste só começa quando o movimento
// horizontal domina, então a rolagem vertical da página continua normal (touch-action: pan-y).
// Anotações 85/92: três recentes por tipo, lista completa em janela e + na extremidade oposta ao título.
import { ref, computed, nextTick, onMounted } from 'vue';
import { Plus } from 'lucide-vue-next';
import CardPadrao from '../components/CardPadrao.vue';
import ListaRegras from '../components/ListaRegras.vue';
import Modal from '../components/Modal.vue';
import AjudaSecao from '../components/AjudaSecao.vue';
import RegraModal from '../components/RegraModal.vue';
import { avisar } from '../services/avisos.js';

const regras = ref([]);
const carregando = ref(true);
const BLOCOS = [
  { tipo: 'saida', titulo: 'Regras de despesa', vazio: 'Nenhuma regra de despesa. Ao corrigir a categoria de um lançamento em Transações, o app sugere criar uma.' },
  { tipo: 'entrada', titulo: 'Regras de entrada', vazio: 'Nenhuma regra de entrada ainda.' },
  { tipo: 'transferencia', titulo: 'Regras de transferência', vazio: 'Cadastre o nome completo do titular para receber sugestões de transferência. Você confirma cada uma.' },
  { tipo: 'reserva', titulo: 'Regras de metas e investimentos', vazio: 'Ex.: “APLICACAO RDB” → Guardar na Reserva de Liberdade, ou “COMPRA MXRF11” → aporte no MXRF11.' },
];
const modal = ref(false);
const inicialModal = ref({});
const listaDe = tipo => regras.value.filter(r => r.tipo === tipo).sort((a, b) => String(b.criado_em || '').localeCompare(String(a.criado_em || '')));
const tipoLista = ref(null);
const tipoRetorno = ref(null);
const blocoLista = computed(() => BLOCOS.find(b => b.tipo === tipoLista.value));
const pedir = (url, op = {}) => fetch(url, { credentials: 'include', ...op, headers: { 'Content-Type': 'application/json', ...(op.headers || {}) } });

async function carregar() {
  try { const r = await pedir('/api/regras'); regras.value = r.ok ? await r.json() : []; } catch { regras.value = []; } finally { carregando.value = false; }
}

async function alternar(r) {
  const nova = !r.ativa;
  r.ativa = nova; // otimista
  const resp = await pedir(`/api/regras/${r.id}`, { method: 'PUT', body: JSON.stringify({ ativa: nova }) });
  if (!resp.ok) { r.ativa = !nova; avisar('Não foi possível mudar a regra.', { tipo: 'alerta' }); return; }
  avisar(nova ? `Regra “${r.padrao}” ativada` : `Regra “${r.padrao}” pausada`, { tipo: nova ? 'ok' : 'info', grupo: 'regras', duracao: 3000 });
}
async function excluir(r) {
  regras.value = regras.value.filter((x) => x.id !== r.id); // otimista: já some da lista
  const resp = await pedir(`/api/regras/${r.id}`, { method: 'DELETE' });
  if (!resp.ok) { await carregar(); avisar('Não foi possível excluir a regra.', { tipo: 'alerta' }); return; }
  avisar('Regra excluída', {
    tipo: 'excluido', grupo: 'regras', duracao: 6000, detalhe: `“${r.padrao}” → ${r.categoriaNome || 'categoria'}`,
    acoes: [{ rotulo: 'Desfazer', primaria: true, acao: () => desfazer(r) }],
  });
}
async function desfazer(r) {
  const resp = await pedir(`/api/regras/${r.id}/restaurar`, { method: 'POST' });
  if (!resp.ok) { avisar('Não foi possível desfazer.', { tipo: 'alerta' }); return; }
  await carregar();
  avisar('Regra restaurada', { tipo: 'ok', grupo: 'regras', duracao: 2500 });
}

function abrirEditor(inicial) { tipoRetorno.value = tipoLista.value; tipoLista.value = null; inicialModal.value = inicial; modal.value = true; }
function novaRegra(tipo) { abrirEditor({ tipo }); }
function editar(r) { abrirEditor({ ...r }); }
async function fecharEditor() { modal.value = false; await nextTick(); tipoLista.value = tipoRetorno.value; tipoRetorno.value = null; }
async function salva({ aplicadas, editada }) {
  const base = editada ? 'Regra salva.' : 'Regra criada.';
  avisar(aplicadas ? `${base} ${aplicadas} lançamento(s) antigo(s) movido(s).` : base, { tipo: 'ok', grupo: 'regras' });
  await carregar();
  await fecharEditor();
}
async function alternarNoModal(r) {
  modal.value = false;
  const atual = regras.value.find((x) => x.id === r.id);
  if (atual) await alternar(atual);
  await fecharEditor();
}
async function excluirNoModal(r) {
  modal.value = false;
  const atual = regras.value.find((x) => x.id === r.id);
  if (atual) await excluir(atual);
  await fecharEditor();
}

onMounted(carregar);
</script>

<template>
  <div class="pagina">
    <h1>Regras de categorização</h1>
    <div class="grade-regras">
      <CardPadrao v-for="bl in BLOCOS" :key="bl.tipo" :data-bloco-regras="bl.tipo">
        <template #cabecalho>
          <div class="cab-bloco">
            <div class="titulo-bloco"><h2>{{ bl.titulo }}<AjudaSecao :secao="bl.tipo === 'reserva' ? 'regras.reserva' : 'regras'" /></h2><small>{{ listaDe(bl.tipo).length }} {{ listaDe(bl.tipo).length === 1 ? 'regra' : 'regras' }}</small></div>
            <button type="button" class="mais-regra" :aria-label="`Adicionar em ${bl.titulo}`" :title="`Adicionar em ${bl.titulo}`" @click="novaRegra(bl.tipo)"><Plus :size="20" :stroke-width="2.4" /></button>
          </div>
        </template>
        <p v-if="carregando" class="nota" role="status">Carregando regras…</p>
        <p v-else-if="!listaDe(bl.tipo).length" class="nota">{{ bl.vazio }}</p>
        <ListaRegras :regras="listaDe(bl.tipo).slice(0, 3)" @editar="editar" @alternar="alternar" @excluir="excluir" />
        <button type="button" class="ver-todas" :disabled="carregando || !listaDe(bl.tipo).length" @click="tipoLista = bl.tipo">Ver todas as regras<span class="so-leitor"> de {{ bl.titulo }}</span></button>
      </CardPadrao>
    </div>
    <Modal :aberto="!!tipoLista" :titulo="blocoLista?.titulo || 'Regras'" :largura="720" @fechar="tipoLista = null">
      <p class="nota">{{ listaDe(tipoLista).length }} {{ listaDe(tipoLista).length === 1 ? 'regra' : 'regras' }} · mais recentes primeiro</p>
      <p v-if="!listaDe(tipoLista).length" class="nota">Nenhuma regra nesta categoria.</p>
      <ListaRegras :regras="listaDe(tipoLista)" @editar="editar" @alternar="alternar" @excluir="excluir" />
      <template #rodape><button type="button" class="sf-botao primario" @click="novaRegra(tipoLista)"><Plus :size="18" /> Nova regra</button></template>
    </Modal>
    <RegraModal :aberto="modal" :inicial="inicialModal" tipo-fixo @fechar="fecharEditor" @salvo="salva" @alternar="alternarNoModal" @excluir="excluirNoModal" />
  </div>
</template>

<style scoped>
.pagina { padding: 4px 16px var(--espaco-fim); max-width: 1200px; width: 100%; margin: 0 auto; display: flex; flex-direction: column; gap: var(--espaco-secao); }
h1 { margin: 0; font: 700 22px var(--fonte-display); }
.grade-regras { display: grid; grid-template-columns: minmax(0, 1fr); gap: 20px; align-items: start; }
@media (min-width: 1100px) { .grade-regras { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
.cab-bloco { display: flex; gap: 12px; align-items: flex-start; width: 100%; }
.titulo-bloco { min-width: 0; flex: 1; }
.titulo-bloco h2 { margin: 0; font: 700 17px var(--fonte-display); overflow-wrap: anywhere; }
.titulo-bloco small, .nota { font-size: 13px; color: var(--cor-texto-suave); }
.nota { margin: 0; }
.mais-regra { flex: none; width: 44px; height: 44px; display: grid; place-items: center; padding: 0; border: 1px solid var(--cor-borda); border-radius: 12px; background: var(--cor-realce); color: var(--cor-interface, var(--cor-primaria)); cursor: pointer; }
.ver-todas { align-self: flex-start; min-height: 42px; padding: 8px 0; border: none; background: none; color: var(--cor-interface, var(--cor-primaria)); font: 600 13.5px var(--fonte-texto); cursor: pointer; }
.ver-todas:disabled { opacity: .55; cursor: default; }
.mais-regra:focus-visible, .ver-todas:focus-visible { outline: 2px solid var(--cor-primaria); outline-offset: 2px; }
.so-leitor { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; }
</style>
