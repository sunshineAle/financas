<script setup>
// Avatar do Perfil: tocar nele abre um painel para trocar a foto (arquivo do aparelho) ou a cor.
import { ref } from 'vue';
import { Camera, Trash2, ImagePlus } from 'lucide-vue-next';
import { perfil, CORES_AVATAR, gradienteAvatar, fotoDeArquivo } from '../services/perfil.js';

const props = defineProps({ inicial: { type: String, default: 'A' } });
const aberto = ref(false);
const erro = ref('');
const arquivo = ref(null);

async function escolheu(e) {
  erro.value = '';
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try { perfil.foto = await fotoDeArquivo(f); } catch (x) { erro.value = x.message; }
}
</script>

<template>
  <div class="avatar-area">
    <button type="button" class="avatar" :style="{ background: perfil.foto ? 'var(--cor-fundo-elevado)' : gradienteAvatar(perfil.cor) }" :aria-expanded="aberto" aria-label="Alterar foto ou cor do avatar" @click="aberto = !aberto">
      <img v-if="perfil.foto" :src="perfil.foto" alt="Sua foto" />
      <span v-else>{{ props.inicial }}</span>
      <span class="camera" aria-hidden="true"><Camera :size="14" :stroke-width="2.2" /></span>
    </button>

    <transition name="painel">
      <div v-if="aberto" class="painel">
        <div class="acoes">
          <button type="button" class="acao" @click="arquivo.click()"><ImagePlus :size="18" :stroke-width="1.9" /><span>{{ perfil.foto ? 'Trocar foto' : 'Escolher foto' }}</span></button>
          <button v-if="perfil.foto" type="button" class="acao" @click="perfil.foto = ''"><Trash2 :size="18" :stroke-width="1.9" /><span>Remover foto</span></button>
        </div>
        <input ref="arquivo" type="file" accept="image/*" hidden @change="escolheu" />
        <div class="cores" role="radiogroup" aria-label="Cor do avatar">
          <button v-for="c in CORES_AVATAR" :key="c.id" type="button" role="radio" class="cor" :class="{ ativa: perfil.cor === c.id }" :aria-checked="perfil.cor === c.id" :aria-label="c.rotulo" :style="{ background: gradienteAvatar(c.id) }" @click="perfil.cor = c.id"></button>
        </div>
        <small v-if="erro" class="erro">{{ erro }}</small>
        <small v-else class="dica">A foto fica guardada só neste aparelho.</small>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.avatar-area { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.avatar { position: relative; width: 84px; height: 84px; border-radius: 50%; border: none; padding: 0; display: flex; align-items: center; justify-content: center; font-family: var(--fonte-display); font-size: 32px; font-weight: 700; color: var(--cor-sobre-cor); cursor: pointer; box-shadow: 0 0 0 4px var(--cor-fundo), 0 0 0 5.5px var(--cor-borda); -webkit-tap-highlight-color: transparent; }
.avatar img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
.camera { position: absolute; right: -2px; bottom: -2px; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--cor-fundo-elevado); color: var(--cor-texto); border: 1px solid var(--cor-borda); }
.painel { width: 100%; max-width: 360px; display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 14px; border-radius: var(--raio-padrao); background: var(--cor-fundo-elevado); border: 1px solid var(--cor-borda); }
.acoes { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
.acao { min-height: 44px; display: inline-flex; align-items: center; gap: 8px; padding: 0 14px; border-radius: 12px; border: 1px solid var(--cor-borda); background: none; color: var(--cor-texto); font-family: var(--fonte-texto); font-size: 14px; font-weight: 600; cursor: pointer; }
.acao:hover { background: var(--cor-realce); }
.cores { display: flex; gap: 14px; }
.cor { width: 44px; height: 44px; padding: 0; border-radius: 50%; border: 2px solid transparent; cursor: pointer; background-clip: padding-box; }
.cor.ativa { box-shadow: 0 0 0 2px var(--cor-fundo-elevado), 0 0 0 4px var(--cor-texto); }
.dica, .erro { font-size: 12px; color: var(--cor-texto-suave); }
.erro { color: var(--cor-saida); }
.painel-enter-active, .painel-leave-active { transition: opacity var(--anim-padrao) ease, transform var(--anim-padrao) var(--anim-curva); }
.painel-enter-from, .painel-leave-to { opacity: 0; transform: translateY(-8px); }
</style>
