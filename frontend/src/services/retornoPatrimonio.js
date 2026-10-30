// Homologação 1.0, seção 9: ao sair da janela Patrimônio para uma conta/meta/página e VOLTAR, ela reabre como estava
// (lado, blocos abertos e rolagem). PatrimonioDetalhe guarda o estado; o Início pergunta `deveReabrir()` ao montar.
import { voltando } from '../router.js';

let estado = null;
export function guardarRetorno(e) { estado = e; }
// O Início chama ao montar: se a navegação foi um "voltar", marca o estado para a janela usar quando abrir.
export function deveReabrir() { if (estado && voltando.valor) { estado.liberado = true; return true; } estado = null; return false; }
// Devolve o estado só se foi liberado por um "voltar" (e o consome).
export function pegarRetorno() { const e = estado && estado.liberado ? estado : null; estado = null; return e; }
