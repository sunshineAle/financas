<script setup>
// Ícone de categoria / conta / meta / investimento num quadrado arredondado colorido (padrão REF-05/06).
//   <IconeCategoria valor="🛒" tipo="saida" />            emoji legado OU chave nova ('mercado')
//   <IconeCategoria valor="salario" tipo="entrada" />
//   <IconeCategoria :valor="meta.icone" tipo="meta" :tamanho="44" />
//   <IconeCategoria valor="cdb" tipo="investimento" />  (aceita 'cdb' ou 'inv-cdb')
// tipo: 'saida' (quente, padrão) | 'entrada' (azul) | 'meta' (roxo) | 'investimento' (verde) | 'conta'.
// cor: qualquer cor CSS/token; sem ela usa a cor própria do tipo (estável por chave, dentro da família).
// Logo enviada (data:image) vira <img>; emoji que o catálogo não conhece continua aparecendo como emoji.
import { computed } from 'vue';
import Icone from './Icone.vue';
import IconeCat from './IconeCat.vue';
import { CATALOGO, PADRAO_POR_TIPO, resolverChave, corDaChave, ehImagem, ehEmoji } from '../utils/icones.js';
import { chaveFinalCategoria, META_V2 } from '../utils/iconesCategoria.js';
import { PALETA_DESPESA, corDespesa } from '../utils/coresDespesa.js';
import { PALETA_RECEITA } from '../utils/coresReceita.js';

const props = defineProps({
  valor: { type: String, default: '' },
  tipo: { type: String, default: 'saida' },
  cor: { type: String, default: '' },
  tamanho: { type: Number, default: 40 }, // lado do quadrado
  preenchido: { type: Boolean, default: false },
  titulo: { type: String, default: '' },
});

// Categorias de saída/entrada usam os ícones do manifesto (v2); emojis e chaves antigas são traduzidos; desconhecido = "Geral".
// Metas (anotação 34): o mesmo set novo em linha, sempre com o fundo na cor da meta (eixo roxo da paleta v2).
const ehMetaV2 = computed(() => props.tipo === 'meta' && !ehImagem(props.valor));
const ehCategoria = computed(() => ((props.tipo === 'saida' || props.tipo === 'entrada') && !ehImagem(props.valor)) || ehMetaV2.value);
const chaveCat = computed(() => {
  if (ehMetaV2.value) return META_V2[props.valor] || (String(props.valor).startsWith('cat-') ? props.valor : 'cat-saida-geral');
  return ehCategoria.value ? chaveFinalCategoria(props.valor, props.tipo) : '';
});
function corDaCategoria(chave) {
  let h = 0;
  for (const ch of chave) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return props.tipo === 'entrada' ? PALETA_RECEITA[h % PALETA_RECEITA.length] : corDespesa(null, h % PALETA_DESPESA.length);
}
const chave = computed(() => {
  const v = props.valor;
  if (props.tipo === 'investimento' && CATALOGO['inv-' + v]) return 'inv-' + v;
  return resolverChave(v, props.tipo);
});
const imagem = computed(() => ehImagem(props.valor));
const emojiDesconhecido = computed(() => !imagem.value && !ehCategoria.value && !chave.value && ehEmoji(props.valor));
const chaveFinal = computed(() => chave.value || PADRAO_POR_TIPO[props.tipo] || 'generico');
const corFinal = computed(() => props.cor || (ehMetaV2.value ? 'var(--cor-meta)' : ehCategoria.value ? corDaCategoria(chaveCat.value) : corDaChave(chaveFinal.value, props.tipo)));
const lado = computed(() => props.tamanho);
</script>

<template>
  <span
    :class="['icone-cat', 't-' + tipo]" :style="{ '--ic': corFinal, width: lado + 'px', height: lado + 'px', borderRadius: Math.round(lado * 0.3) + 'px' }"
    :role="titulo ? 'img' : null" :aria-label="titulo || null" :aria-hidden="titulo ? null : 'true'"
  >
    <img v-if="imagem" :src="valor" alt="" />
    <span v-else-if="emojiDesconhecido" class="emoji" :style="{ fontSize: Math.round(lado * 0.5) + 'px' }">{{ valor }}</span>
    <IconeCat v-else-if="ehCategoria" :chave="chaveCat" :tamanho="Math.round(lado * 0.56)" :preenchido="preenchido" />
    <Icone v-else :nome="chaveFinal" :tamanho="Math.round(lado * 0.52)" :preenchido="preenchido" />
  </span>
</template>

<style scoped>
.icone-cat {
  display: inline-flex; align-items: center; justify-content: center; flex: none; overflow: hidden;
  color: var(--ic);
  background: color-mix(in srgb, var(--ic) 16%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ic) 22%, transparent);
}
/* Roxo no tema escuro: os médios (#4E2AC6...) ficam fracos sobre fundo escuro; clareia só o traço do ícone. */
:global(:root:not([data-theme='light']) .icone-cat.t-meta) { color: color-mix(in srgb, var(--ic) 52%, white); background: color-mix(in srgb, var(--ic) 30%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ic) 45%, transparent); }
.icone-cat img { width: 100%; height: 100%; object-fit: cover; display: block; }
.emoji { line-height: 1; }
</style>
