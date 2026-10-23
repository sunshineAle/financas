<script setup>
// Apoie o desenvolvedor: texto institucional (config/apoio.js > TEXTO_INSTITUCIONAL) + formas de apoio:
// Pix (QR code e copia-e-cola), Apoia.se, Buy Me a Coffee e Ko-fi. Chave Pix e links vêm de config/apoio.js.
import { ref, computed, watch, onMounted } from 'vue';
import { Heart, Copy, Check, ExternalLink, QrCode, Coffee, HandCoins } from 'lucide-vue-next';
import CardPadrao from '../components/CardPadrao.vue';
import { APOIO, TEXTO_INSTITUCIONAL } from '../config/apoio.js';
import { payloadPix } from '../utils/pix.js';
import { avisar } from '../services/avisos.js';

const paragrafos = computed(() => String(TEXTO_INSTITUCIONAL || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean));

// Pix: o QR e o copia-e-cola usam o mesmo texto (BR Code); a chave sozinha também pode ser copiada.
const payload = computed(() => payloadPix({ chave: APOIO.pix.chave, nome: APOIO.pix.nome, cidade: APOIO.pix.cidade }));
const qrSvg = ref('');
async function gerarQr() {
  qrSvg.value = '';
  if (!payload.value) return;
  try {
    const QRCode = (await import('qrcode')).default;
    qrSvg.value = await QRCode.toString(payload.value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } });
  } catch { qrSvg.value = ''; }
}
onMounted(gerarQr);
watch(payload, gerarQr);

const copiado = ref('');
async function copiar(texto, qual) {
  try {
    await navigator.clipboard.writeText(texto);
    copiado.value = qual;
    setTimeout(() => { if (copiado.value === qual) copiado.value = ''; }, 2000);
  } catch { avisar('Não consegui copiar. Selecione o texto e copie manualmente.', { tipo: 'erro' }); }
}
const LINKS = [
  { id: 'apoiase', rotulo: 'Apoia.se', sub: 'apoio mensal recorrente', url: APOIO.apoiase, icone: HandCoins },
  { id: 'bmc', rotulo: 'Buy Me a Coffee', sub: 'apoio único pelo cartão', url: APOIO.buyMeACoffee, icone: Coffee },
  { id: 'kofi', rotulo: 'Ko-fi', sub: 'um cafezinho, sem assinatura', url: APOIO.kofi, icone: Heart },
];
</script>

<template>
  <div class="pagina">
    <h1 class="titulo-pagina">Apoie o desenvolvedor</h1>

    <header class="intro">
      <span class="coracao"><Heart :size="26" :stroke-width="1.8" /></span>
      <p v-for="(p, i) in paragrafos" :key="i">{{ p }}</p>
    </header>

    <CardPadrao titulo="Pix" subtitulo="sem taxas, na hora">
      <div v-if="APOIO.pix.chave" class="pix">
        <div class="qr" role="img" aria-label="QR code do Pix">
          <div v-if="qrSvg" class="qr-img" v-html="qrSvg"></div>
          <span v-else class="qr-vazio"><QrCode :size="28" :stroke-width="1.6" /></span>
        </div>
        <span class="texto"><b class="chave">{{ APOIO.pix.chave }}</b><small>{{ [APOIO.pix.tipo, APOIO.pix.nome].filter(Boolean).join(' · ') || 'Chave Pix' }}</small></span>
        <div class="botoes-copia">
          <button type="button" class="copiar" @click="copiar(payload, 'cola')"><component :is="copiado === 'cola' ? Check : Copy" :size="16" :stroke-width="2" /> {{ copiado === 'cola' ? 'Copiado' : 'Copia e cola' }}</button>
          <button type="button" class="copiar sec" @click="copiar(APOIO.pix.chave, 'chave')"><component :is="copiado === 'chave' ? Check : Copy" :size="16" :stroke-width="2" /> {{ copiado === 'chave' ? 'Copiada' : 'Só a chave' }}</button>
        </div>
        <p class="dica">Abra o app do seu banco, escolha Pix e leia o QR code ou use o copia e cola. Você digita o valor que quiser.</p>
      </div>
      <p v-else class="pendente">Chave Pix a preencher pelo desenvolvedor.</p>
    </CardPadrao>

    <CardPadrao titulo="Outras formas" subtitulo="escolha a que preferir">
      <div class="lista">
        <template v-for="l in LINKS" :key="l.id">
          <a v-if="l.url" class="linha" :href="l.url" target="_blank" rel="noopener noreferrer">
            <span class="quadro"><component :is="l.icone" :size="20" :stroke-width="1.8" /></span>
            <span class="texto"><b>{{ l.rotulo }}</b><small>{{ l.sub }}</small></span>
            <ExternalLink :size="18" :stroke-width="1.8" class="seta" />
          </a>
          <div v-else class="linha off">
            <span class="quadro"><component :is="l.icone" :size="20" :stroke-width="1.8" /></span>
            <span class="texto"><b>{{ l.rotulo }}</b><small>link a preencher pelo desenvolvedor</small></span>
          </div>
        </template>
      </div>
    </CardPadrao>
  </div>
</template>

<style scoped>
.pagina { padding: 8px 0 40px; max-width: 640px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
.titulo-pagina { font-family: var(--fonte-display); font-size: 22px; margin: 0; text-align: center; }
.intro { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; padding: 4px 8px; }
.intro p { margin: 0; font-size: 14.5px; line-height: 1.55; color: var(--cor-texto); }
.coracao { width: 52px; height: 52px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--cor-entrada-fundo); color: var(--cor-primaria); }
.linha { display: flex; align-items: center; gap: 14px; min-height: 56px; }
.pix { display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; }
.pix .texto { align-items: center; flex: none; max-width: 100%; }
.qr { width: 200px; height: 200px; padding: 8px; border-radius: 16px; background: #ffffff; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 1px var(--cor-borda); }
.qr-img { width: 100%; height: 100%; }
.qr-img :deep(svg) { width: 100%; height: 100%; display: block; }
.qr-vazio { color: #444; }
.botoes-copia { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
.copiar.sec { background: none; }
.dica { margin: 0; font-size: 12.5px; line-height: 1.45; color: var(--cor-texto-suave); max-width: 40ch; }
.lista { display: flex; flex-direction: column; gap: 4px; }
.linha { text-decoration: none; color: var(--cor-texto); border-radius: 12px; padding: 4px 6px; }
a.linha:hover, a.linha:active { background: var(--cor-realce); }
.linha.off { opacity: 0.6; }
.quadro { width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: var(--cor-entrada-fundo); color: var(--cor-primaria); flex-shrink: 0; }
.texto { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.texto b { font-size: 15px; font-weight: 600; }
.chave { overflow-wrap: anywhere; }
.texto small { font-size: 12.5px; color: var(--cor-texto-suave); }
.seta { color: var(--cor-texto-suave); flex-shrink: 0; }
.copiar { min-height: 44px; display: inline-flex; align-items: center; gap: 6px; padding: 0 14px; border-radius: 12px; border: 1px solid var(--cor-borda); background: none; color: var(--cor-texto); font-family: var(--fonte-texto); font-size: 14px; font-weight: 600; cursor: pointer; }
.pendente { margin: 0; font-size: 13.5px; color: var(--cor-texto-suave); }
</style>
