<script setup>
// Escolha de ícone de categoria (manifesto v2): grade agrupada por seção, busca sem acento/maiúscula e ícone SUGERIDO
// a partir do nome digitado ("Uber" → Uber/táxi). Respeita o tipo (Despesa/Entrada).
//   <SeletorIconeCategoria v-model="icone" tipo="saida" :nome="nome" :automatico="true" />
// automatico: enquanto a pessoa não escolher à mão, o ícone acompanha a sugestão (sem match = "Geral").
import { ref, computed, watch } from 'vue';
import { Search, Sparkles } from 'lucide-vue-next';
import IconeCat from './IconeCat.vue';
import { secoesDoTipo, sugerirIcone, iconeCat, GERAL, tipoCat, resolverIconeCategoria } from '../utils/iconesCategoria.js';

const props = defineProps({
  modelValue: { type: String, default: '' },
  tipo: { type: String, default: 'saida' },
  nome: { type: String, default: '' },
  automatico: { type: Boolean, default: true },
});
const emit = defineEmits(['update:modelValue']);

const t = computed(() => tipoCat(props.tipo));
const busca = ref('');
const aberto = ref(false);
const escolhido = ref(!props.automatico); // true = a pessoa escolheu à mão (para de seguir a sugestão)
const sugestao = computed(() => sugerirIcone(props.nome, t.value));
const atual = computed(() => resolverIconeCategoria(props.modelValue, t.value));
const atualInfo = computed(() => iconeCat(atual.value || GERAL[t.value]));
const secoes = computed(() => secoesDoTipo(t.value, busca.value));

function seguirSugestao() {
  const alvo = sugestao.value ? sugestao.value.chave : GERAL[t.value];
  if (props.modelValue !== alvo) emit('update:modelValue', alvo);
}
watch(() => [props.nome, t.value], () => { if (!escolhido.value) seguirSugestao(); }, { immediate: true });
// trocar Despesa/Entrada: o ícone escolhido de um tipo não vale para o outro
watch(t, () => { if (escolhido.value && !resolverIconeCategoria(props.modelValue, t.value)) { escolhido.value = false; } seguirSugestao(); });

function escolher(i) { escolhido.value = true; emit('update:modelValue', i.chave); aberto.value = false; busca.value = ''; }
function voltarSugestao() { escolhido.value = false; seguirSugestao(); }
const texto = computed(() => {
  if (escolhido.value) return `Ícone escolhido: ${atualInfo.value ? atualInfo.value.label : 'Geral'}`;
  if (sugestao.value) return `Ícone sugerido: ${sugestao.value.label}`;
  return props.nome.trim().length >= 2 ? 'Sem sugestão para esse nome: ícone “Geral” selecionado' : 'Ícone padrão: Geral (muda conforme o nome)';
});
</script>

<template>
  <div class="seletor-cat">
    <div class="sugestao">
      <span class="prev" aria-hidden="true"><IconeCat v-if="atualInfo" :chave="atualInfo.chave" :tamanho="26" /></span>
      <span class="txt" aria-live="polite">
        <Sparkles v-if="!escolhido && sugestao" :size="14" :stroke-width="2" class="brilho" aria-hidden="true" />{{ texto }}
      </span>
      <button type="button" class="trocar" :aria-expanded="aberto" @click="aberto = !aberto">{{ aberto ? 'Fechar' : 'Trocar' }}</button>
      <button v-if="escolhido && sugestao && sugestao.chave !== atual" type="button" class="trocar" @click="voltarSugestao">Usar sugestão</button>
    </div>

    <div v-if="aberto" class="painel">
      <label class="busca">
        <Search :size="16" :stroke-width="2" aria-hidden="true" />
        <input v-model="busca" type="search" inputmode="search" placeholder="Buscar ícone (ex.: uber, ração, luz)" autocomplete="off" aria-label="Buscar ícone" @keydown.enter.prevent />
      </label>
      <div class="grade-secoes" role="radiogroup" aria-label="Ícones de categoria">
        <p v-if="!secoes.length" class="vazio">Nenhum ícone com esse nome. Tente outra palavra.</p>
        <section v-for="s in secoes" :key="s.secao">
          <h4>{{ s.secao }}</h4>
          <div class="grade">
            <button v-for="i in s.itens" :key="i.chave" type="button" role="radio" :aria-checked="atual === i.chave" :class="['ic', { ativo: atual === i.chave }]" :title="i.label" :aria-label="i.label" @click="escolher(i)">
              <IconeCat :chave="i.chave" :tamanho="24" :preenchido="atual === i.chave" />
              <span class="rot">{{ i.label }}</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.seletor-cat { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.sugestao { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 8px 10px; border: 1.5px solid var(--cor-borda); border-radius: 12px; background: var(--cor-fundo); }
.prev { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; color: var(--tema-cor, var(--cor-primaria)); background: var(--tema-fundo, var(--cor-realce)); flex: none; }
.txt { flex: 1 1 140px; min-width: 0; font-size: 13px; font-weight: 600; color: var(--cor-texto); overflow-wrap: anywhere; }
.brilho { vertical-align: -2px; margin-right: 4px; color: var(--tema-cor, var(--cor-primaria)); }
.trocar { min-height: 44px; padding: 0 14px; border-radius: 12px; border: 1.5px solid var(--cor-borda); background: transparent; color: var(--cor-texto); font: 600 13px var(--fonte-texto); cursor: pointer; }
.trocar:hover { background: var(--cor-realce); }
.painel { display: flex; flex-direction: column; gap: 8px; border: 1.5px solid var(--cor-borda); border-radius: 12px; padding: 8px; background: var(--cor-card, var(--cor-fundo)); }
.busca { display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 12px; border: 1.5px solid var(--cor-borda); border-radius: 12px; background: var(--cor-fundo); color: var(--cor-texto-suave); }
.busca input { flex: 1; min-width: 0; border: none; background: transparent; color: var(--cor-texto); font: 500 14px var(--fonte-texto); outline: none; min-height: 40px; }
.grade-secoes { max-height: 280px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; overscroll-behavior: contain; }
h4 { margin: 0 0 6px; font: 700 11px var(--fonte-texto); letter-spacing: .04em; text-transform: uppercase; color: var(--cor-texto-suave); }
.grade { display: grid; grid-template-columns: repeat(auto-fill, minmax(78px, 1fr)); gap: 6px; }
.ic { display: flex; flex-direction: column; align-items: center; gap: 4px; min-height: 64px; padding: 8px 4px; border-radius: 12px; border: 1.5px solid var(--cor-borda); background: var(--cor-fundo); color: var(--cor-texto); cursor: pointer; }
.ic:hover { border-color: color-mix(in srgb, var(--tema-cor, var(--cor-primaria)) 45%, var(--cor-borda)); }
.ic.ativo { border-color: var(--tema-cor, var(--cor-primaria)); background: var(--tema-fundo, var(--cor-realce)); color: var(--tema-cor, var(--cor-primaria)); }
.ic:focus-visible, .trocar:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--tema-cor, var(--cor-primaria)) 35%, transparent); }
.rot { font: 500 10.5px/1.15 var(--fonte-texto); text-align: center; color: var(--cor-texto-suave); overflow-wrap: anywhere; }
.ic.ativo .rot { color: inherit; }
.vazio { margin: 6px; font-size: 13px; color: var(--cor-texto-suave); }
</style>
