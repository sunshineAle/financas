<script setup>
// Botão "Voltar" do topo das telas internas do "Mais" (Relatórios, Categorias, Dados e conexões).
// O AppLayout o coloca sozinho, então as telas não precisam ser editadas. Volta à tela inicial do Mais (/mais).
import { useRouter } from 'vue-router';
import { ChevronLeft } from 'lucide-vue-next';

defineProps({ para: { type: String, default: '/mais' }, rotulo: { type: String, default: 'Voltar' } });
const router = useRouter();
</script>

<template>
  <button type="button" class="voltar" @click="router.push(para)">
    <ChevronLeft :size="20" :stroke-width="2" />
    <span>{{ rotulo }}</span>
  </button>
</template>

<style scoped>
.voltar {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-height: 44px;
  padding: 0 14px 0 6px;
  margin-bottom: 4px;
  border: none;
  border-radius: 99px;
  background: none;
  color: var(--cor-texto);
  font-family: var(--fonte-texto);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background var(--anim-rapida) ease;
}
.voltar:active, .voltar:hover { background: var(--cor-realce); }
</style>
