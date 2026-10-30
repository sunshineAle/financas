<script setup>
// Janela (pop-up) base do sistema. Uso: <Modal :aberto="x" titulo="..." @fechar="x = false"> ...conteúdo... </Modal>
// Celular (<=768px): FOLHA que sobe da base, com alça, cantos de cima arredondados e rodapé fixo.
// PC: janela centralizada. Fecha com Esc, clicando fora ou no X. Trava a rolagem da página enquanto aberto,
// leva o foco para dentro e devolve ao elemento anterior ao fechar. Claro/escuro por tokens.
// Props: aberto, titulo, tema ('entrada'|'saida'|'meta'|'investimento'|'neutro': cor do foco/filete), largura (px máx. no PC; padrão 520).
// Slots: default (corpo, rola), #rodape (fixo embaixo — botões). Para formulários prontos use <FormularioModal>.
// ajuda (opcional): id em config/ajudaSecoes.js — põe o "?" minúsculo ao lado do título (anotação 64).
import { watch, onUnmounted, ref, nextTick } from 'vue';
import { X } from 'lucide-vue-next';
import AjudaSecao from './AjudaSecao.vue';
import { useArrastarParaFechar } from '../services/arrastarParaFechar.js';

const props = defineProps({
  aberto: { type: Boolean, default: false },
  titulo: { type: String, default: '' },
  tema: { type: String, default: 'neutro' },
  largura: { type: Number, default: 520 },
  ajuda: { type: String, default: '' },
});
const emit = defineEmits(['fechar']);
const caixa = ref(null);
useArrastarParaFechar(caixa, () => emit('fechar')); // celular: arrastar a folha para baixo fecha
let anterior = null;
// Teclado virtual: a folha acompanha a área visível (visualViewport) para o campo e Salvar/Cancelar não ficarem escondidos.
const vv = typeof window !== 'undefined' ? window.visualViewport : null;
const altura = ref(0);
const topo = ref(0);
function ajustarTeclado() {
  if (!vv) return;
  altura.value = Math.round(vv.height);
  topo.value = Math.round(vv.offsetTop);
  const f = document.activeElement;
  if (f && caixa.value?.contains(f) && /^(INPUT|TEXTAREA|SELECT)$/.test(f.tagName)) {
    requestAnimationFrame(() => f.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  }
}

function aoApertarTecla(evento) {
  if (evento.key === 'Escape') emit('fechar');
}

watch(
  () => props.aberto,
  async (aberto) => {
    if (aberto) {
      anterior = document.activeElement;
      window.addEventListener('keydown', aoApertarTecla);
      vv?.addEventListener('resize', ajustarTeclado); vv?.addEventListener('scroll', ajustarTeclado);
      if (vv) { altura.value = Math.round(vv.height); topo.value = Math.round(vv.offsetTop); }
      document.documentElement.style.overflow = 'hidden';
      await nextTick();
      const alvo = caixa.value?.querySelector('[autofocus], input:not([type=hidden]), select, textarea') || caixa.value;
      alvo?.focus?.({ preventScroll: true });
    } else {
      window.removeEventListener('keydown', aoApertarTecla);
      vv?.removeEventListener('resize', ajustarTeclado); vv?.removeEventListener('scroll', ajustarTeclado);
      document.documentElement.style.overflow = '';
      anterior?.focus?.({ preventScroll: true });
    }
  },
  { immediate: true }
);

onUnmounted(() => {
  window.removeEventListener('keydown', aoApertarTecla);
  vv?.removeEventListener('resize', ajustarTeclado); vv?.removeEventListener('scroll', ajustarTeclado);
  document.documentElement.style.overflow = '';
});
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="aberto" :class="['fundo-modal', 'tema-' + tema]" :style="altura ? { '--vv-h': altura + 'px', '--vv-top': topo + 'px' } : null" @click.self="emit('fechar')">
        <div ref="caixa" class="modal" role="dialog" aria-modal="true" :aria-label="titulo" tabindex="-1" :style="{ '--largura': largura + 'px' }">
          <span class="alca" aria-hidden="true"></span>
          <div class="cabecalho-modal">
            <h2>{{ titulo }}<AjudaSecao v-if="ajuda" :secao="ajuda" /></h2>
            <button type="button" class="fechar" aria-label="Fechar" @click="emit('fechar')"><X :size="18" /></button>
          </div>
          <div class="corpo-modal"><slot /></div>
          <div v-if="$slots.rodape" class="rodape-modal"><slot name="rodape" /></div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fundo-modal {
  position: fixed; inset: 0; z-index: 40;
  background: color-mix(in srgb, black 62%, transparent);
  backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center; padding: 16px;
}
.modal {
  width: 100%; max-width: var(--largura, 520px); max-height: calc(100dvh - 32px);
  display: flex; flex-direction: column;
  background: var(--cor-fundo-elevado); color: var(--cor-texto); font-family: var(--fonte-texto);
  border: 1px solid var(--cor-borda); border-radius: 22px; box-shadow: var(--sombra-suave), 0 30px 60px -30px rgba(0, 0, 0, 0.6);
  outline: none; overflow: hidden;
}
.modal::before { content: ''; height: 3px; flex: none; background: var(--tema-degrade, transparent); }
.alca { display: none; }
.cabecalho-modal { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 16px 20px 8px; flex: none; }
.cabecalho-modal h2 { font-family: var(--fonte-display); font-size: 18px; margin: 0; }
.fechar { flex: none; width: 36px; height: 36px; display: grid; place-items: center; background: var(--cor-realce); border: none; color: var(--cor-texto-suave); border-radius: 50%; cursor: pointer; transition: color var(--anim-rapida) ease, background var(--anim-rapida) ease; }
.fechar:hover { color: var(--cor-texto); }
.fechar:focus-visible { outline: 2px solid var(--tema-cor, var(--cor-primaria)); outline-offset: 2px; }
.corpo-modal { padding: 8px 20px 20px; overflow-y: auto; overscroll-behavior: contain; min-height: 0; }
.rodape-modal { flex: none; padding: 12px 20px calc(14px + env(safe-area-inset-bottom)); border-top: 1px solid var(--cor-borda); background: var(--cor-fundo-elevado); }

/* animação */
.modal-enter-active, .modal-leave-active { transition: opacity var(--anim-padrao) ease; }
.modal-enter-active .modal, .modal-leave-active .modal { transition: transform var(--anim-padrao) var(--anim-curva), opacity var(--anim-padrao) ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-from .modal, .modal-leave-to .modal { transform: translateY(16px) scale(0.98); opacity: 0; }

/* celular: folha que sobe da base */
@media (max-width: 768px) {
  .fundo-modal { align-items: flex-end; padding: 0; inset: auto 0 auto 0; top: var(--vv-top, 0px); height: var(--vv-h, 100dvh); }
  .modal { max-width: none; max-height: min(92dvh, var(--vv-h, 100dvh)); border-radius: 24px 24px 0 0; border-bottom: none; }
  .alca { display: block; width: 40px; height: 4px; border-radius: 999px; background: var(--cor-borda); margin: 8px auto 0; flex: none; }
  .modal::before { display: none; }
  .modal-enter-from .modal, .modal-leave-to .modal { transform: translateY(100%); opacity: 1; }
  .corpo-modal { padding-bottom: calc(20px + env(safe-area-inset-bottom)); }
}
</style>
