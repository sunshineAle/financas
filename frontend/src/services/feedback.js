// Feedback dos testadores (anotação 40): formulário no app -> Planilha Google do dono via Apps Script (App da Web).
// - Envio: POST com corpo JSON e Content-Type text/plain (sem preflight de CORS no Apps Script); cada envio tem um ID único.
// - Sem internet: fica numa fila no IndexedDB e vai sozinho quando a conexão voltar.
// - Privacidade: só tipo, mensagem, nome/contato opcionais, versão, aparelho e tela. Nunca valores, contas, prints ou senhas.
import { kvGet, kvSet } from './idb.js';
import { versaoBuild } from './versao.js';

export const FEEDBACK_URL = 'https://script.google.com/macros/s/AKfycbxAm-tx8g-MUdTWRO99FRe0RAlAtkXBGjmse5Xu0J_LaMoe_xaOdzMBtY17huoKnAc3/exec';
const FILA = 'sf:feedback-fila';
const TIPOS = ['erro', 'sugestao', 'duvida', 'elogio'];
const TAM = { mensagem: 2000, nome: 80, contato: 120 };

// Tela de onde a pessoa abriu o feedback (o router registra a última tela fora de Configurações).
let telaOrigem = '';
export function registrarTela(rota) {
  if (!rota || rota.name === 'mais' || rota.name === 'mais-secao') return;
  telaOrigem = (rota.meta && rota.meta.titulo) || rota.name || '';
}
const aparelho = () => {
  try { return matchMedia('(max-width: 768px)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent) ? 'celular' : 'computador'; } catch { return ''; }
};
const novoId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const corta = (v, n) => String(v || '').trim().slice(0, n);

async function lerFila() { const f = await kvGet(FILA); return Array.isArray(f) ? f : []; }
async function gravarFila(f) { await kvSet(FILA, f); }

async function postar(item) {
  const r = await fetch(FEEDBACK_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(item), redirect: 'follow' });
  // Só conta como enviado com a resposta { ok: true } do script (anotação 44). Página de login do Google, HTML ou erro
  // = não chegou: fica na fila e tenta de novo (o ID único evita linha duplicada na planilha).
  let j = null;
  try { j = await r.json(); } catch { j = null; }
  if (!j || j.ok !== true) throw new Error((j && (j.detalhe || j.erro)) || ('sem resposta do script (HTTP ' + r.status + ')'));
  return true;
}

// Devolve 'enviado' | 'na-fila'. Lança erro só para dados inválidos.
export async function enviarFeedback({ tipo, mensagem, nome, contato, site }) {
  const texto = corta(mensagem, TAM.mensagem);
  if (!texto) throw new Error('Escreva a mensagem.');
  if (site) return 'enviado'; // honeypot preenchido: finge sucesso
  const v = await versaoBuild().catch(() => null);
  const item = {
    id: novoId(), tipo: TIPOS.includes(tipo) ? tipo : 'sugestao', mensagem: texto,
    nome: corta(nome, TAM.nome), contato: corta(contato, TAM.contato),
    versao: v ? `${v.versao}` : '', aparelho: aparelho(), tela: telaOrigem || 'Sobre o app', site: '',
  };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { await gravarFila([...(await lerFila()), item]); return 'na-fila'; }
  try { await postar(item); return 'enviado'; }
  catch { await gravarFila([...(await lerFila()), item]); return 'erro-fila'; }
}

let enviando = false;
export async function enviarPendentes() {
  if (enviando || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
  enviando = true;
  try {
    const fila = await lerFila();
    const resto = [];
    for (const item of fila) { try { await postar(item); } catch { resto.push(item); } }
    if (resto.length !== fila.length) await gravarFila(resto);
  } finally { enviando = false; }
}
let ligado = false;
export function iniciarFilaFeedback() {
  if (ligado || typeof window === 'undefined') return;
  ligado = true;
  window.addEventListener('online', () => { enviarPendentes(); });
  setTimeout(enviarPendentes, 4000);
}
