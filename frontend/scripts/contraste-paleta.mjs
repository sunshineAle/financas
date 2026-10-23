// Checagem WCAG AA (4.5:1) dos pares texto/fundo da paleta v2, nos dois temas. Uso: node scripts/contraste-paleta.mjs
const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const T = {
  claro: { pagina: '#F6F5F2', card: '#FFFFFF', texto: '#1A1A1A', suave: '#6B6A66',
    pos: ['#E3F6EA', '#C2EBD1', '#0E4A28'], zero: ['#EAF9F2', '#D2F3E4', '#1E5E47'], neg: ['#FBE4E7', '#F6CDD3', '#8A1526'],
    entrada: '#146B3A', saida: '#A51A2E', zeroT: '#1E5E47', meta: '#5B1A9E', invest: '#0B5C68', alerta: '#A51A1A', link: '#3446C4', interface: '#3446C4' },
  escuro: { pagina: '#141413', card: '#1F1F1D', texto: '#F2F1EC', suave: '#A3A29C',
    pos: ['#123F27', '#0C2C1B', '#9BE6B8'], zero: ['#1B3D33', '#132D26', '#C4F2DE'], neg: ['#4E111B', '#360B12', '#F7AAB4'],
    entrada: '#5FD08E', saida: '#F27C8C', zeroT: '#C4F2DE', meta: '#B98AF0', invest: '#4FD0E0', alerta: '#FF8A80', link: '#8E9CF5', interface: '#4A5BDB' },
};
let falhas = 0;
const linha = (tema, nome, fg, bg, min = 4.5) => { const r = cr(fg, bg); const ok = r >= min; if (!ok) falhas++; console.log(`${ok ? 'OK ' : 'FALHA'} ${tema.padEnd(6)} ${nome.padEnd(34)} ${fg} / ${bg}  ${r.toFixed(2)}:1`); };
for (const [tema, t] of Object.entries(T)) {
  for (const [n, fg] of [['texto', t.texto], ['texto secundário', t.suave]]) { linha(tema, `${n} / card`, fg, t.card); linha(tema, `${n} / página`, fg, t.pagina); }
  for (const [n, fg] of [['entrada (texto)', t.entrada], ['saída (texto)', t.saida], ['zerado/menta (texto)', t.zeroT], ['metas (texto)', t.meta], ['investimentos (texto)', t.invest], ['alerta grave (texto)', t.alerta], ['link de interface', t.link]]) { linha(tema, `${n} / card`, fg, t.card); linha(tema, `${n} / página`, fg, t.pagina); }
  for (const k of ['pos', 'zero', 'neg']) { linha(tema, `card ${k}: texto / início`, t[k][2], t[k][0]); linha(tema, `card ${k}: texto / fim`, t[k][2], t[k][1]); }
  linha(tema, 'botão interface: branco / índigo', '#FFFFFF', t.interface);
}
// textos brancos sobre degradês "ativos" (abas, botões, barras de orçamento com texto)
const ativos = { 'entrada-ativo': ['#198045', '#167A42', '#146B3A'], 'saída-ativo': ['#CE2239', '#A91C2F'], 'meta-ativo': ['#5E18D8', '#7822CE', '#9B36BA'], 'invest-ativo': ['#0E7F90', '#0B6B7A', '#0B5C68'], alerta: ['#D5211A', '#9E1610'] };
for (const [n, cores] of Object.entries(ativos)) cores.forEach((c, i) => linha('ambos', `branco / ${n} [${i + 1}]`, '#FFFFFF', c));
console.log(falhas ? `\n${falhas} par(es) abaixo de 4.5:1` : '\nTodos os pares >= 4.5:1');
process.exit(falhas ? 1 : 0);
