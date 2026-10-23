// Ocultar valores: esconde só os valores TOTAIS (cards de topo, patrimônio, saldos, faturas, totais) em todas as
// abas. Valores de transações individuais continuam visíveis. A escolha fica salva no aparelho (localStorage).
import { ref, watch } from 'vue';
import './../styles/privacidade.css';

const CHAVE = 'sf:ocultar';
export const MASCARA = '••••';

function ler() {
  try { return localStorage.getItem(CHAVE) === '1'; } catch { return false; }
}
export const ocultar = ref(ler());
// Quantos <TopoValor> estão na tela: o olho do TopoApp só aparece quando não há nenhum (o card já traz o seu).
export const topoValorMontados = ref(0);

function aplicarClasse(v) {
  if (typeof document !== 'undefined') document.documentElement.classList.toggle('ocultar-valores', !!v);
}
aplicarClasse(ocultar.value);
watch(ocultar, (v) => {
  aplicarClasse(v);
  try { localStorage.setItem(CHAVE, v ? '1' : '0'); } catch { /* sem armazenamento: vale só nesta sessão */ }
});
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => { if (e.key === CHAVE) ocultar.value = e.newValue === '1'; });
}

export function alternarOcultar() { ocultar.value = !ocultar.value; }

const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
// Formata em R$ ou devolve a máscara quando os valores estão ocultos (use só para TOTAIS).
export function moedaTotal(v) { return ocultar.value ? MASCARA : fmt.format(v || 0); }
// Máscara para texto já formatado.
export function mascarar(texto) { return ocultar.value ? MASCARA : texto; }
