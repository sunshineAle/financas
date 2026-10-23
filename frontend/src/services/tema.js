// Tema (claro / escuro / automático) e "reduzir movimento". Guarda a escolha no aparelho e
// grava data-theme="light|dark" no <html>. No automático, acompanha o tema do aparelho.
import { ref } from 'vue';

const CHAVE_TEMA = 'sf:tema';
const CHAVE_MOVIMENTO = 'sf:movimento';

function ler(chave, padrao) {
  try { return localStorage.getItem(chave) || padrao; } catch { return padrao; }
}
function gravar(chave, valor) {
  try { localStorage.setItem(chave, valor); } catch { /* sem armazenamento: vale só nesta sessão */ }
}

export const modoTema = ref(ler(CHAVE_TEMA, 'auto')); // auto | claro | escuro
export const movimento = ref(ler(CHAVE_MOVIMENTO, 'auto')); // auto (segue o aparelho) | normal | reduzido

const consultaClaro = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;

export function aplicarTema() {
  const efetivo = modoTema.value === 'auto' ? (consultaClaro && consultaClaro.matches ? 'light' : 'dark') : (modoTema.value === 'claro' ? 'light' : 'dark');
  const raiz = document.documentElement;
  raiz.setAttribute('data-theme', efetivo);
  if (movimento.value === 'reduzido') raiz.setAttribute('data-reduzir-movimento', '1');
  else if (movimento.value === 'normal') raiz.setAttribute('data-reduzir-movimento', '0');
  else raiz.removeAttribute('data-reduzir-movimento');
}

export function definirTema(modo) {
  modoTema.value = modo;
  gravar(CHAVE_TEMA, modo);
  aplicarTema();
}

export function definirMovimento(modo) {
  movimento.value = modo;
  gravar(CHAVE_MOVIMENTO, modo);
  aplicarTema();
}

export function iniciarTema() {
  aplicarTema();
  if (consultaClaro) consultaClaro.addEventListener('change', () => { if (modoTema.value === 'auto') aplicarTema(); });
}
