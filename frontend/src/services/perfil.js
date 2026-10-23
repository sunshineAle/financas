// Dados de perfil guardados NESTE aparelho (o backend ainda não tem rota para editar nome/e-mail nem foto):
// nome e e-mail de exibição, foto (miniatura em JPEG) e cor do avatar. Tudo em localStorage, com try/catch.
import { reactive, watch } from 'vue';

const CHAVE = 'sf:perfil';

// Cores do avatar: degradês feitos só com tokens do tema.
export const CORES_AVATAR = [
  { id: 'azul', rotulo: 'Azul', de: 'var(--cor-primaria)', ate: 'var(--cor-violeta)' },
  { id: 'esmeralda', rotulo: 'Esmeralda', de: 'var(--cor-investimento)', ate: 'var(--cor-entrada)' },
  { id: 'violeta', rotulo: 'Violeta', de: 'var(--cor-meta)', ate: 'var(--cor-primaria)' },
  { id: 'carmim', rotulo: 'Carmim', de: 'var(--cor-saida)', ate: 'var(--cor-alerta)' },
];

function ler() {
  try { return JSON.parse(localStorage.getItem(CHAVE) || '{}') || {}; } catch { return {}; }
}
const inicial = ler();
export const perfil = reactive({
  nome: inicial.nome || '',
  email: inicial.email || '',
  foto: inicial.foto || '',
  cor: inicial.cor || 'azul',
});
watch(perfil, () => {
  try { localStorage.setItem(CHAVE, JSON.stringify({ nome: perfil.nome, email: perfil.email, foto: perfil.foto, cor: perfil.cor })); } catch { /* sem armazenamento */ }
}, { deep: true });

export const nomeExibido = (usuario) => perfil.nome || (usuario && (usuario.nome || usuario.email)) || '';
export const gradienteAvatar = (id) => {
  const c = CORES_AVATAR.find((x) => x.id === id) || CORES_AVATAR[0];
  return `linear-gradient(135deg, ${c.de}, ${c.ate})`;
};

// Lê a imagem escolhida e reduz para um quadrado de 256 px (cabe folgado no localStorage).
export function fotoDeArquivo(arquivo) {
  return new Promise((resolve, reject) => {
    if (!arquivo || !/^image\//.test(arquivo.type)) { reject(new Error('Escolha um arquivo de imagem.')); return; }
    const leitor = new FileReader();
    leitor.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    leitor.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Imagem inválida.'));
      img.onload = () => {
        const lado = Math.min(img.width, img.height);
        const c = document.createElement('canvas');
        c.width = c.height = 256;
        c.getContext('2d').drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, 256, 256);
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.src = leitor.result;
    };
    leitor.readAsDataURL(arquivo);
  });
}

export const inicialDe = (usuario) => ((nomeExibido(usuario) || 'A').trim()[0] || 'A').toUpperCase();

// Último backup baixado NESTE aparelho (o servidor ainda não informa isso): só data, guardada em localStorage.
const CHAVE_BACKUP = 'sf:ultimo-backup';
export function ultimoBackup() {
  try { return localStorage.getItem(CHAVE_BACKUP) || ''; } catch { return ''; }
}
export function registrarBackup() {
  const agora = new Date().toISOString();
  try { localStorage.setItem(CHAVE_BACKUP, agora); } catch { /* sem armazenamento */ }
  return agora;
}

// Troca de senha (único dado de conta que o backend aceita editar: PUT /api/auth/senha). Lança Error com a mensagem.
export async function trocarSenha(senhaAtual, novaSenha) {
  const r = await fetch('/api/auth/senha', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ senhaAtual, novaSenha }),
  });
  let dados = {};
  try { dados = await r.json(); } catch { /* sem corpo */ }
  if (!r.ok) throw new Error(dados.erro || 'Não foi possível trocar a senha.');
  return dados;
}
