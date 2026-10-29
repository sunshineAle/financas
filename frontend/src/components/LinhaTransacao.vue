<script setup>
// Linha de transação única do app (anotação 53). Usada em Transações (Por data e Por categoria), Atividade recente do
// Início, extrato da conta, extrato do cartão e A revisar.
//   <LinhaTransacao :t="t" :info="info" menu @abrir="..." @menu="..." />
//   <LinhaTransacao :t="t" :info="info" @abrir="..."><template #menu><button>…</button></template></LinhaTransacao>
// t    = item no formato de /api/transacoes (descricao, valor com sinal, data, icone, conta_nome, conta_icone, conta_cor,
//        cartao, cartao_bandeira, meio, parcela_numero/total_parcelas, recorrente, a_revisar, revisao, tipo_mov, ignorada…).
//        Campo que não vier simplesmente não aparece (sem selo, sem pílula).
// info = { nome, cor, icone, neutra, tipoNeutro } — categoria da linha (utils/infoTransacao.js ou a regra da própria lista).
//
// Visual: ícone do item/categoria num círculo na cor da categoria + selo do banco/cartão no canto; linha 1 = descrição ·
// valor; linha 2 = data curta · pílula do meio de pagamento (com a bandeira) · categoria; embaixo do valor, discretos:
// parcela, recorrência e "a revisar". Valores de transação ficam sempre visíveis (o "olho" só esconde totais).
import { computed, useSlots } from 'vue';
import { Repeat, CircleAlert, Link2Off } from 'lucide-vue-next';
import IconeCategoria from './IconeCategoria.vue';
import IconeBanco from './IconeBanco.vue';
import IconeBandeira from './IconeBandeira.vue';
import MenuPontos from './MenuPontos.vue';
import { iconeDoItem } from '../utils/iconesCategoria.js';
import { reconhecerBanco, bancoPorSlug } from '../utils/catalogoBancos.js';
import { corPorNome } from '../utils/corBanco.js';

const props = defineProps({
  t: { type: Object, required: true },
  info: { type: Object, default: () => ({}) },
  menu: { type: Boolean, default: false }, // botão ⋮ que só emite 'menu' (a lista desenha o próprio menu)
  clicavel: { type: Boolean, default: true },
  selecionada: { type: Boolean, default: false },
  rotuloAbrir: { type: String, default: 'Ver detalhes' },
});
const emit = defineEmits(['abrir', 'menu']);
const slots = useSlots();

const moeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const MESES = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
const MEIOS = { credito: 'Crédito', crediario: 'Crediário', debito: 'Débito', pix: 'Pix', boleto: 'Boleto', dinheiro: 'Dinheiro', transferencia: 'Transferência' };
const BANDEIRAS = { mastercard: 'Mastercard', visa: 'Visa', elo: 'Elo', amex: 'Amex', hipercard: 'Hipercard' };

const ehSaida = computed(() => props.t.valor < 0);
const neutra = computed(() => !!props.info.neutra);
const classeValor = computed(() => (neutra.value ? 'neutro' : ehSaida.value ? 'negativo' : 'positivo'));
// Saldo inicial (anotação 55) é ponto de partida, não entrada nem saída: valor sem sinal.
const semSinal = computed(() => props.t.tipo_mov === 'saldo_inicial');
const valorTxt = computed(() => (semSinal.value ? moeda(props.t.valor) : `${props.t.valor > 0 ? '+' : props.t.valor < 0 ? '−' : ''} ${moeda(Math.abs(props.t.valor))}`.trim()));

// Ícone (anotação 37): item escolhido → item reconhecido pela descrição → categoria; cor sempre a da categoria.
const iconeValor = computed(() => {
  const n = props.info;
  if (n.neutra) {
    if (n.tipoNeutro === 'reserva') return props.t.valor > 0 ? 'cat-entrada-resgate' : 'cat-grupo-financas';
    return n.tipoNeutro === 'fatura' ? 'fatura-fechada' : 'transferir';
  }
  return props.t.icone || (ehSaida.value ? iconeDoItem(props.t.descricao_base || props.t.descricao, 'saida') : null) || n.icone || '';
});

// Descrição sem o "(1/3)" das compras parceladas: a parcela vai para a direita.
const totalParcelas = computed(() => Number(props.t.total_parcelas || 0));
const parcela = computed(() => {
  if (props.t.rotulo_parcela) return props.t.rotulo_parcela;
  if (totalParcelas.value > 1) {
    const n = props.t.parcela_numero || Number(String(props.t.descricao || '').match(/\((\d+)\/\d+\)\s*$/)?.[1]) || null;
    return n ? `${n}/${totalParcelas.value}` : `${totalParcelas.value}x`;
  }
  return '';
});
const descricao = computed(() => {
  const d = props.t.descricao_base || props.t.descricao || '';
  return parcela.value ? String(d).replace(/\s*\(\d+\/\d+\)\s*$/, '') : d;
});

const dataCurta = computed(() => {
  const [, m, d] = String(props.t.data || '').slice(0, 10).split('-').map(Number);
  return m && d ? `${d} ${MESES[m - 1]}` : '';
});

// Meio de pagamento (vem do backend em `meio`; compra no cartão sem `meio` = Crédito).
const meio = computed(() => props.t.meio || (props.t.cartao ? (props.t.cartao_tipo_credito === 'crediario' ? 'crediario' : 'credito') : ''));
const meioTxt = computed(() => MEIOS[meio.value] || '');
const bandeira = computed(() => (props.t.cartao ? String(props.t.cartao_bandeira || '').toLowerCase() : ''));
const bandeiraTxt = computed(() => BANDEIRAS[bandeira.value] || '');

// Selo: logo do banco/cartão de onde saiu (ou para onde entrou) o dinheiro; sem logo no catálogo = iniciais na cor da conta.
const EMOJIS_PADRAO = new Set(['', '🏦', '💳', '🏷️']);
const origemNome = computed(() => props.t.conta_nome || '');
const origemIcone = computed(() => props.t.conta_icone || '');
const temLogo = computed(() => {
  const ic = origemIcone.value;
  if (ic.startsWith('data:image/')) return true;
  if (ic.startsWith('banco:')) return !!bancoPorSlug(ic.slice(6));
  if (!EMOJIS_PADRAO.has(ic)) return true; // emoji escolhido pelo usuário
  const b = origemNome.value ? reconhecerBanco({ nome: origemNome.value }) : null;
  return !!(b && b.arquivos && (b.arquivos.iconeFundo || b.arquivos.icone));
});
const iniciais = computed(() => {
  const p = String(origemNome.value).normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^A-Za-z0-9]+/)
    .filter((x) => x && !/^(banco|bank|de|do|da|s|a|sa|conta|cartao|card)$/i.test(x));
  if (!p.length) return '';
  return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[1][0]).toUpperCase();
});
const corOrigem = computed(() => props.t.conta_cor || corPorNome(origemNome.value));
const temSelo = computed(() => !!origemNome.value && (temLogo.value || !!iniciais.value));
const rotuloSelo = computed(() => {
  const nome = origemNome.value;
  if (!nome) return '';
  if (props.t.cartao) return `pago com cartão ${nome}${bandeiraTxt.value ? ' ' + bandeiraTxt.value : ''}, ${(meioTxt.value || 'crédito').toLowerCase()}`;
  const base = ehSaida.value ? `saiu da conta ${nome}` : `entrou na conta ${nome}`;
  return meioTxt.value ? `${base}, ${meioTxt.value.toLowerCase()}` : base;
});

const sub = computed(() => props.t.subcategoria || '');
const chip = computed(() => {
  const t = props.t;
  if (t.ignorada === 1) return 'ignorada';
  if (t.tipo_mov === 'estornada') return 'estornada';
  if (/^estorno/.test(String(t.tipo_mov || ''))) return 'estorno';
  return '';
});
const naoVinculado = computed(() => props.t.revisao === 'recusado');
const temExtras = computed(() => !!(parcela.value || props.t.recorrente || props.t.a_revisar || naoVinculado.value));
const temMenu = computed(() => props.menu || !!slots.menu);

// Rótulo completo para leitor de tela (a linha é um botão: o leitor lê só este texto).
const rotuloLinha = computed(() => [
  descricao.value,
  valorTxt.value.replace('−', 'menos ').replace('+', 'mais '),
  dataCurta.value,
  rotuloSelo.value || meioTxt.value,
  props.info.nome ? `categoria ${props.info.nome}${sub.value ? ', ' + sub.value : ''}` : '',
  parcela.value ? `parcela ${parcela.value}` : '',
  props.t.recorrente ? 'recorrente' : '',
  props.t.a_revisar ? 'a revisar' : '',
  naoVinculado.value ? 'não vinculado' : '',
  chip.value,
  props.clicavel ? props.rotuloAbrir : '',
].filter(Boolean).join(', '));

function abrir() { if (props.clicavel) emit('abrir', props.t); }
</script>

<template>
  <div
    class="linha-tx"
    :class="{ clicavel, ignorada: t.ignorada === 1, 'fora-totais': t.ignorada === 2, selecionada, 'com-menu': temMenu, 'sem-extras': !temExtras }"
    :tabindex="clicavel ? 0 : null" :role="clicavel ? 'button' : 'group'" :aria-label="rotuloLinha" :aria-pressed="selecionada || null"
    @click="abrir" @keydown.enter.self="abrir" @keydown.space.self.prevent="abrir"
  >
    <span class="ic" aria-hidden="true">
      <IconeCategoria class="circulo" :valor="iconeValor" :tipo="ehSaida ? 'saida' : 'entrada'" :cor="neutra ? 'var(--cor-texto-suave)' : (info.cor || '')" :tamanho="40" />
      <span v-if="temSelo" class="selo" :class="{ iniciais: !temLogo }" :style="!temLogo ? { '--cor-selo': corOrigem } : null" role="img" :aria-label="rotuloSelo" :title="rotuloSelo">
        <IconeBanco v-if="temLogo" :icone="origemIcone" :nome="origemNome" :tamanho="18" :padrao="t.cartao ? '💳' : '🏦'" />
        <span v-else class="ini">{{ iniciais }}</span>
      </span>
    </span>

    <span class="desc">{{ descricao }}</span>
    <span class="valor numero-tabular" :class="classeValor">{{ valorTxt }}</span>

    <span class="meta">
      <span v-if="dataCurta" class="data">{{ dataCurta }}</span>
      <span v-if="meioTxt" class="pilula" :class="'m-' + meio">
        <IconeBandeira v-if="bandeira" :bandeira="bandeira" :tamanho="11" colorido />{{ meioTxt }}
      </span>
      <span v-if="chip" class="chip">{{ chip }}</span>
      <span v-if="info.nome" class="cat"><span class="ponto" aria-hidden="true">·</span>{{ info.nome }}<template v-if="sub"> › {{ sub }}</template></span>
    </span>

    <span v-if="temExtras" class="extras">
      <span v-if="parcela" class="parcela" :title="`Parcela ${parcela}`">{{ parcela }}</span>
      <span v-if="t.recorrente" class="ex-ic" role="img" aria-label="recorrente" title="Recorrente (custo fixo)"><Repeat :size="13" :stroke-width="2.2" aria-hidden="true" /></span>
      <span v-if="t.a_revisar" class="ex-ic revisar" role="img" aria-label="a revisar" title="A revisar"><CircleAlert :size="13" :stroke-width="2.2" aria-hidden="true" /></span>
      <span v-else-if="naoVinculado" class="ex-ic" role="img" aria-label="não vinculado" title="Guardado sem vínculo com meta"><Link2Off :size="13" :stroke-width="2.2" aria-hidden="true" /></span>
    </span>

    <span v-if="temMenu" class="mn" @click.stop @keydown.stop>
      <MenuPontos v-if="slots.menu" rotulo="Opções da transação"><slot name="menu" /></MenuPontos>
      <button v-else type="button" class="pontos" aria-label="Opções da transação" @click.stop="emit('menu', t, $event)">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" /></svg>
      </button>
    </span>
  </div>
</template>

<style scoped>
.linha-tx {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  grid-template-areas: 'ic desc valor' 'ic meta extras';
  column-gap: 10px; row-gap: 3px; align-items: center;
  min-height: 60px; padding: 9px 8px 9px 6px; border-radius: 14px;
  color: var(--cor-texto); -webkit-tap-highlight-color: transparent;
  transition: background var(--anim-rapida) ease;
}
.linha-tx.com-menu { grid-template-columns: 44px minmax(0, 1fr) auto 36px; grid-template-areas: 'ic desc valor mn' 'ic meta extras mn'; padding-right: 0; }
/* Sem parcela/ícones à direita, a linha de baixo usa também o espaço embaixo do valor (cabe a categoria no celular). */
.linha-tx.sem-extras { grid-template-areas: 'ic desc valor' 'ic meta meta'; }
.linha-tx.com-menu.sem-extras { grid-template-areas: 'ic desc valor mn' 'ic meta meta mn'; }
.linha-tx.clicavel { cursor: pointer; }
.linha-tx.clicavel:hover, .linha-tx:focus-visible { background: var(--cor-realce); outline: none; }
.linha-tx:focus-visible { box-shadow: inset 0 0 0 2px var(--cor-primaria); }
.linha-tx.selecionada { background: var(--cor-interface-selecao, var(--cor-realce)); }

/* Ícone em círculo + selo do banco/cartão no canto inferior direito */
.ic { grid-area: ic; position: relative; width: 44px; height: 44px; display: grid; place-items: center; align-self: center; }
.ic :deep(.circulo) { border-radius: 50% !important; }
.selo {
  position: absolute; right: -1px; bottom: -1px; width: 20px; height: 20px; border-radius: 50%; overflow: hidden;
  display: grid; place-items: center; background: var(--cor-card); box-shadow: 0 0 0 2px var(--cor-card);
}
.selo :deep(.icone-banco) { border-radius: 50% !important; }
.selo.iniciais { background: var(--cor-selo); }
.ini { font: 700 8px/1 var(--fonte-texto); letter-spacing: 0.02em; color: #fff; text-shadow: 0 0 2px rgb(0 0 0 / 0.35); }

.desc { grid-area: desc; min-width: 0; font-size: 15px; font-weight: 600; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.valor { grid-area: valor; justify-self: end; font-family: var(--fonte-display); font-weight: 600; font-size: 15px; line-height: 1.3; white-space: nowrap; text-align: right; }
.valor.positivo { color: var(--txt-entrada, var(--cor-entrada-texto, var(--cor-entrada))); }
.valor.negativo { color: var(--txt-saida, var(--cor-saida-texto, var(--cor-saida))); }
.valor.neutro { color: var(--cor-texto-suave); }

.meta { grid-area: meta; min-width: 0; display: flex; align-items: center; gap: 6px; font-size: 12px; line-height: 1.35; color: var(--cor-texto-suave); white-space: nowrap; overflow: hidden; }
.data { flex: none; }
.pilula {
  flex: none; display: inline-flex; align-items: center; gap: 4px; height: 18px; padding: 0 7px; border-radius: 999px;
  font-size: 10.5px; font-weight: 600; letter-spacing: 0.01em; color: var(--cor-texto); background: var(--cor-realce); border: 1px solid var(--cor-borda);
}
.pilula :deep(.icone-bandeira) { margin-left: -3px; }
.chip { flex: none; font-size: 10.5px; font-weight: 600; padding: 0 6px; height: 18px; display: inline-flex; align-items: center; border-radius: 999px; border: 1px dashed var(--cor-borda); }
.cat { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.cat .ponto { margin-right: 6px; }

.extras { grid-area: extras; justify-self: end; display: inline-flex; align-items: center; gap: 6px; color: var(--cor-texto-suave); font-size: 11px; font-weight: 600; white-space: nowrap; }
.parcela { font-variant-numeric: tabular-nums; }
.ex-ic { flex: none; display: inline-flex; }
.ex-ic.revisar { color: var(--cor-alerta-texto, var(--cor-alerta)); }

.mn { grid-area: mn; display: grid; place-items: center; width: 36px; height: 44px; align-self: center; }
.pontos {
  width: 36px; height: 44px; display: grid; place-items: center; padding: 0; border: none; background: transparent; color: var(--cor-texto-suave);
  border-radius: 12px; cursor: pointer; font-family: inherit;
}
.pontos:hover { background: var(--cor-realce); color: var(--cor-texto); }
.mn :deep(.botao-pontos) { width: 36px; height: 44px; }

.linha-tx.ignorada { opacity: 0.5; }
.linha-tx.ignorada .desc { text-decoration: line-through; }
.linha-tx.fora-totais .desc { color: var(--cor-texto-suave); }

@media (min-width: 769px) {
  .linha-tx { column-gap: 14px; padding-left: 10px; }
  .linha-tx.com-menu { grid-template-columns: 44px minmax(0, 1fr) auto 44px; }
  .mn, .pontos, .mn :deep(.botao-pontos) { width: 44px; }
}
</style>
