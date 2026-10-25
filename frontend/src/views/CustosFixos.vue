<script setup>
// Custos fixos (Perfil / Mais): despesas que se repetem todo mês (aluguel, internet, mensalidades). Cadastro no aparelho
// (API /api/custos-fixos) e projeção do mês seguinte = custos fixos ativos + parcelas de cartão + parcelas de dívidas/acordos.
import { ref, computed, onMounted } from 'vue';
import { Plus, Pencil, Trash2, CalendarClock, Power } from 'lucide-vue-next';
import TopoValor from '../components/TopoValor.vue';
import CardPadrao from '../components/CardPadrao.vue';
import BarraAcoes from '../components/BarraAcoes.vue';
import BotaoAcao from '../components/BotaoAcao.vue';
import FormularioModal from '../components/FormularioModal.vue';
import CampoTexto from '../components/CampoTexto.vue';
import CampoValor from '../components/CampoValor.vue';
import CampoCategoria from '../components/CampoCategoria.vue';
import CampoSelecao from '../components/CampoSelecao.vue';
import Valor from '../components/Valor.vue';
import { avisar } from '../services/avisos.js';

const itens = ref([]);
const totalAtivos = ref(0);
const proj = ref(null);
const categorias = ref([]);
const carregando = ref(true);
const erroCarga = ref('');

const moeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function api(metodo, url, corpo) {
  const r = await fetch(url, { method: metodo, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || 'Não foi possível concluir.');
  return j;
}
async function carregar() {
  try {
    const [lista, p, cats] = await Promise.all([api('GET', '/api/custos-fixos'), api('GET', '/api/custos-fixos/projecao'), api('GET', '/api/categorias').catch(() => [])]);
    itens.value = lista.itens;
    totalAtivos.value = lista.totalAtivos;
    proj.value = p.proximo;
    categorias.value = Array.isArray(cats) ? cats : [];
    erroCarga.value = '';
  } catch (e) { erroCarga.value = e.message; } finally { carregando.value = false; }
}
onMounted(carregar);

const ativos = computed(() => itens.value.filter((i) => i.ativo));
const inativos = computed(() => itens.value.filter((i) => !i.ativo));

// ---- Formulário ----
const aberto = ref(false);
const editandoId = ref(null);
const f = ref({ nome: '', valor: 0, dia: '1', categoriaId: '', ativo: true });
const erros = ref({});
const erroGeral = ref('');
const salvando = ref(false);
const confirmandoExcluir = ref(false);
const DIAS = Array.from({ length: 31 }, (_, i) => ({ valor: String(i + 1), rotulo: `Dia ${i + 1}` }));
async function carregarCategoriasCF() { try { const r = await fetch('/api/categorias', { credentials: 'include' }); if (r.ok) categorias.value = await r.json(); } catch { /* segue com a lista atual */ } }
const opcoesCategoria = computed(() => [{ valor: '', rotulo: 'Sem categoria' }, ...categorias.value.map((c) => ({ valor: c.id, rotulo: c.nome }))]);

function novo() { editandoId.value = null; f.value = { nome: '', valor: 0, dia: '1', categoriaId: '', ativo: true }; abrirForm(); }
function editar(i) { editandoId.value = i.id; f.value = { nome: i.nome, valor: i.valor, dia: String(i.dia), categoriaId: i.categoriaId || '', ativo: i.ativo }; abrirForm(); }
function abrirForm() { erros.value = {}; erroGeral.value = ''; confirmandoExcluir.value = false; aberto.value = true; }

async function salvar() {
  const e = {};
  if (!f.value.nome.trim()) e.nome = 'Informe o nome.';
  if (!(f.value.valor > 0)) e.valor = 'Informe um valor maior que zero.';
  erros.value = e;
  if (Object.keys(e).length) return;
  salvando.value = true; erroGeral.value = '';
  const corpo = { nome: f.value.nome.trim(), valor: f.value.valor, dia: Number(f.value.dia), categoriaId: f.value.categoriaId || null, ativo: f.value.ativo };
  try {
    if (editandoId.value) await api('PUT', `/api/custos-fixos/${editandoId.value}`, corpo);
    else await api('POST', '/api/custos-fixos', corpo);
    aberto.value = false;
    avisar(editandoId.value ? 'Custo fixo atualizado.' : 'Custo fixo adicionado.', { tipo: 'ok' });
    await carregar();
  } catch (x) { erroGeral.value = x.message; } finally { salvando.value = false; }
}
async function alternar(i) {
  try { await api('PUT', `/api/custos-fixos/${i.id}`, { ativo: !i.ativo }); await carregar(); } catch (x) { avisar(x.message, { tipo: 'erro' }); }
}
async function excluir() {
  if (!confirmandoExcluir.value) { confirmandoExcluir.value = true; return; }
  salvando.value = true;
  try {
    await api('DELETE', `/api/custos-fixos/${editandoId.value}`);
    aberto.value = false;
    avisar('Custo fixo excluído.', { tipo: 'ok' });
    await carregar();
  } catch (x) { erroGeral.value = x.message; } finally { salvando.value = false; confirmandoExcluir.value = false; salvando.value = false; }
}
</script>

<template>
  <div class="pagina">
    <h1 class="titulo-pagina">Custos fixos</h1>

    <TopoValor tema="saida" :variante="2" rotulo="Custos fixos por mês" :valor="totalAtivos"
      :linhas="proj ? [{ rotulo: `Projeção de ${proj.rotulo}`, valor: proj.total, destaque: true }] : []">
      <template #acoes>
        <BarraAcoes compacto :colunas="1" rotulo="Ações dos custos fixos">
          <BotaoAcao compacto :icone="Plus" rotulo="Novo custo fixo" tema="saida" destaque @click="novo" />
        </BarraAcoes>
      </template>
    </TopoValor>

    <p v-if="erroCarga" class="erro" role="alert">{{ erroCarga }}</p>

    <CardPadrao v-if="proj" titulo="Projeção do mês seguinte" :subtitulo="proj.rotulo">
      <ul class="proj">
        <li><span>Custos fixos ({{ proj.custosFixos.quantidade }})</span><b class="num"><Valor :valor="proj.custosFixos.total" /></b></li>
        <li><span>Parcelas de cartão ({{ proj.parcelasCartao.quantidade }})</span><b class="num"><Valor :valor="proj.parcelasCartao.total" /></b></li>
        <li><span>Parcelas de dívidas e acordos ({{ proj.parcelasDividas.quantidade }})</span><b class="num"><Valor :valor="proj.parcelasDividas.total" /></b></li>
        <li class="total"><span>= Saídas previstas</span><b class="num"><Valor :valor="proj.total" /></b></li>
      </ul>
      <p class="nota">Só entra o que já está cadastrado. Gastos variáveis do dia a dia não fazem parte da projeção.</p>
    </CardPadrao>

    <CardPadrao titulo="Seus custos fixos" :subtitulo="ativos.length ? `${ativos.length} ativo${ativos.length > 1 ? 's' : ''}` : ''">
      <p v-if="!carregando && !itens.length" class="vazio">Nenhum custo fixo ainda. Cadastre aluguel, internet, mensalidades e outras contas que se repetem todo mês.</p>
      <ul v-else class="lista">
        <li v-for="i in ativos" :key="i.id" class="linha">
          <button type="button" class="corpo" @click="editar(i)">
            <span class="quadro"><CalendarClock :size="20" :stroke-width="1.8" /></span>
            <span class="texto"><b>{{ i.nome }}</b><small>todo dia {{ i.dia }}{{ i.categoriaNome ? ' · ' + i.categoriaNome : '' }}</small></span>
            <span class="valor numero-tabular">{{ moeda(i.valor) }}</span>
          </button>
          <button type="button" class="pausa" :aria-label="`Pausar ${i.nome}`" title="Pausar (sai da projeção)" @click="alternar(i)"><Power :size="18" :stroke-width="1.9" /></button>
        </li>
        <li v-if="inativos.length" class="sep">Pausados</li>
        <li v-for="i in inativos" :key="i.id" class="linha off">
          <button type="button" class="corpo" @click="editar(i)">
            <span class="quadro"><CalendarClock :size="20" :stroke-width="1.8" /></span>
            <span class="texto"><b>{{ i.nome }}</b><small>pausado · não entra na projeção</small></span>
            <span class="valor numero-tabular">{{ moeda(i.valor) }}</span>
          </button>
          <button type="button" class="pausa" :aria-label="`Reativar ${i.nome}`" title="Reativar" @click="alternar(i)"><Power :size="18" :stroke-width="1.9" /></button>
        </li>
      </ul>
    </CardPadrao>

    <FormularioModal :aberto="aberto" :titulo="editandoId ? 'Editar custo fixo' : 'Novo custo fixo'" tema="saida" :carregando="salvando" :erro="erroGeral" @salvar="salvar" @fechar="aberto = false">
      <CampoTexto v-model="f.nome" rotulo="Nome" placeholder="Ex.: Aluguel" maxlength="80" :erro="erros.nome" />
      <CampoValor v-model="f.valor" tipo="saida" rotulo="Valor mensal" :erro="erros.valor" />
      <CampoSelecao v-model="f.dia" rotulo="Dia do mês" :opcoes="DIAS" />
      <CampoCategoria v-model="f.categoriaId" tipo="saida" rotulo="Categoria" automatica="Sem categoria" @criada="carregarCategoriasCF" />
      <label class="check"><input v-model="f.ativo" type="checkbox" /> <span>Ativo (entra na projeção do mês seguinte)</span></label>
      <template v-if="editandoId" #extra>
        <button type="button" class="sf-botao secundario excluir" :disabled="salvando" @click="excluir"><Trash2 :size="16" :stroke-width="2" /> {{ confirmandoExcluir ? 'Confirmar exclusão' : 'Excluir' }}</button>
      </template>
    </FormularioModal>
  </div>
</template>

<style scoped>
.pagina { padding: 0 0 var(--espaco-fim); max-width: 640px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--espaco-secao); }
.titulo-pagina { font-family: var(--fonte-display); font-size: 22px; margin: 0; text-align: center; }
.erro { margin: 0; padding: 10px 12px; border-radius: 10px; background: var(--cor-grave-fundo); color: var(--cor-grave); font-size: 14px; }
.proj { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.proj li { display: flex; justify-content: space-between; gap: 12px; padding: 9px 0; font-size: 14.5px; border-bottom: 1px solid var(--cor-borda); }
.proj li:last-child { border-bottom: none; }
.proj li.total { font-weight: 700; font-size: 15.5px; }
.num { font-variant-numeric: tabular-nums; }
.nota { margin: 10px 0 0; font-size: 12.5px; line-height: 1.45; color: var(--cor-texto-suave); }
.vazio { margin: 0; font-size: 14px; color: var(--cor-texto-suave); line-height: 1.5; }
.lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.linha { display: flex; align-items: center; gap: 4px; }
.linha.off { opacity: 0.6; }
.corpo { flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; min-height: 60px; padding: 6px 8px; background: none; border: none; border-radius: 12px; color: var(--cor-texto); font-family: var(--fonte-texto); text-align: left; cursor: pointer; }
.corpo:hover, .corpo:active { background: var(--cor-realce); }
.quadro { width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: var(--cor-saida-fundo, var(--cor-realce)); color: var(--cor-saida-texto, var(--cor-saida)); flex-shrink: 0; }
.texto { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.texto b { font-size: 15px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.texto small { font-size: 12.5px; color: var(--cor-texto-suave); }
.valor { font-size: 15px; font-weight: 600; white-space: nowrap; }
.pausa { width: 44px; height: 44px; border-radius: 12px; border: none; background: none; color: var(--cor-texto-suave); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; flex: none; }
.pausa:hover { background: var(--cor-realce); color: var(--cor-texto); }
.sep { margin: 10px 4px 2px; font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--cor-texto-suave); }
.check { display: flex; align-items: center; gap: 10px; font-size: 14px; min-height: 44px; }
.check input { width: 20px; height: 20px; accent-color: var(--cor-primaria); }
.excluir { display: inline-flex; align-items: center; gap: 6px; color: var(--cor-grave); }
</style>
