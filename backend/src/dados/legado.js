// Esquema ANTIGO (ids numéricos), mantido só para atualizar bancos criados antes da Fase 0.
// Quando o banco ainda tem esse formato, `prepararLegado` completa colunas/tabelas que faltarem
// (como o db.js fazia) e a migração (migracao.js) converte tudo para UUID. Bancos novos nunca passam por aqui.
function prepararLegado(db) {
  // --- Estrutura base -------------------------------------------------------
  // Este arquivo cresce conforme novas telas do roteiro forem construídas.
  // Etapa atual: apenas "usuarios" (login) + esqueleto das tabelas futuras
  // comentadas para referência de quem for continuar o projeto.

  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      nome TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Migração leve: adiciona "sessao_versao" a bancos criados antes da Etapa 8.
  // SQLite não tem "ADD COLUMN IF NOT EXISTS", então tentamos e ignoramos o
  // erro se a coluna já existir.
  try {
    db.exec('ALTER TABLE usuarios ADD COLUMN sessao_versao INTEGER NOT NULL DEFAULT 1');
  } catch (erro) {
    if (!String(erro.message).includes('duplicate column')) throw erro;
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS configuracoes (
      usuario_id INTEGER PRIMARY KEY,
      notificar_categoria_estourada INTEGER NOT NULL DEFAULT 1,
      notificar_fatura_proxima INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    );
  `);

  // "notificar_fatura_proxima" já existe como preferência, mas ainda não tem
  // efeito prático: o sistema não tem data de vencimento de fatura em
  // nenhuma tabela hoje, então esse alerta nunca é de fato gerado. Fica
  // pronto para quando essa informação existir (ex: quando as faturas de
  // cartão vierem do Open Finance).

  db.exec(`
    CREATE TABLE IF NOT EXISTS contas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      nome TEXT NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'corrente',
      origem TEXT NOT NULL DEFAULT 'manual',
      saldo REAL NOT NULL DEFAULT 0,
      cor TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    );
  `);

  // "origem" já existe como campo (manual vs conectada) porque o roteiro
  // prevê os dois tipos na mesma tabela — mas nesta etapa só "manual" é
  // usado. A conexão via Open Finance (origem = 'conectada' + tabela
  // tokens_open_finace) entra na Etapa 5.

  db.exec(`
    CREATE TABLE IF NOT EXISTS dividas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      nome TEXT NOT NULL,
      saldo_original REAL NOT NULL,
      saldo REAL NOT NULL,
      taxa_juros REAL,
      urgencia TEXT NOT NULL DEFAULT 'amarelo',
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS historico_pagamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      divida_id INTEGER NOT NULL,
      valor REAL NOT NULL,
      data TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (divida_id) REFERENCES dividas(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS categorias_orcamento (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      nome TEXT NOT NULL,
      teto_mensal REAL NOT NULL,
      gasto_atual REAL NOT NULL DEFAULT 0,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS categorias_receita (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      nome TEXT NOT NULL,
      icone TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS categorias_receita_init (usuario_id INTEGER PRIMARY KEY);
  `);

  // Nesta etapa o orçamento ainda funciona com "gasto_atual" atualizado
  // manualmente (registrar gasto), porque as transações ainda não vêm de
  // uma conta conectada. Quando o Open Finance entrar (Etapa 5) e as
  // transações reais forem plugadas (Etapa 6), "gasto_atual" passa a ser
  // calculado a partir da tabela "transacoes" com auto-categorização por
  // palavra-chave, como o roteiro original descreve.

  db.exec(`
    CREATE TABLE IF NOT EXISTS tokens_open_finance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conta_id INTEGER NOT NULL,
      item_id TEXT NOT NULL,
      token_criptografado TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ativo',
      ultima_sincronizacao TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (conta_id) REFERENCES contas(id) ON DELETE CASCADE
    );
  `);

  // O token de acesso do agregador (Pluggy/Belvo) NUNCA fica em texto puro —
  // "token_criptografado" guarda o resultado de criptografia AES-256-GCM
  // (ver src/utils/criptografia.js) usando OPEN_FINANCE_ENCRYPTION_KEY do
  // .env. O frontend nunca vê esse valor; ele só sabe que a conta está
  // "conectada" e quando foi a última sincronização.

  db.exec(`
    CREATE TABLE IF NOT EXISTS transacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conta_id INTEGER NOT NULL,
      usuario_id INTEGER NOT NULL,
      categoria_id INTEGER,
      descricao TEXT NOT NULL,
      valor REAL NOT NULL,
      data TEXT NOT NULL,
      categorizacao_automatica INTEGER NOT NULL DEFAULT 0,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (conta_id) REFERENCES contas(id) ON DELETE CASCADE,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
      FOREIGN KEY (categoria_id) REFERENCES categorias_orcamento(id) ON DELETE SET NULL
    );
  `);

  // "valor" positivo = entrada, negativo = saída. "categorizacao_automatica"
  // marca se a categoria veio do casamento por palavra-chave (ver
  // utils/categorizacao.js) ou se o usuário corrigiu manualmente — essa
  // tabela é alimentada pela sincronização do Open Finance (Etapa 5) e é o
  // que a Etapa 6 usa para parar de mockar o Dashboard e o Orçamento.

  db.exec(`
    CREATE TABLE IF NOT EXISTS reserva_liberdade (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL UNIQUE,
      meta REAL NOT NULL,
      valor_atual REAL NOT NULL DEFAULT 0,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS historico_aportes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reserva_id INTEGER NOT NULL,
      valor REAL NOT NULL,
      data TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (reserva_id) REFERENCES reserva_liberdade(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS cartoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      conta_id INTEGER,
      nome TEXT NOT NULL,
      limite REAL,
      dia_fechamento INTEGER NOT NULL,
      dia_vencimento INTEGER NOT NULL,
      origem TEXT NOT NULL DEFAULT 'manual',
      id_externo TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
      FOREIGN KEY (conta_id) REFERENCES contas(id) ON DELETE SET NULL
    );
  `);

  // "conta_id" é a conta que paga a fatura do cartão (pode ficar vazia).
  // "origem" segue a mesma ideia de "contas": 'manual' (cadastrado à mão, como
  // um cartão sem Open Finance) ou 'conectada' (vindo do agregador, quando a
  // sincronização de cartões for implementada); "id_externo" guarda o id do
  // cartão no agregador para evitar duplicar na sincronização.

  db.exec(`
    CREATE TABLE IF NOT EXISTS lancamentos_cartao (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cartao_id INTEGER NOT NULL,
      usuario_id INTEGER NOT NULL,
      compra_id TEXT NOT NULL,
      descricao TEXT NOT NULL,
      valor REAL NOT NULL,
      data_compra TEXT NOT NULL,
      parcela_numero INTEGER NOT NULL DEFAULT 1,
      total_parcelas INTEGER NOT NULL DEFAULT 1,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (cartao_id) REFERENCES cartoes(id) ON DELETE CASCADE,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_lancamentos_cartao ON lancamentos_cartao(cartao_id);
  `);

  // Uma linha por PARCELA. Uma compra à vista tem uma linha (1/1); uma compra
  // em 10x tem 10 linhas com o mesmo "compra_id". "valor" é o valor da
  // parcela. A fatura de cada linha NÃO é gravada: é calculada na leitura a
  // partir de "data_compra", "parcela_numero" e dos dias de fechamento e
  // vencimento do cartão (utils/faturas.js), assim, se o usuário corrigir os
  // dias do cartão, todas as faturas se ajustam sozinhas.

  // Migração leve: vínculo opcional de uma compra no cartão com uma dívida.
  // Assim a dívida passa a mostrar "o que foi gasto", em qual cartão, quando e
  // em quantas parcelas. Se a dívida for apagada, a compra continua no cartão.
  try {
    db.exec(
      'ALTER TABLE lancamentos_cartao ADD COLUMN divida_id INTEGER REFERENCES dividas(id) ON DELETE SET NULL'
    );
  } catch (erro) {
    if (!String(erro.message).includes('duplicate column')) throw erro;
  }

  // Migração leve: de onde veio a transação. As que já existiam vieram da
  // sincronização do Open Finance ('conectada'); as lançadas à mão pela tela de
  // Transações ficam como 'manual' (só essas podem ser apagadas pelo usuário).
  try {
    db.exec("ALTER TABLE transacoes ADD COLUMN origem TEXT NOT NULL DEFAULT 'conectada'");
  } catch (erro) {
    if (!String(erro.message).includes('duplicate column')) throw erro;
  }

  // Migração leve: tipos de aporte da Reserva de Liberdade (mensal, extra,
  // rendimento, transferência e resgate) e uma observação opcional. Os aportes
  // antigos viram "mensal", que era o único tipo que existia.
  for (const coluna of [
    "ALTER TABLE historico_aportes ADD COLUMN tipo TEXT NOT NULL DEFAULT 'mensal'",
    'ALTER TABLE historico_aportes ADD COLUMN descricao TEXT',
    'ALTER TABLE historico_aportes ADD COLUMN conta_id INTEGER REFERENCES contas(id) ON DELETE SET NULL',
    'ALTER TABLE transacoes ADD COLUMN categoria_receita TEXT',
    'ALTER TABLE contas ADD COLUMN icone TEXT',
    "ALTER TABLE historico_aportes ADD COLUMN operacao TEXT NOT NULL DEFAULT 'aporte'",
    'ALTER TABLE historico_aportes ADD COLUMN ativo TEXT',
    'ALTER TABLE historico_aportes ADD COLUMN quantidade REAL',
    'ALTER TABLE historico_aportes ADD COLUMN preco_unitario REAL',
    'ALTER TABLE categorias_orcamento ADD COLUMN icone TEXT',
    'ALTER TABLE categorias_orcamento ADD COLUMN cor TEXT',
    // Open Finance (Pluggy): ligação de cada registro com o que veio do banco
    'ALTER TABLE contas ADD COLUMN id_externo TEXT',
    'ALTER TABLE contas ADD COLUMN conexao_id INTEGER',
    'ALTER TABLE cartoes ADD COLUMN conexao_id INTEGER',
    'ALTER TABLE transacoes ADD COLUMN id_externo TEXT',
    'ALTER TABLE lancamentos_cartao ADD COLUMN id_externo TEXT',
    'ALTER TABLE categorias_receita ADD COLUMN cor TEXT',
    'ALTER TABLE dividas ADD COLUMN arquivada INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE dividas ADD COLUMN conta_id INTEGER REFERENCES contas(id) ON DELETE SET NULL',
    'ALTER TABLE historico_pagamentos ADD COLUMN transacao_id INTEGER',
    'ALTER TABLE lancamentos_cartao ADD COLUMN categoria_id INTEGER REFERENCES categorias_orcamento(id) ON DELETE SET NULL',
    'ALTER TABLE transacoes ADD COLUMN subcategoria TEXT',
    'ALTER TABLE transacoes ADD COLUMN ignorada INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE cartoes ADD COLUMN icone TEXT',
    'ALTER TABLE lancamentos_cartao ADD COLUMN subcategoria TEXT',
  ]) {
    try {
      db.exec(coluna);
    } catch (erro) {
      if (!String(erro.message).includes('duplicate column')) throw erro;
    }
  }

  // Aportes viram compras de ativo: "tipo" passa a ser o tipo de investimento
  // (CDB, ações, FII...) e "operacao" diz se foi aporte (compra) ou resgate
  // (venda). Os registros antigos, que usavam os tipos mensal/extra/rendimento/
  // transferência/resgate, são convertidos uma única vez.
  db.exec(`
    UPDATE historico_aportes SET operacao = 'resgate' WHERE tipo = 'resgate';
    UPDATE historico_aportes SET tipo = 'outro'
      WHERE tipo IN ('mensal', 'extra', 'rendimento', 'transferencia', 'resgate');
  `);

  // Metas da Reserva de Liberdade: cada meta tem nome, ícone e o tipo de
  // investimento que entra na soma dela (NULL = todos). Hoje a tela usa uma
  // meta só, mas a tabela já comporta várias.
  db.exec(`
    CREATE TABLE IF NOT EXISTS metas_reserva (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reserva_id INTEGER NOT NULL,
      nome TEXT NOT NULL DEFAULT 'Reserva de Liberdade',
      icone TEXT,
      tipo_investimento TEXT,
      valor_meta REAL NOT NULL,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (reserva_id) REFERENCES reserva_liberdade(id) ON DELETE CASCADE
    );
  `);

  // Prazo opcional das metas e meta de destino de cada aporte. O "outro" saiu
  // da lista de tipos: o que existia vira "CDI / Renda fixa".
  try {
    db.exec('ALTER TABLE metas_reserva ADD COLUMN prazo TEXT');
  } catch (erro) {
    if (!String(erro.message).includes('duplicate column')) throw erro;
  }
  db.exec(`
    UPDATE historico_aportes SET tipo = 'cdi' WHERE tipo = 'outro';
    UPDATE metas_reserva SET tipo_investimento = NULL WHERE tipo_investimento = 'outro';
  `);
  let metaIdNova = false;
  try {
    db.exec('ALTER TABLE historico_aportes ADD COLUMN meta_id INTEGER REFERENCES metas_reserva(id) ON DELETE SET NULL');
    metaIdNova = true;
  } catch (erro) {
    if (!String(erro.message).includes('duplicate column')) throw erro;
  }
  if (metaIdNova) {
    // Uma única vez: cada aporte antigo vai para a 1ª meta do mesmo tipo
    // (ou para a 1ª meta sem tipo, que somava tudo).
    db.exec(`
      UPDATE historico_aportes SET meta_id = (
        SELECT m.id FROM metas_reserva m
        WHERE m.reserva_id = historico_aportes.reserva_id
          AND (m.tipo_investimento = historico_aportes.tipo OR m.tipo_investimento IS NULL)
        ORDER BY m.id LIMIT 1);
    `);
  }

  // Faturas de cartão pagas (cartão manual): guarda de qual conta saiu o
  // dinheiro e a transação criada, para poder desfazer.
  db.exec(`
    CREATE TABLE IF NOT EXISTS faturas_pagas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cartao_id INTEGER NOT NULL,
      fatura TEXT NOT NULL,
      conta_id INTEGER,
      transacao_id INTEGER,
      valor REAL NOT NULL,
      data TEXT NOT NULL,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (cartao_id, fatura),
      FOREIGN KEY (cartao_id) REFERENCES cartoes(id) ON DELETE CASCADE
    );
  `);


  // --- Open Finance via Pluggy ------------------------------------------------
  // "conexoes_pluggy": uma linha por banco conectado (cada itemId da Pluggy).
  // O itemId não é segredo (só funciona com as chaves do servidor), por isso
  // não precisa de criptografia como os tokens antigos.
  db.exec(`
    CREATE TABLE IF NOT EXISTS conexoes_pluggy (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      item_id TEXT NOT NULL,
      banco TEXT,
      status TEXT NOT NULL DEFAULT 'ativa',
      ultima_sincronizacao TEXT,
      ultimo_erro TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (usuario_id, item_id),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS investimentos_conectados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      conexao_id INTEGER NOT NULL,
      id_externo TEXT NOT NULL,
      nome TEXT NOT NULL,
      tipo TEXT,
      saldo REAL NOT NULL DEFAULT 0,
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (conexao_id) REFERENCES conexoes_pluggy(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_transacoes_externo ON transacoes(usuario_id, id_externo) WHERE id_externo IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_lancamentos_externo ON lancamentos_cartao(usuario_id, id_externo) WHERE id_externo IS NOT NULL;
  `);
}

module.exports = { prepararLegado };
