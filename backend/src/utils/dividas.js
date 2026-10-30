// Cálculos de dívidas e acordos (JS puro: roda no servidor e dentro do navegador/PWA).
// - taxa implícita de um acordo (taxa mensal que iguala o valor à vista ao fluxo de parcelas);
// - risco automático (pontos, nível Baixo/Médio/Alto/Crítico e motivos);
// - datas de vencimento mensais.

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

// Valor presente de `n` parcelas iguais `pmt` (a primeira daqui a 1 mês) à taxa mensal `i` (fração, 0,02 = 2%).
function valorPresente(pmt, n, i) {
  if (Math.abs(i) < 1e-12) return pmt * n;
  return (pmt * (1 - Math.pow(1 + i, -n))) / i;
}

// Taxa mensal implícita (fração) tal que  valorFinanciado = Σ pmt/(1+i)^k , k=1..n.
// valorFinanciado = valor à vista (já com desconto) - entrada. Bisseção (robusta, sem derivada).
// Devolve 0 quando as parcelas somam o valor financiado, e null se não houver como calcular.
function taxaImplicita(valorFinanciado, pmt, n) {
  const pv = Number(valorFinanciado), p = Number(pmt), k = Math.round(Number(n));
  if (!(pv > 0) || !(p > 0) || !(k >= 1)) return null;
  if (p * k <= pv + 0.005) return 0; // não paga juros (ou até paga menos que o à vista)
  let lo = 0, hi = 1; // até 100% ao mês
  while (valorPresente(p, k, hi) > pv && hi < 1000) hi *= 2;
  for (let it = 0; it < 200; it++) {
    const mid = (lo + hi) / 2;
    if (valorPresente(p, k, mid) > pv) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// Simulação de um acordo.
//  valorBase: dívida original (ou o valor que o credor cobra à vista); desconto: abatimento no à vista.
function simularAcordo({ valorBase, desconto = 0, entrada = 0, parcelas, valorParcela }) {
  const base = Number(valorBase) || 0;
  const desc = Math.max(0, Number(desconto) || 0);
  const ent = Math.max(0, Number(entrada) || 0);
  const n = Math.round(Number(parcelas) || 0);
  const pmt = Number(valorParcela) || 0;
  const aVista = Math.max(0, base - desc);
  const financiado = Math.max(0, aVista - ent);
  const totalParcelas = r2(pmt * n);
  const totalPago = r2(ent + totalParcelas);
  const i = taxaImplicita(financiado, pmt, n);
  return {
    valorBase: r2(base),
    desconto: r2(desc),
    aVista: r2(aVista),
    entrada: r2(ent),
    financiado: r2(financiado),
    parcelas: n,
    valorParcela: r2(pmt),
    totalParcelas,
    totalPago,
    jurosTotal: r2(Math.max(0, totalPago - aVista)),
    economiaSobreBase: r2(base - totalPago), // positivo = paga menos que a dívida original
    taxaMensal: i === null ? null : Math.round(i * 1e6) / 1e4, // em % a.m. (4 casas)
    taxaAnual: i === null ? null : Math.round((Math.pow(1 + i, 12) - 1) * 1e6) / 1e4, // em % a.a.
  };
}

// Quantos meses para quitar `saldo` pagando `mensal` por mês com juros `taxaMensalPct` (% a.m.)
function mesesParaQuitar(saldo, mensal, taxaMensalPct = 0) {
  let s = Number(saldo) || 0;
  const m = Number(mensal) || 0;
  const j = (Number(taxaMensalPct) || 0) / 100;
  if (s <= 0) return { meses: 0, juros: 0, totalPago: 0 };
  if (m <= 0 || m <= s * j) return { meses: null, juros: null, totalPago: null };
  let meses = 0, juros = 0, pago = 0;
  while (s > 0.005 && meses < 1200) {
    meses++;
    const jm = s * j;
    s += jm; juros += jm;
    const p = Math.min(s, m);
    s -= p; pago += p;
  }
  return { meses, juros: r2(juros), totalPago: r2(pago) };
}

// ----- datas -----
const pad = (n) => String(n).padStart(2, '0');
// Soma `meses` a uma data ISO (AAAA-MM-DD), mantendo o dia (ou o último dia do mês quando não existir).
function somarMeses(iso, meses) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return null;
  let ano = +m[1], mes = +m[2] - 1 + meses, dia = +m[3];
  ano += Math.floor(mes / 12);
  mes = ((mes % 12) + 12) % 12;
  const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return `${ano}-${pad(mes + 1)}-${pad(Math.min(dia, ultimo))}`;
}
function diasEntre(deIso, ateIso) {
  const a = Date.parse(String(deIso).slice(0, 10) + 'T12:00:00Z');
  const b = Date.parse(String(ateIso).slice(0, 10) + 'T12:00:00Z');
  return Math.round((b - a) / 86400000);
}
function hojeISO() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: process.env.APP_TIMEZONE || 'America/Sao_Paulo' });
}

// ----- risco -----
// Pontos: vencida (40 + 5 a cada 30 dias de atraso, até 15) · vence em até 5 dias (10) · acordo quebrado (35) ·
// negativada (25) · juros mensais ≥10% (25), ≥5% (15), ≥2% (8) · urgência escolhida à mão funciona como piso.
// Níveis: ≥70 Crítico · ≥45 Alto · ≥20 Médio · senão Baixo. Dívida quitada = 0.
const PISO_MANUAL = { vermelho: 45, amarelo: 20 };
function riscoDivida(d, hoje = hojeISO()) {
  const saldo = Number(d.saldo) || 0;
  if (saldo <= 0 || d.status === 'quitada') {
    return { pontos: 0, nivel: 'Baixo', urgencia: 'verde', vencida: false, diasAtraso: 0, motivos: [] };
  }
  let pontos = 0;
  const motivos = [];
  let vencida = false, diasAtraso = 0;
  if (d.proximo_vencimento) {
    const dias = diasEntre(d.proximo_vencimento, hoje);
    if (dias > 0) {
      vencida = true; diasAtraso = dias;
      pontos += 40 + Math.min(15, Math.floor(dias / 30) * 5);
      motivos.push(dias === 1 ? 'Vencida há 1 dia' : `Vencida há ${dias} dias`);
    } else if (dias >= -5) {
      pontos += 10;
      motivos.push(dias === 0 ? 'Vence hoje' : `Vence em ${-dias} ${dias === -1 ? 'dia' : 'dias'}`);
    }
  }
  if (d.status === 'quebrada') { pontos += 35; motivos.push('Acordo quebrado'); }
  if (d.negativada || d.situacao === 'negativada') { pontos += 25; motivos.push('Negativada'); }
  const taxa = Number(d.taxa_juros) || 0;
  if (taxa >= 10) { pontos += 25; motivos.push(`Juros muito altos (${taxa.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% a.m.)`); }
  else if (taxa >= 5) { pontos += 15; motivos.push(`Juros altos (${taxa.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% a.m.)`); }
  else if (taxa >= 2) { pontos += 8; motivos.push(`Juros de ${taxa.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% a.m.`); }
  const piso = PISO_MANUAL[d.urgencia_base] || 0;
  if (piso > pontos) { pontos = piso; motivos.push('Urgência marcada por você'); }
  const nivel = pontos >= 70 ? 'Crítico' : pontos >= 45 ? 'Alto' : pontos >= 20 ? 'Médio' : 'Baixo';
  const urgencia = nivel === 'Crítico' || nivel === 'Alto' ? 'vermelho' : nivel === 'Médio' ? 'amarelo' : 'verde';
  return { pontos, nivel, urgencia, vencida, diasAtraso, motivos };
}

// ----- origem x situação (dois campos separados) -----
// Origem = de onde a dívida veio. Situação = como ela está agora. A aba da página é a situação.
const ORIGENS = ['cartao', 'crediario', 'emprestimo', 'conta_atrasada', 'pessoa', 'outra'];
const SITUACOES = ['em_dia', 'atrasada', 'negativada', 'em_acordo', 'quitada'];
const ROTULO_ORIGEM = { cartao: 'Cartão', crediario: 'Crediário', emprestimo: 'Empréstimo / financiamento', conta_atrasada: 'Conta atrasada', pessoa: 'Pessoa', outra: 'Outra' };
const ROTULO_SITUACAO = { em_dia: 'Em dia', atrasada: 'Atrasada', negativada: 'Negativada', em_acordo: 'Em acordo', quitada: 'Quitada' };

// Dívidas antigas (só com `tipo`/`negativada`/`status`) ganham origem e situação sem perder nada.
function derivarOrigem(d) {
  if (ORIGENS.includes(d.origem)) return d.origem;
  if (d.tipo === 'crediario' || d.tipo === 'carne') return 'crediario';
  if (d.tipo === 'emprestimo' || d.tipo === 'financiamento') return 'emprestimo';
  return 'outra';
}
function derivarSituacao(d) {
  if (d.status === 'quitada' || !(Number(d.saldo) > 0)) return 'quitada';
  if (d.status === 'quebrada') return 'negativada';
  if (d.tipo === 'acordo') return 'em_acordo';
  if (d.negativada || d.tipo === 'negativada') return 'negativada';
  return 'em_dia';
}
// Situação que a tela mostra: quitada pelo saldo; "em dia" vira "atrasada" sozinha quando o vencimento passou.
function situacaoEfetiva(d, hoje = hojeISO()) {
  if (d.status === 'quitada' || !(Number(d.saldo) > 0)) return 'quitada';
  const base = SITUACOES.includes(d.situacao) && d.situacao !== 'quitada' ? d.situacao : derivarSituacao(d);
  if (base === 'em_dia' && d.proximo_vencimento && diasEntre(d.proximo_vencimento, hoje) > 0) return 'atrasada';
  return base;
}
// Coluna `tipo` antiga continua sincronizada (Dashboard, alertas e lançamentos ainda a leem).
function tipoLegado(origem, situacao) {
  if (situacao === 'em_acordo') return 'acordo';
  if (situacao === 'negativada') return 'negativada';
  if (origem === 'crediario') return 'crediario';
  if (origem === 'emprestimo') return 'emprestimo';
  return 'outra';
}
// Aba da página = situação: Em aberto (em dia + atrasada) · Negativadas · Em acordo · Quitadas
function abaDa(d) {
  const s = situacaoEfetiva(d);
  return s === 'quitada' ? 'quitadas' : s === 'negativada' ? 'negativadas' : s === 'em_acordo' ? 'acordo' : 'aberto';
}

// ----- acordo: parcela automática -----
// parcela = (dívida − desconto − entrada) ÷ parcelas  (ex.: (10.000 − 4.732 − 500) ÷ 12 = 397,33)
function parcelaDoAcordo({ valorBase, desconto = 0, entrada = 0, parcelas }) {
  const n = Math.round(Number(parcelas) || 0);
  const financiado = (Number(valorBase) || 0) - Math.max(0, Number(desconto) || 0) - Math.max(0, Number(entrada) || 0);
  if (n < 1 || !(financiado > 0)) return 0;
  return r2(financiado / n);
}

// ----- simulação de quitação de UMA dívida (quadro igual ao Plano de quitação) -----
// Saldo "de verdade" a render juros: num acordo/parcelado, o saldo restante já tem os juros embutidos nas parcelas;
// o principal é o valor presente das parcelas que faltam à taxa do acordo. Sem parcela, é o próprio saldo.
function saldoBaseJuros(d) {
  const saldo = Number(d.saldo) || 0;
  const taxa = (Number(d.taxa_juros) || 0) / 100;
  const p = Number(d.valor_parcela) || 0;
  if (d.parcelas_total && p > 0 && taxa > 0 && saldo > 0) {
    const resta = Math.max(1, Math.ceil(saldo / p - 0.01));
    return Math.min(saldo, r2(valorPresente(p, resta, taxa)));
  }
  return saldo;
}
function planoQuitacao(d, mensal, hoje = hojeISO()) {
  const saldo = Number(d.saldo) || 0;
  const taxaPct = Number(d.taxa_juros) || 0;
  const j = taxaPct / 100;
  const m = Number(mensal) || Number(d.valor_parcela) || 0;
  const base = saldoBaseJuros(d);
  const vazio = { saldo: r2(saldo), base: r2(base), taxaMensal: taxaPct, mensal: r2(m), meses: 0, juros: 0, totalPago: 0, dataFinal: null, tabela: [], inviavel: false };
  if (saldo <= 0) return vazio;
  if (!(m > 0)) return { ...vazio, inviavel: true, minimo: r2(base * j) + 0.01, motivo: 'Informe quanto você consegue pagar por mês.' };
  if (m <= base * j + 1e-9) return { ...vazio, inviavel: true, minimo: r2(base * j + 0.01), motivo: 'Esse valor não cobre nem os juros do mês. Aumente o pagamento.' };
  let s = base, meses = 0, juros = 0, pago = 0;
  const venc = d.proximo_vencimento && diasEntre(d.proximo_vencimento, hoje) <= 0 ? d.proximo_vencimento : somarMeses(hoje, 1);
  const tabela = [];
  while (s > 0.005 && meses < 600) {
    const jm = s * j;
    s += jm; juros += jm;
    const p = Math.min(s, m);
    s -= p; pago += p; meses++;
    tabela.push({ mes: meses, data: somarMeses(venc, meses - 1), juros: r2(jm), pago: r2(p), saldo: r2(Math.max(0, s)) });
  }
  return { ...vazio, meses, juros: r2(juros), totalPago: r2(pago), dataFinal: tabela.length ? tabela[tabela.length - 1].data : null, tabela, inviavel: s > 0.005 };
}

// ----- plano para TODAS as dívidas (avalanche × bola de neve) -----
// Cada mês: juros em cada dívida, depois as parcelas mínimas (em ordem de prioridade) e o que sobrar vai para a primeira da fila.
function planoGeral(dividas, orcamentoMensal, metodo) {
  const itens = dividas.filter((d) => Number(d.saldo) > 0 && d.status !== 'quitada').map((d) => ({
    id: d.id, nome: d.nome, saldoAtual: r2(d.saldo), taxa: Number(d.taxa_juros) || 0,
    s: saldoBaseJuros(d), j: (Number(d.taxa_juros) || 0) / 100, min: Number(d.valor_parcela) || 0,
    juros: 0, pago: 0, mesQuitacao: null,
  }));
  const minimos = itens.reduce((t, i) => t + i.min, 0);
  const orc = Number(orcamentoMensal) > 0 ? Number(orcamentoMensal) : minimos;
  if (!itens.length || !(orc > 0)) return null;
  const prio = metodo === 'neve' ? (a, b) => a.s - b.s : (a, b) => b.j - a.j || a.s - b.s;
  const ordem = [...itens].sort(prio);
  let meses = 0;
  while (itens.some((i) => i.s > 0.005) && meses < 600) {
    meses++;
    itens.forEach((i) => { if (i.s > 0) { const jm = i.s * i.j; i.s += jm; i.juros += jm; } });
    let resto = orc;
    const fila = ordem.filter((i) => i.s > 0.005);
    for (const i of fila) { const p = Math.min(i.s, i.min, resto); i.s -= p; i.pago += p; resto -= p; }
    for (const i of fila) { if (resto <= 0) break; const p = Math.min(i.s, resto); i.s -= p; i.pago += p; resto -= p; }
    itens.forEach((i) => { if (i.s <= 0.005 && i.mesQuitacao == null) i.mesQuitacao = meses; });
  }
  if (itens.some((i) => i.s > 0.005)) return { inviavel: true, orcamento: r2(orc), minimos: r2(minimos), metodo };
  return {
    metodo, orcamento: r2(orc), minimos: r2(minimos), meses,
    juros: r2(itens.reduce((t, i) => t + i.juros, 0)), totalPago: r2(itens.reduce((t, i) => t + i.pago, 0)),
    ordem: ordem.map((i) => ({ id: i.id, nome: i.nome, saldo: i.saldoAtual, taxa: i.taxa, juros: r2(i.juros), totalPago: r2(i.pago), mesQuitacao: i.mesQuitacao })),
  };
}

// Parcelas restantes (arredondando para cima, com tolerância de 1% da parcela)
function parcelasRestantes(d) {
  const p = Number(d.valor_parcela) || 0;
  if (!(p > 0) || !(Number(d.saldo) > 0)) return 0;
  return Math.max(0, Math.ceil(Number(d.saldo) / p - 0.01));
}

module.exports = {
  r2, valorPresente, taxaImplicita, simularAcordo, mesesParaQuitar,
  somarMeses, diasEntre, hojeISO, riscoDivida, abaDa, parcelasRestantes,
  ORIGENS, SITUACOES, ROTULO_ORIGEM, ROTULO_SITUACAO, derivarOrigem, derivarSituacao, situacaoEfetiva, tipoLegado,
  parcelaDoAcordo, saldoBaseJuros, planoQuitacao, planoGeral,
};
