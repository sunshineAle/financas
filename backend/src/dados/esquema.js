// Esquema do banco (Fase 0): fonte única das tabelas, colunas, chaves entre tabelas e regras de exclusão.
//
// Regras de todas as tabelas de dados:
//  - id TEXT (UUID) como chave; as ligações entre tabelas guardam o UUID;
//  - criado_em / alterado_em (ISO 8601 UTC) e alterado_por_aparelho (id do aparelho que gravou);
//  - excluido_em: exclusão suave (a linha continua no banco; toda consulta ignora excluido_em preenchido);
//  - sem FOREIGN KEY declarada: a integridade é feita pela camada `dados` (cascata/anulação em `RELACOES`)
//    e conferida na migração. Isso deixa a importação/mescla de backups livre de problemas de ordem.
//
// Este arquivo não usa nada de Node (só texto), então roda igual no servidor e dentro do navegador (PWA).

// Gera um UUID v4 no próprio SQLite: serve de reserva para quem gravar sem passar pela camada `dados`.
const SQL_UUID =
  "lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || " +
  "substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))";
const SQL_AGORA = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

const VERSAO_ESQUEMA = 1;

const PADRAO_CARIMBOS = [
  `id TEXT PRIMARY KEY NOT NULL DEFAULT (${SQL_UUID})`,
  `criado_em TEXT NOT NULL DEFAULT (${SQL_AGORA})`,
  `alterado_em TEXT NOT NULL DEFAULT (${SQL_AGORA})`,
  'alterado_por_aparelho TEXT',
  'excluido_em TEXT',
];
const COLUNAS_CARIMBO = ['id', 'criado_em', 'alterado_em', 'alterado_por_aparelho', 'excluido_em'];

// `cols`: colunas de dados (sem os carimbos). `fk`: coluna -> tabela a que ela aponta.
// `exporta`: entra no arquivo .sfin. `secretos`: campos que nunca vão para o diário nem para o backup.
// `unica`: coluna que só pode ter UMA linha ativa (ex.: uma reserva por usuário).
const TABELAS = {
  usuarios: {
    cols: ['email TEXT NOT NULL', 'senha_hash TEXT NOT NULL', 'nome TEXT', 'sessao_versao INTEGER NOT NULL DEFAULT 1'],
    fk: {},
    exporta: false,
    secretos: ['senha_hash'],
    indices: ['CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email)'],
  },
  configuracoes: {
    cols: [
      'usuario_id TEXT NOT NULL',
      'notificar_categoria_estourada INTEGER NOT NULL DEFAULT 1',
      'notificar_fatura_proxima INTEGER NOT NULL DEFAULT 1',
      // Anotação 54: início do mês financeiro (JSON {tipo,dia|n}); vai no backup para restaurar igual em outro aparelho.
      'inicio_mes TEXT',
    ],
    fk: { usuario_id: 'usuarios' },
    exporta: true,
    unica: 'usuario_id',
    indices: ['CREATE UNIQUE INDEX IF NOT EXISTS idx_configuracoes_usuario ON configuracoes(usuario_id) WHERE excluido_em IS NULL'],
  },
  conexoes_pluggy: {
    cols: [
      'usuario_id TEXT NOT NULL',
      'item_id TEXT NOT NULL',
      'banco TEXT',
      "status TEXT NOT NULL DEFAULT 'ativa'",
      'ultima_sincronizacao TEXT',
      'ultimo_erro TEXT',
    ],
    fk: { usuario_id: 'usuarios' },
    exporta: true,
    indices: ['CREATE UNIQUE INDEX IF NOT EXISTS idx_conexoes_item ON conexoes_pluggy(usuario_id, item_id) WHERE excluido_em IS NULL'],
  },
  contas: {
    cols: [
      'usuario_id TEXT NOT NULL',
      'nome TEXT NOT NULL',
      "tipo TEXT NOT NULL DEFAULT 'corrente'",
      "origem TEXT NOT NULL DEFAULT 'manual'",
      'saldo REAL NOT NULL DEFAULT 0',
      'cor TEXT',
      'icone TEXT',
      'id_externo TEXT',
      'conexao_id TEXT',
    ],
    fk: { usuario_id: 'usuarios', conexao_id: 'conexoes_pluggy' },
    exporta: true,
    indices: ['CREATE INDEX IF NOT EXISTS idx_contas_usuario ON contas(usuario_id)'],
  },
  categorias_orcamento: {
    cols: [
      'usuario_id TEXT NOT NULL',
      'nome TEXT NOT NULL',
      'teto_mensal REAL NOT NULL',
      'gasto_atual REAL NOT NULL DEFAULT 0',
      'icone TEXT',
      'cor TEXT',
    ],
    fk: { usuario_id: 'usuarios' },
    exporta: true,
    indices: ['CREATE INDEX IF NOT EXISTS idx_categorias_usuario ON categorias_orcamento(usuario_id)'],
  },
  categorias_receita: {
    cols: ['usuario_id TEXT NOT NULL', 'nome TEXT NOT NULL', 'icone TEXT', 'cor TEXT'],
    fk: { usuario_id: 'usuarios' },
    exporta: true,
    indices: ['CREATE INDEX IF NOT EXISTS idx_categorias_receita_usuario ON categorias_receita(usuario_id)'],
  },
  // Marca "as categorias de receita padrão já foram criadas para este usuário".
  categorias_receita_init: {
    cols: ['usuario_id TEXT NOT NULL'],
    fk: { usuario_id: 'usuarios' },
    exporta: true,
    unica: 'usuario_id',
    indices: ['CREATE UNIQUE INDEX IF NOT EXISTS idx_cat_receita_init_usuario ON categorias_receita_init(usuario_id) WHERE excluido_em IS NULL'],
  },
  dividas: {
    cols: [
      'usuario_id TEXT NOT NULL',
      'nome TEXT NOT NULL',
      'saldo_original REAL NOT NULL',
      'saldo REAL NOT NULL',
      'taxa_juros REAL',
      "urgencia TEXT NOT NULL DEFAULT 'amarelo'",
      'arquivada INTEGER NOT NULL DEFAULT 0',
      'conta_id TEXT',
      // Setor F (Dívidas): tipo/acordo/parcelas/risco. Ver CONTRATO-DIVIDAS.md
      "tipo TEXT NOT NULL DEFAULT 'outra'",
      'credor TEXT',
      'negativada INTEGER NOT NULL DEFAULT 0',
      'valor_base REAL',
      'desconto REAL NOT NULL DEFAULT 0',
      'entrada REAL NOT NULL DEFAULT 0',
      'parcelas_total INTEGER',
      'parcelas_pagas INTEGER NOT NULL DEFAULT 0',
      'valor_parcela REAL',
      'proximo_vencimento TEXT',
      "status TEXT NOT NULL DEFAULT 'ativa'",
      'encargos_pct REAL NOT NULL DEFAULT 5',
      'quebrado_em TEXT',
      'urgencia_base TEXT',
      // Onda 5 (Setor A): origem (de onde veio) e situação (como está) são campos separados; `tipo` fica sincronizado.
      'origem TEXT',
      'situacao TEXT',
    ],
    fk: { usuario_id: 'usuarios', conta_id: 'contas' },
    exporta: true,
    indices: ['CREATE INDEX IF NOT EXISTS idx_dividas_usuario ON dividas(usuario_id)'],
  },
  transacoes: {
    cols: [
      'conta_id TEXT NOT NULL',
      'usuario_id TEXT NOT NULL',
      'categoria_id TEXT',
      'descricao TEXT NOT NULL',
      'valor REAL NOT NULL',
      'data TEXT NOT NULL',
      'categorizacao_automatica INTEGER NOT NULL DEFAULT 0',
      "origem TEXT NOT NULL DEFAULT 'conectada'",
      'categoria_receita TEXT',
      'id_externo TEXT',
      'subcategoria TEXT',
      'ignorada INTEGER NOT NULL DEFAULT 0',
      // Lançamentos ligados em par (setor E1): 'transferencia_interna' | 'estorno' (o lançamento que estorna) | 'estornada' (o original).
      // `vinculo` é o UUID compartilhado pelo par. ignorada = 2 quer dizer "fora dos totais, mas o saldo da conta continua valendo".
      'tipo_mov TEXT',
      'vinculo TEXT',
      // Anotação 37: ícone do ITEM na própria transação (chave do set v2, ex.: 'cat-saida-uber-taxi'); vazio = usa o da categoria.
      'icone TEXT',
      // Anotação 38: rótulo do movimento ("Resgate · Reserva de Liberdade") e a decisão tomada na revisão
      // ('vinculado' | 'externo' | 'comum' | 'recusado'), para a sugestão não voltar.
      'rotulo_mov TEXT',
      'revisao TEXT',
    ],
    fk: { conta_id: 'contas', usuario_id: 'usuarios', categoria_id: 'categorias_orcamento' },
    exporta: true,
    indices: [
      'CREATE INDEX IF NOT EXISTS idx_transacoes_conta ON transacoes(conta_id)',
      'CREATE INDEX IF NOT EXISTS idx_transacoes_usuario_data ON transacoes(usuario_id, data)',
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_transacoes_externo ON transacoes(usuario_id, id_externo) WHERE id_externo IS NOT NULL AND excluido_em IS NULL',
    ],
  },
  historico_pagamentos: {
    cols: [
      'divida_id TEXT NOT NULL',
      'valor REAL NOT NULL',
      `data TEXT NOT NULL DEFAULT (datetime('now'))`,
      'transacao_id TEXT',
      // Economia por antecipação: parcela cheia - valor pago (0 quando pagou a parcela inteira).
      'desconto_antecipacao REAL NOT NULL DEFAULT 0',
      'valor_parcela REAL',
      // Setor F: pagamento | entrada | acordo | quebra (eventos sem dinheiro novo) e nota livre
      "tipo TEXT NOT NULL DEFAULT 'pagamento'",
      'observacao TEXT',
    ],
    fk: { divida_id: 'dividas', transacao_id: 'transacoes' },
    exporta: true,
    indices: ['CREATE INDEX IF NOT EXISTS idx_hist_pagamentos_divida ON historico_pagamentos(divida_id)'],
  },
  reserva_liberdade: {
    cols: ['usuario_id TEXT NOT NULL', 'meta REAL NOT NULL', 'valor_atual REAL NOT NULL DEFAULT 0'],
    fk: { usuario_id: 'usuarios' },
    exporta: true,
    unica: 'usuario_id',
    indices: ['CREATE UNIQUE INDEX IF NOT EXISTS idx_reserva_usuario ON reserva_liberdade(usuario_id) WHERE excluido_em IS NULL'],
  },
  metas_reserva: {
    cols: [
      'reserva_id TEXT NOT NULL',
      "nome TEXT NOT NULL DEFAULT 'Reserva de Liberdade'",
      'icone TEXT',
      'tipo_investimento TEXT',
      'valor_meta REAL NOT NULL',
      'prazo TEXT',
      // Anotação 56: meta ligada a uma caixinha do banco — conta e nome como aparece no extrato (apelidos separados por ';').
      'caixinha_conta_id TEXT',
      'caixinha_nome TEXT',
    ],
    fk: { reserva_id: 'reserva_liberdade' },
    exporta: true,
    indices: ['CREATE INDEX IF NOT EXISTS idx_metas_reserva ON metas_reserva(reserva_id)'],
  },
  historico_aportes: {
    cols: [
      'reserva_id TEXT NOT NULL',
      'valor REAL NOT NULL',
      `data TEXT NOT NULL DEFAULT (datetime('now'))`,
      "tipo TEXT NOT NULL DEFAULT 'mensal'",
      'descricao TEXT',
      'conta_id TEXT',
      "operacao TEXT NOT NULL DEFAULT 'aporte'",
      'ativo TEXT',
      'quantidade REAL',
      'preco_unitario REAL',
      'meta_id TEXT',
    ],
    fk: { reserva_id: 'reserva_liberdade', conta_id: 'contas', meta_id: 'metas_reserva' },
    exporta: true,
    indices: ['CREATE INDEX IF NOT EXISTS idx_aportes_reserva ON historico_aportes(reserva_id)'],
  },
  cartoes: {
    cols: [
      'usuario_id TEXT NOT NULL',
      'conta_id TEXT',
      'nome TEXT NOT NULL',
      'limite REAL',
      'dia_fechamento INTEGER NOT NULL',
      'dia_vencimento INTEGER NOT NULL',
      "origem TEXT NOT NULL DEFAULT 'manual'",
      'id_externo TEXT',
      'conexao_id TEXT',
      'icone TEXT',
      'cor TEXT',
      // Onda 9 (anotações 53 e 58): tipo de crédito ('cartao' | 'loja' | 'crediario'; vazio = cartão de crédito),
      // juros ao mês (%) e CET ao ano (%) opcionais, e a bandeira ('mastercard' | 'visa' | 'elo' | 'amex' | 'hipercard').
      'tipo_credito TEXT',
      'taxa_juros REAL',
      'cet REAL',
      'bandeira TEXT',
    ],
    fk: { usuario_id: 'usuarios', conta_id: 'contas', conexao_id: 'conexoes_pluggy' },
    exporta: true,
    indices: ['CREATE INDEX IF NOT EXISTS idx_cartoes_usuario ON cartoes(usuario_id)'],
  },
  lancamentos_cartao: {
    cols: [
      'cartao_id TEXT NOT NULL',
      'usuario_id TEXT NOT NULL',
      'compra_id TEXT NOT NULL',
      'descricao TEXT NOT NULL',
      'valor REAL NOT NULL',
      'data_compra TEXT NOT NULL',
      'parcela_numero INTEGER NOT NULL DEFAULT 1',
      'total_parcelas INTEGER NOT NULL DEFAULT 1',
      'divida_id TEXT',
      'id_externo TEXT',
      'categoria_id TEXT',
      'subcategoria TEXT',
      // Estorno de compra no cartão (setor E1): parcelas espelho com valor negativo; 'estorno' | 'estornada'.
      'tipo_mov TEXT',
      'vinculo TEXT',
    ],
    fk: { cartao_id: 'cartoes', usuario_id: 'usuarios', divida_id: 'dividas', categoria_id: 'categorias_orcamento' },
    exporta: true,
    indices: [
      'CREATE INDEX IF NOT EXISTS idx_lancamentos_cartao ON lancamentos_cartao(cartao_id)',
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_lancamentos_externo ON lancamentos_cartao(usuario_id, id_externo) WHERE id_externo IS NOT NULL AND excluido_em IS NULL',
    ],
  },
  faturas_pagas: {
    cols: [
      'cartao_id TEXT NOT NULL',
      'fatura TEXT NOT NULL',
      'conta_id TEXT',
      'transacao_id TEXT',
      'valor REAL NOT NULL',
      'data TEXT NOT NULL',
      // Regras da fatura (setor J): 'valor' = o que foi PAGO; a diferença para o total da fatura é 'desconto' (a menos)
      // OU 'parcelado' (restante que vai para as próximas faturas e vira dívida em 'divida_id'). Nunca os dois.
      'desconto REAL NOT NULL DEFAULT 0',
      'parcelado REAL NOT NULL DEFAULT 0',
      'divida_id TEXT',
    ],
    fk: { cartao_id: 'cartoes', conta_id: 'contas', transacao_id: 'transacoes', divida_id: 'dividas' },
    exporta: true,
    indices: ['CREATE UNIQUE INDEX IF NOT EXISTS idx_faturas_pagas ON faturas_pagas(cartao_id, fatura) WHERE excluido_em IS NULL'],
  },
  investimentos_conectados: {
    cols: [
      'usuario_id TEXT NOT NULL',
      'conexao_id TEXT NOT NULL',
      'id_externo TEXT NOT NULL',
      'nome TEXT NOT NULL',
      'tipo TEXT',
      'saldo REAL NOT NULL DEFAULT 0',
      `atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))`,
    ],
    fk: { usuario_id: 'usuarios', conexao_id: 'conexoes_pluggy' },
    exporta: true,
    indices: ['CREATE INDEX IF NOT EXISTS idx_invest_conexao ON investimentos_conectados(conexao_id)'],
  },
  // Custos fixos mensais (aluguel, internet...): entram na projeção do mês seguinte (rota /api/custos-fixos/projecao).
  custos_fixos: {
    cols: [
      'usuario_id TEXT NOT NULL',
      'nome TEXT NOT NULL',
      'valor REAL NOT NULL',
      'dia_mes INTEGER NOT NULL DEFAULT 1',
      'categoria_id TEXT',
      'ativo INTEGER NOT NULL DEFAULT 1',
      // Homologação 1.0 (seção 12): recorrência com prazo — N meses a partir de inicio_mes (AAAA-MM); null = sem prazo.
      'meses_total INTEGER',
      'inicio_mes TEXT',
    ],
    fk: { usuario_id: 'usuarios', categoria_id: 'categorias_orcamento' },
    exporta: true,
    indices: ['CREATE INDEX IF NOT EXISTS idx_custos_fixos_usuario ON custos_fixos(usuario_id)'],
  },
  // Anotação 41/43: Custo de vida › Essenciais — gastos do mês que mudam de valor (luz, água, mercado...), ligados a uma
  // categoria. O valor estimado é a média dos últimos 6 meses da categoria; valor_manual (opcional) fixa outro valor.
  custos_essenciais: {
    cols: [
      'usuario_id TEXT NOT NULL',
      'categoria_id TEXT NOT NULL',
      'nome TEXT',
      'valor_manual REAL',
      'dia_mes INTEGER',
      'ativo INTEGER NOT NULL DEFAULT 1',
    ],
    fk: { usuario_id: 'usuarios', categoria_id: 'categorias_orcamento' },
    exporta: true,
    indices: ['CREATE INDEX IF NOT EXISTS idx_custos_essenciais_usuario ON custos_essenciais(usuario_id)'],
  },
  // Setor B (onda 5): regras de categorização ("Padaria do José" -> Mercado). `padrao` = trecho do nome (sem acento/maiúscula);
  // valor_min/valor_max e conta_id são filtros opcionais. Saída aponta categoria_id; entrada, o nome em categoria_receita.
  regras_categorias: {
    cols: [
      'usuario_id TEXT NOT NULL',
      "tipo TEXT NOT NULL DEFAULT 'saida'",
      'padrao TEXT NOT NULL',
      'valor_min REAL',
      'valor_max REAL',
      'conta_id TEXT',
      'categoria_id TEXT',
      'categoria_receita TEXT',
      'ativa INTEGER NOT NULL DEFAULT 1',
      'aplicacoes INTEGER NOT NULL DEFAULT 0',
      // Anotação 48: subcategoria e ícone do ITEM (chave do set v2) que a regra grava junto com a categoria.
      'subcategoria TEXT',
      'icone TEXT',
      // Homologação 1.0, seção 15: regra com destino além de categoria (tipo 'reserva'):
      // destino = 'guardar' | 'resgatar' (meta_id) ou 'aporte' | 'resgate_inv' (ativo_id). Nada disso conta como entrada/saída.
      'destino TEXT',
      'meta_id TEXT',
      'ativo_id TEXT',
    ],
    fk: { usuario_id: 'usuarios', conta_id: 'contas', categoria_id: 'categorias_orcamento' },
    exporta: true,
    indices: ['CREATE INDEX IF NOT EXISTS idx_regras_categorias_usuario ON regras_categorias(usuario_id)'],
  },
  // Setor G: ativos da carteira (um por ticker/produto) e suas operações. `liquidez` 'rapida' pode ser vinculada a metas.
  ativos: {
    cols: [
      'usuario_id TEXT NOT NULL',
      'nome TEXT NOT NULL',
      'ticker TEXT',
      "tipo TEXT NOT NULL DEFAULT 'cdb'",
      "liquidez TEXT NOT NULL DEFAULT 'rapida'",
      'corretora_conta_id TEXT',
    ],
    fk: { usuario_id: 'usuarios', corretora_conta_id: 'contas' },
    exporta: true,
    indices: ['CREATE INDEX IF NOT EXISTS idx_ativos_usuario ON ativos(usuario_id)'],
  },
  // tipo: compra | venda | guardar | resgatar | provento | rendimento (e, sem ativo: transferencia | reserva_recusada). `aporte_id` liga ao lançamento da meta (historico_aportes);
  // `transacao_id` liga ao extrato quando a compra é conciliada pela transferência (sem corretora cadastrada).
  operacoes: {
    cols: [
      'ativo_id TEXT',
      'usuario_id TEXT NOT NULL',
      'tipo TEXT NOT NULL',
      'data TEXT NOT NULL',
      'cotas REAL',
      'preco REAL',
      'total REAL NOT NULL',
      'meta_id TEXT',
      'conta_id TEXT',
      'aporte_id TEXT',
      'transacao_id TEXT',
      'descricao TEXT',
    ],
    fk: { ativo_id: 'ativos', usuario_id: 'usuarios', meta_id: 'metas_reserva', conta_id: 'contas', aporte_id: 'historico_aportes', transacao_id: 'transacoes' },
    exporta: true,
    indices: [
      'CREATE INDEX IF NOT EXISTS idx_operacoes_ativo ON operacoes(ativo_id)',
      'CREATE INDEX IF NOT EXISTS idx_operacoes_usuario ON operacoes(usuario_id, data)',
    ],
  },
  // Legado (nunca usado pelas telas): fica para não perder dados de bancos antigos. Nunca exportado.
  // Importação de extratos e faturas (setor H). Cada importação guarda o que criou/alterou para poder ser desfeita.
  importacoes: {
    cols: [
      'usuario_id TEXT NOT NULL',
      "tipo TEXT NOT NULL DEFAULT 'conta'", // 'conta' | 'fatura'
      'conta_id TEXT',
      'cartao_id TEXT',
      'formato TEXT',
      'arquivo_nome TEXT',
      'banco TEXT',
      'periodo_inicio TEXT',
      'periodo_fim TEXT',
      'fatura TEXT',
      'qtd_total INTEGER NOT NULL DEFAULT 0',
      'qtd_novas INTEGER NOT NULL DEFAULT 0',
      'qtd_atualizadas INTEGER NOT NULL DEFAULT 0',
      'qtd_ignoradas INTEGER NOT NULL DEFAULT 0',
      'desfeita_em TEXT',
    ],
    fk: { usuario_id: 'usuarios', conta_id: 'contas', cartao_id: 'cartoes' },
    exporta: true,
    indices: ['CREATE INDEX IF NOT EXISTS idx_importacoes_usuario ON importacoes(usuario_id)'],
  },
  importacao_itens: {
    cols: [
      'importacao_id TEXT NOT NULL',
      'tabela TEXT NOT NULL', // transacoes | lancamentos_cartao | faturas_pagas | historico_aportes
      'registro_id TEXT NOT NULL',
      'formato TEXT', // ofx | csv | xlsx | pdf (origem do registro)
      "acao TEXT NOT NULL DEFAULT 'inserido'", // inserido | atualizado | anulado
      'antes TEXT', // JSON com os campos anteriores (atualizado/anulado), para desfazer
    ],
    fk: { importacao_id: 'importacoes' },
    exporta: true,
    indices: ['CREATE INDEX IF NOT EXISTS idx_importacao_itens ON importacao_itens(importacao_id)'],
  },
  perfis_importacao: {
    cols: [
      'usuario_id TEXT NOT NULL',
      'nome TEXT NOT NULL',
      'formato TEXT',
      'assinatura TEXT NOT NULL', // cabeçalho normalizado: reconhece o mesmo layout na próxima vez
      'mapeamento TEXT NOT NULL', // JSON: colunas de data, descrição, valor...
    ],
    fk: { usuario_id: 'usuarios' },
    exporta: true,
    indices: ['CREATE INDEX IF NOT EXISTS idx_perfis_importacao ON perfis_importacao(usuario_id)'],
  },
  tokens_open_finance: {
    cols: [
      'conta_id TEXT NOT NULL',
      'item_id TEXT NOT NULL',
      'token_criptografado TEXT NOT NULL',
      "status TEXT NOT NULL DEFAULT 'ativo'",
      'ultima_sincronizacao TEXT',
    ],
    fk: { conta_id: 'contas' },
    exporta: false,
    secretos: ['token_criptografado'],
    indices: [],
  },
};

const nomeDaColuna = (def) => def.split(/\s+/)[0];
for (const [nome, t] of Object.entries(TABELAS)) {
  t.nome = nome;
  t.colunas = t.cols.map(nomeDaColuna); // só as de dados
  t.todas = [...COLUNAS_CARIMBO, ...t.colunas];
  t.secretos = t.secretos || [];
}

// Ordem "pais antes dos filhos" (usada na criação, na cópia da migração e na importação).
const ORDEM = [
  'usuarios', 'configuracoes', 'conexoes_pluggy', 'contas', 'categorias_orcamento', 'categorias_receita',
  'categorias_receita_init', 'dividas', 'transacoes', 'historico_pagamentos', 'reserva_liberdade',
  'metas_reserva', 'historico_aportes', 'cartoes', 'lancamentos_cartao', 'faturas_pagas',
  'investimentos_conectados', 'ativos', 'operacoes', 'custos_fixos', 'custos_essenciais', 'regras_categorias', 'importacoes', 'importacao_itens', 'perfis_importacao', 'tokens_open_finance',
];

// O que acontece com os filhos quando o pai é excluído (o mesmo que o ON DELETE do esquema antigo).
//  cascata: o filho também é excluído; anular: a coluna do filho vira NULL.
const RELACOES = {
  contas: {
    cascata: [['transacoes', 'conta_id'], ['tokens_open_finance', 'conta_id']],
    anular: [['regras_categorias', 'conta_id'], ['cartoes', 'conta_id'], ['dividas', 'conta_id'], ['historico_aportes', 'conta_id'], ['ativos', 'corretora_conta_id'], ['operacoes', 'conta_id']],
  },
  dividas: { cascata: [['historico_pagamentos', 'divida_id']], anular: [['lancamentos_cartao', 'divida_id']] },
  categorias_orcamento: { cascata: [['regras_categorias', 'categoria_id'], ['custos_essenciais', 'categoria_id']], anular: [['transacoes', 'categoria_id'], ['lancamentos_cartao', 'categoria_id'], ['custos_fixos', 'categoria_id']] },
  reserva_liberdade: { cascata: [['historico_aportes', 'reserva_id'], ['metas_reserva', 'reserva_id']] },
  metas_reserva: { anular: [['historico_aportes', 'meta_id'], ['operacoes', 'meta_id']] },
  ativos: { cascata: [['operacoes', 'ativo_id']] },
  cartoes: { cascata: [['lancamentos_cartao', 'cartao_id'], ['faturas_pagas', 'cartao_id']] },
  conexoes_pluggy: { cascata: [['investimentos_conectados', 'conexao_id']] },
  importacoes: { cascata: [['importacao_itens', 'importacao_id']] },
};

function sqlTabela(nome, sufixo = '') {
  const t = TABELAS[nome];
  return `CREATE TABLE IF NOT EXISTS ${nome}${sufixo} (\n  ${[...PADRAO_CARIMBOS, ...t.cols].join(',\n  ')}\n)`;
}

const SQL_APARELHO = `CREATE TABLE IF NOT EXISTS aparelho (
  id TEXT PRIMARY KEY NOT NULL,
  nome TEXT,
  criado_em TEXT NOT NULL DEFAULT (${SQL_AGORA})
)`;

const SQL_DIARIO = `CREATE TABLE IF NOT EXISTS diario_alteracoes (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (${SQL_UUID}),
  tabela TEXT NOT NULL,
  registro_id TEXT NOT NULL,
  operacao TEXT NOT NULL,
  antes TEXT,
  depois TEXT,
  aparelho TEXT,
  em TEXT NOT NULL DEFAULT (${SQL_AGORA})
)`;
const SQL_DIARIO_INDICES = [
  'CREATE INDEX IF NOT EXISTS idx_diario_registro ON diario_alteracoes(tabela, registro_id)',
  'CREATE INDEX IF NOT EXISTS idx_diario_em ON diario_alteracoes(em)',
];
const COLUNAS_DIARIO = ['id', 'tabela', 'registro_id', 'operacao', 'antes', 'depois', 'aparelho', 'em'];

// Cria (se faltar) tudo do esquema atual.
function criarEsquema(db) {
  db.exec(SQL_APARELHO);
  db.exec(SQL_DIARIO);
  SQL_DIARIO_INDICES.forEach((s) => db.exec(s));
  for (const nome of ORDEM) {
    db.exec(sqlTabela(nome));
    completarColunas(db, nome); // bancos já no esquema atual ganham as colunas novas (aditivo)
    TABELAS[nome].indices.forEach((s) => db.exec(s));
  }
  migrarOrigemSituacao(db);
}

// Dívidas antigas (tipo + negativada + status) ganham origem e situação, uma vez, sem mexer em mais nada
// (id, histórico e carimbos ficam como estão). Mesma regra de utils/dividas.js (derivarOrigem/derivarSituacao).
function migrarOrigemSituacao(db) {
  db.exec(`UPDATE dividas SET origem = CASE
      WHEN tipo IN ('crediario', 'carne') THEN 'crediario'
      WHEN tipo IN ('emprestimo', 'financiamento') THEN 'emprestimo'
      ELSE 'outra' END WHERE origem IS NULL`);
  db.exec(`UPDATE dividas SET situacao = CASE
      WHEN status = 'quitada' OR saldo <= 0 THEN 'quitada'
      WHEN status = 'quebrada' THEN 'negativada'
      WHEN tipo = 'acordo' THEN 'em_acordo'
      WHEN negativada = 1 OR tipo = 'negativada' THEN 'negativada'
      ELSE 'em_dia' END WHERE situacao IS NULL`);
}

// Acrescenta à tabela existente as colunas de dados que o esquema atual tem e ela ainda não tem.
// (Só colunas com valor padrão constante ou aceitando NULL, como exige o SQLite.)
function completarColunas(db, nome) {
  const existentes = new Set(db.prepare(`PRAGMA table_info(${nome})`).all().map((c) => c.name));
  for (const def of TABELAS[nome].cols) {
    if (existentes.has(def.split(/\s+/)[0])) continue;
    db.exec(`ALTER TABLE ${nome} ADD COLUMN ${def}`);
  }
}

module.exports = {
  VERSAO_ESQUEMA, SQL_UUID, SQL_AGORA, TABELAS, ORDEM, RELACOES, COLUNAS_CARIMBO, COLUNAS_DIARIO,
  sqlTabela, criarEsquema, completarColunas,
};
