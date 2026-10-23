// "Destino de instalação": o mesmo código roda em lugares diferentes. Tudo o que muda de um
// destino para o outro fica aqui e no .env (nunca espalhado pelas rotas).
//
//   servidor  → ZimaOS/Docker, acessado pela rede/túnel por vários aparelhos e usuários
//   pc        → instalado no computador, só ele acessa (localhost)
//   android   → backend embutido no app; só o próprio aparelho acessa
//
// Variáveis (todas opcionais; os padrões de cada destino já servem):
//   DESTINO   servidor | pc | android      (padrão: servidor)
//   HOST      endereço em que o servidor escuta
//   PORT      porta (padrão 4000)
//   DATA_DIR  pasta do banco de dados (no Docker, aponte para o volume persistente)
const path = require('path');

const PADROES = {
  servidor: { host: '0.0.0.0', sincronizacaoAgendada: true },
  pc: { host: '127.0.0.1', sincronizacaoAgendada: true },
  android: { host: '127.0.0.1', sincronizacaoAgendada: true },
};

const nome = PADROES[process.env.DESTINO] ? process.env.DESTINO : 'servidor';
const padrao = PADROES[nome];

module.exports = {
  nome,
  host: process.env.HOST || padrao.host,
  porta: Number(process.env.PORT) || 4000,
  pastaDados: process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data'),
  sincronizacaoAgendada: padrao.sincronizacaoAgendada,
};
