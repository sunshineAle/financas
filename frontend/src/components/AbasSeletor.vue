<script setup>
// <AbasSeletor v-model="aba" :abas="[{id,rotulo,icone?}]" tema="meta" swipe /> — seletor de abas.
// Modelo: Metas | Investimentos de Objetivos. Botão ativo = degradê do tema da página (NUNCA azul sólido),
// com indicador deslizante. Alvos de toque >= 44px.
//
// Props
//   modelValue  id da aba ativa (v-model)
//   abas        [{ id, rotulo, icone? }]  icone = componente lucide (opcional)
//   tema        'entrada'|'saida'|'meta'|'investimento'|'neutro'. Dica: Objetivos usa degradê próprio meta→investimento:
//               passe tema="meta" e a prop `degrade` (CSS) para sobrescrever, ex.: degrade="linear-gradient(135deg, var(--cor-meta), var(--cor-investimento))"
//   degrade     opcional, sobrescreve o degradê do tema
//   swipe       boolean: deslizar para o lado troca de aba. O gesto é escutado no ELEMENTO PAI deste
//               componente (a página inteira), só quando é bem mais horizontal que vertical.
//   bloco       boolean: ocupa 100% da largura (padrão: largura mínima 340px, alinhado à esquerda)
// Emite update:modelValue.  Teclado: setas esquerda/direita.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';

const props = defineProps({
  modelValue: { type: String, default: '' },
  abas: { type: Array, required: true },
  tema: { type: String, default: 'neutro' },
  degrade: { type: String, default: '' },
  swipe: { type: Boolean, default: false },
  bloco: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue']);
const raiz = ref(null);
const indice = computed(() => Math.max(0, props.abas.findIndex((a) => a.id === props.modelValue)));
const ir = (i) => { if (i >= 0 && i < props.abas.length) emit('update:modelValue', props.abas[i].id); };

function setas(e) {
  if (e.key === 'ArrowRight') { e.preventDefault(); ir(indice.value + 1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); ir(indice.value - 1); }
}

let ini = null;
const tocou = (e) => { const t = e.touches[0]; ini = { x: t.clientX, y: t.clientY }; };
const soltou = (e) => {
  if (!ini) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - ini.x; const dy = t.clientY - ini.y; ini = null;
  if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
  ir(indice.value + (dx < 0 ? 1 : -1));
};
let alvo = null;
onMounted(() => {
  if (!props.swipe || !raiz.value?.parentElement) return;
  alvo = raiz.value.parentElement;
  alvo.addEventListener('touchstart', tocou, { passive: true });
  alvo.addEventListener('touchend', soltou, { passive: true });
});
onBeforeUnmount(() => { alvo?.removeEventListener('touchstart', tocou); alvo?.removeEventListener('touchend', soltou); });
</script>

<template>
  <div ref="raiz" :class="['abas', 'tema-' + tema, { bloco }]" role="tablist" :style="{ '--n': abas.length, '--i': indice, ...(degrade ? { '--tema-degrade': degrade } : {}) }" @keydown="setas">
    <span class="indicador" aria-hidden="true"></span>
    <button v-for="a in abas" :key="a.id" type="button" role="tab" :aria-selected="modelValue === a.id" :tabindex="modelValue === a.id ? 0 : -1" :class="{ ativa: modelValue === a.id }" @click="emit('update:modelValue', a.id)">
      <component :is="a.icone" v-if="a.icone" :size="16" :stroke-width="2" />{{ a.rotulo }}
    </button>
  </div>
</template>

<style scoped>
.abas { position: relative; display: grid; grid-template-columns: repeat(var(--n), 1fr); padding: 4px; border-radius: 14px; background: var(--cor-card); border: 1px solid var(--cor-card-borda); align-self: flex-start; min-width: min(100%, 340px); }
.abas.bloco { align-self: stretch; width: 100%; }
.abas button { position: relative; z-index: 1; min-height: 44px; padding: 9px 18px; border: none; background: none; color: var(--cor-texto-suave); font-family: var(--fonte-texto); font-size: 14px; font-weight: 600; cursor: pointer; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; transition: color var(--anim-padrao) ease; }
.abas button:hover:not(.ativa) { color: var(--cor-texto); }
.abas button.ativa { color: var(--cor-sobre-cor); }
.abas button:focus-visible { outline: 2px solid var(--tema-cor); outline-offset: 1px; }
.indicador { position: absolute; z-index: 0; top: 4px; bottom: 4px; left: 4px; width: calc((100% - 8px) / var(--n)); border-radius: 10px; background: var(--tema-degrade); transform: translateX(calc(var(--i) * 100%)); transition: transform var(--anim-padrao) var(--anim-curva); }
</style>
