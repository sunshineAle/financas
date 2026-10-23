// Ícones do designer (SVG próprio). Tudo que estiver em src/assets/icones/ tem prioridade sobre o lucide.
//   <chave>.svg             versão outline (traço)
//   <chave>-preenchido.svg  versão preenchida (estado ativo); se faltar, usa a outline
// Ver src/assets/icones/README.md para o formato.
const arquivos = import.meta.glob('../assets/icones/*.svg', { query: '?raw', import: 'default', eager: true });

const SVGS = {};
for (const [caminho, bruto] of Object.entries(arquivos)) {
  const nome = caminho.split('/').pop().replace(/\.svg$/i, '');
  const interno = extrairInterno(String(bruto));
  if (interno) SVGS[nome] = interno;
}

// Pega só o miolo do <svg> e remove o que não deve rodar (script, eventos, foreignObject).
function extrairInterno(texto) {
  const m = texto.match(/<svg[^>]*>([\s\S]*?)<\/svg>\s*$/i);
  if (!m) return '';
  return m[1]
    .replace(/<(script|foreignObject)[\s\S]*?<\/\1>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/javascript:/gi, '')
    .trim();
}

/** Miolo SVG do designer para a chave, ou '' se não houver arquivo. */
export function svgDoDesigner(chave, preenchido = false) {
  if (preenchido && SVGS[chave + '-preenchido']) return SVGS[chave + '-preenchido'];
  return SVGS[chave] || '';
}

/** Há versão preenchida própria do designer? (senão o Icone simula o preenchimento) */
export const temPreenchidoDoDesigner = (chave) => !!SVGS[chave + '-preenchido'];
export const chavesDoDesigner = () => Object.keys(SVGS).filter((n) => !n.endsWith('-preenchido'));
