<script setup>
// <CampoCategoria v-model="catId" tipo="saida" rotulo="Categoria" /> — grade de categorias com ícone, "Geral" primeiro e
// "+ Nova categoria" inline (nome + ícone sugerido), sem sair da janela.
// Props: modelValue (despesa = id; entrada = NOME da categoria), tipo ('saida'|'entrada'), categorias (opcional: se vier null/omitido,
//   o campo busca sozinho em /api/categorias ou /api/categorias/receitas), rotulo, erro, dica, tema, obrigatorio, vazio,
//   automatica (texto da 1ª opção "sem escolha", ex.: 'Automática'; vazio = não mostra), permitirNova (padrão true).
// Eventos: update:modelValue, criada(categoria) — o pai pode recarregar a lista dele.
// Homologação 1.0, seção 14 (ajuste de 29/10 22h24): COMPACTO por padrão — um quadro com a categoria escolhida;
// tocar EXPANDE ali mesmo a grade de quadradinhos com todas (mais usadas primeiro, + "Nova categoria"); escolher recolhe.
// `grade` mostra a grade sempre aberta, como antes. (Pílulas ficam só para a subcategoria.)
// A opção sem escolha "Automática" passa a se chamar "Pelas regras" (com "?" explicando).
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { Plus, Sparkles, ChevronDown } from 'lucide-vue-next';
import AjudaSecao from './AjudaSecao.vue';
import IconeCategoria from './IconeCategoria.vue';
import CampoBase from './CampoBase.vue';
import CampoTexto from './CampoTexto.vue';
import SeletorIconeCategoria from './SeletorIconeCategoria.vue';
import { tipoCat } from '../utils/iconesCategoria.js';

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  categorias: { type: Array, default: null },
  tipo: { type: String, default: 'saida' },
  rotulo: { type: String, default: 'Categoria' },
  erro: String, dica: String, tema: String, obrigatorio: Boolean, dicaAoFocar: Boolean,
  vazio: { type: String, default: 'Nenhuma categoria cadastrada.' },
  automatica: { type: String, default: '' },
  permitirNova: { type: Boolean, default: true },
  grade: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue', 'criada']);

const t = computed(() => tipoCat(props.tipo));
const proprias = ref([]);
const extras = ref([]); // criadas aqui, antes de o pai recarregar
async function carregar() {
  if (props.categorias) return;
  try {
    const r = await fetch(t.value === 'entrada' ? '/api/categorias/receitas' : '/api/categorias', { credentials: 'include' });
    proprias.value = r.ok ? await r.json() : [];
  } catch { proprias.value = []; }
}
onMounted(carregar);

const chaveDe = (c) => (t.value === 'entrada' ? c.nome : c.id);
const lista = computed(() => {
  const base = [...(props.categorias || proprias.value)];
  extras.value.forEach((e) => { if (!base.some((c) => chaveDe(c) === chaveDe(e))) base.push(e); });
  const ehGeral = (c) => String(c.nome).toLowerCase() === 'geral';
  return [...base.filter(ehGeral), ...base.filter((c) => !ehGeral(c))];
});
const ativo = (c) => String(props.modelValue) === String(chaveDe(c));
// "Automática" (rótulo antigo) vira "Pelas regras"
const rotuloAuto = computed(() => (/autom/i.test(props.automatica) ? 'Pelas regras' : props.automatica));
const ehPelasRegras = computed(() => rotuloAuto.value === 'Pelas regras');

// ---- mais usadas (contagem guardada no aparelho, por tipo) ----
const CHAVE_USO = computed(() => `dagda.categorias.uso.${t.value}`);
const uso = ref({});
function lerUso() { try { uso.value = JSON.parse(localStorage.getItem(CHAVE_USO.value) || '{}') || {}; } catch { uso.value = {}; } }
function contarUso(k) {
  if (!k) return;
  try { const u = { ...uso.value, [k]: (uso.value[k] || 0) + 1 }; uso.value = u; localStorage.setItem(CHAVE_USO.value, JSON.stringify(u)); } catch { /* sem armazenamento */ }
}
onMounted(lerUso);
const selecionada = computed(() => lista.value.find((c) => ativo(c)) || null);
const ordenadaUso = computed(() => [...lista.value].sort((a, b) => (uso.value[chaveDe(b)] || 0) - (uso.value[chaveDe(a)] || 0)));
const QTD_FILEIRA = 5;
const fileira = computed(() => {
  const ord = [...lista.value].sort((a, b) => (uso.value[chaveDe(b)] || 0) - (uso.value[chaveDe(a)] || 0));
  const top = ord.slice(0, QTD_FILEIRA);
  const sel = lista.value.find((c) => ativo(c));
  if (sel && !top.includes(sel)) top.unshift(sel); // a escolhida sempre aparece
  return top;
});
function escolher(c) { const k = c ? chaveDe(c) : ''; contarUso(k); emit('update:modelValue', k); }

// ---- janela "Todas" ----
const todasAberta = ref(false);
const painel = ref(null);
function abrirTodas() { todasAberta.value = true; nextTick(() => painel.value?.querySelector('button.ativo, button')?.focus()); }
function fecharTodas() { todasAberta.value = false; criando.value = false; }
function escolherNaJanela(c) { escolher(c); fecharTodas(); }


// ---- nova categoria inline ----
const criando = ref(false);
const nome = ref('');
const icone = ref('');
const erroNova = ref('');
const salvando = ref(false);
function abrirNova() { criando.value = true; nome.value = ''; icone.value = ''; erroNova.value = ''; }
function aoEnter(e) {
  if (e.target && e.target.tagName === 'INPUT' && e.target.type !== 'search') { e.preventDefault(); e.stopPropagation(); criar(); }
}
async function criar() {
  erroNova.value = '';
  const n = nome.value.trim();
  if (!n) { erroNova.value = 'Informe o nome da categoria.'; return; }
  salvando.value = true;
  try {
    const r = await fetch(t.value === 'entrada' ? '/api/categorias/receitas' : '/api/categorias', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(t.value === 'entrada' ? { nome: n, icone: icone.value } : { nome: n, tetoMensal: 0, icone: icone.value }),
    });
    const d = await r.json();
    if (!r.ok) { erroNova.value = d.erro || 'Não foi possível criar a categoria.'; return; }
    extras.value.push(d);
    criando.value = false;
    contarUso(chaveDe(d));
    todasAberta.value = false;
    emit('update:modelValue', chaveDe(d));
    emit('criada', d);
  } catch { erroNova.value = 'Não foi possível criar a categoria.'; } finally { salvando.value = false; }
}
</script>

<template>
  <CampoBase :rotulo="rotulo" :erro="erro" :dica="dica" :dica-ao-focar="dicaAoFocar" :tema="tema" :obrigatorio="obrigatorio">
    <!-- Compacto: quadro com a escolhida; tocar expande a grade -->
    <button v-if="!grade" type="button" class="quadro-cat" :aria-expanded="todasAberta" data-categoria-escolhida @click="todasAberta ? fecharTodas() : abrirTodas()">
      <span v-if="!selecionada" class="ic-p auto"><Sparkles :size="18" :stroke-width="1.9" aria-hidden="true" /></span>
      <IconeCategoria v-else :valor="selecionada.icone" :tipo="t" :cor="selecionada.cor || undefined" :tamanho="34" />
      <b>{{ selecionada ? selecionada.nome : (automatica ? rotuloAuto : 'Escolha a categoria') }}</b>
      <span class="trocar">{{ todasAberta ? 'Fechar' : 'Trocar' }}<ChevronDown :size="16" :stroke-width="2" :class="{ girado: todasAberta }" aria-hidden="true" /></span>
    </button>
    <p v-if="!grade && automatica && ehPelasRegras && String(modelValue) === ''" class="sf-dica pelas-regras">A categoria vem da regra que combinar com a descrição.<AjudaSecao secao="categoria.regras" /></p>

    <div v-if="grade || todasAberta" :class="grade ? 'grade-direta' : 'grade-expandida'">
    <div ref="painel">
    <div class="grade" role="radiogroup" :aria-label="rotulo">
      <button v-if="automatica" type="button" role="radio" :aria-checked="String(modelValue) === ''" :class="['sf-opcao', 'cat', { ativo: String(modelValue) === '' }]" @click="grade ? escolher(null) : escolherNaJanela(null)">
        <span class="ic auto"><Sparkles :size="22" :stroke-width="1.8" aria-hidden="true" /></span>
        <span class="nm">{{ rotuloAuto }}</span>
      </button>
      <button v-for="c in (grade ? lista : ordenadaUso)" :key="chaveDe(c)" type="button" role="radio" :aria-checked="ativo(c)" :class="['sf-opcao', 'cat', { ativo: ativo(c) }]" @click="grade ? escolher(c) : escolherNaJanela(c)">
        <IconeCategoria :valor="c.icone" :tipo="t" :cor="c.cor || undefined" :tamanho="40" />
        <span class="nm">{{ c.nome }}</span>
      </button>
      <button v-if="permitirNova" type="button" class="cat nova" :aria-expanded="criando" @click="criando ? (criando = false) : abrirNova()">
        <span class="ic"><Plus :size="22" :stroke-width="2.2" aria-hidden="true" /></span>
        <span class="nm">Nova categoria</span>
      </button>
    </div>
    <p v-if="!lista.length && !automatica" class="sf-dica">{{ vazio }}</p>

    <div v-if="criando" class="nova-form" @keydown.enter="aoEnter">
      <CampoTexto v-model="nome" rotulo="Nome da nova categoria" :placeholder="t === 'entrada' ? 'Ex: Freela, Cashback' : 'Ex: Uber, Ração, Netflix'" :tema="tema" autofocus maxlength="60" />
      <SeletorIconeCategoria v-model="icone" :tipo="t" :nome="nome" />
      <p v-if="erroNova" class="erro-nova" role="alert">{{ erroNova }}</p>
      <div class="acoes-nova">
        <button type="button" class="b sec" @click="criando = false">Cancelar</button>
        <button type="button" class="b pri" :disabled="salvando" @click="criar">{{ salvando ? 'Criando...' : 'Criar categoria' }}</button>
      </div>
    </div>
    </div>
    </div>
  </CampoBase>
</template>

<style scoped>
.quadro-cat { width: 100%; display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 8px 12px; border-radius: 14px; border: 1.5px solid var(--tema-cor, var(--cor-primaria)); background: var(--tema-fundo, var(--cor-realce)); color: var(--cor-texto); font: inherit; text-align: left; cursor: pointer; }
.quadro-cat b { flex: 1; font-size: 14.5px; font-weight: 600; }
.quadro-cat .ic-p { width: 34px; height: 34px; }
.trocar { display: inline-flex; align-items: center; gap: 2px; font-size: 12.5px; font-weight: 600; color: var(--tema-cor, var(--cor-primaria)); }
.trocar svg { transition: transform var(--anim-rapida) ease; }
.trocar svg.girado { transform: rotate(180deg); }
.grade-expandida { margin-top: 8px; }
.fileira { display: flex; gap: 6px; overflow-x: auto; padding: 2px 2px 4px; scrollbar-width: none; overscroll-behavior-x: contain; }
.fileira::-webkit-scrollbar { display: none; }
.chip-cat { flex: none; display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 0 12px 0 6px; border-radius: 999px; border: 1.5px solid var(--cor-borda); background: var(--cor-fundo); color: var(--cor-texto); font: 600 12.5px var(--fonte-texto); white-space: nowrap; cursor: pointer; }
.chip-cat.ativo { border-color: var(--tema-cor, var(--cor-primaria)); background: var(--tema-fundo, var(--cor-realce)); }
.chip-cat.todas { padding: 0 12px; color: var(--tema-cor, var(--cor-primaria)); border-style: dashed; }
.chip-cat:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--tema-cor, var(--cor-primaria)) 35%, transparent); }
.ic-p { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; background: var(--cor-realce); color: var(--cor-texto-suave); }
.pelas-regras { display: flex; align-items: center; margin: 2px 0 0; }
.janela-todas { position: fixed; inset: 0; z-index: 80; background: rgb(0 0 0 / 0.45); display: flex; align-items: flex-end; justify-content: center; }
@media (min-width: 769px) { .janela-todas { align-items: center; } }
.painel-todas { width: min(520px, 100%); max-height: min(78vh, 620px); overflow-y: auto; padding: 14px 14px 18px; border-radius: 20px 20px 0 0; background: var(--cor-fundo-elevado); border: 1px solid var(--cor-borda); box-shadow: 0 -12px 40px -16px rgb(0 0 0 / 0.5); }
@media (min-width: 769px) { .painel-todas { border-radius: 20px; } }
.topo-todas { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; font-family: var(--fonte-display); font-size: 16px; }
.fechar-todas { width: 40px; height: 40px; border-radius: 50%; border: 0; background: var(--cor-realce); color: var(--cor-texto); display: grid; place-items: center; cursor: pointer; }
.painel-todas .grade { max-height: none; }
.grade { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 8px; max-height: 300px; overflow-y: auto; padding: 2px; overscroll-behavior: contain; }
.cat { display: flex; flex-direction: column; align-items: center; gap: 6px; min-height: 80px; padding: 10px 6px; border-radius: 14px; background: var(--cor-fundo); border: 1.5px solid var(--cor-borda); color: var(--cor-texto); font: 600 12px/1.2 var(--fonte-texto); text-align: center; cursor: pointer; transition: border-color var(--anim-rapida) ease, background var(--anim-padrao) ease, transform var(--anim-rapida) ease; }
.cat:hover { border-color: color-mix(in srgb, var(--tc, var(--tema-cor, var(--cor-primaria))) 40%, var(--cor-borda)); }
.cat:active { transform: scale(0.97); }
.cat.ativo { border-color: var(--tc, var(--tema-cor, var(--cor-primaria))); background: var(--tema-fundo, var(--cor-realce)); }
.cat:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--tema-cor, var(--cor-primaria)) 35%, transparent); }
.ic { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; background: var(--cor-realce); color: var(--cor-texto-suave); }
.nova { border-style: dashed; color: var(--tema-cor, var(--cor-primaria)); }
.nova .ic { color: inherit; background: var(--tema-fundo, var(--cor-realce)); }
.nm { overflow-wrap: anywhere; }
.nova-form { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; padding: 12px; border: 1.5px dashed var(--cor-borda); border-radius: 14px; }
.erro-nova { margin: 0; font-size: 13px; color: var(--cor-alerta, var(--cor-saida)); }
.acoes-nova { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
.b { min-height: 44px; padding: 0 16px; border-radius: 12px; font: 600 14px var(--fonte-texto); cursor: pointer; }
.b.sec { background: transparent; border: 1px solid var(--cor-borda); color: var(--cor-texto); }
.b.pri { border: none; background: var(--tema-degrade, var(--cor-primaria)); color: var(--cor-sobre-cor, #fff); }
.b.pri:disabled { opacity: .6; cursor: default; }
</style>
