// Explicações das seções (anotação 64): o texto explicativo fixo sai da tela e fica no "?" ao lado do título
// da seção, card ou janela. Arquivo ÚNICO com todos os textos — na 1.0 vira o "Como usar" / Manual.
//
// Formato: id → { titulo, texto, manual? }
//   titulo  nome da seção (vai no rótulo do botão: "Explicação: <titulo>")
//   texto   string ou lista de frases curtas (o balão é pequeno: 1 a 4 frases)
//   manual  id da seção em views/Manual.vue para o link "Ver no manual" (opcional)
// Uso: <AjudaSecao secao="transacoes.cartao" />  ou  <AjudaSecao :texto="..." titulo="..." />
// Também: <CardPadrao ajuda="id">, <Modal ajuda="id">, <FormularioModal ajuda="id"> põem o "?" ao lado do título.
// Linguagem: português do Brasil simples. Diga "Reserva de Liberdade", nunca "reserva de emergência".

export const AJUDA_SECOES = {
  // ---------- Início ----------
  // Homologação 1.0, seção 1 (texto do Contador): o que é cada número.
  'inicio.saldo': {
    titulo: 'Saldo do mês',
    texto: [
      'É o que entrou menos o que saiu no seu mês financeiro: mostra se sobrou ou faltou no período.',
      'Compras no cartão contam na data da compra; a parcela conta no mês em que cai na fatura. Pagar a fatura não é gasto.',
      'Escolha um mês futuro no filtro para ver o previsto.',
    ],
  },
  'inicio.previsto': {
    titulo: 'Previsto para o mês',
    texto: [
      'Entradas previstas (a média dos 3 últimos meses, ou o que já foi lançado, se for maior) menos o Custo de vida, as parcelas do cartão e as parcelas de dívidas e acordos que caem no mês.',
      'Usa a mesma regra do Saldo do mês: tudo conta na data da compra. Toque no valor para ver a conta.',
    ],
  },
  'inicio.saldos': {
    titulo: 'Seus saldos',
    texto: [
      'Contas + Guardado (Reserva de Liberdade, metas e investimentos) − Faturas abertas − Dívidas = Patrimônio, no centro.',
      'É a posição de hoje: não muda com o mês escolhido. Toque no centro para ver Ativos e Passivos.',
    ],
  },
  'inicio.patrimonio': {
    titulo: 'Patrimônio',
    texto: [
      'É tudo o que você tem menos tudo o que deve: contas + Reserva de Liberdade e investimentos − faturas abertas − dívidas.',
      'É uma posição (um retrato de hoje), não o resultado do mês. Toque para ver Ativos e Passivos.',
      'O resumo de cada número fica em Relatórios › Resumo financeiro.',
    ],
  },
  'relatorios.resumo': {
    titulo: 'Resumo financeiro',
    texto: [
      'Saldo do mês: entradas − saídas do mês (sobrou ou faltou).',
      'Dinheiro nas contas: a soma dos saldos dos bancos, incluindo o que já está comprometido com a fatura.',
      'Patrimônio líquido: tudo o que você tem − tudo o que deve.',
    ],
  },

  // ---------- Formulários usados em várias páginas ----------
  lancar: {
    titulo: 'Lançar entrada ou saída',
    texto: [
      'Para o que não vem do banco: dinheiro em espécie, um Pix que ainda não sincronizou, uma entrada extra.',
      'Em contas manuais o saldo é ajustado na hora.',
      'Categoria "Automática" usa as suas regras e o nome da descrição; sem correspondência, vai para "Geral".',
    ],
    manual: 'transacoes',
  },
  transferir: {
    titulo: 'Transferência',
    texto: 'Dinheiro que muda de uma conta sua para outra (inclusive para a corretora). Não conta como gasto nem como entrada e não entra nos totais do mês.',
    manual: 'transacoes',
  },
  regras: {
    titulo: 'Regras de categorização',
    texto: [
      'Quando o nome de um lançamento tiver o trecho da regra, ele já entra na categoria escolhida.',
      'Sem conta escolhida, a regra vale para todas as contas e para as compras no cartão.',
      'Na lista: toque para editar, arraste para a esquerda para pausar e para a direita para excluir.',
    ],
    manual: 'categorias',
  },

  // ---------- Transações ----------
  'transacoes.cartao': {
    titulo: 'Saldo do mês',
    texto: 'As compras no cartão de crédito aparecem na lista e contam na data da compra. Pagar a fatura não conta como gasto de novo.',
    manual: 'transacoes',
  },
  'transacoes.editar': {
    titulo: 'Editar transação',
    texto: [
      'Lançada à mão: tudo pode ser editado. Veio do banco: só a categoria e a subcategoria.',
      'Compra no cartão lançada à mão: a edição vale para a compra inteira. Cartão conectado não pode ser editado.',
      'Transferência ou estorno: valor, tipo e conta não mudam. Para refazer, desfaça pelo menu ⋮ e lance de novo.',
    ],
    manual: 'transacoes',
  },
  'transacoes.estorno': {
    titulo: 'Estornar',
    texto: [
      'Para estorno, cancelamento ou devolução.',
      'A despesa e o estorno ficam ligados e saem dos totais: na conta, o valor volta ao saldo; no cartão, a compra deixa de pesar nas faturas.',
      'Dá para desfazer depois pelo menu ⋮.',
    ],
  },

  // ---------- Contas ----------
  'contas.saldo-inicial': {
    titulo: 'Conta',
    texto: [
      'O saldo inicial é quanto tinha na conta na data de início.',
      'Entra só no saldo da conta e no patrimônio: não é entrada nem saída do mês.',
      'Para acertar o saldo de hoje depois, use "Ajustar saldo" no menu ⋯ da conta.',
    ],
    manual: 'contas',
  },
  'contas.ajustar-saldo': {
    titulo: 'Ajustar saldo',
    texto: 'Informe o saldo que o banco mostra hoje. A diferença vira um "Ajuste de saldo", que não conta como entrada nem saída.',
    manual: 'contas',
  },

  // ---------- Cartões ----------
  'cartoes.tipo-cartao': {
    titulo: 'Cartão de crédito',
    texto: 'Os dias de fechamento e vencimento definem em qual fatura cai cada compra e cada parcela. A bandeira está escrita no cartão físico (opcional).',
    manual: 'cartoes',
  },
  'cartoes.tipo-loja': {
    titulo: 'Cartão de loja',
    texto: 'Funciona como cartão de crédito, com fatura mensal, mas só pode ser usado na própria loja.',
    manual: 'cartoes',
  },
  'cartoes.tipo-crediario': {
    titulo: 'Crediário',
    texto: 'Cada compra vira parcelas, cobradas todo mês no dia do vencimento. Se pagar antes, registre o desconto por antecipação em Dívidas.',
    manual: 'cartoes',
  },
  'cartoes.inicio-mes': {
    titulo: 'Fatura e parcelas já em aberto',
    texto: [
      'Para quem começou a usar o app no meio do mês.',
      'O valor em aberto entra na fatura atual como "Saldo inicial da fatura".',
      'Cada parcela restante entra numa fatura, a partir da atual.',
    ],
    manual: 'faturas',
  },
  'cartoes.parcelas-restantes': {
    titulo: 'Parcelas restantes',
    texto: 'Uma parcela em cada fatura, a partir da fatura atual. O que já está na fatura deste mês entra como "Saldo inicial da fatura".',
    manual: 'faturas',
  },
  'cartoes.pagar-fatura': {
    titulo: 'Pagar a fatura',
    texto: [
      'O valor pago sai da conta escolhida e entra em Transações como pagamento de fatura (não é um gasto novo).',
      'Pagou menos? Desconto não vira dívida; fatura parcelada vira dívida em Dívidas.',
    ],
    manual: 'faturas',
  },

  // ---------- Dívidas ----------
  'dividas.aba-aberto': { titulo: 'Em aberto', texto: 'Dívidas em dia ou atrasadas, com o maior risco primeiro. Faturas e compras parceladas ficam logo abaixo. Toque numa dívida para ver o histórico, simular e pagar.', manual: 'dividas' },
  'dividas.aba-negativadas': { titulo: 'Negativadas', texto: 'Dívidas negativadas (SPC/Serasa), com o maior risco primeiro.', manual: 'dividas' },
  'dividas.aba-acordo': { titulo: 'Em acordo', texto: 'Dívidas que viraram acordo: parcelas e juros combinados com o credor.', manual: 'dividas' },
  'dividas.aba-quitadas': { titulo: 'Quitadas', texto: 'Dívidas já quitadas. O histórico de pagamentos fica guardado.', manual: 'dividas' },
  'dividas.juros-caros': {
    titulo: 'Juros mais caros',
    texto: 'Cheque especial e rotativo do cartão cobram os maiores juros. Quitar estes antes é o que mais economiza.',
    manual: 'dividas',
  },
  'dividas.faturas': {
    titulo: 'Faturas a pagar',
    texto: 'A fatura aberta de todos os cartões. As compras já contam como gasto em Transações; pagar a fatura não conta de novo.',
    manual: 'faturas',
  },
  'dividas.parceladas': {
    titulo: 'Compras parceladas',
    texto: 'Parcelas que ainda vão cair nas próximas faturas de todos os cartões. Sem juros: não entram no total devido.',
  },
  'dividas.juros-medios': {
    titulo: 'Juros médios do cartão',
    texto: 'Referência para saber se um acordo ou parcelamento está caro.',
  },
  'dividas.evolucao': { titulo: 'Evolução das dívidas', texto: 'Toque num mês para ver o detalhe.' },
  'dividas.campos': {
    titulo: 'Dívida',
    texto: [
      'A situação define a aba da página. Quitada só muda sozinha, ao pagar o saldo todo.',
      'Se o vencimento passar, a dívida vira Atrasada e o risco sobe sozinho.',
      'Com o banco vinculado, o app acha sozinho as saídas que parecem pagamento desta dívida.',
      'Urgência automática considera vencimento, acordo quebrado, negativação e juros.',
    ],
    manual: 'dividas',
  },
  'dividas.pagamento': {
    titulo: 'Registrar pagamento',
    texto: 'Vira uma saída em Transações e abate o saldo desta dívida.',
    manual: 'dividas',
  },
  'dividas.acordo': {
    titulo: 'Acordo',
    texto: [
      'O app calcula a parcela e os juros implícitos do acordo e compara com a média dos cartões.',
      'Ao editar, os pagamentos já feitos continuam abatendo: só o saldo e as parcelas são recalculados.',
    ],
    manual: 'dividas',
  },

  // ---------- Objetivos ----------
  'objetivos.liquidez': {
    titulo: 'Metas',
    texto: [
      'Metas aceitam só liquidez rápida: CDB/RDB com liquidez diária, Tesouro Selic, LCI/LCA, poupança e fundos DI.',
      'Ações, FIIs, ETFs e cripto ficam só em Investimentos.',
    ],
    manual: 'metas',
  },
  'objetivos.meta-form': {
    titulo: 'Meta',
    texto: [
      'Metas aceitam só liquidez rápida (CDB/RDB diário, Tesouro Selic, LCI/LCA, poupança, fundos DI).',
      'Já guardado: o que já tinha antes. Não é Guardar e não sai de nenhuma conta.',
      'Caixinha: na importação, "Aplicação <nome>" vira Guardar nesta meta e "Resgate <nome>" vira Resgatar, fora das entradas e saídas.',
    ],
    manual: 'metas',
  },
  'objetivos.guardar': {
    titulo: 'Guardar ou resgatar',
    texto: [
      'Com conta escolhida, o saldo de contas manuais é ajustado na hora; em conta conectada continua vindo do banco.',
      'Ações, FIIs, ETFs e cripto não entram em metas: registre na aba Investimentos.',
    ],
    manual: 'metas',
  },
  'objetivos.corretora': {
    titulo: 'Corretora',
    texto: 'Cadastre a corretora em Contas (tipo Corretora) e faça a transferência banco → corretora. Sem corretora, dá para conciliar a compra com a transferência do extrato do banco.',
    manual: 'corretoras',
  },
  'objetivos.ativos': {
    titulo: 'Meus ativos',
    texto: 'Consolidados por ticker, com preço médio. Toque num ativo para ver compras e proventos.',
    manual: 'corretoras',
  },
  'objetivos.operacao': {
    titulo: 'Investimento',
    texto: [
      'Renda fixa e metas rendem sozinhas pelo CDI/Selic do Bacen. Registre rendimento só para lançar o valor real do extrato.',
      'Ativo de liquidez lenta não entra em metas: fica só em Investimentos.',
    ],
    manual: 'corretoras',
  },
  'objetivos.posicao-inicial': {
    titulo: 'Posição inicial',
    texto: 'O que você já tinha antes de usar o app. Não sai de nenhuma conta e não conta como aporte.',
    manual: 'corretoras',
  },
  'objetivos.evolucao': {
    titulo: 'Evolução do total investido',
    texto: 'Valor investido acumulado ao fim de cada mês: compras e guardados menos vendas e resgates.',
  },
  'objetivos.conectados': {
    titulo: 'Bancos conectados',
    texto: 'Esses valores ainda não entram nas metas. Open Finance é opcional e fica para uma versão futura do app local.',
  },

  // ---------- Relatórios ----------
  'relatorios.evolucao': { titulo: 'Relação mensal', texto: ['Entradas, saídas e o resultado (entradas − saídas) de cada mês.', 'Toque ou arraste no gráfico para escolher o mês: o resto da página mostra aquele mês. O botão ao lado alterna Mês e Ano.', 'Meses futuros mostram o previsto.'] },
  'relatorios.semana': { titulo: 'Esta semana × semana passada', texto: 'Saídas dos últimos 7 dias comparadas aos 7 dias anteriores.' },
  'relatorios.projecao': { titulo: 'Projeção para o próximo mês', texto: 'Média dos últimos meses com dados.' },

  // ---------- Custo de vida ----------
  'custos.essenciais': {
    titulo: 'Seus essenciais',
    texto: [
      'Gastos do mês que mudam de valor: luz, água, gás, mercado, farmácia, transporte. Lazer, restaurante e delivery ficam de fora.',
      'O app estima pela média dos últimos 6 meses da categoria. Pago = já há gasto da categoria neste mês.',
    ],
    manual: 'custos-fixos',
  },
  'custos.sugestoes': { titulo: 'Sugestões', texto: 'Categorias com gasto em quase todos os meses.' },
  'custos.projecao': {
    titulo: 'Projeção do mês seguinte',
    texto: 'Só entra o que está cadastrado. Gastos não essenciais ficam de fora. Parcelas de cartão e de dívidas entram só aqui, não no custo de vida (são temporárias).',
    manual: 'custos-fixos',
  },

  // ---------- Importar ----------
  'importar.arquivo': {
    titulo: 'Importar',
    texto: [
      'Nada é gravado antes da pré-visualização. Compras já registradas, parcelas e estornos são reconhecidos sozinhos.',
      'PDF: a leitura é genérica (data, descrição, valor); confira tudo na próxima tela. A senha do PDF não fica guardada.',
    ],
  },
  'importar.total-fatura': {
    titulo: 'Total da fatura',
    texto: 'Compras, IOF e encargos menos estornos, sem o pagamento da fatura anterior.',
  },

  // ---------- Perfil ----------
  'perfil.inicio-mes': {
    titulo: 'Início do mês financeiro',
    texto: [
      'Use o dia em que o salário costuma cair: o que entra e sai até o próximo pagamento fica no mesmo mês.',
      '5º dia útil conta só dias úteis (sem fins de semana e feriados nacionais).',
      'Vale para o Saldo do mês, o filtro de meses, o orçamento, o Custo de vida e o Quanto guardar. Vai junto no backup.',
    ],
  },
};

export function ajudaSecao(id) {
  return (id && AJUDA_SECOES[id]) || null;
}
