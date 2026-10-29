// Anotação 55 — Saldo inicial e Ajuste de saldo das CONTAS (cartões ficam de fora). JS puro: roda no servidor e no navegador.
//
// Regra do Contador: o saldo inicial e o ajuste NÃO são entrada nem saída. São lançamentos na conta com ignorada = 2
// ("fora dos totais: Entradas, Saídas e Saldo do mês não contam, mas o saldo da conta vale") e tipo_mov próprio:
//   - 'saldo_inicial' ... "Saldo inicial" na data de início (um por conta);
//   - 'ajuste_saldo' .... "Ajuste de saldo" com a diferença entre o saldo real informado e o do app (conciliação).
// O saldo da conta é a coluna contas.saldo, mexida por delta (dados.somar) em cada lançamento: aqui também, uma vez só
// (o lançamento é o registro; a coluna é o total). Só contas manuais: nas conectadas o saldo vem do banco.
const db = require('../db');
const dados = require('../dados');
const { arredondar, dataValida } = require('./faturas');

const hojeStr = () => new Date().toLocaleDateString('sv-SE', { timeZone: process.env.APP_TIMEZONE || 'America/Sao_Paulo' });
const erro = (m, s = 400) => Object.assign(new Error(m), { status: s });
const LIMITE_FALTANDO = 50; // diferença acima disso sugere lançamentos faltando

function somarSaldo(conta, delta) {
  if (conta && conta.origem === 'manual' && delta) dados.somar('contas', conta.id, 'saldo', arredondar(delta));
}

function saldoInicialDa(contaId) {
  return db.prepare("SELECT * FROM transacoes WHERE conta_id = ? AND tipo_mov = 'saldo_inicial' AND excluido_em IS NULL ORDER BY rowid DESC LIMIT 1").get(contaId) || null;
}

// Cria, muda ou apaga o "Saldo inicial" da conta. { data: 'AAAA-MM-DD', valor: número (pode ser negativo) }.
// Valor 0 apaga o lançamento (o saldo volta). Devolve o lançamento (ou null).
function definirSaldoInicial(usuarioId, conta, { data, valor }) {
  if (!conta || conta.origem !== 'manual') throw erro('O saldo inicial vale só para contas cadastradas à mão.');
  const v = arredondar(Number(valor) || 0);
  const dia = String(data || '').slice(0, 10) || hojeStr();
  if (!dataValida(dia)) throw erro('Data do saldo inicial inválida.');
  if (dia > hojeStr()) throw erro('A data do saldo inicial não pode ser no futuro.');
  const atual = saldoInicialDa(conta.id);
  let reg = null;
  dados.transacao(() => {
    if (atual) {
      if (!v) { dados.excluir('transacoes', atual.id); somarSaldo(conta, -atual.valor); return; }
      reg = dados.atualizar('transacoes', atual.id, { valor: v, data: dia });
      somarSaldo(conta, v - atual.valor);
    } else if (v) {
      reg = dados.inserir('transacoes', {
        conta_id: conta.id, usuario_id: usuarioId, descricao: 'Saldo inicial', valor: v, data: dia,
        origem: 'manual', ignorada: 2, tipo_mov: 'saldo_inicial', rotulo_mov: 'Saldo inicial',
      });
      somarSaldo(conta, v);
    }
  });
  return reg;
}

// Conciliação: o usuário informa o saldo REAL de hoje; o app lança a diferença como "Ajuste de saldo".
// Devolve { diferenca, ajuste, desde, faltando } — `desde` = último ponto em que o saldo estava certo (ajuste anterior ou
// saldo inicial; sem nenhum, a primeira transação) e `faltando` = diferença maior que R$ 50.
function ajustarSaldo(usuarioId, conta, saldoReal) {
  if (!conta || conta.origem !== 'manual') throw erro('Contas conectadas recebem o saldo do banco.');
  const real = Number(saldoReal);
  if (!Number.isFinite(real)) throw erro('Informe o saldo de hoje.');
  const atual = db.prepare('SELECT saldo FROM contas WHERE id = ?').get(conta.id).saldo;
  const diferenca = arredondar(real - atual);
  const ponto = db.prepare("SELECT MAX(substr(data, 1, 10)) AS d FROM transacoes WHERE conta_id = ? AND excluido_em IS NULL AND tipo_mov IN ('saldo_inicial', 'ajuste_saldo')").get(conta.id).d
    || db.prepare('SELECT MIN(substr(data, 1, 10)) AS d FROM transacoes WHERE conta_id = ? AND excluido_em IS NULL').get(conta.id).d
    || hojeStr();
  if (Math.abs(diferenca) < 0.005) return { diferenca: 0, ajuste: null, desde: ponto, faltando: false };
  let ajuste = null;
  dados.transacao(() => {
    ajuste = dados.inserir('transacoes', {
      conta_id: conta.id, usuario_id: usuarioId, descricao: 'Ajuste de saldo', valor: diferenca, data: hojeStr(),
      origem: 'manual', ignorada: 2, tipo_mov: 'ajuste_saldo', rotulo_mov: 'Ajuste de saldo',
    });
    somarSaldo(conta, diferenca);
  });
  return { diferenca, ajuste, desde: ponto, faltando: Math.abs(diferenca) > LIMITE_FALTANDO };
}

module.exports = { saldoInicialDa, definirSaldoInicial, ajustarSaldo, LIMITE_FALTANDO };
