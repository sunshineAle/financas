const express = require('express');
const { listarCategoriasReceita } = require('../utils/categoriasReceita');
const db = require('../db');
const { exigirAutenticacao } = require('../middleware/auth');

const cartoesRouter = require('./cartoes');
const custosFixosRouter = require('./custosFixos');
const { calcularPatrimonio } = require('./patrimonio');
const { chaveDaData: chaveDaDataFin } = require('../utils/mesFinanceiro');
const { semPagamentoDeFatura, parcelasCartao, chaveHoje: chaveMesHoje, entradasCartao } = require('../utils/cartaoMeses');

const router = express.Router();

// Meses de (hoje - passados) até (hoje + futuros)
function mesesEntre(passados, futuros) {
  const meses = [];
  const agora = new Date();
  for (let i = passados; i >= -futuros; i--) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    meses.push({
      chave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      mes: d.toLocaleDateString('pt-BR', { month: 'short' }),
    });
  }
  return meses;
}

router.get('/', exigirAutenticacao, (req, res) => {
  const usuarioId = req.usuario.id;

  // Patrimônio líquido (decisão de 23/10/2026) = contas + Reserva/investimentos − faturas abertas − dívidas.
  // Cálculo ÚNICO em routes/patrimonio.js (anotação 60): o mesmo número do detalhe "Patrimônio" (GET /api/patrimonio).
  const pat = calcularPatrimonio(usuarioId);
  const { totalContas, totalDividas, reservaLiberdade, totalFaturasAbertas, patrimonioLiquido } = pat;
  const patrimonioConfere = pat.confere;

  // Top 3 dívidas por urgência (risco de negativação primeiro) e, dentro
  // da mesma urgência, maior taxa de juros primeiro (avalanche) — mesma
  // lógica da tela de Dívidas.
  const dividasPrioritarias = db
    .prepare(
      `SELECT id, nome, saldo AS valor, urgencia FROM dividas WHERE usuario_id = ? AND arquivada = 0 AND excluido_em IS NULL
       ORDER BY CASE urgencia WHEN 'vermelho' THEN 0 WHEN 'amarelo' THEN 1 ELSE 2 END,
                taxa_juros IS NULL, taxa_juros DESC
       LIMIT 3`
    )
    .all(usuarioId);

  // Fluxo de caixa real dos últimos 6 meses (vem vazio até haver contas
  // conectadas com transações sincronizadas — ver Etapa 5).
  // Faturas de cartão ainda por pagar viram saídas previstas no mês do vencimento
  const faturasAPagar = cartoesRouter.faturasAPagar(usuarioId);
  // Compras no cartão (decisão de 22/10/2026): cada parcela pesa nas SAÍDAS do mês dela (igual à tela de
  // Transações) e o pagamento da fatura fica de fora dos totais. Parcelas de meses futuros viram a
  // projeção ("saídas previstas"), sem contar duas vezes: o que já é do mês atual/passado está nas saídas.
  const hojeChave = chaveMesHoje();
  const parcelas = parcelasCartao(usuarioId);
  const cartaoPorMes = {}; // meses até o atual
  const previstoPorMes = {}; // meses futuros
  parcelas.forEach((p) => {
    const alvo = p.mes <= hojeChave ? cartaoPorMes : previstoPorMes;
    alvo[p.mes] = (alvo[p.mes] || 0) + p.valor;
  });
  const cartaoNoPeriodo = (tam, chave, so = null) =>
    parcelas.filter((p) => p.mes <= hojeChave && p.mes.slice(0, tam) === chave && (so ? so(p) : true));
  const ultimoPrevisto = Object.keys(previstoPorMes).sort().pop();
  const hojeData = new Date();
  // Mês financeiro de hoje (anotação 51): com o início no 5º dia útil, dia 3 ainda é o mês anterior.
  const chaveHoje = chaveDaDataFin(`${hojeData.getFullYear()}-${String(hojeData.getMonth() + 1).padStart(2, '0')}-${String(hojeData.getDate()).padStart(2, '0')}`);
  let futuros = 0;
  if (ultimoPrevisto && ultimoPrevisto > chaveHoje) {
    const [ay, am] = ultimoPrevisto.split('-').map(Number);
    futuros = Math.min(12, (ay - hojeData.getFullYear()) * 12 + (am - (hojeData.getMonth() + 1)));
  }
  const meses = mesesEntre(11, futuros);
  const aportesPorMes = Object.fromEntries(
    db
      .prepare(
        `SELECT substr(h.data, 1, 7) AS chave, SUM(h.valor) AS total FROM historico_aportes h
         JOIN reserva_liberdade r ON r.id = h.reserva_id WHERE r.usuario_id = ? AND h.excluido_em IS NULL AND r.excluido_em IS NULL AND h.operacao <> 'saldo_inicial' GROUP BY chave`
      )
      .all(usuarioId)
      .map((l) => [l.chave, l.total])
  );
  const linhasFluxo = db
    .prepare(
      `SELECT mes_fin(data) AS chave,
              SUM(CASE WHEN valor > 0 THEN valor ELSE 0 END) AS entradas,
              SUM(CASE WHEN valor < 0 THEN -valor ELSE 0 END) AS saidas
       FROM transacoes WHERE usuario_id = ? AND excluido_em IS NULL AND ignorada = 0 AND ${semPagamentoDeFatura()} GROUP BY chave`
    )
    .all(usuarioId);
  const porChave = Object.fromEntries(linhasFluxo.map((l) => [l.chave, l]));
  // Anotação 61: cashback recebido no cartão é entrada (meses até o atual)
  const cashbackCartao = entradasCartao(usuarioId).filter((e) => e.mes <= hojeChave);
  cashbackCartao.forEach((e) => { (porChave[e.mes] ||= { chave: e.mes, entradas: 0, saidas: 0 }).entradas += e.valor; });
  const fluxoCaixa = meses.map((m) => ({
    chave: m.chave,
    mes: m.mes,
    entradas: porChave[m.chave]?.entradas || 0,
    saidas: (porChave[m.chave]?.saidas || 0) + (cartaoPorMes[m.chave] || 0),
    saidasCartao: Math.round((cartaoPorMes[m.chave] || 0) * 100) / 100,
    reserva: Math.round((aportesPorMes[m.chave] || 0) * 100) / 100,
    saidasPrevistas: Math.round((previstoPorMes[m.chave] || 0) * 100) / 100,
    futuro: m.chave > chaveHoje,
  }));
  // Mês exibido: o pedido em ?mes=AAAA-MM (dentro do gráfico) ou o mês atual
  // Aceita também qualquer outro mês (AAAA-MM) e o ano inteiro (AAAA), para o seletor de mês compartilhado
  const pedido = String(req.query.mes || '');
  const chaveAtual = /^\d{4}(-(0[1-9]|1[0-2]))?$/.test(pedido) ? pedido : chaveHoje;
  const tamChave = chaveAtual.length;
  const ehAno = tamChave === 4;
  const ehMesAtual = chaveAtual === chaveHoje;
  const itensFaturas = ehMesAtual
    ? faturasAPagar.filter((f) => f.aberta)
    : faturasAPagar.filter((f) => f.vence.slice(0, tamChave) === chaveAtual);
  const faturasCartoes = {
    total: Math.round(itensFaturas.reduce((s, f) => s + f.total, 0) * 100) / 100,
    itens: itensFaturas,
  };

  // Gasto de cada categoria no mês exibido, somando as transações do mês (o acumulado da categoria não zera na virada)
  const gastoDoMes = Object.fromEntries(
    db
      .prepare(
        `SELECT categoria_id AS id, SUM(-valor) AS total FROM transacoes
         WHERE usuario_id = ? AND excluido_em IS NULL AND ignorada = 0 AND valor < 0 AND categoria_id IS NOT NULL AND substr(mes_fin(data), 1, ?) = ?
           AND ${semPagamentoDeFatura()}
         GROUP BY categoria_id`
      )
      .all(usuarioId, tamChave, chaveAtual)
      .map((l) => [l.id, l.total])
  );
  cartaoNoPeriodo(tamChave, chaveAtual, (p) => p.categoria_id).forEach((p) => {
    gastoDoMes[p.categoria_id] = (gastoDoMes[p.categoria_id] || 0) + p.valor;
  });
  const categoriasMes = db
    .prepare('SELECT id, nome, icone, cor, teto_mensal, gasto_atual FROM categorias_orcamento WHERE usuario_id = ? AND excluido_em IS NULL ORDER BY criado_em ASC, rowid ASC')
    .all(usuarioId)
    .map((c) => ({ ...c, gasto_atual: Math.round((gastoDoMes[c.id] || 0) * 100) / 100 }));

  // Entradas do mês exibido por categoria de receita (para a pizza de entradas)
  const corReceitaPorNome = Object.fromEntries(listarCategoriasReceita(usuarioId).map((c) => [c.nome, c.cor]));
  const entradasPorCategoria = db
    .prepare(
      `SELECT COALESCE(categoria_receita, 'Sem categoria') AS nome, SUM(valor) AS valor
       FROM transacoes WHERE usuario_id = ? AND excluido_em IS NULL AND ignorada = 0 AND valor > 0 AND substr(mes_fin(data), 1, ?) = ?
       GROUP BY nome ORDER BY valor DESC`
    )
    .all(usuarioId, tamChave, chaveAtual)
    .map((e) => ({ ...e, cor: corReceitaPorNome[e.nome] || null }));
  const cashbackPeriodo = cashbackCartao.filter((e) => e.mes.slice(0, tamChave) === chaveAtual).reduce((s, e) => s + e.valor, 0);
  if (cashbackPeriodo > 0) {
    const ja = entradasPorCategoria.find((e) => e.nome === 'Cashback');
    if (ja) ja.valor += cashbackPeriodo; else entradasPorCategoria.push({ nome: 'Cashback', valor: cashbackPeriodo, cor: corReceitaPorNome.Cashback || null });
    entradasPorCategoria.sort((a, b) => b.valor - a.valor);
  }

  // Dívidas que pedem atenção (vermelho e amarelo), para destacar junto das despesas
  const dividasUrgentes = db
    .prepare(
      `SELECT id, nome, saldo AS valor, urgencia FROM dividas
       WHERE usuario_id = ? AND excluido_em IS NULL AND arquivada = 0 AND urgencia IN ('vermelho', 'amarelo') AND saldo > 0
       ORDER BY CASE urgencia WHEN 'vermelho' THEN 0 ELSE 1 END, saldo DESC`
    )
    .all(usuarioId);

  // Alertas calculados de verdade, a partir de sinais que o sistema
  // realmente tem: categorias perto/acima do teto e dívidas em risco.
  const alertas = [];
  const categoriasEstouradas = categoriasMes.filter((c) => c.teto_mensal > 0 && c.gasto_atual >= c.teto_mensal * 0.9);
  categoriasEstouradas.forEach((c) => {
    const percentual = Math.round((c.gasto_atual / c.teto_mensal) * 100);
    alertas.push({
      tipo: 'alerta',
      mensagem: `A categoria "${c.nome}" está em ${percentual}% do teto mensal.`,
    });
  });

  const dividasEmRisco = db
    .prepare("SELECT nome FROM dividas WHERE usuario_id = ? AND excluido_em IS NULL AND arquivada = 0 AND urgencia = 'vermelho'")
    .all(usuarioId);
  dividasEmRisco.forEach((d) => {
    alertas.push({ tipo: 'alerta', mensagem: `A dívida "${d.nome}" está marcada como risco de negativação.` });
  });

  // Destaque da Reserva de Liberdade: total investido, aportes do mês exibido
  // e a meta mais próxima de ser atingida (ou a única que existir).
  let reservaResumo = null;
  const reservaRow = db.prepare('SELECT id, valor_atual FROM reserva_liberdade WHERE usuario_id = ? AND excluido_em IS NULL').get(usuarioId);
  if (reservaRow) {
    const aportesMes = db
      .prepare("SELECT COALESCE(SUM(valor), 0) AS t FROM historico_aportes WHERE reserva_id = ? AND excluido_em IS NULL AND operacao <> 'saldo_inicial' AND substr(data, 1, ?) = ?")
      .get(reservaRow.id, tamChave, chaveAtual).t;
    const semMeta = db
      .prepare('SELECT COALESCE(SUM(valor), 0) AS t FROM historico_aportes WHERE reserva_id = ? AND excluido_em IS NULL AND meta_id IS NULL')
      .get(reservaRow.id).t;
    const atingidoPorMeta = Object.fromEntries(
      db
        .prepare('SELECT meta_id, SUM(valor) AS t FROM historico_aportes WHERE reserva_id = ? AND excluido_em IS NULL AND meta_id IS NOT NULL GROUP BY meta_id')
        .all(reservaRow.id)
        .map((l) => [l.meta_id, l.t])
    );
    const metasRes = db
      .prepare('SELECT id, nome, icone, valor_meta FROM metas_reserva WHERE reserva_id = ? AND excluido_em IS NULL AND valor_meta > 0 ORDER BY rowid')
      .all(reservaRow.id)
      .map((m) => {
        const atingido = Math.round((atingidoPorMeta[m.id] || 0) * 100) / 100;
        return { ...m, atingido, pct: Math.min(100, Math.round((atingido / m.valor_meta) * 100)), completa: atingido >= m.valor_meta };
      });
    // a mais próxima: entre as não concluídas, a de maior percentual; se todas concluídas, a de maior percentual mesmo
    const abertas = metasRes.filter((m) => !m.completa);
    const pool = abertas.length ? abertas : metasRes;
    const proxima = pool.sort((a, b) => b.pct - a.pct)[0] || null;
    reservaResumo = {
      total: Math.round(reservaRow.valor_atual * 100) / 100,
      aportesMes: Math.round(aportesMes * 100) / 100,
      aportesSemMeta: Math.round(semMeta * 100) / 100,
      quantidadeMetas: metasRes.length,
      proximaMeta: proxima,
    };
  }

  // Resumo do período exibido (mês ou ano inteiro), para o orbe e o resumo do mês
  const somaPeriodo = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN valor > 0 THEN valor ELSE 0 END), 0) AS entradas,
              COALESCE(SUM(CASE WHEN valor < 0 THEN -valor ELSE 0 END), 0) AS saidas
       FROM transacoes WHERE usuario_id = ? AND excluido_em IS NULL AND ignorada = 0 AND substr(mes_fin(data), 1, ?) = ?
         AND ${semPagamentoDeFatura()}`
    )
    .get(usuarioId, tamChave, chaveAtual);
  somaPeriodo.saidas += cartaoNoPeriodo(tamChave, chaveAtual).reduce((s, p) => s + p.valor, 0);
  somaPeriodo.entradas += cashbackPeriodo;
  const previstasPeriodo = Object.entries(previstoPorMes)
    .filter(([k]) => k > chaveHoje && k.slice(0, tamChave) === chaveAtual) // só o que ainda vai acontecer
    .reduce((s, [, v]) => s + v, 0);
  const periodo = {
    chave: chaveAtual,
    tipo: ehAno ? 'ano' : 'mes',
    entradas: Math.round(somaPeriodo.entradas * 100) / 100,
    saidas: Math.round(somaPeriodo.saidas * 100) / 100,
    saidasCartao: Math.round(cartaoNoPeriodo(tamChave, chaveAtual).reduce((s, p) => s + p.valor, 0) * 100) / 100,
    saidasPrevistas: Math.round(previstasPeriodo * 100) / 100,
    futuro: !ehAno && chaveAtual > chaveHoje,
    meses: ehAno ? 12 : 1,
  };
  // Homologação 1.0, seção 1: mês futuro no filtro = "Previsto para …" no próprio Saldo do mês, pela mesma regra
  // da data da compra (entradas previstas − Custo de vida − parcelas do cartão − parcelas de dívidas − já lançado).
  if (periodo.futuro) periodo.previsao = custosFixosRouter.previsaoDoMes(usuarioId, chaveAtual);
  // O aviso "mantendo as dívidas atuais…" usa essa mesma previsão (primeiro mês com Saldo do mês previsto negativo).
  const negativo = custosFixosRouter.primeiroMesNegativo(usuarioId, 6);
  if (negativo) alertas.push({ tipo: 'previsao', mes: negativo.mes, mensagem: `Mantendo as dívidas atuais, o Saldo do mês fica negativo em ${negativo.rotulo.replace(/ de \d{4}$/, '')}.` });

  // "Seus saldos" (homologação 1.0, seção 1 — decisão final 29/10 21h59): os quatro números que formam o Patrimônio,
  // dos mesmos blocos do detalhe Ativos | Passivos. Contas + Guardado − Faturas − Dívidas = Patrimônio líquido.
  const totalBloco = (lista, chaves) => Math.round(lista.filter((b) => chaves.includes(b.chave)).reduce((s, b) => s + (b.total || 0), 0) * 100) / 100;
  const saldos = {
    contas: totalBloco(pat.ativos, ['contas']),
    guardado: totalBloco(pat.ativos, ['reserva', 'renda_fixa', 'renda_variavel']),
    faturas: totalBloco(pat.passivos, ['faturas']),
    dividas: totalBloco(pat.passivos, ['dividas', 'cheque_especial']),
    patrimonio: patrimonioLiquido,
  };

  res.json({
    periodo,
    saldos,
    reservaResumo,
    patrimonioLiquido,
    patrimonioConfere,
    totalContas,
    totalDividas,
    totalFaturasAbertas,
    reservaLiberdade,
    dividasPrioritarias,
    fluxoCaixa,
    mes: chaveAtual,
    categoriasMes,
    entradasPorCategoria,
    dividasUrgentes,
    faturasCartoes,
    alertas,
  });
});

module.exports = router;
