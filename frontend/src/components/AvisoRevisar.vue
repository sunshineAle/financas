<script setup>
// 1.2: em Transações e Objetivos, no lugar da lista inteira, só uma faixa discreta que leva à página /revisar.
import { ref, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ListChecks, ChevronRight } from 'lucide-vue-next';
import { contarRevisar } from '../services/revisar.js';

const props = defineProps({ versao: { type: Number, default: 0 } });
const router = useRouter();
const qtd = ref(0);
async function contar() {
  qtd.value = await contarRevisar();
}
onMounted(contar);
watch(() => props.versao, contar);
</script>

<template>
  <button v-if="qtd > 0" type="button" class="aviso-revisar" data-aviso-revisar @click="router.push('/revisar')">
    <span class="ic" aria-hidden="true"><ListChecks :size="18" :stroke-width="1.9" /></span>
    <span class="txt"><b>{{ qtd }}</b> {{ qtd === 1 ? 'lançamento' : 'lançamentos' }} para revisar</span>
    <ChevronRight :size="18" :stroke-width="2" aria-hidden="true" />
  </button>
</template>

<style scoped>
.aviso-revisar { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 12px; border-radius: 14px; cursor: pointer; text-align: left;
  color: var(--cor-texto); background: color-mix(in srgb, var(--cor-meta, #7c3aed) 10%, var(--cor-card)); border: 1px solid color-mix(in srgb, var(--cor-meta, #7c3aed) 35%, var(--cor-borda)); font: 500 14px var(--fonte-texto); }
.ic { flex: none; width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; color: #fff; background: linear-gradient(135deg, #5e18d8, #1597a8); }
.txt { flex: 1; }
.aviso-revisar:focus-visible { outline: 2px solid var(--cor-primaria); outline-offset: 2px; }
</style>
