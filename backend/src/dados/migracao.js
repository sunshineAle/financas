// Migração automática para a Fase 0 (ids UUID + carimbos + exclusão suave), feita ao abrir o banco.
//
//  1. Banco novo (vazio)  -> só cria o esquema atual.
//  2. Banco no esquema antigo (ids numéricos) ->
//       a) completa colunas que faltarem (legado.js);
//       b) faz CÓPIA DE SEGURANÇA (arquivo .bak ao lado do banco; no navegador, o gancho db.copiaSeguranca);
//       c) numa única transação: cria as tabelas novas, copia tudo trocando cada id por um UUID e
//          remapeando as ligações entre tabelas, apaga as antigas e renomeia as novas;
//       d) CONFERE contagens, saldos, totais por categoria, totais de faturas e ligações entre tabelas,
//          comparando com a "fotografia" tirada antes. Se algo não bater, lança erro e a transação inteira
//          é desfeita (o banco fica exatamente como estava).
//  3. Banco já no esquema atual -> só garante que as tabelas existem.
const crypto = require('crypto');
const fs = require('fs');
const { prepararLegado } = require('./legado');
const faturas = require('../utils/faturas');
const { TABELAS, ORDEM, criarEsquema, sqlTabela, SQL_AGORA, VERSAO_ESQUEMA } = require('./esquema');

const SUFIXO = '__n';

function tabelaExiste(db, nome) {
  return !!db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?").get(nome);
}
function colunasDe(db, tabela) {
  return db.prepare(`PRAGMA table_info(${tabela})`).all();
}
const idEhNumerico = (db, tabela) => {
  if (!tabelaExiste(db, tabela)) return false;
  const id = colunasDe(db, tabela).find((c) => c.name === 'id');
  return !!id && /INT/i.test(String(id.type));
};

function precisaMigrar(db) {
  return idEhNumerico(db, 'usuarios') || idEhNumerico(db, 'contas');
}

// '2026-10-02 13:00:00' / '2026-10-02' -> ISO UTC; qualquer outra coisa -> null
function paraIso(valor) {
  const t = String(valor || '').trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?Z?$/.test(t)) {
    const [d, h] = t.replace('Z', '').split(/[ T]/);
    const [hh, frac] = h.split('.');
    return `${d}T${hh}.${(frac || '0').padEnd(3, '0').slice(0, 3)}Z`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return `${t}T00:00:00.000Z`;
  return null;
}

const arred = (n) => Math.round((Number(n) || 0) * 1e6) / 1e6;

// ---- Fotografia de conferência -------------------------------------------------------------
// `chave(tabela, id)` devolve a chave ESTÁVEL de um registro (o id numérico antigo), para que a
// fotografia de antes (ids antigos) e a de depois (UUIDs) possam ser comparadas.
function fotografia(db, chave) {
  const f = { contagens: {}, totais: {}, mapas: {} };
  for (const nome of ORDEM) {
    if (!tabelaExiste(db, nome)) continue;
    f.contagens[nome] = db.prepare(`SELECT COUNT(*) AS n FROM ${nome}`).get().n;
  }
  const soma = (sql) => arred(db.prepare(sql).get().t);
  f.totais.saldoContas = soma('SELECT COALESCE(SUM(saldo), 0) AS t FROM contas');
  f.totais.transacoes = soma('SELECT COALESCE(SUM(valor), 0) AS t FROM transacoes');
  f.totais.dividas = soma('SELECT COALESCE(SUM(saldo), 0) AS t FROM dividas');
  f.totais.pagamentos = soma('SELECT COALESCE(SUM(valor), 0) AS t FROM historico_pagamentos');
  f.totais.reserva = soma('SELECT COALESCE(SUM(valor_atual), 0) AS t FROM reserva_liberdade');
  f.totais.aportes = soma('SELECT COALESCE(SUM(valor), 0) AS t FROM historico_aportes');
  f.totais.lancamentos = soma('SELECT COALESCE(SUM(valor), 0) AS t FROM lancamentos_cartao');
  f.totais.faturasPagas = soma('SELECT COALESCE(SUM(valor), 0) AS t FROM faturas_pagas');

  const mapa = (nome, linhas, fn) => {
    const m = {};
    linhas.forEach((l) => { const [k, v] = fn(l); m[k] = (m[k] || 0) + v; });
    f.mapas[nome] = Object.fromEntries(Object.entries(m).map(([k, v]) => [k, arred(v)]));
  };
  mapa('saldoPorConta', db.prepare('SELECT id, saldo FROM contas').all(), (l) => [chave('contas', l.id), l.saldo]);
  mapa('gastoAtualPorCategoria', db.prepare('SELECT id, gasto_atual FROM categorias_orcamento').all(), (l) => [chave('categorias_orcamento', l.id), l.gasto_atual]);
  mapa('totalPorCategoria', db.prepare('SELECT categoria_id, valor FROM transacoes').all(),
    (l) => [l.categoria_id ? chave('categorias_orcamento', l.categoria_id) : '-', l.valor]);
  mapa('qtdPorConta', db.prepare('SELECT conta_id FROM transacoes').all(), (l) => [chave('contas', l.conta_id), 1]);
  mapa('saldoDivida', db.prepare('SELECT id, saldo FROM dividas').all(), (l) => [chave('dividas', l.id), l.saldo]);
  mapa('pagamentosPorDivida', db.prepare('SELECT divida_id, valor FROM historico_pagamentos').all(), (l) => [chave('dividas', l.divida_id), l.valor]);
  mapa('aportesPorMeta', db.prepare('SELECT meta_id, valor FROM historico_aportes').all(),
    (l) => [l.meta_id ? chave('metas_reserva', l.meta_id) : '-', l.valor]);

  // Faturas de cada cartão (mesma regra de utils/faturas.js usada nas telas)
  const cartoes = db.prepare('SELECT id, dia_fechamento, dia_vencimento FROM cartoes').all();
  const porCartao = Object.fromEntries(cartoes.map((c) => [c.id, c]));
  const linhas = db.prepare('SELECT cartao_id, data_compra, parcela_numero, valor FROM lancamentos_cartao').all();
  mapa('faturasPorCartao', linhas, (l) => {
    const c = porCartao[l.cartao_id];
    const fat = c ? faturas.faturaDaParcela(l.data_compra, c.dia_fechamento, c.dia_vencimento, l.parcela_numero) : '?';
    return [`${chave('cartoes', l.cartao_id)}|${fat}`, l.valor];
  });
  mapa('lancamentosPorDivida', db.prepare('SELECT divida_id, valor FROM lancamentos_cartao').all(),
    (l) => [l.divida_id ? chave('dividas', l.divida_id) : '-', l.valor]);
  return f;
}

function compararFotografias(antes, depois) {
  const problemas = [];
  const comparar = (rotulo, a, b) => {
    const chaves = new Set([...Object.keys(a), ...Object.keys(b)]);
    chaves.forEach((k) => {
      const x = a[k] === undefined ? 0 : a[k];
      const y = b[k] === undefined ? 0 : b[k];
      if (Math.abs(x - y) > 1e-4) problemas.push(`${rotulo}[${k}]: antes ${x}, depois ${y}`);
    });
  };
  comparar('contagem', antes.contagens, depois.contagens);
  comparar('total', antes.totais, depois.totais);
  Object.keys(antes.mapas).forEach((m) => comparar(m, antes.mapas[m], depois.mapas[m] || {}));
  return problemas;
}

// Toda ligação (coluna que aponta para outra tabela) precisa apontar para um registro que existe.
function conferirLigacoes(db) {
  const problemas = [];
  for (const nome of ORDEM) {
    const t = TABELAS[nome];
    for (const [coluna, pai] of Object.entries(t.fk)) {
      const n = db.prepare(`SELECT COUNT(*) AS n FROM ${nome} WHERE ${coluna} IS NOT NULL AND ${coluna} NOT IN (SELECT id FROM ${pai})`).get().n;
      if (n) problemas.push(`${nome}.${coluna}: ${n} ligação(ões) para ${pai} que não existe`);
    }
  }
  return problemas;
}

function copiaDeArquivo(db, arquivo) {
  try {
    if (!arquivo || typeof fs.copyFileSync !== 'function') return null;
    try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch (e) { /* sem WAL */ }
    const selo = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const destino = `${arquivo}.pre-uuid-${selo}.bak`;
    fs.copyFileSync(arquivo, destino);
    return destino;
  } catch (e) {
    throw new Error(`Não foi possível fazer a cópia de segurança antes da migração: ${e.message}`);
  }
}

function migrarParaUuid(db, opcoes = {}) {
  prepararLegado(db);

  // cópia de segurança (arquivo no servidor; gancho opcional no navegador)
  const relatorio = { copia: null, tabelas: {}, avisos: [] };
  relatorio.copia = copiaDeArquivo(db, opcoes.arquivo);
  if (typeof db.copiaSeguranca === 'function') {
    try { db.copiaSeguranca('pre-uuid'); relatorio.copia = relatorio.copia || 'gancho:pre-uuid'; } catch (e) { /* opcional */ }
  }

  const existentes = ORDEM.filter((n) => tabelaExiste(db, n));
  const temId = {};
  existentes.forEach((n) => { temId[n] = colunasDe(db, n).some((c) => c.name === 'id'); });
  const chaveAntiga = (linha, nome) => String(temId[nome] ? linha.id : linha._rid);

  // ids antigos -> UUID, e o inverso (para a conferência)
  const mapa = {};
  const inverso = {};
  const linhasAntigas = {};
  existentes.forEach((n) => {
    mapa[n] = {};
    inverso[n] = {};
    linhasAntigas[n] = db.prepare(`SELECT rowid AS _rid, * FROM ${n} ORDER BY rowid`).all();
    linhasAntigas[n].forEach((l) => {
      const novo = crypto.randomUUID();
      mapa[n][chaveAntiga(l, n)] = novo;
      inverso[n][novo] = chaveAntiga(l, n);
    });
  });

  const antes = fotografia(db, (tabela, id) => String(id));
  const aparelho = crypto.randomUUID();

  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      db.exec(`CREATE TABLE IF NOT EXISTS aparelho (id TEXT PRIMARY KEY NOT NULL, nome TEXT, criado_em TEXT NOT NULL DEFAULT (${SQL_AGORA}))`);
      const jaTem = db.prepare('SELECT id FROM aparelho LIMIT 1').get();
      const aparelhoUsado = jaTem ? jaTem.id : aparelho;
      if (!jaTem) db.prepare('INSERT INTO aparelho (id, nome, criado_em) VALUES (?, NULL, ?)').run(aparelho, new Date().toISOString());

      existentes.forEach((n) => db.exec(sqlTabela(n, SUFIXO)));

      const agora = new Date().toISOString();
      for (const n of existentes) {
        const t = TABELAS[n];
        const colunas = t.todas;
        const ins = db.prepare(`INSERT INTO ${n}${SUFIXO} (${colunas.join(', ')}) VALUES (${colunas.map(() => '?').join(', ')})`);
        const colunasAntigas = new Set(colunasDe(db, n).map((c) => c.name));
        let orfaosAnulados = 0;
        for (const l of linhasAntigas[n]) {
          const reg = {};
          for (const c of t.colunas) {
            let v = colunasAntigas.has(c) ? l[c] : undefined;
            const pai = t.fk[c];
            if (pai && v !== undefined && v !== null) {
              const novo = mapa[pai] && mapa[pai][String(v)];
              if (!novo) {
                const naoNulo = /NOT NULL/i.test(t.cols.find((d) => d.split(/\s+/)[0] === c));
                if (naoNulo) throw new Error(`${n} #${chaveAntiga(l, n)} aponta para ${pai} #${v}, que não existe`);
                orfaosAnulados++;
                v = null;
              } else v = novo;
            }
            if (v === undefined) {
              // coluna que o banco antigo não tinha: usa o valor padrão literal da definição, se houver
              const def = t.cols.find((d) => d.split(/\s+/)[0] === c);
              const m = def.match(/DEFAULT\s+('([^']*)'|-?\d+(\.\d+)?)/i);
              v = m ? (m[2] !== undefined ? m[2] : Number(m[1])) : null;
            }
            reg[c] = v;
          }
          const criado = paraIso(l.criado_em) || paraIso(l.data) || paraIso(l.atualizado_em) || agora;
          const valores = colunas.map((c) => {
            if (c === 'id') return mapa[n][chaveAntiga(l, n)];
            if (c === 'criado_em' || c === 'alterado_em') return criado;
            if (c === 'alterado_por_aparelho') return aparelhoUsado;
            if (c === 'excluido_em') return null;
            return reg[c];
          });
          ins.run(...valores);
        }
        relatorio.tabelas[n] = linhasAntigas[n].length;
        if (orfaosAnulados) relatorio.avisos.push(`${n}: ${orfaosAnulados} ligação(ões) para registros que não existiam foram esvaziadas`);
      }

      existentes.forEach((n) => {
        db.exec(`DROP TABLE ${n}`);
        db.exec(`ALTER TABLE ${n}${SUFIXO} RENAME TO ${n}`);
      });
      // tabelas do esquema que não existiam no banco antigo
      criarEsquema(db);

      // ---- Conferência: se algo não bater, o erro desfaz a transação inteira ----
      const depois = fotografia(db, (tabela, id) => (inverso[tabela] && inverso[tabela][id]) || `?${id}`);
      const problemas = [...compararFotografias(antes, depois), ...conferirLigacoes(db)];
      if (problemas.length) {
        throw new Error(`conferência não bateu: ${problemas.slice(0, 8).join('; ')}${problemas.length > 8 ? ` (+${problemas.length - 8})` : ''}`);
      }
      relatorio.conferencia = { contagens: depois.contagens, totais: depois.totais };

      db.prepare('INSERT INTO diario_alteracoes (id, tabela, registro_id, operacao, antes, depois, aparelho, em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(crypto.randomUUID(), '*', 'esquema', 'migracao', null, JSON.stringify({ para: `esquema ${VERSAO_ESQUEMA} (UUID)`, tabelas: relatorio.tabelas, avisos: relatorio.avisos }), aparelhoUsado, new Date().toISOString());
    })();
  } catch (e) {
    throw new Error(`A migração do banco para UUID falhou e foi desfeita (o banco ficou como estava${relatorio.copia ? `; cópia em ${relatorio.copia}` : ''}): ${e.message}`);
  } finally {
    db.pragma('foreign_keys = ON');
  }
  return relatorio;
}

// Ponto de entrada (chamado por db.js): cria ou atualiza o esquema.
function iniciar(db, opcoes = {}) {
  if (precisaMigrar(db)) return migrarParaUuid(db, opcoes);
  criarEsquema(db);
  return null;
}

module.exports = { iniciar, precisaMigrar, migrarParaUuid, fotografia, compararFotografias };
