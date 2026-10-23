const path = require('path');
const fs = require('fs');
const Database = require('./utils/bancoSqlite');

const dataDir = require('./config/destino').pastaDados;
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const arquivo = path.join(dataDir, 'sistema.db');
const db = new Database(arquivo);
db.pragma('journal_mode = WAL');

// Esquema (Fase 0): ids UUID, carimbos de criação/alteração/aparelho e exclusão suave.
// Ver src/dados/esquema.js (tabelas), src/dados/migracao.js (atualiza bancos antigos sozinho, com
// cópia de segurança e conferência de totais) e src/dados/index.js (camada única de gravação).
// Banco novo: cria tudo. Banco antigo (ids numéricos): migra na primeira abertura.
const relatorioMigracao = require('./dados/migracao').iniciar(db, { arquivo });
if (relatorioMigracao) {
  console.log('[banco] Migração para UUID concluída:', JSON.stringify(relatorioMigracao.tabelas), relatorioMigracao.copia ? `cópia: ${relatorioMigracao.copia}` : '');
  (relatorioMigracao.avisos || []).forEach((a) => console.warn('[banco] aviso:', a));
}
db.pragma('foreign_keys = ON');

module.exports = db;
