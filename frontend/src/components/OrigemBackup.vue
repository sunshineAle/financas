<script setup>
// Escolha única de origem/destino do backup (anotação 34): os MESMOS dois botões e logos no login (Restaurar) e em Dados e backup.
//   modo 'restaurar': "Deste aparelho" abre o seletor de arquivo (emit 'arquivo', File); cada nuvem emite 'nuvem' (id).
//   modo 'salvar':    "Deste aparelho" emite 'aparelho' (baixar/compartilhar); cada nuvem emite 'nuvem' (id).
// Só Google Drive, OneDrive e Dropbox; nuvem sem chave configurada simplesmente não aparece.
import { ref, computed } from 'vue';
import { Smartphone, Cloud, ChevronDown } from 'lucide-vue-next';
import NuvemLogo from './NuvemLogo.vue';
import { PROVEDORES, estadoNuvem } from '../services/backup.js';

const props = defineProps({ modo: { type: String, default: 'restaurar' }, ocupado: { type: Boolean, default: false }, subAparelho: { type: String, default: '' } });
const emit = defineEmits(['arquivo', 'aparelho', 'nuvem']);
const nuvens = computed(() => Object.keys(PROVEDORES).filter((id) => PROVEDORES[id].configurado()));
const aberto = ref(false);
function escolheu(ev) { const f = ev.target.files && ev.target.files[0]; ev.target.value = ''; if (f) emit('arquivo', f); }
const subNuvem = (id) => (estadoNuvem[id] && estadoNuvem[id].conectado ? 'conectado' : props.modo === 'salvar' ? 'conectar e enviar' : 'entrar e buscar o backup');
</script>

<template>
  <div class="origem" data-origem-backup>
    <label v-if="modo === 'restaurar'" class="opcao">
      <span class="icone"><Smartphone :size="22" :stroke-width="1.9" /></span>
      <span class="texto"><b>Deste aparelho</b><small>{{ subAparelho || 'escolha o arquivo .sfin em qualquer pasta' }}</small></span>
      <input type="file" accept=".sfin,application/octet-stream" :disabled="ocupado" @change="escolheu" />
    </label>
    <button v-else type="button" class="opcao" :disabled="ocupado" data-deste-aparelho @click="emit('aparelho')">
      <span class="icone"><Smartphone :size="22" :stroke-width="1.9" /></span>
      <span class="texto"><b>Deste aparelho</b><small>{{ subAparelho || 'salvar o arquivo .sfin' }}</small></span>
    </button>
    <template v-if="nuvens.length">
      <button type="button" class="opcao" data-conectar-nuvem :aria-expanded="aberto" @click="aberto = !aberto">
        <span class="icone"><Cloud :size="22" :stroke-width="1.9" /></span>
        <span class="texto"><b>Conectar nuvem</b><small>Google Drive, OneDrive ou Dropbox</small></span>
        <ChevronDown :size="18" :stroke-width="2" class="seta" :class="{ aberta: aberto }" />
      </button>
      <div v-if="aberto" class="nuvens" data-nuvens>
        <button v-for="id in nuvens" :key="id" type="button" class="opcao nuvem" :data-entrar="id" :disabled="ocupado" @click="emit('nuvem', id)">
          <NuvemLogo :id="id" :tamanho="30" /><span class="texto"><b>{{ PROVEDORES[id].nome }}</b><small>{{ subNuvem(id) }}</small></span>
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.origem { display: flex; flex-direction: column; gap: 10px; }
.opcao { position: relative; display: flex; align-items: center; gap: 14px; min-height: 58px; padding: 8px 12px; border-radius: 14px; border: 1px solid var(--cor-borda); background: var(--cor-fundo); color: var(--cor-texto); cursor: pointer; width: 100%; text-align: left; font: inherit; }
.opcao:hover:not(:disabled), .opcao:focus-within { background: var(--cor-realce); }
.opcao:disabled { opacity: 0.6; cursor: default; }
.opcao input[type=file] { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; font-size: 0; }
.icone { width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--cor-primaria) 12%, transparent); color: var(--cor-primaria); flex: none; }
.texto { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.texto b { font-size: 15px; font-weight: 600; }
.texto small { font-size: 12.5px; color: var(--cor-texto-suave); }
.seta { margin-left: auto; color: var(--cor-texto-suave); transition: transform 0.15s ease; }
.seta.aberta { transform: rotate(180deg); }
.nuvens { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
.opcao.nuvem { min-height: 52px; padding: 6px 10px; gap: 10px; }
</style>
