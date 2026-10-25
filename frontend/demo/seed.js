// Dados de exemplo, criados pelas próprias rotas do sistema (então passam
// pelas mesmas regras: saldo, categorias, faturas, parcelas...).
const pad = (n) => String(n).padStart(2, '0');
const hoje = new Date();
function dia(mesesAtras, d) {
  const x = new Date(hoje.getFullYear(), hoje.getMonth() - mesesAtras, 1);
  const ultimo = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(Math.min(d, ultimo))}`;
}
const iso = (d) => d.toISOString().slice(0, 10);

export async function semearDados(chamar, db) {
  const post = async (url, corpo) => {
    const r = await chamar('POST', url, corpo);
    if (r.status >= 400) console.warn('seed falhou', url, r.corpo);
    return JSON.parse(r.corpo);
  };

  const nubank = await post('/api/contas', { nome: 'Nubank', tipo: 'corrente', saldo: 1200, icone: '🟣' });
  const caju = await post('/api/contas', { nome: 'Caju', tipo: 'beneficio', saldo: 480, icone: '🍽️' });
  await post('/api/contas', { nome: 'Carteira', tipo: 'dinheiro', saldo: 120, icone: '👛' });

  const cats = {};
  for (const [nome, teto, icone] of [['Casa', 1600, 'cat-grupo-casa'], ['Alimentação', 900, 'cat-grupo-alimentacao'], ['Transporte', 350, 'cat-grupo-transporte'], ['Lazer', 400, 'cat-grupo-lazer'], ['Saúde', 300, 'cat-grupo-saude']]) {
    cats[nome] = await post('/api/categorias', { nome, tetoMensal: teto, icone });
  }

  // 3 meses de movimentações: salário, aluguel, mercado, transporte, lazer
  for (let m = 2; m >= 0; m--) {
    const variacao = m * 17;
    const lista = [
      ['entrada', 'Salário', 4200, dia(m, 5), null, 'Salário'],
      ['saida', 'Aluguel (Moradia)', 1500, dia(m, 8), cats.Casa.id],
      ['saida', 'Mercado Extra', 310 + variacao, dia(m, 10), cats['Alimentação'].id],
      ['saida', 'Mercado do mês', 280 + variacao, dia(m, 22), cats['Alimentação'].id],
      ['saida', 'Uber e ônibus', 140 + variacao / 2, dia(m, 12), cats.Transporte.id],
      ['saida', 'Cinema e jantar', 120 + variacao, dia(m, 16), cats.Lazer.id],
      ['saida', 'Farmácia', 65, dia(m, 18), cats['Saúde'].id],
    ];
    if (m === 0) lista.push(['entrada', 'Freela de design', 650, dia(0, Math.min(hoje.getDate(), 9)), null, 'Renda extra / freela']);
    for (const [tipo, descricao, valor, data, categoriaId, categoriaReceita] of lista) {
      if (data > iso(hoje)) continue;
      await post('/api/transacoes', {
        tipo, descricao, valor, data, contaId: nubank.id, categoriaId, categoriaReceita,
      });
    }
  }
  await post('/api/transacoes', { tipo: 'entrada', descricao: 'Vale Caju', valor: 480, data: dia(0, 1), contaId: caju.id, categoriaReceita: 'Benefício' });

  db.exec("UPDATE transacoes SET subcategoria = 'Supermercado' WHERE descricao = 'Mercado Extra'; UPDATE transacoes SET subcategoria = 'Compras do mês' WHERE descricao = 'Mercado do mês'; UPDATE transacoes SET subcategoria = 'Aplicativo' WHERE descricao LIKE 'Uber%'; UPDATE transacoes SET subcategoria = 'Lazer com amigos' WHERE descricao LIKE 'Cinema%';");

  // O gasto de cada categoria no orçamento reflete só o mês atual.
  db.exec(`UPDATE categorias_orcamento SET gasto_atual = COALESCE((
      SELECT SUM(-valor) FROM transacoes
      WHERE categoria_id = categorias_orcamento.id AND valor < 0
        AND strftime('%Y-%m', data) = strftime('%Y-%m', 'now', 'localtime')), 0)`);

  // Dívidas
  const dNu = await post('/api/dividas', { nome: 'Cheque especial', saldo: 1850, taxaJuros: 12.5, urgencia: 'vermelho' });
  const dEmp = await post('/api/dividas', { nome: 'Empréstimo pessoal', saldo: 6200, taxaJuros: 3.2, urgencia: 'amarelo' });
  const dCel = await post('/api/dividas', { nome: 'Financiamento do celular', saldo: 1420, taxaJuros: 0, urgencia: 'verde' });
  await post(`/api/dividas/${dEmp.id}/pagamentos`, { valor: 450 });
  await post(`/api/dividas/${dEmp.id}/pagamentos`, { valor: 450 });
  await post(`/api/dividas/${dNu.id}/pagamentos`, { valor: 200 });

  // Cartões, com compras à vista e parceladas (algumas ligadas a dívidas)
  const cNu = await post('/api/cartoes', { nome: 'Nubank Roxinho', icone: '🟣', contaId: nubank.id, limite: 6000, diaFechamento: 28, diaVencimento: 5 });
  const cAm = await post('/api/cartoes', { nome: 'Americanas', icone: '🛒', contaId: nubank.id, limite: 1500, diaFechamento: 10, diaVencimento: 20 });
  await post(`/api/cartoes/${cNu.id}/lancamentos`, { descricao: 'Celular', valor: 1800, parcelas: 12, dataCompra: dia(4, 12), dividaId: dCel.id });
  await post(`/api/cartoes/${cNu.id}/lancamentos`, { descricao: 'Geladeira', valor: 2400, parcelas: 10, dataCompra: dia(2, 15) });
  await post(`/api/cartoes/${cNu.id}/lancamentos`, { descricao: 'Mercado Extra', valor: 320, dataCompra: dia(0, Math.max(1, hoje.getDate() - 3)) });
  await post(`/api/cartoes/${cAm.id}/lancamentos`, { descricao: 'Tênis de corrida', valor: 450, parcelas: 3, dataCompra: dia(1, 20) });
  await post(`/api/cartoes/${cAm.id}/lancamentos`, { descricao: 'Presente de aniversário', valor: 130, dataCompra: dia(0, Math.max(1, hoje.getDate() - 6)) });

  // Reserva de Liberdade: duas metas, cada aporte com a sua meta de destino
  const r0 = JSON.parse((await chamar('PUT', '/api/reserva', { meta: 12000, nome: 'Reserva de Liberdade', icone: '🛡️' })).corpo);
  const mReserva = r0.metas[0].id;
  const mesPrazo = new Date(hoje.getFullYear(), hoje.getMonth() + 8, 1);
  const r1 = await post('/api/reserva/metas', { nome: 'Viagem', icone: '✈️', tipoInvestimento: 'cdb', valorMeta: 5000, prazo: iso(mesPrazo) });
  const mViagem = r1.metas.find((m) => m.nome === 'Viagem').id;
  await post('/api/reserva/aportes', { tipo: 'cdb', ativo: 'CDB Inter 110% CDI', valor: 800, data: dia(2, 5), metaId: mViagem });
  await post('/api/reserva/aportes', { tipo: 'tesouro', ativo: 'Tesouro Selic 2029', valor: 400, data: dia(0, 7), metaId: mReserva });
  // Ações e FIIs têm liquidez lenta: ficam só em Investimentos (metas só aceitam liquidez rápida), saindo da conta da corretora
  const corretora = await post('/api/contas', { nome: 'XP Investimentos', tipo: 'corretora', saldo: 2000 });
  await post('/api/investimentos/operacoes', { tipo: 'compra', nome: 'PETR4', ticker: 'PETR4', tipoAtivo: 'acoes', corretoraContaId: corretora.id, cotas: 20, preco: 36.4, data: dia(1, 5) });
  await post('/api/investimentos/operacoes', { tipo: 'compra', nome: 'PETR4', ticker: 'PETR4', tipoAtivo: 'acoes', corretoraContaId: corretora.id, cotas: 10, preco: 38.1, data: dia(0, 3) });
  await post('/api/investimentos/operacoes', { tipo: 'compra', nome: 'MXRF11', ticker: 'MXRF11', tipoAtivo: 'fii', corretoraContaId: corretora.id, cotas: 60, preco: 9.8, data: dia(0, 5) });
  await post('/api/investimentos/operacoes', { tipo: 'provento', nome: 'MXRF11', ticker: 'MXRF11', tipoAtivo: 'fii', corretoraContaId: corretora.id, preco: 0.09, data: dia(0, 6) });
}
