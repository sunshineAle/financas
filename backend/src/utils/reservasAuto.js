// Reservas automáticas (setor G): reconhece, na descrição de uma transação do extrato, aplicações e resgates que são
// "guardar dinheiro" e não gasto — "Aplicação Caixinha", "Meu Porquinho", "Resgate CDB"... — para sugerir o vínculo a uma meta.
//
// `detectarReservaAutomatica(descricao)` é uma função PURA (sem banco): o setor H (importação) chama na importação e o
// lançamento manual pode chamar ao digitar a descrição. Devolve null se não reconhecer, ou:
//   { produto: 'Caixinha'|'Porquinho'|'CDB'|'RDB', sentido: 'guardar'|'resgatar', tipoInvestimento: 'cdb'|'poupanca',
//     rotulo: 'Aplicação Caixinha', ativo: 'Caixinha' }
// O vínculo em si (confirmar/recusar) é feito pelas rotas /api/reserva/auto/* (ver routes/reserva.js).

const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const PRODUTOS = [
  { produto: 'Caixinha', re: /\bcaixinhas?\b/, tipoInvestimento: 'cdb' },
  { produto: 'Porquinho', re: /\bporquinhos?\b/, tipoInvestimento: 'poupanca' },
  { produto: 'CDB', re: /\bcdbs?\b/, tipoInvestimento: 'cdb' },
  { produto: 'RDB', re: /\brdbs?\b/, tipoInvestimento: 'cdb' },
];

function detectarReservaAutomatica(descricao) {
  const t = semAcento(descricao);
  if (!t) return null;
  const prod = PRODUTOS.find((p) => p.re.test(t));
  if (!prod) return null;
  const resgate = /\b(resgate|resgatou|resgatado|retirada|saque)\b/.test(t);
  const aplicacao = /\b(aplicacao|aplicado|aplicou|aplic|deposito|guardar|guardado|guardou|meu porquinho|nova caixinha)\b/.test(t);
  // "Meu Porquinho" sozinho e "Caixinha" sozinha contam como guardar; "CDB"/"RDB" só com a palavra aplicação ou resgate
  let sentido = null;
  if (resgate) sentido = 'resgatar';
  else if (aplicacao || prod.produto === 'Caixinha' || prod.produto === 'Porquinho') sentido = 'guardar';
  if (!sentido) return null;
  return {
    produto: prod.produto,
    sentido,
    tipoInvestimento: prod.tipoInvestimento,
    rotulo: `${sentido === 'resgatar' ? 'Resgate' : 'Aplicação'} ${prod.produto}`,
    ativo: prod.produto === 'Porquinho' ? 'Meu Porquinho' : prod.produto,
  };
}

module.exports = { detectarReservaAutomatica };
