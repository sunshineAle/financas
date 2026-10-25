<script setup>
import MenuPontos from '../components/MenuPontos.vue';
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import Modal from '../components/Modal.vue';
import BarraDegrade from '../components/BarraDegrade.vue';
import BarraOrcamento from '../components/BarraOrcamento.vue';
import AbasSeletor from '../components/AbasSeletor.vue';
import { Plus, ListChecks, TrendingDown, TrendingUp } from 'lucide-vue-next';
import CabecalhoPagina from '../components/CabecalhoPagina.vue';
import TopoValor from '../components/TopoValor.vue';
import CardPadrao from '../components/CardPadrao.vue';
import BarraAcoes from '../components/BarraAcoes.vue';
import BotaoAcao from '../components/BotaoAcao.vue';
import FormularioModal from '../components/FormularioModal.vue';
import CampoTexto from '../components/CampoTexto.vue';
import CampoValor from '../components/CampoValor.vue';
import CampoTipo from '../components/CampoTipo.vue';
import CampoBase from '../components/CampoBase.vue';
import CatItem from '../components/CatItem.vue';
import IconeCategoria from '../components/IconeCategoria.vue';
import { mes } from '../services/mes.js';
import SeletorIconeCategoria from '../components/SeletorIconeCategoria.vue';
import { abrirLancamento, lancamentoSalvo } from '../services/lancamento.js';

import SeletorCor from '../components/SeletorCor.vue';
import { corReceita, PALETA_RECEITA } from '../utils/coresReceita.js';
import { corDespesa, PALETA_DESPESA } from '../utils/coresDespesa.js';
const indiceCat = (c) => categorias.value.findIndex((x) => x.id === c.id);
// Receitas: cada categoria com sua cor (só tons frios; ver utils/coresReceita.js)
const tipoAberto = ref('despesa');
const corDe = (c) => corDespesa(c, indiceCat(c));

const router = useRouter();
const categorias = ref([]);
const carregando = ref(true);
const erro = ref('');
const mostrarFormulario = ref(false);
const receitas = ref([]);
const catAberta = ref(null);
const detalheCat = ref({ transacoes: [], total: 0 });
const editando = ref(null);
const formEdicao = ref({ nome: '', tetoMensal: '', icone: '', cor: '' });
const tipoEdicao = ref('despesa');
const erroEdicao = ref('');
const mesAtualChave = () => mes.value;
const dataCurta = (d) => { const [, m, dia] = String(d).slice(0, 10).split('-'); return `${dia}/${m}`; };
const SEM_SUB = 'Sem subcategoria';
const grupos = computed(() => {
  const mapa = {};
  detalheCat.value.transacoes.forEach((t) => {
    const k = (t.subcategoria || '').trim() || SEM_SUB;
    mapa[k] = (mapa[k] || 0) + Math.abs(t.valor);
  });
  return Object.entries(mapa).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor);
});

async function abrirReceita(r) {
  tipoAberto.value = 'receita';
  catAberta.value = r;
  detalheCat.value = { transacoes: [], total: 0 };
  const resp = await fetch(`/api/transacoes?mes=${mesAtualChave()}&tipo=entrada`, { credentials: 'include' });
  if (resp.ok) {
    const d = await resp.json();
    const lista = d.transacoes.filter((t) => (t.categoria_receita || 'Sem categoria') === r.nome && !t.ignorada);
    detalheCat.value = { transacoes: lista, total: lista.reduce((a, t) => a + t.valor, 0) };
  }
}
async function abrirCategoria(categoria) {
  tipoAberto.value = 'despesa';
  catAberta.value = categoria;
  detalheCat.value = { transacoes: [], total: 0 };
  const r = await fetch(`/api/transacoes?mes=${mesAtualChave()}&categoriaId=${categoria.id}`, { credentials: 'include' });
  if (r.ok) {
    const d = await r.json();
    detalheCat.value = { transacoes: d.transacoes, total: d.resumo.saidas };
  }
}
function abrirEdicaoReceita(r) {
  tipoEdicao.value = 'receita';
  editando.value = r;
  formEdicao.value = { nome: r.nome, tetoMensal: '', icone: r.icone || '', cor: corReceita(r.nome, r.cor) };
  erroEdicao.value = '';
}
function abrirEdicao(categoria) {
  tipoEdicao.value = 'despesa';
  editando.value = categoria;
  formEdicao.value = { nome: categoria.nome, tetoMensal: categoria.teto_mensal, icone: categoria.icone || '', cor: corDe(categoria) };
  erroEdicao.value = '';
}
async function salvarEdicao() {
  const f = formEdicao.value;
  const ehReceita = tipoEdicao.value === 'receita';
  if (!f.nome.trim()) { erroEdicao.value = 'Informe o nome.'; return; }
  const r = await fetch(ehReceita ? `/api/categorias/receitas/${editando.value.id}` : `/api/categorias/${editando.value.id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
    body: JSON.stringify(ehReceita ? { nome: f.nome, icone: f.icone, cor: f.cor } : { nome: f.nome, tetoMensal: Number(f.tetoMensal) || 0, icone: f.icone, cor: f.cor }),
  });
  if (!r.ok) { erroEdicao.value = (await r.json()).erro || 'Não foi possível salvar.'; return; }
  editando.value = null;
  await carregarCategorias();
}

const formulario = ref({ tipo: 'despesa', nome: '', tetoMensal: '', icone: '', cor: '' });

const formatoMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
function moeda(valor) {
  return formatoMoeda.format(valor);
}

function percentual(categoria) {
  if (!categoria.teto_mensal) return 0;
  return Math.min(100, Math.round((categoria.gasto_atual / categoria.teto_mensal) * 100));
}

async function carregarCategorias() {
  const resposta = await fetch('/api/categorias', { credentials: 'include' });
  if (resposta.status === 401) {
    router.push('/login');
    return;
  }
  const lista = await resposta.json();
  // gasto do mês escolhido (o campo gasto_atual da rota é acumulado)
  const dm = await fetch(`/api/dashboard?mes=${mes.value}`, { credentials: 'include' });
  const gastoMes = dm.ok ? Object.fromEntries(((await dm.json()).categoriasMes || []).map((c) => [c.id, c.gasto_atual])) : null;
  categorias.value = gastoMes ? lista.map((c) => ({ ...c, gasto_atual: gastoMes[c.id] || 0 })) : lista;
  const rr = await fetch(`/api/transacoes/resumo-receitas?mes=${mes.value}`, { credentials: 'include' });
  if (rr.ok) receitas.value = await rr.json();
  carregando.value = false;
}

async function criarCategoria() {
  erro.value = '';
  const ehReceita = formulario.value.tipo === 'receita';
  if (!formulario.value.nome.trim()) {
    erro.value = 'Informe o nome da categoria.';
    return;
  }

  const resposta = await fetch(ehReceita ? '/api/categorias/receitas' : '/api/categorias', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(ehReceita
      ? { nome: formulario.value.nome, icone: formulario.value.icone, cor: formulario.value.cor }
      : { nome: formulario.value.nome, tetoMensal: Number(formulario.value.tetoMensal) || 0, icone: formulario.value.icone, cor: formulario.value.cor }),
  });

  if (!resposta.ok) {
    const dados = await resposta.json();
    erro.value = dados.erro || 'Não foi possível salvar a categoria.';
    return;
  }

  formulario.value = { tipo: formulario.value.tipo, nome: '', tetoMensal: '', icone: '', cor: '' };
  mostrarFormulario.value = false;
  await carregarCategorias();
}

function verTransacoes(categoria) {
  router.push({ path: '/transacoes', query: { categoria: categoria.id, nomeCategoria: categoria.nome } });
}
function verReceita(r) {
  router.push({ path: '/transacoes', query: { receita: r.nome, tipo: 'entrada' } });
}

// "+" da categoria: abre a janela de lançamento SEM sair desta página (e atualiza os números ao salvar).
function novaEm(tipo, item) {
  if (tipo === 'saida') abrirLancamento({ tipo: 'saida', categoriaId: item.id });
  else abrirLancamento({ tipo: 'entrada', categoriaReceita: item.nome });
}
watch(lancamentoSalvo, carregarCategorias);

async function excluirReceita(r) {
  if (!confirm(`Remover a categoria de receita "${r.nome}"? As entradas dela ficam sem categoria.`)) return;
  await fetch(`/api/categorias/receitas/${r.id}`, { method: 'DELETE', credentials: 'include' });
  await carregarCategorias();
}
async function excluirCategoria(categoria) {
  if (!confirm(`Remover a categoria "${categoria.nome}"?`)) return;
  await fetch(`/api/categorias/${categoria.id}`, { method: 'DELETE', credentials: 'include' });
  await carregarCategorias();
}

const totalGasto = computed(() => categorias.value.reduce((s, c) => s + (c.gasto_atual || 0), 0));
const totalTeto = computed(() => categorias.value.reduce((s, c) => s + (c.teto_mensal || 0), 0));
const totalReceitas = computed(() => receitas.value.reduce((s, r) => s + (r.valor || 0), 0));
const pctOrcado = computed(() => (totalTeto.value > 0 ? Math.min(100, (totalGasto.value / totalTeto.value) * 100) : 0));
const restante = computed(() => totalTeto.value - totalGasto.value);
const pctReal = computed(() => (totalTeto.value > 0 ? (totalGasto.value / totalTeto.value) * 100 : 0));
// estado do orçamento: 'sem' (nenhum teto) | 'dentro' | 'limite' (>= 95%) | 'passou'
const estado = computed(() => {
  if (totalTeto.value <= 0) return 'sem';
  if (totalGasto.value > totalTeto.value) return 'passou';
  return pctReal.value >= 95 ? 'limite' : 'dentro';
});
const rotuloTopo = computed(() => ({ sem: 'Gasto do mês', dentro: 'Ainda pode gastar', limite: 'Orçamento no limite', passou: 'Passou do orçamento' }[estado.value]));
const valorTopo = computed(() => (estado.value === 'sem' ? totalGasto.value : Math.abs(restante.value)));
const estiloTopo = computed(() => ({
  dentro: { '--tema-degrade': 'var(--degrade-entrada)' },
  limite: { '--tema-degrade': 'linear-gradient(135deg, var(--entrada-ceruleo-medio), var(--investimento-verde-agua-escuro))', '--tema-cor': 'var(--investimento-verde-agua-escuro)' },
  passou: { '--tema-degrade': 'var(--degrade-grave)', '--tema-cor': 'var(--cor-grave)' },
  sem: {},
}[estado.value]));
const linhasTopo = computed(() => [
  { rotulo: 'Orçado nas categorias', valor: totalTeto.value },
  { rotulo: 'Gasto até agora', valor: totalGasto.value },
  { rotulo: 'Entradas do mês (informativo)', valor: totalReceitas.value },
]);
const aba = ref('despesas');
// Abas: Despesas (com limite e barra de orçamento) | Entradas (sem limite). Despesas vem primeiro.
const abasLista = [{ id: 'despesas', rotulo: 'Despesas', icone: TrendingDown }, { id: 'receitas', rotulo: 'Entradas', icone: TrendingUp }];
const temaAba = computed(() => (aba.value === 'receitas' ? 'entrada' : 'saida'));
const maiorReceita = computed(() => Math.max(0, ...receitas.value.map((r) => r.valor || 0)));
function novaCategoria(tipo) { formulario.value = { tipo, nome: '', tetoMensal: '', icone: '', cor: '' }; erro.value = ''; mostrarFormulario.value = true; }
const tetoNovo = computed({ get: () => Number(formulario.value.tetoMensal) || 0, set: (v) => { formulario.value.tetoMensal = v ? String(v) : ''; } });
const tetoEdit = computed({ get: () => Number(formEdicao.value.tetoMensal) || 0, set: (v) => { formEdicao.value.tetoMensal = v ? String(v) : ''; } });
const opcoesTipo = [{ id: 'despesa', rotulo: 'Despesa', tema: 'saida' }, { id: 'receita', rotulo: 'Entrada', tema: 'entrada' }]; // abas Despesa | Entrada
watch(mes, carregarCategorias);
onMounted(carregarCategorias);
</script>

<template>
  <div class="pagina">
    <CabecalhoPagina titulo="Categorias" cor="var(--cor-saida-texto)">
      <template #corpo>
        <div v-deslizar-mes class="conteudo">
          <TopoValor class="topo" :style="estiloTopo" :tema="estado === 'sem' ? 'saida' : 'entrada'" :sinal="estado === 'passou' ? 'neg' : estado === 'limite' ? 'zero' : 'auto'" :variante="4" :rotulo="rotuloTopo" :valor="valorTopo" :linhas="linhasTopo">
            <BarraOrcamento v-if="totalTeto > 0" :pct="pctReal" :altura="10" />
            <template #acoes>
              <BarraAcoes compacto :colunas="2" rotulo="Ações de categorias">
                <BotaoAcao compacto :icone="Plus" rotulo="Nova categoria" tema="saida" destaque @click="novaCategoria(aba === 'receitas' ? 'receita' : 'despesa')" />
                <BotaoAcao compacto :icone="ListChecks" rotulo="Regras" @click="router.push('/regras')" />
              </BarraAcoes>
            </template>
          </TopoValor>

          <AbasSeletor v-model="aba" :abas="abasLista" :tema="temaAba" bloco />

        <CardPadrao v-if="aba === 'despesas'" titulo="Despesas" :subtitulo="`${categorias.length} categorias`">
          <p v-if="!carregando && categorias.length === 0" class="nota">Nenhuma categoria de despesa ainda.</p>
          <div class="lista">
            <CatItem v-for="c in categorias" :key="c.id" :nome="c.nome" :icone="c.icone" :cor="corDe(c)" :valor="c.gasto_atual" :limite="c.teto_mensal" :formato="moeda" @abrir="abrirCategoria(c)">
              <template #acoes>
                <button type="button" class="mais" :aria-label="`Nova despesa em ${c.nome}`" :title="`Nova despesa em ${c.nome}`" @click="novaEm('saida', c)"><Plus :size="18" :stroke-width="2.2" /></button>
                <MenuPontos><button type="button" @click="abrirEdicao(c)">Editar</button><button type="button" class="perigo" @click="excluirCategoria(c)">Remover</button></MenuPontos>
              </template>
            </CatItem>
          </div>
        </CardPadrao>

        <CardPadrao v-if="aba === 'receitas'" titulo="Entradas" :subtitulo="`${receitas.length} categorias`" tema="entrada">
          <p v-if="!carregando && receitas.length === 0" class="nota">Nenhuma categoria de receita ainda.</p>
          <div class="lista">
            <CatItem v-for="r in receitas" :key="r.nome" tipo="receita" :nome="r.nome" :icone="r.icone" :cor="corReceita(r.nome, r.cor)" :valor="r.valor" :escala="maiorReceita" :detalhe="`${r.quantidade} ${r.quantidade === 1 ? 'lançamento' : 'lançamentos'} neste mês`" :formato="moeda" @abrir="abrirReceita(r)">
              <template #acoes>
                <button type="button" class="mais receita" :aria-label="`Nova entrada em ${r.nome}`" :title="`Nova entrada em ${r.nome}`" @click="novaEm('entrada', r)"><Plus :size="18" :stroke-width="2.2" /></button>
                <MenuPontos v-if="r.id"><button type="button" @click="abrirEdicaoReceita(r)">Editar</button><button type="button" class="perigo" @click="excluirReceita(r)">Remover</button></MenuPontos>
                <span v-else class="sem-menu"></span>
              </template>
            </CatItem>
          </div>
        </CardPadrao>

        </div>
      </template>
    </CabecalhoPagina>

    <Modal :aberto="!!catAberta" :titulo="catAberta ? catAberta.nome : ''" :tema="tipoAberto === 'receita' ? 'entrada' : 'saida'" @fechar="catAberta = null">
      <div v-if="catAberta" class="detalhe-cat" :style="{ '--cat': tipoAberto === 'receita' ? corReceita(catAberta.nome, catAberta.cor) : corDe(catAberta) }">
        <div class="total-cat">
          <span class="nota">Total no mês</span>
          <strong class="numero-tabular">{{ moeda(detalheCat.total) }}</strong>
          <template v-if="tipoAberto === 'despesa'">
            <BarraDegrade :pct="catAberta.teto_mensal ? Math.min(100, detalheCat.total / catAberta.teto_mensal * 100) : 0" de="var(--saida-ambar-medio)" ate="var(--saida-carmim-medio)" :altura="8" :marcador="false" />
            <span class="nota">{{ catAberta.teto_mensal > 0 ? `de ${moeda(catAberta.teto_mensal)} de teto` : 'sem teto definido' }}</span>
          </template>
        </div>
        <h4 class="sub-titulo">Subcategorias</h4>
        <p v-if="!grupos.length" class="nota">Nenhuma {{ tipoAberto === 'receita' ? 'entrada' : 'transação' }} nesta categoria neste mês.</p>
        <ul v-else class="caixas-sub">
          <li v-for="g in grupos" :key="g.nome" :class="{ vazia: g.nome === SEM_SUB }">
            <span class="nome-sub">{{ g.nome }}</span>
            <strong class="numero-tabular">{{ moeda(g.valor) }}</strong>
          </li>
        </ul>
        <h4 v-if="detalheCat.transacoes.length" class="sub-titulo">Transações do mês</h4>
        <ul class="lista-tx-cat">
          <li v-for="t in detalheCat.transacoes" :key="t.id">
            <span class="data-tx">{{ dataCurta(t.data) }}</span>
            <span class="desc-tx">{{ t.descricao }}<small v-if="t.subcategoria"> · {{ t.subcategoria }}</small></span>
            <span class="numero-tabular val-tx">{{ moeda(Math.abs(t.valor)) }}</span>
          </li>
        </ul>
      </div>
      <template #rodape>
        <button type="button" class="botao-secundario" @click="catAberta = null">Fechar</button>
        <button type="button" class="botao-principal" @click="tipoAberto === 'receita' ? verReceita(catAberta) : verTransacoes(catAberta)">Abrir em Transações</button>
      </template>
    </Modal>

    <FormularioModal :aberto="!!editando" :titulo="tipoEdicao === 'receita' ? 'Editar categoria de receita' : 'Editar categoria'" :tema="tipoEdicao === 'receita' ? 'entrada' : 'saida'" :erro="erroEdicao" @salvar="salvarEdicao" @fechar="editando = null">
      <CampoTexto v-model="formEdicao.nome" rotulo="Nome" obrigatorio :tema="tipoEdicao === 'receita' ? 'entrada' : 'saida'" />
      <CampoValor v-if="tipoEdicao === 'despesa'" v-model="tetoEdit" rotulo="Teto mensal (opcional)" tipo="saida" dica="Deixe R$ 0,00 para ficar sem teto." />
      <CampoBase rotulo="Ícone"><SeletorIconeCategoria v-model="formEdicao.icone" :tipo="tipoEdicao === 'receita' ? 'entrada' : 'saida'" :nome="formEdicao.nome" :automatico="false" /></CampoBase>
      <CampoBase :rotulo="`Cor (${tipoEdicao === 'receita' ? 'verdes' : 'paleta de despesas'})`"><SeletorCor v-model="formEdicao.cor" :paleta="tipoEdicao === 'receita' ? PALETA_RECEITA : PALETA_DESPESA" /></CampoBase>
    </FormularioModal>

    <FormularioModal :aberto="mostrarFormulario" :titulo="formulario.tipo === 'receita' ? 'Nova categoria de receita' : 'Nova categoria de despesa'" :tema="formulario.tipo === 'receita' ? 'entrada' : 'saida'" rotulo-salvar="Salvar categoria" :erro="erro" @salvar="criarCategoria" @fechar="mostrarFormulario = false">
      <CampoTipo v-model="formulario.tipo" :opcoes="opcoesTipo" />
      <CampoTexto v-model="formulario.nome" rotulo="Nome" obrigatorio :placeholder="formulario.tipo === 'receita' ? 'Ex: Salário, Freela' : 'Ex: Delivery, Transporte'" :tema="formulario.tipo === 'receita' ? 'entrada' : 'saida'" />
      <CampoValor v-if="formulario.tipo === 'despesa'" v-model="tetoNovo" rotulo="Teto mensal (opcional)" tipo="saida" dica="Deixe R$ 0,00 para ficar sem teto." />
      <CampoBase rotulo="Ícone"><SeletorIconeCategoria v-model="formulario.icone" :tipo="formulario.tipo === 'receita' ? 'entrada' : 'saida'" :nome="formulario.nome" /></CampoBase>
      <CampoBase :rotulo="`Cor (${formulario.tipo === 'receita' ? 'verdes' : 'paleta de despesas'})`"><SeletorCor v-model="formulario.cor" :paleta="formulario.tipo === 'receita' ? PALETA_RECEITA : PALETA_DESPESA" :padrao="formulario.tipo === 'receita' ? PALETA_RECEITA[0] : PALETA_DESPESA[0]" /></CampoBase>
    </FormularioModal>
  </div>
</template>

<style scoped>
.pagina { padding: 0 0 var(--espaco-fim); max-width: 1000px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--espaco-secao); }
.conteudo { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.topo { border-radius: 22px; }
.nota { margin: 0; font-size: 13px; color: var(--cor-texto-suave); }
.lista { display: flex; flex-direction: column; gap: 2px; margin: 0 -8px; }
.mais { width: 44px; height: 44px; padding: 0; border-radius: 50%; border: none; background: none; color: var(--cor-saida); cursor: pointer; display: grid; place-items: center; }
.mais.receita { color: var(--cor-entrada); }
.mais:hover { background: var(--cor-realce); }
.sem-menu { width: 44px; }
.detalhe-cat { display: flex; flex-direction: column; gap: 12px; }
.total-cat { display: flex; flex-direction: column; gap: 6px; padding: 14px; border-radius: 14px; background: var(--cor-fundo); border: 1px solid var(--cor-borda); }
.total-cat strong { font-family: var(--fonte-display); font-size: 24px; color: var(--cat); }
.sub-titulo { font-family: var(--fonte-display); font-size: 14px; margin: 4px 0 0; color: var(--cor-texto-suave); }
.caixas-sub { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 8px; }
.caixas-sub li { display: flex; flex-direction: column; gap: 4px; padding: 10px; border: 1px solid var(--cor-borda); border-left: 4px solid var(--cat); border-radius: 10px; background: var(--cor-fundo); min-width: 0; }
.caixas-sub li.vazia { border-style: dashed; }
.nome-sub { font-size: 12px; color: var(--cor-texto-suave); overflow-wrap: anywhere; }
.lista-tx-cat { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; max-height: 240px; overflow-y: auto; }
.lista-tx-cat li { display: flex; gap: 8px; align-items: baseline; font-size: 13px; border-bottom: 1px solid var(--cor-borda); padding-bottom: 6px; }
.data-tx { color: var(--cor-texto-suave); flex: none; }
.desc-tx { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.desc-tx small { color: var(--cor-texto-suave); }
.val-tx { font-weight: 600; flex: none; color: var(--cat); }
.botao-secundario, .botao-principal { min-height: 44px; padding: 0 16px; border-radius: 12px; font: 600 14px var(--fonte-texto); cursor: pointer; }
.botao-secundario { background: transparent; border: 1px solid var(--cor-borda); color: var(--cor-texto); }
.botao-principal { border: none; background: var(--degrade-saida); color: var(--cor-sobre-cor); }
</style>
