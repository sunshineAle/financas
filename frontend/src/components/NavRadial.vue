<script setup>
// Submenu radial: botões circulares (mesmo ícone do rodapé) em arco acima de um ponto da barra.
// Usado pelos grupos do rodapé (Contas, Cartões) e pelas opções "Lançar entrada / saída".
//   itens:  [{ id, rotulo, icone, atual?, tom? ('entrada' | 'saida') }]
//   ancora: valor CSS de `left` do ponto central (ex.: "calc(1 * 20% + 10%)")
// Emite `escolher` (o item) e `fechar` (toque fora ou Esc). Respeita "reduzir movimento" pelos tokens --anim-*.
import { computed, onMounted, onUnmounted } from 'vue';

const props = defineProps({
  aberto: { type: Boolean, default: false },
  itens: { type: Array, default: () => [] },
  ancora: { type: String, default: '50%' },
  titulo: { type: String, default: 'Opções' },
  raio: { type: Number, default: 94 },
});
const emit = defineEmits(['escolher', 'fechar']);

const posicoes = computed(() => {
  const n = props.itens.length;
  const passo = n <= 2 ? 64 : n === 3 ? 52 : 44;
  return props.itens.map((it, k) => {
    const ang = ((k - (n - 1) / 2) * passo * Math.PI) / 180;
    return { it, k, dx: Math.round(Math.sin(ang) * props.raio), dy: -Math.round(Math.cos(ang) * props.raio) };
  });
});

function aoTeclar(e) { if (props.aberto && e.key === 'Escape') emit('fechar'); }
onMounted(() => window.addEventListener('keydown', aoTeclar));
onUnmounted(() => window.removeEventListener('keydown', aoTeclar));
</script>

<template>
  <transition name="radial">
    <div v-if="aberto" class="radial-raiz">
      <div class="fundo" @click="emit('fechar')"></div>
      <div class="ancora" :style="{ left: ancora }" role="menu" :aria-label="titulo">
        <button
          v-for="p in posicoes"
          :key="p.it.id"
          type="button"
          role="menuitem"
          class="bola"
          :class="[{ atual: p.it.atual }, p.it.tom]"
          :style="{ '--dx': p.dx + 'px', '--dy': p.dy + 'px', '--k': p.k }"
          @click="emit('escolher', p.it)"
        >
          <span class="circulo"><component :is="p.it.icone" :size="22" :stroke-width="1.9" /></span>
          <span class="nome">{{ p.it.rotulo }}</span>
        </button>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.radial-raiz { position: fixed; inset: 0; z-index: 28; }
.fundo { position: absolute; inset: 0; background: color-mix(in srgb, var(--cor-fundo) 55%, transparent); backdrop-filter: blur(2px); }
/* o centro do arco coincide com o centro da bolha elevada da barra (barra 64px, bolha 54px, 24px acima do topo) */
.ancora { position: absolute; bottom: calc(61px + env(safe-area-inset-bottom, 0px)); width: 0; height: 0; z-index: 31; }
.bola {
  position: absolute;
  left: -25px;
  top: -25px;
  width: 50px;
  padding: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: none;
  border: none;
  color: var(--cor-texto);
  font-family: var(--fonte-texto);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transform: translate(var(--dx), var(--dy));
  animation: sair-do-centro var(--anim-padrao) var(--anim-curva) both;
  animation-delay: calc(var(--k) * 45ms);
}
@keyframes sair-do-centro {
  from { transform: translate(0, 0) scale(0.3); opacity: 0; }
  to { transform: translate(var(--dx), var(--dy)) scale(1); opacity: 1; }
}
.circulo {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--cor-fundo-elevado);
  border: 1px solid var(--cor-borda);
  color: var(--cor-primaria);
  box-shadow: 0 10px 18px -10px rgba(0, 0, 0, 0.55);
  transition: transform var(--anim-rapida) ease;
}
.bola:active .circulo { transform: scale(0.92); }
.bola.atual .circulo { color: var(--cor-sobre-cor); border-color: transparent; background: linear-gradient(135deg, var(--cor-primaria), var(--cor-violeta)); }
.bola.entrada .circulo { color: var(--cor-entrada); background: var(--cor-fundo-elevado); box-shadow: inset 0 0 0 30px var(--cor-entrada-fundo), 0 10px 18px -10px rgba(0, 0, 0, 0.55); }
.bola.saida .circulo { color: var(--cor-saida); background: var(--cor-fundo-elevado); box-shadow: inset 0 0 0 30px var(--cor-saida-fundo), 0 10px 18px -10px rgba(0, 0, 0, 0.55); }
.nome {
  margin-top: 5px;
  width: 78px;
  margin-left: -14px;
  text-align: center;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.15;
  color: var(--cor-texto);
  text-shadow: 0 1px 3px color-mix(in srgb, var(--cor-fundo) 90%, transparent);
}
.radial-enter-active, .radial-leave-active { transition: opacity var(--anim-padrao) ease; }
.radial-enter-from, .radial-leave-to { opacity: 0; }
</style>
