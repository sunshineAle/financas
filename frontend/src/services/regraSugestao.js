// Sugestão de regra a partir de uma correção de categoria (anotação 52), compartilhada por Transações e A revisar (anotação 104).
export const normRegra = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

// Nome do estabelecimento sem números, datas e códigos: "IFD*BRASIL 1234" → "IFD*", "UBER *TRIP 1234" → "UBER", "PADARIA DO JOSE 0012" → "PADARIA DO JOSE".
export function trechoRegra(nome) {
  const limpo = String(nome || '').replace(/\s*\(\d+\/\d+\)\s*$/, '').trim();
  const pal = [];
  for (const tok of limpo.split(/\s+/)) {
    if (!tok) continue;
    const estrela = tok.indexOf('*');
    if (estrela > 0) { const base = tok.slice(0, estrela + 1); if (!/\d/.test(base)) pal.push(base); break; } // "IFD*BRASIL" → "IFD*"
    if (estrela === 0) break; // "*TRIP": código do adquirente
    if (/\d/.test(tok) || /^[-–·|:#/.]+$/.test(tok)) break; // número, data, código
    pal.push(tok.replace(/[-–·|:,;.]+$/, ''));
    if (pal.length >= 3) break;
  }
  const t = pal.join(' ').trim();
  return t.replace(/\*/g, '').length >= 2 ? t : '';
}

// Já existe regra do mesmo tipo para o trecho (ou que casa com o nome)?
export function jaTemRegra(regras, tipo, nomeTx, trecho) {
  const nome = normRegra(nomeTx);
  return (regras || []).some((r) => r.tipo === tipo && (normRegra(r.padrao) === normRegra(trecho) || nome.includes(normRegra(r.padrao))));
}
