<script setup>
// Aviso discreto e fechável na tela Início (PWA): o navegador pode apagar os dados do app (cache/armazenamento não
// persistente) ou os dados locais já sumiram. Lê o estado de services/armazenamento.js. Fechar esconde por 7 dias
// (se os dados sumiram, esconde só até recarregar). Ação: ir ao Backup.
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { ShieldAlert, X } from 'lucide-vue-next';
import { estadoArmazenamento, riscoArmazenamento } from '../services/armazenamento.js';

const CHAVE = 'sf:aviso-cache-fechado';
const SETE_DIAS = 7 * 86400000;
const router = useRouter();

function fechadoRecentemente() {
  try { const t = Number(localStorage.getItem(CHAVE) || 0); return t && Date.now() - t < SETE_DIAS; } catch { return false; }
}
const fechadoAgora = ref(false);
const grave = computed(() => estadoArmazenamento.bancoSumiu);
const visivel = computed(() => !!riscoArmazenamento.value && !fechadoAgora.value && (grave.value || !fechadoRecentemente()));

function fechar() {
  fechadoAgora.value = true;
  if (!grave.value) { try { localStorage.setItem(CHAVE, String(Date.now())); } catch { /* sem armazenamento */ } }
}
</script>

<template>
  <aside v-if="visivel" class="aviso-armazenamento" :class="{ grave }" role="status">
    <ShieldAlert :size="20" :stroke-width="1.8" class="ic" aria-hidden="true" />
    <div class="tx">
      <b>{{ grave ? 'Seus dados locais não foram encontrados' : 'Seus dados podem ser apagados pelo navegador' }}</b>
      <span>{{ riscoArmazenamento }}</span>
      <button type="button" class="ir" @click="router.push(grave ? '/backup?restaurar=1' : '/backup')">{{ grave ? 'Restaurar um backup' : 'Fazer backup agora' }}</button>
    </div>
    <button type="button" class="fechar" aria-label="Fechar aviso" @click="fechar"><X :size="16" :stroke-width="2" /></button>
  </aside>
</template>

<style scoped>
.aviso-armazenamento { display: flex; align-items: flex-start; gap: 10px; margin: 0 0 12px; padding: 10px 8px 10px 12px; border-radius: 14px; border: 1px solid var(--cor-borda); background: var(--cor-fundo-elevado); color: var(--cor-texto); font-size: 13px; line-height: 1.4; }
.aviso-armazenamento.grave { border-color: var(--cor-grave); background: var(--cor-grave-fundo); }
.ic { flex: none; margin-top: 1px; color: var(--cor-alerta); }
.grave .ic { color: var(--cor-grave); }
.tx { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.tx b { font-size: 13.5px; font-weight: 600; }
.tx span { color: var(--cor-texto-suave); }
.ir { align-self: flex-start; margin-top: 4px; min-height: 36px; padding: 0 2px; background: none; border: none; color: var(--cor-primaria); font-family: var(--fonte-texto); font-size: 13px; font-weight: 600; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
.fechar { flex: none; width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center; border: none; background: none; border-radius: 10px; color: var(--cor-texto-suave); cursor: pointer; }
.fechar:hover { background: var(--cor-realce); }
</style>
