// Escolhe o motor do SQLite:
//  1) better-sqlite3 (módulo nativo; ótimo em servidor Linux/Docker), se estiver instalado e funcionando;
//  2) senão, o SQLite que já vem dentro do Node (node:sqlite, Node 22.13+), que não precisa compilar nada.
//     Foi o que resolveu o Windows, onde o better-sqlite3 pedia o Visual Studio para compilar.
// As duas opções expõem a mesma API pequena usada pelo sistema: prepare().get/all/run, exec, pragma, transaction.
let Nativo = null;
if (process.env.FORCAR_NODE_SQLITE !== '1') {
  try {
    Nativo = require('better-sqlite3');
    new Nativo(':memory:').close();
  } catch (e) {
    Nativo = null;
  }
}

function criarAdaptador() {
  const { DatabaseSync } = require('node:sqlite');

  const limpar = (p) => p.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));

  return class Database {
    constructor(arquivo) {
      this.bd = new DatabaseSync(arquivo);
      this.nivel = 0;
    }
    pragma(texto) { this.bd.exec(`PRAGMA ${texto}`); }
    exec(sql) { this.bd.exec(sql); }
    // Função SQL própria (ex.: mes_fin): node:sqlite usa bd.function(nome, fn), como o better-sqlite3.
    function(nome, fn) { this.bd.function(nome, fn); }
    close() { this.bd.close(); }
    prepare(sql) {
      const st = this.bd.prepare(sql);
      return {
        get: (...p) => st.get(...limpar(p)),
        all: (...p) => st.all(...limpar(p)),
        run: (...p) => {
          const r = st.run(...limpar(p));
          return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
        },
      };
    }
    transaction(fn) {
      return (...args) => {
        const nome = `sp_${this.nivel}`;
        this.bd.exec(this.nivel === 0 ? 'BEGIN' : `SAVEPOINT ${nome}`);
        this.nivel++;
        try {
          const r = fn(...args);
          this.nivel--;
          this.bd.exec(this.nivel === 0 ? 'COMMIT' : `RELEASE ${nome}`);
          return r;
        } catch (e) {
          this.nivel--;
          this.bd.exec(this.nivel === 0 ? 'ROLLBACK' : `ROLLBACK TO ${nome}; RELEASE ${nome}`);
          throw e;
        }
      };
    }
  };
}

module.exports = Nativo || criarAdaptador();
