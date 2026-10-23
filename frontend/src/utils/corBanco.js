// Cor de destaque de um banco: pelo nome (bancos conhecidos), senão pela cor dominante do logo
// enviado, senão uma cor estável sorteada a partir do nome.
import { reconhecerBanco, bancoPorSlug } from './catalogoBancos.js';

const BANCOS = [
  [/nubank|nu pagamentos|\bnu\b/, '#8a05be'],
  [/ita[uú]/, '#ec7000'],
  [/bradesco/, '#cc092f'],
  [/santander/, '#ec0000'],
  [/\binter\b|banco inter/, '#ff7a00'],
  [/c6/, '#8d8f94'],
  [/caixa/, '#0070af'],
  [/banco do brasil|\bbb\b/, '#f7c600'],
  [/picpay/, '#21c25e'],
  [/mercado ?pago/, '#00a1e4'],
  [/neon/, '#00c2c2'],
  [/btg/, '#1f4e8c'],
  [/\bxp\b/, '#6b7280'],
  [/sicredi/, '#3fa535'],
  [/sicoob/, '#00a091'],
  [/original/, '#1db954'],
  [/next/, '#00d65a'],
  [/will/, '#ffd400'],
  [/caju/, '#ff5a3c'],
];
const FALLBACK = ['#3b5bff', '#f5b942', '#ec4899', '#22c55e', '#7c3aed', '#06b6d4', '#f97316', '#84cc16'];
const cache = new Map();

export function corPorNome(nome) {
  const n = String(nome || '').toLowerCase();
  const cat = reconhecerBanco(nome);
  if (cat && cat.cor) return cat.cor;
  const achado = BANCOS.find(([re]) => re.test(n));
  if (achado) return achado[1];
  let h = 0;
  for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK[h % FALLBACK.length];
}

// Cor dominante (pesa as mais saturadas) de um logo enviado como imagem
function corDaImagem(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 24;
        const x = c.getContext('2d');
        x.drawImage(img, 0, 0, 24, 24);
        const d = x.getImageData(0, 0, 24, 24).data;
        let r = 0, g = 0, b = 0, peso = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 200) continue;
          const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
          const sat = mx === 0 ? 0 : (mx - mn) / mx;
          const p = sat * sat + 0.01;
          r += d[i] * p; g += d[i + 1] * p; b += d[i + 2] * p; peso += p;
        }
        resolve(peso ? `rgb(${Math.round(r / peso)}, ${Math.round(g / peso)}, ${Math.round(b / peso)})` : null);
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// Cor do banco: do logo em imagem, quando houver; senão pelo nome
export async function corDoBanco(nome, icone) {
  const chave = `${nome}|${String(icone || '').slice(0, 64)}`;
  if (cache.has(chave)) return cache.get(chave);
  let cor = null;
  if (String(icone || '').startsWith('banco:')) { const b = bancoPorSlug(String(icone).slice(6)); if (b) cor = b.cor; }
  if (!cor && String(icone || '').startsWith('data:image/')) cor = await corDaImagem(icone);
  cor = cor || corPorNome(nome);
  cache.set(chave, cor);
  return cor;
}
