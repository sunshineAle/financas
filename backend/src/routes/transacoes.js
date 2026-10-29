const express = require('express');
const db = require('../db');
const dados = require('../dados');
const { semPagamentoDeFatura, parcelasCartao, projecaoCartaoPorMes, chaveHoje } = require('../utils/cartaoMeses');
const { exigirAutenticacao } = require('../middleware/auth');
const lanc = require('../utils/lancamentos');

const router = express.Router();
router.use(exigirAutenticacao);

const { dataValida, arredondar } = require('../utils/faturas');
const { categorizarTransacao } = require('../utils/categorizacao');

// Categorias de entrada (receita): ficam separadas das de despesa e cada usuário gerencia as suas
// (tela Categorias). Aqui só a lista de nomes, para os formulários.
const { nomesCategoriasReceita, listarCategoriasReceita, garantirGeralDespesa, NOME_GERAL } = require('../utils/categoriasReceita');
const regrasMotor = require('../utils/regras');

router.get('/categorias-receita', (req, res) => res.json(nomesCategoriasReceita(req.usuario.id)));

const SELECT_TRANSACAO = `
  SELECT t.*, c.nome AS conta_nome, c.icone AS conta_icone, cat.nome AS categoria_nome
  FROM transacoes t
  JOIN contas c ON c.id = t.conta_id
  LEFT JOIN categorias_orcamento cat ON cat.id = t.categoria_id AND cat.excluido_em IS NULL`;

// Entradas agrupadas por categoria de receita (?mes=AAAA-MM; sem mês, tudo).
// Subcategorias já usadas (para autocompletar), da mais usada para a menos usada.
// Anos com dados (para o seletor de ano do filtro de meses, anotação 47): do primeiro lançamento até o ano seguinte ao atual.
router.get('/anos', (req, res) => {
  const r = db.prepare("SELECT MIN(substr(data, 1, 4)) AS ini FROM transacoes WHERE usuario_id = ? AND excluido_em IS NULL").get(req.usuario.id);
  const c = db.prepare("SELECT MIN(substr(data_compra, 1, 4)) AS ini FROM lancamentos_cartao WHERE usuario_id = ? AND excluido_em IS NULL").get(req.usuario.id);
  const atual = new Date().getFullYear();
  const ini = Math.min(atual, Number((r && r.ini) || atual), Number((c && c.ini) || atual));
  const anos = [];
  for (let a = Math.max(ini, atual - 15); a <= atual + 1; a++) anos.push(a);
  res.json({ anos });
});

router.get('/subcategorias', (req, res) => {
  const { categoriaId, categoriaReceita } = req.query;
  let filtro = '';
  const args = [req.usuario.id];
  if (categoriaId) { filtro = ' AND categoria_id = ?'; args.push(String(categoriaId)); }
  else if (categoriaReceita) { filtro = ' AND categoria_receita = ?'; args.push(String(categoriaReceita)); }
  const linhas = db
    .prepare(
      `SELECT TRIM(subcategoria) AS nome, COUNT(*) AS usos FROM transacoes
       WHERE usuario_id = ? AND excluido_em IS NULL AND subcategoria IS NOT NULL AND TRIM(subcategoria) <> ''${filtro}
       GROUP BY TRIM(subcategoria) COLLATE NOCASE ORDER BY usos DESC, nome ASC LIMIT 50`
    )
    .all(...args);
  const nomes = linhas.map((l) => l.nome);
  if (!categoriaReceita) {
    const doCartao = db
      .prepare(
        `SELECT TRIM(subcategoria) AS nome, COUNT(*) AS usos FROM lancamentos_cartao
         WHERE usuario_id = ? AND excluido_em IS NULL AND subcategoria IS NOT NULL AND TRIM(subcategoria) <> ''${filtro}
         GROUP BY TRIM(subcategoria) COLLATE NOCASE ORDER BY usos DESC LIMIT 50`
      )
      .all(...args);
    doCartao.forEach((l) => {
      if (!nomes.some((n) => n.toLowerCase() === l.nome.toLowerCase())) nomes.push(l.nome);
    });
  }
  res.json(nomes);
});

// Projeção das próximas faturas: parcelas de compras já lançadas nos meses FUTUROS, por mês.
// O mês atual e os anteriores já estão nas saídas reais, então não entram aqui (sem contar duas vezes).
router.get('/projecao', (req, res) => {
  const meses = projecaoCartaoPorMes(req.usuario.id);
  res.json({
    meses,
    total: arredondar(meses.reduce((s, m) => s + m.total, 0)),
    quantidadeParcelas: meses.reduce((s, m) => s + m.quantidade, 0),
  });
});

router.get('/resumo-receitas', (req, res) => {
  const { mes } = req.query;
  if (mes && !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
    return res.status(400).json({ erro: 'Mês inválido. Use o formato AAAA-MM.' });
  }
  const params = [req.usuario.id];
  let filtro = '';
  if (mes) {
    filtro = " AND mes_fin(data) = ?";
    params.push(mes);
  }
  const linhas = db
    .prepare(
      `SELECT COALESCE(categoria_receita, 'Sem categoria') AS nome, SUM(valor) AS valor, COUNT(*) AS quantidade
       FROM transacoes WHERE usuario_id = ? AND excluido_em IS NULL AND ignorada = 0 AND valor > 0${filtro}
       GROUP BY nome ORDER BY valor DESC`
    )
    .all(...params)
    .map((l) => ({ ...l, valor: arredondar(l.valor) }));
  // Toda categoria cadastrada aparece (mesmo sem lançamentos no mês); as sem categoria/antigas entram no fim
  const cadastradas = listarCategoriasReceita(req.usuario.id);
  const porNome = Object.fromEntries(linhas.map((l) => [l.nome, l]));
  const resultado = cadastradas.map((c) => ({
    id: c.id, nome: c.nome, icone: c.icone, cor: c.cor || null, valor: porNome[c.nome]?.valor || 0, quantidade: porNome[c.nome]?.quantidade || 0,
  }));
  const nomesCad = new Set(cadastradas.map((c) => c.nome));
  linhas.filter((l) => !nomesCad.has(l.nome)).forEach((l) => resultado.push({ id: null, nome: l.nome, icone: null, valor: l.valor, quantidade: l.quantidade }));
  resultado.sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome));
  res.json(resultado);
});


// ---- Transferências, estornos e vínculos (setor E1; ver CONTRATO-TRANSACOES.md) -----------------------------
const tratar = (fn) => (req, res) => {
  try {
    return fn(req, res);
  } catch (e) {
    if (e instanceof lanc.ErroLancamento) return res.status(e.status).json({ erro: e.message });
    throw e;
  }
};

// Dívidas, acordos e crediários ativos, com a parcela sugerida, para o campo "Vincular a...".
router.get('/vinculaveis', (req, res) => res.json(lanc.listarVinculaveis(req.usuario.id)));

// Pix/TED: parece para conta própria (transferência) ou para terceiro (despesa)? ?descricao=...&contaId=...
router.get('/detectar-destino', (req, res) => {
  const contas = db.prepare('SELECT id, nome FROM contas WHERE usuario_id = ? AND excluido_em IS NULL').all(req.usuario.id);
  res.json(lanc.detectarDestino(String(req.query.descricao || ''), { nomeTitular: req.usuario.nome, contas, contaAtualId: req.query.contaId ? String(req.query.contaId) : null }));
});

// Transferência entre contas próprias: saída + entrada ligadas por `vinculo`, fora dos totais; saldos das contas manuais atualizados.
router.post('/transferencia', tratar((req, res) => {
  const c = req.body || {};
  const r = lanc.criarTransferencia(req.usuario.id, {
    origemId: c.contaOrigemId, destinoId: c.contaDestinoId, valor: c.valor, data: c.data, descricao: c.descricao,
  });
  res.status(201).json(r);
}));

// Desfazer a transferência (o par inteiro).
router.delete('/transferencia/:vinculo', tratar((req, res) => {
  lanc.desfazerPar(req.usuario.id, req.params.vinculo);
  res.json({ ok: true });
}));

router.delete('/estorno/:vinculo', tratar((req, res) => {
  lanc.desfazerPar(req.usuario.id, req.params.vinculo);
  res.json({ ok: true });
}));

// Transforma um lançamento existente (ex.: Pix/TED importado) em transferência para/de uma conta própria.
router.post('/:id/transformar-em-transferencia', tratar((req, res) => {
  const c = req.body || {};
  res.json(lanc.converterEmTransferencia(req.usuario.id, req.params.id, c.contaId, { parceiraId: c.parceiraId }));
}));

// Estorno / cancelamento / devolução de uma transação de conta: anula a despesa original.
router.post('/:id/estorno', tratar((req, res) => {
  const c = req.body || {};
  res.status(201).json(lanc.estornarTransacao(req.usuario.id, req.params.id, { data: c.data, descricao: c.descricao }));
}));

// Liga um estorno que já existe (ex.: linha importada) à despesa original.
router.post('/:id/vincular-estorno', tratar((req, res) => {
  res.json(lanc.vincularEstorno(req.usuario.id, req.params.id, (req.body || {}).originalId));
}));

// Sugere a despesa original de um estorno: ?contaId=&valor=&descricao=&data=
router.get('/estorno-original', (req, res) => {
  const o = lanc.procurarOriginalDoEstorno(req.usuario.id, { contaId: req.query.contaId, valor: req.query.valor, descricao: req.query.descricao, data: req.query.data });
  res.json(o ? { id: o.id, descricao: o.descricao, valor: o.valor, data: o.data } : null);
});

// Estorno de compra no cartão (compra inteira, todas as parcelas) e como desfazer.
router.post('/estorno-cartao', tratar((req, res) => {
  const c = req.body || {};
  res.status(201).json(lanc.estornarCompraCartao(req.usuario.id, c.compraId, { descricao: c.descricao }));
}));
router.delete('/estorno-cartao/:vinculo', tratar((req, res) => {
  lanc.desfazerEstornoCartao(req.usuario.id, req.params.vinculo);
  res.json({ ok: true });
}));

// Lista com filtros opcionais: ?mes=2026-09 &contaId=3 &tipo=entrada|saida
// Sem "mes", traz as 200 mais recentes. O resumo (entradas, saídas e
// resultado) é calculado sobre tudo que passou pelo filtro, não só sobre a
// página devolvida.
router.get('/', (req, res) => {
  const { mes, contaId, tipo, categoriaId, categoriaReceita } = req.query;
  if (mes && !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
    return res.status(400).json({ erro: 'Mês inválido. Use o formato AAAA-MM.' });
  }

  const onde = ['t.usuario_id = ?', 't.excluido_em IS NULL', 'c.excluido_em IS NULL'];
  const params = [req.usuario.id];
  if (mes) {
    onde.push("mes_fin(t.data) = ?");
    params.push(mes);
  }
  if (contaId) {
    onde.push('t.conta_id = ?');
    params.push(String(contaId));
  }
  if (categoriaId) {
    onde.push('t.categoria_id = ?');
    params.push(String(categoriaId));
  }
  if (categoriaReceita) {
    onde.push('t.categoria_receita = ?');
    params.push(String(categoriaReceita));
  }
  if (tipo === 'entrada') onde.push('t.valor > 0');
  if (tipo === 'saida') onde.push('t.valor < 0');

  const filtro = onde.join(' AND ');
  const transacoes = db
    .prepare(`${SELECT_TRANSACAO} WHERE ${filtro} ORDER BY t.data DESC, t.criado_em DESC, t.rowid DESC LIMIT 500`)
    .all(...params);

  const soma = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN t.valor > 0 THEN t.valor END), 0) AS entradas,
         COALESCE(SUM(CASE WHEN t.valor < 0 THEN -t.valor END), 0) AS saidas,
         COUNT(*) AS quantidade
       FROM transacoes t JOIN contas c ON c.id = t.conta_id
       WHERE ${filtro} AND t.ignorada = 0 AND ${semPagamentoDeFatura('t.')}`
    )
    .get(...params);

  // Compras no cartão de crédito (uma linha por parcela). Entram na lista E nas saídas/resultado do mês
  // (decisão de 22/10/2026: o Saldo do mês desconta as compras do cartão). O PAGAMENTO da fatura
  // (a saída que sai da conta) fica de fora dos totais para não contar duas vezes. Sem ?mes, só contam
  // as parcelas até o mês atual; as futuras ficam na projeção (/api/transacoes/projecao).
  let doCartao = [];
  if (!contaId && !categoriaReceita && tipo !== 'entrada') {
    const argsC = [req.usuario.id];
    let filtroC = '';
    if (categoriaId) { filtroC = ' AND l.categoria_id = ?'; argsC.push(String(categoriaId)); }
    const linhasC = db
      .prepare(
        `SELECT l.*, k.nome AS cartao_nome, k.icone AS cartao_icone, k.origem AS cartao_origem, cat.nome AS categoria_nome
         FROM lancamentos_cartao l
         JOIN cartoes k ON k.id = l.cartao_id AND k.excluido_em IS NULL
         LEFT JOIN categorias_orcamento cat ON cat.id = l.categoria_id AND cat.excluido_em IS NULL
         WHERE l.usuario_id = ? AND l.excluido_em IS NULL${filtroC}
         ORDER BY l.rowid`
      )
      .all(...argsC);
    const totaisCompra = {};
    linhasC.forEach((l) => { totaisCompra[l.compra_id] = (totaisCompra[l.compra_id] || 0) + l.valor; });
    linhasC.forEach((l) => {
      const [a, m, d] = l.data_compra.split('-').map(Number);
      const total = a * 12 + (m - 1) + (l.parcela_numero - 1);
      const ano = Math.floor(total / 12);
      const mesN = (total % 12) + 1;
      const ultimo = new Date(Date.UTC(ano, mesN, 0)).getUTCDate();
      const data = `${ano}-${String(mesN).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`;
      if (mes && data.slice(0, 7) !== mes) return;
      doCartao.push({
        id: `cartao-${l.id}`,
        cartao: true,
        cartao_id: l.cartao_id,
        origem: 'cartao',
        cartao_origem: l.cartao_origem,
        compra_id: l.compra_id,
        tipo_mov: l.tipo_mov || null,
        vinculo: l.vinculo || null,
        divida_id: l.divida_id || null,
        descricao_base: l.descricao,
        data_compra: l.data_compra,
        total_parcelas: l.total_parcelas,
        valor_total_compra: arredondar(totaisCompra[l.compra_id]),
        conta_id: null,
        conta_nome: l.cartao_nome,
        conta_icone: l.cartao_icone || null,
        descricao: l.total_parcelas > 1 ? `${l.descricao} (${l.parcela_numero}/${l.total_parcelas})` : l.descricao,
        valor: -l.valor,
        data,
        categoria_id: l.categoria_id,
        categoria_nome: l.categoria_nome,
        categoria_receita: null,
        subcategoria: l.subcategoria || null,
        ignorada: 0,
      });
    });
  }
  const limiteMes = chaveHoje();
  const noTotal = doCartao.filter((t) => mes || t.data.slice(0, 7) <= limiteMes);
  const saidasCartao = noTotal.reduce((acc, t) => acc - t.valor, 0);
  const saidasTotais = arredondar(soma.saidas + saidasCartao);
  const lista = transacoes
    .concat(doCartao)
    .sort((x, y) => (x.data < y.data ? 1 : x.data > y.data ? -1 : 0))
    .slice(0, 500);

  res.json({
    transacoes: lista,
    resumo: {
      entradas: arredondar(soma.entradas),
      saidas: saidasTotais,
      saidasConta: arredondar(soma.saidas),
      saidasCartao: arredondar(saidasCartao),
      resultado: arredondar(soma.entradas - saidasTotais),
      quantidade: soma.quantidade,
      cartao: arredondar(doCartao.reduce((acc, t) => acc - t.valor, 0)),
      quantidadeCartao: doCartao.length,
    },
  });
});

// Lançamento manual de uma entrada ou saída.
// - "valor" é sempre informado positivo; "tipo" decide o sinal gravado.
// - Em conta MANUAL o saldo é ajustado na hora. Em conta conectada o saldo
//   vem do banco (a sincronização sobrescreve), então não mexemos nele.
// - Saída com categoria soma no gasto da categoria (teto do orçamento); sem
//   categoria, tenta a auto-categorização por palavra-chave.
router.post('/', (req, res) => {
  const { contaId, descricao, valor, tipo, data, categoriaId, categoriaReceita } = req.body || {};
  const subcategoria = String(req.body?.subcategoria || '').trim().slice(0, 80) || null;
  // Anotação 37: ícone do item na própria transação (chave do set, ex.: 'cat-saida-uber-taxi'); vazio = usa o da categoria.
  const icone = /^cat-[a-z0-9-]{2,60}$/.test(String(req.body?.icone || '')) ? String(req.body.icone) : null;
  if (tipo === 'entrada' && categoriaReceita && !nomesCategoriasReceita(req.usuario.id).includes(categoriaReceita)) {
    return res.status(400).json({ erro: 'Categoria de entrada inválida.' });
  }

  const texto = String(descricao || '').trim();
  if (!texto) return res.status(400).json({ erro: 'Informe uma descrição.' });
  if (tipo !== 'entrada' && tipo !== 'saida') {
    return res.status(400).json({ erro: 'Informe se é entrada ou saída.' });
  }
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero <= 0) {
    return res.status(400).json({ erro: 'Informe um valor maior que zero.' });
  }
  const dia = data || new Date().toLocaleDateString('sv-SE', {
    timeZone: process.env.APP_TIMEZONE || 'America/Sao_Paulo',
  });
  if (!dataValida(dia)) return res.status(400).json({ erro: 'Data inválida.' });

  const conta = db
    .prepare('SELECT * FROM contas WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL')
    .get(String(contaId), req.usuario.id);
  if (!conta) return res.status(400).json({ erro: 'Escolha a conta da transação.' });

  const categorias = db
    .prepare('SELECT id, nome FROM categorias_orcamento WHERE usuario_id = ? AND excluido_em IS NULL')
    .all(req.usuario.id);

  let categoria = null;
  let automatica = 0;
  if (categoriaId && tipo === 'saida') {
    categoria = categorias.find((c) => c.id === String(categoriaId));
    if (!categoria) return res.status(400).json({ erro: 'Categoria não encontrada.' });
  } else if (tipo === 'saida') {
    // 1) regras do usuário (nome + valor + conta), 2) nome da categoria na descrição, 3) "Geral"
    const achada = categorizarTransacao(texto, categorias, { usuarioId: req.usuario.id, valor: numero, contaId: conta.id });
    categoria = { id: achada || garantirGeralDespesa(req.usuario.id).id };
    automatica = 1;
  }
  let categoriaReceitaFinal = tipo === 'entrada' ? categoriaReceita || null : null;
  if (tipo === 'entrada' && !categoriaReceitaFinal) {
    const regra = regrasMotor.acharRegra(req.usuario.id, 'entrada', { descricao: texto, valor: numero, contaId: conta.id });
    if (regra && nomesCategoriasReceita(req.usuario.id).includes(regra.categoria_receita)) { categoriaReceitaFinal = regra.categoria_receita; regrasMotor.registrarUso(regra); }
    else categoriaReceitaFinal = NOME_GERAL;
  }

  const valorGravado = arredondar(tipo === 'saida' ? -numero : numero);
  if (req.body?.dividaId && tipo !== 'saida') return res.status(400).json({ erro: 'Só uma saída pode ser vinculada a uma dívida, acordo ou crediário.' });
  let novoId;
  let pagamento = null;
  try {
  dados.transacao(() => {
    novoId = dados.inserir('transacoes', {
      conta_id: conta.id, usuario_id: req.usuario.id, categoria_id: categoria ? categoria.id : null, descricao: texto,
      valor: valorGravado, data: dia, categorizacao_automatica: automatica, origem: 'manual',
      categoria_receita: categoriaReceitaFinal, subcategoria, icone,
    }).id;

    if (conta.origem === 'manual') dados.somar('contas', conta.id, 'saldo', valorGravado);
    if (categoria && valorGravado < 0) dados.somar('categorias_orcamento', categoria.id, 'gasto_atual', Math.abs(valorGravado));

    // Vincular a acordo/dívida/crediário: abate o saldo e registra a economia por antecipação (pago < parcela)
    if (req.body?.dividaId) {
      pagamento = lanc.pagarDividaComTransacao(req.usuario.id, {
        dividaId: req.body.dividaId, transacao: db.prepare('SELECT * FROM transacoes WHERE id = ?').get(novoId), valorParcela: req.body.valorParcela,
      });
    }
  });
  } catch (e) {
    if (e instanceof lanc.ErroLancamento) return res.status(e.status).json({ erro: e.message });
    throw e;
  }

  const criada = db.prepare(`${SELECT_TRANSACAO} WHERE t.id = ?`).get(novoId);
  res.status(201).json(pagamento ? { ...criada, pagamento } : criada);
});

// Apagar só vale para transações lançadas à mão (desfaz o efeito no saldo e
// na categoria). As que vieram do banco não se apagam: voltariam na próxima
// sincronização e o saldo ficaria diferente do banco.
router.delete('/:id', (req, res) => {
  const t = db
    .prepare('SELECT * FROM transacoes WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL')
    .get(req.params.id, req.usuario.id);
  if (!t) return res.status(404).json({ erro: 'Transação não encontrada.' });
  if (t.origem !== 'manual') {
    return res.status(400).json({ erro: 'Transações vindas do banco não podem ser apagadas.' });
  }

  try {
    dados.transacao(() => {
      // Par (transferência/estorno): apagar um lado desfaz o par inteiro. A despesa original estornada volta ao normal antes de sair.
      let atual = t;
      if (t.vinculo) {
        lanc.desfazerPar(req.usuario.id, t.vinculo);
        if (lanc.ehTransferencia(t.tipo_mov) || lanc.ehLinhaDeEstorno(t.tipo_mov)) return; // o par foi desfeito
        atual = db.prepare('SELECT * FROM transacoes WHERE id = ?').get(t.id);
      }
      const conta = db.prepare('SELECT * FROM contas WHERE id = ? AND excluido_em IS NULL').get(atual.conta_id);
      // Ignorada pelo usuário (1) já saiu do saldo e dos totais. As "fora dos totais" (2) mantêm o saldo.
      if (conta && conta.origem === 'manual' && atual.ignorada !== 1) dados.somar('contas', conta.id, 'saldo', -atual.valor);
      if (atual.categoria_id && atual.valor < 0 && atual.ignorada === 0) dados.somar('categorias_orcamento', atual.categoria_id, 'gasto_atual', -Math.abs(atual.valor));
      lanc.desfazerPagamentoDaTransacao(atual.id); // se pagava dívida/acordo, o saldo dela volta
      dados.excluirOnde('faturas_pagas', 'transacao_id = ?', [atual.id]); // desmarca a fatura paga
      dados.excluir('transacoes', atual.id);
    });
  } catch (e) {
    if (e instanceof lanc.ErroLancamento) return res.status(e.status).json({ erro: e.message });
    throw e;
  }

  res.json({ ok: true });
});

// Ignorar / reativar: a transação continua na lista, mas sai (ou volta) de todos
// os cálculos: saldo da conta manual, gasto da categoria, totais e dashboard.
router.put('/:id/ignorar', (req, res) => {
  const t = db
    .prepare('SELECT * FROM transacoes WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL')
    .get(req.params.id, req.usuario.id);
  if (!t) return res.status(404).json({ erro: 'Transação não encontrada.' });

  if (t.tipo_mov) return res.status(400).json({ erro: 'Transferências e estornos já ficam fora dos totais; para desfazer, apague o lançamento.' });
  const ignorar = req.body?.ignorada === undefined ? !t.ignorada : !!req.body.ignorada;
  if (ignorar === !!t.ignorada) return res.json(db.prepare(`${SELECT_TRANSACAO} WHERE t.id = ?`).get(t.id));

  dados.transacao(() => {
    const sinal = ignorar ? -1 : 1; // ignorar desfaz o efeito; reativar aplica de novo
    const conta = db.prepare('SELECT * FROM contas WHERE id = ? AND excluido_em IS NULL').get(t.conta_id);
    if (conta && conta.origem === 'manual') dados.somar('contas', conta.id, 'saldo', sinal * t.valor);
    if (t.categoria_id && t.valor < 0) dados.somar('categorias_orcamento', t.categoria_id, 'gasto_atual', sinal * Math.abs(t.valor));
    dados.atualizar('transacoes', t.id, { ignorada: ignorar ? 1 : 0 });
  });
  res.json(db.prepare(`${SELECT_TRANSACAO} WHERE t.id = ?`).get(t.id));
});

// Editar. Nas lançadas à mão tudo pode mudar: tipo (entrada/saída), descrição, valor, data, conta,
// categoria e subcategoria; o saldo das contas manuais e o gasto da categoria são refeitos.
// Nas que vieram do banco (Open Finance) só categoria e subcategoria: o resto é do banco.
router.put('/:id', (req, res) => {
  const t = db
    .prepare('SELECT * FROM transacoes WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL')
    .get(req.params.id, req.usuario.id);
  if (!t) return res.status(404).json({ erro: 'Transação não encontrada.' });

  const corpo = req.body || {};
  const manual = t.origem === 'manual';

  let descricao = t.descricao;
  if (corpo.descricao !== undefined && manual) {
    descricao = String(corpo.descricao).trim();
    if (!descricao) return res.status(400).json({ erro: 'Informe uma descrição.' });
  }
  let data = t.data;
  if (corpo.data !== undefined && manual) {
    if (!dataValida(corpo.data)) return res.status(400).json({ erro: 'Data inválida.' });
    data = corpo.data;
  }

  // Tipo, valor e conta (só manual)
  let valor = t.valor;
  let contaId = t.conta_id;
  if (manual) {
    const tipoNovo = corpo.tipo === undefined ? (t.valor < 0 ? 'saida' : 'entrada') : corpo.tipo;
    if (tipoNovo !== 'entrada' && tipoNovo !== 'saida') return res.status(400).json({ erro: 'Informe se é entrada ou saída.' });
    const abs = corpo.valor === undefined ? Math.abs(t.valor) : Number(corpo.valor);
    if (!Number.isFinite(abs) || abs <= 0) return res.status(400).json({ erro: 'Informe um valor maior que zero.' });
    valor = arredondar(tipoNovo === 'saida' ? -abs : abs);
    if (corpo.contaId !== undefined && String(corpo.contaId) !== t.conta_id) {
      const conta = db.prepare('SELECT id FROM contas WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(String(corpo.contaId), req.usuario.id);
      if (!conta) return res.status(400).json({ erro: 'Conta não encontrada.' });
      contaId = conta.id;
    }
    if ((valor !== t.valor || contaId !== t.conta_id) && t.tipo_mov) {
      return res.status(400).json({ erro: 'Este lançamento faz parte de uma transferência ou estorno: valor, tipo e conta não podem mudar. Para refazer, desfaça (apague) e lance de novo.' });
    }
    if (valor !== t.valor || contaId !== t.conta_id) {
      const ligada = db.prepare('SELECT 1 FROM historico_pagamentos WHERE transacao_id = ? AND excluido_em IS NULL').get(t.id)
        || db.prepare('SELECT 1 FROM faturas_pagas WHERE transacao_id = ? AND excluido_em IS NULL').get(t.id);
      if (ligada) {
        return res.status(400).json({ erro: 'Esta transação está ligada ao pagamento de uma dívida ou fatura: valor, tipo e conta não podem mudar. Descrição, data e categoria sim.' });
      }
    }
  }

  const ehEntrada = valor > 0;
  let categoriaReceita = t.categoria_receita;
  if (corpo.categoriaReceita !== undefined && ehEntrada) {
    if (corpo.categoriaReceita && !nomesCategoriasReceita(req.usuario.id).includes(corpo.categoriaReceita)) {
      return res.status(400).json({ erro: 'Categoria de entrada inválida.' });
    }
    categoriaReceita = corpo.categoriaReceita || null;
  }
  if (!ehEntrada) categoriaReceita = null;
  const subcategoria = corpo.subcategoria === undefined ? t.subcategoria : String(corpo.subcategoria || '').trim().slice(0, 80) || null;
  // Ícone do item: pode mudar em qualquer transação (manual ou do banco). '' = volta a usar o da categoria.
  const icone = corpo.icone === undefined ? t.icone : (/^cat-[a-z0-9-]{2,60}$/.test(String(corpo.icone || '')) ? String(corpo.icone) : null);

  let categoriaId = t.categoria_id;
  let automatica = t.categorizacao_automatica;
  if (ehEntrada) {
    categoriaId = null;
  } else if (corpo.categoriaId !== undefined) {
    categoriaId = corpo.categoriaId ? String(corpo.categoriaId) : null;
    if (categoriaId) {
      const existe = db.prepare('SELECT id FROM categorias_orcamento WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(categoriaId, req.usuario.id);
      if (!existe) return res.status(400).json({ erro: 'Categoria não encontrada.' });
    }
    automatica = 0;
  }

  dados.transacao(() => {
    if (t.ignorada !== 1) {
      // Desfaz o efeito antigo e aplica o novo (só conta manual mexe no saldo; o do banco vem do banco)
      const contaAntiga = db.prepare('SELECT origem FROM contas WHERE id = ? AND excluido_em IS NULL').get(t.conta_id);
      const contaNova = db.prepare('SELECT origem FROM contas WHERE id = ? AND excluido_em IS NULL').get(contaId);
      if (contaAntiga && contaAntiga.origem === 'manual') dados.somar('contas', t.conta_id, 'saldo', -t.valor);
      if (contaNova && contaNova.origem === 'manual') dados.somar('contas', contaId, 'saldo', valor);
    }
    if (t.ignorada === 0) {
      // O gasto da categoria só muda para o que conta nos totais (fora dos totais = transferência/estorno não entra)
      if (t.categoria_id && t.valor < 0) dados.somar('categorias_orcamento', t.categoria_id, 'gasto_atual', -Math.abs(t.valor));
      if (categoriaId && valor < 0) dados.somar('categorias_orcamento', categoriaId, 'gasto_atual', Math.abs(valor));
    }
    dados.atualizar('transacoes', t.id, {
      descricao, data, valor, conta_id: contaId, categoria_id: categoriaId, categorizacao_automatica: automatica,
      categoria_receita: categoriaReceita, subcategoria, icone,
    });
  });

  res.json(db.prepare(`${SELECT_TRANSACAO} WHERE t.id = ?`).get(t.id));
});

module.exports = router;
