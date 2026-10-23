// Alertas locais (sem servidor): geram a lista de avisos do sino (services/notificacoes.js) e, quando o usuário
// permitiu, disparam notificações do sistema (Notification API). Cada aviso notifica no máximo 1x por dia.
//   gerarAlertas()            -> [{ id, titulo, detalhe, rota, tom: 'saida'|'alerta'|'info', tipo }]
//   notificarNovos(lista)     -> dispara as notificações do dia que ainda não foram enviadas (se permitido)
//   iniciarAlertas()          -> PWA: confere ao abrir, ao voltar para o app e a cada 30 min enquanto aberto
//   configAlertas / ativarNotificacoes() / desativarNotificacoes() / permissaoNotificacao()
// Regras: fatura vence em ≤3 dias · parcela/acordo vencendo (≤3 dias) ou vencido · orçamento de categoria ≥90% ou
// estourado · backup atrasado (lembrete do Backup) · (sino) fatura fecha em ≤3 dias e dívida em risco crítico/alto.
import { reactive } from 'vue';

const CFG = 'sf:alertas:cfg';
const ENVIADOS = 'sf:alertas:enviados';

function lerJson(chave, padrao) {
  try { return JSON.parse(localStorage.getItem(chave) || 'null') ?? padrao; } catch { return padrao; }
}
function gravarJson(chave, valor) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* sem armazenamento */ }
}

// Preferência do aparelho: notificações do sistema ligadas? (a permissão do navegador é pedida só ao ligar)
export const configAlertas = reactive({ notificar: false, ...lerJson(CFG, {}) });
function salvarCfg() { gravarJson(CFG, { notificar: configAlertas.notificar }); }

export const suporteNotificacao = () => typeof window !== 'undefined' && 'Notification' in window;
export const permissaoNotificacao = () => (suporteNotificacao() ? Notification.permission : 'unsupported');

// Chamar a partir de um clique (exigência dos navegadores para pedir permissão).
export async function ativarNotificacoes() {
  if (!suporteNotificacao()) return { ok: false, motivo: 'Este navegador não oferece notificações.' };
  let p = Notification.permission;
  if (p === 'default') p = await Notification.requestPermission();
  if (p !== 'granted') {
    configAlertas.notificar = false; salvarCfg();
    return { ok: false, motivo: p === 'denied' ? 'As notificações estão bloqueadas nas configurações do navegador.' : 'Permissão não concedida.' };
  }
  configAlertas.notificar = true; salvarCfg();
  return { ok: true };
}
export function desativarNotificacoes() { configAlertas.notificar = false; salvarCfg(); }

// ---- datas ----
const real = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dia = (iso) => { const [, m, d] = String(iso).split('-'); return `${d}/${m}`; };
const quando = (n) => (n === 0 ? 'hoje' : n === 1 ? 'amanhã' : `em ${n} dias`);
export function hojeChave() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
export function diasAte(iso) {
  if (!iso) return null;
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  return Math.round((new Date(a, m - 1, d) - hoje) / 86400000);
}

async function pegar(url, padrao) {
  try {
    const r = await fetch(url, { credentials: 'include' });
    return r.ok ? await r.json() : padrao;
  } catch { return padrao; }
}

// ---- regras (funções puras: recebem os dados já lidos; ficam fáceis de testar) ----
export function alertasDeFaturas(cartoes) {
  const lista = [];
  (Array.isArray(cartoes) ? cartoes : []).forEach((c) => {
    const f = c.faturaAberta;
    if (!f || f.paga || !(f.total > 0)) return;
    const v = diasAte(f.vence);
    const fe = diasAte(f.fecha);
    if (v !== null && v <= 3 && v >= 0) {
      lista.push({ id: `venc-${c.id}-${f.chave}`, tipo: 'fatura', titulo: `Fatura do ${c.nome} vence ${quando(v)}`, detalhe: `${real(f.total)} · vencimento ${dia(f.vence)}`, rota: `/cartoes/${c.id}/extrato`, tom: v <= 1 ? 'saida' : 'alerta' });
    } else if (v !== null && v > 3 && v <= 7) {
      lista.push({ id: `venc-${c.id}-${f.chave}`, tipo: 'fatura-sino', titulo: `Fatura do ${c.nome} vence ${quando(v)}`, detalhe: `${real(f.total)} · vencimento ${dia(f.vence)}`, rota: `/cartoes/${c.id}/extrato`, tom: 'alerta' });
    } else if (fe !== null && fe >= 0 && fe <= 3) {
      lista.push({ id: `fecha-${c.id}-${f.chave}`, tipo: 'fatura-sino', titulo: `Fatura do ${c.nome} fecha ${quando(fe)}`, detalhe: `${real(f.total)} até agora`, rota: `/cartoes/${c.id}/extrato`, tom: 'info' });
    }
  });
  return lista;
}

export function alertasDeDividas(dividas) {
  const lista = [];
  (Array.isArray(dividas) ? dividas : []).forEach((d) => {
    if (!(d.saldo > 0) || d.status === 'quitada' || d.arquivada) return;
    const v = diasAte(d.proximo_vencimento);
    const rotuloParcela = d.valor_parcela > 0 ? real(d.valor_parcela) : `${real(d.saldo)} em aberto`;
    const o = d.tipo === 'acordo' || d.negativada ? 'Acordo' : 'Parcela';
    if (v !== null && v < 0) {
      lista.push({ id: `div-venc-${d.id}-${String(d.proximo_vencimento).slice(0, 10)}`, tipo: 'divida', titulo: `${o} de ${d.nome} vencida há ${-v} ${v === -1 ? 'dia' : 'dias'}`, detalhe: `${rotuloParcela} · venceu em ${dia(d.proximo_vencimento)}`, rota: '/dividas', tom: 'saida' });
    } else if (v !== null && v <= 3) {
      lista.push({ id: `div-venc-${d.id}-${String(d.proximo_vencimento).slice(0, 10)}`, tipo: 'divida', titulo: `${o} de ${d.nome} vence ${quando(v)}`, detalhe: `${rotuloParcela} · vencimento ${dia(d.proximo_vencimento)}`, rota: '/dividas', tom: v <= 1 ? 'saida' : 'alerta' });
    } else if (d.risco ? ['Crítico'].includes(d.risco.nivel) : d.urgencia === 'vermelho') {
      lista.push({ id: `div-${d.id}`, tipo: 'divida-sino', titulo: `${d.nome}: pendência urgente`, detalhe: `${real(d.saldo)} em aberto`, rota: '/dividas', tom: 'saida' });
    }
  });
  return lista;
}

export function alertasDeOrcamento(categorias, mes) {
  const lista = [];
  (Array.isArray(categorias) ? categorias : []).forEach((c) => {
    const teto = Number(c.teto_mensal) || 0;
    const gasto = Number(c.gasto_atual) || 0;
    if (!(teto > 0)) return;
    const pct = gasto / teto;
    if (pct > 1) lista.push({ id: `orc-estouro-${c.id}-${mes}`, tipo: 'orcamento', titulo: `${c.nome}: passou ${real(gasto - teto)} do orçamento`, detalhe: `${real(gasto)} de ${real(teto)} neste mês`, rota: '/orcamento', tom: 'saida' });
    else if (pct >= 0.9) lista.push({ id: `orc-90-${c.id}-${mes}`, tipo: 'orcamento', titulo: `${c.nome}: orçamento no limite (${Math.round(pct * 100)}%)`, detalhe: `${real(gasto)} de ${real(teto)} neste mês`, rota: '/orcamento', tom: 'alerta' });
  });
  return lista;
}

async function alertaDeBackup() {
  if (!import.meta.env.VITE_PWA) return [];
  try {
    const m = await import('./backup.js');
    if (!m.backupDevido()) return [];
    const dias = Math.floor(m.diasDesdeUltimo());
    return [{ id: `backup-${hojeChave().slice(0, 7)}-${Math.floor(dias / 7)}`, tipo: 'backup', titulo: 'Hora de fazer o backup', detalhe: m.textoUltimoBackup(), rota: '/backup', tom: 'alerta' }];
  } catch { return []; }
}

const chaveMes = () => hojeChave().slice(0, 7);

export async function gerarAlertas() {
  const mes = chaveMes();
  const [cartoes, dividas, painel, cfg, backup] = await Promise.all([
    pegar('/api/cartoes', []),
    pegar('/api/dividas', []),
    pegar(`/api/dashboard?mes=${mes}`, null),
    pegar('/api/configuracoes', null),
    alertaDeBackup(),
  ]);
  const querFatura = !cfg || cfg.notificar_fatura_proxima !== 0;
  const querOrc = !cfg || cfg.notificar_categoria_estourada !== 0;
  const lista = [
    ...(querFatura ? alertasDeFaturas(cartoes) : []),
    ...alertasDeDividas(dividas),
    ...(querOrc && painel ? alertasDeOrcamento(painel.categoriasMes, mes) : []),
    ...backup,
  ];
  const peso = { saida: 0, alerta: 1, info: 2 };
  return lista.sort((a, b) => peso[a.tom] - peso[b.tom]);
}

// ---- notificações do sistema (1x por dia por aviso) ----
// Só avisos "de vencimento/orçamento/backup" notificam; os de sino (fatura que fecha, pendência urgente) ficam no sino.
const NOTIFICAM = new Set(['fatura', 'divida', 'orcamento', 'backup']);

function podeNotificar() {
  return configAlertas.notificar && suporteNotificacao() && Notification.permission === 'granted';
}
async function mostrar(a) {
  const opcoes = { body: a.detalhe, tag: a.id, icon: './icons/icon-192.png', badge: './icons/icon-192.png', data: { rota: a.rota } };
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg && reg.showNotification) { await reg.showNotification(a.titulo, opcoes); return; }
  } catch { /* cai para a Notification comum */ }
  try { new Notification(a.titulo, opcoes); } catch { /* ignora */ }
}

export function pendentesDoDia(lista, enviados = lerJson(ENVIADOS, {}), hoje = hojeChave()) {
  return lista.filter((a) => NOTIFICAM.has(a.tipo) && enviados[a.id] !== hoje);
}

export async function notificarNovos(lista) {
  if (!podeNotificar()) return 0;
  const enviados = lerJson(ENVIADOS, {});
  const hoje = hojeChave();
  const novos = pendentesDoDia(lista, enviados, hoje);
  for (const a of novos) { await mostrar(a); enviados[a.id] = hoje; }
  // guarda só o que é de hoje (não deixa a lista crescer)
  Object.keys(enviados).forEach((k) => { if (enviados[k] !== hoje) delete enviados[k]; });
  gravarJson(ENVIADOS, enviados);
  return novos.length;
}

let ligado = false;
export function iniciarAlertas(atualizar) {
  if (ligado) return;
  ligado = true;
  const rodar = async () => { try { const l = await gerarAlertas(); if (atualizar) atualizar(l); await notificarNovos(l); } catch { /* sem rede/dados ainda */ } };
  setTimeout(rodar, 4000);
  setInterval(rodar, 30 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') rodar(); });
}
