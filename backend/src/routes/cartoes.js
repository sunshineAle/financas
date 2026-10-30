const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const dados = require('../dados');
const { exigirAutenticacao } = require('../middleware/auth');
const faturas = require('../utils/faturas');
const { lerIcone } = require('../utils/icone');
const lerCor = (c) => (/^#[0-9a-fA-F]{6}$/.test(String(c || '')) ? String(c) : null);

const router = express.Router();
router.use(exigirAutenticacao);

const FUSO = process.env.APP_TIMEZONE || 'America/Sao_Paulo';
const MAX_PARCELAS = 48;

// Data de hoje (AAAA-MM-DD) no fuso do usuário, não no do servidor.
function hoje() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: FUSO });
}

function diaValido(valor) {
  return Number.isInteger(valor) && valor >= 1 && valor <= 31;
}

// Lê e valida os campos de cadastro de um cartão (criar e editar).
function lerDadosCartao(corpo, usuarioId) {
  const nome = String(corpo.nome || '').trim();
  if (!nome) return { erro: 'Informe um nome para o cartão.' };

  const credito = lerCredito(corpo);
  if (credito.erro) return { erro: credito.erro };

  const diaVencimento = Number(corpo.diaVencimento);
  let diaFechamento = Number(corpo.diaFechamento);
  // Crediário não tem "fechamento" para a pessoa: sem o dia, a compra fecha ~10 dias antes do vencimento.
  if (credito.dados.tipoCredito === 'crediario' && !diaValido(diaFechamento) && diaValido(diaVencimento)) {
    diaFechamento = diaVencimento > 10 ? diaVencimento - 10 : diaVencimento + 18;
  }
  if (!diaValido(diaFechamento)) return { erro: 'O dia de fechamento deve ser entre 1 e 31.' };
  if (!diaValido(diaVencimento)) return { erro: 'O dia de vencimento deve ser entre 1 e 31.' };

  let limite = null;
  if (corpo.limite !== undefined && corpo.limite !== null && corpo.limite !== '') {
    limite = Number(corpo.limite);
    if (!Number.isFinite(limite) || limite < 0) return { erro: 'O limite deve ser um valor válido.' };
  }

  let contaId = null;
  if (corpo.contaId) {
    const conta = db
      .prepare('SELECT id FROM contas WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL')
      .get(String(corpo.contaId), usuarioId);
    if (!conta) return { erro: 'A conta escolhida para pagar a fatura não foi encontrada.' };
    contaId = conta.id;
  }

  return { dados: { nome, diaFechamento, diaVencimento, limite, contaId, icone: lerIcone(corpo.icone), cor: lerCor(corpo.cor), ...credito.dados } };
}

// --- Tipo de crédito, juros e bandeira (anotações 53 e 58) ---------------------
// 'cartao' = cartão de crédito; 'loja' = cartão de loja (uso restrito à loja); 'crediario' = crediário.
// Cheque especial e empréstimo NÃO viram cartão (ficam em Contas e Dívidas).
const TIPOS_CREDITO = { cartao: 'Cartão de crédito', loja: 'Cartão de loja', crediario: 'Crediário' };
const BANDEIRAS = ['mastercard', 'visa', 'elo', 'amex', 'hipercard'];
const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Migração na leitura (sem mexer no banco): sem tipo = cartão; nome com Sparcelado/crediário/carnê = crediário.
function tipoDoCartao(cartao) {
  if (TIPOS_CREDITO[cartao.tipo_credito]) return cartao.tipo_credito;
  return /sparcelado|crediario|\bcarne\b/.test(semAcento(cartao.nome)) ? 'crediario' : 'cartao';
}

function numeroOpcional(v, max) {
  if (v === undefined || v === null || v === '') return { valor: null };
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > max) return { erro: true };
  return { valor: Math.round(n * 10000) / 10000 };
}

function lerCredito(corpo) {
  const tipo = corpo.tipoCredito === undefined || corpo.tipoCredito === null || corpo.tipoCredito === '' ? 'cartao' : String(corpo.tipoCredito);
  if (!TIPOS_CREDITO[tipo]) return { erro: 'Tipo de crédito inválido. Cheque especial fica em Contas e empréstimo fica em Dívidas.' };
  const juros = numeroOpcional(corpo.taxaJuros, 100);
  if (juros.erro) return { erro: 'Juros ao mês deve ser um número entre 0 e 100.' };
  const cet = numeroOpcional(corpo.cet, 10000);
  if (cet.erro) return { erro: 'CET ao ano deve ser um número válido.' };
  let bandeira = semAcento(corpo.bandeira).trim() || null;
  if (bandeira && !BANDEIRAS.includes(bandeira)) bandeira = null; // "Não sei" ou desconhecida
  if (tipo === 'crediario') bandeira = null; // crediário não tem bandeira
  return { dados: { tipoCredito: tipo, taxaJuros: juros.valor, cet: cet.valor, bandeira } };
}

function camposCredito(cartao) {
  const tipo = tipoDoCartao(cartao);
  return {
    tipoCredito: tipo,
    tipoCreditoRotulo: TIPOS_CREDITO[tipo],
    taxaJuros: cartao.taxa_juros ?? null,
    cet: cartao.cet ?? null,
    bandeira: tipo === 'crediario' ? null : (BANDEIRAS.includes(cartao.bandeira) ? cartao.bandeira : null),
  };
}

function buscarCartao(req, res) {
  const cartao = db
    .prepare(
      `SELECT cartoes.*, contas.nome AS conta_nome, contas.icone AS conta_icone
       FROM cartoes LEFT JOIN contas ON contas.id = cartoes.conta_id AND contas.excluido_em IS NULL
       WHERE cartoes.id = ? AND cartoes.usuario_id = ? AND cartoes.excluido_em IS NULL`
    )
    .get(req.params.id, req.usuario.id);
  if (!cartao) {
    res.status(404).json({ erro: 'Cartão não encontrado.' });
    return null;
  }
  return cartao;
}

// Todas as parcelas do cartão, já com a fatura de cada uma calculada.
function lancamentosDoCartao(cartao) {
  const linhas = db
    .prepare(
      `SELECT * FROM lancamentos_cartao WHERE cartao_id = ? AND excluido_em IS NULL
       ORDER BY data_compra DESC, rowid ASC`
    )
    .all(cartao.id);

  const totalPorCompra = {};
  linhas.forEach((l) => {
    totalPorCompra[l.compra_id] = (totalPorCompra[l.compra_id] || 0) + l.valor;
  });

  return linhas.map((l) => ({
    id: l.id,
    compraId: l.compra_id,
    descricao: l.descricao,
    dividaId: l.divida_id,
    categoriaId: l.categoria_id,
    subcategoria: l.subcategoria || null,
    valor: l.valor,
    dataCompra: l.data_compra,
    parcelaNumero: l.parcela_numero,
    totalParcelas: l.total_parcelas,
    rotuloParcela: l.total_parcelas > 1 ? `${l.parcela_numero}/${l.total_parcelas}` : null,
    valorTotalCompra: faturas.arredondar(totalPorCompra[l.compra_id]),
    fatura: faturas.faturaDaParcela(
      l.data_compra,
      cartao.dia_fechamento,
      cartao.dia_vencimento,
      l.parcela_numero
    ),
    tipoMov: l.tipo_mov || null, // anotação 61: crédito (estorno_vinculado, estorno_avulso, pagamento, cashback) ou compra estornada
  }));
}

// Fatura em que uma compra feita hoje cairia.
function chaveFaturaAberta(cartao) {
  return faturas.faturaDaParcela(hoje(), cartao.dia_fechamento, cartao.dia_vencimento, 1);
}

function statusDaFatura(chave, chaveAberta) {
  if (chave < chaveAberta) return 'fechada';
  if (chave === chaveAberta) return 'aberta';
  return 'futura';
}

function pagamentoDaFatura(cartaoId, chave) {
  return db
    .prepare(
      `SELECT fp.*, c.nome AS conta_nome FROM faturas_pagas fp
       LEFT JOIN contas c ON c.id = fp.conta_id AND c.excluido_em IS NULL WHERE fp.cartao_id = ? AND fp.fatura = ? AND fp.excluido_em IS NULL`
    )
    .get(cartaoId, chave);
}

function montarFatura(chave, cartao, chaveAberta, itens) {
  const datas = faturas.datasDaFatura(chave, cartao.dia_fechamento, cartao.dia_vencimento);
  const pag = pagamentoDaFatura(cartao.id, chave);
  return {
    chave,
    fecha: datas.fecha,
    vence: datas.vence,
    status: pag ? 'paga' : statusDaFatura(chave, chaveAberta),
    paga: !!pag,
    pagaEm: pag ? pag.data : null,
    pagaComConta: pag ? pag.conta_nome || null : null,
    // regras da fatura: 'pagoValor' = o que saiu da conta; a diferença para o total é desconto OU fatura parcelada (vira dívida)
    pagoValor: pag ? faturas.arredondar(pag.valor) : null,
    desconto: pag ? faturas.arredondar(pag.desconto || 0) : 0,
    parcelado: pag ? faturas.arredondar(pag.parcelado || 0) : 0,
    dividaParceladaId: pag ? pag.divida_id || null : null,
    total: faturas.arredondar(itens.reduce((s, i) => s + i.valor, 0)),
    quantidade: itens.length,
  };
}

function resumoDoCartao(cartao) {
  const itens = lancamentosDoCartao(cartao);
  const aberta = chaveFaturaAberta(cartao);
  const daAberta = itens.filter((i) => i.fatura === aberta);
  // "Usado" = tudo que ainda vai ser cobrado: a fatura aberta e as futuras
  // (parcelas de compras ainda por vir). Faturas anteriores já fecharam e
  // são tratadas como pagas, porque o sistema ainda não registra pagamento
  // de fatura.
  const pagas = new Set(
    db.prepare('SELECT fatura FROM faturas_pagas WHERE cartao_id = ? AND excluido_em IS NULL').all(cartao.id).map((l) => l.fatura)
  );
  const usado = faturas.arredondar(
    itens.filter((i) => i.fatura >= aberta && !pagas.has(i.fatura)).reduce((s, i) => s + i.valor, 0)
  );

  return {
    id: cartao.id,
    nome: cartao.nome,
    icone: cartao.icone || null,
    cor: cartao.cor || null,
    contaId: cartao.conta_id,
    contaNome: cartao.conta_nome || null,
    contaIcone: cartao.conta_icone || null,
    limite: cartao.limite,
    diaFechamento: cartao.dia_fechamento,
    diaVencimento: cartao.dia_vencimento,
    origem: cartao.origem,
    ...camposCredito(cartao),
    faturaAberta: montarFatura(aberta, cartao, aberta, daAberta),
    limiteUsado: usado,
    limiteDisponivel: cartao.limite == null ? null : faturas.arredondar(cartao.limite - usado),
  };
}

// --- Cartões ---------------------------------------------------------------

router.get('/', (req, res) => {
  const cartoes = db
    .prepare(
      `SELECT cartoes.*, contas.nome AS conta_nome, contas.icone AS conta_icone
       FROM cartoes LEFT JOIN contas ON contas.id = cartoes.conta_id AND contas.excluido_em IS NULL
       WHERE cartoes.usuario_id = ? AND cartoes.excluido_em IS NULL
       ORDER BY cartoes.nome COLLATE NOCASE`
    )
    .all(req.usuario.id);
  res.json(cartoes.map(resumoDoCartao));
});

router.post('/', (req, res) => {
  const lido = lerDadosCartao(req.body || {}, req.usuario.id);
  if (lido.erro) return res.status(400).json({ erro: lido.erro });
  const d = lido.dados;

  const novo = dados.inserir('cartoes', {
    usuario_id: req.usuario.id, conta_id: d.contaId, nome: d.nome, limite: d.limite, dia_fechamento: d.diaFechamento,
    dia_vencimento: d.diaVencimento, origem: 'manual', icone: d.icone, cor: d.cor,
    tipo_credito: d.tipoCredito, taxa_juros: d.taxaJuros, cet: d.cet, bandeira: d.bandeira,
  });

  req.params.id = novo.id;
  res.status(201).json(resumoDoCartao(buscarCartao(req, res)));
});

router.put('/:id', (req, res) => {
  const cartao = buscarCartao(req, res);
  if (!cartao) return;
  if (cartao.origem !== 'manual') {
    return res.status(400).json({ erro: 'Cartões conectados não podem ser editados manualmente.' });
  }

  const lido = lerDadosCartao(req.body || {}, req.usuario.id);
  if (lido.erro) return res.status(400).json({ erro: lido.erro });
  const d = lido.dados;

  dados.atualizar('cartoes', cartao.id, {
    nome: d.nome, conta_id: d.contaId, limite: d.limite, dia_fechamento: d.diaFechamento, dia_vencimento: d.diaVencimento, icone: d.icone, cor: d.cor,
    tipo_credito: d.tipoCredito, taxa_juros: d.taxaJuros, cet: d.cet, bandeira: d.bandeira,
  });

  res.json(resumoDoCartao(buscarCartao(req, res)));
});

router.delete('/:id', (req, res) => {
  const cartao = buscarCartao(req, res);
  if (!cartao) return;
  dados.excluir('cartoes', cartao.id); // exclui os lançamentos e as faturas pagas junto
  res.json({ ok: true });
});

// --- Faturas e extrato -------------------------------------------------------

// Lista de faturas do cartão: as que têm lançamentos, mais a aberta.
router.get('/:id/faturas', (req, res) => {
  const cartao = buscarCartao(req, res);
  if (!cartao) return;

  const itens = lancamentosDoCartao(cartao);
  const aberta = chaveFaturaAberta(cartao);
  const porFatura = { [aberta]: [] };
  itens.forEach((i) => {
    (porFatura[i.fatura] = porFatura[i.fatura] || []).push(i);
  });

  const lista = Object.keys(porFatura)
    .sort()
    .map((chave) => montarFatura(chave, cartao, aberta, porFatura[chave]));
  res.json(lista);
});

// Extrato de uma fatura: ?fatura=AAAA-MM (sem o parâmetro, a fatura aberta).
router.get('/:id/extrato', (req, res) => {
  const cartao = buscarCartao(req, res);
  if (!cartao) return;

  const aberta = chaveFaturaAberta(cartao);
  const chave = req.query.fatura || aberta;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(chave)) {
    return res.status(400).json({ erro: 'Fatura inválida. Use o formato AAAA-MM.' });
  }

  const itens = lancamentosDoCartao(cartao).filter((i) => i.fatura === chave);
  res.json({
    cartao: resumoDoCartao(cartao),
    fatura: montarFatura(chave, cartao, aberta, itens),
    lancamentos: itens,
  });
});

// Pagar a fatura (cartão manual): escolhe a conta de onde o dinheiro saiu.
// O saldo da conta manual é debitado e entra uma saída em Transações.
router.post('/:id/faturas/:chave/pagar', (req, res) => {
  const cartao = buscarCartao(req, res);
  if (!cartao) return;
  if (cartao.origem !== 'manual') {
    return res.status(400).json({ erro: 'Em cartão conectado o pagamento vem do banco, sozinho.' });
  }
  const chave = req.params.chave;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(chave)) return res.status(400).json({ erro: 'Fatura inválida.' });
  if (pagamentoDaFatura(cartao.id, chave)) return res.status(400).json({ erro: 'Esta fatura já está paga.' });

  const itens = lancamentosDoCartao(cartao).filter((i) => i.fatura === chave);
  const total = faturas.arredondar(itens.reduce((s, i) => s + i.valor, 0));
  if (total <= 0) return res.status(400).json({ erro: 'Esta fatura não tem valor a pagar.' });

  const conta = db
    .prepare('SELECT * FROM contas WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL')
    .get(String(req.body?.contaId), req.usuario.id);
  if (!conta) return res.status(400).json({ erro: 'Escolha a conta de onde saiu o dinheiro.' });

  const dia = req.body?.data || hoje();
  if (!faturas.dataValida(dia)) return res.status(400).json({ erro: 'Data inválida.' });

  // Valor pago (opcional; padrão = fatura inteira). Se for menor, a diferença é 'desconto' (a menos, ex.: Shopee) OU
  // 'parcelada' (o restante vai para as próximas faturas e vira dívida) — nunca se mistura um com o outro.
  let valorPago = total;
  if (req.body?.valorPago !== undefined && req.body?.valorPago !== null && req.body?.valorPago !== '') {
    valorPago = faturas.arredondar(Number(req.body.valorPago));
    if (!Number.isFinite(valorPago) || valorPago <= 0) return res.status(400).json({ erro: 'Informe o valor pago, maior que zero.' });
    if (valorPago > total) return res.status(400).json({ erro: 'O valor pago não pode ser maior que a fatura.' });
  }
  const diferenca = faturas.arredondar(total - valorPago);
  let tipoDif = null;
  let nParcelas = 1;
  if (diferenca > 0) {
    tipoDif = req.body?.diferenca;
    if (tipoDif !== 'desconto' && tipoDif !== 'parcelada') {
      return res.status(400).json({ erro: 'Diga se a diferença foi desconto ou fatura parcelada.' });
    }
    if (tipoDif === 'parcelada') {
      nParcelas = Number(req.body?.parcelas || 1);
      if (!Number.isInteger(nParcelas) || nParcelas < 1 || nParcelas > MAX_PARCELAS) return res.status(400).json({ erro: `Parcelas devem ser de 1 a ${MAX_PARCELAS}.` });
    }
  }

  dados.transacao(() => {
    const t = dados.inserir('transacoes', {
      conta_id: conta.id, usuario_id: req.usuario.id, descricao: `Fatura ${cartao.nome} ${chave}`, valor: -valorPago, data: dia,
      origem: 'manual', subcategoria: 'Fatura de cartão',
    });
    let dividaId = null;
    if (tipoDif === 'parcelada') {
      // o restante vira dívida (aba Crediário/parcelados em Dívidas) com as parcelas para as próximas faturas
      const [a, m] = chave.split('-').map(Number);
      const prox = `${m === 12 ? a + 1 : a}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}`;
      const venc = faturas.datasDaFatura(prox, cartao.dia_fechamento, cartao.dia_vencimento).vence;
      const divida = dados.inserir('dividas', {
        usuario_id: req.usuario.id, nome: `Fatura ${cartao.nome} ${chave} parcelada`, credor: cartao.nome,
        origem: 'cartao', situacao: 'em_dia', saldo_original: diferenca, saldo: diferenca, urgencia: 'amarelo', parcelas_total: nParcelas,
        valor_parcela: faturas.arredondar(diferenca / nParcelas), proximo_vencimento: venc,
      });
      dividaId = divida.id;
    }
    dados.inserir('faturas_pagas', {
      cartao_id: cartao.id, fatura: chave, conta_id: conta.id, transacao_id: t.id, valor: valorPago, data: dia,
      desconto: tipoDif === 'desconto' ? diferenca : 0, parcelado: tipoDif === 'parcelada' ? diferenca : 0, divida_id: dividaId,
    });
    if (conta.origem === 'manual') dados.somar('contas', conta.id, 'saldo', -valorPago);
  });

  res.status(201).json(montarFatura(chave, cartao, chaveFaturaAberta(cartao), itens));
});

// Desfaz a marcação: devolve o valor à conta e apaga a saída criada.
router.delete('/:id/faturas/:chave/pagar', (req, res) => {
  const cartao = buscarCartao(req, res);
  if (!cartao) return;
  const pag = pagamentoDaFatura(cartao.id, req.params.chave);
  if (!pag) return res.status(404).json({ erro: 'Esta fatura não está marcada como paga.' });

  dados.transacao(() => {
    const conta = pag.conta_id ? db.prepare('SELECT * FROM contas WHERE id = ? AND excluido_em IS NULL').get(pag.conta_id) : null;
    if (conta && conta.origem === 'manual') dados.somar('contas', conta.id, 'saldo', pag.valor);
    if (pag.transacao_id) dados.excluir('transacoes', pag.transacao_id);
    if (pag.divida_id) dados.excluir('dividas', pag.divida_id);
    dados.excluir('faturas_pagas', pag.id);
  });

  const itens = lancamentosDoCartao(cartao).filter((i) => i.fatura === req.params.chave);
  res.json(montarFatura(req.params.chave, cartao, chaveFaturaAberta(cartao), itens));
});

// --- Compras (lançamentos) ----------------------------------------------------

function lerCompra(corpo, { exigirDescricao = true, usuarioId = null } = {}) {
  const descricao = String(corpo.descricao || '').trim();
  if (exigirDescricao && !descricao) return { erro: 'Informe a descrição da compra.' };

  const valor = Number(corpo.valor);
  if (!Number.isFinite(valor) || valor <= 0) return { erro: 'Informe um valor maior que zero.' };

  const parcelas = corpo.parcelas === undefined || corpo.parcelas === '' ? 1 : Number(corpo.parcelas);
  if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > MAX_PARCELAS) {
    return { erro: `O número de parcelas deve ser entre 1 e ${MAX_PARCELAS}.` };
  }

  const dataCompra = corpo.dataCompra || hoje();
  if (!faturas.dataValida(dataCompra)) return { erro: 'Data da compra inválida.' };

  const valores = faturas.dividirEmParcelas(valor, parcelas);
  if (Math.min(...valores) < 0.01) return { erro: 'O valor é pequeno demais para esse número de parcelas.' };

  let dividaId = null;
  if (usuarioId && corpo.dividaId) {
    const divida = db
      .prepare('SELECT id FROM dividas WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL')
      .get(String(corpo.dividaId), usuarioId);
    if (!divida) return { erro: 'A dívida escolhida não foi encontrada.' };
    dividaId = divida.id;
  }

  let categoriaId = null;
  if (usuarioId && corpo.categoriaId) {
    const cat = db
      .prepare('SELECT id FROM categorias_orcamento WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL')
      .get(String(corpo.categoriaId), usuarioId);
    if (!cat) return { erro: 'A categoria escolhida não foi encontrada.' };
    categoriaId = cat.id;
  }

  const subcategoria = String(corpo.subcategoria || '').trim().slice(0, 80) || null;
  return { dados: { descricao, valor, parcelas, dataCompra, valores, dividaId, categoriaId, subcategoria: categoriaId ? subcategoria : null } };
}

// Prévia para o formulário: em qual fatura cai a 1ª e a última parcela.
router.get('/:id/previa', (req, res) => {
  const cartao = buscarCartao(req, res);
  if (!cartao) return;

  // A prévia roda enquanto a pessoa ainda preenche o formulário, então não
  // exige a descrição (só valor, parcelas e data importam para a fatura).
  const lida = lerCompra(req.query, { exigirDescricao: false });
  if (lida.erro) return res.status(400).json({ erro: lida.erro });
  const c = lida.dados;

  const primeira = faturas.faturaDaParcela(c.dataCompra, cartao.dia_fechamento, cartao.dia_vencimento, 1);
  const ultima = faturas.faturaDaParcela(c.dataCompra, cartao.dia_fechamento, cartao.dia_vencimento, c.parcelas);
  res.json({
    parcelas: c.parcelas,
    valorParcela: c.valores[0],
    primeiraFatura: {
      chave: primeira,
      ...faturas.datasDaFatura(primeira, cartao.dia_fechamento, cartao.dia_vencimento),
    },
    ultimaFatura: ultima,
  });
});

router.post('/:id/lancamentos', (req, res) => {
  const cartao = buscarCartao(req, res);
  if (!cartao) return;
  if (cartao.origem !== 'manual') {
    return res.status(400).json({ erro: 'Cartões conectados recebem as compras automaticamente pelo Open Finance. Lançamento manual só vale para cartões cadastrados à mão.' });
  }

  const lida = lerCompra(req.body || {}, { usuarioId: req.usuario.id });
  if (lida.erro) return res.status(400).json({ erro: lida.erro });
  const c = lida.dados;

  const compraId = crypto.randomUUID();
  dados.transacao(() => {
    c.valores.forEach((valorParcela, i) => {
      dados.inserir('lancamentos_cartao', {
        cartao_id: cartao.id, usuario_id: req.usuario.id, compra_id: compraId, descricao: c.descricao, valor: valorParcela,
        data_compra: c.dataCompra, parcela_numero: i + 1, total_parcelas: c.parcelas, divida_id: c.dividaId,
        categoria_id: c.categoriaId, subcategoria: c.subcategoria,
      });
    });
  });

  res.status(201).json({
    compraId,
    parcelas: c.parcelas,
    valorTotal: c.valor,
    valorParcela: c.valores[0],
    primeiraFatura: faturas.faturaDaParcela(c.dataCompra, cartao.dia_fechamento, cartao.dia_vencimento, 1),
  });
});

// Saldo inicial (anotação 55, cartões): para quem começa a usar o app no meio do mês.
//  - faturaAberta: valor que já está na fatura atual → um lançamento "Saldo inicial da fatura" na fatura aberta.
//  - parcelas: [{ descricao, valorParcela, faltam, total? }] → parcelas restantes de compras antigas, uma em cada
//    fatura a partir da aberta. Com `total` (nº de parcelas da compra), a numeração fica certa (ex.: 8/10, 9/10, 10/10).
router.post('/:id/saldo-inicial', (req, res) => {
  const cartao = buscarCartao(req, res);
  if (!cartao) return;
  if (cartao.origem !== 'manual') return res.status(400).json({ erro: 'Cartões conectados recebem a fatura do banco.' });

  const corpo = req.body || {};
  const aberta = chaveFaturaAberta(cartao);
  const novos = [];

  if (corpo.faturaAberta !== undefined && corpo.faturaAberta !== null && corpo.faturaAberta !== '' && Number(corpo.faturaAberta) !== 0) {
    const v = faturas.arredondar(Number(corpo.faturaAberta));
    if (!Number.isFinite(v) || v <= 0) return res.status(400).json({ erro: 'Informe o valor da fatura em aberto, maior que zero.' });
    novos.push({ compraId: crypto.randomUUID(), descricao: 'Saldo inicial da fatura', valores: [v], dataCompra: hoje(), primeiraParcela: 1, total: 1 });
  }

  const parcelas = Array.isArray(corpo.parcelas) ? corpo.parcelas : [];
  for (const p of parcelas) {
    const descricao = String(p?.descricao || '').trim().slice(0, 120);
    const valorParcela = faturas.arredondar(Number(p?.valorParcela));
    const faltam = Number(p?.faltam);
    if (!descricao) return res.status(400).json({ erro: 'Informe a descrição de cada compra parcelada.' });
    if (!Number.isFinite(valorParcela) || valorParcela <= 0) return res.status(400).json({ erro: `Informe o valor da parcela de "${descricao}".` });
    if (!Number.isInteger(faltam) || faltam < 1 || faltam > MAX_PARCELAS) return res.status(400).json({ erro: `Quantas parcelas faltam em "${descricao}"? De 1 a ${MAX_PARCELAS}.` });
    let total = p?.total === undefined || p?.total === null || p?.total === '' ? faltam : Number(p.total);
    if (!Number.isInteger(total) || total < faltam || total > MAX_PARCELAS) return res.status(400).json({ erro: `O total de parcelas de "${descricao}" deve ser pelo menos ${faltam}.` });
    // A compra "aconteceu" (total - faltam) faturas atrás: a data é o fechamento daquela fatura, assim a
    // próxima parcela (total - faltam + 1) cai exatamente na fatura aberta.
    const [a, m] = aberta.split('-').map(Number);
    const t = a * 12 + (m - 1) - (total - faltam);
    const chaveCompra = `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
    const dataCompra = faturas.datasDaFatura(chaveCompra, cartao.dia_fechamento, cartao.dia_vencimento).fecha;
    novos.push({ compraId: crypto.randomUUID(), descricao, valores: Array(faltam).fill(valorParcela), dataCompra, primeiraParcela: total - faltam + 1, total });
  }
  if (!novos.length) return res.status(400).json({ erro: 'Informe a fatura em aberto ou ao menos uma compra parcelada.' });

  dados.transacao(() => {
    novos.forEach((n) => n.valores.forEach((valor, i) => {
      dados.inserir('lancamentos_cartao', {
        cartao_id: cartao.id, usuario_id: req.usuario.id, compra_id: n.compraId, descricao: n.descricao, valor,
        data_compra: n.dataCompra, parcela_numero: n.primeiraParcela + i, total_parcelas: n.total,
      });
    }));
  });

  res.status(201).json(resumoDoCartao(buscarCartao(req, res)));
});

// Vincula (ou desvincula, com dividaId nulo) uma compra a uma dívida.
router.patch('/:id/lancamentos/:compraId', (req, res) => {
  const cartao = buscarCartao(req, res);
  if (!cartao) return;

  let dividaId = null;
  if (req.body?.dividaId) {
    const divida = db
      .prepare('SELECT id FROM dividas WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL')
      .get(String(req.body.dividaId), req.usuario.id);
    if (!divida) return res.status(400).json({ erro: 'A dívida escolhida não foi encontrada.' });
    dividaId = divida.id;
  }

  const alteradas = dados.atualizarOnde('lancamentos_cartao', 'cartao_id = ? AND compra_id = ? AND usuario_id = ?',
    [cartao.id, req.params.compraId, req.usuario.id], { divida_id: dividaId });
  if (alteradas === 0) return res.status(404).json({ erro: 'Compra não encontrada.' });
  res.json({ ok: true, dividaId });
});

// Remove a compra inteira (todas as parcelas de uma vez).
// Edita uma compra manual (vale para todas as parcelas dela). O número de
// parcelas fica fixo. Valor e data só mudam se nenhuma parcela estiver numa
// fatura já paga (senão o valor pago não bateria mais).
router.put('/:id/lancamentos/:compraId', (req, res) => {
  const cartao = buscarCartao(req, res);
  if (!cartao) return;
  if (cartao.origem !== 'manual') {
    return res.status(400).json({ erro: 'Compras de cartões conectados vêm do banco e não podem ser editadas.' });
  }
  const linhas = db
    .prepare('SELECT * FROM lancamentos_cartao WHERE cartao_id = ? AND compra_id = ? AND usuario_id = ? AND excluido_em IS NULL ORDER BY parcela_numero')
    .all(cartao.id, req.params.compraId, req.usuario.id);
  if (!linhas.length) return res.status(404).json({ erro: 'Compra não encontrada.' });

  // Anotação 61: crédito na fatura (valor negativo) edita pelo valor positivo e continua crédito
  const credito = linhas.some((l) => l.valor < 0);
  const totalAtual = faturas.arredondar(Math.abs(linhas.reduce((t, l) => t + l.valor, 0)));
  const corpo = req.body || {};
  const lida = lerCompra(
    { ...corpo, parcelas: linhas.length, valor: corpo.valor === undefined ? totalAtual : Math.abs(Number(corpo.valor)), dataCompra: corpo.dataCompra || linhas[0].data_compra },
    { usuarioId: req.usuario.id }
  );
  if (lida.erro) return res.status(400).json({ erro: lida.erro });
  const c = lida.dados;

  const mudouValor = Math.abs(c.valor - totalAtual) > 0.004 || c.dataCompra !== linhas[0].data_compra;
  if (mudouValor) {
    const pagas = new Set(
      db.prepare('SELECT fatura FROM faturas_pagas WHERE cartao_id = ? AND excluido_em IS NULL').all(cartao.id).map((l) => l.fatura)
    );
    const emPaga = lancamentosDoCartao(cartao).some((i) => i.compraId === req.params.compraId && pagas.has(i.fatura));
    if (emPaga) {
      return res.status(400).json({ erro: 'Esta compra tem parcela em fatura já paga: desfaça o pagamento da fatura para mudar valor ou data.' });
    }
  }

  dados.transacao(() => {
    linhas.forEach((l, i) => {
      dados.atualizar('lancamentos_cartao', l.id, {
        descricao: c.descricao, valor: credito ? -c.valores[i] : c.valores[i], data_compra: c.dataCompra, divida_id: c.dividaId,
        categoria_id: credito && ['pagamento', 'cashback'].includes(l.tipo_mov) ? null : c.categoriaId, subcategoria: c.subcategoria,
      });
    });
  });
  res.json({ ok: true });
});

// Anotação 61 — "marcar como crédito" na edição de um lançamento do cartão (ele fica verde e abate a fatura).
// GET  …/credito/parecidas : compras parecidas (até 90 dias antes) para ligar um estorno
// POST …/credito            { tipo: 'estorno'|'pagamento'|'cashback', originalCompraId?, contaId?, data? }
const lanc = require('../utils/lancamentos');
router.get('/:id/lancamentos/:compraId/credito/parecidas', (req, res) => {
  const cartao = buscarCartao(req, res);
  if (!cartao) return;
  const l = db.prepare('SELECT * FROM lancamentos_cartao WHERE cartao_id = ? AND compra_id = ? AND usuario_id = ? AND excluido_em IS NULL ORDER BY parcela_numero LIMIT 1')
    .get(cartao.id, req.params.compraId, req.usuario.id);
  if (!l) return res.status(404).json({ erro: 'Lançamento não encontrado.' });
  res.json(lanc.comprasParecidas(req.usuario.id, l));
});
router.post('/:id/lancamentos/:compraId/credito', (req, res) => {
  const cartao = buscarCartao(req, res);
  if (!cartao) return;
  if (cartao.origem !== 'manual') return res.status(400).json({ erro: 'Lançamentos de cartão conectado vêm do banco e não podem ser editados.' });
  const c = req.body || {};
  if (c.data && !faturas.dataValida(c.data)) return res.status(400).json({ erro: 'Data inválida.' });
  try {
    const existe = db.prepare('SELECT 1 FROM lancamentos_cartao WHERE cartao_id = ? AND compra_id = ? AND usuario_id = ? AND excluido_em IS NULL').get(cartao.id, req.params.compraId, req.usuario.id);
    if (!existe) return res.status(404).json({ erro: 'Lançamento não encontrado.' });
    res.json(lanc.marcarCreditoCartao(req.usuario.id, req.params.compraId, { tipo: c.tipo, originalCompraId: c.originalCompraId || null, contaId: c.contaId || null, data: c.data || null }));
  } catch (e) {
    if (e instanceof lanc.ErroLancamento) return res.status(e.status).json({ erro: e.message });
    throw e;
  }
});

router.delete('/:id/lancamentos/:compraId', (req, res) => {
  const cartao = buscarCartao(req, res);
  if (!cartao) return;

  const removidas = dados.excluirOnde('lancamentos_cartao', 'cartao_id = ? AND compra_id = ? AND usuario_id = ?',
    [cartao.id, req.params.compraId, req.usuario.id]);
  if (removidas === 0) return res.status(404).json({ erro: 'Compra não encontrada.' });
  res.json({ ok: true, parcelasRemovidas: removidas });
});

// Usado pelo Dashboard: faturas ainda por pagar (abertas e futuras), por
// cartão e por mês de vencimento.
router.faturasAPagar = function faturasAPagar(usuarioId) {
  const cartoes = db.prepare('SELECT cartoes.*, NULL AS conta_nome, NULL AS conta_icone FROM cartoes WHERE usuario_id = ? AND excluido_em IS NULL').all(usuarioId);
  const lista = [];
  cartoes.forEach((cartao) => {
    const aberta = chaveFaturaAberta(cartao);
    const pagas = new Set(
      db.prepare('SELECT fatura FROM faturas_pagas WHERE cartao_id = ? AND excluido_em IS NULL').all(cartao.id).map((l) => l.fatura)
    );
    const porFatura = {};
    lancamentosDoCartao(cartao).forEach((i) => {
      if (i.fatura >= aberta && !pagas.has(i.fatura)) porFatura[i.fatura] = (porFatura[i.fatura] || 0) + i.valor;
    });
    Object.entries(porFatura).forEach(([chave, total]) => {
      const datas = faturas.datasDaFatura(chave, cartao.dia_fechamento, cartao.dia_vencimento);
      const cred = camposCredito(cartao);
      lista.push({
        cartaoId: cartao.id,
        cartao: cartao.nome,
        icone: cartao.icone || null,
        tipoCredito: cred.tipoCredito,
        tipoCreditoRotulo: cred.tipoCreditoRotulo,
        bandeira: cred.bandeira,
        chave,
        vence: datas.vence,
        total: faturas.arredondar(total),
        aberta: chave === aberta,
      });
    });
  });
  return lista;
};

// Usado por Dívidas (anotação 60.5, juros mais caros): a última fatura fechada que já venceu e não tem pagamento
// registrado (vai para o rotativo). Uma por cartão; devolve também a taxa do cartão, se cadastrada.
router.faturasVencidas = function faturasVencidas(usuarioId) {
  const cartoes = db.prepare('SELECT cartoes.*, NULL AS conta_nome, NULL AS conta_icone FROM cartoes WHERE usuario_id = ? AND excluido_em IS NULL').all(usuarioId);
  const dia = hoje();
  const lista = [];
  cartoes.forEach((cartao) => {
    const aberta = chaveFaturaAberta(cartao);
    const [a, m] = aberta.split('-').map(Number);
    const t = a * 12 + (m - 1) - 1;
    const chave = `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
    const datas = faturas.datasDaFatura(chave, cartao.dia_fechamento, cartao.dia_vencimento);
    if (datas.vence >= dia || pagamentoDaFatura(cartao.id, chave)) return;
    const total = faturas.arredondar(lancamentosDoCartao(cartao).filter((i) => i.fatura === chave).reduce((s, i) => s + i.valor, 0));
    if (total <= 0) return;
    const cred = camposCredito(cartao);
    lista.push({ cartaoId: cartao.id, cartao: cartao.nome, chave, vence: datas.vence, total, taxaJuros: cred.taxaJuros, tipoCredito: cred.tipoCredito });
  });
  return lista;
};
router.tipoDoCartao = tipoDoCartao;

module.exports = router;
