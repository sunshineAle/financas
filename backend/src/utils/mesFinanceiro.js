// Início do mês financeiro (anotação 51) — mesma regra de frontend/src/utils/mesFinanceiro.js.
// A configuração vem de globalThis.__SF_INICIO_MES (no PWA o backend roda no navegador e o app grava ali);
// sem ela, o mês financeiro é o mês do calendário (dia 1). Registrada no SQLite como função mes_fin(data) -> 'YYYY-MM'.
const PADRAO = { tipo: 'dia', dia: 1 };
const dois = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
const ultimoDia = (a, m) => new Date(a, m, 0).getDate();
function pascoa(a) {
  const b = a % 19, c = Math.floor(a / 100), d = a % 100, e = Math.floor(c / 4), f = c % 4, g = Math.floor((c + 8) / 25), h = Math.floor((c - g + 1) / 3);
  const i = (19 * b + c - e - h + 15) % 30, k = Math.floor(d / 4), l = d % 4, m = (32 + 2 * f + 2 * k - i - l) % 7, n = Math.floor((b + 11 * i + 22 * m) / 451);
  return new Date(a, Math.floor((i + m - 7 * n + 114) / 31) - 1, ((i + m - 7 * n + 114) % 31) + 1);
}
const memo = {};
function feriados(a) {
  if (memo[a]) return memo[a];
  const s = new Set(['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25'].concat(a >= 2024 ? ['11-20'] : []).map((x) => `${a}-${x}`));
  const p = pascoa(a); const sexta = new Date(p); sexta.setDate(p.getDate() - 2); s.add(iso(sexta));
  return (memo[a] = s);
}
const cfgAtual = () => (globalThis.__SF_INICIO_MES && (globalThis.__SF_INICIO_MES.tipo === 'dia' || globalThis.__SF_INICIO_MES.tipo === 'util') ? globalThis.__SF_INICIO_MES : PADRAO);
function inicioDoMes(a, m, cfg = cfgAtual()) {
  if (cfg.tipo === 'util') {
    const n = Math.max(1, Math.min(20, Number(cfg.n) || 5)); const fer = feriados(a); let cont = 0;
    for (let d = 1; d <= ultimoDia(a, m); d++) { const dt = new Date(a, m - 1, d); const w = dt.getDay(); if (w === 0 || w === 6 || fer.has(iso(dt))) continue; if (++cont === n) return dt; }
    return new Date(a, m - 1, ultimoDia(a, m));
  }
  return new Date(a, m - 1, cfg.dia === 'ultimo' ? ultimoDia(a, m) : Math.max(1, Math.min(28, Number(cfg.dia) || 1)));
}
function chaveDaData(dataIso, cfg = cfgAtual()) {
  const s = String(dataIso || '').slice(0, 10);
  const a = Number(s.slice(0, 4)), m = Number(s.slice(5, 7));
  if (!a || !m) return null;
  if (cfg.tipo === 'dia' && Number(cfg.dia) === 1) return s.slice(0, 7);
  if (s >= iso(inicioDoMes(a, m, cfg))) return `${a}-${dois(m)}`;
  return m === 1 ? `${a - 1}-12` : `${a}-${dois(m - 1)}`;
}
function intervaloDoMes(a, m, cfg = cfgAtual()) {
  const de = inicioDoMes(a, m, cfg); const prox = m === 12 ? inicioDoMes(a + 1, 1, cfg) : inicioDoMes(a, m + 1, cfg);
  const ate = new Date(prox); ate.setDate(prox.getDate() - 1);
  return { de: iso(de), ate: iso(ate) };
}
// Registra mes_fin(data) no banco (better-sqlite3: db.function; sql.js shim: db.function também).
function registrar(db) { try { if (typeof db.function === 'function') db.function('mes_fin', (d) => chaveDaData(d)); else console.warn('[mes_fin] banco sem db.function'); } catch (e) { console.error('[mes_fin] não registrada:', e && e.message); } }
module.exports = { chaveDaData, inicioDoMes, intervaloDoMes, registrar };
