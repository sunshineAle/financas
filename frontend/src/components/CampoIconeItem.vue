<script setup>
// Campo "Ícone" opcional da transação (anotação 37). Padrão: usar o da categoria (ou o reconhecido pela descrição).
// Mesmo seletor e busca do set v2 (só ícones de ITEM). v-model = chave ('cat-saida-uber-taxi') ou '' (usar o da categoria).
//   <CampoIconeItem v-model="f.icone" :tipo="f.tipo" :descricao="f.descricao" />
import { ref, computed } from 'vue';
import { Search } from 'lucide-vue-next';
import IconeCat from './IconeCat.vue';
import { secoesDoTipo, iconeCat, iconeDoItem, tipoCat } from '../utils/iconesCategoria.js';

const props = defineProps({ modelValue: { type: String, default: '' }, tipo: { type: String, default: 'saida' }, descricao: { type: String, default: '' } });
const emit = defineEmits(['update:modelValue']);
const t = computed(() => tipoCat(props.tipo));
const aberto = ref(false);
const busca = ref('');
const auto = computed(() => iconeDoItem(props.descricao, t.value));
const atual = computed(() => props.modelValue || auto.value || '');
const info = computed(() => (atual.value ? iconeCat(atual.value) : null));
const secoes = computed(() => secoesDoTipo(t.value, busca.value));
const texto = computed(() => (props.modelValue ? `Ícone: ${info.value ? info.value.label : ''}` : auto.value ? `Reconhecido pela descrição: ${info.value ? info.value.label : ''}` : 'Usar o da categoria'));
function escolher(c) { emit('update:modelValue', c); aberto.value = false; busca.value = ''; }
</script>

<template>
  <div class="campo-icone" data-campo-icone>
    <span class="rot">Ícone (opcional)</span>
    <div class="linha">
      <span class="prev" aria-hidden="true"><IconeCat v-if="info" :chave="info.chave" :tamanho="22" /></span>
      <span class="txt">{{ texto }}</span>
      <button type="button" class="b" :aria-expanded="aberto" @click="aberto = !aberto">{{ aberto ? 'Fechar' : 'Trocar' }}</button>
      <button v-if="modelValue" type="button" class="b" @click="escolher('')">Usar o da categoria</button>
    </div>
    <div v-if="aberto" class="painel">
      <label class="busca"><Search :size="16" :stroke-width="2" aria-hidden="true" /><input v-model="busca" type="search" placeholder="Buscar ícone (ex.: uber, posto, ifood)" aria-label="Buscar ícone" @keydown.enter.prevent /></label>
      <div class="grade-secoes">
        <section v-for="s in secoes" :key="s.secao">
          <h4>{{ s.secao }}</h4>
          <div class="grade">
            <button v-for="i in s.itens" :key="i.chave" type="button" :class="['ic', { ativo: atual === i.chave }]" :title="i.label" :aria-label="i.label" @click="escolher(i.chave)"><IconeCat :chave="i.chave" :tamanho="22" /></button>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.campo-icone { display: flex; flex-direction: column; gap: 6px; }
.rot { font-size: 14px; font-weight: 500; }
.linha { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 6px 8px; border: 1.5px solid var(--cor-borda); border-radius: 12px; background: var(--cor-fundo); }
.prev { width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; background: var(--tema-fundo, var(--cor-realce)); color: var(--tema-cor, var(--cor-primaria)); flex: none; }
.txt { flex: 1 1 120px; font-size: 13px; color: var(--cor-texto); min-width: 0; }
.b { min-height: 40px; padding: 0 12px; border-radius: 10px; border: 1.5px solid var(--cor-borda); background: transparent; color: var(--cor-texto); font: 600 13px var(--fonte-texto); cursor: pointer; }
.painel { display: flex; flex-direction: column; gap: 8px; border: 1.5px solid var(--cor-borda); border-radius: 12px; padding: 8px; }
.busca { display: flex; align-items: center; gap: 8px; min-height: 42px; padding: 0 10px; border: 1.5px solid var(--cor-borda); border-radius: 10px; color: var(--cor-texto-suave); }
.busca input { flex: 1; min-width: 0; border: none; background: transparent; color: var(--cor-texto); font: 500 14px var(--fonte-texto); outline: none; }
.grade-secoes { max-height: 240px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
h4 { margin: 0 0 4px; font: 700 11px var(--fonte-texto); text-transform: uppercase; letter-spacing: .04em; color: var(--cor-texto-suave); }
.grade { display: grid; grid-template-columns: repeat(auto-fill, minmax(44px, 1fr)); gap: 6px; }
.ic { height: 44px; border-radius: 10px; border: 1.5px solid var(--cor-borda); background: var(--cor-fundo); color: var(--cor-texto); display: grid; place-items: center; cursor: pointer; }
.ic.ativo { border-color: var(--tema-cor, var(--cor-primaria)); color: var(--tema-cor, var(--cor-primaria)); background: var(--tema-fundo, var(--cor-realce)); }
</style>
