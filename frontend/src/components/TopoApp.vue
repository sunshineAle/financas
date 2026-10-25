<script setup>
// Topo do app (anotação 35). Sem logo central.
//  - PC/web: título no centro e, à direita, o olho de ocultar valores (só sem card de topo) e o sino com o popover de avisos.
//    O perfil fica no rodapé do menu lateral, então não há avatar aqui.
//  - Celular: logo "D" só no Início, à esquerda; título no centro nas outras páginas; a FOTO DO PERFIL fica à direita e
//    unifica perfil + notificações: com aviso, anel no degradê da marca e número; ao tocar, abre uma folha com os avisos
//    no topo e os atalhos Perfil e Configurações. O olho fica junto do valor principal (orbe do Início e cards de topo).
// Com "ocultar valores" ligado, os valores dos avisos também ficam escondidos.
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { Bell, X, CheckCheck, CalendarClock, TriangleAlert, Info, UserRound, Settings, ChevronRight } from 'lucide-vue-next';
import AvatarMini from './AvatarMini.vue';
import MarcaDagda from './MarcaDagda.vue';
import BotaoOlho from './BotaoOlho.vue';
import Modal from './Modal.vue';
import { topoValorMontados, ocultar, MASCARA } from '../services/privacidade.js';
import { inicialDe, nomeExibido } from '../services/perfil.js';
import { visiveis, carregarAvisos, dispensarAviso } from '../services/notificacoes.js';
import { ehCelular } from '../services/layout.js';

const props = defineProps({ usuario: { type: Object, default: null } });
const router = useRouter();
const route = useRoute();
const aberto = ref(false);
const folha = ref(false);
const raiz = ref(null);
const inicial = computed(() => inicialDe(props.usuario));
const ehInicio = computed(() => route.name === 'dashboard');
// Celular: título no centro do topo. Tela grande: o título vai para o cabeçalho, ao lado do filtro de meses (anotação 36).
const tituloTopo = computed(() => (ehCelular.value && !ehInicio.value && route.meta && route.meta.titulo) || '');
const nome = computed(() => nomeExibido(props.usuario) || 'Perfil');
const ICONE = { saida: TriangleAlert, alerta: CalendarClock, info: Info };
const qtd = computed(() => visiveis.value.length);
const rotuloFoto = computed(() => `Perfil e notificações${qtd.value ? `, ${qtd.value} ${qtd.value === 1 ? 'nova' : 'novas'}` : ''}`);
// Valores em R$ dos avisos somem com "ocultar valores".
const VALOR = /[-−]?\s?R\$\s?[-−]?[\d.]+(,\d{2})?/g;
const semValor = (t) => (ocultar.value ? String(t || '').replace(VALOR, MASCARA) : t);

function alternar() {
  aberto.value = !aberto.value;
  if (aberto.value) carregarAvisos();
}
function abrirFolha() { folha.value = true; carregarAvisos(); }
function ir(a) {
  aberto.value = false; folha.value = false;
  router.push(a.rota);
}
function irPara(rota) { folha.value = false; router.push(rota); }
function aoClicarFora(e) { if (aberto.value && raiz.value && !raiz.value.contains(e.target)) aberto.value = false; }
function aoTeclar(e) { if (aberto.value && e.key === 'Escape') aberto.value = false; }
watch(() => route.fullPath, () => { aberto.value = false; folha.value = false; });
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
  <div ref="raiz" class="topo-app" :class="{ celular: ehCelular }">
    <!-- Celular: logo só no Início, à esquerda; nas outras páginas o canto fica livre -->
    <span class="lado-esq">
      <MarcaDagda v-if="ehCelular && ehInicio" class="marca-topo" :tamanho="34" />
    </span>

    <h1 v-if="tituloTopo" class="titulo-topo">{{ tituloTopo }}</h1>

    <div class="area-sino">
      <template v-if="ehCelular">
        <button type="button" class="botao-foto" :class="{ com: qtd > 0 }" :aria-label="rotuloFoto" aria-haspopup="dialog" data-foto-perfil @click="abrirFolha">
          <span class="anel"><AvatarMini :inicial="inicial" :tamanho="qtd ? 34 : 38" /></span>
          <span v-if="qtd" class="selo">{{ qtd > 9 ? '9+' : qtd }}</span>
        </button>
      </template>
      <template v-else>
        <!-- olho de "ocultar valores": só em telas sem card de topo (os cards trazem o seu) -->
        <BotaoOlho v-if="topoValorMontados === 0" :tamanho="44" />
        <button type="button" class="sino" :class="{ ativo: aberto }" :aria-expanded="aberto" aria-haspopup="dialog" :aria-label="qtd ? `Avisos: ${qtd} novos` : 'Avisos'" @click="alternar">
          <Bell :size="20" :stroke-width="1.8" />
          <span v-if="qtd" class="selo">{{ qtd > 9 ? '9+' : qtd }}</span>
        </button>
        <transition name="pop">
          <div v-if="aberto" class="popover" role="dialog" aria-label="Avisos">
            <header>
              <strong>Avisos</strong>
              <button type="button" class="fechar" aria-label="Fechar avisos" @click="aberto = false"><X :size="16" :stroke-width="2" /></button>
            </header>
            <ul v-if="qtd">
              <li v-for="a in visiveis" :key="a.id" :class="a.tom">
                <button type="button" class="aviso" @click="ir(a)">
                  <span class="ic"><component :is="ICONE[a.tom] || Info" :size="17" :stroke-width="1.9" /></span>
                  <span class="tx"><b>{{ semValor(a.titulo) }}</b><small>{{ semValor(a.detalhe) }}</small></span>
                </button>
                <button type="button" class="dispensar" :aria-label="`Dispensar: ${a.titulo}`" @click="dispensarAviso(a.id)"><X :size="14" :stroke-width="2" /></button>
              </li>
            </ul>
            <p v-else class="vazio"><CheckCheck :size="20" :stroke-width="1.8" /> Tudo em dia. Nenhum aviso agora.</p>
          </div>
        </transition>
      </template>
    </div>

    <Modal :aberto="folha" :titulo="nome" @fechar="folha = false">
      <div class="folha" data-folha-perfil>
        <h3>Notificações</h3>
        <ul v-if="qtd">
          <li v-for="a in visiveis" :key="a.id" :class="a.tom">
            <button type="button" class="aviso" @click="ir(a)">
              <span class="ic"><component :is="ICONE[a.tom] || Info" :size="17" :stroke-width="1.9" /></span>
              <span class="tx"><b>{{ semValor(a.titulo) }}</b><small>{{ semValor(a.detalhe) }}</small></span>
            </button>
            <button type="button" class="dispensar" :aria-label="`Dispensar: ${a.titulo}`" @click="dispensarAviso(a.id)"><X :size="14" :stroke-width="2" /></button>
          </li>
        </ul>
        <p v-else class="vazio"><CheckCheck :size="20" :stroke-width="1.8" /> Tudo em dia. Nenhum aviso agora.</p>
        <div class="atalhos">
          <button type="button" class="atalho" @click="irPara('/mais/perfil')"><span class="ic"><UserRound :size="18" :stroke-width="1.9" /></span><b>Perfil</b><ChevronRight :size="18" :stroke-width="1.8" class="seta" /></button>
          <button type="button" class="atalho" @click="irPara('/mais')"><span class="ic"><Settings :size="18" :stroke-width="1.9" /></span><b>Configurações</b><ChevronRight :size="18" :stroke-width="1.8" class="seta" /></button>
        </div>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.topo-app { display: flex; align-items: center; justify-content: space-between; min-height: 44px; margin-bottom: 4px; position: relative; z-index: 20; }
.lado-esq { display: inline-flex; align-items: center; min-width: 44px; min-height: 44px; }
.marca-topo { pointer-events: none; }
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
.botao-foto { position: relative; width: 44px; height: 44px; padding: 0; border: none; background: none; border-radius: 50%; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; -webkit-tap-highlight-color: transparent; }
.botao-foto .anel { display: inline-flex; border-radius: 50%; padding: 0; }
.botao-foto.com .anel { padding: 2px; background: linear-gradient(135deg, #5e18d8, #1597a8); box-shadow: 0 0 0 1px var(--cor-fundo) inset; }
.botao-foto.com .anel :deep(.avatar-mini) { box-shadow: 0 0 0 2px var(--cor-fundo); }
.botao-foto:focus-visible { outline: 2px solid var(--cor-primaria); outline-offset: 2px; }
.botao-foto .selo { top: 0; right: 0; background: linear-gradient(135deg, #5e18d8, #1597a8); }
.folha { display: flex; flex-direction: column; gap: 8px; }
.folha h3 { margin: 0 4px; font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--cor-texto-suave); }
.atalhos { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; padding-top: 10px; border-top: 1px solid var(--cor-borda); }
.atalho { display: flex; align-items: center; gap: 12px; min-height: 52px; padding: 6px 8px; border: none; border-radius: 12px; background: none; color: var(--cor-texto); font: 600 15px var(--fonte-texto); cursor: pointer; text-align: left; }
.atalho:hover { background: var(--cor-realce); }
.atalho .ic { background: color-mix(in srgb, var(--cor-primaria) 12%, transparent); color: var(--cor-primaria); }
.atalho b { flex: 1; font-weight: 600; }
.atalho .seta { color: var(--cor-texto-suave); }
</style>
