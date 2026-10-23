<script setup>
// Escolha de ícone (grade de toque 44px, seleção com a cor do tema da página: envolva em .tema-xxx ou deixe o padrão): emojis rápidos ou envio de uma imagem (logo), reduzida a 96x96.
import { ref } from 'vue';
import IconeBanco from './IconeBanco.vue';

const props = defineProps({
  modelValue: { type: String, default: '' },
  padrao: { type: String, default: '🏦' },
  emojis: { type: Array, default: null }, // biblioteca própria (ex.: categorias)
  semImagem: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue']);
const emojisPadrao = ['🏦', '💳', '💰', '🪙', '🏧', '👛', '🐷', '🍽️', '🎁', '🛒', '📈', '🟣', '🟠', '🟡', '🔵', '🟢'];
const erro = ref('');
const ehImagem = (i) => String(i || '').startsWith('data:image/');

function escolher(e) {
  const arquivo = e.target.files?.[0];
  e.target.value = '';
  erro.value = '';
  if (!arquivo) return;
  if (!arquivo.type.startsWith('image/')) { erro.value = 'Escolha um arquivo de imagem.'; return; }
  const url = URL.createObjectURL(arquivo);
  const img = new Image();
  img.onload = () => {
    const lado = 96;
    const canvas = document.createElement('canvas');
    canvas.width = lado; canvas.height = lado;
    const corte = Math.min(img.width, img.height);
    canvas.getContext('2d').drawImage(img, (img.width - corte) / 2, (img.height - corte) / 2, corte, corte, 0, 0, lado, lado);
    emit('update:modelValue', canvas.toDataURL('image/png'));
    URL.revokeObjectURL(url);
  };
  img.onerror = () => { erro.value = 'Não consegui abrir essa imagem.'; URL.revokeObjectURL(url); };
  img.src = url;
}
</script>

<template>
  <div class="seletor">
    <div class="emojis">
      <button v-for="e in (emojis || emojisPadrao)" :key="e" type="button" :class="['emoji', { ativo: modelValue === e }]" @click="emit('update:modelValue', e)">{{ e }}</button>
    </div>
    <div v-if="!semImagem" class="envio">
      <IconeBanco v-if="ehImagem(modelValue)" :icone="modelValue" :tamanho="36" />
      <label class="botao-arquivo">Enviar logo<input type="file" accept="image/*" hidden @change="escolher" /></label>
      <button v-if="ehImagem(modelValue)" type="button" class="mini" @click="emit('update:modelValue', padrao)">Usar emoji</button>
    </div>
    <p v-if="erro" class="erro">{{ erro }}</p>
  </div>
</template>

<style scoped>
.seletor { display: flex; flex-direction: column; gap: 10px; }
.emojis { display: grid; grid-template-columns: repeat(auto-fill, minmax(44px, 1fr)); gap: 6px; }
.emoji { min-height: 44px; background: var(--cor-fundo); border: 1.5px solid var(--cor-borda); font-size: 21px; padding: 0; border-radius: 12px; cursor: pointer; transition: border-color var(--anim-rapida) ease, background var(--anim-rapida) ease, transform var(--anim-rapida) ease; }
.emoji:hover { border-color: color-mix(in srgb, var(--tema-cor, var(--cor-primaria)) 45%, var(--cor-borda)); }
.emoji:active { transform: scale(0.94); }
.emoji.ativo { border-color: var(--tema-cor, var(--cor-primaria)); background: var(--tema-fundo, var(--cor-realce)); }
.emoji:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--tema-cor, var(--cor-primaria)) 35%, transparent); }
.envio { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.botao-arquivo { min-height: 44px; display: inline-flex; align-items: center; border: 1.5px solid var(--cor-borda); border-radius: 12px; padding: 0 14px; font-size: 13px; font-weight: 600; cursor: pointer; color: var(--cor-texto); transition: background var(--anim-rapida) ease; }
.botao-arquivo:hover { background: var(--cor-realce); }
.mini { min-height: 44px; background: transparent; border: 1px solid var(--cor-borda); color: var(--cor-texto-suave); font-size: 12px; padding: 0 12px; border-radius: 12px; cursor: pointer; }
.erro { margin: 0; font-size: 13px; color: var(--cor-saida); }
</style>
