# Sistema Financeiro Pessoal — Etapas 1 a 7

- **Etapa 1:** autenticação e estrutura inicial do banco de dados (SQLite).
- **Etapa 2:** Dashboard (Painel Geral) com dados mockados.
- **Etapa 3:** Contas & Cartões manuais — CRUD completo, sem Open Finance ainda.
- **Etapa 4:** Dívidas + Orçamento, ainda com dados manuais.
- **Etapa 5:** Integração real com Open Finance (Pluggy/Belvo).
- **Etapa 6:** Substituição dos dados mockados/manuais pelos reais.
  - Nova tabela `transacoes`, alimentada pela sincronização do Open Finance
    (`sincronizarConta` em `openFinance.js` agora busca saldo **e**
    transações, com auto-categorização básica por palavra-chave —
    `utils/categorizacao.js` casa a descrição contra o nome das categorias
    já cadastradas).
  - `PUT /api/transacoes/:id` — corrige manualmente a categoria de uma
    transação (o roteiro pede essa opção explicitamente).
  - **Dashboard** agora calcula tudo a partir de dados reais: patrimônio,
    total em contas/dívidas, dívidas prioritárias e fluxo de caixa (via
    `transacoes`) e alertas de verdade (categorias perto do teto, dívidas
    em risco) — nada mais mockado.
  - O "Registrar gasto" manual da Etapa 4 continua existindo em paralelo,
    para categorização de contas que ainda não estão conectadas.
- **Etapa 7:** Reserva de Liberdade + Relatórios.
  - **Reserva de Liberdade:** anel de progresso até a meta (sugestão
    automática = 4x o total dos tetos mensais do Orçamento — ponto médio
    da faixa 3-6x do roteiro), histórico de aportes, registro manual de
    aporte.
  - **Relatórios:** fluxo de caixa dos últimos 12 meses, detalhamento por
    categoria do mês atual, projeção do próximo mês (média dos últimos 3
    meses com dados) e exportação em CSV (`GET /api/relatorios/exportar.csv`).
  - Enquanto nenhuma conta conectada tiver sincronizado transações reais,
    essas telas mostram estado vazio em vez de dado inventado — preenchem
    sozinhas assim que a Etapa 5 estiver de fato configurada com um
    agregador real.

## Navegação e visual

- **Sidebar retrátil**: botão no topo da barra lateral colapsa/expande para
  uma trilha só de ícones (estado salvo no `localStorage` do navegador).
  Além do botão manual, ela também retrai automaticamente em modo paisagem
  de celular (`orientation: landscape` + altura de tela pequena).
- **Ícones SVG inline** por item de navegação e **logo próprio** (marca com
  gradiente azul/violeta) no lugar do título em texto — sem lib de ícones
  externa.

## Direção visual (atualizada)

A partir de uma referência enviada pelo usuário, o layout passou a ser um
dashboard escuro com **sidebar de navegação** (substitui o menu no topo),
cards com **sparkline**, **donuts** e **anéis de participação** (todos via
CSS `conic-gradient`, sem lib de gráficos), mantendo a paleta viva já usada:

- Fundo escuro por padrão agora (`#0e0f1f`) — antes era só uma alternativa
  via `prefers-color-scheme`. O modo claro continua definido em
  `data-theme="light"`, mas ainda não há um botão de alternância na interface.
- Paleta de categorias (donuts/anéis/barras): azul `#3B5BFF`, amarelo
  `#F5B942`, rosa `#EC4899`, verde `#22C55E`, coral `#F0523B`, violeta
  `#7C3AED` — usada de forma cíclica por categoria/urgência.
- No Dashboard, "Despesas por categoria" e "Participação no orçamento" usam
  os dados reais de `categorias_orcamento`; "Dívidas por urgência" e
  "Maiores dívidas" usam os dados reais de `dividas`. Os cards de "Saldo do
  mês" e "Despesas do mês" agora vêm do fluxo de caixa real (tabela
  `transacoes`, Etapa 6) — ficam zerados até haver transações sincronizadas.

## Estrutura

```
sistema-financeiro/
  backend/     Node.js + Express + SQLite (better-sqlite3)
  frontend/    Vue 3 + Vite
```

## Como rodar localmente

### 1. Backend

```bash
cd backend
cp .env.example .env
# edite o .env e troque o JWT_SECRET por um valor aleatório forte
npm install
npm run criar-usuario -- seu-email@exemplo.com "sua-senha" "Seu Nome"
npm run dev
```

O backend sobe em `http://localhost:4000`. O banco SQLite é criado
automaticamente em `backend/data/sistema.db` na primeira execução.

Não existe cadastro público de propósito — como definido no roteiro, é um
sistema de um usuário só. Para trocar a senha ou criar o usuário novamente,
rode `npm run criar-usuario` de novo (o script recusa e-mails duplicados).

### 2. Frontend

Em outro terminal:

```bash
cd frontend
npm install
npm run dev
```

Acesse `http://localhost:5173`. O Vite já está configurado para
redirecionar chamadas `/api/*` para o backend em `localhost:4000`.

## Como funciona a autenticação

- Sessão via JWT guardado em cookie `httpOnly` (não acessível por
  JavaScript no navegador, reduz risco de roubo via XSS).
- Duração curta (8h) por padrão; se marcar "lembrar este dispositivo",
  a sessão dura 30 dias — exatamente o comportamento pedido no roteiro.
- `GET /api/auth/me` confirma quem está logado; usado pelo frontend para
  proteger a tela de Dashboard.
- **Trocar senha** (`PUT /api/auth/senha`) e **encerrar todas as sessões**
  (`POST /api/auth/encerrar-sessoes`) — Etapa 8 — funcionam subindo um
  contador `sessao_versao` na tabela `usuarios`; o JWT carrega o valor de
  quando foi emitido, e o middleware invalida o cookie na hora se os
  números não baterem mais, mesmo sem o token ter expirado.

## Etapa 8 — Configurações e polimento visual final

- **Conexões bancárias**: desconectar uma conta conectada (ela volta a ser
  manual, mantendo saldo e histórico) ou reconectar quando o token expirar
  (gera um novo `connect_token` amarrado à conta existente em vez de criar
  uma conta duplicada).
- **Categorias personalizadas**: já vivem na tela de Orçamento desde a
  Etapa 4 — a tela de Configurações só aponta para lá em vez de duplicar o
  CRUD.
- **Notificações**: preferência de aviso por categoria estourada (já tem
  efeito real, reaproveitando o alerta do Dashboard) e por fatura próxima
  do vencimento (fica salva, mas ainda não é gerada de verdade — o sistema
  não tem data de vencimento em nenhuma tabela hoje).
- **Backup**: `GET /api/configuracoes/backup.json` exporta contas, dívidas,
  categorias, transações e a Reserva de Liberdade num único arquivo.
  Senhas e tokens do Open Finance nunca entram no backup.
- **Polimento**: padronizei o raio de borda dos cards (`var(--raio-padrao)`
  em vez de valores soltos tipo `14px`/`16px` espalhados pelas telas).

## Cartões, faturas e parcelas

Tela **Cartões** (`/cartoes`) e rotas em `/api/cartoes`.

- **Cartão** tem nome, conta que paga a fatura (opcional), limite (opcional),
  dia de fechamento e dia de vencimento. Cartões sem Open Finance (como o da
  Americanas) são cadastrados à mão (`origem = 'manual'`); o campo
  `id_externo` já existe para a sincronização futura.
- **Fatura** é identificada pelo **mês do vencimento** e é calculada na
  leitura, nunca gravada. Compra até o dia de fechamento entra na fatura que
  fecha naquele mês; depois, na seguinte. Se o vencimento é depois do
  fechamento, a fatura vence no mesmo mês em que fecha; senão, no mês
  seguinte. Dias 29-31 viram o último dia dos meses mais curtos.
- **Parcelas**: uma linha por parcela; a parcela n cai um mês depois da
  anterior. Compra em janeiro com fatura em fevereiro coloca a 1ª parcela em
  fevereiro, a 2ª em março, etc. A divisão é feita em centavos e a sobra vai
  para as primeiras parcelas (a soma sempre fecha o total).
- **Limite usado** = fatura aberta + faturas futuras. Faturas passadas são
  tratadas como pagas, porque o pagamento de fatura ainda não é registrado.
- Alterar fechamento/vencimento recalcula todas as faturas sozinho.

Rotas: `GET/POST /api/cartoes`, `PUT/DELETE /api/cartoes/:id`,
`GET /:id/faturas`, `GET /:id/extrato?fatura=AAAA-MM`,
`GET /:id/previa?valor=&parcelas=&dataCompra=`,
`POST /:id/lancamentos`, `DELETE /:id/lancamentos/:compraId`.

## Transações (entradas e saídas)

Tela **Transações** (`/transacoes`) e rotas em `/api/transacoes`.

- `GET /api/transacoes?mes=AAAA-MM&contaId=&tipo=entrada|saida` devolve
  `{ transacoes, resumo: { entradas, saidas, resultado, quantidade } }`. O
  resumo vale para todo o filtro. (Antes a rota devolvia só a lista.)
- Na tela, "+ Nova saída" e "+ Nova entrada" abrem um pop-up com o formulário.
- `POST` lança uma entrada ou saída à mão: `{ tipo, descricao, valor, data,
  contaId, categoriaId? }`. O valor vai positivo e o `tipo` decide o sinal.
  Em conta **manual** o saldo é ajustado; em conta **conectada** não, porque
  o saldo vem do banco. Saída sem categoria tenta a auto-categorização por
  palavra-chave; saída com categoria soma no gasto dela (Orçamento).
- `DELETE` só apaga as lançadas à mão (`origem = 'manual'`) e desfaz o efeito
  no saldo e na categoria. As vindas do Open Finance (`origem = 'conectada'`)
  não se apagam, senão voltariam na próxima sincronização.
- Compras no cartão continuam na tela Cartões e **não** entram aqui, para não
  contar duas vezes quando a fatura for paga pela conta.

## Gastos e parcelas em Dívidas

- Ao registrar uma compra em **Cartões** dá para escolher a "Dívida
  relacionada" (`lancamentos_cartao.divida_id`, opcional). Também dá para
  vincular/desvincular depois: `PATCH /api/cartoes/:id/lancamentos/:compraId`
  com `{ dividaId }`.
- `GET /api/dividas/:id/gastos` devolve as compras da dívida (descrição,
  cartão, data, total) com cada parcela: **paga** (fatura anterior à aberta),
  **aberta** ou **futura**, mais o total gasto e o que ainda falta pagar.
- Na tela Dívidas, "Ver gastos e parcelas" mostra isso. Registrar a compra
  **não altera o saldo devedor**; o saldo continua sendo abatido pelos
  pagamentos registrados na própria dívida.
- Apagar a dívida mantém a compra no cartão (o vínculo só fica vazio).

## Pop-ups, extrato em página própria e aportes

- **Pop-ups de cadastro:** em todo lugar onde algo é adicionado à mão (conta, cartão, dívida, pagamento, categoria, gasto, transação, compra no cartão, aporte, meta) há um botão "+ Novo ..." que abre um pop-up com o formulário. Fecha com Esc, clique fora ou ✕.
- **Extrato do cartão:** "Ver extrato" abre a página `/cartoes/:id/extrato`, com abas no topo para alternar entre os cartões.
- **Saída no cartão (Transações):** ao lançar uma saída é possível escolher *Conta* ou *Cartão*. No cartão escolhe-se o cartão e o número de parcelas; a compra entra sozinha na fatura certa. Só aparecem cartões cadastrados à mão: cartões conectados (Open Finance) recebem as compras automaticamente e o servidor recusa lançamento manual neles.
- **Aportes da Reserva de Liberdade:** tipos mensal, extra (13º, bônus, restituição), rendimento, transferência e resgate (retirada), com resumo por tipo. Os tipos continuam evoluindo aos poucos.

- **Detalhes do cartão:** na aba Cartões, clicar no cartão (ou em "Detalhes") abre um pop-up com conta pagadora, fechamento, vencimento, limite usado/disponível e a lista de faturas; clicar numa fatura abre o extrato já nela.
- **Reserva de Liberdade, mais completa:** cada lançamento pode ser editado ou apagado; dá para informar a conta de origem do aporte (ou de destino do resgate), cujo saldo é ajustado na hora se for manual; e há um gráfico com a evolução do saldo mês a mês.

## Rodada de ajustes (voz)

- **Meu Dinheiro:** a aba junta Contas e Reserva de Liberdade (Cartões continua separado). As contas são cards em duas colunas, com ícone escolhido no cadastro, mini gráfico de entradas x saídas do mês e data da última transação; clicar abre as transações só daquela conta. O botão passou a se chamar "Conectar via Open Finance". Novo tipo de conta: Benefício.
- **Reserva como compra de ativo:** cada aporte é uma compra (ou venda) de um tipo de investimento (CDB, CDI/renda fixa, Tesouro, poupança/porquinho, fundos, FIIs, ações, cripto, outro), com ativo, quantidade e preço unitário do dia (valor = quantidade × preço; sem cotação, só o valor total). Pizza "Onde está investido". A meta tem nome, ícone de uma biblioteca embutida e um tipo de investimento que conta nela; a tabela `metas_reserva` já comporta várias metas no futuro.
- **Dashboard:** gráfico único de entradas e saídas no topo (12 meses, arrastável, valores ao passar o mouse/dedo); pizza de entradas sob "Saldo do mês" e pizza de despesas sob "Despesas do mês", com as dívidas urgentes destacadas; orçamento unificado (limite x consumido por categoria); cards clicáveis; explicações em "Maiores dívidas" e "Alertas".
- **Plano de Quitação** (antes "Dívidas"): ganhou o total das faturas abertas de todos os cartões.
- **Transações:** categorias de entrada (salário, renda extra...) separadas das de despesa; a compra no cartão também aceita categoria.

## Segunda rodada de ajustes (voz)

- **Dashboard:** gráfico mensal compacto (meses abreviados, sem legenda explicativa), com barras de entradas/saídas, uma linha de resultado do mês (verde) e uma da variação da Reserva de Liberdade (verde-água). Faturas e parcelas futuras aparecem como projeção nos meses seguintes; "Saldo do mês" continua só com o que aconteceu. O total das faturas dos cartões aparece em "dívidas que pedem urgência".
- **Cartões de Crédito:** em cartão manual, cada fatura pode ser marcada como paga escolhendo a conta de onde o dinheiro saiu (`POST /api/cartoes/:id/faturas/:AAAA-MM/pagar`; debita a conta manual e cria a saída em Transações; `DELETE` desfaz). Em cartão conectado isso virá do Open Finance. As faturas vivem só no bloco consolidado do Plano de Quitação.
- **Categorias** (antes Orçamento): categoria clicável abre as transações dela; transação ganha subcategoria/justificativa livre (sem orçamento próprio); entradas do mês por categoria de receita (`GET /api/transacoes/resumo-receitas`).
- **Meu Dinheiro:** botões menores no celular; o ícone da conta aceita imagem (logo do banco, reduzida a 96x96 no navegador).
- **Reserva de Liberdade:** painel único com cards (total investido, metas, histórico, evolução); várias metas (`POST/PUT/DELETE /api/reserva/metas`), cada uma com um tipo de investimento (pílula na cor da pizza), prazo opcional e selo no ritmo / adiantado / atrasado; o aporte escolhe a meta de destino (`metaId`); sugestão de 6 meses dos tetos só para metas de emergência/reserva/liberdade; tipos reais de mercado (LCI, LCA, debêntures, COE, previdência, ETFs, BDRs...), sem "Outro" (o antigo "Outro" virou "CDI / Renda fixa").

## Terceira rodada de ajustes (voz)

- **Transações em tabela:** data, tipo, descrição, banco/conta (com o ícone), categoria e valor, com menu ⋮ no fim da linha: Editar, Ignorar (vira Reativar) e Apagar. "Editar" abre o formulário completo (descrição, data, categoria, subcategoria); valor e conta não mudam por edição (`PUT /api/transacoes/:id`).
- **Ignorar transação** (`PUT /api/transacoes/:id/ignorar`): sai de todos os cálculos (saldo de conta manual, totais, gasto da categoria, Dashboard, Relatórios), continua na lista com marca visual e pode ser reativada. Em conta conectada ao banco o saldo não é alterado (vem do banco).
- **Pagamento:** "Conta" virou "Débito / Pix" e "Cartão" virou "Cartão de crédito" (mesmo comportamento).
- **Ícones:** cartões aceitam emoji ou logo como as contas, e o ícone aparece em todo lugar que cita cartão ou banco.
- **Cartões de Crédito:** o botão "Detalhes" virou "Fatura", que abre direto a fatura aberta (valor, vencimento e "marcar como paga"); "Ver extrato" continua.

## Quarta rodada de ajustes (voz)

- **Subcategoria:** o campo agora se chama só "Subcategoria" e sugere (autocompletar) as já usadas na mesma categoria, mais usadas primeiro; texto livre continua valendo (`GET /api/transacoes/subcategorias?categoriaId=` ou `?categoriaReceita=`).
- **Ícone nas categorias:** emoji de uma biblioteca de 20 opções (campo `icone` em `/api/categorias`). Aparece nos cards e no pop-up de Categorias e no Dashboard (pizza, legenda e lista de limites), e não aparece na lista de Transações.
- **Pop-up da categoria:** usa a cor da categoria (a mesma do Dashboard) no total, na barra de teto, nas caixinhas de subcategoria e nos valores.

## Quinta rodada de ajustes (comentários)

- **Dashboard:** clicar num mês do gráfico muda o Dashboard inteiro para aquele mês (`GET /api/dashboard?mes=AAAA-MM`: cards, pizzas, orçamento, faturas e alertas); clicar de novo ou "voltar ao mês atual" restaura. O gasto por categoria passou a somar as transações do mês (o acumulado da categoria não zera na virada, e "Registrar gasto" manual não entra nesse número). "Orçamento do mês" mostra só as 5 categorias com maior gasto. Botões "+" nos cards Saldo do mês (azul, receita) e Despesas do mês (rosa, despesa) abrem direto o pop-up de lançamento em Transações (`/transacoes?novo=entrada|saida`).
- **Transações:** os dois filtros viraram um único ícone de funil na borda direita do quadro (com contagem de filtros ativos); "+ Nova saída" rosa e "+ Nova entrada" azul; blocos Entradas (azul), Saídas (rosa) e Resultado (verde) com as cores do gráfico.
- **Meu Dinheiro:** em cards estreitos o nome do banco fica acima do saldo (container query).
- **Meu Dinheiro:** clicar numa conta abre um pop-up com todas as transações dela, em lista simples (data, descrição, valor), com atalho "Abrir em Transações".
- **Cartões de Crédito:** um botão só ("Fatura e extrato"); Editar e Remover foram para o menu ⋮ no canto do card; "Pagar fatura" é um ícone pequeno e rosa no canto superior direito do card, sem título (a mensagem aparece ao passar o mouse ou tocar); depois de confirmado vira um ícone verde com contorno e preenchimento transparente.
- **Plano de Quitação:** botões menores e contidos no quadro; "+" circular rosa com legenda "Registrar pagamento"; o sistema procura nas transações (Open Finance ou manuais) saídas cuja descrição cita a dívida e oferece "Abater" (`GET /api/dividas/:id/pagamentos-reconhecidos`, `POST /api/dividas/:id/pagamentos` com `transacaoId`, uma transação só abate uma vez).
- **Menu ⋮ (sexta rodada):** todo "Editar"/"Apagar"/"Remover" virou um ícone de três pontinhos que lista as opções: no canto superior direito quando é bloco (conta, categoria, meta, dívida) e no fim da linha quando é lista (histórico da Reserva, lançamentos da fatura, transações, cartões). Componente único `components/MenuPontos.vue`.
- **Meu Dinheiro:** o pop-up da conta abre no mês atual e tem um ícone de filtro para trocar o período (este mês, mês passado, 7/15/30 dias, tudo).
- **Transações:** botões simplificados para "+ Saída" e "+ Entrada".
- **Categorias de receita (sétima rodada):** a tela Categorias agora tem **Receitas** em cima e **Despesas** embaixo, cada uma num quadro com blocos lado a lado (até 3 por linha; 2 e 1 em telas estreitas). Um único botão "+ Nova categoria" abre o pop-up com a escolha Receita/Despesa (receita não tem teto). Categorias de receita são do usuário (tabela `categorias_receita`, 7 padrões criados na primeira vez): `GET/POST /api/categorias/receitas`, `PUT/DELETE /api/categorias/receitas/:id`; renomear atualiza as entradas já lançadas, remover deixa-as "Sem categoria". `resumo-receitas` lista todas as categorias (também as zeradas) com `id` e `icone`. Cada bloco tem só um "+" colorido (azul na receita, cor da categoria na despesa) que abre o lançamento já com a categoria escolhida (`/transacoes?novo=saida&cat=ID` ou `?novo=entrada&catReceita=NOME`); o antigo "Registrar gasto" manual saiu da tela.
- **Plano de Quitação — Registrar pagamento:** o "+" agora abre os mesmos campos de uma despesa (descrição, valor, data, conta, categoria, subcategoria com sugestões). Ele lança uma saída em Transações (o saldo da conta cai) e abate a dívida; o histórico do card mostra data, valor e "conta · categoria · subcategoria". O histórico vem de `historico_pagamentos` ligado à transação (`tx_conta`, `tx_categoria`, `tx_subcategoria` na resposta de `/api/dividas`).
- **Plano de Quitação:** o link "Ver gastos e parcelas" saiu do card (o histórico de pagamentos e os pagamentos reconhecidos cobrem o acompanhamento). A rota `GET /api/dividas/:id/gastos` continua no backend, sem uso na tela.
- **Plano de Quitação — arquivar e vincular banco:** o menu ⋮ da dívida tem **Editar** (nome, juros, urgência, banco) e **Arquivar**. No rodapé da página, "Dívidas arquivadas (n)" abre a lista com **Restaurar** e **Remover** (remoção definitiva com confirmação em dois toques). Arquivada some do Plano, do Dashboard e dos totais (`dividas.arquivada`; `GET /api/dividas?arquivadas=1`; `PUT /api/dividas/:id {arquivada}`). Na dívida dá para **vincular um banco/conta** (`dividas.conta_id`, `contaId` no POST/PUT; só contas do próprio usuário). Com o banco vinculado, o sistema reconhece sozinho as saídas que parecem pagamento: citam o nome da dívida (em qualquer conta) ou citam o banco junto de "fatura/parcela/boleto/pagamento…"; as que saíram da própria conta vinculada aparecem primeiro, marcadas "banco vinculado". O abate continua sendo confirmado pelo usuário ("Abater").
- **Transações — detalhes e edição livre:** clicar numa linha abre o pop-up "Detalhes da transação" (o ⋮ continua com Editar/Ignorar/Apagar). Nas **lançadas manualmente** dá para editar tudo: tipo (entrada/saída), descrição, valor, data, conta, categoria e subcategoria; o saldo das contas manuais e o gasto das categorias são refeitos (transação ignorada não mexe neles até ser reativada). Nas que **vieram do Open Finance** só categoria e subcategoria mudam; descrição, valor, data e conta aparecem só para leitura. Única trava nas manuais: se a transação já abateu uma dívida ou marcou uma fatura como paga, valor, tipo e conta ficam fixos (descrição, data e categoria seguem livres). `PUT /api/transacoes/:id` aceita `tipo`, `valor`, `contaId`.
- **Transações:** o mês do seletor aparece abreviado ("Out/2026").
- **Fatura do cartão:** o botão virou "+ Compra" (rosa, cor de despesa), na frente do nome do cartão; em telas estreitas desce para baixo do nome.
- **Fatura do cartão:** o "Pagar fatura" passou para a frente do valor total e ficou menor (em tela estreita desce para baixo do valor).
- **Fatura do cartão:** as datas de fechamento/vencimento e a situação ficam numa caixa contornada, com a cor da situação: azul (aberta), amarelo (fechada), cinza (futura) e verde (paga).
- **Cartões:** saiu o texto "Paga com:". Se o cartão tem banco vinculado, aparece só o banco, num selo na cor dele (cor pelo nome de bancos conhecidos, pela cor dominante do logo enviado ou uma cor fixa sorteada do nome; `utils/corBanco.js`); sem banco vinculado, nada aparece. Fechamento e vencimento ficam em retângulo: na lista, "Fecha dia X · Vence dia Y" em amarelo; no extrato, a caixa colorida com as datas da fatura. A API de cartões devolve `contaIcone`.
- **Nova compra no cartão:** ganhou categoria de despesa e subcategoria (com sugestões das já usadas); aparecem na linha do extrato. Novo campo `lancamentos_cartao.subcategoria`.
- **Compras do cartão em Transações:** cada parcela aparece na lista (selo "cartão", categoria, subcategoria, parcela "2/10" no mês dela; clicar leva ao extrato do cartão). São só de consulta e ficam FORA de entradas/saídas/resultado, porque o dinheiro só sai da conta quando a fatura é paga (isso já gera uma saída); a API devolve `resumo.cartao` e `quantidadeCartao` para a nota informativa.
- **Nova compra:** o botão "Registrar compra" ficou rosa (cor de saída), como o "+ Compra".
- **Plano de Quitação:** o campo "Pagamento mensal" da simulação ficou menor (150px), com o botão abaixo.
- **Categorias:** o "+" de nova despesa é sempre rosa (igual ao gráfico); nas receitas, o "+" azul fica na frente do valor e o valor reduz a fonte conforme a largura do bloco.
- **Padrão de cores:** entrada = azul e saída = rosa também no mini-gráfico das contas e nas etiquetas/valores de Transações (antes verde/vermelho). A Reserva de Liberdade usa a cor do gráfico do Dashboard (ciano, token `--cor-reserva`) no total investido, nas metas e na linha de evolução.
- **Plano de Quitação:** o botão "Simular quitação" fica na frente do campo de valor em tela larga e desce para baixo em tela estreita (até 480px), na cor violeta de simulação/projeção.
- **Categorias de receita:** cada categoria tem sua cor (borda, valor e "+"; a paleta não usa rosa, que é a cor das saídas), e o pop-up de detalhes usa a mesma cor.
- **Categorias:** o botão "+ Nova categoria" ficou na frente do título, no canto direito, em violeta (cor neutra, que não é de entrada nem de saída).
- **Menu lateral:** o ícone de "Meu Dinheiro" virou um banco (colunas), diferente do cartão de crédito.
- **Teto mensal opcional:** nova categoria e edição aceitam teto vazio ou 0 ("sem teto"). O card mostra "sem teto", e categorias sem teto não geram alerta de 90% no Dashboard. A API aceita `tetoMensal` omitido/vazio/0 e recusa só valor negativo.
- **Barras de rolagem (anotação + aplicado):** a barra de rolagem não precisa ser tão marcada. Agora todas (gráfico mensal, listas e pop-ups) são finas, com trilho transparente e o "polegar" na cor da marca (azul `--cor-primaria`) com pouca opacidade, que fica mais forte ao passar o mouse. Definido uma vez em `styles/tokens.css`.
- **Dashboard · Reserva de Liberdade:** no card de entradas, um destaque (como o das dívidas urgentes) mostra o total investido, os aportes do mês exibido e a meta mais próxima de ser atingida (a de maior percentual entre as não concluídas) ou a única que existir. Clicar leva à Reserva. A API do Dashboard devolve `reservaResumo { total, aportesMes, quantidadeMetas, proximaMeta }`.
- **Meu Dinheiro · botões de conta:** "Conectar via Open Finance" (azul-céu, conexão automática) e "+ Nova conta manual" (verde, criar à mão) agora têm o mesmo tamanho e só cores frias; em tela estreita (até 640px) ficam empilhados, também iguais.
- **Entradas em tons frios:** a pizza de entradas do Dashboard e as categorias de receita usam a mesma paleta fria (azul, azul-céu, ciano, verde-água, índigo, violeta, esmeralda; nada de amarelo, laranja ou rosa), com cor fixa para as categorias padrão e estável pelo nome nas demais (`utils/coresReceita.js`). O destaque da Reserva no Dashboard ganhou caixa com contorno mais marcado no lado esquerdo, na cor da Reserva (mesma identidade dos blocos de categoria).
- **Compra de cartão editada em Transações:** clicar numa compra de cartão na lista abre o mesmo pop-up das outras transações, sem sair da página: descrição, valor total, data da compra, categoria e subcategoria (vale para a compra inteira, todas as parcelas, via `PUT /api/cartoes/:id/lancamentos/:compraId`). A lista e a fatura leem a mesma linha, então a edição aparece nos dois lugares, e os totais de entradas/saídas continuam sem contar o cartão (só quando a fatura é paga). A API de transações devolve `compra_id`, `valor_total_compra`, `descricao_base`, `data_compra`, `total_parcelas` e `cartao_origem` nessas linhas.
- **Dashboard · Reserva em duas tiras:** o destaque da Reserva de Liberdade mostra duas tiras separadas, como as das dívidas urgentes, cada uma com cor própria na borda esquerda: a **meta** mais próxima de ser atingida (ou a única), com título, porcentagem e barra (ciano da Reserva), e o **total de aportes lançados** (índigo). Clicar leva a Meu Dinheiro.
- **Dashboard · dívidas que pedem urgência:** tirei as etiquetas de texto ("Risco de negativação", "Atenção") à frente dos valores; a urgência fica só na cor (borda e bolinha), com o texto como dica ao passar o mouse. Continua o "N cartões" na linha das faturas dos cartões.
- **Dashboard · Reserva separada da pizza de entradas:** uma linha divisória e mais respiro separam o texto/legenda das entradas por categoria do bloco de aportes da Reserva de Liberdade.
- **Meu Dinheiro · botões dentro do bloco:** os dois botões do topo (Conectar via Open Finance / Nova conta manual) não passam mais da borda do bloco de contas: o cabeçalho quebra a linha quando falta espaço e os botões encolhem (até 420px, mesmo tamanho), ficando abaixo do total em telas médias e empilhados em telas estreitas.
- **Extrato do cartão em pop-up:** ao clicar em "Ver fatura"/extrato (em Cartões, no Plano de Quitação ou nos avisos de Transações) o extrato abre como janela sobre a página, com ✕ e Esc para fechar (Esc fecha primeiro o pop-up de compra, se aberto) e volta para a página de onde veio. Trocar de cartão pelas abas não empilha histórico. A rota `/cartoes/:id/extrato` continua existindo (link direto abre o pop-up sobre a lista de Cartões).
- **Cartões · quadro de fechamento/vencimento compacto:** o quadro "Fecha dia X · Vence dia Y" ficou menor ("Fecha 28 · Vence 5", fonte 11px, numa linha só) e fica logo à frente do chip do banco; em cartões estreitos desce para a linha de baixo. O texto completo aparece como dica ao passar o mouse.
- **Dashboard · título renomeado:** o card da pizza de entradas agora se chama "Saldo do mês por categoria" (antes "Entradas do mês, por categoria"); o conteúdo continua sendo as entradas por categoria, com o destaque da Reserva logo abaixo.
- **Meu Dinheiro · contas legíveis em qualquer largura:** a grade de contas deixou de forçar 2 colunas fixas (que encolhiam os cartões e quebravam nomes como "Nub ank"): agora cada cartão de conta tem no mínimo ~280px e a grade passa para 1 coluna quando falta espaço; nomes só quebram em espaços; em telas muito estreitas o respiro interno diminui para ganhar largura.
- **Categorias · botões "+" iguais aos do Dashboard:** os botões de adicionar nas categorias de receita agora têm a mesma cor e tamanho do "+" de entradas do Dashboard (azul `--cor-primaria`, 26px), e os de despesa o mesmo do "+" de despesas (rosa). A cor individual de cada categoria de receita continua no contorno lateral e no valor.
- **Entradas "Sem categoria":** o botão "+" e o contorno dessa categoria de receita usam o azul padrão de receita (o das barras de entrada do gráfico), igual na pizza do Dashboard.
- **Dashboard:** o clique nos meses do gráfico voltou a funcionar (o arrastar só captura o ponteiro depois de mover de verdade, e o clique fica no grupo do mês). A linha do mês em foco mostra os valores reais (R$ 9.340,00), não abreviados.
- **Categorias:** o "+" fica à direita do bloco, na linha do valor, em receitas e despesas.
- **Reserva de Liberdade:** a meta tem o botão "+ Aportar" na frente do nome (na cor da Reserva), a porcentagem foi para o fim da barra de progresso e a etiqueta "Todos os tipos" ganhou dica (a meta conta investimentos de qualquer tipo; com um tipo escolhido, só os desse tipo).
- **Extrato do cartão:** cada linha segue a ordem do extrato das contas (data, descrição, valor) e, em cartão manual, a compra pode ser editada pelo ⋮ (descrição, valor total, data, categoria, subcategoria, dívida; parcelas fixas). `PUT /api/cartoes/:id/lancamentos/:compraId`; valor e data travam se alguma parcela estiver em fatura já paga. A remoção agora pede confirmação num pop-up (o `confirm()` do navegador não funciona dentro do artefato).
- **Cores das categorias:** cada categoria tem cor escolhida na criação/edição (receitas só em tons frios, despesas só em tons quentes; coluna `cor` em `categorias_orcamento` e `categorias_receita`). "Sem categoria" é cinza azulado. A cor aparece nos blocos, gráficos e no Dashboard.
- **Registrar compra (cartão):** o botão virou só um "+" rosa. Na Reserva de Liberdade a pílula "Todos os tipos" foi removida e o ciano da Reserva vale para rótulo, % e valores no Dashboard.
- **Open Finance (Pluggy / MeuPluggy):** integração real. Coloque `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET` no `.env` do servidor (chaves do painel dashboard.pluggy.ai; ative o conector **MeuPluggy** em Dados Financeiros → Customização → Conectores). Em Meu Dinheiro ("Conectar via Open Finance") ou em Configurações ("+ Conectar banco") abre o widget da Pluggy; cada banco é uma conexão (limite gratuito: 5) e é conectado uma vez. A sincronização (ao conectar, no botão "Sincronizar"/"Atualizar tudo" e a cada 6 h por `SINCRONIZACAO_CRON`) traz contas (saldo do banco), cartões (limite, fechamento e vencimento) com as compras, extrato (primeira vez: 90 dias) e investimentos (só consulta por enquanto, não entram na Reserva de Liberdade). Nunca duplica (`id_externo` por registro); uma transação lançada à mão com mesma conta, dia e valor é ligada à do banco em vez de repetida. Entradas e saídas usam o campo `type` da Pluggy (DEBIT/CREDIT); saídas são categorizadas por palavra-chave; parcelas entram como compra única com "(n/N)" na descrição; pagamentos e estornos do cartão não viram compra. Desconectar mantém o histórico e devolve contas e cartões ao modo manual. Rotas: `GET /api/open-finance/status`, `POST /connect-token`, `POST /conexoes`, `POST /sincronizar[/:id]`, `DELETE /conexoes/:id`. A demonstração só avisa que precisa do servidor. Backup do sistema sem Open Finance: `sistema-financeiro-SEM-open-finance-backup.zip`. Teste isolado da conexão: pasta `pluggy-teste`.
- **Rodar no PC (Windows):** dois cliques em `iniciar.bat` (precisa do Node 22 ou mais novo). Na primeira vez ele instala o servidor e as telas, pede as chaves da Pluggy (Enter pula) e cria o seu usuário (`backend/src/scripts/configurar.js`, que grava o `backend/.env`); nas próximas só sobe o sistema em http://localhost:4000. O servidor passou a entregar as telas compiladas (`frontend/dist`) além da API, então é um processo só, o mesmo modelo que vai para o ZimaOS. Os dados ficam em `backend/data`. O banco usa o `better-sqlite3` quando ele está instalado e, se não estiver (como no Windows, onde ele pedia o Visual Studio para compilar), usa o SQLite que já vem no Node 22.13+ (`backend/src/utils/bancoSqlite.js`); por isso o `iniciar.bat` instala com `--ignore-scripts` e o `better-sqlite3` é dependência opcional.

## Versão de demonstração (sem servidor)

`cd frontend && npm install && npm run build:demo` gera
`frontend/dist-demo/index.html`: o sistema INTEIRO em um arquivo só, que abre
com duplo clique. As rotas do backend (`backend/src/routes`) rodam de verdade
no navegador, sobre um SQLite em JavaScript (sql.js); só o Express, o banco e
o login são trocados por versões locais (`frontend/demo/shims` e
`frontend/demo/stubs`). Começa com dados de exemplo (`demo/seed.js`), guarda
tudo no localStorage do navegador e tem o botão "Reiniciar" no canto.
Limites: sem Open Finance, sem login real, e `confirm()` responde "sim".

## Colocando no servidor pessoal (produção)

Pontos de atenção quando for além do ambiente local:

1. Sirva tudo atrás de HTTPS (ex: Caddy ou Nginx + Let's Encrypt) e mude
   `COOKIE_SECURE=true` no `.env` do backend.
2. Rode `npm run build` no frontend e sirva a pasta `frontend/dist` como
   arquivos estáticos (o mesmo Nginx/Caddy pode fazer isso).
3. Rode o backend como serviço persistente (`pm2`, `systemd` ou similar),
   não só `npm run dev`.
4. Faça backup periódico do arquivo `backend/data/sistema.db` — ele é o
   banco de dados inteiro.

## Roteiro completo

Todas as 8 etapas do roteiro original foram construídas. Depois delas
entraram os cartões (entidade, extrato por fatura e parcelas). Também entraram o
histórico de gastos e as parcelas em Dívidas. Segue na fila: puxar cartões
automaticamente pelo Open Finance.

## Novo visual — fundação (destinos, paleta e navegação)

- **Destinos de instalação** (`DESTINO` no backend, `--mode` no frontend): o mesmo código roda como **servidor** (ZimaOS/Docker, escuta em `0.0.0.0`), **pc** (só `127.0.0.1`) e **android** (backend embutido, `127.0.0.1`). O que muda por destino fica em dois arquivos: `backend/src/config/destino.js` (host, porta, pasta de dados `DATA_DIR`) e `frontend/src/config/destino.js` (endereço da API, recursos ligados, rótulo). Scripts: `npm run build:servidor`, `build:pc`, `build:android` (saída em `dist-android`, caminhos relativos). `frontend/public/config.js` permite trocar o endereço da API **sem recompilar**. Todas as chamadas `/api` passam por `frontend/src/services/http.js`.
- **Paleta oficial e temas:** `frontend/src/styles/paleta.css` (96 tons: saídas quentes, entradas só azuis, metas roxas, investimentos verdes) e tokens semânticos em `tokens.css` (`--cor-entrada`, `--cor-saida`, `--cor-meta`, `--cor-investimento`). Tema **claro, escuro ou automático** (Perfil → Preferências, ou o botão no menu lateral) e opção de **reduzir animações**; durações num lugar só (`--anim-*`). Reserva de Liberdade agora usa o Violeta (eixo das metas).
- **Navegação:** `frontend/src/config/menu.js` define os grupos uma vez. Até 768 px aparece o **rodapé do celular** (Contas · Cartões · Dashboard · Objetivos · Mais) com a bolha do item ativo que desliza, gaveta ao tocar no grupo já ativo e barra que some ao rolar para baixo; acima disso, **menu lateral** com os mesmos grupos em seções recolhíveis. Telas novas: **Objetivos** (abas Metas e Investimentos, trocáveis arrastando) e **Perfil** (Mais). Páginas renomeadas: Contas, Cartões e Crédito, Dívidas.
- **Dashboard:** o gráfico principal agora é o **orbe** Entradas × Saídas do mês (componente `Orbe.vue`: esfera em degradê que assenta nas proporções, anel com percentuais e lista com valores).
