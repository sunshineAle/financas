<script setup>
// <AjudaSecao secao="dividas.faturas" /> — "?" minúsculo ao lado do título de uma seção, card ou janela (anotação 64).
// Toque abre um BALÃO pequeno ancorado no ícone com a explicação curta daquela seção.
// Fecha ao tocar fora ou com Esc (sem fechar a janela de trás); ao rolar, acompanha o "?". O foco volta ao "?".
// Props: secao (id em config/ajudaSecoes.js) OU texto (string | lista) + titulo; manual (id da seção do Manual; sobrepõe o do mapa).
// Use só onde havia texto explicativo na tela. Visual: 20px; área de toque 44px (pseudo-elemento, sem mexer no layout).
import { computed, ref, nextTick, onBeforeUnmount, useId } from 'vue';
import { HelpCircle } from 'lucide-vue-next';
import { ajudaSecao } from '../config/ajudaSecoes.js';

const props = defineProps({
  secao: { type: String, default: '' },
  texto: { type: [String, Array], default: '' },
  titulo: { type: String, default: '' },
  manual: { type: String, default: '' },
});

const doMapa = computed(() => ajudaSecao(props.secao));
const titulo = computed(() => props.titulo || doMapa.value?.titulo || 'esta seção');
const frases = computed(() => {
  const t = props.texto || doMapa.value?.texto || '';
  return (Array.isArray(t) ? t : [t]).filter(Boolean);
});
// Homologação 1.0, seção 11: o balão fica só com a explicação (sem o botão "Ver no manual"). O prop `manual` segue aceito.

const id = 'ajuda-' + useId();
const botao = ref(null);
const balao = ref(null);
const aberto = ref(false);
const pos = ref({ left: 0, top: 0, largura: 280, seta: 140, acima: false });

function posicionar() {
  const b = botao.value?.getBoundingClientRect();
  if (!b) return;
  const vw = document.documentElement.clientWidth || window.innerWidth;
  const vh = window.innerHeight;
  const largura = Math.min(300, vw - 24);
  const centro = b.left + b.width / 2;
  const left = Math.max(12, Math.min(centro - largura / 2, vw - largura - 12));
  const altura = balao.value?.offsetHeight || 0;
  let top = b.bottom + 8;
  let acima = false;
  if (altura && top + altura > vh - 12 && b.top - 8 - altura >= 12) { top = b.top - 8 - altura; acima = true; }
  pos.value = { left, top, largura, seta: Math.max(14, Math.min(centro - left, largura - 14)), acima };
}

function aoTecla(e) {
  if (e.key !== 'Escape') return;
  e.stopPropagation(); e.preventDefault(); // não fecha a janela (Modal) de trás
  fechar(true);
}
function aoTocarFora(e) {
  if (balao.value?.contains(e.target) || botao.value?.contains(e.target)) return;
  fechar(false);
}
// Ao rolar, o balão acompanha o "?"; se o "?" sair da tela, fecha.
function aoRolar(e) {
  if (balao.value?.contains(e.target)) return;
  const b = botao.value?.getBoundingClientRect();
  if (!b || b.bottom < 0 || b.top > window.innerHeight) { fechar(false); return; }
  posicionar();
}

function ligar() {
  window.addEventListener('keydown', aoTecla, true);
  document.addEventListener('pointerdown', aoTocarFora, true);
  window.addEventListener('scroll', aoRolar, true);
  window.addEventListener('resize', posicionar);
}
function desligar() {
  window.removeEventListener('keydown', aoTecla, true);
  document.removeEventListener('pointerdown', aoTocarFora, true);
  window.removeEventListener('scroll', aoRolar, true);
  window.removeEventListener('resize', posicionar);
}

async function abrir() {
  aberto.value = true;
  posicionar();
  await nextTick();
  posicionar();
  ligar();
}
function fechar(devolverFoco = true) {
  if (!aberto.value) return;
  aberto.value = false;
  desligar();
  if (devolverFoco) botao.value?.focus({ preventScroll: true });
}
function alternar() { aberto.value ? fechar(true) : abrir(); }

onBeforeUnmount(desligar);
</script>

<template>
  <span v-if="frases.length" class="ajuda-secao">
    <button ref="botao" type="button" class="ajuda-botao" :class="{ ativo: aberto }" :aria-label="`Explicação: ${titulo}`" :aria-expanded="aberto" :aria-controls="aberto ? id : undefined" data-ajuda-secao @click.stop.prevent="alternar">
      <HelpCircle :size="15" :stroke-width="2" aria-hidden="true" />
    </button>
    <Teleport to="body">
      <div v-if="aberto" :id="id" ref="balao" class="ajuda-balao" :class="{ acima: pos.acima }" role="dialog" :aria-label="`Explicação: ${titulo}`" data-ajuda-balao
        :style="{ left: pos.left + 'px', top: pos.top + 'px', width: pos.largura + 'px', '--seta': pos.seta + 'px' }" @click.stop>
        <p v-for="(f, i) in frases" :key="i">{{ f }}</p>
      </div>
    </Teleport>
  </span>
</template>

<style scoped>
.ajuda-secao { display: inline-flex; vertical-align: middle; margin-left: 4px; flex: none; }
.ajuda-botao {
  position: relative; display: inline-flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; padding: 0; border: none; border-radius: 50%; background: none;
  color: inherit; opacity: 0.6; cursor: pointer; flex: none;
  transition: color var(--anim-rapida) ease, background var(--anim-rapida) ease, opacity var(--anim-rapida) ease;
}
.ajuda-botao::before { content: ''; position: absolute; inset: -12px; border-radius: 50%; }
.ajuda-botao:hover, .ajuda-botao.ativo { opacity: 1; background: color-mix(in srgb, currentColor 14%, transparent); }
.ajuda-botao:focus-visible { outline: 2px solid var(--cor-primaria); outline-offset: 2px; opacity: 1; }

.ajuda-balao {
  position: fixed; z-index: 70; box-sizing: border-box; padding: 12px 14px;
  display: flex; flex-direction: column; gap: 6px;
  background: var(--cor-fundo-elevado); color: var(--cor-texto); border: 1px solid var(--cor-borda);
  border-radius: 14px; box-shadow: var(--sombra-suave), 0 16px 36px -14px rgba(0, 0, 0, 0.45);
  font-family: var(--fonte-texto); text-align: left; text-transform: none; letter-spacing: normal; font-weight: 400;
  animation: ajuda-entra var(--anim-rapida, 0.15s) ease;
}
.ajuda-balao::before {
  content: ''; position: absolute; top: -6px; left: calc(var(--seta) - 6px); width: 10px; height: 10px;
  background: inherit; border-left: 1px solid var(--cor-borda); border-top: 1px solid var(--cor-borda); transform: rotate(45deg);
}
.ajuda-balao.acima::before { top: auto; bottom: -6px; transform: rotate(225deg); }
.ajuda-balao p { margin: 0; font-size: 13px; line-height: 1.45; color: var(--cor-texto-suave); }
@keyframes ajuda-entra { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .ajuda-balao { animation: none; } }
</style>
