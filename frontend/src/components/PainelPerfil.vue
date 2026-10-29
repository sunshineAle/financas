<script setup>
// Painel do perfil (anotação 62): o mesmo conteúdo no celular e no PC/web, aberto pela FOTO do perfil no topo.
//  - Celular: folha que sobe da base (Modal).  - PC/web: painel lateral à DIREITA, por cima da página.
// Conteúdo: topo (foto, nome e "Perfil" para editar) · avisos, quando houver · atalhos em cartões
// (Custo de vida, Quanto guardar, Regras de categorização, Início do mês financeiro) · lista (Minhas finanças, Dados e backup,
// Segurança, Aparência e avisos, Sobre o app, Apoie o desenvolvedor) · rodapé: Bloquear agora.
// Com "ocultar valores" ligado, os valores em R$ dos avisos ficam escondidos.
import { ref, computed, watch, nextTick, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  X, CalendarClock, TriangleAlert, Info, ChevronRight, Pencil, PiggyBank, Wand2, CalendarDays,
  Wallet, DatabaseBackup, ShieldCheck, SlidersHorizontal, Heart, Lock,
} from 'lucide-vue-next';
import AvatarMini from './AvatarMini.vue';
import Modal from './Modal.vue';
import { ocultar, MASCARA } from '../services/privacidade.js';
import { inicialDe, nomeExibido } from '../services/perfil.js';
import { visiveis, dispensarAviso } from '../services/notificacoes.js';
import { ehCelular } from '../services/layout.js';
import { bloquear, modoPWA } from '../services/acesso.js';

const props = defineProps({ aberto: { type: Boolean, default: false }, usuario: { type: Object, default: null } });
const emit = defineEmits(['fechar']);
const router = useRouter();
const nome = computed(() => nomeExibido(props.usuario) || 'Perfil');
const inicial = computed(() => inicialDe(props.usuario));
const qtd = computed(() => visiveis.value.length);
const ICONE = { saida: TriangleAlert, alerta: CalendarClock, info: Info };
const VALOR = /[-−]?\s?R\$\s?[-−]?[\d.]+(,\d{2})?/g;
const semValor = (t) => (ocultar.value ? String(t || '').replace(VALOR, MASCARA) : t);

const ATALHOS = [
  { rotulo: 'Custo de vida', rota: '/custos-fixos', icone: CalendarClock },
  { rotulo: 'Quanto guardar', rota: '/mais/reserva', icone: PiggyBank },
  { rotulo: 'Regras de categorização', rota: '/regras', icone: Wand2 },
  { rotulo: 'Início do mês financeiro', rota: '/mais/financas', icone: CalendarDays },
];
const LISTA = [
  { rotulo: 'Minhas finanças', rota: '/mais/financas', icone: Wallet },
  { rotulo: 'Dados e backup', rota: '/mais/dados-backup', icone: DatabaseBackup },
  { rotulo: 'Segurança', rota: '/mais/seguranca', icone: ShieldCheck },
  { rotulo: 'Aparência e avisos', rota: '/mais/configuracoes', icone: SlidersHorizontal },
  { rotulo: 'Sobre o app', rota: '/mais/sobre', icone: Info },
  { rotulo: 'Apoie o desenvolvedor', rota: '/apoie', icone: Heart },
];

function ir(rota) { emit('fechar'); router.push(rota); }
async function bloquearAgora() {
  emit('fechar');
  if (modoPWA) { bloquear(); return; }
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
  router.push('/login');
}

// PC: painel lateral. Esc fecha; o foco entra no painel e volta para a foto ao fechar.
const caixa = ref(null);
let anterior = null;
function aoTeclar(e) { if (e.key === 'Escape') emit('fechar'); }
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
      <div class="atalhos">
        <button v-for="a in ATALHOS" :key="a.rotulo" type="button" class="cartao" @click="ir(a.rota)">
          <span class="ic"><component :is="a.icone" :size="18" :stroke-width="1.9" /></span><b>{{ a.rotulo }}</b>
        </button>
      </div>
      <div class="lista">
        <button v-for="i in LISTA" :key="i.rotulo" type="button" class="linha" @click="ir(i.rota)">
          <span class="ic"><component :is="i.icone" :size="18" :stroke-width="1.9" /></span><b>{{ i.rotulo }}</b><ChevronRight :size="18" :stroke-width="1.8" class="seta" />
        </button>
      </div>
    </div>
    <template #rodape>
      <button type="button" class="bloquear" @click="bloquearAgora"><Lock :size="17" :stroke-width="1.9" aria-hidden="true" />Bloquear agora</button>
    </template>
  </Modal>

  <Teleport v-else to="body">
    <transition name="painel">
      <div v-if="aberto" class="fundo-painel" @pointerdown.self="emit('fechar')">
        <aside ref="caixa" class="lateral" role="dialog" aria-modal="true" :aria-label="`Perfil: ${nome}`" data-painel-caixa>
          <div class="painel" data-painel-perfil>
            <div class="cab">
              <AvatarMini :inicial="inicial" :tamanho="52" />
              <span class="cab-nome">{{ nome }}</span>
              <button type="button" class="editar" @click="ir('/mais/perfil')"><Pencil :size="15" :stroke-width="2" aria-hidden="true" />Perfil</button>
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
            <div class="atalhos">
              <button v-for="a in ATALHOS" :key="a.rotulo" type="button" class="cartao" @click="ir(a.rota)">
                <span class="ic"><component :is="a.icone" :size="18" :stroke-width="1.9" /></span><b>{{ a.rotulo }}</b>
              </button>
            </div>
            <div class="lista">
              <button v-for="i in LISTA" :key="i.rotulo" type="button" class="linha" @click="ir(i.rota)">
                <span class="ic"><component :is="i.icone" :size="18" :stroke-width="1.9" /></span><b>{{ i.rotulo }}</b><ChevronRight :size="18" :stroke-width="1.8" class="seta" />
              </button>
            </div>
          </div>
          <footer class="rodape-painel">
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
.fundo-painel { position: fixed; inset: 0; z-index: 900; background: rgba(8, 6, 20, 0.32); }
.lateral { position: absolute; top: 0; right: 0; bottom: 0; width: min(380px, 100vw); display: flex; flex-direction: column; background: var(--cor-fundo-elevado); border-left: 1px solid var(--cor-borda); box-shadow: -18px 0 40px -20px rgba(0, 0, 0, 0.5); }
.lateral .painel { flex: 1; overflow-y: auto; padding: 18px 18px 12px; }
.rodape-painel { padding: 12px 18px 18px; border-top: 1px solid var(--cor-borda); }
.painel-enter-active, .painel-leave-active { transition: opacity var(--anim-padrao) ease; }
.painel-enter-active .lateral, .painel-leave-active .lateral { transition: transform var(--anim-padrao) var(--anim-curva); }
.painel-enter-from, .painel-leave-to { opacity: 0; }
.painel-enter-from .lateral, .painel-leave-to .lateral { transform: translateX(24px); }
</style>
