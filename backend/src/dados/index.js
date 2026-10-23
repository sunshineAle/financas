// Camada única de gravação (Fase 0).
//
// TODA escrita nas tabelas de dados passa por aqui. Ela aplica sozinha:
//  - id UUID, criado_em, alterado_em e alterado_por_aparelho;
//  - exclusão suave (excluido_em) com as mesmas cascatas/anulações do esquema antigo;
//  - diário de alterações (tabela diario_alteracoes) com o registro ANTES e DEPOIS.
//
// Leituras continuam com `db.prepare(...)` direto, sempre com "excluido_em IS NULL".
//
// Roda igual no servidor (better-sqlite3 / node:sqlite) e no navegador (sql.js do PWA/demo).
const crypto = require('crypto');
const db = require('../db');
const { TABELAS, RELACOES } = require('./esquema');

const novoId = () => crypto.randomUUID();
const agora = () => new Date().toISOString();

let _aparelho = null;

// Id deste aparelho (gerado na primeira execução e guardado na tabela `aparelho`).
function aparelhoId() {
  if (_aparelho) return _aparelho;
  let linha = db.prepare('SELECT id FROM aparelho ORDER BY criado_em LIMIT 1').get();
  if (!linha) {
    const id = novoId();
    db.prepare('INSERT INTO aparelho (id, nome, criado_em) VALUES (?, ?, ?)').run(id, process.env.NOME_APARELHO || null, agora());
    linha = { id };
  }
  _aparelho = linha.id;
  return _aparelho;
}

function def(tabela) {
  const t = TABELAS[tabela];
  if (!t) throw new Error(`Tabela desconhecida: ${tabela}`);
  return t;
}

function ler(tabela, id) {
  if (id === undefined || id === null) return undefined;
  return db.prepare(`SELECT * FROM ${tabela} WHERE id = ?`).get(String(id));
}

// Cópia do registro para o diário, sem segredos (senha, tokens).
function paraDiario(tabela, linha) {
  if (!linha) return null;
  const copia = { ...linha };
  def(tabela).secretos.forEach((c) => { if (c in copia) copia[c] = '***'; });
  return JSON.stringify(copia);
}

function diario(tabela, registroId, operacao, antes, depois) {
  db.prepare(
    'INSERT INTO diario_alteracoes (id, tabela, registro_id, operacao, antes, depois, aparelho, em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(novoId(), tabela, registroId, operacao, paraDiario(tabela, antes), paraDiario(tabela, depois), aparelhoId(), agora());
}

function validarCampos(tabela, campos) {
  const t = def(tabela);
  Object.keys(campos).forEach((k) => {
    if (campos[k] === undefined) return;
    if (k === 'id' || t.colunas.includes(k)) return;
    throw new Error(`Coluna inválida: ${tabela}.${k}`);
  });
}

const igual = (a, b) => {
  const x = typeof a === 'boolean' ? (a ? 1 : 0) : a;
  const y = typeof b === 'boolean' ? (b ? 1 : 0) : b;
  if (x === y) return true;
  if ((x === null || x === undefined) && (y === null || y === undefined)) return true;
  return typeof x === 'number' && typeof y === 'number' && x === y;
};

// Executa `fn` numa transação (aninhada = só segue na transação de fora; se algo lançar erro, desfaz tudo).
let _nivel = 0;
function transacao(fn) {
  if (_nivel > 0) return fn();
  _nivel++;
  try {
    return db.transaction(fn)();
  } finally {
    _nivel--;
  }
}

// Insere um registro. Devolve o registro completo (com o id UUID gerado).
// Campos omitidos usam o DEFAULT da coluna.
function inserir(tabela, campos = {}) {
  validarCampos(tabela, campos);
  const chaves = Object.keys(campos).filter((k) => campos[k] !== undefined && k !== 'id');
  const id = campos.id ? String(campos.id) : novoId();
  const carimbo = agora();
  const colunas = ['id', 'criado_em', 'alterado_em', 'alterado_por_aparelho', ...chaves];
  const valores = [id, carimbo, carimbo, aparelhoId(), ...chaves.map((k) => campos[k])];
  return transacao(() => {
    db.prepare(`INSERT INTO ${tabela} (${colunas.join(', ')}) VALUES (${colunas.map(() => '?').join(', ')})`).run(...valores);
    const depois = ler(tabela, id);
    diario(tabela, id, 'inserir', null, depois);
    return depois;
  });
}

// Atualiza campos de um registro ativo. Devolve o registro novo (ou null se não existir / estiver excluído).
// Se nada mudou, não grava nada (não mexe em alterado_em nem no diário).
function atualizar(tabela, id, campos = {}) {
  validarCampos(tabela, campos);
  const antes = ler(tabela, id);
  if (!antes || antes.excluido_em) return null;
  const chaves = Object.keys(campos).filter((k) => campos[k] !== undefined && k !== 'id' && !igual(antes[k], campos[k]));
  if (!chaves.length) return antes;
  return transacao(() => {
    db.prepare(
      `UPDATE ${tabela} SET ${chaves.map((k) => `${k} = ?`).join(', ')}, alterado_em = ?, alterado_por_aparelho = ? WHERE id = ?`
    ).run(...chaves.map((k) => campos[k]), agora(), aparelhoId(), antes.id);
    const depois = ler(tabela, antes.id);
    diario(tabela, antes.id, 'atualizar', antes, depois);
    return depois;
  });
}

// Soma `delta` a um campo numérico (ex.: saldo da conta). Devolve o registro novo.
function somar(tabela, id, campo, delta) {
  const atual = ler(tabela, id);
  if (!atual || atual.excluido_em) return null;
  return atualizar(tabela, id, { [campo]: (Number(atual[campo]) || 0) + delta });
}

// Atualiza todos os registros ATIVOS que casam com `onde` (SQL com ?). Devolve quantos casaram.
function atualizarOnde(tabela, onde, params, campos) {
  const ids = db.prepare(`SELECT id FROM ${tabela} WHERE excluido_em IS NULL AND (${onde})`).all(...params).map((l) => l.id);
  transacao(() => ids.forEach((id) => atualizar(tabela, id, campos)));
  return ids.length;
}

// Exclusão suave de um registro, com a cascata do esquema antigo. Devolve true se excluiu.
function excluir(tabela, id) {
  const antes = ler(tabela, id);
  if (!antes || antes.excluido_em) return false;
  transacao(() => {
    const rel = RELACOES[tabela];
    if (rel) {
      (rel.cascata || []).forEach(([filha, coluna]) => excluirOnde(filha, `${coluna} = ?`, [antes.id]));
      (rel.anular || []).forEach(([filha, coluna]) => atualizarOnde(filha, `${coluna} = ?`, [antes.id], { [coluna]: null }));
    }
    const carimbo = agora();
    db.prepare('UPDATE ' + tabela + ' SET excluido_em = ?, alterado_em = ?, alterado_por_aparelho = ? WHERE id = ?')
      .run(carimbo, carimbo, aparelhoId(), antes.id);
    diario(tabela, antes.id, 'excluir', antes, ler(tabela, antes.id));
  });
  return true;
}

// Exclui (suave) todos os ativos que casam com `onde`. Devolve quantos.
function excluirOnde(tabela, onde, params) {
  const ids = db.prepare(`SELECT id FROM ${tabela} WHERE excluido_em IS NULL AND (${onde})`).all(...params).map((l) => l.id);
  transacao(() => ids.forEach((id) => excluir(tabela, id)));
  return ids.length;
}

// Desfaz uma exclusão suave (não refaz a cascata). Útil para "desfazer".
function restaurar(tabela, id) {
  const antes = ler(tabela, id);
  if (!antes || !antes.excluido_em) return null;
  return transacao(() => {
    db.prepare(`UPDATE ${tabela} SET excluido_em = NULL, alterado_em = ?, alterado_por_aparelho = ? WHERE id = ?`).run(agora(), aparelhoId(), antes.id);
    const depois = ler(tabela, antes.id);
    diario(tabela, antes.id, 'restaurar', antes, depois);
    return depois;
  });
}

// Lê um registro ATIVO.
function buscar(tabela, id) {
  const r = ler(tabela, id);
  return r && !r.excluido_em ? r : undefined;
}

module.exports = {
  inserir, atualizar, somar, atualizarOnde, excluir, excluirOnde, restaurar, buscar, transacao,
  novoId, agora, aparelhoId,
  _reiniciarCache() { _aparelho = null; },
};
