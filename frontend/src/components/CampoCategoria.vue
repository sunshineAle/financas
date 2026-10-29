<script setup>
// <CampoCategoria v-model="catId" tipo="saida" rotulo="Categoria" /> — grade de categorias com ícone, "Geral" primeiro e
// "+ Nova categoria" inline (nome + ícone sugerido), sem sair da janela.
// Props: modelValue (despesa = id; entrada = NOME da categoria), tipo ('saida'|'entrada'), categorias (opcional: se vier null/omitido,
//   o campo busca sozinho em /api/categorias ou /api/categorias/receitas), rotulo, erro, dica, tema, obrigatorio, vazio,
//   automatica (texto da 1ª opção "sem escolha", ex.: 'Automática'; vazio = não mostra), permitirNova (padrão true).
// Eventos: update:modelValue, criada(categoria) — o pai pode recarregar a lista dele.
import { ref, computed, onMounted } from 'vue';
import { Plus, Sparkles } from 'lucide-vue-next';
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
    emit('update:modelValue', chaveDe(d));
    emit('criada', d);
  } catch { erroNova.value = 'Não foi possível criar a categoria.'; } finally { salvando.value = false; }
}
</script>

<template>
  <CampoBase :rotulo="rotulo" :erro="erro" :dica="dica" :dica-ao-focar="dicaAoFocar" :tema="tema" :obrigatorio="obrigatorio">
    <div class="grade" role="radiogroup" :aria-label="rotulo">
      <button v-if="automatica" type="button" role="radio" :aria-checked="String(modelValue) === ''" :class="['sf-opcao', 'cat', { ativo: String(modelValue) === '' }]" @click="emit('update:modelValue', '')">
        <span class="ic auto"><Sparkles :size="22" :stroke-width="1.8" aria-hidden="true" /></span>
        <span class="nm">{{ automatica }}</span>
      </button>
      <button v-for="c in lista" :key="chaveDe(c)" type="button" role="radio" :aria-checked="ativo(c)" :class="['sf-opcao', 'cat', { ativo: ativo(c) }]" @click="emit('update:modelValue', chaveDe(c))">
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
  </CampoBase>
</template>

<style scoped>
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
