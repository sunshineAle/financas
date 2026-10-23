// Uso: npm run criar-usuario -- email@exemplo.com "minha senha" "Meu Nome"
// Não existe tela pública de cadastro de propósito — este sistema é de um
// usuário só, então a conta é criada direto no servidor.

const bcrypt = require('bcryptjs');
const db = require('../db');
const dados = require('../dados');

async function main() {
  const [, , email, senha, nome] = process.argv;

  if (!email || !senha) {
    console.error('Uso: npm run criar-usuario -- email@exemplo.com "senha" "Nome (opcional)"');
    process.exit(1);
  }

  const existente = db.prepare('SELECT id FROM usuarios WHERE email = ? AND excluido_em IS NULL').get(email);
  if (existente) {
    console.error(`Já existe um usuário com o e-mail ${email}.`);
    process.exit(1);
  }

  const senhaHash = await bcrypt.hash(senha, 12);

  dados.inserir('usuarios', { email, senha_hash: senhaHash, nome: nome || null });

  console.log(`Usuário criado com sucesso: ${email}`);
}

main().catch((err) => {
  console.error('Erro ao criar usuário:', err);
  process.exit(1);
});
