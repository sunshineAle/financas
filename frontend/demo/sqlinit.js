// Carrega o SQLite em JavaScript (sql.js) antes de qualquer outro módulo.
import initSqlJs from 'sql.js/dist/sql-asm.js';

globalThis.__SQL = await initSqlJs();
