<script setup>
// Seletor de abas do Perfil (Tema, Animações): a aba ativa tem degradê nas cores do tema da página.
//   opcoes: [{ id, rotulo, icone? }]   v-model: id escolhido
defineProps({ modelValue: { type: String, default: '' }, opcoes: { type: Array, required: true }, rotulo: { type: String, default: '' } });
const emit = defineEmits(['update:modelValue']);
</script>

<template>
  <div class="abas" role="radiogroup" :aria-label="rotulo" :style="{ '--n': opcoes.length }">
    <button
      v-for="o in opcoes"
      :key="o.id"
      type="button"
      role="radio"
      :aria-checked="modelValue === o.id"
      :class="{ ativa: modelValue === o.id }"
      @click="emit('update:modelValue', o.id)"
    >
      <component :is="o.icone" v-if="o.icone" :size="16" :stroke-width="2" />
      <span>{{ o.rotulo }}</span>
    </button>
  </div>
</template>

<style scoped>
.abas { display: grid; grid-template-columns: repeat(var(--n), 1fr); gap: 4px; padding: 4px; border-radius: 14px; background: var(--cor-fundo); border: 1px solid var(--cor-borda); }
button { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 0 6px; border: none; border-radius: 10px; background: none; color: var(--cor-texto-suave); font-family: var(--fonte-texto); font-size: 13px; font-weight: 600; cursor: pointer; transition: background var(--anim-padrao) ease, color var(--anim-padrao) ease, box-shadow var(--anim-padrao) ease; }
button:hover:not(.ativa) { background: var(--cor-realce); color: var(--cor-texto); }
button.ativa { color: var(--cor-sobre-cor); background: linear-gradient(135deg, var(--cor-primaria), var(--cor-violeta)); box-shadow: 0 6px 14px -8px color-mix(in srgb, var(--cor-primaria) 70%, transparent); }
@media (max-width: 380px) { button span { font-size: 12px; } }
</style>
