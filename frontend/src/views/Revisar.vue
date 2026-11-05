<script setup>
// 1.2 (pedido de 05/11, 16h24): "A revisar" vira página própria (/revisar), fora de Transações e de Objetivos.
// Cada lançamento fica enxuto: a linha da transação, a escolha da meta e o valor lado a lado, e os botões.
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { CheckCheck } from 'lucide-vue-next';
import CabecalhoPagina from '../components/CabecalhoPagina.vue';
import ReservasAuto from '../components/ReservasAuto.vue';

const router = useRouter();
const qtd = ref(null);
</script>

<template>
  <div class="pagina">
    <CabecalhoPagina titulo="A revisar" sem-mes>
      <template #corpo>
        <div class="conteudo-revisar">
          <ReservasAuto @quantidade="(n) => (qtd = n)" />
          <div v-if="qtd === 0" class="vazio" data-revisar-vazio>
            <span class="ic" aria-hidden="true"><CheckCheck :size="26" :stroke-width="1.8" /></span>
            <b>Tudo revisado</b>
            <span>Quando o extrato trouxer algo que o app não sabe classificar, aparece aqui.</span>
            <button type="button" class="sf-botao secundario" @click="router.push('/transacoes')">Ir para Transações</button>
          </div>
        </div>
      </template>
    </CabecalhoPagina>
  </div>
</template>

<style scoped>
.conteudo-revisar { display: flex; flex-direction: column; gap: 14px; padding-top: 8px; }
.vazio { display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; padding: 36px 16px; color: var(--cor-texto-suave); font-size: 14px; }
.vazio b { color: var(--cor-texto); font: 600 17px var(--fonte-display); }
.vazio .ic { width: 52px; height: 52px; border-radius: 16px; display: grid; place-items: center; color: #fff; background: linear-gradient(135deg, #5e18d8, #1597a8); }
.vazio .sf-botao { margin-top: 6px; min-height: 42px; padding: 0 18px; }
</style>
