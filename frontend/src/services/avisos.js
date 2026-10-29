// Avisos breves (toast): aparecem por alguns segundos e somem sozinhos; tocar abre a tela relacionada.
//   import { avisar } from '../services/avisos.js';
//   avisar('3 transações para revisar', { rota: '/transacoes' });
// O mesmo texto não se repete enquanto ainda estiver na tela.
//
// Com botões (anotações 48/52):
//   avisar('Regra excluída', { acoes: [{ rotulo: 'Desfazer', acao: () => restaurar() }], grupo: 'regras', duracao: 5000 });
//   - acoes: botões à direita do texto; tocar num botão roda a ação e fecha o aviso.
//   - aoTocar: o que tocar no TEXTO faz (no lugar de `rota`).
//   - grupo: um aviso por grupo — o novo substitui o anterior do mesmo grupo.
//   - aoSumir: chamado quando o aviso some sozinho (tempo esgotado), não quando o usuário toca.
// Passar o mouse/foco por cima pausa o tempo; ao sair, volta a contar.
import { ref } from 'vue';

export const avisos = ref([]);
let seq = 0;
const timers = new Map();

function agendar(id, ms) {
  clearTimeout(timers.get(id));
  timers.set(id, setTimeout(() => expirar(id), ms));
}
function expirar(id) {
  const a = avisos.value.find((x) => x.id === id);
  dispensar(id);
  if (a && a.aoSumir) { try { a.aoSumir(); } catch { /* aviso é só informativo */ } }
}

export function avisar(texto, { rota = null, tipo = 'info', duracao = 4500, acoes = null, aoTocar = null, grupo = null, aoSumir = null, detalhe = '' } = {}) {
  if (!acoes && !grupo && avisos.value.some((a) => a.texto === texto)) return null;
  if (grupo) avisos.value.filter((a) => a.grupo === grupo).forEach((a) => dispensar(a.id));
  const id = ++seq;
  avisos.value.push({ id, texto, detalhe, rota, tipo, acoes, aoTocar, grupo, aoSumir, duracao });
  agendar(id, duracao);
  return id;
}
export function dispensar(id) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  avisos.value = avisos.value.filter((a) => a.id !== id);
}
export function dispensarGrupo(grupo) {
  avisos.value.filter((a) => a.grupo === grupo).forEach((a) => dispensar(a.id));
}
// Pausa/retoma a contagem (mouse ou foco em cima do aviso).
export function pausar(id) { clearTimeout(timers.get(id)); }
export function retomar(id) {
  const a = avisos.value.find((x) => x.id === id);
  if (a) agendar(id, Math.min(a.duracao, 2500));
}
