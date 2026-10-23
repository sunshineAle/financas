<script setup>
// <CampoConta v-model="contaId" :contas="contas" rotulo="Conta" /> — escolha de conta em lista de toque (radio).
// contas: [{ id, nome, icone?, detalhe? }]  (icone = emoji ou data:image, como no cadastro de contas; detalhe ex.: saldo formatado)
// Props: modelValue (id), contas, rotulo, erro, dica, tema, obrigatorio, vazio (texto quando não há contas), compacto (boolean: chips em linha).
import IconeBanco from './IconeBanco.vue';
import CampoBase from './CampoBase.vue';
defineProps({
  modelValue: { type: [String, Number], default: '' },
  contas: { type: Array, default: () => [] },
  rotulo: { type: String, default: 'Conta' },
  erro: String, dica: String, tema: String, obrigatorio: Boolean,
  vazio: { type: String, default: 'Nenhuma conta cadastrada.' },
  compacto: Boolean,
});
const emit = defineEmits(['update:modelValue']);
</script>

<template>
  <CampoBase :rotulo="rotulo" :erro="erro" :dica="dica" :tema="tema" :obrigatorio="obrigatorio">
    <div v-if="contas.length" :class="['lista', { compacto }]" role="radiogroup" :aria-label="rotulo">
      <button v-for="c in contas" :key="c.id" type="button" role="radio" :aria-checked="String(modelValue) === String(c.id)" :class="['sf-opcao', 'item', { ativo: String(modelValue) === String(c.id) }]" @click="emit('update:modelValue', c.id)">
        <IconeBanco :icone="c.icone" :nome="c.nome" :tamanho="28" />
        <span class="nome">{{ c.nome }}<small v-if="c.detalhe">{{ c.detalhe }}</small></span>
      </button>
    </div>
    <p v-else class="sf-dica">{{ vazio }}</p>
  </CampoBase>
</template>

<style scoped>
.lista { display: flex; flex-direction: column; gap: 8px; }
.lista.compacto { flex-direction: row; flex-wrap: wrap; }
.item { display: flex; align-items: center; gap: 12px; min-height: 52px; padding: 8px 12px; border-radius: 14px; background: var(--cor-fundo); border: 1.5px solid var(--cor-borda); color: var(--cor-texto); font: 600 14px var(--fonte-texto); text-align: left; cursor: pointer; transition: border-color var(--anim-rapida) ease, background var(--anim-padrao) ease; }
.compacto .item { min-height: 44px; border-radius: 999px; padding: 6px 14px 6px 8px; }
.item:hover { border-color: color-mix(in srgb, var(--tc) 40%, var(--cor-borda)); }
.item.ativo { border-color: var(--tc); background: var(--tema-fundo, var(--cor-realce)); }
.nome { display: flex; flex-direction: column; min-width: 0; overflow-wrap: anywhere; }
.nome small { font-weight: 400; font-size: 12px; color: var(--cor-texto-suave); }
</style>
