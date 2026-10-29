<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Modal from '../components/Modal.vue';
import CabecalhoPagina from '../components/CabecalhoPagina.vue';
import BotaoVoltar from '../components/BotaoVoltar.vue';
import TopoValor from '../components/TopoValor.vue';
import CardPadrao from '../components/CardPadrao.vue';
import BarraAcoes from '../components/BarraAcoes.vue';
import BotaoAcao from '../components/BotaoAcao.vue';
import { Wallet, ShoppingBag, Undo2 } from 'lucide-vue-next';
import { mes, ano, mesNum, escolher, MESES } from '../services/mes.js';
import CartaoLista from '../components/CartaoLista.vue';
import IconeBanco from '../components/IconeBanco.vue';
import { corDoBanco, corPorNome } from '../utils/corBanco.js';

const route = useRoute();
const router = useRouter();

const cartoes = ref([]);
const dividas = ref([]);
const categorias = ref([]);
const sugestoesSub = ref([]);
const nomeCategoria = (id) => categorias.value.find((c) => c.id === id)?.nome || '';
const faturas = ref([]);
const faturaEscolhida = ref('');
const extrato = ref(null);
const carregando = ref(true);
const carregandoExtrato = ref(false);

const cartaoId = computed(() => String(route.params.id));
const cartao = computed(() => cartoes.value.find((c) => c.id === cartaoId.value) || null);
// Cor do banco vinculado (do logo, se houver; senão pelo nome)
const corBancoCartao = ref('#3b5bff');
watch(cartao, async (c) => {
  if (!c || !c.contaNome) return;
  corBancoCartao.value = corPorNome(c.contaNome);
  corBancoCartao.value = await corDoBanco(c.contaNome, c.contaIcone);
}, { immediate: true });

// Registro de compra (pop-up)
const modalAberto = ref(false);
const compraVazia = () => ({ descricao: '', valor: '', dataCompra: '', parcelas: 1, dividaId: '', categoriaId: '', subcategoria: '' });
const compra = ref(compraVazia());
const previa = ref(null);
const erroCompra = ref('');
const salvandoCompra = ref(false);

const formatoMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const moeda = (v) => formatoMoeda.format(v || 0);

const nomesMes = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
function rotuloFatura(chave) {
  if (!chave) return '';
  const [ano, mes] = chave.split('-').map(Number);
  return `${nomesMes[mes - 1]}/${ano}`;
}
function dataBR(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}
const rotuloStatus = { fechada: 'Fechada', aberta: 'Aberta', futura: 'Futura', paga: 'Paga' };

async function pedir(url, opcoes = {}) {
  const resposta = await fetch(url, { credentials: 'include', ...opcoes });
  if (resposta.status === 401) {
    router.push('/login');
    throw new Error('não autenticado');
  }
  return resposta;
}

// --- Pagar a fatura (cartão manual) ---
const contas = ref([]);
const pagando = ref(false);
const contaPaga = ref('');
const erroPagar = ref('');
function iniciarPagar() {
  pagando.value = true;
  erroPagar.value = '';
  contaPaga.value = cartao.value?.contaId || contas.value[0]?.id || '';
}
async function confirmarPagar() {
  erroPagar.value = '';
  const r = await pedir(`/api/cartoes/${cartaoId.value}/faturas/${faturaEscolhida.value}/pagar`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contaId: Number(contaPaga.value) }),
  });
  const d = await r.json();
  if (!r.ok) { erroPagar.value = d.erro || 'Não foi possível marcar como paga.'; return; }
  pagando.value = false;
  await recarregarTudo();
}
async function desfazerPagar() {
  await pedir(`/api/cartoes/${cartaoId.value}/faturas/${faturaEscolhida.value}/pagar`, { method: 'DELETE' });
  await recarregarTudo();
}
async function recarregarTudo() {
  await carregarCartoes();
  await carregarFaturas(false);
}

async function carregarCartoes() {
  const resposta = await pedir('/api/cartoes');
  cartoes.value = await resposta.json();
  try { const rk = await pedir('/api/contas'); contas.value = rk.ok ? await rk.json() : []; } catch { contas.value = []; }
  try { const rc = await pedir('/api/categorias'); categorias.value = rc.ok ? await rc.json() : []; } catch { categorias.value = []; }
  try {
    const rd = await pedir('/api/dividas');
    dividas.value = rd.ok ? await rd.json() : [];
  } catch {
    dividas.value = [];
  }
}

async function carregarFaturas(irParaAberta) {
  if (!cartao.value) return;
  const resposta = await pedir(`/api/cartoes/${cartaoId.value}/faturas`);
  faturas.value = await resposta.json();
  if (irParaAberta) {
    // Vindo dos detalhes do cartão, abre direto na fatura clicada (?fatura=AAAA-MM); o fichário de meses acompanha.
    const pedida = faturas.value.find((f) => f.chave === route.query.fatura);
    const aberta = faturas.value.find((f) => f.chave === cartao.value.faturaAberta?.chave) || faturas.value.find((f) => f.status === 'aberta');
    const alvo = pedida || aberta || faturas.value[0];
    if (alvo) { const [a, m] = alvo.chave.split('-').map(Number); escolher(a, m); }
  }
  faturaEscolhida.value = faturas.value.some((f) => f.chave === mes.value) ? mes.value : '';
  await carregarExtrato();
}

async function carregarExtrato() {
  if (!cartao.value || !faturaEscolhida.value) { extrato.value = null; return; }
  carregandoExtrato.value = true;
  try {
    const resposta = await pedir(`/api/cartoes/${cartaoId.value}/extrato?fatura=${faturaEscolhida.value}`);
    extrato.value = await resposta.json();
  } finally {
    carregandoExtrato.value = false;
  }
}

// O fichário de meses (compartilhado) escolhe a fatura: mês sem fatura mostra aviso.
watch(mes, () => {
  if (!cartao.value || !faturas.value.length) return;
  const nova = faturas.value.some((f) => f.chave === mes.value) ? mes.value : '';
  if (nova !== faturaEscolhida.value) { faturaEscolhida.value = nova; pagando.value = false; carregarExtrato(); }
});
const semFatura = computed(() => faturas.value.length > 0 && !faturaEscolhida.value);

// Esc volta para a lista de cartões.
function fechar() {
  router.push('/cartoes');
}
function aoTecla(e) {
  if (e.key === 'Escape' && !document.querySelector('.fundo-modal')) fechar();
}
onMounted(() => window.addEventListener('keydown', aoTecla));
onUnmounted(() => window.removeEventListener('keydown', aoTecla));

// Ao trocar de cartão pela URL, recarrega faturas e extrato do novo cartão.
watch(cartaoId, async () => {
  extrato.value = null;
  faturas.value = [];
  await carregarFaturas(true);
});

// --- Compra ---
function abrirCompra() {
  editandoCompraId.value = null;
  compra.value = compraVazia();
  erroCompra.value = '';
  previa.value = null;
  modalAberto.value = true;
}
function fecharCompra() {
  modalAberto.value = false;
  erroCompra.value = '';
}

watch(() => compra.value.categoriaId, async (id) => {
  compra.value.subcategoria = '';
  sugestoesSub.value = [];
  if (!id) return;
  try {
    const r = await pedir(`/api/transacoes/subcategorias?categoriaId=${id}`);
    sugestoesSub.value = r.ok ? await r.json() : [];
  } catch { sugestoesSub.value = []; }
});

let temporizador = null;
watch(
  () => [compra.value.valor, compra.value.parcelas, compra.value.dataCompra, modalAberto.value],
  () => {
    clearTimeout(temporizador);
    previa.value = null;
    if (!modalAberto.value || !(Number(compra.value.valor) > 0)) return;
    temporizador = setTimeout(atualizarPrevia, 250);
  }
);

async function atualizarPrevia() {
  const params = new URLSearchParams({
    valor: String(compra.value.valor),
    parcelas: String(compra.value.parcelas || 1),
  });
  if (compra.value.dataCompra) params.set('dataCompra', compra.value.dataCompra);
  try {
    const resposta = await pedir(`/api/cartoes/${cartaoId.value}/previa?${params}`);
    previa.value = resposta.ok ? await resposta.json() : null;
  } catch {
    previa.value = null;
  }
}

async function registrarCompra() {
  erroCompra.value = '';
  const c = compra.value;
  if (!c.descricao.trim()) {
    erroCompra.value = 'Informe o que foi comprado.';
    return;
  }
  salvandoCompra.value = true;
  try {
    const corpo = { descricao: c.descricao, valor: Number(c.valor), parcelas: Number(c.parcelas) || 1 };
    if (c.dataCompra) corpo.dataCompra = c.dataCompra;
    if (c.dividaId) corpo.dividaId = c.dividaId;
    if (c.categoriaId) { corpo.categoriaId = c.categoriaId; if (c.subcategoria.trim()) corpo.subcategoria = c.subcategoria.trim(); }
    const resposta = await pedir(editandoCompraId.value ? `/api/cartoes/${cartaoId.value}/lancamentos/${editandoCompraId.value}` : `/api/cartoes/${cartaoId.value}/lancamentos`, {
      method: editandoCompraId.value ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const dados = await resposta.json();
    if (!resposta.ok) {
      erroCompra.value = dados.erro || 'Não foi possível registrar a compra.';
      return;
    }
    modalAberto.value = false;
    if (!editandoCompraId.value) faturaEscolhida.value = dados.primeiraFatura || faturaEscolhida.value;
    await carregarCartoes();
    await carregarFaturas(false);
  } finally {
    salvandoCompra.value = false;
  }
}

const removendo = ref(null);
async function removerCompra() {
  const item = removendo.value;
  if (!item) return;
  await pedir(`/api/cartoes/${cartaoId.value}/lancamentos/${item.compraId}`, { method: 'DELETE' });
  removendo.value = null;
  await carregarCartoes();
  await carregarFaturas(false);
}
const dataDM = (iso) => { const [, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}`; };

// --- Editar compra (cartão manual) ---
const editandoCompraId = ref(null);
async function abrirEdicaoCompra(l) {
  editandoCompraId.value = l.compraId;
  erroCompra.value = '';
  previa.value = null;
  compra.value = { descricao: l.descricao, valor: l.valorTotalCompra, parcelas: l.totalParcelas, dataCompra: l.dataCompra, dividaId: l.dividaId || '', categoriaId: l.categoriaId || '', subcategoria: '' };
  modalAberto.value = true;
  await nextTick();
  await nextTick();
  compra.value.subcategoria = l.subcategoria || '';
}

const faturaAtual = computed(() => (faturaEscolhida.value ? extrato.value?.fatura || null : null));
const textoPagamento = computed(() => {
  const f = faturaAtual.value;
  if (!f) return '';
  if (f.paga) return `${f.pagaEm ? dataBR(f.pagaEm) : 'Paga'}${f.pagaComConta ? ' · ' + f.pagaComConta : ''}`;
  return cartao.value?.origem === 'manual' ? 'Pendente' : 'Pelo banco';
});
const rotuloDia = (iso) => {
  const [a, m, d] = iso.split('-').map(Number);
  const sem = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][new Date(a, m - 1, d).getDay()];
  return `${d} de ${nomesMes[m - 1]} · ${sem}`;
};
const gruposPorDia = computed(() => {
  const mapa = new Map();
  (extrato.value?.lancamentos || []).forEach((l) => { const k = String(l.dataCompra).slice(0, 10); if (!mapa.has(k)) mapa.set(k, []); mapa.get(k).push(l); });
  return [...mapa].map(([iso, itens]) => ({ iso, rotulo: rotuloDia(iso), itens, total: itens.reduce((x, l) => x + (l.valor || 0), 0) }));
});

onMounted(async () => {
  await carregarCartoes();
  carregando.value = false;
  await carregarFaturas(true);
});
</script>

<template>
  <div class="pagina">
    <CabecalhoPagina titulo="Extrato do cartão" cor="var(--cor-saida-texto, var(--cor-saida))" sem-atalhos>
      <template #esquerda><BotaoVoltar para="/cartoes" rotulo="Cartões" /></template>
      <template #corpo>
        <div v-deslizar-mes class="area-mes">
          <p v-if="!carregando && !cartao" class="nota">Cartão não encontrado. Volte para a lista de cartões.</p>

          <template v-if="cartao">
            <header class="identidade">
              <h2 class="nome-cartao"><IconeBanco :icone="cartao.icone" :nome="cartao.nome" padrao="💳" :tamanho="26" /> <span>{{ cartao.nome }}</span></h2>
              <span v-if="cartao.contaNome" class="chip-banco" :style="{ '--banco': corBancoCartao }">
                <IconeBanco :icone="cartao.contaIcone" :nome="cartao.contaNome" padrao="🏦" :tamanho="16" /> {{ cartao.contaNome }}
              </span>
            </header>

            <TopoValor v-if="faturaAtual" tema="saida" variante="1" :rotulo="`Fatura de ${rotuloFatura(faturaAtual.chave)}`" :valor="faturaAtual.total"
              :linhas="[
                { rotulo: 'Vencimento', valor: dataBR(faturaAtual.vence) },
                { rotulo: 'Fechamento', valor: dataBR(faturaAtual.fecha) },
                { rotulo: 'Situação', valor: faturaAtual.paga ? 'Paga' : rotuloStatus[faturaAtual.status] },
                { rotulo: 'Pagamento', valor: textoPagamento },
              ]">
              <template v-if="cartao.origem === 'manual'" #acoes>
                <BarraAcoes compacto :colunas="2">
                  <BotaoAcao v-if="faturaAtual.paga" compacto :icone="Undo2" rotulo="Desfazer pagamento" tema="saida" @click="desfazerPagar" />
                  <BotaoAcao v-else compacto :icone="Wallet" rotulo="Pagar fatura" tema="saida" destaque :disabled="!(faturaAtual.total > 0)" @click="iniciarPagar" />
                  <BotaoAcao compacto :icone="ShoppingBag" rotulo="Lançar compra" tema="saida" @click="abrirCompra" />
                </BarraAcoes>
              </template>
            </TopoValor>

            <CardPadrao v-if="pagando && faturaAtual" class="pagar-fatura">
              <label class="campo">
                <span>Conta de onde saiu o dinheiro</span>
                <select v-model="contaPaga">
                  <option v-for="c in contas" :key="c.id" :value="c.id">{{ c.nome }}</option>
                </select>
              </label>
              <p v-if="erroPagar" class="erro-pagar">{{ erroPagar }}</p>
              <div class="acoes-formulario">
                <button type="button" class="btn-pagar" @click="confirmarPagar">Confirmar pagamento</button>
                <button type="button" class="botao-secundario" @click="pagando = false">Cancelar</button>
              </div>
            </CardPadrao>

            <p v-if="semFatura" class="vazio">Este cartão não tem fatura em {{ MESES[mesNum - 1] }} de {{ ano }}.</p>
            <p v-else-if="!carregandoExtrato && extrato && extrato.lancamentos.length === 0" class="vazio">Nenhuma compra nesta fatura.</p>

            <div v-else-if="extrato" class="lista-wrap">
              <section v-for="g in gruposPorDia" :key="g.iso" class="grupo">
                <header class="titulo-grupo">
                  <span>{{ g.rotulo }}</span>
                  <span class="total-grupo numero-tabular">− {{ moeda(g.total) }}</span>
                </header>
                <CardPadrao class="cartao-lista" sem-padding>
                  <CartaoLista :lancamentos="g.itens" :categorias="categorias" :manual="cartao.origem === 'manual'" :cartao="cartao" :cartao-nome="cartao.nome" :cartao-icone="cartao.icone" @editar="abrirEdicaoCompra" @remover="(l) => (removendo = l)" />
                </CardPadrao>
              </section>
            </div>
          </template>
        </div>
      </template>
    </CabecalhoPagina>

    <Modal :aberto="modalAberto" :titulo="`${editandoCompraId ? 'Editar compra' : 'Nova compra'} · ${cartao ? cartao.nome : ''}`" @fechar="fecharCompra">
      <form class="formulario" @submit.prevent="registrarCompra">
        <label class="campo">
          <span>O que foi comprado</span>
          <input v-model="compra.descricao" type="text" placeholder="Ex: Geladeira" required />
        </label>

        <div class="tres-colunas">
          <label class="campo">
            <span>Valor total</span>
            <input v-model="compra.valor" type="number" step="0.01" min="0.01" placeholder="0,00" required />
          </label>
          <label class="campo">
            <span>Parcelas</span>
            <input v-model="compra.parcelas" type="number" min="1" max="48" required :disabled="!!editandoCompraId" />
          </label>
          <label class="campo">
            <span>Data da compra</span>
            <input v-model="compra.dataCompra" type="date" />
          </label>
        </div>

        <label class="campo">
          <span>Categoria de despesa (opcional)</span>
          <select v-model="compra.categoriaId">
            <option value="">Sem categoria</option>
            <option v-for="c in categorias" :key="c.id" :value="c.id">{{ c.nome }}</option>
          </select>
        </label>
        <label v-if="compra.categoriaId" class="campo">
          <span>Subcategoria (opcional)</span>
          <input v-model="compra.subcategoria" type="text" maxlength="80" list="sugestoes-sub-cartao" autocomplete="off" placeholder="Ex: Eletrodomésticos, Presente" />
          <datalist id="sugestoes-sub-cartao"><option v-for="s in sugestoesSub" :key="s" :value="s"></option></datalist>
        </label>

        <label v-if="dividas.length" class="campo">
          <span>Dívida relacionada (opcional)</span>
          <select v-model="compra.dividaId">
            <option value="">Nenhuma</option>
            <option v-for="d in dividas" :key="d.id" :value="d.id">{{ d.nome }}</option>
          </select>
        </label>

        <p v-if="previa" class="previa">
          <template v-if="previa.parcelas > 1">{{ previa.parcelas }}x de {{ moeda(previa.valorParcela) }}.</template>
          <template v-else>À vista: {{ moeda(previa.valorParcela) }}.</template>
          A 1ª parcela entra na fatura de {{ rotuloFatura(previa.primeiraFatura.chave) }}
          (vence {{ dataBR(previa.primeiraFatura.vence) }})<template v-if="previa.parcelas > 1">
          e a última em {{ rotuloFatura(previa.ultimaFatura) }}</template>.
        </p>

        <p v-if="erroCompra" class="mensagem-erro">{{ erroCompra }}</p>

        <div class="acoes-formulario">
          <button type="submit" class="btn-registrar-compra" :disabled="salvandoCompra">{{ salvandoCompra ? 'Salvando…' : editandoCompraId ? 'Salvar compra' : 'Registrar compra' }}</button>
          <button type="button" class="botao-secundario" @click="fecharCompra">Cancelar</button>
        </div>
      </form>
    </Modal>

    <Modal :aberto="!!removendo" titulo="Remover compra" @fechar="removendo = null">
      <div v-if="removendo" class="formulario">
        <p>Remover <strong>{{ removendo.descricao }}</strong><template v-if="removendo.totalParcelas > 1"> e as {{ removendo.totalParcelas }} parcelas</template>?</p>
        <div class="acoes-formulario">
          <button type="button" class="botao-perigo" @click="removerCompra">Remover</button>
          <button type="button" class="botao-secundario" @click="removendo = null">Cancelar</button>
        </div>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.pagina { display: flex; flex-direction: column; gap: var(--espaco-secao); max-width: 760px; margin: 0 auto; width: 100%; font-family: var(--fonte-texto); color: var(--cor-texto); }
.area-mes { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.identidade { display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; }
.nome-cartao { display: inline-flex; align-items: center; justify-content: center; gap: 10px; margin: 0; font-family: var(--fonte-display); font-size: 20px; min-width: 0; overflow-wrap: anywhere; }
.nota, .vazio { font-size: 14px; color: var(--cor-texto-suave); margin: 8px 0; text-align: center; }
.chip-banco { --banco: #3b5bff; display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px 3px 6px; border-radius: 999px; font-size: 12px; font-weight: 600; color: var(--banco); border: 1.5px solid var(--banco); background: color-mix(in srgb, var(--banco) 14%, transparent); }
.pagar-fatura { display: flex; flex-direction: column; gap: 12px; }
.erro-pagar { margin: 0; font-size: 13px; color: var(--cor-alerta); }
button.btn-pagar, button.btn-registrar-compra { background: var(--degrade-saida); color: var(--cor-sobre-cor); }
button.botao-perigo { background: transparent; border: 1px solid var(--cor-grave, var(--cor-saida)); color: var(--cor-grave, var(--cor-saida)); }

.lista-wrap { display: flex; flex-direction: column; gap: 18px; }
.grupo { display: flex; flex-direction: column; gap: 6px; }
.titulo-grupo { display: flex; justify-content: space-between; align-items: baseline; padding: 0 6px; font-size: 13px; font-weight: 600; color: var(--cor-texto-suave); }
.total-grupo { font-size: 12px; font-weight: 600; color: var(--cor-saida-texto, var(--cor-saida)); }
.cartao-lista { padding-block: 4px; }
.cartao-lista :deep(.linha-tx) { margin: 0 6px; }
.cartao-lista :deep([role='listitem'] + [role='listitem']) { border-top: 1px solid var(--cor-borda); }

.formulario { display: flex; flex-direction: column; gap: 14px; }
.tres-colunas { display: grid; gap: 14px; grid-template-columns: 1fr 100px 1fr; }
@media (max-width: 480px) { .tres-colunas { grid-template-columns: 1fr; } }
.campo { display: flex; flex-direction: column; gap: 6px; font-size: 14px; font-weight: 500; min-width: 0; }
.campo input, .campo select { font-family: var(--fonte-texto); font-size: 15px; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--cor-borda); background: var(--cor-fundo); color: var(--cor-texto); min-width: 0; }
.mensagem-erro { margin: 0; padding: 10px 12px; border-radius: 10px; background: color-mix(in srgb, var(--cor-alerta) 14%, transparent); color: var(--cor-alerta); font-size: 14px; }
.previa { margin: 0; padding: 10px 12px; border-radius: 10px; border: 1px dashed var(--cor-borda); font-size: 13px; color: var(--cor-texto-suave); }
.acoes-formulario { display: flex; gap: 10px; }

button { font-family: var(--fonte-texto); font-weight: 600; font-size: 14px; padding: 10px 16px; border-radius: 10px; border: none; background: var(--cor-primaria); color: #fff; cursor: pointer; }
button:disabled { opacity: 0.6; cursor: default; }
.botao-secundario { background: transparent; border: 1px solid var(--cor-borda); color: var(--cor-texto); }
</style>
