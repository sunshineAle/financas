<script setup>
// Ações da conta (BarraAcoes): Lançar transação · Transferir (em breve) · Mais ⋯ [Importar extrato, Editar, Arquivar].
import { ref } from 'vue';
import { Plus, ArrowLeftRight, Ellipsis, Pencil, Upload, Archive, RefreshCw, Scale } from 'lucide-vue-next';
import BarraAcoes from './BarraAcoes.vue';
import BotaoAcao from './BotaoAcao.vue';
import Modal from './Modal.vue';

defineProps({
  conectada: { type: Boolean, default: false },
  sincronizando: { type: Boolean, default: false },
});
const emit = defineEmits(['lancar', 'transferir', 'importar', 'editar', 'ajustar', 'sincronizar', 'arquivar']);
const aberto = ref(false);
function item(ev) { aberto.value = false; emit(ev); }
</script>

<template>
  <BarraAcoes compacto :colunas="3" rotulo="Ações da conta">
    <BotaoAcao compacto :icone="Plus" rotulo="Lançar transação" tema="entrada" destaque @click="emit('lancar')" />
    <BotaoAcao compacto :icone="ArrowLeftRight" rotulo="Transferir" tema="entrada" @click="emit('transferir')" />
    <BotaoAcao compacto :icone="Ellipsis" rotulo="Mais" tema="neutro" @click="aberto = true" />
  </BarraAcoes>
  <Modal :aberto="aberto" titulo="Mais ações" :largura="380" @fechar="aberto = false">
    <div class="lista">
      <button type="button" @click="item('importar')"><Upload :size="18" />Importar extrato</button>
      <button v-if="!conectada" type="button" @click="item('editar')"><Pencil :size="18" />Editar conta</button>
      <button v-if="!conectada" type="button" data-ajustar-saldo @click="item('ajustar')"><Scale :size="18" />Ajustar saldo</button>
      <button v-else type="button" :disabled="sincronizando" @click="item('sincronizar')"><RefreshCw :size="18" />{{ sincronizando ? 'Sincronizando…' : 'Sincronizar agora' }}</button>
      <button type="button" class="perigo" @click="item('arquivar')"><Archive :size="18" />Arquivar conta</button>
    </div>
  </Modal>
</template>

<style scoped>
.lista { display: flex; flex-direction: column; gap: 4px; }
.lista button { display: flex; align-items: center; gap: 12px; min-height: 48px; padding: 0 12px; border-radius: 12px; background: transparent; border: none; color: var(--cor-texto); font: 500 15px var(--fonte-texto); cursor: pointer; text-align: left; }
.lista button:hover, .lista button:focus-visible { background: var(--cor-realce); outline: none; }
.lista button:disabled { opacity: 0.55; cursor: default; }
.lista button.perigo { color: var(--cor-saida); }
</style>
