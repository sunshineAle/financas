<script setup>
// <SeletorPopup :aberto="x" titulo="Pagou com" @fechar="x = false"> …opções… </SeletorPopup>
// Janelinha de escolha que abre POR CIMA do formulário (homologação 1.0, 29/10 22h35): a pessoa toca no campo, escolhe
// na janela e ela fecha sozinha — o formulário não cresce nem precisa rolar. Fecha com Esc (sem fechar o formulário
// de trás), tocando fora ou no X. Celular: sobe da base; PC: centralizada.
import { watch, ref, nextTick, onBeforeUnmount } from 'vue';
import { X } from 'lucide-vue-next';

const props = defineProps({ aberto: Boolean, titulo: { type: String, default: '' }, tema: { type: String, default: '' }, largura: { type: Number, default: 460 } });
const emit = defineEmits(['fechar']);
const caixa = ref(null);
function tecla(e) { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); emit('fechar'); } }
watch(() => props.aberto, async (v) => {
  if (v) { window.addEventListener('keydown', tecla, true); await nextTick(); caixa.value?.querySelector('[aria-checked="true"], button.opcao, button')?.focus({ preventScroll: true }); }
  else window.removeEventListener('keydown', tecla, true);
});
onBeforeUnmount(() => window.removeEventListener('keydown', tecla, true));
</script>

<template>
  <Teleport to="body">
    <transition name="seletor">
      <div v-if="aberto" class="seletor-fundo" :class="tema && 'tema-' + tema" @pointerdown.self="emit('fechar')">
        <div ref="caixa" class="seletor-caixa" role="dialog" aria-modal="true" :aria-label="titulo" :style="{ '--larg': largura + 'px' }">
          <header class="seletor-topo"><b>{{ titulo }}</b><button type="button" class="seletor-fechar" aria-label="Fechar" @click="emit('fechar')"><X :size="18" :stroke-width="2" /></button></header>
          <div class="seletor-corpo"><slot /></div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.seletor-fundo { position: fixed; inset: 0; z-index: 1200; background: rgb(0 0 0 / 0.5); display: flex; align-items: flex-end; justify-content: center; }
@media (min-width: 769px) { .seletor-fundo { align-items: center; } }
.seletor-caixa { width: min(var(--larg), 100%); max-height: min(80vh, 640px); display: flex; flex-direction: column; background: var(--cor-fundo-elevado); border: 1px solid var(--cor-borda); border-radius: 22px 22px 0 0; box-shadow: 0 -16px 40px -18px rgb(0 0 0 / 0.55); padding-bottom: env(safe-area-inset-bottom, 0px); }
@media (min-width: 769px) { .seletor-caixa { border-radius: 22px; } }
.seletor-topo { display: flex; align-items: center; justify-content: space-between; padding: 14px 14px 8px 18px; font-family: var(--fonte-display); font-size: 16px; }
.seletor-fechar { width: 38px; height: 38px; border-radius: 50%; border: 0; background: var(--cor-realce); color: var(--cor-texto); display: grid; place-items: center; cursor: pointer; }
.seletor-corpo { overflow-y: auto; padding: 4px 14px 18px; overscroll-behavior: contain; }
.seletor-enter-active, .seletor-leave-active { transition: opacity var(--anim-padrao, .2s) ease; }
.seletor-enter-active .seletor-caixa, .seletor-leave-active .seletor-caixa { transition: transform var(--anim-padrao, .2s) var(--anim-curva, ease); }
.seletor-enter-from, .seletor-leave-to { opacity: 0; }
.seletor-enter-from .seletor-caixa, .seletor-leave-to .seletor-caixa { transform: translateY(24px); }
</style>
