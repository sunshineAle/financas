// Leitura do arquivo: escolhe o leitor pelo formato, aplica o perfil salvo (CSV/planilha) e normaliza os sinais.
const { parseOfx } = require('./ofx');
const { parseCsv } = require('./csv');
const { lerTabela, assinaturaDe } = require('./tabular');
const { parsePdf } = require('./pdf');
const { identificarBanco } = require('./bancos');
const { normalizar } = require('./texto');

function detectarFormato(entrada) {
  if (entrada.formato && ['ofx', 'csv', 'xlsx', 'pdf'].includes(entrada.formato)) return entrada.formato;
  const nome = String(entrada.nomeArquivo || '').toLowerCase();
  if (/\.(ofx|qfx)$/.test(nome)) return 'ofx';
  if (/\.(xlsx|xls|xlsm|ods)$/.test(nome)) return 'xlsx';
  if (/\.pdf$/.test(nome)) return 'pdf';
  if (/\.(csv|txt|tsv)$/.test(nome)) return 'csv';
  if (entrada.matriz) return 'xlsx';
  if (entrada.linhas) return 'pdf';
  if (/<OFX|OFXHEADER|<STMTTRN>/i.test(String(entrada.texto || '').slice(0, 5000))) return 'ofx';
  return 'csv';
}

// perfis: [{ id, nome, formato, assinatura, mapeamento(JSON texto) }]
class ErroLeitura extends Error {
  constructor(m) { super(m); this.status = 400; }
}

function lerEntrada(entrada, perfis = []) {
  try { return lerEntradaInterna(entrada, perfis); } catch (e) { if (e.status) throw e; throw new ErroLeitura(e.message); }
}

function lerEntradaInterna(entrada, perfis) {
  const formato = detectarFormato(entrada);
  let r;
  if (formato === 'ofx') {
    const o = parseOfx(entrada.texto);
    r = { formato, linhas: o.linhas, meta: o.meta, ignoradas: [] };
  } else if (formato === 'pdf') {
    const p = parsePdf(entrada.linhas);
    r = { formato, linhas: p.linhas, meta: p.meta, ignoradas: p.ignoradas };
  } else {
    let matriz = entrada.matriz;
    let separador = null;
    if (formato === 'csv') { const c = parseCsv(entrada.texto); matriz = c.matriz; separador = c.separador; }
    if (!Array.isArray(matriz) || !matriz.length) throw new Error('O arquivo está vazio ou não tem linhas legíveis.');
    let mapeamento = entrada.mapeamento || null;
    let perfilAplicado = null;
    if (!mapeamento) {
      for (const p of perfis) {
        let m; try { m = JSON.parse(p.mapeamento); } catch (e) { continue; }
        const cols = {};
        ['data', 'descricao', 'valor', 'debito', 'credito', 'tipo', 'saldo', 'parcela', 'categoria', 'id'].forEach((k) => { if (m[k] !== undefined && m[k] !== null) cols[k] = m[k]; });
        const lc = m.linhaCabecalho === null || m.linhaCabecalho === undefined ? -1 : Number(m.linhaCabecalho);
        if (assinaturaDe(matriz, lc, cols) === p.assinatura) { mapeamento = m; perfilAplicado = { id: p.id, nome: p.nome }; break; }
      }
    }
    const t = lerTabela(matriz, mapeamento);
    if (t.precisaMapeamento) {
      return { formato, precisaMapeamento: true, motivo: t.motivo, colunas: t.colunas, amostra: matriz.slice(0, 15), totalLinhas: matriz.length, separador };
    }
    const temSinalProprio = t.mapeamento.debito !== undefined || t.mapeamento.credito !== undefined || t.mapeamento.tipo !== undefined;
    r = {
      formato, linhas: t.linhas, ignoradas: t.ignoradas, mapeamento: t.mapeamento, assinatura: t.assinatura, colunas: t.colunas,
      perfilAplicado, meta: { formato, separador, sinalNormalizado: temSinalProprio, inicio: null, fim: null },
    };
  }
  r.banco = identificarBanco({ bancoId: r.meta.bancoId, org: r.meta.org || r.meta.fid, nomeArquivo: entrada.nomeArquivo, texto: entrada.texto || (entrada.linhas || []).slice(0, 30).join(' ') });
  return r;
}

// Em fatura de cartão a convenção "compra negativa" nem sempre vale (muitos CSV trazem compras positivas).
// Se não houver sinal explícito (OFX, D/C do PDF, colunas débito/crédito) e a maioria for positiva, inverte.
function normalizarSinais(leitura, destinoTipo, inverterManual) {
  const { linhas, meta } = leitura;
  let auto = false;
  if (destinoTipo === 'fatura' && !meta.sinalNormalizado && leitura.formato !== 'ofx') {
    const pos = linhas.filter((l) => l.valor > 0).length;
    const neg = linhas.filter((l) => l.valor < 0).length;
    auto = pos > neg;
  }
  const inverter = inverterManual === undefined || inverterManual === null ? auto : !!inverterManual;
  if (inverter) linhas.forEach((l) => { l.valor = -l.valor; });
  return { sinalAuto: auto, sinalInvertido: inverter };
}

module.exports = { lerEntrada, normalizarSinais, detectarFormato };
