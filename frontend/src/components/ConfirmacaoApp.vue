<script setup>
// Janela de confirmação do app (services/confirmar.js). Mesmo visual das outras janelas (Modal): no celular sobe da base
// e fecha arrastando para baixo; no PC fica centralizada. Ícone e botão na cor do excluir (âmbar), sem vermelho.
import { computed } from 'vue';
import { Trash2, CircleHelp } from 'lucide-vue-next';
import Modal from './Modal.vue';
import { pedidoConfirmacao, responderConfirmacao } from '../services/confirmar.js';

const p = computed(() => pedidoConfirmacao.value);
</script>

<template>
  <Modal :aberto="!!p" :titulo="p ? p.titulo : ''" :largura="420" :camada="1300" @fechar="responderConfirmacao(false)">
    <div v-if="p" class="conf" data-confirmacao>
      <span class="ic" :class="{ perigo: p.perigo }" aria-hidden="true"><component :is="p.perigo ? Trash2 : CircleHelp" :size="22" :stroke-width="2" /></span>
      <div class="txt">
        <p v-if="p.texto">{{ p.texto }}</p>
        <ul v-if="p.detalhes && p.detalhes.length"><li v-for="(d, i) in p.detalhes" :key="i">{{ d }}</li></ul>
      </div>
    </div>
    <template #rodape>
      <div class="botoes">
        <button type="button" class="b-sec" data-confirmar-nao @click="responderConfirmacao(false)">{{ p ? p.cancelar : 'Cancelar' }}</button>
        <button type="button" class="b-prim" :class="{ perigo: p && p.perigo }" data-confirmar-sim @click="responderConfirmacao(true)">{{ p ? p.acao : 'Confirmar' }}</button>
      </div>
    </template>
  </Modal>
</template>

<style scoped>
.conf { display: grid; grid-template-columns: 44px minmax(0, 1fr); gap: 14px; align-items: start; }
.ic { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; color: var(--cor-primaria); background: color-mix(in srgb, var(--cor-primaria) 14%, transparent); }
.ic.perigo { color: var(--cor-amarelo); background: color-mix(in srgb, var(--cor-amarelo) 16%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--cor-amarelo) 35%, transparent); }
.txt p { margin: 2px 0 0; font-size: 15px; line-height: 1.45; color: var(--cor-texto); }
.txt ul { margin: 8px 0 0; padding-left: 18px; font-size: 13.5px; color: var(--cor-texto-suave); display: flex; flex-direction: column; gap: 3px; }
.botoes { display: flex; gap: 10px; justify-content: flex-end; }
.b-sec, .b-prim { min-height: 46px; padding: 0 18px; border-radius: 12px; font: 600 15px var(--fonte-texto); cursor: pointer; }
.b-sec { background: none; border: 1px solid var(--cor-borda); color: var(--cor-texto); }
.b-prim { flex: 1; max-width: 220px; border: none; color: #fff; background: linear-gradient(135deg, #5e18d8, #1597a8); }
.b-prim.perigo { color: #1c1300; background: var(--cor-amarelo); }
</style>
