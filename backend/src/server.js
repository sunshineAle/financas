require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

require('./db'); // garante que as tabelas existem ao subir o servidor

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const contasRoutes = require('./routes/contas');
const dividasRoutes = require('./routes/dividas');
const categoriasRoutes = require('./routes/categorias');
const openFinanceRoutes = require('./routes/openFinance');
const transacoesRoutes = require('./routes/transacoes');
const reservaRoutes = require('./routes/reserva');
const investimentosRoutes = require('./routes/investimentos');
const relatoriosRoutes = require('./routes/relatorios');
const configuracoesRoutes = require('./routes/configuracoes');
const cartoesRoutes = require('./routes/cartoes');
const backupRoutes = require('./routes/backup');
const importacaoRoutes = require('./routes/importacao');
const custosFixosRoutes = require('./routes/custosFixos');
const regrasRoutes = require('./routes/regras');
const { iniciarSincronizacaoAgendada } = require('./jobs/sincronizarContas');

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  })
);
// o backup (importar) pode ser grande: parser próprio, antes do global
app.use('/api/backup', express.json({ limit: '100mb' }));
// importação de extratos: planilhas/PDF grandes chegam como linhas de texto
app.use('/api/importacao', express.json({ limit: '30mb' }));
app.use(express.json({ limit: '400kb' }));
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/contas', contasRoutes);
app.use('/api/dividas', dividasRoutes);
app.use('/api/categorias', categoriasRoutes);
app.use('/api/open-finance', openFinanceRoutes);
app.use('/api/transacoes', transacoesRoutes);
app.use('/api/reserva', reservaRoutes);
app.use('/api/investimentos', investimentosRoutes);
app.use('/api/relatorios', relatoriosRoutes);
app.use('/api/configuracoes', configuracoesRoutes);
app.use('/api/cartoes', cartoesRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/importacao', importacaoRoutes);
app.use('/api/custos-fixos', custosFixosRoutes);
app.use('/api/regras', regrasRoutes);

// Placeholder para as próximas etapas do roteiro (dashboard, contas, etc.)
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Se o frontend foi compilado (frontend/dist), o próprio servidor entrega as telas:
// um processo só, em http://localhost:4000 (modo "instalar no PC" ou servidor).
const pastaFront = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(path.join(pastaFront, 'index.html'))) {
  app.use(express.static(pastaFront));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(pastaFront, 'index.html')));
}

const destino = require('./config/destino');
app.listen(destino.porta, destino.host, () => {
  console.log(`Backend (${destino.nome}) rodando em http://${destino.host === '0.0.0.0' ? 'localhost' : destino.host}:${destino.porta}`);
  iniciarSincronizacaoAgendada();
});
