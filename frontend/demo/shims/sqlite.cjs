// Faz o sql.js (SQLite em JavaScript) se comportar como o better-sqlite3 que
// o backend usa: prepare().get/all/run, exec, pragma e transaction.
const CHAVE = 'demo_sistema_v2';

function paraBinario(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function paraBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const limpar = (p) => p.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'bigint' ? Number(v) : v));

function Database() {
  const SQL = globalThis.__SQL;
  // PWA: o app entrega os bytes lidos do IndexedDB e recebe os bytes a gravar (ver demo/pwa/persistencia.js).
  const gancho = globalThis.__PERSISTENCIA_BANCO || null;
  let salvo = null;
  if (!gancho) { try { salvo = localStorage.getItem(CHAVE); } catch (e) { /* sem storage */ } }
  let bytes = null;
  try { bytes = gancho ? (gancho.bytes || null) : (salvo ? paraBinario(salvo) : null); } catch (e) { bytes = null; }
  const banco = bytes ? new SQL.Database(bytes) : new SQL.Database();
  const veioSalvo = !!bytes;

  const lerLinhas = (sql, params, todas) => {
    const stmt = banco.prepare(sql);
    try {
      stmt.bind(limpar(params));
      const linhas = [];
      while (stmt.step()) {
        linhas.push(stmt.getAsObject());
        if (!todas) break;
      }
      return linhas;
    } finally {
      stmt.free();
    }
  };

  const funcoes = {};
  const reabrir = () => {
    try { banco.exec('PRAGMA foreign_keys = ON'); } catch (e) { /* ok */ }
    Object.entries(funcoes).forEach(([n, f]) => { try { banco.create_function(n, f); } catch (e) { /* ok */ } });
  };
  const api = {
    veioSalvo,
    pragma(texto) { try { banco.exec('PRAGMA ' + texto); } catch (e) { /* ignora */ } },
    exec(sql) { banco.exec(sql); },
    // Funções SQL próprias (ex.: mes_fin, anotação 51), como db.function do better-sqlite3.
    // O export() do sql.js fecha e reabre a conexão e PERDE as funções: por isso ficam guardadas e são registradas de novo.
    function(nome, fn) { funcoes[nome] = fn; banco.create_function(nome, fn); },
    prepare(sql) {
      return {
        get: (...p) => lerLinhas(sql, p.flat(), false)[0],
        all: (...p) => lerLinhas(sql, p.flat(), true),
        run: (...p) => {
          banco.run(sql, limpar(p.flat()));
          const changes = banco.getRowsModified();
          const id = banco.exec('SELECT last_insert_rowid()')[0].values[0][0];
          return { changes, lastInsertRowid: id };
        },
      };
    },
    transaction(fn) {
      return (...args) => {
        banco.exec('BEGIN');
        try {
          const r = fn(...args);
          banco.exec('COMMIT');
          return r;
        } catch (e) {
          try { banco.exec('ROLLBACK'); } catch (e2) { /* ok */ }
          throw e;
        }
      };
    },
    // Bytes do banco inteiro (arquivo SQLite) — usado pelo backup "banco completo" do PWA.
    exportarBytes() {
      const dados = banco.export();
      reabrir();
      return dados;
    },
    salvar() {
      if (gancho) { gancho.agendar(() => api.exportarBytes()); return; }
      try {
        const dados = banco.export(); // reabre o banco e zera os PRAGMAs (e as funções)
        reabrir();
        localStorage.setItem(CHAVE, paraBase64(dados));
      } catch (e) {
        reabrir();
      }
    },
    apagarSalvo() { if (gancho) { gancho.apagar(); return; } try { localStorage.removeItem(CHAVE); } catch (e) { /* ok */ } },
  };
  globalThis.__BANCO_DEMO = api;
  return api;
}
module.exports = Database;
