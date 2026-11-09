# Prévia das anotações 79, 80 e 81

Base: `main` de `sunshineAle/financas`, commit `e583dcffc6360b930bbbe6d3b4844233300016cd`, versão 1.2.2. A prévia usa a mesma entrada PWA, backend no navegador, componentes e serviços do app atual. Não é uma atualização da compilação antiga de 29/10.

## O que testar

- 79: na primeira abertura, **Restaurar meu Dagda** → arquivo .sfin ou Google Drive → senha do backup → confirmação. O nome vem do conteúdo cifrado; a mesma senha protege o acesso restaurado. Após a restauração, desbloqueie com ela, sem novo cadastro. Com código de recuperação ou backup sem cifra, defina somente uma nova senha. Backups antigos sem nome de perfil usam o nome disponível em `usuario`; se ele não existir, usam “Eu”, editável no Perfil. Backups novos levam o nome de exibição dentro da cifra.
- 80: Google Drive usa `drive.appdata`, grava em `appDataFolder` e lista todos os backups dessa área com data e tamanho para escolha. A opção Entrar com Google também consulta os backups antigos na pasta Dagda Capital, usando drive.file apenas nesse fluxo. A consulta e o download não movem nem apagam arquivos. Excluir os dados ocultos do app no Drive apaga os backups; mantenha também uma cópia local. Login real e consentimento Google precisam de homologação manual.
- 81: em **Regras**, cadastre uma regra de transferência com o nome completo do titular. A importação e **A revisar** avisam sobre PIX ou nome do titular, sem converter sozinhos. Confirme a conta e a outra ponta quando houver. Valor igual é obrigatório; ambiguidade pede escolha; diferença de um centavo não forma par; recusa persiste. Sem o outro extrato, confirmar cria a contrapartida. Estorno no mesmo arquivo é anulado pelo fluxo já existente.

## Isolamento da prévia

Use somente dados fictícios. A área de restauração usa `dagda-previa-79-81:` e a demonstração usa `dagda-previa-demo-79-81:` em localStorage, sessionStorage e IndexedDB; o app oficial e a prévia antiga não são lidos ou apagados. Não há registro de service worker nem instalação da prévia. No Google, a prévia usa arquivos `previa-sistema-financeiro-*.sfin`, separados da listagem oficial. A limpeza automática não remove esses arquivos nem os oficiais durante os testes da prévia.

## Reproduzir

Use os checkouts existentes; cada tarefa na nuvem já é isolada. Não crie worktrees sem pedido explícito.

```sh
cd /workspace/financas/backend
npm ci
node --test test/transferencias-revisao.test.cjs
cd /workspace/financas/frontend
npm ci
node --test tests/google-backup.test.mjs
npx vite build -c vite.previa.config.js
python3 -m http.server 8001 --directory dist-previa
```

Com o servidor em uma sessão separada e Python Playwright + Chromium instalados:

```sh
cd /workspace/financas/frontend
python3 -u tests/previa-smoke.py
```

A suíte usa perfis temporários, demonstração fictícia e respostas Google simuladas. Não autentica uma conta real. A compilação pode emitir os avisos já existentes do sql.js sobre módulos Node não usados no navegador.

## Publicar só a prévia

Copie o conteúdo de `frontend/dist-previa/` para o checkout `financas-previa`, mantendo `.git`, README e robots.txt. Não copie arquivos de teste ou dados locais. `sw.js`, manifest e ícones de instalação não são necessários para esta prévia. A publicação é separada da geração local; não atualizar `docs/` ou publicar a `main` oficial do app.

## Entrada e demonstração

Na primeira abertura, Google, restauração por arquivo, demonstração e novo acesso ficam visíveis. Testar com dados fictícios abre um banco separado, já preenchido e sem pedir cadastro ou senha. A demonstração contém uma regra e um par PIX fictício para testar A revisar, além dos exemplos do app. Voltar ao acesso preserva os dados da área de restauração.

## Anotações 82–89 — homologação na prévia

- 82/83: janela de instalação por plataforma (Apple sem convite nativo), com orientação testável na prévia; só anunciar provedores configurados, mantendo arquivo local separado. A prévia continua sem instalação/SW.
- 84: confirmação direta do lembrete no prazo já escolhido, sem abrir toda a seção de backup; reutiliza último destino bem-sucedido, não envia sem confirmar e só altera a data depois do resultado validado. Destino ausente requer primeira configuração. Não promete execução com app fechado.
- 85: Regras em blocos responsivos, três recentes por criação, + no topo esquerdo e lista completa em modal.
- 86/87: título Bem-vindo de volta, textos curtos, ajuda contextual e cadastro com Voltar.
- 88: nome do perfil dentro da cifra; teste de restauração seguido de desbloqueio com PIN.
- 89: lista compacta, escolha abre modal; conteúdo só depois de decifrar e importar em SQLite descartável num Worker. O Worker não abre armazenamento do app ativo. O teste inclui migração/importação real, integridade SQLite, referências e contagens; não equivale a homologar cada operação de negócio do usuário num aparelho físico.

Google: o arquivo recém-enviado é baixado de volta, comparado byte a byte e submetido à recuperação isolada antes de autorizar rotação para quatro. Na exclusão manual, outra cópia é baixada, aberta com o acesso atual e recuperada em banco descartável antes de qualquer DELETE. Sem essa prova, o descarte é bloqueado e o limite pode ser excedido. A prévia gerencia só arquivos com prefixo previa-; cópias oficiais e pasta antiga são somente leitura. Não há garantia contra exclusões externas feitas nas configurações do Google ou por outro dispositivo. A nuvem exige criptografia ativa.

Testes adicionais:

```sh
node --test tests/instalacao.test.mjs tests/google-backup.test.mjs
DAGDA_TEST_URL=http://127.0.0.1:8003/ python3 -u tests/regras-responsivas.py
DAGDA_TEST_URL=http://127.0.0.1:8003/ python3 -u tests/ajustes-82-85-smoke.py
DAGDA_TEST_URL=http://127.0.0.1:8003/ python3 -u tests/backup-recuperacao-segura.py
```

Nuvem e perfis Apple são simulados nos testes automatizados. A instalação do WebKit de teste foi tentada; o download oficial foi bloqueado pela política de rede (403 Domain forbidden). A validação em Safari/aparelho Apple físico permanece pendente. Nenhum backup real foi enviado, movido ou apagado nos testes.
