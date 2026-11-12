<script setup>
// 1.2.2 (05/11, 17h13): lançamentos sem categoria (ou na "Geral") na página A revisar.
// 1.4.1 (anotação 104): cada item tem Editar e Ignorar lado a lado. Editar abre a janela no padrão do sistema
// (categorias e subcategorias em botões, criar categoria/subcategoria ali mesmo) com a opção "Criar regra" no topo,
// desmarcada, no visual do aviso de regra de Transações (anotação 52). Uma ação Salvar confirma tudo.
// Ignorar continua só para lançamentos de conta, com a mesma confirmação de antes.
import { ref, computed, onMounted, watch } from 'vue';
import { Sparkles, Check } from 'lucide-vue-next';
import CardPadrao from './CardPadrao.vue';
import LinhaTransacao from './LinhaTransacao.vue';
import Modal from './Modal.vue';
import CampoCategoria from './CampoCategoria.vue';
import CampoSubcategoria from './CampoSubcategoria.vue';
import RegraModal from './RegraModal.vue';
import { avisar } from '../services/avisos.js';
import { confirmar } from '../services/confirmar.js';
import { trechoRegra, jaTemRegra } from '../services/regraSugestao.js';

const emit = defineEmits(['quantidade']);
const itens = ref([]);
const ocupado = ref('');
const MOSTRAR = 20;
const limite = ref(MOSTRAR);

async function pedir(metodo, url, corpo) {
  const r = await fetch(url, { method: metodo, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, json: j };
}
async function carregar() {
  const [a, pe, tr] = await Promise.all([pedir('GET', '/api/transacoes/sem-categoria'), pedir('GET', '/api/reserva/auto/pendentes'), pedir('GET', '/api/transacoes/transferencias-pendentes')]);
  // o que já está no bloco "Guardar e resgatar" ou em "Possíveis transferências" não repete aqui
  const pend = new Set(((pe.ok && pe.json.pendentes) || []).map((x) => x.transacao && x.transacao.id));
  for (const t of tr.json.itens || []) pend.add(t.id);
  itens.value = (a.ok ? a.json.itens || [] : []).filter((i) => !pend.has(i.id));
  emit('quantidade', itens.value.length);
}
onMounted(carregar);

const linha = (it) => ({ id: it.id, descricao: it.descricao, valor: it.valor, data: it.data, conta_nome: it.onde, icone: it.icone, a_revisar: true });
function tirar(it) {
  itens.value = itens.value.filter((x) => x.id !== it.id);
  emit('quantidade', itens.value.length);
}

// ---- Editar ----
const editando = ref(null);
const form = ref({ categoria: '', subcategoria: '' });
const sugestoesSub = ref([]);
const regra = ref({ disponivel: false, trecho: '', marcada: false, outras: 0, ajustada: null });
let checagemRegra = Promise.resolve();
const categorias = ref({ saida: [], entrada: [] });
const regraAberta = ref(false);
const erro = ref('');
const ehSaida = computed(() => Number(editando.value?.valor) < 0);
const tipoRegra = computed(() => (ehSaida.value ? 'saida' : 'entrada'));
const semParcela = (d) => String(d || '').replace(/\s*\(\d+\/\d+\)\s*$/, '').trim();

async function editar(it) {
  editando.value = it; erro.value = '';
  form.value = { categoria: '', subcategoria: '' };
  sugestoesSub.value = [];
  const trecho = trechoRegra(semParcela(it.descricao));
  regra.value = { disponivel: false, trecho, marcada: false, outras: 0, ajustada: null };
  if (!trecho) { checagemRegra = Promise.resolve(); return; }
  // Mesma checagem de Transações: não oferece regra se já existe uma para o trecho
  checagemRegra = pedir('GET', '/api/regras').then((rr) => {
    if (editando.value === it && rr.ok && !jaTemRegra(rr.json, Number(it.valor) < 0 ? 'saida' : 'entrada', semParcela(it.descricao), trecho)) regra.value.disponivel = true;
  });
  await checagemRegra;
}
// A Geral não aparece como escolha: escolher o próprio estado de pendência daria a falsa sensação de resolvido.
async function carregarCategorias() {
  const [d, r] = await Promise.all([pedir('GET', '/api/categorias'), pedir('GET', '/api/categorias/receitas')]);
  const semGeral = (l) => (Array.isArray(l) ? l : []).filter((c) => !/^geral$/i.test(String(c.nome || '')));
  categorias.value = { saida: d.ok ? semGeral(d.json) : [], entrada: r.ok ? semGeral(r.json) : [] };
}
onMounted(carregarCategorias);
function fecharEdicao() { if (!ocupado.value) { editando.value = null; regraAberta.value = false; } }

async function aoEscolherCategoria(v) {
  form.value.subcategoria = '';
  if (!v) { sugestoesSub.value = []; regra.value.outras = 0; return; }
  await checagemRegra; // sem corrida: a prévia só é buscada depois de saber se a regra pode ser oferecida
  if (form.value.categoria !== v) return;
  const qs = new URLSearchParams(ehSaida.value ? { categoriaId: v } : { categoriaReceita: v });
  const [rs, rp] = await Promise.all([
    pedir('GET', `/api/transacoes/subcategorias?${qs}`),
    regra.value.disponivel
      ? pedir('GET', `/api/regras/previa?${new URLSearchParams({ tipo: tipoRegra.value, padrao: regra.value.trecho, ...(ehSaida.value ? { categoriaId: v } : { categoriaReceita: v }) })}`)
      : null,
  ]);
  if (form.value.categoria !== v) return;
  sugestoesSub.value = rs.ok && Array.isArray(rs.json) ? rs.json : [];
  // A prévia conta também este lançamento (de conta), que já vai ser salvo; "outras" é o que a regra moveria além dele.
  const n = rp && rp.ok ? Number(rp.json.quantidade) || 0 : 0;
  regra.value.outras = Math.max(0, editando.value?.origem === 'conta' ? n - 1 : n);
}
watch(() => form.value.categoria, (v) => aoEscolherCategoria(v));

const inicialRegra = computed(() => ({
  tipo: tipoRegra.value, padrao: regra.value.trecho,
  categoriaId: ehSaida.value ? form.value.categoria : '', categoriaReceita: ehSaida.value ? '' : form.value.categoria,
  subcategoria: form.value.subcategoria, icone: '', valor: Math.abs(Number(editando.value?.valor) || 0),
}));
function ajustarRegra() { if (form.value.categoria) regraAberta.value = true; }
// Ajustar só muda o rascunho da regra; nada é gravado antes do Salvar.
function regraAjustada(corpo) {
  regraAberta.value = false;
  regra.value.ajustada = corpo; regra.value.marcada = true;
}

async function salvar() {
  const it = editando.value; const v = form.value.categoria;
  if (!it || !v || ocupado.value) return;
  erro.value = ''; ocupado.value = it.id;
  const saida = ehSaida.value, tipo = tipoRegra.value, rg = { ...regra.value };
  try {
    const sub = form.value.subcategoria || '';
    const r = it.origem === 'cartao'
      ? await pedir('PATCH', `/api/cartoes/${it.cartaoId}/lancamentos/${it.compraId}/categoria`, { categoriaId: v, subcategoria: sub })
      : await pedir('PUT', `/api/transacoes/${it.id}`, it.valor < 0 ? { categoriaId: v, subcategoria: sub } : { categoriaReceita: v, subcategoria: sub });
    if (!r.ok) { erro.value = r.json.erro || 'Não foi possível salvar.'; return; }
    editando.value = null; // a categoria está salva: a janela fecha mesmo se a regra falhar depois
    // A categoria já está salva: o item sai da lista, aconteça o que acontecer com a regra.
    tirar(it);
    if (rg.disponivel && rg.marcada) {
      const corpo = rg.ajustada || { tipo, padrao: rg.trecho, subcategoria: sub, icone: '', aplicarAntigas: rg.outras > 0, ...(saida ? { categoriaId: v } : { categoriaReceita: v }) };
      const rr = await pedir('POST', '/api/regras', corpo).catch(() => ({ ok: false, json: {} }));
      if (!rr.ok) {
        avisar('Categoria salva, mas a regra não foi criada.', { tipo: 'alerta', grupo: 'sugestao-regra', detalhe: rr.json.erro || 'Você pode criar a regra depois em Transações.' });
      } else {
        const n = rr.json.aplicadas || 0;
        avisar(n ? `Categoria salva e regra criada · ${n} ${n === 1 ? 'transação movida' : 'transações movidas'}` : 'Categoria salva e regra criada', { tipo: 'ok', grupo: 'sugestao-regra' });
        if (n) await carregar(); // outras pendências podem ter sido resolvidas pela regra
      }
    } else {
      avisar('Categoria salva.', { tipo: 'ok' });
    }
  } catch {
    erro.value = 'Não foi possível salvar. Confira e tente de novo.';
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
        <div class="campos" :class="{ dois: it.origem === 'conta' }">
          <button type="button" class="sf-botao primario" data-editar-categoria :disabled="ocupado === it.id" @click="editar(it)">Editar</button>
          <button v-if="it.origem === 'conta'" type="button" class="sf-botao secundario" :disabled="ocupado === it.id" @click="ignorar(it)">Ignorar</button>
        </div>
      </li>
    </ul>
    <button v-if="itens.length > limite" type="button" class="mais" @click="limite += MOSTRAR">Ver mais {{ Math.min(MOSTRAR, itens.length - limite) }}</button>
  </CardPadrao>

  <Modal :aberto="!!editando && !regraAberta" titulo="Escolher categoria" :tema="ehSaida ? 'saida' : 'entrada'" :largura="560" @fechar="fecharEdicao">
    <div v-if="editando" class="edicao" data-edicao-revisar>
      <!-- Criar regra: no topo, desmarcada, no visual do aviso de regra (anotação 52); decidida antes de salvar -->
      <div v-if="regra.disponivel" class="aviso-regra" data-criar-regra>
        <button type="button" role="checkbox" class="marcar" :aria-checked="regra.marcada" :disabled="!!ocupado" @click="regra.marcada = !regra.marcada; if (!regra.marcada) regra.ajustada = null">
          <span class="caixa" :class="{ on: regra.marcada }" aria-hidden="true"><Check v-if="regra.marcada" :size="13" :stroke-width="2.6" /></span>
          <Sparkles :size="18" class="brilho" aria-hidden="true" />
          <span class="txt">
            <b>Criar regra para “{{ regra.ajustada ? regra.ajustada.padrao : regra.trecho }}”</b>
            <small v-if="regra.ajustada">Regra ajustada. Ela é criada ao salvar.</small>
            <small v-else-if="!form.categoria">Escolha a categoria para ver o que muda.</small>
            <small v-else-if="regra.outras">Também muda {{ regra.outras === 1 ? '1 transação parecida' : `${regra.outras} transações parecidas` }}.</small>
            <small v-else>As próximas já entram nesta categoria.</small>
          </span>
        </button>
        <button type="button" class="ajustar" :disabled="!form.categoria || !!ocupado" @click="ajustarRegra">Ajustar</button>
      </div>
      <LinhaTransacao :t="linha(editando)" :info="{ nome: editando.onde }" :clicavel="false" />
      <CampoCategoria v-model="form.categoria" :categorias="ehSaida ? categorias.saida : categorias.entrada" :tipo="ehSaida ? 'saida' : 'entrada'" :rotulo="ehSaida ? 'Categoria' : 'Categoria de entrada'" :tema="ehSaida ? 'saida' : 'entrada'" grade />
      <CampoSubcategoria v-if="form.categoria" v-model="form.subcategoria" :sugestoes="sugestoesSub" :tema="ehSaida ? 'saida' : 'entrada'" />
      <p v-if="erro" class="sf-erro" role="alert">{{ erro }}</p>
    </div>
    <template #rodape>
      <div class="rodape">
        <button type="button" class="sf-botao secundario" :disabled="!!ocupado" @click="fecharEdicao">Voltar</button>
        <button type="button" class="sf-botao primario" data-salvar-categoria :disabled="!form.categoria || !!ocupado" @click="salvar">{{ ocupado ? 'Salvando…' : 'Salvar' }}</button>
      </div>
    </template>
  </Modal>
  <RegraModal :aberto="!!editando && regraAberta" :inicial="regra.ajustada ? { ...inicialRegra, ...regra.ajustada } : inicialRegra" tipo-fixo rascunho @fechar="regraAberta = false" @rascunho="regraAjustada" />
</template>

<style scoped>
.lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.item { display: flex; flex-direction: column; gap: 8px; padding: 12px 0; border-top: 1px solid var(--cor-borda); }
.item:first-child { border-top: none; padding-top: 2px; }
.item :deep(.linha-tx) { margin: 0 -6px; }
.campos { display: grid; grid-template-columns: 1fr; gap: 8px; }
.campos.dois { grid-template-columns: 1fr 1fr; }
@media (min-width: 1100px) { .campos { width: 100%; max-width: 360px; margin-left: auto; } }
.campos .sf-botao { min-height: 44px; padding: 0 14px; }
.mais { margin-top: 10px; width: 100%; min-height: 40px; border-radius: 12px; border: 1px solid var(--cor-borda); background: none; color: var(--cor-texto); font: 600 14px var(--fonte-texto); cursor: pointer; }
.edicao { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.edicao :deep(.linha-tx) { margin: 0 -6px; }
/* Mesmo visual do aviso de regra (AvisoToast .aviso.regra), aqui fixo no topo da janela */
.aviso-regra { display: flex; align-items: center; gap: 4px; border-radius: 14px; border: 1px solid var(--cor-interface, var(--cor-primaria)); background: var(--cor-fundo-elevado); box-shadow: var(--sombra-suave); }
.marcar { flex: 1; min-width: 0; min-height: 52px; display: flex; align-items: center; gap: 10px; padding: 8px 4px 8px 12px; border: 0; background: none; color: var(--cor-texto); font: inherit; text-align: left; cursor: pointer; }
.caixa { width: 20px; height: 20px; flex: none; border-radius: 6px; border: 1.5px solid var(--cor-borda); display: grid; place-items: center; color: #fff; }
.caixa.on { background: var(--cor-interface, var(--cor-primaria)); border-color: var(--cor-interface, var(--cor-primaria)); }
.brilho { flex: none; color: var(--cor-interface, var(--cor-primaria)); }
.txt { display: flex; flex-direction: column; gap: 1px; min-width: 0; overflow-wrap: anywhere; }
.txt b { font-size: 14px; }
.txt small { font-size: 12px; font-weight: 500; color: var(--cor-texto-suave); }
.ajustar { min-height: 44px; min-width: 64px; padding: 0 12px; margin-right: 6px; border: none; border-radius: 10px; background: none; color: var(--cor-interface, var(--cor-primaria)); font: 700 13px var(--fonte-texto); cursor: pointer; flex: none; }
.ajustar:disabled { color: var(--cor-texto-suave); cursor: default; }
.marcar:focus-visible, .ajustar:focus-visible { outline: 2px solid var(--cor-primaria); outline-offset: 2px; }
.nota { margin: 0; font-size: 12px; color: var(--cor-texto-suave); }
.rodape { display: flex; gap: 8px; width: 100%; }
.rodape button { flex: 1; }
</style>
