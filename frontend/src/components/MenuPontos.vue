<script setup>
// Botão ⋮ com menu suspenso (Teleport). Itens: <button> no slot; classe `perigo` para ações destrutivas.
// Alvo de toque 44px no celular; menu com animação suave; claro/escuro por tokens.
import { ref, onUnmounted } from 'vue';

defineProps({ rotulo: { type: String, default: 'Mais opções' } });

const aberto = ref(false);
const pos = ref({ x: 0, y: 0 });
const botao = ref(null);

function fechar() {
  aberto.value = false;
  window.removeEventListener('click', fechar);
  window.removeEventListener('wheel', fechar);
  window.removeEventListener('touchmove', fechar);
  window.removeEventListener('resize', fechar);
}

function alternar(evento) {
  evento.stopPropagation();
  if (aberto.value) return fechar();
  // fecha outros menus abertos
  window.dispatchEvent(new Event('click'));
  const r = botao.value.getBoundingClientRect();
  const largura = 176;
  const x = Math.min(Math.max(8, r.right - largura), window.innerWidth - largura - 8);
  const y = r.bottom + 4 + 120 > window.innerHeight ? Math.max(8, r.top - 4 - 116) : r.bottom + 4;
  pos.value = { x, y };
  aberto.value = true;
  setTimeout(() => {
    window.addEventListener('click', fechar);
    window.addEventListener('wheel', fechar, { passive: true });
    window.addEventListener('touchmove', fechar, { passive: true });
    window.addEventListener('resize', fechar);
  }, 0);
}

onUnmounted(fechar);
</script>

<template>
  <button
    ref="botao"
    type="button"
    class="botao-pontos"
    :aria-label="rotulo"
    :title="rotulo"
    aria-haspopup="menu"
    :aria-expanded="aberto"
    @click="alternar"
    @keydown.enter.stop
  >
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.9" /><circle cx="12" cy="12" r="1.9" /><circle cx="12" cy="19" r="1.9" />
    </svg>
  </button>
  <Teleport to="body">
    <div v-if="aberto" class="menu-pontos-pop" role="menu" :style="{ left: pos.x + 'px', top: pos.y + 'px' }" @click="fechar">
      <slot />
    </div>
  </Teleport>
</template>

<style>
button.botao-pontos { flex: none; width: 36px; height: 36px; padding: 0; display: grid; place-items: center; background: transparent; border: none; border-radius: 50%; color: var(--cor-texto-suave); cursor: pointer; transition: background var(--anim-rapida) ease, color var(--anim-rapida) ease; position: relative; }
button.botao-pontos::after { content: ''; position: absolute; inset: -4px; } /* alvo de toque 44px */
button.botao-pontos:hover, .botao-pontos[aria-expanded="true"] { background: var(--cor-realce); color: var(--cor-texto); }
button.botao-pontos:focus-visible { outline: 2px solid var(--tema-cor, var(--cor-primaria)); outline-offset: 1px; }
.menu-pontos-pop { position: fixed; z-index: 80; width: 176px; background: var(--cor-fundo-elevado); border: 1px solid var(--cor-borda); border-radius: 14px; padding: 6px; display: flex; flex-direction: column; box-shadow: var(--sombra-suave), 0 10px 28px rgba(0,0,0,.28); animation: menu-pontos-entra var(--anim-padrao) var(--anim-curva); transform-origin: top right; }
@keyframes menu-pontos-entra { from { opacity: 0; transform: translateY(-4px) scale(0.97); } }
div.menu-pontos-pop button { background: transparent; border: none; color: var(--cor-texto); text-align: left; font: 500 14px var(--fonte-texto); min-height: 44px; padding: 0 12px; border-radius: 10px; cursor: pointer; }
div.menu-pontos-pop button:hover, div.menu-pontos-pop button:focus-visible { background: var(--cor-realce); outline: none; }
div.menu-pontos-pop button.perigo { color: var(--cor-saida); }
</style>
