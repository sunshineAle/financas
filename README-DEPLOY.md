# Publicar e instalar o app (PWA)

URL de publicação: **https://sunshineale.github.io/financas/** (usuário `sunshineAle`, repositório `financas`).
O app é um PWA: roda inteiro no navegador, com banco no aparelho (IndexedDB). Sem servidor, sem Open Finance, sem chaves.
Primeiro acesso: o app abre vazio e pede apelido + senha ou PIN (ou "Restaurar Backup"). Não há dados de exemplo automáticos.

## Instalar no celular ou computador
1. Abra a URL acima no Chrome/Edge (Android, PC) ou Safari (iPhone: Compartilhar > Adicionar à Tela de Início).
2. Toque em "Instalar app" / "Adicionar à tela inicial". Depois da primeira abertura ele funciona offline.

## Testar localmente
```
cd frontend
npm install
npm run build:pwa            # gera frontend/dist-pwa (base relativa, funciona em qualquer pasta)
npm run verificar:pwa        # falha se houver caracteres de controle / charset fora do lugar
npx vite preview -c vite.pwa.config.js
```
Para testar exatamente como no GitHub Pages: `PAGES_BASE=/financas/ npm run build:pwa` e sirva a pasta
dentro de um diretório chamado `financas` (ex.: `npx serve ..` apontando para o pai).

## Publicar (GitHub Pages) — opção 1: workflow automático
1. No GitHub: Settings > Pages > Source: **GitHub Actions**.
2. Dê `git push` na branch `main`. O workflow `.github/workflows/pages.yml` roda `npm run build:pages`, verifica e publica.

## Publicar — opção 2: pasta `docs/`
1. `cd frontend && npm run build:pages` (build com base `/financas/`, verificação e cópia para `docs/` na raiz do repositório).
2. Commit e push. Em Settings > Pages: Source = branch `main`, pasta `/docs`.

## Atualizar o app instalado
Cada build tem uma versão (hash do conteúdo, em `version.json` e no cache do service worker). Ao publicar uma versão nova,
o app instalado detecta sozinho (ao abrir, ao voltar para ele e a cada hora) e mostra **"Nova versão disponível — Atualizar"**.
Tocando em Atualizar o app recarrega já na versão nova. Os dados do aparelho não são tocados.

## Observações
- Hash history (`#/rota`): nenhuma rota dá 404. `404.html` (cópia do app) e `.nojekyll` são gerados no build.
- Netlify/outros: o arquivo `_headers` fixa `charset=utf-8`. `npm run verificar:pwa` impede os "negocinhos" (caracteres de controle).
- Dados pessoais (extratos, faturas, backups `.sfin`) estão no `.gitignore`: não suba para o repositório.
