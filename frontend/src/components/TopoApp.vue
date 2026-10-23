<script setup>
// Topo do app (celular e PC): foto do perfil à esquerda (abre o "Mais") e sino de avisos à direita (abre um
// popover; tocar num aviso leva ao local dele). O AppLayout o coloca acima do conteúdo das telas Início, Contas,
// Objetivos, Transações, Cartões e Dívidas — as telas não precisam ser editadas.
// Props: usuario (objeto de /api/auth/me, para o nome/inicial).
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { Bell, X, CheckCheck, CalendarClock, TriangleAlert, Info } from 'lucide-vue-next';
import AvatarMini from './AvatarMini.vue';
import MarcaDagda from './MarcaDagda.vue';
import BotaoOlho from './BotaoOlho.vue';
import { topoValorMontados } from '../services/privacidade.js';
import { inicialDe, nomeExibido } from '../services/perfil.js';
import { visiveis, carregarAvisos, dispensarAviso } from '../services/notificacoes.js';

const props = defineProps({ usuario: { type: Object, default: null } });
const router = useRouter();
const route = useRoute();
const aberto = ref(false);
const raiz = ref(null);
const inicial = computed(() => inicialDe(props.usuario));
const tituloTopo = computed(() => (route.name !== 'dashboard' && route.meta && route.meta.titulo) || '');
const nome = computed(() => nomeExibido(props.usuario) || 'Perfil');
const ICONE = { saida: TriangleAlert, alerta: CalendarClock, info: Info };

function alternar() {
  aberto.value = !aberto.value;
  if (aberto.value) carregarAvisos();
}
function ir(a) {
  aberto.value = false;
  router.push(a.rota);
}
function aoClicarFora(e) { if (aberto.value && raiz.value && !raiz.value.contains(e.target)) aberto.value = false; }
function aoTeclar(e) { if (aberto.value && e.key === 'Escape') aberto.value = false; }
watch(() => route.fullPath, () => { aberto.value = false; });
onMounted(() => {
  carregarAvisos();
  document.addEventListener('pointerdown', aoClicarFora);
  window.addEventListener('keydown', aoTeclar);
});
onUnmounted(() => {
  document.removeEventListener('pointerdown', aoClicarFora);
  window.removeEventListener('keydown', aoTeclar);
});
</script>

<template>
  <div ref="raiz" class="topo-app">
    <button type="button" class="botao-perfil" :aria-label="`${nome}: abrir Mais`" title="Mais" @click="router.push('/mais')">
      <AvatarMini :inicial="inicial" :tamanho="38" />
    </button>

    <h1 v-if="tituloTopo" class="titulo-topo">{{ tituloTopo }}</h1>
    <MarcaDagda v-else class="marca-topo" :tamanho="34" />

    <div class="area-sino">
      <!-- olho de "ocultar valores": só aqui em telas sem card de topo (os cards trazem o seu) -->
      <BotaoOlho v-if="topoValorMontados === 0" :tamanho="44" />
      <button type="button" class="sino" :class="{ ativo: aberto }" :aria-expanded="aberto" aria-haspopup="dialog" :aria-label="visiveis.length ? `Avisos: ${visiveis.length} novos` : 'Avisos'" @click="alternar">
        <Bell :size="20" :stroke-width="1.8" />
        <span v-if="visiveis.length" class="selo">{{ visiveis.length > 9 ? '9+' : visiveis.length }}</span>
      </button>

      <transition name="pop">
        <div v-if="aberto" class="popover" role="dialog" aria-label="Avisos">
          <header>
            <strong>Avisos</strong>
            <button type="button" class="fechar" aria-label="Fechar avisos" @click="aberto = false"><X :size="16" :stroke-width="2" /></button>
          </header>
          <ul v-if="visiveis.length">
            <li v-for="a in visiveis" :key="a.id" :class="a.tom">
              <button type="button" class="aviso" @click="ir(a)">
                <span class="ic"><component :is="ICONE[a.tom] || Info" :size="17" :stroke-width="1.9" /></span>
                <span class="tx"><b>{{ a.titulo }}</b><small>{{ a.detalhe }}</small></span>
              </button>
              <button type="button" class="dispensar" :aria-label="`Dispensar: ${a.titulo}`" @click="dispensarAviso(a.id)"><X :size="14" :stroke-width="2" /></button>
            </li>
          </ul>
          <p v-else class="vazio"><CheckCheck :size="20" :stroke-width="1.8" /> Tudo em dia. Nenhum aviso agora.</p>
        </div>
      </transition>
    </div>
  </div>
</template>

<style scoped>
.topo-app { display: flex; align-items: center; justify-content: space-between; min-height: 48px; margin-bottom: 6px; position: relative; z-index: 20; }
.marca-topo { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); pointer-events: none; }
.titulo-topo { position: absolute; left: 100px; right: 100px; top: 50%; transform: translateY(-50%); margin: 0; text-align: center; font-family: var(--fonte-display); font-size: 16px; font-weight: 600; letter-spacing: 0.01em; color: var(--cor-texto); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; pointer-events: none; }
.botao-perfil, .sino { position: relative; display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; padding: 0; border-radius: 50%; border: none; background: none; cursor: pointer; color: var(--cor-texto-suave); -webkit-tap-highlight-color: transparent; transition: background var(--anim-rapida) ease, color var(--anim-rapida) ease; }
.botao-perfil:hover, .sino:hover, .sino.ativo { background: var(--cor-realce); color: var(--cor-texto); }
.botao-perfil:focus-visible, .sino:focus-visible { outline: 2px solid var(--cor-primaria); outline-offset: 2px; }
.selo { position: absolute; top: 5px; right: 4px; min-width: 17px; height: 17px; padding: 0 4px; border-radius: 99px; background: var(--cor-saida); color: var(--cor-sobre-cor); font-size: 10.5px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 0 0 2px var(--cor-fundo); }
.area-sino { position: relative; display: flex; align-items: center; }
.popover { position: absolute; top: calc(100% + 6px); right: 0; width: 340px; max-width: calc(100vw - 32px); max-height: min(70vh, 460px); overflow-y: auto; background: var(--cor-fundo-elevado); border: 1px solid var(--cor-borda); border-radius: var(--raio-padrao); box-shadow: 0 18px 40px -16px rgba(0, 0, 0, 0.55); padding: 6px; transform-origin: top right; }
.popover header { display: flex; align-items: center; justify-content: space-between; padding: 6px 8px 8px 10px; }
.popover header strong { font-family: var(--fonte-display); font-size: 14px; }
.fechar, .dispensar { width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; border: none; background: none; color: var(--cor-texto-suave); cursor: pointer; flex-shrink: 0; }
.fechar:hover, .dispensar:hover { background: var(--cor-realce); color: var(--cor-texto); }
ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
li { display: flex; align-items: center; border-radius: 12px; }
li:hover { background: var(--cor-realce); }
.aviso { flex: 1; min-width: 0; min-height: 56px; display: flex; align-items: center; gap: 12px; padding: 8px 6px 8px 8px; background: none; border: none; text-align: left; color: var(--cor-texto); font-family: var(--fonte-texto); cursor: pointer; }
.ic { width: 34px; height: 34px; border-radius: 11px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; background: var(--cor-realce); color: var(--cor-texto-suave); }
li.saida .ic { background: var(--cor-saida-fundo); color: var(--cor-saida); }
li.alerta .ic { background: color-mix(in srgb, var(--cor-alerta) 18%, transparent); color: var(--cor-alerta); }
li.info .ic { background: var(--cor-entrada-fundo); color: var(--cor-primaria); }
.tx { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.tx b { font-size: 13.5px; font-weight: 600; }
.tx small { font-size: 12px; color: var(--cor-texto-suave); }
.vazio { margin: 0; padding: 18px 12px 20px; display: flex; align-items: center; justify-content: center; gap: 8px; color: var(--cor-texto-suave); font-size: 13px; }
.pop-enter-active, .pop-leave-active { transition: opacity var(--anim-rapida) ease, transform var(--anim-padrao) var(--anim-curva); }
.pop-enter-from, .pop-leave-to { opacity: 0; transform: translateY(-6px) scale(0.97); }
</style>
