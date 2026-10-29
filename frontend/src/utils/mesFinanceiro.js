// Início do mês financeiro (anotação 51). Cada transação conta numa data só (a da compra); o que muda é ONDE o mês começa:
//   { tipo: 'dia', dia: 1..28 | 'ultimo' }  ou  { tipo: 'util', n: 5 } (5º dia útil: sem sábado, domingo e feriado nacional).
// O mês financeiro é nomeado pelo mês em que COMEÇA (ex.: começa em 07/11 -> "Nov · 07/11 a 04/12").
// A mesma regra existe no backend (backend/src/utils/mesFinanceiro.js), que lê a configuração em globalThis.__SF_INICIO_MES.
export const PADRAO = { tipo: 'dia', dia: 1 };
const CHAVE = 'sf:inicio-mes';
export function lerInicio() {
  try { const c = JSON.parse(localStorage.getItem(CHAVE) || 'null'); if (c && (c.tipo === 'dia' || c.tipo === 'util')) return c; } catch { /* padrão */ }
  return PADRAO;
}
export function gravarInicio(c) {
  try { localStorage.setItem(CHAVE, JSON.stringify(c)); } catch { /* só nesta sessão */ }
  globalThis.__SF_INICIO_MES = c;
}
globalThis.__SF_INICIO_MES = lerInicio();

function pascoa(a) { // algoritmo de Meeus
  const b = a % 19, c = Math.floor(a / 100), d = a % 100, e = Math.floor(c / 4), f = c % 4, g = Math.floor((c + 8) / 25), h = Math.floor((c - g + 1) / 3);
  const i = (19 * b + c - e - h + 15) % 30, k = Math.floor(d / 4), l = d % 4, m = (32 + 2 * f + 2 * k - i - l) % 7, n = Math.floor((b + 11 * i + 22 * m) / 451);
  const mes = Math.floor((i + m - 7 * n + 114) / 31), dia = ((i + m - 7 * n + 114) % 31) + 1;
  return new Date(a, mes - 1, dia);
}
const memoFeriados = {};
export function feriadosNacionais(a) {
  if (memoFeriados[a]) return memoFeriados[a];
  const fixos = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25'];
  if (a >= 2024) fixos.push('11-20');
  const s = new Set(fixos.map((x) => `${a}-${x}`));
  const p = pascoa(a); const sexta = new Date(p); sexta.setDate(p.getDate() - 2);
  s.add(iso(sexta));
  memoFeriados[a] = s;
  return s;
}
const dois = (n) => String(n).padStart(2, '0');
export const iso = (d) => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
const ultimoDia = (a, m) => new Date(a, m, 0).getDate(); // m = 1..12

/** Data (Date) em que começa o mês financeiro (a, m), m = 1..12. */
export function inicioDoMes(a, m, cfg = globalThis.__SF_INICIO_MES || PADRAO) {
  if (cfg.tipo === 'util') {
    const n = Math.max(1, Math.min(20, Number(cfg.n) || 5));
    const fer = feriadosNacionais(a);
    let cont = 0;
    for (let d = 1; d <= ultimoDia(a, m); d++) {
      const dt = new Date(a, m - 1, d); const w = dt.getDay();
      if (w === 0 || w === 6 || fer.has(iso(dt))) continue;
      if (++cont === n) return dt;
    }
    return new Date(a, m - 1, ultimoDia(a, m));
  }
  const dia = cfg.dia === 'ultimo' ? ultimoDia(a, m) : Math.max(1, Math.min(28, Number(cfg.dia) || 1));
  return new Date(a, m - 1, dia);
}
/** Intervalo ISO {de, ate} do mês financeiro (a, m). */
export function intervaloDoMes(a, m, cfg) {
  const de = inicioDoMes(a, m, cfg);
  const prox = m === 12 ? inicioDoMes(a + 1, 1, cfg) : inicioDoMes(a, m + 1, cfg);
  const ate = new Date(prox); ate.setDate(prox.getDate() - 1);
  return { de: iso(de), ate: iso(ate) };
}
/** Chave 'YYYY-MM' do mês financeiro de uma data ISO ('YYYY-MM-DD...'). */
export function chaveDaData(dataIso, cfg = globalThis.__SF_INICIO_MES || PADRAO) {
  const s = String(dataIso || '').slice(0, 10);
  const [a, m] = s.split('-').map(Number);
  if (!a || !m) return null;
  if (cfg.tipo === 'dia' && Number(cfg.dia) === 1) return s.slice(0, 7);
  if (s >= iso(inicioDoMes(a, m, cfg))) return `${a}-${dois(m)}`;
  return m === 1 ? `${a - 1}-12` : `${a}-${dois(m - 1)}`;
}
export const ehPadrao = (cfg = globalThis.__SF_INICIO_MES || PADRAO) => cfg.tipo === 'dia' && Number(cfg.dia) === 1;
export function descreverInicio(cfg = globalThis.__SF_INICIO_MES || PADRAO) {
  if (cfg.tipo === 'util') return `${cfg.n || 5}º dia útil`;
  if (cfg.dia === 'ultimo') return 'último dia do mês';
  return Number(cfg.dia) === 1 ? 'dia 1 (padrão)' : `dia ${cfg.dia}`;
}
