<script setup>
// Face do cartão / linha de crédito (REF-05): sempre em proporção de cartão real (1,586:1), fundo na cor do próprio cartão
// (cartao.cor; fallback = prop `cor`, ex. cor do banco), logo ou iniciais GRANDES mesclados
// (tom sobre tom) e cortados na borda direita, selo de tipo no canto superior esquerdo, Usado · Disponível · Total · % e barra fina, rodapé Fecha · Vence. Sem número do cartão e sem nome
// (o nome fica fora do card, abaixo do carrossel).
import { computed, ref, onMounted } from 'vue';
import { CreditCard } from 'lucide-vue-next';
import { bancoPorSlug, reconhecerBanco } from '../utils/catalogoBancos.js';

const props = defineProps({
  cartao: { type: Object, required: true },
  cor: { type: String, default: '' },
});

import { moedaTotal } from '../services/privacidade.js';
const moeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const dm = (iso) => { if (!iso) return '--/--'; const [, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}`; };

const ehImagem = (i) => String(i || '').startsWith('data:image/');
const imagem = computed(() => {
  const c = props.cartao;
  if (ehImagem(c.icone)) return c.icone;
  // logo do catálogo de instituições (escolhido no cadastro ou reconhecido pelo nome)
  const b = String(c.icone || '').startsWith('banco:') ? bancoPorSlug(c.icone.slice(6)) : (!c.icone || c.icone === '💳') ? reconhecerBanco(c.nome) : null;
  if (b && (b.arquivos.icone || b.arquivos.iconeFundo)) return b.arquivos.icone || b.arquivos.iconeFundo;
  if (!c.icone || c.icone === '💳') return ehImagem(c.contaIcone) ? c.contaIcone : '';
  return '';
});
const emoji = computed(() => {
  const i = props.cartao.icone;
  return !imagem.value && i && i !== '💳' && !ehImagem(i) && !String(i).startsWith('banco:') ? i : '';
});
const iniciais = computed(() => {
  const nome = String(props.cartao.nome || props.cartao.contaNome || '?').trim();
  const p = nome.split(/\s+/).filter(Boolean);
  return (p.length > 1 ? p[0][0] + p[1][0] : nome.slice(0, 2)).toUpperCase();
});

// Cor do PRÓPRIO cartão (campo `cor` do cadastro); sem ela, a cor recebida em `cor` (fallback do banco); senão, neutro
const fundo = computed(() => props.cartao.cor || props.cor || '#5b6076');
// Texto escuro em fundos muito claros (ex.: amarelo)
const claro = computed(() => {
  const m = String(fundo.value).match(/#([0-9a-f]{6})|rgb\((\d+),\s*(\d+),\s*(\d+)\)/i);
  if (!m) return false;
  let r, g, b;
  if (m[1]) { r = parseInt(m[1].slice(0, 2), 16); g = parseInt(m[1].slice(2, 4), 16); b = parseInt(m[1].slice(4, 6), 16); }
  else { r = +m[2]; g = +m[3]; b = +m[4]; }
  return (0.299 * r + 0.587 * g + 0.114 * b) > 170;
});

const pct = computed(() => (props.cartao.limite > 0 ? Math.min(100, (props.cartao.limiteUsado / props.cartao.limite) * 100) : 0));
const pronto = ref(false);
onMounted(() => requestAnimationFrame(() => { pronto.value = true; }));
</script>

<template>
  <div class="face" :class="{ escuro: claro }" :style="{ '--fundo': fundo }">
    <div class="logo" aria-hidden="true">
      <img v-if="imagem" :src="imagem" alt="" />
      <span v-else-if="emoji" class="emoji">{{ emoji }}</span>
      <span v-else class="iniciais">{{ iniciais }}</span>
    </div>

    <span class="selo"><CreditCard :size="14" :stroke-width="2" /> Cartão de crédito</span>

    <div class="centro">
      <span class="rotulo">Usado</span>
      <strong class="usado numero-tabular">{{ moedaTotal(cartao.limiteUsado) }}</strong>
      <template v-if="cartao.limite">
        <span class="metricas numero-tabular">
          <span>Disponível <b>{{ moedaTotal(cartao.limiteDisponivel ?? Math.max(0, cartao.limite - (cartao.limiteUsado || 0))) }}</b></span>
          <span>Total <b>{{ moedaTotal(cartao.limite) }}</b></span>
          <span class="pct"><b>{{ Math.round(pct) }}%</b></span>
        </span>
        <span class="barra" role="progressbar" :aria-valuenow="Math.round(pct)" aria-valuemin="0" aria-valuemax="100"><i :style="{ width: pronto ? pct + '%' : '0%' }"></i></span>
      </template>
      <span v-else class="sub">Sem limite definido</span>
    </div>

    <div class="rodape">
      <span>Fecha <b>{{ dm(cartao.faturaAberta?.fecha) }}</b></span>
      <span>Vence <b>{{ dm(cartao.faturaAberta?.vence) }}</b></span>
    </div>
  </div>
</template>

<style scoped>
.face {
  --txt: var(--cor-sobre-cor); --txt-suave: rgb(255 255 255 / 0.78); --tom: rgb(255 255 255 / 0.2);
  position: relative; overflow: hidden; aspect-ratio: 1.586 / 1; width: 100%; container-type: inline-size; padding: 5.5cqw 6cqw 5cqw; border-radius: 22px; color: var(--txt);
  background: linear-gradient(135deg, var(--fundo), color-mix(in srgb, var(--fundo) 72%, black));
  display: flex; flex-direction: column; justify-content: space-between; gap: 8px; box-shadow: var(--sombra-suave); user-select: none;
}
.face.escuro { --txt: rgb(0 0 0 / 0.86); --txt-suave: rgb(0 0 0 / 0.62); --tom: rgb(0 0 0 / 0.16); }
/* logo grande, tom sobre tom, cortado pela borda direita */
.logo { position: absolute; right: -16%; top: 50%; width: 62%; aspect-ratio: 1; transform: translateY(-50%); display: grid; place-items: center; pointer-events: none; }
.logo img { width: 74%; height: 74%; object-fit: contain; opacity: 0.5; mix-blend-mode: soft-light; filter: saturate(0.4); }
.logo .emoji { font-size: clamp(60px, 28cqw, 108px); line-height: 1; opacity: 0.45; filter: grayscale(1); margin-right: 18%; }
.logo .iniciais { font-family: var(--fonte-display); font-weight: 800; font-size: clamp(48px, 22cqw, 84px); letter-spacing: -0.04em; color: var(--txt); opacity: 0.3; margin-right: 22%; }
.selo { position: relative; align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; letter-spacing: 0.02em; padding: 4px 10px 4px 8px; border-radius: 999px; background: var(--tom); color: var(--txt); }
.centro { position: relative; display: flex; flex-direction: column; gap: 2px; max-width: 100%; min-width: 0; }
.metricas { display: flex; flex-wrap: wrap; gap: 2px 12px; font-size: 12px; color: var(--txt-suave); }
.metricas b { color: var(--txt); font-weight: 700; }
.metricas .pct { margin-left: auto; }
.rotulo { font-size: 12px; color: var(--txt-suave); }
.usado { font-family: var(--fonte-display); font-size: clamp(20px, 8.4cqw, 32px); font-weight: 700; line-height: 1.1; overflow-wrap: anywhere; }
.sub { font-size: 12px; color: var(--txt-suave); }
.barra { display: block; height: 5px; margin-top: 6px; border-radius: 99px; background: var(--tom); overflow: hidden; }
.barra i { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, var(--txt), color-mix(in srgb, var(--txt) 45%, transparent)); transition: width var(--anim-lenta) var(--anim-curva-suave); }
.rodape { position: relative; display: flex; justify-content: space-between; font-size: 12px; color: var(--txt-suave); }
.rodape b { color: var(--txt); font-weight: 700; }
</style>
