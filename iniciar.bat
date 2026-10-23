@echo off
chcp 65001 >nul
title Sistema Financeiro
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo O Node.js nao foi encontrado. Instale com:  winget install OpenJS.NodeJS.LTS
  echo Depois feche esta janela, abra de novo e rode este arquivo outra vez.
  pause
  exit /b 1
)

rem --- Servidor: instala sem compilar nada (o banco usa o SQLite que ja vem no Node) ---
pushd backend
node -e "require('./src/utils/bancoSqlite'); new (require('./src/utils/bancoSqlite'))(':memory:')" >nul 2>nul
if errorlevel 1 (
  echo [1/3] Instalando o servidor ^(pode levar alguns minutos^)...
  call npm install --no-audit --no-fund --ignore-scripts
  if errorlevel 1 ( echo. & echo Falha ao instalar o servidor. Me mande o erro acima. & popd & pause & exit /b 1 )
  node -e "new (require('./src/utils/bancoSqlite'))(':memory:')"
  if errorlevel 1 ( echo. & echo O banco de dados nao abriu. Confira se o Node e o 22.13 ou mais novo ^(node -v^). Me mande um print desta janela. & popd & pause & exit /b 1 )
)
popd

rem --- Telas ---
if not exist frontend\dist\index.html (
  echo [2/3] Montando as telas ^(so na primeira vez^)...
  pushd frontend
  call npm install --no-audit --no-fund
  if errorlevel 1 ( echo. & echo Falha ao instalar as telas. Me mande o erro acima. & popd & pause & exit /b 1 )
  call npm run build:pc
  if errorlevel 1 ( echo. & echo Falha ao montar as telas. Me mande o erro acima. & popd & pause & exit /b 1 )
  popd
)

echo [3/3] Configuracao...
pushd backend
node src\scripts\configurar.js
if errorlevel 1 ( popd & pause & exit /b 1 )

echo.
echo Abrindo o sistema em http://localhost:4000  ^(feche esta janela para parar^)
start "" http://localhost:4000
node src\server.js
popd
pause
