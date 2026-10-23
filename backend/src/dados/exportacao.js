// Exportação / importação do estado inteiro (base do arquivo .sfin; ver CONTRATO-SFIN.md).
//
//  exportarEstado()                       -> objeto JSON { formato, versao_esquema, aparelho, tabelas, ... }
//  importarEstado(arquivo, { modo, ... }) -> 'substituir' | 'mesclar' (+ simular: true = só a prévia)
//  resumoEstado()                         -> contagens das linhas ativas
//
// Não leva: usuarios (senha), tokens_open_finance, aparelho (o id do aparelho vai no cabeçalho).
// Roda no servidor e dentro do navegador (PWA), sem HTTP.
const db = require('../db');
const dados = require('./index');
const { TABELAS, ORDEM, VERSAO_ESQUEMA, COLUNAS_DIARIO } = require('./esquema');

const FORMATO = 'sfin-dados';
const TABELAS_EXPORTADAS = ORDEM.filter((n) => TABELAS[n].exporta);
const TODAS_NO_ARQUIVO = [...TABELAS_EXPORTADAS, 'diario_alteracoes'];

function usuarioLocal() {
  return db.prepare('SELECT id, email, nome FROM usuarios WHERE excluido_em IS NULL ORDER BY rowid LIMIT 1').get() || null;
}

function contagemAtivas() {
  const c = {};
  TABELAS_EXPORTADAS.forEach((n) => { c[n] = db.prepare(`SELECT COUNT(*) AS n FROM ${n} WHERE excluido_em IS NULL`).get().n; });
  return c;
}

function resumoEstado() {
  return { versao_esquema: VERSAO_ESQUEMA, aparelho: { id: dados.aparelhoId() }, contagens: contagemAtivas() };
}

function exportarEstado() {
  const tabelas = {};
  TABELAS_EXPORTADAS.forEach((n) => {
    tabelas[n] = db.prepare(`SELECT * FROM ${n} ORDER BY rowid`).all().map((l) => ({ ...l }));
  });
  tabelas.diario_alteracoes = db.prepare('SELECT * FROM diario_alteracoes ORDER BY rowid').all().map((l) => ({ ...l }));
  const u = usuarioLocal();
  return {
    formato: FORMATO,
    versao_esquema: VERSAO_ESQUEMA,
    exportado_em: new Date().toISOString(),
    aparelho: { id: dados.aparelhoId() },
    usuario: u ? { email: u.email, nome: u.nome } : null,
    contagens: contagemAtivas(),
    tabelas,
  };
}

class ErroImportacao extends Error {}

function validar(arquivo) {
  if (!arquivo || typeof arquivo !== 'object') throw new ErroImportacao('Arquivo de backup inválido.');
  if (arquivo.formato !== FORMATO) throw new ErroImportacao('Este arquivo não é um backup do Dagda Capital.');
  if (!Number.isInteger(arquivo.versao_esquema)) throw new ErroImportacao('Arquivo de backup sem versão de esquema.');
  if (arquivo.versao_esquema > VERSAO_ESQUEMA) {
    throw new ErroImportacao('Este backup foi feito por uma versão mais nova do app. Atualize o app para restaurá-lo.');
  }
  if (!arquivo.tabelas || typeof arquivo.tabelas !== 'object') throw new ErroImportacao('Arquivo de backup sem dados.');
  for (const nome of TODAS_NO_ARQUIVO) {
    const linhas = arquivo.tabelas[nome];
    if (linhas === undefined) continue;
    if (!Array.isArray(linhas)) throw new ErroImportacao(`Backup inválido: "${nome}" deveria ser uma lista.`);
    linhas.forEach((l, i) => {
      if (!l || typeof l !== 'object' || typeof l.id !== 'string' || !l.id) {
        throw new ErroImportacao(`Backup inválido: ${nome}[${i}] sem id.`);
      }
    });
  }
}

const valorSql = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : (v !== null && typeof v === 'object' ? JSON.stringify(v) : v));

function inserirLinha(nome, colunas, linha) {
  const cols = colunas.filter((c) => c in linha);
  db.prepare(`INSERT INTO ${nome} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...cols.map((c) => valorSql(linha[c])));
}

function atualizarLinha(nome, colunas, linha) {
  const cols = colunas.filter((c) => c !== 'id' && c in linha);
  db.prepare(`UPDATE ${nome} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...cols.map((c) => valorSql(linha[c])), linha.id);
}

/**
 * Importa um objeto exportado por exportarEstado().
 * opcoes: { modo: 'substituir' | 'mesclar', simular?: boolean, usuarioId?: string }
 * Devolve { ok, modo, simulado, contagens: {tabela: linhasGravadasOuAlteradas}, detalhes: {tabela: {novos, atualizados, mantidos, removidos}} }.
 */
function importarEstado(arquivo, opcoes = {}) {
  const modo = opcoes.modo === 'substituir' ? 'substituir' : opcoes.modo === 'mesclar' ? 'mesclar' : null;
  if (!modo) throw new ErroImportacao('Modo inválido: use "substituir" ou "mesclar".');
  validar(arquivo);

  const usuario = opcoes.usuarioId ? { id: opcoes.usuarioId } : usuarioLocal();
  if (!usuario) throw new ErroImportacao('Não há usuário neste aparelho para receber os dados.');
  const usuarioId = usuario.id;

  const resultado = { ok: true, modo, simulado: !!opcoes.simular, contagens: {}, detalhes: {} };
  const detalhe = (n) => (resultado.detalhes[n] ||= { novos: 0, atualizados: 0, mantidos: 0, removidos: 0 });

  const executar = () => {
    // singletons (uma linha ativa por usuário): se o arquivo trouxe outro id para o mesmo papel, usa o id local
    const remapa = {}; // tabela -> { idDoArquivo: idLocal }
    const trocarUsuario = (nome, linha) => {
      const l = { ...linha };
      if (TABELAS[nome].colunas.includes('usuario_id')) l.usuario_id = usuarioId;
      return l;
    };

    if (modo === 'substituir') {
      [...TABELAS_EXPORTADAS].reverse().forEach((n) => {
        detalhe(n).removidos = db.prepare(`SELECT COUNT(*) AS n FROM ${n}`).get().n;
        db.exec(`DELETE FROM ${n}`);
      });
      db.exec('DELETE FROM diario_alteracoes');
    }

    for (const nome of TABELAS_EXPORTADAS) {
      const t = TABELAS[nome];
      const linhas = arquivo.tabelas[nome] || [];
      const colunas = t.todas;
      for (const original of linhas) {
        const linha = trocarUsuario(nome, original);
        // ligações que apontam para um singleton remapeado
        Object.entries(t.fk).forEach(([c, pai]) => {
          if (remapa[pai] && linha[c] && remapa[pai][linha[c]]) linha[c] = remapa[pai][linha[c]];
        });
        const local = db.prepare(`SELECT * FROM ${nome} WHERE id = ?`).get(linha.id);
        const d = detalhe(nome);
        if (!local) {
          if (t.unica && !linha.excluido_em) {
            const existente = db.prepare(`SELECT * FROM ${nome} WHERE ${t.unica} = ? AND excluido_em IS NULL`).get(linha[t.unica]);
            if (existente) {
              (remapa[nome] ||= {})[linha.id] = existente.id;
              if ((linha.alterado_em || '') > (existente.alterado_em || '')) {
                atualizarLinha(nome, colunas, { ...linha, id: existente.id });
                d.atualizados++;
              } else d.mantidos++;
              continue;
            }
          }
          inserirLinha(nome, colunas, linha);
          d.novos++;
        } else if ((linha.alterado_em || '') > (local.alterado_em || '')) {
          atualizarLinha(nome, colunas, linha);
          d.atualizados++;
        } else {
          d.mantidos++;
        }
      }
    }

    // diário: unido por id (nunca sobrescreve)
    const dd = detalhe('diario_alteracoes');
    for (const linha of arquivo.tabelas.diario_alteracoes || []) {
      if (db.prepare('SELECT 1 AS x FROM diario_alteracoes WHERE id = ?').get(linha.id)) { dd.mantidos++; continue; }
      inserirLinha('diario_alteracoes', COLUNAS_DIARIO, linha);
      dd.novos++;
    }

    Object.entries(resultado.detalhes).forEach(([n, d]) => { resultado.contagens[n] = d.novos + d.atualizados; });
    if (opcoes.simular) throw Object.assign(new Error('simulacao'), { simulacao: true });

    // registro da própria importação
    db.prepare('INSERT INTO diario_alteracoes (id, tabela, registro_id, operacao, antes, depois, aparelho, em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(dados.novoId(), '*', 'importacao', 'importacao', null, JSON.stringify({ modo, de: arquivo.aparelho || null, contagens: resultado.contagens }), dados.aparelhoId(), dados.agora());
  };

  try {
    dados.transacao(executar);
  } catch (e) {
    if (!e.simulacao) throw e;
  }
  return resultado;
}

module.exports = { exportarEstado, importarEstado, resumoEstado, ErroImportacao, FORMATO };
