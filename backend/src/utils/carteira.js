// Carteira de investimentos (setor G): regras e contas PURAS (sem banco), para rodar igual no servidor e no navegador.
//  - TIPOS_INVESTIMENTO / liquidez: só ativos de liquidez RÁPIDA podem ser vinculados a metas;
//  - consolidarAtivo: cotas, preço médio (correto com vendas), custo, proventos e resultado realizado;
//  - rendimentoCdi: rendimento SIMULADO pelo CDI (dados públicos do Bacen) sobre o que foi guardado.

// Tipos de investimento. Para incluir um novo basta acrescentar aqui (e a liquidez padrão logo abaixo).
const TIPOS_INVESTIMENTO = {
  cdb: 'CDB',
  cdi: 'CDI / Renda fixa',
  lci: 'LCI',
  lca: 'LCA',
  tesouro: 'Tesouro Direto',
  poupanca: 'Poupança / Porquinho',
  debentures: 'Debêntures',
  cri_cra: 'CRI / CRA',
  coe: 'COE',
  previdencia: 'Previdência privada',
  fundo: 'Fundos de investimento',
  fii: 'Fundos imobiliários (FIIs)',
  fiagro: 'Fiagro',
  etf: 'ETFs',
  bdr: 'BDRs',
  acoes: 'Ações',
  cripto: 'Criptomoedas',
  ouro: 'Ouro',
};

// Liquidez rápida = pode virar dinheiro em até 1 dia útil sem risco de preço relevante: pode entrar em METAS.
const TIPOS_LIQUIDEZ_RAPIDA = ['cdb', 'cdi', 'lci', 'lca', 'tesouro', 'poupanca', 'fundo'];
const liquidezPadrao = (tipo) => (TIPOS_LIQUIDEZ_RAPIDA.includes(tipo) ? 'rapida' : 'lenta');
const MSG_SO_LIQUIDEZ_RAPIDA =
  'Metas aceitam só investimentos de liquidez rápida (CDB/RDB com liquidez diária, Tesouro Selic, LCI/LCA, poupança, fundos DI). Ações, FIIs, ETFs e cripto ficam só em Investimentos.';

// Tipos de operação
const OPERACOES_ENTRADA = ['compra', 'guardar']; // põem dinheiro no ativo
const OPERACOES_SAIDA = ['venda', 'resgatar']; // tiram dinheiro do ativo
const OPERACOES_RENDA = ['provento', 'rendimento']; // não mudam a posição em cotas
const TIPOS_OPERACAO = [...OPERACOES_ENTRADA, ...OPERACOES_SAIDA, ...OPERACOES_RENDA];

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const r6 = (n) => Math.round(Number(n) * 1e6) / 1e6;

function ordenar(ops) {
  return [...ops].sort((a, b) => String(a.data).slice(0, 10).localeCompare(String(b.data).slice(0, 10)) || String(a.criado_em || '').localeCompare(String(b.criado_em || '')));
}

// Posição de um ativo a partir das operações (qualquer ordem). Devolve:
//  cotas, custo (o que ainda está investido), preco_medio (custo / cotas, só com cotas), valor_atual (custo + rendimentos),
//  proventos (soma), rendimentos (soma), realizado (lucro/prejuízo das vendas), compras/vendas/proventos (linhas) e
//  `erro` se alguma venda/resgate passa do que havia (datas fora de ordem, p. ex.).
function consolidarAtivo(operacoes) {
  let cotas = 0;
  let custo = 0;
  let rend = 0; // rendimento ainda dentro da posição (renda fixa)
  let realizado = 0;
  let proventos = 0;
  let rendimentos = 0;
  let totalComprado = 0;
  let totalVendido = 0;
  let erro = null;
  const compras = [];
  const vendas = [];
  const listaProventos = [];
  const usaCotas = operacoes.some((o) => o.cotas > 0);

  for (const o of ordenar(operacoes)) {
    const total = Number(o.total) || 0;
    const c = o.cotas == null ? null : Number(o.cotas);
    if (OPERACOES_ENTRADA.includes(o.tipo)) {
      totalComprado += total;
      if (c > 0) cotas += c;
      custo += total;
      compras.push({ id: o.id, data: o.data, cotas: c, preco: o.preco == null ? null : Number(o.preco), total: r2(total), tipo: o.tipo, descricao: o.descricao || null, meta_id: o.meta_id || null, conta_id: o.conta_id || null });
    } else if (OPERACOES_SAIDA.includes(o.tipo)) {
      totalVendido += total;
      if (c > 0) {
        if (c > cotas + 1e-9) erro = erro || `Venda de ${c} cotas, mas só havia ${r6(cotas)} em ${String(o.data).slice(0, 10)}.`;
        const pm = cotas > 0 ? custo / cotas : 0;
        const baixa = Math.min(c, cotas);
        realizado += total - pm * baixa;
        custo -= pm * baixa;
        cotas -= baixa;
      } else {
        // renda fixa: sai primeiro o que é rendimento, depois o principal, proporcionalmente
        const valor = custo + rend;
        if (total > valor + 0.005) erro = erro || `Resgate de ${r2(total)}, mas o saldo era ${r2(valor)} em ${String(o.data).slice(0, 10)}.`;
        const fracao = valor > 0 ? Math.min(1, total / valor) : 0;
        realizado += total - custo * fracao;
        custo -= custo * fracao;
        rend -= rend * fracao;
      }
      vendas.push({ id: o.id, data: o.data, cotas: c, preco: o.preco == null ? null : Number(o.preco), total: r2(total), tipo: o.tipo, descricao: o.descricao || null, meta_id: o.meta_id || null, conta_id: o.conta_id || null });
    } else if (o.tipo === 'provento') {
      proventos += total;
      listaProventos.push({ id: o.id, data: o.data, cotas: c, por_cota: o.preco == null ? null : Number(o.preco), total: r2(total), descricao: o.descricao || null });
    } else if (o.tipo === 'rendimento') {
      rendimentos += total;
      rend += total;
    }
  }
  if (Math.abs(cotas) < 1e-9) cotas = 0;
  if (Math.abs(custo) < 0.005) custo = 0;
  return {
    usa_cotas: usaCotas,
    cotas: r6(cotas),
    custo: r2(custo),
    preco_medio: usaCotas && cotas > 0 ? r2(custo / cotas) : null,
    valor_atual: r2(custo + rend),
    proventos: r2(proventos),
    rendimentos: r2(rendimentos),
    realizado: r2(realizado),
    total_comprado: r2(totalComprado),
    total_vendido: r2(totalVendido),
    compras: compras.sort((a, b) => String(b.data).localeCompare(String(a.data))),
    vendas: vendas.sort((a, b) => String(b.data).localeCompare(String(a.data))),
    proventos_lista: listaProventos.sort((a, b) => String(b.data).localeCompare(String(a.data))),
    erro,
  };
}

// Cotas em carteira na data (inclusive) — usada para calcular o provento por cota.
function cotasEm(operacoes, data) {
  let cotas = 0;
  for (const o of ordenar(operacoes)) {
    if (String(o.data).slice(0, 10) > String(data).slice(0, 10)) break;
    const c = Number(o.cotas) || 0;
    if (OPERACOES_ENTRADA.includes(o.tipo)) cotas += c;
    else if (OPERACOES_SAIDA.includes(o.tipo)) cotas -= c;
  }
  return Math.max(0, r6(cotas));
}

const diasEntre = (de, ate) => Math.max(0, Math.round((Date.parse(String(ate).slice(0, 10) + 'T12:00:00Z') - Date.parse(String(de).slice(0, 10) + 'T12:00:00Z')) / 86400000));

// Rendimento SIMULADO pelo CDI: movimentos [{data, valor}] (guardar = +, resgatar = −), taxa diária do CDI em % (série 12
// do Bacen: 0,0545 = 0,0545% ao dia útil). 252 dias úteis por ano ≈ 252/365 por dia corrido; `pctCdi` = 100 para 100% do CDI.
// Devolve { rendimento, saldo, aplicado }.
function rendimentoCdi(movimentos, cdiDiarioPct, hoje, pctCdi = 100) {
  const taxa = (Number(cdiDiarioPct) / 100) * (Number(pctCdi) / 100);
  const lista = ordenar(movimentos.map((m) => ({ data: m.data, valor: Number(m.valor) || 0 })));
  let saldo = 0;
  let aplicado = 0;
  let ultima = null;
  const fator = (dias) => Math.pow(1 + taxa, (dias * 252) / 365);
  for (const m of lista) {
    if (ultima && saldo > 0 && taxa > 0) saldo *= fator(diasEntre(ultima, m.data));
    saldo += m.valor;
    aplicado += m.valor;
    ultima = m.data;
  }
  if (ultima && saldo > 0 && taxa > 0 && hoje) saldo *= fator(diasEntre(ultima, hoje));
  return { rendimento: r2(Math.max(0, saldo - aplicado)), saldo: r2(saldo), aplicado: r2(aplicado) };
}

module.exports = {
  TIPOS_INVESTIMENTO, TIPOS_LIQUIDEZ_RAPIDA, MSG_SO_LIQUIDEZ_RAPIDA, liquidezPadrao,
  OPERACOES_ENTRADA, OPERACOES_SAIDA, OPERACOES_RENDA, TIPOS_OPERACAO,
  consolidarAtivo, cotasEm, rendimentoCdi, r2,
};
