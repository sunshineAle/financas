<script setup>
// Card COMPACTO de conta (carrossel da página Contas): fundo na cor do banco, tipo no canto superior esquerdo,
// logo (iniciais só como reserva) grande mesclado (tom sobre tom) no lado direito e cortado pela borda, saldo em destaque,
// nome do banco e última transação em texto pequeno.
import { computed } from 'vue';
import IconeBanco from './IconeBanco.vue';
import { bancoPorSlug, reconhecerBanco } from '../utils/catalogoBancos.js';

const props = defineProps({
  conta: { type: Object, required: true },
  cor: { type: String, default: '#3b5bff' },
  tipo: { type: String, default: '' },
  ultima: { type: Object, default: null }, // { descricao, valor, data }
});

import { moedaTotal } from '../services/privacidade.js';
const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const ehImagem = (i) => String(i || '').startsWith('data:image/');
// logo do catálogo (escolhido no cadastro ou reconhecido pelo nome); sigla só como reserva
const logo = computed(() => {
  const ic = props.conta.icone || '';
  if (ehImagem(ic)) return ic;
  const b = ic.startsWith('banco:') ? bancoPorSlug(ic.slice(6)) : (!ic || ic === '🏦' || ic === '💳') ? reconhecerBanco({ nome: props.conta.nome, codigo: props.conta.codigo }) : null;
  return b && (b.arquivos.icone || b.arquivos.iconeFundo) ? (b.arquivos.icone || b.arquivos.iconeFundo) : '';
});
const iniciais = computed(() => {
  const palavras = String(props.conta.nome || '?').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  if (!palavras.length) return '?';
  return (palavras.length === 1 ? palavras[0].slice(0, 2) : palavras[0][0] + palavras[1][0]).toUpperCase();
});

// Luminância da cor do banco: em fundos muito claros (amarelo do BB) o texto escurece para manter o contraste.
function luminancia(c) {
  let r, g, b;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map((x) => x + x).join('') : hex[1];
    [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  } else {
    const m = String(c).match(/\d+/g);
    if (!m) return 0;
    [r, g, b] = m.map(Number);
  }
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const claro = computed(() => luminancia(props.cor) > 0.42);
const ultimaTxt = computed(() => {
  const u = props.ultima;
  if (!u) return 'Sem transações';
  const v = `${u.valor < 0 ? '−' : '+'} ${moeda.format(Math.abs(u.valor))}`;
  return `${u.descricao} ${v}`;
});
</script>

<template>
  <article class="conta-cartao" :class="{ claro }" :style="{ '--banco': cor }">
    <div class="marca" aria-hidden="true">
      <img v-if="logo" :src="logo" alt="" />
      <span v-else>{{ iniciais }}</span>
    </div>
    <span class="tipo">{{ tipo }}<template v-if="conta.origem === 'conectada'"> · conectada</template></span>
    <strong class="saldo numero-tabular">{{ moedaTotal(conta.saldo) }}</strong>
    <div class="rodape">
      <span class="banco"><IconeBanco :icone="conta.icone" :nome="conta.nome" :tamanho="16" />{{ conta.nome }}</span>
      <span class="ultima">{{ ultimaTxt }}</span>
    </div>
  </article>
</template>

<style scoped>
.conta-cartao {
  --txt: #fff; --txt-suave: rgba(255, 255, 255, 0.78); --marca: rgba(255, 255, 255, 0.2);
  position: relative; overflow: hidden; isolation: isolate; border-radius: 22px; padding: 14px 16px 14px;
  min-height: 128px; display: flex; flex-direction: column; gap: 2px; text-align: left; color: var(--txt);
  background: linear-gradient(135deg, color-mix(in srgb, var(--banco) 100%, #fff 8%), color-mix(in srgb, var(--banco) 78%, #000));
  box-shadow: 0 14px 26px -16px color-mix(in srgb, var(--banco) 70%, #000); user-select: none;
}
.conta-cartao.claro { --txt: #17181f; --txt-suave: rgba(23, 24, 31, 0.72); --marca: rgba(23, 24, 31, 0.14); }
.marca {
  position: absolute; z-index: -1; right: -38px; top: 50%; width: 130px; height: 130px; transform: translateY(-50%);
  border-radius: 50%; display: grid; place-items: center; overflow: hidden; pointer-events: none;
}
.marca img { width: 84%; height: 84%; object-fit: contain; opacity: 0.5; mix-blend-mode: soft-light; filter: saturate(0.4); }
.marca span { font-family: var(--fonte-display); font-weight: 800; font-size: 76px; letter-spacing: -0.04em; color: var(--marca); transform: translateX(-12px); }
.tipo { font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--txt-suave); }
.saldo { font-family: var(--fonte-display); font-weight: 700; font-size: clamp(24px, 6.4vw, 30px); line-height: 1.15; margin-top: 8px; white-space: nowrap; }
.rodape { margin-top: auto; padding-top: 10px; display: flex; flex-direction: column; gap: 1px; max-width: 72%; min-width: 0; }
.banco { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--txt); min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ultima { font-size: 11px; color: var(--txt-suave); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
