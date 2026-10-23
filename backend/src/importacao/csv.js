// CSV genérico: detecta o separador (; , tab |), aspas e quebras de linha dentro de campos.
function detectarSeparador(texto) {
  const amostra = texto.split(/\r?\n/).filter((l) => l.trim()).slice(0, 15);
  let melhor = ',';
  let pontos = -1;
  for (const sep of [';', ',', '\t', '|']) {
    const contagens = amostra.map((l) => {
      let n = 0; let aspas = false;
      for (const c of l) { if (c === '"') aspas = !aspas; else if (c === sep && !aspas) n++; }
      return n;
    }).filter((n) => n > 0);
    if (!contagens.length) continue;
    const freq = {};
    contagens.forEach((n) => { freq[n] = (freq[n] || 0) + 1; });
    const comum = Math.max(...Object.values(freq));
    const p = comum * 10 + contagens.length;
    if (p > pontos) { pontos = p; melhor = sep; }
  }
  return melhor;
}

function parseCsv(texto, sepForcado) {
  let t = String(texto || '').replace(/^﻿/, '');
  // linha "sep=;" que o Excel grava
  const m = t.match(/^sep=(.)\r?\n/i);
  let sep = sepForcado;
  if (m) { sep = sep || m[1]; t = t.slice(m[0].length); }
  sep = sep || detectarSeparador(t);
  const linhas = [];
  let campo = '';
  let linha = [];
  let aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"') { if (t[i + 1] === '"') { campo += '"'; i++; } else aspas = false; } else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      linha.push(campo); campo = '';
      if (linha.some((x) => String(x).trim() !== '')) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  linha.push(campo);
  if (linha.some((x) => String(x).trim() !== '')) linhas.push(linha);
  return { matriz: linhas.map((l) => l.map((x) => x.trim())), separador: sep };
}

module.exports = { parseCsv, detectarSeparador };
