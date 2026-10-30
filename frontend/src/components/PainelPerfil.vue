<script setup>
// Painel do perfil, aberto pela FOTO no topo (anotação 62; homologação 1.0, seções 13 e 21).
//  - Celular: folha que sobe da base; cada item da lista abre a página dele (como antes).
//  - PC/web: painel FLUTUANTE ancorado na foto (canto superior direito, não centralizado). Ao escolher um item da lista,
//    o conteúdo troca DENTRO do painel, com seta de voltar — nunca abre página inteira com laterais vazias.
// Conteúdo: topo (foto, nome, Perfil) · avisos · PerfilConteudo (atalhos em blocos + Início do mês · Tema e Animações ·
// lista) · rodapé Bloquear agora. Com "ocultar valores" ligado, os valores em R$ dos avisos ficam escondidos.
import { ref, computed, watch, nextTick, onUnmounted, defineAsyncComponent } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { X, CalendarClock, TriangleAlert, Info, Pencil, Lock, ArrowLeft, ChevronRight } from 'lucide-vue-next';
import AvatarMini from './AvatarMini.vue';
import Modal from './Modal.vue';
import PerfilConteudo from './PerfilConteudo.vue';
import { ocultar, MASCARA } from '../services/privacidade.js';
import { inicialDe, nomeExibido } from '../services/perfil.js';
import { visiveis, dispensarAviso } from '../services/notificacoes.js';
import { ehCelular } from '../services/layout.js';
import { bloquear, modoPWA } from '../services/acesso.js';

const Perfil = defineAsyncComponent(() => import('../views/Perfil.vue'));
const Apoie = defineAsyncComponent(() => import('../views/Apoie.vue'));

const props = defineProps({ aberto: { type: Boolean, default: false }, usuario: { type: Object, default: null } });
const emit = defineEmits(['fechar']);
const router = useRouter();
const route = useRoute();
const nome = computed(() => nomeExibido(props.usuario) || 'Perfil');
const inicial = computed(() => inicialDe(props.usuario));
const qtd = computed(() => visiveis.value.length);
const ICONE = { saida: TriangleAlert, alerta: CalendarClock, info: Info };
const VALOR = /[-−]?\s?R\$\s?[-−]?[\d.]+(,\d{2})?/g;
const semValor = (t) => (ocultar.value ? String(t || '').replace(VALOR, MASCARA) : t);
const TITULOS = { 'dados-backup': 'Dados e backup', notificacoes: 'Avisos e notificações', seguranca: 'Segurança', sobre: 'Sobre o app', apoie: 'Apoie o desenvolvedor', perfil: 'Perfil' };

// PC: a vista atual do painel (null = início do painel)
const vista = ref(null);
watch(() => props.aberto, (v) => { if (!v) vista.value = null; });
watch(() => route.fullPath, () => { if (props.aberto) emit('fechar'); });

function ir(rota) { emit('fechar'); router.push(rota); }
function abrir(id) {
  if (ehCelular.value) { ir(id === 'apoie' ? '/apoie' : '/mais/' + id); return; }
  vista.value = id;
  nextTick(() => caixa.value?.querySelector('.corpo-painel')?.scrollTo({ top: 0 }));
}
async function bloquearAgora() {
  emit('fechar');
  if (modoPWA) { bloquear(); return; }
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
  router.push('/login');
}

// PC: Esc volta (dentro de uma vista) ou fecha; o foco entra no painel e volta para a foto ao fechar.
const caixa = ref(null);
let anterior = null;
function aoTeclar(e) { if (e.key === 'Escape') { if (vista.value) vista.value = null; else emit('fechar'); } }
watch(() => props.aberto && !ehCelular.value, async (v) => {
  if (v) {
    anterior = document.activeElement;
    window.addEventListener('keydown', aoTeclar);
    await nextTick();
    caixa.value?.querySelector('button')?.focus({ preventScroll: true });
  } else {
    window.removeEventListener('keydown', aoTeclar);
    if (anterior && anterior.focus) anterior.focus({ preventScroll: true });
    anterior = null;
  }
});
onUnmounted(() => window.removeEventListener('keydown', aoTeclar));
</script>

<template>
  <Modal v-if="ehCelular" :aberto="aberto" titulo="Sua conta" @fechar="emit('fechar')">
    <div class="painel" data-painel-perfil data-painel-caixa>
      <div class="cab">
        <AvatarMini :inicial="inicial" :tamanho="48" />
        <span class="cab-nome">{{ nome }}</span>
        <button type="button" class="editar" @click="ir('/mais/perfil')"><Pencil :size="15" :stroke-width="2" aria-hidden="true" />Perfil</button>
      </div>
      <template v-if="qtd">
        <h3>Avisos</h3>
        <ul class="avisos">
          <li v-for="a in visiveis" :key="a.id" :class="a.tom">
            <button type="button" class="aviso" @click="ir(a.rota)">
              <span class="ic"><component :is="ICONE[a.tom] || Info" :size="17" :stroke-width="1.9" /></span>
              <span class="tx"><b>{{ semValor(a.titulo) }}</b><small>{{ semValor(a.detalhe) }}</small></span>
            </button>
            <button type="button" class="dispensar" :aria-label="`Dispensar: ${a.titulo}`" @click="dispensarAviso(a.id)"><X :size="14" :stroke-width="2" /></button>
          </li>
        </ul>
      </template>
      <!-- 30/10: no celular a foto mostra só o nome e os avisos; o menu completo fica na tela Mais -->
      <p v-if="!qtd" class="sem-avisos">Nenhum aviso agora.</p>
      <button type="button" class="menu-completo" data-menu-completo @click="ir('/mais')">Abrir o menu completo<ChevronRight :size="18" :stroke-width="1.8" /></button>
    </div>
    <template #rodape>
      <button type="button" class="bloquear" @click="bloquearAgora"><Lock :size="17" :stroke-width="1.9" aria-hidden="true" />Bloquear agora</button>
    </template>
  </Modal>

  <Teleport v-else to="body">
    <transition name="painel">
      <div v-if="aberto" class="fundo-painel" @pointerdown.self="emit('fechar')">
        <aside ref="caixa" class="flutuante" role="dialog" aria-modal="true" :aria-label="vista ? TITULOS[vista] : `Perfil: ${nome}`" data-painel-caixa>
          <div class="corpo-painel">
            <template v-if="!vista">
              <div class="painel" data-painel-perfil>
                <div class="cab">
                  <AvatarMini :inicial="inicial" :tamanho="48" />
                  <span class="cab-nome">{{ nome }}</span>
                  <button type="button" class="editar" @click="abrir('perfil')"><Pencil :size="15" :stroke-width="2" aria-hidden="true" />Perfil</button>
                  <button type="button" class="fechar" aria-label="Fechar painel" @click="emit('fechar')"><X :size="18" :stroke-width="2" /></button>
                </div>
                <template v-if="qtd">
                  <h3>Avisos</h3>
                  <ul class="avisos">
                    <li v-for="a in visiveis" :key="a.id" :class="a.tom">
                      <button type="button" class="aviso" @click="ir(a.rota)">
                        <span class="ic"><component :is="ICONE[a.tom] || Info" :size="17" :stroke-width="1.9" /></span>
                        <span class="tx"><b>{{ semValor(a.titulo) }}</b><small>{{ semValor(a.detalhe) }}</small></span>
                      </button>
                      <button type="button" class="dispensar" :aria-label="`Dispensar: ${a.titulo}`" @click="dispensarAviso(a.id)"><X :size="14" :stroke-width="2" /></button>
                    </li>
                  </ul>
                </template>
                <PerfilConteudo @ir="ir" @abrir="abrir" />
              </div>
            </template>
            <template v-else>
              <div class="cab-vista">
                <button type="button" class="voltar" aria-label="Voltar ao painel" data-voltar-painel @click="vista = null"><ArrowLeft :size="18" :stroke-width="2" /></button>
                <b>{{ TITULOS[vista] }}</b>
                <button type="button" class="fechar" aria-label="Fechar painel" @click="emit('fechar')"><X :size="18" :stroke-width="2" /></button>
              </div>
              <div class="vista" :data-vista-painel="vista">
                <Apoie v-if="vista === 'apoie'" />
                <Perfil v-else :secao-fixa="vista" embutido />
              </div>
            </template>
          </div>
          <footer v-if="!vista" class="rodape-painel">
            <button type="button" class="bloquear" @click="bloquearAgora"><Lock :size="17" :stroke-width="1.9" aria-hidden="true" />Bloquear agora</button>
          </footer>
        </aside>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.painel { display: flex; flex-direction: column; gap: var(--espaco-secao, 12px); font-family: var(--fonte-texto); color: var(--cor-texto); }
.cab { display: flex; align-items: center; gap: 12px; }
.cab-nome { flex: 1; min-width: 0; font-family: var(--fonte-display); font-size: 17px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.editar { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 14px; border-radius: 99px; border: 1px solid var(--cor-borda); background: none; color: var(--cor-texto); font: 600 13px var(--fonte-texto); cursor: pointer; }
.editar:hover { background: var(--cor-realce); }
h3 { margin: 4px 4px -4px; font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--cor-texto-suave); }
ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
li { display: flex; align-items: center; border-radius: 12px; }
li:hover { background: var(--cor-realce); }
.aviso { flex: 1; min-width: 0; min-height: 52px; display: flex; align-items: center; gap: 12px; padding: 6px 6px 6px 8px; background: none; border: none; text-align: left; color: var(--cor-texto); font-family: var(--fonte-texto); cursor: pointer; }
.ic { width: 34px; height: 34px; border-radius: 11px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; background: color-mix(in srgb, var(--cor-primaria) 12%, transparent); color: var(--cor-primaria); }
li .ic { background: var(--cor-realce); color: var(--cor-texto-suave); }
li.saida .ic { background: var(--cor-saida-fundo); color: var(--cor-saida); }
li.alerta .ic { background: color-mix(in srgb, var(--cor-alerta) 18%, transparent); color: var(--cor-alerta); }
li.info .ic { background: var(--cor-entrada-fundo); color: var(--cor-primaria); }
.tx { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.tx b { font-size: 13.5px; font-weight: 600; }
.tx small { font-size: 12px; color: var(--cor-texto-suave); }
.dispensar, .fechar { width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; border: none; background: none; color: var(--cor-texto-suave); cursor: pointer; flex-shrink: 0; }
.dispensar:hover, .fechar:hover { background: var(--cor-realce); color: var(--cor-texto); }
.vazio { margin: 0; padding: 4px 4px; display: flex; align-items: center; gap: 8px; color: var(--cor-texto-suave); font-size: 13px; }
.atalhos { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.cartao { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; min-height: 92px; padding: 12px; border-radius: var(--raio-card, 16px); border: 1px solid var(--cor-card-borda, var(--cor-borda)); background: var(--cor-card, var(--cor-fundo-elevado)); color: var(--cor-texto); font: 600 13.5px/1.25 var(--fonte-texto); text-align: left; cursor: pointer; transition: background var(--anim-rapida) ease; }
.cartao:hover { background: var(--cor-realce); }
.cartao b { font-weight: 600; }
.lista { display: flex; flex-direction: column; gap: 2px; padding-top: 6px; border-top: 1px solid var(--cor-borda); }
.linha { display: flex; align-items: center; gap: 12px; min-height: 50px; padding: 6px 8px; border: none; border-radius: 12px; background: none; color: var(--cor-texto); font: 600 14.5px var(--fonte-texto); cursor: pointer; text-align: left; }
.linha:hover { background: var(--cor-realce); }
.linha b { flex: 1; font-weight: 600; }
.seta { color: var(--cor-texto-suave); }
.bloquear { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 46px; width: 100%; border-radius: 12px; border: 1px solid var(--cor-borda); background: none; color: var(--cor-saida-texto, var(--cor-saida)); font: 600 14px var(--fonte-texto); cursor: pointer; }
.bloquear:hover { background: var(--cor-saida-fundo); }
:is(button):focus-visible { outline: 2px solid var(--cor-primaria); outline-offset: 2px; }

/* PC/web: painel lateral à direita, por cima da página */
.fundo-painel { position: fixed; inset: 0; z-index: 900; background: rgba(8, 6, 20, 0.18); }
.sem-avisos { margin: 0; font-size: 13px; color: var(--cor-texto-suave); }
.menu-completo { display: flex; align-items: center; justify-content: space-between; min-height: 50px; padding: 0 12px; border-radius: 12px; border: 1px solid var(--cor-borda); background: none; color: var(--cor-texto); font: 600 14.5px var(--fonte-texto); cursor: pointer; }
.menu-completo:hover { background: var(--cor-realce); }
.flutuante { position: absolute; top: 60px; right: 14px; width: min(360px, calc(100vw - 28px)); max-height: calc(100vh - 76px); display: flex; flex-direction: column; background: var(--cor-fundo-elevado); border: 1px solid var(--cor-borda); border-radius: 20px; box-shadow: 0 24px 60px -24px rgba(0, 0, 0, 0.6); overflow: hidden; transform-origin: top right; }
/* setinha apontando para a foto */
.flutuante::before { content: ''; position: absolute; top: -6px; right: 22px; width: 12px; height: 12px; background: var(--cor-fundo-elevado); border-left: 1px solid var(--cor-borda); border-top: 1px solid var(--cor-borda); transform: rotate(45deg); }
.corpo-painel { flex: 1; overflow-y: auto; padding: 16px 16px 10px; overscroll-behavior: contain; }
.cab-vista { position: sticky; top: -16px; z-index: 2; display: flex; align-items: center; gap: 8px; margin: -16px -16px 8px; padding: 10px 12px; background: var(--cor-fundo-elevado); border-bottom: 1px solid var(--cor-borda); }
.cab-vista b { flex: 1; font-family: var(--fonte-display); font-size: 16px; }
.voltar { width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; border: none; background: var(--cor-realce); color: var(--cor-texto); cursor: pointer; }
.vista :deep(.pagina) { padding: 0; max-width: none; }
.vista :deep(.secao > h2) { display: none; }
.rodape-painel { padding: 12px 18px 18px; border-top: 1px solid var(--cor-borda); }
.painel-enter-active, .painel-leave-active { transition: opacity var(--anim-padrao) ease; }
.painel-enter-active .flutuante, .painel-leave-active .flutuante { transition: transform var(--anim-padrao) var(--anim-curva); }
.painel-enter-from, .painel-leave-to { opacity: 0; }
.painel-enter-from .flutuante, .painel-leave-to .flutuante { transform: scale(0.96) translateY(-6px); }
</style>
