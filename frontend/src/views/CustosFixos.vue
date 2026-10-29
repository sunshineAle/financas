<script setup>
// Custo de vida (Mais › Minhas finanças; anotações 41 e 43). Abas Fixos | Essenciais:
//  - Fixos: valor igual todo mês (aluguel, internet, assinaturas) — API /api/custos-fixos;
//  - Essenciais: gastos do mês que mudam de valor (luz, água, mercado...), ligados a uma categoria; o valor estimado é a
//    média dos últimos 6 meses (ou um valor fixado pela pessoa) — API /api/custos-fixos/essenciais.
// Custo de vida = fixos + essenciais. Projeção do mês seguinte = fixos + essenciais + parcelas de cartão, dívidas e acordos.
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Plus, Pencil, Trash2, CalendarClock, Power, TrendingUp, TrendingDown, Minus, Sparkles, X } from 'lucide-vue-next';
import AbasSeletor from '../components/AbasSeletor.vue';
import IconeCategoria from '../components/IconeCategoria.vue';
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

const route = useRoute();
const router = useRouter();
const ABAS = [{ id: 'fixos', rotulo: 'Fixos' }, { id: 'essenciais', rotulo: 'Essenciais' }];
const aba = ref(route.query.aba === 'essenciais' ? 'essenciais' : 'fixos');
watch(aba, (a) => router.replace({ query: { ...route.query, aba: a === 'fixos' ? undefined : a } }));
const itens = ref([]);
const totalAtivos = ref(0);
const totalEssenciais = ref(0);
const custoDeVida = ref(0);
const ess = ref({ itens: [], sugestoes: [], total: 0 });
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
    const [lista, p, cats, e] = await Promise.all([api('GET', '/api/custos-fixos'), api('GET', '/api/custos-fixos/projecao'), api('GET', '/api/categorias').catch(() => []), api('GET', '/api/custos-fixos/essenciais').catch(() => ({ itens: [], sugestoes: [], total: 0 }))]);
    itens.value = lista.itens;
    totalAtivos.value = lista.totalAtivos;
    totalEssenciais.value = lista.totalEssenciais || 0;
    custoDeVida.value = lista.custoDeVida ?? lista.totalAtivos;
    ess.value = e;
    proj.value = p.proximo;
    categorias.value = Array.isArray(cats) ? cats : [];
    erroCarga.value = '';
  } catch (e) { erroCarga.value = e.message; } finally { carregando.value = false; }
}
onMounted(carregar);

const ativos = computed(() => itens.value.filter((i) => i.ativo));
const inativos = computed(() => itens.value.filter((i) => !i.ativo));

// ---- Essenciais ----
const essAtivos = computed(() => ess.value.itens.filter((i) => i.ativo));
const essInativos = computed(() => ess.value.itens.filter((i) => !i.ativo));
const CHAVE_DISP = 'sf:essenciais-sugestoes-dispensadas';
const dispensadas = ref((() => { try { return JSON.parse(localStorage.getItem(CHAVE_DISP) || '[]'); } catch { return []; } })());
const sugestoes = computed(() => ess.value.sugestoes.filter((x) => !dispensadas.value.includes(x.categoriaId)).slice(0, 4));
function dispensar(x) { dispensadas.value = [...dispensadas.value, x.categoriaId]; try { localStorage.setItem(CHAVE_DISP, JSON.stringify(dispensadas.value)); } catch { /* só nesta sessão */ } }
async function adicionarSugestao(x) {
  try { await api('POST', '/api/custos-fixos/essenciais', { categoriaId: x.categoriaId }); avisar(`${x.nome} entrou no seu custo de vida.`, { tipo: 'ok' }); await carregar(); }
  catch (e) { avisar(e.message, { tipo: 'erro' }); }
}
const TEND = { subindo: { icone: TrendingUp, txt: 'subindo' }, descendo: { icone: TrendingDown, txt: 'descendo' }, estavel: { icone: Minus, txt: 'estável' } };
function detalheEss(i) {
  if (i.valorManual != null) return 'valor fixado por você' + (i.meses ? ` · média ${moeda(i.media)}` : '');
  if (!i.meses) return 'sem histórico ainda · informe um valor estimado';
  return `média de ${i.meses} ${i.meses > 1 ? 'meses' : 'mês'} · ${moeda(i.min)} a ${moeda(i.max)}`;
}
const eAberto = ref(false);
const eId = ref(null);
const ef = ref({ categoriaId: '', nome: '', valorManual: 0, dia: '', ativo: true });
const eItem = computed(() => ess.value.itens.find((i) => i.id === eId.value) || null);
const eErro = ref('');
const eConfirmar = ref(false);
const DIAS_OPC = [{ valor: '', rotulo: 'Sem dia definido' }, ...Array.from({ length: 31 }, (_, i) => ({ valor: String(i + 1), rotulo: `Dia ${i + 1}` }))];
function novoEss() { eId.value = null; ef.value = { categoriaId: '', nome: '', valorManual: 0, dia: '', ativo: true }; eErro.value = ''; eConfirmar.value = false; eAberto.value = true; }
function editarEss(i) { eId.value = i.id; ef.value = { categoriaId: i.categoriaId, nome: i.nome === i.categoriaNome ? '' : i.nome, valorManual: i.valorManual || 0, dia: i.dia ? String(i.dia) : '', ativo: i.ativo }; eErro.value = ''; eConfirmar.value = false; eAberto.value = true; }
async function salvarEss() {
  if (!ef.value.categoriaId) { eErro.value = 'Escolha a categoria.'; return; }
  salvando.value = true; eErro.value = '';
  const corpo = { categoriaId: ef.value.categoriaId, nome: ef.value.nome.trim() || null, valorManual: ef.value.valorManual > 0 ? ef.value.valorManual : null, dia: ef.value.dia ? Number(ef.value.dia) : null, ativo: ef.value.ativo };
  try {
    if (eId.value) await api('PUT', `/api/custos-fixos/essenciais/${eId.value}`, corpo);
    else await api('POST', '/api/custos-fixos/essenciais', corpo);
    eAberto.value = false;
    avisar(eId.value ? 'Essencial atualizado.' : 'Essencial adicionado ao custo de vida.', { tipo: 'ok' });
    await carregar();
  } catch (x) { eErro.value = x.message; } finally { salvando.value = false; }
}
async function alternarEss(i) { try { await api('PUT', `/api/custos-fixos/essenciais/${i.id}`, { ativo: !i.ativo }); await carregar(); } catch (x) { avisar(x.message, { tipo: 'erro' }); } }
async function excluirEss() {
  if (!eConfirmar.value) { eConfirmar.value = true; return; }
  salvando.value = true;
  try { await api('DELETE', `/api/custos-fixos/essenciais/${eId.value}`); eAberto.value = false; avisar('Essencial removido.', { tipo: 'ok' }); await carregar(); }
  catch (x) { eErro.value = x.message; } finally { salvando.value = false; eConfirmar.value = false; }
}
function novoConforme() { if (aba.value === 'essenciais') novoEss(); else novo(); }

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
    <h1 class="titulo-pagina">Custo de vida</h1>

    <TopoValor tema="saida" :variante="2" rotulo="Custo de vida por mês" :valor="custoDeVida"
      :linhas="[{ rotulo: 'Fixos', valor: totalAtivos }, { rotulo: 'Essenciais (estimado)', valor: totalEssenciais }, ...(proj ? [{ rotulo: `Projeção de ${proj.rotulo}`, valor: proj.total, destaque: true }] : [])]">
      <template #acoes>
        <BarraAcoes compacto :colunas="1" rotulo="Ações do custo de vida">
          <BotaoAcao compacto :icone="Plus" :rotulo="aba === 'essenciais' ? 'Novo essencial' : 'Novo custo fixo'" tema="saida" destaque @click="novoConforme" />
        </BarraAcoes>
      </template>
    </TopoValor>

    <p v-if="erroCarga" class="erro" role="alert">{{ erroCarga }}</p>

    <AbasSeletor v-model="aba" :abas="ABAS" tema="saida" bloco />

    <template v-if="aba === 'essenciais'">
      <p class="explica">Gastos do mês que <b>mudam de valor</b>: luz, água, gás, mercado, farmácia, transporte. O app estima pela média dos últimos 6 meses da categoria. Lazer, restaurante e delivery ficam de fora.</p>
      <CardPadrao v-if="sugestoes.length" titulo="Sugestões" subtitulo="categorias com gasto em quase todos os meses" data-sugestoes-ess>
        <ul class="lista">
          <li v-for="x in sugestoes" :key="x.categoriaId" class="linha sug">
            <IconeCategoria :valor="x.icone || ''" tipo="saida" :cor="x.cor || ''" :tamanho="40" />
            <span class="texto"><b>Adicionar {{ x.nome }}?</b><small>gasto em {{ x.comGasto }} dos últimos 6 meses · média {{ moeda(x.media) }}</small></span>
            <button type="button" class="mini-add" :aria-label="`Adicionar ${x.nome}`" @click="adicionarSugestao(x)"><Plus :size="16" :stroke-width="2.2" /> Adicionar</button>
            <button type="button" class="pausa" :aria-label="`Dispensar ${x.nome}`" @click="dispensar(x)"><X :size="16" :stroke-width="2" /></button>
          </li>
        </ul>
      </CardPadrao>
      <CardPadrao titulo="Seus essenciais" :subtitulo="essAtivos.length ? `${essAtivos.length} no custo de vida` : ''" data-essenciais>
        <p v-if="!carregando && !ess.itens.length" class="vazio">Nenhum essencial ainda. Adicione as categorias que você paga todo mês com valor que muda (luz, água, mercado…).</p>
        <ul v-else class="lista">
          <li v-for="i in essAtivos" :key="i.id" class="linha">
            <button type="button" class="corpo" @click="editarEss(i)">
              <IconeCategoria :valor="i.icone || ''" tipo="saida" :cor="i.cor || ''" :tamanho="40" />
              <span class="texto"><b>{{ i.nome }}</b><small>{{ detalheEss(i) }}<template v-if="i.tendencia && i.valorManual == null && i.meses > 1"> · <component :is="TEND[i.tendencia].icone" :size="12" :stroke-width="2.2" class="tend" /> {{ TEND[i.tendencia].txt }}</template></small></span>
              <span class="lado"><span class="valor numero-tabular">{{ moeda(i.estimado) }}</span><span class="selo" :class="i.pagoMes ? 'pago' : 'pend'">{{ i.pagoMes ? 'Pago' : 'Pendente' }}</span></span>
            </button>
            <button type="button" class="pausa" :aria-label="`Tirar ${i.nome} do custo de vida`" title="Tirar do custo de vida" @click="alternarEss(i)"><Power :size="18" :stroke-width="1.9" /></button>
          </li>
          <li v-if="essInativos.length" class="sep">Fora do custo de vida</li>
          <li v-for="i in essInativos" :key="i.id" class="linha off">
            <button type="button" class="corpo" @click="editarEss(i)">
              <IconeCategoria :valor="i.icone || ''" tipo="saida" :cor="i.cor || ''" :tamanho="40" />
              <span class="texto"><b>{{ i.nome }}</b><small>pausado</small></span>
              <span class="valor numero-tabular">{{ moeda(i.estimado) }}</span>
            </button>
            <button type="button" class="pausa" :aria-label="`Voltar ${i.nome} ao custo de vida`" title="Voltar ao custo de vida" @click="alternarEss(i)"><Power :size="18" :stroke-width="1.9" /></button>
          </li>
        </ul>
        <p class="nota">Pago = já há gasto da categoria neste mês. Parcelas de cartão e de dívidas não entram no custo de vida (são temporárias), só na projeção.</p>
      </CardPadrao>
    </template>

    <template v-if="aba === 'fixos'">
    <CardPadrao titulo="Seus custos fixos" :subtitulo="ativos.length ? `${ativos.length} ativo${ativos.length > 1 ? 's' : ''}` : ''">
      <p v-if="!carregando && !itens.length" class="vazio">Nenhum custo fixo ainda. Cadastre aluguel, internet, mensalidades e outras contas que se repetem todo mês.</p>
      <ul v-else class="lista">
        <li v-for="i in ativos" :key="i.id" class="linha">
          <button type="button" class="corpo" @click="editar(i)">
            <span class="quadro"><CalendarClock :size="20" :stroke-width="1.8" /></span>
            <span class="texto"><b>{{ i.nome }}</b><small>todo dia {{ i.dia }}{{ i.categoriaNome ? ' · ' + i.categoriaNome : '' }}</small></span>
            <span class="lado"><span class="valor numero-tabular">{{ moeda(i.valor) }}</span><span v-if="i.pagoMes !== null && i.pagoMes !== undefined" class="selo" :class="i.pagoMes ? 'pago' : 'pend'">{{ i.pagoMes ? 'Pago' : 'Pendente' }}</span></span>
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
    </template>

    <CardPadrao v-if="proj" titulo="Projeção do mês seguinte" :subtitulo="proj.rotulo">
      <ul class="proj">
        <li><span>Custos fixos ({{ proj.custosFixos.quantidade }})</span><b class="num"><Valor :valor="proj.custosFixos.total" /></b></li>
        <li v-if="proj.essenciais"><span>Essenciais estimados ({{ proj.essenciais.quantidade }})</span><b class="num"><Valor :valor="proj.essenciais.total" /></b></li>
        <li><span>Parcelas de cartão ({{ proj.parcelasCartao.quantidade }})</span><b class="num"><Valor :valor="proj.parcelasCartao.total" /></b></li>
        <li><span>Parcelas de dívidas e acordos ({{ proj.parcelasDividas.quantidade }})</span><b class="num"><Valor :valor="proj.parcelasDividas.total" /></b></li>
        <li class="total"><span>= Saídas previstas</span><b class="num"><Valor :valor="proj.total" /></b></li>
      </ul>
      <p class="nota">Só entra o que está cadastrado. Gastos não essenciais (lazer, restaurante, delivery) ficam de fora.</p>
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
    <FormularioModal :aberto="eAberto" :titulo="eId ? 'Editar essencial' : 'Novo essencial'" tema="saida" :carregando="salvando" :erro="eErro" @salvar="salvarEss" @fechar="eAberto = false">
      <CampoCategoria v-model="ef.categoriaId" tipo="saida" rotulo="Categoria" @criada="carregarCategoriasCF" />
      <CampoTexto v-model="ef.nome" rotulo="Nome (opcional)" placeholder="Usa o nome da categoria" maxlength="80" />
      <CampoValor v-model="ef.valorManual" tipo="saida" rotulo="Valor estimado (opcional)" :dica="eItem && eItem.meses ? `Em branco, usa a média dos últimos meses: ${moeda(eItem.media)}.` : 'Em branco, usa a média dos últimos 6 meses da categoria.'" />
      <CampoSelecao v-model="ef.dia" rotulo="Dia de vencimento (opcional)" :opcoes="DIAS_OPC" />
      <label class="check"><input v-model="ef.ativo" type="checkbox" /> <span>Entra no custo de vida</span></label>
      <template v-if="eId" #extra>
        <button type="button" class="sf-botao secundario excluir" :disabled="salvando" @click="excluirEss"><Trash2 :size="16" :stroke-width="2" /> {{ eConfirmar ? 'Confirmar exclusão' : 'Excluir' }}</button>
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
.explica { margin: 0 4px; font-size: 13.5px; line-height: 1.5; color: var(--cor-texto-suave); }
.lado { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; flex: none; }
.selo { font-size: 11px; font-weight: 700; padding: 1px 8px; border-radius: 99px; }
.selo.pago { background: color-mix(in srgb, var(--cor-entrada, #1f6fd1) 14%, transparent); color: var(--cor-entrada-texto, var(--cor-entrada, #1f6fd1)); }
.selo.pend { background: var(--cor-realce); color: var(--cor-texto-suave); }
.tend { vertical-align: -1px; }
.sug { gap: 10px; padding: 6px 4px; }
.mini-add { flex: none; min-height: 36px; padding: 0 10px; display: inline-flex; align-items: center; gap: 4px; border-radius: 10px; border: 1px solid var(--cor-borda); background: var(--cor-fundo); color: var(--cor-texto); font: 600 13px var(--fonte-texto); cursor: pointer; }
.excluir { display: inline-flex; align-items: center; gap: 6px; color: var(--cor-grave); }
</style>
