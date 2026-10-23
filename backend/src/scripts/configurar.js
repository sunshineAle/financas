// Primeira configuração guiada (rodada pelo iniciar.bat). Cria o .env, pede as chaves
// da Pluggy e cria o usuário de acesso. Pode rodar de novo sem problema: só pergunta o que falta.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const raiz = path.join(__dirname, '..', '..');
const arquivoEnv = path.join(raiz, '.env');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
let mudo = false;
rl._writeToOutput = function (texto) { if (!mudo) rl.output.write(texto); else if (texto.includes('\n')) rl.output.write('\n'); };
const linhas = rl[Symbol.asyncIterator]();
const perguntar = async (t, secreto = false) => { process.stdout.write(t); mudo = secreto; const r = await linhas.next(); mudo = false; return r.done ? '' : String(r.value).trim(); };

function lerEnv() {
  const m = {};
  if (fs.existsSync(arquivoEnv)) for (const l of fs.readFileSync(arquivoEnv, 'utf8').split(/\r?\n/)) { const x = l.match(/^([A-Z0-9_]+)=(.*)$/); if (x) m[x[1]] = x[2]; }
  return m;
}
function gravarEnv(m) { fs.writeFileSync(arquivoEnv, Object.entries(m).map(([k, v]) => `${k}=${v}`).join('\n') + '\n'); }

(async () => {
  const env = lerEnv();
  env.DESTINO ||= 'pc'; // este script é o do PC; no servidor use DESTINO=servidor
  env.PORT ||= '4000';
  env.JWT_SECRET ||= crypto.randomBytes(32).toString('hex');
  env.FRONTEND_URL ||= 'http://localhost:4000';
  env.COOKIE_SECURE ||= 'false';
  env.PLUGGY_SANDBOX ||= 'false';

  if (!env.PLUGGY_CLIENT_ID || !env.PLUGGY_CLIENT_SECRET) {
    console.log('\nOpen Finance (Pluggy). Cole as chaves do painel dashboard.pluggy.ai (clique com o botão direito para colar).');
    console.log('Se quiser pular agora, só aperte Enter; dá para colocar depois no arquivo backend\\.env.\n');
    const id = await perguntar('Client ID: ');
    if (id) { env.PLUGGY_CLIENT_ID = id; env.PLUGGY_CLIENT_SECRET = await perguntar('Client Secret: ', true); }
    else { env.PLUGGY_CLIENT_ID ||= ''; env.PLUGGY_CLIENT_SECRET ||= ''; }
  }
  gravarEnv(env);
  process.env.JWT_SECRET = env.JWT_SECRET;

  const db = require('../db');
  const dados = require('../dados');
  if (!db.prepare('SELECT id FROM usuarios WHERE excluido_em IS NULL LIMIT 1').get()) {
    console.log('\nCrie o seu acesso ao sistema (só você usa).\n');
    let email = '';
    while (!/^\S+@\S+\.\S+$/.test(email)) email = await perguntar('E-mail de login: ');
    let senha = '';
    while (senha.length < 8) senha = await perguntar('Senha (mínimo 8 caracteres): ', true);
    const nome = (await perguntar('Seu nome (opcional): ')) || null;
    const bcrypt = require('bcryptjs');
    dados.inserir('usuarios', { email, senha_hash: await bcrypt.hash(senha, 12), nome });
    console.log('\nUsuário criado.');
  }
  rl.close();
})().catch((e) => { console.error('Erro na configuração:', e.message); process.exit(1); });
