<script setup>
// Regras de categorização (rota /regras, Minhas finanças) — anotação 48.
// Lista por tipo; tocar abre a edição (RegraModal). Gestos na linha (toque e mouse, pointer events):
//   arrastar para a ESQUERDA = pausar/ativar · arrastar para a DIREITA = excluir (com "Desfazer" no aviso).
// Só passa da metade da largura conta; abaixo disso a linha volta suave. O arraste só começa quando o movimento
// horizontal domina, então a rolagem vertical da página continua normal (touch-action: pan-y).
// Homologação 1.0, seção 16: sem as abas Despesas | Entradas — blocos em sequência na rolagem: Regras de despesa,
// Regras de entrada e Regras de metas e investimentos (seção 15), cada um com contagem e "+ Nova regra" do tipo.
import { ref, computed, onMounted } from 'vue';
import { Plus, Trash2, Pause, Play } from 'lucide-vue-next';
import CardPadrao from '../components/CardPadrao.vue';
import IconeCategoria from '../components/IconeCategoria.vue';
import IconeCat from '../components/IconeCat.vue';
import RegraModal from '../components/RegraModal.vue';
import { avisar } from '../services/avisos.js';

const regras = ref([]);
const carregando = ref(true);
const BLOCOS = [
  { tipo: 'saida', titulo: 'Regras de despesa', vazio: 'Nenhuma regra de despesa. Ao corrigir a categoria de um lançamento em Transações, o app sugere criar uma.' },
  { tipo: 'entrada', titulo: 'Regras de entrada', vazio: 'Nenhuma regra de entrada ainda.' },
  { tipo: 'reserva', titulo: 'Regras de metas e investimentos', vazio: 'Ex.: “APLICACAO RDB” → Guardar na Reserva de Liberdade, ou “COMPRA MXRF11” → aporte no MXRF11.' },
];
const modal = ref(false);
const inicialModal = ref({});
const moeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const listaDe = (tipo) => regras.value.filter((r) => r.tipo === tipo);
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

function novaRegra(tipo) { inicialModal.value = { tipo }; modal.value = true; }
function editar(r) { inicialModal.value = { ...r }; modal.value = true; }
async function salva({ aplicadas, editada }) {
  modal.value = false;
  const base = editada ? 'Regra salva.' : 'Regra criada.';
  avisar(aplicadas ? `${base} ${aplicadas} lançamento(s) antigo(s) movido(s).` : base, { tipo: 'ok', grupo: 'regras' });
  await carregar();
}
async function alternarNoModal(r) {
  modal.value = false;
  const atual = regras.value.find((x) => x.id === r.id);
  if (atual) await alternar(atual);
}
async function excluirNoModal(r) {
  modal.value = false;
  const atual = regras.value.find((x) => x.id === r.id);
  if (atual) await excluir(atual);
}

const detalhe = (r) => [r.subcategoria ? `sub: ${r.subcategoria}` : '', r.contaNome ? `só na conta ${r.contaNome}` : '', r.valorMin !== null || r.valorMax !== null ? `valor ${r.valorMin !== null ? 'de ' + moeda(r.valorMin) : ''}${r.valorMax !== null ? ' até ' + moeda(r.valorMax) : ''}` : '', `usada ${r.aplicacoes}x`].filter(Boolean).join(' · ');

// ---------- gesto de arrastar ----------
const arraste = ref({ id: null, dx: 0, largura: 1, solto: false, saindo: false });
let g = null; // { id, x0, y0, largura, modo: null|'h'|'v', pid, el }
let ignorarClique = false;
const LIMIAR = 10;

function inicio(e, r) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (arraste.value.saindo) return;
  g = { r, x0: e.clientX, y0: e.clientY, largura: e.currentTarget.offsetWidth || 1, modo: null, pid: e.pointerId, el: e.currentTarget };
  ignorarClique = false;
}
function mover(e) {
  if (!g || e.pointerId !== g.pid) return;
  const dx = e.clientX - g.x0;
  const dy = e.clientY - g.y0;
  if (!g.modo) {
    if (Math.abs(dx) < LIMIAR && Math.abs(dy) < LIMIAR) return;
    if (Math.abs(dx) > Math.abs(dy) * 1.3) {
      g.modo = 'h';
      if (e.pointerType !== 'touch') { try { g.el.setPointerCapture(g.pid); } catch { /* sem captura, segue */ } } // toque já tem captura implícita
    } else { g = null; return; } // vertical: deixa a página rolar
  }
  e.preventDefault();
  ignorarClique = true;
  // um pouco de resistência depois da metade
  const meio = g.largura / 2;
  const d = Math.abs(dx) > meio ? Math.sign(dx) * (meio + (Math.abs(dx) - meio) * 0.6) : dx;
  arraste.value = { id: g.r.id, dx: d, largura: g.largura, solto: false, saindo: false };
}
function fim(e) {
  if (!g || e.pointerId !== g.pid) return;
  const { r, largura, modo } = g;
  g = null;
  if (modo !== 'h') return;
  const dx = arraste.value.dx;
  const passou = Math.abs(dx) >= largura / 2;
  if (passou && dx > 0) {
    // direita = excluir: a linha sai pela direita e some
    arraste.value = { id: r.id, dx: largura * 1.1, largura, solto: true, saindo: true };
    setTimeout(() => { arraste.value = { id: null, dx: 0, largura: 1, solto: false, saindo: false }; excluir(r); }, 220);
    return;
  }
  arraste.value = { id: r.id, dx: 0, largura, solto: true, saindo: false };
  if (passou && dx < 0) alternar(r);
  setTimeout(() => { if (arraste.value.id === r.id && arraste.value.solto) arraste.value = { id: null, dx: 0, largura: 1, solto: false, saindo: false }; }, 260);
}
function cancelar() {
  if (!g) return;
  const id = g.r.id;
  g = null;
  arraste.value = { id, dx: 0, largura: 1, solto: true, saindo: false };
}
function tocar(r) {
  if (ignorarClique) { ignorarClique = false; return; }
  editar(r);
}
const dxDe = (r) => (arraste.value.id === r.id ? arraste.value.dx : 0);
const passouMeio = (r) => arraste.value.id === r.id && Math.abs(arraste.value.dx) >= arraste.value.largura / 2;
onMounted(carregar);
</script>

<template>
  <div class="pagina">
    <h1>Regras de categorização</h1>
    <CardPadrao v-for="bl in BLOCOS" :key="bl.tipo" :ajuda="bl.tipo === 'reserva' ? 'regras.reserva' : 'regras'" :titulo="bl.titulo" :subtitulo="`${listaDe(bl.tipo).length} ${listaDe(bl.tipo).length === 1 ? 'regra' : 'regras'}`" :data-bloco-regras="bl.tipo">
      <p v-if="!carregando && !listaDe(bl.tipo).length" class="nota">{{ bl.vazio }}</p>
      <transition-group tag="ul" name="regra" class="lista">
        <li v-for="r in listaDe(bl.tipo)" :key="r.id" class="regra-item" :class="{ off: !r.ativa, arrastando: dxDe(r) !== 0 }">
          <div class="fundo excluir" :class="{ pronto: passouMeio(r) && dxDe(r) > 0 }" aria-hidden="true" :style="{ opacity: dxDe(r) > 0 ? 1 : 0 }">
            <Trash2 :size="20" :stroke-width="2.2" /><span>Excluir</span>
          </div>
          <div class="fundo pausa" :class="[r.ativa ? 'p-pausar' : 'p-ativar', { pronto: passouMeio(r) && dxDe(r) < 0 }]" aria-hidden="true" :style="{ opacity: dxDe(r) < 0 ? 1 : 0 }">
            <span>{{ r.ativa ? 'Pausar' : 'Ativar' }}</span><component :is="r.ativa ? Pause : Play" :size="20" :stroke-width="2.2" />
          </div>
          <button type="button" class="frente"
            :class="{ solto: arraste.id === r.id && arraste.solto, saindo: arraste.id === r.id && arraste.saindo }"
            :style="{ transform: dxDe(r) ? `translateX(${dxDe(r)}px)` : null }"
            :aria-label="`Editar regra ${r.padrao} para ${r.categoriaNome}${r.ativa ? '' : ', pausada'}`"
            @pointerdown="inicio($event, r)" @pointermove="mover" @pointerup="fim" @pointercancel="cancelar" @click="tocar(r)" @dragstart.prevent>
            <span class="ic">
              <span v-if="r.icone" class="item-ic"><IconeCat :chave="r.icone" :tamanho="22" /></span>
              <IconeCategoria v-else :valor="r.tipo === 'reserva' ? (r.metaId ? '🎯' : 'acoes') : r.categoriaIcone" :tipo="r.tipo === 'reserva' ? (r.metaId ? 'meta' : 'investimento') : r.tipo" :tamanho="40" />
            </span>
            <span class="txt">
              <b>“{{ r.padrao }}” → {{ r.categoriaNome }}</b>
              <small><span v-if="!r.ativa" class="selo">Pausada</span>{{ detalhe(r) }}</small>
            </span>
          </button>
        </li>
      </transition-group>
      <button type="button" class="nova" @click="novaRegra(bl.tipo)"><Plus :size="18" :stroke-width="2.4" /> Nova regra</button>
    </CardPadrao>
    <RegraModal :aberto="modal" :inicial="inicialModal" @fechar="modal = false" @salvo="salva" @alternar="alternarNoModal" @excluir="excluirNoModal" />
  </div>
</template>

<style scoped>
.pagina { padding: 0 0 var(--espaco-fim); max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--espaco-secao); }
h1 { margin: 0; font: 700 22px var(--fonte-display); }
.nota { margin: 0; font-size: 13px; color: var(--cor-texto-suave); }
.dica-gesto { margin: 0 0 6px; font-size: 12px; color: var(--cor-texto-suave); }
.lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; position: relative; }
.regra-item { position: relative; border-radius: 14px; overflow: hidden; }
.fundo { position: absolute; inset: 0; display: flex; align-items: center; gap: 8px; padding: 0 20px; font: 700 14px var(--fonte-texto); color: #fff; border-radius: 14px; transition: filter var(--anim-rapida, .15s); }
.fundo.excluir { justify-content: flex-start; background: var(--cor-saida); }
.fundo.pausa { justify-content: flex-end; }
.fundo.p-pausar { background: var(--cor-interface, var(--cor-primaria)); }
.fundo.p-ativar { background: var(--cor-entrada); }
.fundo.pronto svg { transform: scale(1.18); }
.fundo svg { transition: transform var(--anim-rapida, .15s) var(--anim-curva, ease); }
.frente { position: relative; z-index: 1; width: 100%; display: flex; align-items: center; gap: 12px; padding: 8px 6px; min-height: 64px; border: none; border-radius: 14px; background: var(--cor-fundo-elevado, var(--cor-fundo)); color: var(--cor-texto); font: inherit; text-align: left; cursor: pointer; touch-action: pan-y; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent; }
.frente:hover { background: color-mix(in srgb, var(--cor-realce) 60%, var(--cor-fundo-elevado, var(--cor-fundo))); }
.frente:focus-visible { outline: 2px solid var(--cor-interface, var(--cor-primaria)); outline-offset: -2px; }
.regra-item.arrastando .frente { box-shadow: var(--sombra-suave); cursor: grabbing; }
.frente.solto { transition: transform var(--anim-padrao, .25s) var(--anim-curva, ease); }
.frente.saindo { transition: transform .2s ease-in, opacity .2s ease-in; opacity: 0; }
.ic { flex: none; width: 40px; height: 40px; display: grid; place-items: center; }
.item-ic { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; background: var(--cor-realce); color: var(--cor-texto); }
.txt { flex: 1 1 180px; min-width: 0; display: flex; flex-direction: column; gap: 2px; overflow-wrap: anywhere; }
.txt small { color: var(--cor-texto-suave); font-size: 12px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.regra-item.off .ic, .regra-item.off .txt b { opacity: .5; }
.selo { display: inline-flex; align-items: center; height: 20px; padding: 0 8px; border-radius: 999px; background: color-mix(in srgb, var(--cor-interface, var(--cor-primaria)) 14%, transparent); color: var(--cor-interface, var(--cor-primaria)); font-weight: 700; font-size: 11px; letter-spacing: .02em; }
.regra-leave-active { transition: opacity .2s ease, max-height .25s ease; max-height: 80px; }
.regra-leave-to { opacity: 0; max-height: 0; }
.regra-enter-active { transition: opacity var(--anim-padrao, .25s) ease, transform var(--anim-padrao, .25s) var(--anim-curva, ease); }
.regra-enter-from { opacity: 0; transform: translateY(-6px); }
.nova { align-self: flex-start; min-height: 40px; padding: 0 14px; border-radius: 12px; border: 1px dashed var(--cor-borda); background: none; color: var(--cor-interface, var(--cor-primaria)); font: 600 13.5px var(--fonte-texto); display: inline-flex; align-items: center; gap: 6px; cursor: pointer; margin-top: 4px; }
.nova:hover { background: var(--cor-realce); }
@media (prefers-reduced-motion: reduce) { .frente.solto, .frente.saindo, .regra-leave-active, .regra-enter-active { transition: none; } }
</style>
