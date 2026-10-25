<script setup>
import CampoIconeItem from './CampoIconeItem.vue';
// Janela de lançamento padrão, montada UMA vez no AppLayout. Abre sobre a página atual (services/lancamento.js) já preenchida
// com o contexto (conta, cartão ou categoria) e, ao salvar, a pessoa continua onde estava.
//   Conta: Despesa e Entrada · Cartão: só Despesa/Compra · Categoria: tipo e categoria já escolhidos · Transferência: entre contas próprias.
import { ref, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Landmark, CreditCard } from 'lucide-vue-next';
import FormularioModal from './FormularioModal.vue';
import CampoTipo from './CampoTipo.vue';
import CampoValor from './CampoValor.vue';
import CampoTexto from './CampoTexto.vue';
import CampoData from './CampoData.vue';
import CampoConta from './CampoConta.vue';
import CampoSelecao from './CampoSelecao.vue';
import CampoCategoria from './CampoCategoria.vue';
import TransferenciaModal from './TransferenciaModal.vue';
import { lancamento, fecharLancamento, lancamentoFoiSalvo, avisoLancamento } from '../services/lancamento.js';
import { avisar } from '../services/avisos.js';
import { escolher } from '../services/mes.js';

const route = useRoute();
const hojeISO = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const vazio = () => ({ tipo: 'saida', descricao: '', valor: 0, data: hojeISO(), contaId: '', categoriaId: '', pagamento: 'conta', cartaoId: '', parcelas: 1, categoriaReceita: '', subcategoria: '', dividaId: '', valorParcela: 0, icone: '' });
const f = ref(vazio());
const contas = ref([]);
const cartoesManuais = ref([]);
const vinculaveis = ref([]);
const sugestoesSub = ref([]);
const previa = ref(null);
const destinoPix = ref(null);
const erro = ref('');
const erros = ref({});
const salvando = ref(false);

const aberto = computed(() => lancamento.aberto && lancamento.tipo !== 'transferencia');
const transfAberta = computed(() => lancamento.aberto && lancamento.tipo === 'transferencia');
const transfInicial = ref({});
const noCartao = computed(() => lancamento.limitar === 'cartao');
const noConta = computed(() => lancamento.limitar === 'conta');
const usaCartao = computed(() => f.value.tipo === 'saida' && (noCartao.value || (!noConta.value && f.value.pagamento === 'cartao')));
const contasCampo = computed(() => contas.value.map((c) => ({ id: c.id, nome: c.nome, icone: c.icone })));
const dividaEscolhida = computed(() => vinculaveis.value.find((d) => d.id === f.value.dividaId) || null);
const economiaAntecipacao = computed(() => {
  const x = f.value;
  return x.dividaId && Number(x.valorParcela) > 0 && Number(x.valor) > 0 && Number(x.valor) < Number(x.valorParcela) ? Math.round((x.valorParcela - x.valor) * 100) / 100 : 0;
});
const nomeConta = computed(() => contas.value.find((c) => String(c.id) === String(f.value.contaId))?.nome || '');
const nomeCartao = computed(() => cartoesManuais.value.find((c) => String(c.id) === String(f.value.cartaoId))?.nome || '');
const titulo = computed(() => {
  if (noCartao.value) return nomeCartao.value ? `Lançar compra · ${nomeCartao.value}` : 'Lançar compra no cartão';
  if (noConta.value && nomeConta.value) return `Lançar na conta ${nomeConta.value}`;
  return 'Lançar transação';
});

const moeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const nomesMesCurtos = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotuloFatura = (chave) => { if (!chave) return ''; const [a, m] = chave.split('-').map(Number); return `${nomesMesCurtos[m - 1]}/${a}`; };

async function pedir(url, opcoes = {}) { return fetch(url, { credentials: 'include', ...opcoes }); }
async function lerJson(url) { try { const r = await pedir(url); return r.ok ? await r.json() : []; } catch { return []; } }

async function carregarApoio() {
  const [cs, vinc, cart] = await Promise.all([lerJson('/api/contas'), lerJson('/api/transacoes/vinculaveis'), lerJson('/api/cartoes')]);
  contas.value = Array.isArray(cs) ? cs : [];
  vinculaveis.value = Array.isArray(vinc) ? vinc : [];
  cartoesManuais.value = (Array.isArray(cart) ? cart : []).filter((c) => c.origem === 'manual');
  const x = f.value;
  if (!x.contaId || !contas.value.some((c) => String(c.id) === String(x.contaId))) x.contaId = contas.value.length ? contas.value[0].id : '';
  if (!cartoesManuais.value.some((c) => String(c.id) === String(x.cartaoId))) x.cartaoId = cartoesManuais.value.length ? cartoesManuais.value[0].id : '';
  if (transfAberta.value) transfInicial.value = { ...transfInicial.value, origemId: lancamento.contaId || contas.value[0]?.id || '' };
}

watch(() => lancamento.token, async () => {
  if (!lancamento.aberto) return;
  erro.value = ''; erros.value = {}; previa.value = null; destinoPix.value = null;
  const novo = vazio();
  novo.tipo = lancamento.tipo === 'entrada' ? 'entrada' : 'saida';
  novo.contaId = lancamento.contaId;
  novo.cartaoId = lancamento.cartaoId;
  novo.pagamento = lancamento.cartaoId ? 'cartao' : 'conta';
  novo.categoriaId = lancamento.categoriaId;
  novo.categoriaReceita = lancamento.categoriaReceita;
  novo.dividaId = lancamento.dividaId;
  novo.descricao = lancamento.descricao;
  novo.valor = lancamento.valor;
  f.value = novo;
  if (lancamento.tipo === 'transferencia') transfInicial.value = { origemId: lancamento.contaId || '' };
  await carregarApoio();
  carregarSugestoes();
});

async function carregarSugestoes() {
  const x = f.value;
  const qs = new URLSearchParams();
  if (x.tipo === 'saida' && x.categoriaId) qs.set('categoriaId', x.categoriaId);
  else if (x.tipo === 'entrada' && x.categoriaReceita) qs.set('categoriaReceita', x.categoriaReceita);
  sugestoesSub.value = await lerJson(`/api/transacoes/subcategorias?${qs}`);
}
watch(() => [f.value.tipo, f.value.categoriaId, f.value.categoriaReceita], () => { if (aberto.value) carregarSugestoes(); });
watch(() => f.value.tipo, (t) => { if (t === 'entrada') f.value.pagamento = 'conta'; });

async function atualizarPrevia() {
  previa.value = null;
  const x = f.value;
  if (!aberto.value || !usaCartao.value || !x.cartaoId || !(Number(x.valor) > 0)) return;
  const q = new URLSearchParams({ valor: x.valor, parcelas: x.parcelas || 1, dataCompra: x.data });
  const r = await pedir(`/api/cartoes/${x.cartaoId}/previa?${q}`);
  if (r.ok) previa.value = await r.json();
}
watch(() => [aberto.value, f.value.pagamento, f.value.tipo, f.value.cartaoId, f.value.valor, f.value.parcelas, f.value.data], atualizarPrevia);

// Vincular a acordo/dívida/crediário: a parcela sugerida preenche o valor (que continua editável).
watch(() => f.value.dividaId, (id) => {
  const x = f.value;
  const d = vinculaveis.value.find((v) => v.id === id);
  if (!d) { x.valorParcela = 0; return; }
  x.valorParcela = d.valor_parcela || 0;
  if (!(Number(x.valor) > 0) && d.valor_parcela) x.valor = d.valor_parcela;
  if (!String(x.descricao || '').trim()) x.descricao = `Parcela ${d.nome}`;
});

// Pix/TED: para conta própria vira transferência; para terceiros continua despesa.
let tempoPix = null;
watch(() => [f.value.descricao, f.value.tipo, f.value.contaId, aberto.value], () => {
  clearTimeout(tempoPix);
  const x = f.value;
  if (!aberto.value || x.tipo !== 'saida' || usaCartao.value || String(x.descricao || '').trim().length < 3) { destinoPix.value = null; return; }
  tempoPix = setTimeout(async () => {
    try {
      const r = await pedir(`/api/transacoes/detectar-destino?${new URLSearchParams({ descricao: x.descricao, contaId: x.contaId || '' })}`);
      const d = r.ok ? await r.json() : null;
      destinoPix.value = d && d.tipo ? d : null;
    } catch { destinoPix.value = null; }
  }, 300);
});
function virarTransferencia() {
  const x = f.value; const d = destinoPix.value;
  transfInicial.value = { origemId: x.contaId, destinoId: d && d.contaId ? d.contaId : '', valor: Number(x.valor) || 0, data: x.data };
  lancamento.tipo = 'transferencia'; // troca a janela por cima da mesma página
}

function terminar(aviso) {
  if (aviso) {
    avisoLancamento.value = aviso;
    if (route.name !== 'transacoes') avisar(aviso.texto, { duracao: 6000 });
  }
  fecharLancamento();
  lancamentoFoiSalvo();
}

async function salvar() {
  erro.value = ''; erros.value = {};
  const x = f.value;
  if (!(Number(x.valor) > 0)) erros.value.valor = 'Informe um valor maior que zero.';
  if (!String(x.descricao || '').trim()) erros.value.descricao = 'Informe uma descrição.';
  if (Object.keys(erros.value).length) return;
  if (usaCartao.value) return salvarNoCartao();
  if (!x.contaId) { erro.value = 'Cadastre uma conta em Contas antes de lançar transações.'; return; }
  salvando.value = true;
  try {
    const resposta = await pedir('/api/transacoes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipo: x.tipo, descricao: x.descricao, valor: Number(x.valor), data: x.data, contaId: x.contaId,
        categoriaId: x.tipo === 'saida' && x.categoriaId !== '' ? x.categoriaId : null,
        categoriaReceita: x.tipo === 'entrada' && x.categoriaReceita ? x.categoriaReceita : null,
        subcategoria: x.subcategoria || null,
        icone: x.icone || null,
        ...(x.tipo === 'saida' && x.dividaId ? { dividaId: x.dividaId, valorParcela: Number(x.valorParcela) || undefined } : {}),
      }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) { erro.value = dados.erro || 'Não foi possível salvar a transação.'; return; }
    let aviso = { texto: `${x.tipo === 'entrada' ? 'Entrada' : 'Saída'} de ${moeda(x.valor)} lançada: ${x.descricao}.` };
    if (dados.pagamento) {
      const p = dados.pagamento;
      aviso = { texto: `Pagamento vinculado a "${p.nome}": abatido ${moeda(p.abatimento)} do saldo (restam ${moeda(p.novoSaldo)}).${p.desconto > 0 ? ` Economia por antecipação: ${moeda(p.desconto)}.` : ''}` };
    }
    // Na tela de Transações o mês acompanha a transação lançada; nas outras páginas nada muda de lugar.
    if (route.name === 'transacoes') escolher(Number(x.data.slice(0, 4)), Number(x.data.slice(5, 7)));
    terminar(aviso);
  } finally { salvando.value = false; }
}

async function salvarNoCartao() {
  const x = f.value;
  if (!x.cartaoId) { erro.value = 'Cadastre um cartão manual em Cartões para lançar compras nele.'; return; }
  salvando.value = true;
  try {
    const resposta = await pedir(`/api/cartoes/${x.cartaoId}/lancamentos`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ descricao: x.descricao, valor: Number(x.valor), parcelas: Number(x.parcelas) || 1, dataCompra: x.data, categoriaId: x.categoriaId === '' ? null : x.categoriaId }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) { erro.value = dados.erro || 'Não foi possível lançar no cartão.'; return; }
    const cartao = cartoesManuais.value.find((c) => c.id === x.cartaoId);
    terminar({
      cartaoId: x.cartaoId,
      texto: `"${x.descricao}" entrou na fatura de ${rotuloFatura(dados.primeiraFatura)} do cartão ${cartao ? cartao.nome : ''}` + (dados.parcelas > 1 ? ` (${dados.parcelas}x)` : '') + '.',
    });
  } finally { salvando.value = false; }
}

function transferenciaFeita(t) {
  if (route.name === 'transacoes') escolher(Number(t.data.slice(0, 4)), Number(t.data.slice(5, 7)));
  terminar({ texto: `Transferência de ${moeda(t.valor)}: ${t.origemNome} → ${t.destinoNome}. Não conta como despesa nem receita.`, desfazer: { url: `/api/transacoes/transferencia/${t.vinculo}` } });
}
</script>

<template>
  <FormularioModal :aberto="aberto" :titulo="titulo" :tema="f.tipo" :rotulo-salvar="noCartao ? 'Lançar compra' : f.tipo === 'entrada' ? 'Lançar entrada' : 'Lançar saída'" :carregando="salvando" :erro="erro" @salvar="salvar" @fechar="fecharLancamento">
    <p v-if="!noCartao && !noConta" class="nota">Para o que não vem do banco: dinheiro em espécie, um Pix que ainda não sincronizou, uma entrada extra. Em contas manuais o saldo é ajustado na hora.</p>
    <CampoTipo v-if="!noCartao" v-model="f.tipo" />
    <CampoValor v-model="f.valor" :tipo="f.tipo" :erro="erros.valor" autofocus />
    <CampoTexto v-model="f.descricao" rotulo="Descrição" placeholder="Ex: Mercado, Salário, Pix do João" :erro="erros.descricao" />
    <CampoData v-model="f.data" atalhos />
    <CampoTipo v-if="f.tipo === 'saida' && !noCartao && !noConta" v-model="f.pagamento" rotulo="Forma de pagamento" :opcoes="[{ id: 'conta', rotulo: 'Débito / Pix', tema: 'saida', icone: Landmark }, { id: 'cartao', rotulo: 'Cartão de crédito', tema: 'saida', icone: CreditCard }]" />
    <template v-if="usaCartao">
      <p v-if="cartoesManuais.length === 0" class="nota">Nenhum cartão manual cadastrado. Cartões conectados pelo Open Finance recebem as compras sozinhos; cadastre um cartão em Cartões para lançar à mão.</p>
      <template v-else>
        <CampoSelecao v-model="f.cartaoId" rotulo="Cartão" :opcoes="cartoesManuais.map((c) => ({ valor: c.id, rotulo: c.nome }))" :disabled="noCartao" />
        <CampoTexto v-model="f.parcelas" rotulo="Parcelas" type="number" min="1" max="48" step="1" />
        <p v-if="previa" class="previa">{{ previa.parcelas }}x de {{ moeda(previa.valorParcela) }} · começa na fatura de {{ rotuloFatura(previa.primeiraFatura.chave) }} e termina em {{ rotuloFatura(previa.ultimaFatura) }}. Entra sozinho na fatura do cartão.</p>
      </template>
    </template>
    <CampoConta v-else v-model="f.contaId" :rotulo="f.tipo === 'entrada' ? 'Conta que recebe' : 'Conta'" :contas="contasCampo" :erro="erros.conta" />
    <p v-if="destinoPix && destinoPix.tipo === 'propria' && !usaCartao" class="dica-pix propria">
      Parece um Pix/TED para uma conta sua{{ destinoPix.contaNome ? ` (${destinoPix.contaNome})` : '' }}: isso é uma transferência, não uma despesa.
      <button type="button" class="botao-icone" @click="virarTransferencia">Lançar como transferência</button>
    </p>
    <p v-else-if="destinoPix && destinoPix.tipo === 'terceiro' && !usaCartao" class="dica-pix">Pix/TED para outra pessoa é lançado como despesa. Para uma conta sua, escolha “Transferir”.</p>
    <template v-if="f.tipo === 'saida' && !usaCartao && vinculaveis.length">
      <CampoSelecao v-model="f.dividaId" rotulo="Vincular a acordo, dívida ou crediário (opcional)" :opcoes="[{ valor: '', rotulo: 'Nenhum' }, ...vinculaveis.map((d) => ({ valor: d.id, rotulo: d.nome }))]" />
      <template v-if="f.dividaId">
        <CampoValor v-model="f.valorParcela" tipo="saida" rotulo="Valor da parcela" dica="Preenchido com a parcela da dívida; pode mudar. Se você pagar menos que a parcela, a diferença vira economia por antecipação." />
        <p v-if="economiaAntecipacao > 0" class="previa">Economia por antecipação: {{ moeda(economiaAntecipacao) }}. A parcela inteira ({{ moeda(f.valorParcela) }}) é abatida do saldo da dívida.</p>
        <p v-else-if="dividaEscolhida" class="previa">Saldo atual da dívida: {{ moeda(dividaEscolhida.saldo) }}. O valor pago será abatido dele e entra no histórico.</p>
      </template>
    </template>
    <CampoCategoria v-if="f.tipo === 'saida'" v-model="f.categoriaId" tipo="saida" :tema="f.tipo" rotulo="Categoria de despesa" automatica="Automática" dica="Automática usa suas regras e o nome da descrição; sem correspondência vai para “Geral”." />
    <CampoCategoria v-else v-model="f.categoriaReceita" tipo="entrada" :tema="f.tipo" rotulo="Categoria de entrada" automatica="Automática" dica="Automática usa suas regras; sem correspondência vai para “Geral”." />
    <CampoTexto v-if="!usaCartao" v-model="f.subcategoria" rotulo="Subcategoria (opcional)" maxlength="80" list="sugestoes-sub-lanc" autocomplete="off" placeholder="Ex: Presente da mãe, Uber do trabalho" />
    <CampoIconeItem v-if="!usaCartao" v-model="f.icone" :tipo="f.tipo" :descricao="f.descricao" />
    <datalist id="sugestoes-sub-lanc"><option v-for="s in sugestoesSub" :key="s" :value="s"></option></datalist>
  </FormularioModal>

  <TransferenciaModal :aberto="transfAberta" :contas="contas" :inicial="transfInicial" @fechar="fecharLancamento" @salvo="transferenciaFeita" />
</template>

<style scoped>
.nota { font-size: 13px; color: var(--cor-texto-suave); margin: 0; }
.previa { margin: 0; font-size: 13px; color: var(--cor-texto-suave); border: 1px dashed var(--cor-borda); border-radius: 10px; padding: 10px 12px; }
.dica-pix { margin: 0; padding: 10px 12px; border-radius: 10px; border: 1px dashed var(--cor-borda); font-size: 13px; color: var(--cor-texto-suave); display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.dica-pix.propria { border-style: solid; color: var(--cor-texto); }
.botao-icone { background: transparent; border: 1px solid var(--cor-borda); color: var(--cor-texto-suave); font-family: inherit; font-size: 12px; padding: 6px 10px; border-radius: 10px; min-height: 44px; cursor: pointer; }
</style>
