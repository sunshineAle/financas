<script setup>
// Topo ÚNICO do app (anotações 35, 62 e 63): o AppLayout o coloca em TODAS as páginas; as telas não colocam título próprio.
//  - Celular: altura fixa (56px + área segura). À esquerda o logo "D" em todas as páginas (com "Dagda Capital" ao lado só no
//    Início, que não tem título); nas telas internas a seta "Voltar" ocupa o lugar do logo. Título centralizado na mesma linha.
//    À direita, sempre no mesmo lugar e tamanho, a FOTO do perfil.
//  - PC/web: à esquerda o título da página (com a seta "Voltar" antes, nas telas internas); à direita o olho (ocultar valores),
//    o botão de tema claro/escuro e a FOTO do perfil. O logo fica só no menu lateral.
// A foto unifica perfil + avisos: com aviso, anel no degradê da marca e número; ao clicar abre o PainelPerfil
// (folha no celular, painel lateral à direita no PC).
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ChevronLeft, Sun, Moon } from 'lucide-vue-next';
import AvatarMini from './AvatarMini.vue';
import MarcaDagda from './MarcaDagda.vue';
import BotaoOlho from './BotaoOlho.vue';
import PainelPerfil from './PainelPerfil.vue';
import { inicialDe } from '../services/perfil.js';
import { visiveis, carregarAvisos } from '../services/notificacoes.js';
import { ehCelular } from '../services/layout.js';
import { modoTema, definirTema } from '../services/tema.js';
import { voltarDaRota } from '../config/menu.js';
import { SECOES_PERFIL } from '../config/perfilSecoes.js';

const props = defineProps({ usuario: { type: Object, default: null } });
const router = useRouter();
const route = useRoute();
const folha = ref(false);
const inicial = computed(() => inicialDe(props.usuario));
const ehInicio = computed(() => route.name === 'dashboard');
const voltar = computed(() => voltarDaRota(route, ehCelular.value));
// Título da página: o mesmo texto no celular (centralizado) e no PC (à esquerda). Início no celular: sem título (logo + nome).
const tituloTopo = computed(() => {
  if (ehInicio.value) return ehCelular.value ? '' : 'Início';
  if (route.name === 'mais-secao') { const s = SECOES_PERFIL.find((x) => x.id === route.params.secao); return s ? s.rotulo : 'Perfil'; }
  if (route.name === 'mais') return ehCelular.value ? 'Mais' : 'Configurações';
  if (route.name === 'cartao-extrato') return 'Extrato do cartão';
  return (route.meta && route.meta.titulo) || '';
});
const qtd = computed(() => visiveis.value.length);
const rotuloFoto = computed(() => `Perfil e notificações${qtd.value ? `, ${qtd.value} ${qtd.value === 1 ? 'nova' : 'novas'}` : ''}`);

// Tema: claro <-> escuro (a partir do tema que está na tela, inclusive no automático).
const escuro = ref(document.documentElement.getAttribute('data-theme') !== 'light');
watch(modoTema, () => { escuro.value = document.documentElement.getAttribute('data-theme') !== 'light'; });
function alternarTema() { definirTema(escuro.value ? 'claro' : 'escuro'); escuro.value = !escuro.value; }

function abrirFolha() { folha.value = true; carregarAvisos(); }
watch(() => route.fullPath, () => { folha.value = false; });
onMounted(() => { carregarAvisos(); });
</script>

<template>
  <header class="topo-app" :class="{ celular: ehCelular }" data-topo-app>
    <!-- Lado esquerdo: seta Voltar (telas internas) ou, no celular, o logo "D" (com o nome só no Início) -->
    <span v-if="ehCelular || voltar" class="lado-esq" data-topo-esq>
      <button v-if="voltar" type="button" class="voltar" aria-label="Voltar" title="Voltar" data-topo-voltar @click="router.push(voltar)">
        <ChevronLeft :size="24" :stroke-width="2" />
      </button>
      <template v-else>
        <MarcaDagda class="marca-topo" :tamanho="34" />
        <span v-if="ehInicio" class="nome-marca" data-topo-nome>Dagda Capital</span>
      </template>
    </span>

    <!-- Título: centralizado no celular, à esquerda no PC -->
    <div v-if="tituloTopo" class="titulo-linha">
      <span class="titulo-caixa">
        <h1 class="titulo-topo" data-titulo-topo>{{ tituloTopo }}</h1>
      </span>
    </div>

    <div class="lado-dir">
      <template v-if="!ehCelular">
        <BotaoOlho :tamanho="44" />
        <button type="button" class="botao-icone" :aria-label="escuro ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'" :title="escuro ? 'Tema claro' : 'Tema escuro'" data-topo-tema @click="alternarTema">
          <Sun v-if="escuro" :size="20" :stroke-width="1.8" />
          <Moon v-else :size="20" :stroke-width="1.8" />
        </button>
      </template>
      <button type="button" class="botao-foto" :class="{ com: qtd > 0 }" :aria-label="rotuloFoto" aria-haspopup="dialog" :aria-expanded="folha" data-foto-perfil @click="abrirFolha">
        <span class="anel"><AvatarMini :inicial="inicial" :tamanho="qtd ? 34 : 38" /></span>
        <span v-if="qtd" class="selo">{{ qtd > 9 ? '9+' : qtd }}</span>
      </button>
    </div>

    <PainelPerfil :aberto="folha" :usuario="usuario" @fechar="folha = false" />
  </header>
</template>

<style scoped>
/* Uma linha só, com altura fixa: celular 56px + área segura; PC 64px. Mesma distância até o conteúdo em todas as páginas. */
.topo-app { position: relative; z-index: 20; display: flex; align-items: center; gap: 12px; height: 64px; margin-bottom: var(--espaco-secao); }
.topo-app.celular { height: calc(56px + env(safe-area-inset-top, 0px)); padding-top: env(safe-area-inset-top, 0px); gap: 0; justify-content: space-between; }
.lado-esq { display: inline-flex; align-items: center; gap: 8px; min-width: 44px; height: 44px; flex: none; }
.marca-topo { pointer-events: none; }
.nome-marca { font-family: var(--fonte-display); font-size: 16px; font-weight: 600; letter-spacing: 0.01em; color: var(--cor-texto); white-space: nowrap; }
.voltar { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; padding: 0; margin-left: -6px; border: none; border-radius: 50%; background: none; color: var(--cor-texto); cursor: pointer; -webkit-tap-highlight-color: transparent; transition: background var(--anim-rapida) ease; }
.voltar:hover, .voltar:active { background: var(--cor-realce); }
.titulo-linha { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; }
.titulo-caixa { display: inline-flex; align-items: center; gap: 2px; min-width: 0; max-width: 100%; }
.titulo-topo { margin: 0; flex: 0 1 auto; min-width: 0; font-family: var(--fonte-display); font-size: 20px; font-weight: 600; letter-spacing: 0.01em; color: var(--cor-texto); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Celular: título centralizado na linha, entre o logo/voltar e a foto */
.celular .titulo-linha { position: absolute; left: 60px; right: 60px; top: calc(env(safe-area-inset-top, 0px) + 28px); transform: translateY(-50%); justify-content: center; pointer-events: none; }
.celular .titulo-caixa { position: relative; }
.celular .titulo-topo { text-align: center; font-size: 16px; }
.lado-dir { display: flex; align-items: center; gap: 4px; margin-left: auto; flex: none; }
.botao-icone { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; padding: 0; border-radius: 50%; border: none; background: none; cursor: pointer; color: var(--cor-texto-suave); transition: background var(--anim-rapida) ease, color var(--anim-rapida) ease; }
.botao-icone:hover { background: var(--cor-realce); color: var(--cor-texto); }
.botao-icone:focus-visible, .voltar:focus-visible { outline: 2px solid var(--cor-primaria); outline-offset: 2px; }
.selo { position: absolute; min-width: 17px; height: 17px; padding: 0 4px; border-radius: 99px; color: var(--cor-sobre-cor); font-size: 10.5px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 0 0 2px var(--cor-fundo); }
.botao-foto { position: relative; width: 44px; height: 44px; padding: 0; border: none; background: none; border-radius: 50%; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; -webkit-tap-highlight-color: transparent; }
.botao-foto .anel { display: inline-flex; border-radius: 50%; padding: 0; }
.botao-foto.com .anel { padding: 2px; background: linear-gradient(135deg, #5e18d8, #1597a8); box-shadow: 0 0 0 1px var(--cor-fundo) inset; }
.botao-foto.com .anel :deep(.avatar-mini) { box-shadow: 0 0 0 2px var(--cor-fundo); }
.botao-foto:focus-visible { outline: 2px solid var(--cor-primaria); outline-offset: 2px; }
.botao-foto .selo { top: 0; right: 0; background: linear-gradient(135deg, #5e18d8, #1597a8); }
</style>
