<script setup>
// 1.2 (pedido de 05/11, 16h24): "A revisar" vira página própria (/revisar), fora de Transações e de Objetivos.
// Cada lançamento fica enxuto: a linha da transação, a escolha da meta e o valor lado a lado, e os botões.
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { CheckCheck, UserRound } from 'lucide-vue-next';
import CabecalhoPagina from '../components/CabecalhoPagina.vue';
import TransferenciasRevisao from '../components/TransferenciasRevisao.vue';
import ReservasAuto from '../components/ReservasAuto.vue';
import RevisarCategorias from '../components/RevisarCategorias.vue';

const router = useRouter();
const qtdTransferencias = ref(null);
const qtd = ref(null);   // guardar/resgatar
const qtdCat = ref(null); // sem categoria (1.2.2)
const versaoCat = ref(0); // decidir um guardar/resgatar pode trazer um lançamento para "Sem categoria"
// 1.4.3: sem o nome completo do titular, o app só compara com o apelido e deixa passar nomes cortados no extrato.
const semTitular = ref(false);
onMounted(async () => {
  try { const r = await fetch('/api/configuracoes', { credentials: 'include' }); if (r.ok) semTitular.value = !String((await r.json()).nome_titular || '').trim(); } catch { /* sem aviso */ }
});
const temPendencia = computed(() => (qtd.value || 0) + (qtdCat.value || 0) + (qtdTransferencias.value || 0) > 0);
</script>

<template>
  <div class="pagina">
    <CabecalhoPagina titulo="A revisar" sem-mes>
      <template #corpo>
        <div class="conteudo-revisar">
          <div v-if="semTitular && temPendencia" class="aviso-titular" data-aviso-titular>
            <UserRound :size="18" :stroke-width="2" aria-hidden="true" />
            <span>Preencha o <b>nome completo do titular</b> no Perfil. Assim o Dagda reconhece seus PIX e transferências mesmo com o nome cortado no extrato.</span>
            <button type="button" class="ir" @click="router.push('/mais/perfil')">Preencher</button>
          </div>
          <TransferenciasRevisao @quantidade="n => qtdTransferencias = n" @decidido="versaoCat++" />
          <ReservasAuto @quantidade="(n) => (qtd = n)" @decidido="versaoCat++" />
          <RevisarCategorias :key="versaoCat" @quantidade="(n) => (qtdCat = n)" />
          <div v-if="qtd === 0 && qtdCat === 0 && qtdTransferencias === 0" class="vazio" data-revisar-vazio>
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
.aviso-titular { display: flex; align-items: center; gap: 10px; padding: 10px 6px 10px 12px; border-radius: 14px; border: 1px solid var(--cor-interface, var(--cor-primaria)); background: var(--cor-fundo-elevado); font-size: 13px; line-height: 1.4; }
.aviso-titular > svg { flex: none; color: var(--cor-interface, var(--cor-primaria)); }
.aviso-titular .ir { flex: none; min-height: 44px; padding: 0 12px; border: 0; border-radius: 10px; background: none; color: var(--cor-interface, var(--cor-primaria)); font: 700 13px var(--fonte-texto); cursor: pointer; }
.aviso-titular .ir:focus-visible { outline: 2px solid var(--cor-primaria); outline-offset: 2px; }
</style>
