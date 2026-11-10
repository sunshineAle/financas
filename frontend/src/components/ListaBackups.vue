<script setup>
import { computed, ref } from 'vue';
import { Trash2 } from 'lucide-vue-next';
import { copiaGerenciavel } from '../services/protecaoBackups.js';
const props = defineProps({ itens: { type: Array, default: () => [] }, ocupado: Boolean, permitirExcluir: Boolean, contextoEntrada: Boolean });
const emit = defineEmits(['selecionar', 'excluir']);
const expandidos = ref({});
const grupos = computed(() => [
  { nome: 'Cópias recentes', limite: 4, todos: props.itens.filter(i => !i.legado) },
  { nome: 'Pasta antiga do Drive', limite: 3, todos: props.itens.filter(i => i.legado) },
].filter(g => g.todos.length).map(g => ({...g, itens: expandidos.value[g.nome] ? g.todos : g.todos.slice(0,g.limite)})));
const data = n => new Date(n).toLocaleString('pt-BR');
</script>
<template>
  <div class="copias" data-lista-backups tabindex="0" aria-label="Cópias de backup disponíveis">
    <p v-if="contextoEntrada" class="motivo-exclusao" data-exclusao-entrada>Para gerenciar ou excluir cópias, entre no app e abra Dados e backup. Antes de excluir, o Dagda precisa comprovar que outra cópia é recuperável com seu acesso.</p>
    <section v-for="g in grupos" :key="g.nome"><h3>{{ g.nome }}</h3>
      <div v-for="i in g.itens" :key="i.id" class="copia">
        <button type="button" data-selecionar-backup :disabled="ocupado" @click="emit('selecionar',i)"><b>{{ data(i.data) }}</b><small>{{ Math.ceil(i.tamanho/1024) }} KB{{ i.legado ? ' · pasta antiga do Drive · somente leitura' : !copiaGerenciavel(i) ? ' · somente leitura nesta prévia' : '' }}</small></button>
        <button v-if="(permitirExcluir || contextoEntrada) && copiaGerenciavel(i)" type="button" class="excluir" :disabled="ocupado || !permitirExcluir" :title="!permitirExcluir ? 'Entre no app para gerenciar suas cópias com segurança' : 'Excluir esta cópia'" :data-exclusao-bloqueada="!permitirExcluir || undefined" :aria-label="`Excluir cópia de ${data(i.data)}`" @click="emit('excluir',i)"><Trash2 :size="18" /></button>
      </div>
      <button v-if="g.todos.length > g.itens.length" type="button" :disabled="ocupado" @click="expandidos[g.nome] = true">Ver outras cópias</button>
    </section>
  </div>
</template>
<style scoped>
.motivo-exclusao{margin:0 0 10px;color:var(--cor-texto-suave);font-size:12px;line-height:1.45}
.copias{max-height:300px;overflow:auto;overscroll-behavior:contain;touch-action:pan-y;border:1px solid var(--cor-borda);border-radius:12px;padding:10px}
h3{margin:4px 0 8px;font-size:13px;color:var(--cor-texto-suave)}.copia{display:flex;gap:8px;border-top:1px solid var(--cor-borda)}button{min-height:48px;border:0;border-radius:8px;background:none;color:var(--cor-texto);font:inherit;cursor:pointer}.copia>button:first-child{flex:1;min-width:0;display:flex;flex-direction:column;text-align:left;justify-content:center;padding:8px}small{color:var(--cor-texto-suave);font-size:12px}.excluir{width:44px;color:var(--cor-texto-suave)}button:focus-visible,.copias:focus-visible{outline:2px solid var(--cor-primaria)}button:disabled{opacity:.5}
</style>
