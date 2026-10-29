// Importação de extratos e faturas — análise (pré-visualização). A gravação fica em confirmar.js.
const db = require('../db');
const T = require('./texto');
const faturas = require('../utils/faturas');
const { lerEntrada, normalizarSinais } = require('./leitura');
const { sugerirDestino, identificarBanco } = require('./bancos');
const { classificarConta, classificarFatura } = require('./classificar');

class ErroImportacao extends Error {
  constructor(m, status = 400) { super(m); this.status = status; }
}

function destinoDe(usuarioId, destino) {
  if (!destino || !destino.tipo || !destino.id) throw new ErroImportacao('Escolha a conta ou o cartão de destino.');
  if (destino.tipo === 'conta') {
    const c = db.prepare('SELECT * FROM contas WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(String(destino.id), usuarioId);
    if (!c) throw new ErroImportacao('Conta de destino não encontrada.', 404);
    return { tipo: 'conta', conta: c };
  }
  if (destino.tipo === 'fatura') {
    const c = db.prepare('SELECT * FROM cartoes WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(String(destino.id), usuarioId);
    if (!c) throw new ErroImportacao('Cartão de destino não encontrado.', 404);
    if (c.origem !== 'manual') throw new ErroImportacao('Cartão conectado recebe as compras pelo Open Finance: importe só em cartões cadastrados à mão.');
    return { tipo: 'fatura', cartao: c };
  }
  throw new ErroImportacao('Tipo de destino inválido.');
}

function perfisDoUsuario(usuarioId) {
  return db.prepare('SELECT * FROM perfis_importacao WHERE usuario_id = ? AND excluido_em IS NULL ORDER BY alterado_em DESC').all(usuarioId);
}

// Identifica o banco do arquivo e sugere conta/cartão (etapa 2 da central).
function identificar(usuarioId, corpo) {
  const leitura = (() => {
    try { return lerEntrada(corpo, perfisDoUsuario(usuarioId)); } catch (e) { return { erro: e.message }; }
  })();
  const banco = leitura.banco || identificarBanco({ nomeArquivo: corpo.nomeArquivo, texto: corpo.texto });
  const contas = db.prepare('SELECT id, nome FROM contas WHERE usuario_id = ? AND excluido_em IS NULL').all(usuarioId);
  const cartoes = db.prepare("SELECT id, nome FROM cartoes WHERE usuario_id = ? AND excluido_em IS NULL AND origem = 'manual'").all(usuarioId);
  const tipoArq = leitura.meta && leitura.meta.tipoConta === 'cartao' ? 'fatura' : leitura.meta && leitura.meta.tipoConta === 'conta' ? 'conta' : corpo.tipo || null;
  const lista = sugerirDestino(banco, corpo.tipo || tipoArq, contas, cartoes);
  const linhasN = leitura.linhas ? leitura.linhas.length : 0;
  return {
    formato: leitura.formato || null, banco: banco ? banco.nome : null, dica: banco ? banco.dica : '', tipoSugerido: tipoArq,
    sugestoes: lista, erro: leitura.erro || null, precisaMapeamento: !!leitura.precisaMapeamento, linhas: linhasN,
  };
}

function periodoDeLinhas(linhas, meta) {
  const datas = linhas.map((l) => l.data).filter(Boolean).sort();
  if (!datas.length) throw new ErroImportacao('Não encontrei nenhuma data válida no arquivo.');
  let inicio = datas[0];
  let fim = datas[datas.length - 1];
  if (meta && meta.inicio && meta.inicio < inicio) inicio = meta.inicio;
  if (meta && meta.fim && meta.fim > fim) fim = meta.fim;
  return { inicio, fim, primeiraLinha: datas[0], ultimaLinha: datas[datas.length - 1] };
}

function faturaAlvo(cartao, linhas, meta, escolhida) {
  const f = (d, n = 1) => faturas.faturaDaParcela(d, cartao.dia_fechamento, cartao.dia_vencimento, n);
  const cont = {};
  linhas.filter((l) => l.valor < 0 && !(l.parcelaAtual > 1)).forEach((l) => { const c = f(l.data); cont[c] = (cont[c] || 0) + 1; });
  let detectada = Object.keys(cont).sort((a, b) => cont[b] - cont[a] || (a < b ? 1 : -1))[0] || null;
  if (meta && meta.formato === 'ofx' && meta.fim) detectada = f(meta.fim);
  if (meta && meta.vencimento) {
    const [a, m] = meta.vencimento.split('-');
    detectada = `${a}-${m}`;
  }
  const chave = escolhida && /^\d{4}-(0[1-9]|1[0-2])$/.test(escolhida) ? escolhida : detectada;
  const base = chave || detectada;
  const vizinhas = base ? [-1, 0, 1].map((n) => { const [a, m] = base.split('-').map(Number); const t = a * 12 + (m - 1) + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; }) : [];
  return { chave: base, detectada, vizinhas, datas: base ? faturas.datasDaFatura(base, cartao.dia_fechamento, cartao.dia_vencimento) : null };
}

// "Impressão digital" do arquivo: as linhas lidas (data, |valor|, descrição normalizada), em ordem. Não depende do nome
// do arquivo nem da inversão de sinais; o mesmo extrato baixado de novo dá a mesma impressão.
function impressaoDoArquivo(formato, linhas) {
  const base = linhas.map((l) => `${l.data}|${Math.abs(Number(l.valor) || 0).toFixed(2)}|${T.normalizar(l.descricao)}`).sort().join('\n');
  return `v1:${formato}:${linhas.length}:${T.hash(base)}${T.hash(base.split('').reverse().join(''))}`;
}

// Importação ATIVA (não desfeita) do mesmo arquivo no mesmo destino. Importações antigas, sem impressão, são reconhecidas
// pelo nome do arquivo + quantidade de linhas.
function importacaoAnterior(usuarioId, dest, impressao, nomeArquivo, qtdLinhas) {
  const destinoSql = dest.tipo === 'conta' ? 'm.conta_id = ?' : 'm.cartao_id = ?';
  const destinoId = dest.tipo === 'conta' ? dest.conta.id : dest.cartao.id;
  let m = db.prepare(
    `SELECT m.* FROM importacoes m JOIN importacao_itens i ON i.importacao_id = m.id AND i.tabela = 'arquivo' AND i.registro_id = ? AND i.excluido_em IS NULL
     WHERE m.usuario_id = ? AND m.excluido_em IS NULL AND m.desfeita_em IS NULL AND ${destinoSql} ORDER BY m.criado_em DESC LIMIT 1`
  ).get(impressao, usuarioId, destinoId);
  if (!m && nomeArquivo) {
    m = db.prepare(
      `SELECT m.* FROM importacoes m WHERE m.usuario_id = ? AND m.excluido_em IS NULL AND m.desfeita_em IS NULL AND ${destinoSql}
       AND m.arquivo_nome = ? AND m.qtd_total = ? AND NOT EXISTS (SELECT 1 FROM importacao_itens i WHERE i.importacao_id = m.id AND i.tabela = 'arquivo' AND i.excluido_em IS NULL)
       ORDER BY m.criado_em DESC LIMIT 1`
    ).get(usuarioId, destinoId, String(nomeArquivo).slice(0, 200), qtdLinhas);
  }
  if (!m) return null;
  return { id: m.id, em: m.criado_em, arquivo: m.arquivo_nome, novas: m.qtd_novas, atualizadas: m.qtd_atualizadas };
}

function analisar(usuarioId, corpo) {
  const dest = destinoDe(usuarioId, corpo.destino);
  const leitura = lerEntrada(corpo, perfisDoUsuario(usuarioId));
  if (leitura.precisaMapeamento) return { precisaMapeamento: true, ...leitura };
  if (!leitura.linhas.length) throw new ErroImportacao('Nenhum lançamento encontrado no arquivo.');
  if (leitura.linhas.length > 6000) throw new ErroImportacao('O arquivo tem mais de 6.000 lançamentos. Divida por período e importe em partes.');

  const sinal = normalizarSinais(leitura, dest.tipo, corpo.inverterSinal);
  const linhas = leitura.linhas.filter((l) => l.data && l.valor !== null && Number.isFinite(l.valor));
  linhas.forEach((l, i) => { l.idx = i; l.formatoOrigem = leitura.formato; });
  const periodoArquivo = periodoDeLinhas(linhas, leitura.meta);
  let periodo = { inicio: periodoArquivo.inicio, fim: periodoArquivo.fim };
  const p = corpo.periodo || {};
  if (p.dias && Number(p.dias) > 0) periodo = { inicio: T.somarDias(periodoArquivo.fim, -(Number(p.dias) - 1)), fim: periodoArquivo.fim };
  else if (p.inicio || p.fim) periodo = { inicio: p.inicio || periodoArquivo.inicio, fim: p.fim || periodoArquivo.fim };
  linhas.forEach((l) => { l.foraPeriodo = l.data < periodo.inicio || l.data > periodo.fim; });

  let resultado; let infoFatura = null;
  if (dest.tipo === 'conta') {
    resultado = classificarConta(usuarioId, dest.conta, linhas, periodo, corpo);
  } else {
    linhas.forEach((l) => { const pp = T.extrairParcela(l.descricao); l.parcelaAtual = pp ? pp.atual : 1; });
    infoFatura = faturaAlvo(dest.cartao, linhas.filter((l) => !l.foraPeriodo), leitura.meta, corpo.fatura);
    resultado = classificarFatura(usuarioId, dest.cartao, linhas, periodo, infoFatura.chave, corpo);
  }
  const lista = resultado.linhas;
  const impressao = impressaoDoArquivo(leitura.formato, linhas);
  const contagem = {};
  lista.forEach((l) => { contagem[l.status] = (contagem[l.status] || 0) + 1; });
  const total = lista.filter((l) => !l.status.startsWith('fora')).length;
  return {
    formato: leitura.formato,
    destino: dest.tipo === 'conta' ? { tipo: 'conta', id: dest.conta.id, nome: dest.conta.nome, manual: dest.conta.origem === 'manual' } : { tipo: 'fatura', id: dest.cartao.id, nome: dest.cartao.nome },
    banco: leitura.banco ? leitura.banco.nome : null,
    dica: leitura.banco ? leitura.banco.dica : '',
    periodoArquivo: { inicio: periodoArquivo.inicio, fim: periodoArquivo.fim },
    periodo,
    fatura: infoFatura ? { ...infoFatura, totalArquivo: resultado.totalArquivo } : null,
    impressao,
    importacaoAnterior: importacaoAnterior(usuarioId, dest, impressao, corpo.nomeArquivo, lista.length),
    saldoExtrato: leitura.meta.saldo !== undefined && leitura.meta.saldo !== null ? { valor: leitura.meta.saldo, data: leitura.meta.saldoData || periodoArquivo.fim } : null,
    sinalAuto: sinal.sinalAuto, sinalInvertido: sinal.sinalInvertido, sinalFixo: !!(leitura.meta.sinalNormalizado || leitura.formato === 'ofx'),
    perfilAplicado: leitura.perfilAplicado || null,
    mapeamento: leitura.mapeamento || null, assinatura: leitura.assinatura || null, colunas: leitura.colunas || null,
    ignoradasArquivo: (leitura.ignoradas || []).slice(0, 30), totalIgnoradasArquivo: (leitura.ignoradas || []).length,
    leituraGenerica: leitura.formato === 'pdf',
    resumo: { total, contagem, novas: lista.filter((l) => l.acao === 'importar' || l.acao === 'transferencia').length },
    linhas: lista,
  };
}

module.exports = { analisar, identificar, destinoDe, ErroImportacao, perfisDoUsuario };
