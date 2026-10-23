// Taxa média de juros do cartão de crédito (pessoa física) segundo o Bacen, convertida para % ao mês.
// Usa services/bacen.js (cache local; sem internet usa a reserva embutida, marcada como estimativa).
//   const t = await taxaCartao();  // { mensal, anual, rotativoMensal, parceladoMensal, origem, atualizadoEm, rotulo } | null
const aaParaAm = (aa) => (Math.pow(1 + aa / 100, 1 / 12) - 1) * 100;

export async function taxaCartao() {
  let bacen;
  try { bacen = await import('../services/bacen.js'); } catch { return null; }
  try {
    const [total, rot, parc] = await Promise.all(['cartao_total', 'cartao_rotativo', 'cartao_parcelado'].map((id) => bacen.getSerie(id)));
    const ult = (s) => (s && s.dados && s.dados.length ? s.dados[s.dados.length - 1] : null);
    const ut = ult(total);
    if (!ut) return null;
    const data = total.atualizadoEm ? total.atualizadoEm.slice(0, 10) : null;
    const dataBR = data ? data.split('-').reverse().join('/') : '—';
    return {
      anual: ut.valor,
      mensal: aaParaAm(ut.valor),
      rotativoMensal: ult(rot) ? aaParaAm(ult(rot).valor) : null,
      parceladoMensal: ult(parc) ? aaParaAm(ult(parc).valor) : null,
      origem: total.origem,
      referencia: ut.data,
      atualizadoEm: data,
      rotulo: `estimativa Bacen · atualizada em ${dataBR}`,
    };
  } catch { return null; }
}
