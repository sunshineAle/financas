// Saúde do armazenamento local (PWA): pede persistência ao navegador e avisa dos riscos de limpeza de cache.
//   estadoArmazenamento.persistente  true | false | null (desconhecido)
//   estadoArmazenamento.bancoSumiu   true quando o app já foi usado neste aparelho mas o banco local não está mais aqui
//   estadoArmazenamento.risco        texto pronto para mostrar (ou '')
import { reactive, computed } from 'vue';
import { avisar } from './avisos.js';

export const estadoArmazenamento = reactive({ persistente: null, bancoSumiu: false, usoMB: null, cotaMB: null, verificado: false });

export const riscoArmazenamento = computed(() => {
  if (estadoArmazenamento.bancoSumiu) return 'Os dados deste aparelho não foram encontrados (o navegador pode ter limpado o armazenamento). Restaure o seu último backup.';
  if (estadoArmazenamento.persistente === false) return 'O navegador pode apagar os dados do app se faltar espaço. Instale o app na tela inicial e mantenha backups em dia.';
  return '';
});

export async function iniciarArmazenamento() {
  const sinais = (typeof globalThis !== 'undefined' && globalThis.__SF_PWA) || {};
  estadoArmazenamento.bancoSumiu = !!sinais.bancoSumiu;
  try {
    if (navigator.storage && navigator.storage.persisted) {
      let p = await navigator.storage.persisted();
      if (!p && navigator.storage.persist) p = await navigator.storage.persist();
      estadoArmazenamento.persistente = !!p;
    }
    if (navigator.storage && navigator.storage.estimate) {
      const e = await navigator.storage.estimate();
      estadoArmazenamento.usoMB = Math.round((e.usage || 0) / 1048576 * 10) / 10;
      estadoArmazenamento.cotaMB = Math.round((e.quota || 0) / 1048576);
    }
  } catch { /* sem suporte */ }
  estadoArmazenamento.verificado = true;
  if (estadoArmazenamento.bancoSumiu) avisar('Seus dados locais sumiram. Toque para restaurar um backup.', { rota: '/backup?restaurar=1', tipo: 'alerta', duracao: 15000 });
  // Risco de limpeza do cache (persistência negada): aviso discreto e fechável na tela Início (AvisoArmazenamento.vue).
}
