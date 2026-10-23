// Convite do primeiro acesso (conta recém-criada): "Quer cadastrar sua primeira conta e cartão?". Aparece uma única vez.
const CHAVE = 'sf:primeiro-cadastro'; // 'pendente' (a mostrar) -> removido ao responder
export function marcarPrimeiroCadastro() { try { localStorage.setItem(CHAVE, 'pendente'); } catch { /* ignora */ } }
export const primeiroCadastroPendente = () => { try { return localStorage.getItem(CHAVE) === 'pendente'; } catch { return false; } };
export function concluirPrimeiroCadastro() { try { localStorage.setItem(CHAVE, 'feito'); } catch { /* ignora */ } }
