// Sincroniza uma conexão da Pluggy com o banco do sistema:
//   contas  -> tabela contas (saldo vem do banco)
//   cartões -> tabela cartoes + lancamentos_cartao
//   extrato -> tabela transacoes
//   investimentos -> investimentos_conectados (só consulta por enquanto)
// Nunca duplica: cada registro guarda o id que a Pluggy deu (id_externo).
const crypto = require('crypto');
const db = require('../db');
const dados = require('../dados');
const { categorizarTransacao } = require('./categorizacao');

const DIAS_PRIMEIRA_VEZ = 90;
const ESPERA_MAX_MS = 45000;

const arredondar = (n) => Math.round(n * 100) / 100;
const dia = (iso) => String(iso || '').slice(0, 10);
const diaDoMes = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : d.getUTCDate(); };
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

// Pluggy devolve o valor em módulo; o sentido vem em "type" (DEBIT = saiu, CREDIT = entrou)
function valorComSinal(t) {
  const v = Math.abs(Number(t.amount) || 0);
  return arredondar(t.type === 'DEBIT' ? -v : v);
}

async function esperarItem(pluggy, itemId) {
  const fim = Date.now() + ESPERA_MAX_MS;
  let item = await pluggy.item(itemId);
  while (['UPDATING', 'WAITING_USER_INPUT'].includes(item.status) && Date.now() < fim) {
    await pausa(2500);
    item = await pluggy.item(itemId);
  }
  return item;
}

async function sincronizarConexao(conexaoId, pluggy = require('./pluggy')) {
  const conexao = db.prepare('SELECT * FROM conexoes_pluggy WHERE id = ? AND excluido_em IS NULL').get(String(conexaoId));
  if (!conexao) throw new Error('Conexão não encontrada.');
  const usuarioId = conexao.usuario_id;
  const resumo = { contas: 0, cartoes: 0, transacoesNovas: 0, lancamentosNovos: 0, investimentos: 0, avisos: [] };

  try {
    const item = await esperarItem(pluggy, conexao.item_id);
    const banco = (item.connector && item.connector.name) || conexao.banco || 'Banco';
    if (['LOGIN_ERROR', 'OUTDATED'].includes(item.status)) {
      resumo.avisos.push(`A conexão com ${banco} precisa ser refeita (status ${item.status}).`);
    }
    const desde = conexao.ultima_sincronizacao
      ? new Date(new Date(conexao.ultima_sincronizacao.replace(' ', 'T') + 'Z').getTime() - 5 * 864e5)
      : new Date(Date.now() - DIAS_PRIMEIRA_VEZ * 864e5);
    const desdeISO = desde.toISOString();

    const categorias = db.prepare('SELECT id, nome FROM categorias_orcamento WHERE usuario_id = ? AND excluido_em IS NULL').all(usuarioId);
    const contasPluggy = await pluggy.contas(conexao.item_id);

    for (const c of contasPluggy) {
      const transacoes = await pluggy.transacoes(c.id, desdeISO);
      if (c.type === 'CREDIT') importarCartao(c, transacoes, { conexao, banco, categorias, resumo, usuarioId });
      else importarConta(c, transacoes, { conexao, banco, categorias, resumo, usuarioId });
    }

    // Investimentos: foto atual (substitui a anterior desta conexão)
    let invs = [];
    try { invs = await pluggy.investimentos(conexao.item_id); } catch (e) { resumo.avisos.push('Investimentos indisponíveis: ' + e.message); }
    // A "foto" de investimentos desta conexão é refeita a cada sincronização: atualiza os que continuam,
    // cria os novos e exclui (suave) os que sumiram.
    dados.transacao(() => {
      const atuais = db.prepare('SELECT * FROM investimentos_conectados WHERE conexao_id = ? AND excluido_em IS NULL').all(conexao.id);
      const vistos = new Set();
      for (const i of invs) {
        const campos = {
          usuario_id: usuarioId, conexao_id: conexao.id, id_externo: String(i.id), nome: i.name || 'Investimento',
          tipo: i.type || null, saldo: arredondar(Number(i.balance ?? i.value ?? 0)),
        };
        const existente = atuais.find((a) => a.id_externo === String(i.id) && !vistos.has(a.id));
        if (existente) {
          vistos.add(existente.id);
          dados.atualizar('investimentos_conectados', existente.id, campos);
        } else {
          vistos.add(dados.inserir('investimentos_conectados', campos).id);
        }
      }
      atuais.filter((a) => !vistos.has(a.id)).forEach((a) => dados.excluir('investimentos_conectados', a.id));
    });
    resumo.investimentos = invs.length;

    dados.atualizar('conexoes_pluggy', conexao.id, {
      banco, status: 'ativa', ultimo_erro: null, ultima_sincronizacao: new Date().toISOString().slice(0, 19).replace('T', ' '),
    });
  } catch (e) {
    dados.atualizar('conexoes_pluggy', conexao.id, { ultimo_erro: String(e.message).slice(0, 300) });
    throw e;
  }
  return resumo;
}

function importarConta(c, transacoes, { conexao, banco, categorias, resumo, usuarioId }) {
  const nome = c.name && c.name.toLowerCase().includes(banco.toLowerCase()) ? c.name : `${banco} ${c.name || 'Conta'}`.trim();
  const tipo = c.subtype === 'SAVINGS_ACCOUNT' ? 'poupanca' : 'corrente';
  const saldo = arredondar(Number(c.balance) || 0);

  let conta = db.prepare('SELECT * FROM contas WHERE usuario_id = ? AND id_externo = ? AND excluido_em IS NULL').get(usuarioId, c.id);
  if (!conta) {
    conta = dados.inserir('contas', { usuario_id: usuarioId, nome, tipo, origem: 'conectada', saldo, id_externo: c.id, conexao_id: conexao.id });
    resumo.contas++;
  } else {
    dados.atualizar('contas', conta.id, { saldo, origem: 'conectada', conexao_id: conexao.id });
  }

  const existe = db.prepare('SELECT id FROM transacoes WHERE usuario_id = ? AND id_externo = ? AND excluido_em IS NULL');
  // Se o usuário já lançou à mão a mesma transação (mesma conta, dia e valor), só liga as duas
  const manualIgual = db.prepare("SELECT id FROM transacoes WHERE conta_id = ? AND data = ? AND valor = ? AND origem = 'manual' AND id_externo IS NULL AND excluido_em IS NULL LIMIT 1");

  dados.transacao(() => {
    for (const t of transacoes) {
      if (!t.id || existe.get(usuarioId, t.id)) continue;
      const valor = valorComSinal(t);
      const data = dia(t.date);
      const manual = manualIgual.get(conta.id, data, valor);
      if (manual) { dados.atualizar('transacoes', manual.id, { id_externo: t.id }); continue; }
      const descricao = String(t.description || t.descriptionRaw || 'Transação').trim().slice(0, 200);
      const categoriaId = valor < 0 ? categorizarTransacao(descricao, categorias) : null;
      dados.inserir('transacoes', {
        conta_id: conta.id, usuario_id: usuarioId, categoria_id: categoriaId, descricao, valor, data,
        categorizacao_automatica: categoriaId ? 1 : 0, origem: 'conectada', id_externo: t.id,
      });
      if (categoriaId) dados.somar('categorias_orcamento', categoriaId, 'gasto_atual', Math.abs(valor));
      resumo.transacoesNovas++;
    }
  });
}

function importarCartao(c, transacoes, { conexao, banco, categorias, resumo, usuarioId }) {
  const cd = c.creditData || {};
  const nome = c.name && c.name.toLowerCase().includes(banco.toLowerCase()) ? c.name : `${banco} ${c.name || 'Cartão'}`.trim();
  const fecha = diaDoMes(cd.balanceCloseDate);
  const vence = diaDoMes(cd.balanceDueDate);

  let cartao = db.prepare('SELECT * FROM cartoes WHERE usuario_id = ? AND id_externo = ? AND excluido_em IS NULL').get(usuarioId, c.id);
  if (!cartao) {
    cartao = dados.inserir('cartoes', {
      usuario_id: usuarioId, nome, limite: cd.creditLimit ?? null, dia_fechamento: fecha || 1, dia_vencimento: vence || 10,
      origem: 'conectada', id_externo: c.id, conexao_id: conexao.id,
    });
    resumo.cartoes++;
  } else {
    dados.atualizar('cartoes', cartao.id, {
      limite: cd.creditLimit ?? cartao.limite, dia_fechamento: fecha || cartao.dia_fechamento,
      dia_vencimento: vence || cartao.dia_vencimento, origem: 'conectada', conexao_id: conexao.id,
    });
  }

  const existe = db.prepare('SELECT id FROM lancamentos_cartao WHERE usuario_id = ? AND id_externo = ? AND excluido_em IS NULL');

  dados.transacao(() => {
    for (const t of transacoes) {
      // Só compras (DEBIT). Pagamento de fatura e estornos (CREDIT) não entram como compra.
      if (!t.id || t.type !== 'DEBIT' || existe.get(usuarioId, t.id)) continue;
      const m = t.creditCardMetadata || {};
      let descricao = String(t.description || 'Compra no cartão').trim().slice(0, 200);
      if (m.totalInstallments > 1) descricao += ` (${m.installmentNumber || '?'}/${m.totalInstallments})`;
      const categoriaId = categorizarTransacao(descricao, categorias);
      dados.inserir('lancamentos_cartao', {
        cartao_id: cartao.id, usuario_id: usuarioId, compra_id: 'pluggy-' + crypto.randomUUID(), descricao,
        valor: Math.abs(arredondar(Number(t.amount) || 0)), data_compra: dia(t.date), parcela_numero: 1, total_parcelas: 1,
        categoria_id: categoriaId, id_externo: t.id,
      });
      resumo.lancamentosNovos++;
    }
  });
}

// Registra um banco conectado (itemId vindo do widget) e já sincroniza
function registrarConexao(usuarioId, itemId) {
  if (!/^[0-9a-f-]{20,}$/i.test(String(itemId || ''))) throw new Error('itemId inválido.');
  const atual = db.prepare('SELECT * FROM conexoes_pluggy WHERE usuario_id = ? AND item_id = ? AND excluido_em IS NULL').get(usuarioId, itemId);
  if (atual) return dados.atualizar('conexoes_pluggy', atual.id, { status: 'ativa' });
  return dados.inserir('conexoes_pluggy', { usuario_id: usuarioId, item_id: itemId });
}

module.exports = { sincronizarConexao, registrarConexao, valorComSinal };
