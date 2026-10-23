// Cor de categoria escolhida pelo usuário: só aceita hexadecimal #rrggbb; qualquer outra coisa vira "sem cor"
// (a tela usa então a cor padrão da paleta).
function lerCor(valor) {
  const v = String(valor || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : null;
}
module.exports = { lerCor };
