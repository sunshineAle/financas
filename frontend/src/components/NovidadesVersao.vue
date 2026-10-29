<script setup>
// "Novidades desta versão" (anotação 42): uma vez, na primeira abertura depois de atualizar, com o mesmo resumo do aviso
// de versão e "Ver detalhes" (Sobre o app). Garante que a pessoa saiba o que mudou mesmo se o aviso antigo não mostrou.
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Sparkles } from 'lucide-vue-next';
import Modal from './Modal.vue';
import { novidadesNaoVistas, marcarNovidadesVistas, rotuloVersao, ehTeste } from '../services/novidades.js';

const router = useRouter();
const n = ref(null);
onMounted(async () => { setTimeout(async () => { n.value = await novidadesNaoVistas(); }, 1200); });
function fechar() { if (n.value) marcarNovidadesVistas(n.value.versao); n.value = null; }
function detalhes() { fechar(); router.push('/mais/sobre?novidades=1'); }
</script>

<template>
  <Modal :aberto="!!n" titulo="Novidades desta versão" @fechar="fechar">
    <div v-if="n" class="nov" data-novidades-versao>
      <p class="ver"><Sparkles :size="15" :stroke-width="2" /> {{ rotuloVersao(n) }}<span v-if="ehTeste(n)" class="selo">teste</span></p>
      <p class="resumo">{{ n.resumo }}</p>
    </div>
    <template #rodape>
      <button type="button" class="b-sec" @click="detalhes">Ver detalhes</button>
      <button type="button" class="b-prim" @click="fechar">Entendi</button>
    </template>
  </Modal>
</template>

<style scoped>
.nov { display: flex; flex-direction: column; gap: 8px; }
.ver { margin: 0; display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--cor-texto-suave); }
.ver svg { color: var(--cor-primaria); }
.selo { margin-left: 4px; font-size: 11px; font-weight: 700; padding: 1px 7px; border-radius: 99px; border: 1px solid var(--cor-borda); color: var(--cor-texto-suave); }
.resumo { margin: 0; font-size: 15px; line-height: 1.5; }
.b-sec, .b-prim { min-height: 44px; padding: 0 18px; border-radius: 12px; font: 600 15px var(--fonte-texto); cursor: pointer; }
.b-sec { background: none; border: 1px solid var(--cor-borda); color: var(--cor-texto); }
.b-prim { border: none; color: #fff; background: linear-gradient(135deg, #5e18d8, #1597a8); }
</style>
