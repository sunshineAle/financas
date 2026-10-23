// Regras de fatura de cartão de crédito.
//
// Convenção adotada (a mesma dos aplicativos de banco): a fatura é
// identificada pelo MÊS DO VENCIMENTO. Exemplo: cartão que fecha dia 28 e
// vence dia 5. Uma compra de 10/01 entra na fatura que fecha em 28/01 e
// vence em 05/02, ou seja, a "fatura de fevereiro".
//
// - Compra feita até o dia de fechamento (inclusive) entra na fatura que
//   fecha neste mês; depois do fechamento, entra na do mês seguinte.
// - Se o dia de vencimento é maior que o de fechamento, a fatura vence no
//   mesmo mês em que fecha; senão, vence no mês seguinte.
// - Parcelas: a 1ª entra na fatura da compra, a 2ª na fatura seguinte, e
//   assim por diante (um mês a mais por parcela).
// - Dia 29, 30 ou 31 em mês mais curto vira o último dia do mês.
//
// Todas as funções são puras (sem banco, sem relógio) para poderem ser
// testadas isoladamente.

function pad(n) {
  return String(n).padStart(2, '0');
}

function ultimoDiaDoMes(ano, mes) {
  // mes de 1 a 12; "dia 0" do mês seguinte é o último dia deste mês
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

function somarMeses({ ano, mes }, n) {
  const total = ano * 12 + (mes - 1) + n;
  return { ano: Math.floor(total / 12), mes: (total % 12) + 1 };
}

function montarData({ ano, mes }, dia) {
  const diaReal = Math.min(dia, ultimoDiaDoMes(ano, mes));
  return `${ano}-${pad(mes)}-${pad(diaReal)}`;
}

function chaveDoMes({ ano, mes }) {
  return `${ano}-${pad(mes)}`;
}

function mesDaChave(chave) {
  const [ano, mes] = chave.split('-').map(Number);
  return { ano, mes };
}

function dataValida(texto) {
  if (typeof texto !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const [a, m, d] = texto.split('-').map(Number);
  if (m < 1 || m > 12) return false;
  return d >= 1 && d <= ultimoDiaDoMes(a, m);
}

// Mês de vencimento da fatura em que uma compra feita em `dataCompra` cai
// (1ª parcela, ou compra à vista).
function mesDeVencimentoDaCompra(dataCompra, diaFechamento, diaVencimento) {
  const [ano, mes, dia] = dataCompra.split('-').map(Number);
  const fechamentoNoMes = Math.min(diaFechamento, ultimoDiaDoMes(ano, mes));
  const mesFecha = dia <= fechamentoNoMes ? { ano, mes } : somarMeses({ ano, mes }, 1);
  return diaVencimento > diaFechamento ? mesFecha : somarMeses(mesFecha, 1);
}

// Chave "AAAA-MM" da fatura de uma parcela (numeroParcela começa em 1).
function faturaDaParcela(dataCompra, diaFechamento, diaVencimento, numeroParcela = 1) {
  const primeira = mesDeVencimentoDaCompra(dataCompra, diaFechamento, diaVencimento);
  return chaveDoMes(somarMeses(primeira, numeroParcela - 1));
}

// Datas de fechamento e vencimento de uma fatura, a partir da chave.
function datasDaFatura(chave, diaFechamento, diaVencimento) {
  const mesVence = mesDaChave(chave);
  const mesFecha = diaVencimento > diaFechamento ? mesVence : somarMeses(mesVence, -1);
  return {
    fecha: montarData(mesFecha, diaFechamento),
    vence: montarData(mesVence, diaVencimento),
  };
}

// Divide um valor em n parcelas sem perder centavos: a soma das parcelas é
// sempre exatamente o total. Os centavos que sobram vão para as primeiras.
function dividirEmParcelas(valorTotal, quantidade) {
  const totalCentavos = Math.round(valorTotal * 100);
  const base = Math.floor(totalCentavos / quantidade);
  const sobra = totalCentavos - base * quantidade;
  return Array.from({ length: quantidade }, (_, i) => (base + (i < sobra ? 1 : 0)) / 100);
}

function arredondar(valor) {
  return Math.round(valor * 100) / 100;
}

module.exports = {
  dataValida,
  faturaDaParcela,
  datasDaFatura,
  dividirEmParcelas,
  arredondar,
  chaveDoMes,
};
