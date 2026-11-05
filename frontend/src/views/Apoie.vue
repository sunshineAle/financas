<script setup>
// Apoie o desenvolvedor (05/11): texto institucional (config/apoio.js) + três opções de apoio com pagamento pelo SumUp.
// Cada opção abre o pagamento numa janela nova (pop-up no computador; no celular, uma aba nova do navegador).
import { computed } from 'vue';
import { Heart, Coffee, Wrench, Rocket, ExternalLink } from 'lucide-vue-next';
import { TEXTO_INSTITUCIONAL } from '../config/apoio.js';
import AssinaturaAlt from '../components/AssinaturaAlt.vue';

const paragrafos = computed(() => String(TEXTO_INSTITUCIONAL || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean));
const OPCOES = [
  { id: 'cafe', icone: Coffee, titulo: 'Pagar um café', valor: 'R$ 10,00', texto: 'Um cafezinho para dar aquele gás e manter o aplicativo atualizado.', botao: 'Contribuir R$ 10', url: 'https://pay.sumup.com/b2c/Q2HQ28OZ' },
  { id: 'manutencao', icone: Wrench, titulo: 'Apoiar a manutenção', valor: 'R$ 25,00', texto: 'Ajuda a cobrir os custos e manter o projeto funcionando sem anúncios.', botao: 'Contribuir R$ 25', url: 'https://pay.sumup.com/b2c/QARIAUIK', destaque: true },
  { id: 'impulso', icone: Rocket, titulo: 'Impulsionar o projeto', valor: 'R$ 50,00', texto: 'Um super apoio para garantir a evolução e a independência do aplicativo.', botao: 'Contribuir R$ 50', url: 'https://pay.sumup.com/b2c/Q5VMUXWE' },
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

    <section class="opcoes" aria-labelledby="t-opcoes" data-opcoes-apoio>
      <h2 id="t-opcoes">Escolha uma opção de apoio</h2>
      <article v-for="o in OPCOES" :key="o.id" class="opcao" :class="{ destaque: o.destaque }">
        <span class="ic" aria-hidden="true"><component :is="o.icone" :size="22" :stroke-width="1.8" /></span>
        <div class="txt">
          <b>{{ o.titulo }} <span class="valor">{{ o.valor }}</span></b>
          <p>{{ o.texto }}</p>
        </div>
        <a class="botao" :href="o.url" target="_blank" rel="noopener noreferrer" :data-apoio="o.id" @click="abrir(o, $event)">{{ o.botao }}<ExternalLink :size="15" :stroke-width="2" /></a>
      </article>
      <p class="nota">O pagamento é feito no site seguro da SumUp (cartão ou Pix). O Dagda Capital não vê nem guarda os dados do pagamento.</p>
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
.opcoes { display: flex; flex-direction: column; gap: 10px; }
.opcoes h2 { margin: 0 2px; font: 600 16px var(--fonte-display); }
.opcao { display: grid; grid-template-columns: 46px minmax(0, 1fr); grid-template-areas: 'ic txt' 'ic bt'; gap: 8px 14px; padding: 16px; border-radius: var(--raio-card, 16px); background: var(--cor-card); border: 1px solid var(--cor-card-borda, var(--cor-borda)); position: relative; overflow: hidden; }
.opcao.destaque { border-color: color-mix(in srgb, #5e18d8 45%, var(--cor-borda)); }
.opcao.destaque::before { content: ''; position: absolute; inset: 0; pointer-events: none; background: radial-gradient(120% 80% at 0% 0%, color-mix(in srgb, #5e18d8 14%, transparent), transparent 60%); }
.opcao > * { position: relative; }
.ic { grid-area: ic; width: 46px; height: 46px; border-radius: 14px; display: grid; place-items: center; color: #fff; background: linear-gradient(135deg, #5e18d8, #1597a8); }
.txt { grid-area: txt; min-width: 0; }
.txt b { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; font: 600 16px var(--fonte-display); }
.valor { font: 600 13px var(--fonte-texto); color: var(--cor-entrada-texto, var(--cor-entrada)); }
.txt p { margin: 4px 0 0; font-size: 13.5px; line-height: 1.45; color: var(--cor-texto-suave); }
.botao { grid-area: bt; justify-self: start; display: inline-flex; align-items: center; gap: 6px; min-height: 42px; padding: 0 16px; border-radius: 12px; text-decoration: none; font: 600 14px var(--fonte-texto); color: #fff; background: linear-gradient(135deg, #5e18d8, #1597a8); }
.botao:focus-visible { outline: 2px solid var(--cor-primaria); outline-offset: 2px; }
.nota { margin: 2px 4px 0; font-size: 12.5px; color: var(--cor-texto-suave); line-height: 1.45; }
</style>
