const cron = require('node-cron');
const db = require('../db');
const pluggy = require('../utils/pluggy');
const { sincronizarConexao } = require('../utils/sincronizacaoPluggy');

// Por padrão roda a cada 6 horas. Só funciona se as chaves da Pluggy estiverem no .env.
const PADRAO_CRON = process.env.SINCRONIZACAO_CRON || '0 */6 * * *';

function iniciarSincronizacaoAgendada() {
  if (!pluggy.configurado()) {
    console.log('[cron] Open Finance sem chaves no .env: sincronização automática desligada.');
    return;
  }
  cron.schedule(PADRAO_CRON, async () => {
    const conexoes = db.prepare("SELECT id FROM conexoes_pluggy WHERE excluido_em IS NULL AND status = 'ativa'").all();
    for (const c of conexoes) {
      try {
        await sincronizarConexao(c.id);
        console.log(`[cron] Conexão ${c.id} sincronizada.`);
      } catch (erro) {
        // Uma falhar não derruba as outras
        console.error(`[cron] Falha na conexão ${c.id}:`, erro.message);
      }
    }
  });
  console.log(`[cron] Sincronização automática agendada (${PADRAO_CRON}).`);
}

module.exports = { iniciarSincronizacaoAgendada };
