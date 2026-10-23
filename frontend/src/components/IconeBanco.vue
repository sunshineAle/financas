<script setup>
// Ícone de conta/cartão/banco. Ordem de decisão:
//  1) imagem enviada pelo usuário (data:image/...)
//  2) emoji escolhido pelo usuário (diferente do padrão)
//  3) logo da biblioteca, reconhecido automaticamente por `nome`/`codigo` (ou `icone="banco:<slug>"`)
//  4) fallback: iniciais do banco em quadrado neutro (ou o emoji padrão, se não houver nome)
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import { reconhecerBanco, bancoPorSlug } from '../utils/catalogoBancos.js';

const props = defineProps({
  icone: { type: String, default: '' },
  padrao: { type: String, default: '🏦' },
  tamanho: { type: Number, default: 20 },
  nome: { type: String, default: '' },
  codigo: { type: [String, Number], default: '' },
  // 'fundo' = ícone quadrado colorido; 'sem-fundo' = ícone solto; 'logo' = logo completo (130x60)
  variante: { type: String, default: 'fundo' },
});

const ehImagem = (i) => String(i || '').startsWith('data:image/');
const EMOJIS_PADRAO = new Set(['', '🏦', '💳', '🏷️']);

const escuro = ref(false);
let obs = null;
const ler = () => { escuro.value = document.documentElement.getAttribute('data-theme') === 'dark'; };
onMounted(() => {
  ler();
  obs = new MutationObserver(ler);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
});
onBeforeUnmount(() => obs && obs.disconnect());

const banco = computed(() => {
  const ic = props.icone || ''; // o backend pode mandar icone nulo
  if (ehImagem(ic)) return null;
  if (ic.startsWith('banco:')) return bancoPorSlug(ic.slice(6));
  if (!EMOJIS_PADRAO.has(ic)) return null; // emoji escolhido pelo usuário vence
  if (!props.nome && !props.codigo) return null;
  return reconhecerBanco({ nome: props.nome, codigo: props.codigo });
});

const iniciais = computed(() => {
  const palavras = String(props.nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^A-Za-z0-9]+/)
    .filter((p) => p && !/^(banco|bank|de|do|da|s|a|sa|conta|cartao|card)$/i.test(p));
  if (!palavras.length) return '';
  return (palavras.length === 1 ? palavras[0].slice(0, 2) : palavras[0][0] + palavras[1][0]).toUpperCase();
});

const arquivo = computed(() => {
  const b = banco.value;
  if (!b) return null;
  const a = b.arquivos;
  if (props.variante === 'logo') {
    // logo completo é sem fundo: no tema escuro, se for escuro demais, cai para o ícone com fundo
    if (a.logo && !(escuro.value && b.iconeEscuro)) return { url: a.logo, tipo: 'logo' };
    return a.iconeFundo ? { url: a.iconeFundo, tipo: 'fundo' } : a.icone ? { url: a.icone, tipo: 'sem-fundo' } : null;
  }
  if (props.variante === 'sem-fundo') {
    if (a.icone && !(escuro.value && b.iconeEscuro)) return { url: a.icone, tipo: 'sem-fundo' };
    return a.iconeFundo ? { url: a.iconeFundo, tipo: 'fundo' } : a.icone ? { url: a.icone, tipo: 'sem-fundo' } : null;
  }
  return a.iconeFundo ? { url: a.iconeFundo, tipo: 'fundo' } : a.icone ? { url: a.icone, tipo: 'sem-fundo' } : null;
});

const ehLogo = computed(() => arquivo.value && arquivo.value.tipo === 'logo');
const estilo = computed(() => {
  const t = props.tamanho;
  if (ehLogo.value) return { height: t + 'px', width: Math.round(t * 130 / 60) + 'px', borderRadius: '0' };
  return { width: t + 'px', height: t + 'px', fontSize: t * 0.8 + 'px', borderRadius: Math.max(4, Math.round(t * 0.22)) + 'px' };
});
</script>

<template>
  <span class="icone-banco" :class="{ logo: ehLogo, neutro: !arquivo && !ehImagem(icone) && iniciais && !banco && EMOJIS_PADRAO.has(icone || '') && !!nome }"
    :style="estilo" aria-hidden="true">
    <img v-if="ehImagem(icone)" :src="icone" alt="" />
    <img v-else-if="arquivo" :src="arquivo.url" alt="" :class="{ solto: arquivo.tipo !== 'fundo' }" loading="lazy" decoding="async" />
    <span v-else-if="nome && iniciais && EMOJIS_PADRAO.has(icone || '')" class="iniciais" :style="{ fontSize: Math.max(8, tamanho * 0.4) + 'px' }">{{ iniciais }}</span>
    <template v-else>{{ icone || padrao }}</template>
  </span>
</template>

<style scoped>
.icone-banco { display: inline-flex; align-items: center; justify-content: center; overflow: hidden; flex: none; line-height: 1; vertical-align: middle; }
.icone-banco img { width: 100%; height: 100%; object-fit: cover; display: block; }
.icone-banco img.solto { object-fit: contain; }
.icone-banco.logo img { object-fit: contain; }
.icone-banco.neutro { background: var(--cor-fundo-elevado); border: 1px solid var(--cor-borda); color: var(--cor-texto); }
.iniciais { font-weight: 700; letter-spacing: 0.02em; }
</style>
