// Regras de categorização (setor B, onda 5): "Padaria do José" -> Mercado.
// Uma regra casa por trecho do NOME (sem acento/maiúscula) e, opcionalmente, por faixa de VALOR e por CONTA.
// Quando mais de uma casa, vale a mais específica (com conta/valor, depois a de trecho mais longo).
const db = require('../db');
const dados = require('../dados');

const arredondar = (n) => Math.round((Number(n) || 0) * 100) / 100;
const normalizar = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

function regrasAtivas(usuarioId, tipo) {
  return db.prepare("SELECT * FROM regras_categorias WHERE usuario_id = ? AND ativa = 1 AND tipo = ? AND excluido_em IS NULL").all(usuarioId, tipo);
}

function casa(regra, { descricao, valor, contaId }) {
  const nome = normalizar(descricao);
  const padrao = normalizar(regra.padrao);
  if (!padrao || !nome.includes(padrao)) return false;
  const v = Math.abs(Number(valor) || 0);
  if (regra.valor_min !== null && regra.valor_min !== undefined && v < regra.valor_min - 0.005) return false;
  if (regra.valor_max !== null && regra.valor_max !== undefined && v > regra.valor_max + 0.005) return false;
  if (regra.conta_id && contaId && String(regra.conta_id) !== String(contaId)) return false;
  if (regra.conta_id && !contaId) return false;
  return true;
}

const peso = (r) => (r.conta_id ? 1000 : 0) + (r.valor_min !== null || r.valor_max !== null ? 500 : 0) + normalizar(r.padrao).length;

// Devolve a regra vencedora (ou null) para uma transação.
function acharRegra(usuarioId, tipo, transacao) {
  const candidatas = regrasAtivas(usuarioId, tipo).filter((r) => casa(r, transacao));
  if (!candidatas.length) return null;
  return candidatas.sort((a, b) => peso(b) - peso(a))[0];
}

function registrarUso(regra) {
  try { dados.atualizar('regras_categorias', regra.id, { aplicacoes: (regra.aplicacoes || 0) + 1 }); } catch { /* contador é só informativo */ }
}

// Transações antigas que a regra (existente ou a criar) mudaria de categoria.
// Fora: ignoradas/transferências/estornos. Já na categoria-alvo não conta.
function afetadas(usuarioId, regra) {
  const ehSaida = regra.tipo !== 'entrada';
  const linhas = [];
  const txs = db.prepare(
    `SELECT id, conta_id, descricao, valor, categoria_id, categoria_receita FROM transacoes
     WHERE usuario_id = ? AND excluido_em IS NULL AND ignorada = 0 AND tipo_mov IS NULL AND ${ehSaida ? 'valor < 0' : 'valor > 0'}`
  ).all(usuarioId);
  for (const t of txs) {
    if (!casa(regra, { descricao: t.descricao, valor: t.valor, contaId: t.conta_id })) continue;
    if (ehSaida ? t.categoria_id === regra.categoria_id : (t.categoria_receita || null) === (regra.categoria_receita || null)) continue;
    linhas.push({ tabela: 'transacoes', ...t });
  }
  if (ehSaida) {
    // compras de cartão (cada parcela é uma linha com o mesmo nome)
    const lcs = db.prepare(
      "SELECT id, descricao, valor, categoria_id FROM lancamentos_cartao WHERE usuario_id = ? AND excluido_em IS NULL AND tipo_mov IS NULL"
    ).all(usuarioId);
    for (const l of lcs) {
      if (!casa(regra, { descricao: l.descricao, valor: l.valor, contaId: null })) continue; // regra com conta não vale para cartão
      if (l.categoria_id === regra.categoria_id) continue;
      linhas.push({ tabela: 'lancamentos_cartao', ...l });
    }
  }
  return linhas;
}

// Aplica a regra às transações antigas (ajusta o gasto das categorias). Devolve quantas mudaram.
function aplicarNasAntigas(usuarioId, regra) {
  const linhas = afetadas(usuarioId, regra);
  dados.transacao(() => {
    for (const l of linhas) {
      if (l.tabela === 'transacoes') {
        if (regra.tipo === 'entrada') {
          dados.atualizar('transacoes', l.id, { categoria_receita: regra.categoria_receita || null, categorizacao_automatica: 1 });
        } else {
          if (l.categoria_id) dados.somar('categorias_orcamento', l.categoria_id, 'gasto_atual', -Math.abs(l.valor));
          dados.somar('categorias_orcamento', regra.categoria_id, 'gasto_atual', Math.abs(l.valor));
          dados.atualizar('transacoes', l.id, { categoria_id: regra.categoria_id, categorizacao_automatica: 1 });
        }
      } else {
        dados.atualizar('lancamentos_cartao', l.id, { categoria_id: regra.categoria_id });
      }
    }
  });
  return linhas.length;
}

module.exports = { normalizar, acharRegra, casa, afetadas, aplicarNasAntigas, registrarUso, arredondar };
