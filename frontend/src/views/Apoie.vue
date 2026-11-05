<script setup>
// Apoie o desenvolvedor (05/11): texto institucional (config/apoio.js) + três opções de apoio com pagamento pelo SumUp.
// Cada opção abre o pagamento numa janela nova (pop-up no computador; no celular, uma aba nova do navegador).
import { computed } from 'vue';
import { Heart, Coffee, Wrench, Rocket, CreditCard } from 'lucide-vue-next';
import { TEXTO_INSTITUCIONAL } from '../config/apoio.js';
import AssinaturaAlt from '../components/AssinaturaAlt.vue';

const paragrafos = computed(() => String(TEXTO_INSTITUCIONAL || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean));
const OPCOES = [
  { id: 'cafe', icone: Coffee, titulo: 'Pagar um café', valor: 'R$ 10,00', curto: 'R$ 10', rotulo: 'Um café', texto: 'Um cafezinho para dar aquele gás e manter o aplicativo atualizado.', botao: 'Contribuir R$ 10', url: 'https://pay.sumup.com/b2c/Q2HQ28OZ' },
  { id: 'manutencao', icone: Wrench, titulo: 'Apoiar a manutenção', valor: 'R$ 25,00', curto: 'R$ 25', rotulo: 'Manutenção', texto: 'Ajuda a cobrir os custos e manter o projeto funcionando sem anúncios.', botao: 'Contribuir R$ 25', url: 'https://pay.sumup.com/b2c/QARIAUIK', destaque: true },
  { id: 'impulso', icone: Rocket, titulo: 'Impulsionar o projeto', valor: 'R$ 50,00', curto: 'R$ 50', rotulo: 'Impulso', texto: 'Um super apoio para garantir a evolução e a independência do aplicativo.', botao: 'Contribuir R$ 50', url: 'https://pay.sumup.com/b2c/Q5VMUXWE' },
];
function abrir(o, ev) {
  // pop-up centralizado no computador; se o navegador bloquear (ou no celular), o link segue numa aba nova
  if (window.matchMedia('(min-width: 769px)').matches) {
    const L = 480; const A = 760;
    const x = Math.max(0, Math.round((window.screen.width - L) / 2)); const y = Math.max(0, Math.round((window.screen.height - A) / 2));
    const w = window.open(o.url, `apoio-${o.id}`, `popup=yes,width=${L},height=${A},left=${x},top=${y}`);
    if (w) { try { w.opener = null; } catch { /* ok */ } ev.preventDefault(); } // aberto no pop-up; bloqueado → segue o link
  }
}
</script>

<template>
  <div class="pagina">
    <h1 class="titulo-pagina">Apoie o desenvolvedor</h1>

    <header class="intro">
      <span class="coracao"><Heart :size="26" :stroke-width="1.8" /></span>
      <p v-for="(p, i) in paragrafos" :key="i">{{ p }}</p>
    </header>

    <!-- Cada meio de apoio é um bloco; hoje só o link de pagamento (outros meios entram como novos blocos aqui) -->
    <section class="meio" aria-labelledby="t-link" data-opcoes-apoio>
      <header class="meio-topo">
        <span class="ic" aria-hidden="true"><CreditCard :size="18" :stroke-width="1.9" /></span>
        <div><h2 id="t-link">Link de pagamento</h2><p>Cartão ou Pix, no site seguro da SumUp.</p></div>
      </header>
      <div class="botoes">
        <a v-for="o in OPCOES" :key="o.id" class="botao" :class="{ destaque: o.destaque }" :href="o.url" target="_blank" rel="noopener noreferrer"
          :data-apoio="o.id" :title="o.titulo + ': ' + o.texto" :aria-label="o.titulo + ', ' + o.valor" @click="abrir(o, $event)">
          <component :is="o.icone" :size="20" :stroke-width="1.8" aria-hidden="true" />
          <b>{{ o.curto }}</b>
          <span>{{ o.rotulo }}</span>
        </a>
      </div>
    </section>

    <AssinaturaAlt />
  </div>
</template>

<style scoped>
.pagina { padding: 0 0 var(--espaco-fim); max-width: 640px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--espaco-secao); }
.titulo-pagina { font-family: var(--fonte-display); font-size: 22px; margin: 0; text-align: center; }
.intro { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; padding: 4px 8px; }
.intro p { margin: 0; font-size: 14.5px; line-height: 1.55; color: var(--cor-texto); }
.coracao { width: 52px; height: 52px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #5e18d8, #1597a8); color: #fff; }
.meio { display: flex; flex-direction: column; gap: 14px; padding: 16px; border-radius: var(--raio-card, 16px); background: var(--cor-card); border: 1px solid var(--cor-card-borda, var(--cor-borda)); }
.meio-topo { display: flex; align-items: center; gap: 12px; }
.meio-topo h2 { margin: 0; font: 600 16px var(--fonte-display); }
.meio-topo p { margin: 2px 0 0; font-size: 13px; color: var(--cor-texto-suave); }
.ic { flex: none; width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; color: #fff; background: linear-gradient(135deg, #5e18d8, #1597a8); }
.botoes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.botao { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; min-height: 84px; padding: 10px 6px; border-radius: 14px; text-decoration: none; text-align: center;
  color: var(--cor-texto); background: color-mix(in srgb, #5e18d8 10%, var(--cor-card)); border: 1px solid color-mix(in srgb, #5e18d8 30%, var(--cor-borda)); transition: transform var(--anim-rapida, .15s), border-color var(--anim-rapida, .15s); }
.botao svg { color: #9b6bf0; }
.botao b { font: 700 17px var(--fonte-display); }
.botao span { font-size: 12px; color: var(--cor-texto-suave); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.botao.destaque { color: #fff; background: linear-gradient(135deg, #5e18d8, #1597a8); border-color: transparent; }
.botao.destaque svg, .botao.destaque span { color: rgba(255, 255, 255, .88); }
.botao:hover { border-color: #9b6bf0; }
.botao:active { transform: scale(.97); }
.botao:focus-visible { outline: 2px solid var(--cor-primaria); outline-offset: 2px; }
</style>
