<script setup>
// <CampoInstituicao v-model:nome="f.nome" v-model:icone="f.icone" v-model:cor="f.cor" tema="entrada" />
// Campo "Instituição" do cadastro de conta/cartão: busca no catálogo (nome, apelido ou código), mostra os logos
// e, ao reconhecer, aplica logo + cor oficial. Cor e ícone manuais só aparecem quando a instituição não está no catálogo
// (Dinheiro, Carteira, banco pequeno) ou quando a pessoa escolhe "Desfazer".
import { ref, computed, watch } from 'vue';
import { Check, Search, Undo2, Replace } from 'lucide-vue-next';
import CampoBase from './CampoBase.vue';
import IconeBanco from './IconeBanco.vue';
import SeletorIcone from './SeletorIcone.vue';
import SeletorCor from './SeletorCor.vue';
import { reconhecerBanco, buscarBancos, bancoPorSlug, normalizar } from '../utils/catalogoBancos.js';
import { corPorNome } from '../utils/corBanco.js';

const props = defineProps({
  nome: { type: String, default: '' },
  icone: { type: String, default: '' },
  cor: { type: String, default: '' },
  rotulo: { type: String, default: 'Instituição' },
  placeholder: { type: String, default: 'Ex.: Nubank, Itaú, Caju, Carteira' },
  padrao: { type: String, default: '🏦' },
  tema: { type: String, default: '' },
  erro: { type: String, default: '' },
  obrigatorio: { type: Boolean, default: false },
  comCor: { type: Boolean, default: true },
});
const emit = defineEmits(['update:nome', 'update:icone', 'update:cor']);

const PALETA = ['#8a05be', '#ec7000', '#cc092f', '#0070af', '#00a091', '#21c25e', '#f7c600', '#ec4899', '#7c3aed', '#06b6d4', '#4F5D75', '#947E57'];
const PADRAO_EMOJI = new Set(['', '🏦', '💳', '🏷️']);
const entrada = ref(null);
const aberto = ref(false);
const id = 'ci-' + Math.random().toString(36).slice(2, 8);

// Registro já salvo com ícone/imagem próprios: começa respeitando a escolha da pessoa.
const ic0 = props.icone || '';
const desfeito = ref(!!ic0 && !ic0.startsWith('banco:') && !PADRAO_EMOJI.has(ic0));

const reconhecido = computed(() => (desfeito.value ? null : reconhecerBanco(props.nome)));
const sugestoes = computed(() => {
  if (!aberto.value) return [];
  const l = buscarBancos(props.nome, 6);
  // nome já igual ao único resultado: some a lista e o aviso "Reconhecido" aparece
  return l.length === 1 && normalizar(l[0].nome) === normalizar(props.nome) ? [] : l;
});
const candidato = computed(() => reconhecerBanco(props.nome)); // para "Usar logo de X" depois de desfazer
const digitou = computed(() => !!props.nome.trim());

watch(reconhecido, (r) => {
  if (r) { emit('update:icone', 'banco:' + r.slug); emit('update:cor', r.cor || ''); }
  else if ((props.icone || '').startsWith('banco:')) { emit('update:icone', props.padrao); emit('update:cor', ''); }
}, { immediate: true });

function digitar(e) { desfeito.value = false; aberto.value = true; emit('update:nome', e.target.value); }
function escolher(b) {
  desfeito.value = false; aberto.value = false;
  emit('update:nome', b.nome); emit('update:icone', 'banco:' + b.slug); emit('update:cor', b.cor || '');
}
function fechar() { setTimeout(() => { aberto.value = false; }, 120); }
function trocar() { aberto.value = true; entrada.value && entrada.value.focus(); entrada.value && entrada.value.select(); }
function desfazer() { desfeito.value = true; emit('update:icone', props.padrao); emit('update:cor', ''); }
function reaplicar() { desfeito.value = false; }
const corAtual = computed(() => props.cor || corPorNome(props.nome));
const nomeBanco = (slug) => (bancoPorSlug(slug) || {}).nome || '';
</script>

<template>
  <div class="ci">
    <CampoBase :rotulo="rotulo" :erro="erro" :obrigatorio="obrigatorio" :tema="tema" :para="id">
      <div class="busca">
        <Search :size="16" class="lupa" aria-hidden="true" />
        <input :id="id" ref="entrada" class="sf-entrada campo-inst" type="text" autocomplete="off" role="combobox" :aria-expanded="sugestoes.length > 0" :aria-controls="id + '-lista'"
          :value="nome" :placeholder="placeholder" :aria-invalid="!!erro" @input="digitar" @focus="aberto = !!nome" @blur="fechar" />
        <ul v-if="sugestoes.length" :id="id + '-lista'" class="lista" role="listbox">
          <li v-for="b in sugestoes" :key="b.slug" role="option">
            <button type="button" class="item" @mousedown.prevent @click="escolher(b)">
              <IconeBanco :icone="'banco:' + b.slug" :tamanho="32" />
              <span class="txt"><b>{{ b.nome }}</b><small>{{ b.categoria }}<template v-if="b.codigoCompe"> · {{ b.codigoCompe }}</template></small></span>
            </button>
          </li>
        </ul>
      </div>
    </CampoBase>

    <div v-if="reconhecido" class="aviso ok" role="status">
      <IconeBanco :icone="'banco:' + reconhecido.slug" :tamanho="40" />
      <span class="txt"><b><Check :size="14" /> Reconhecido: {{ reconhecido.nome }}</b><small>Logo e cor aplicados</small></span>
      <span class="acoes">
        <button type="button" class="link" @click="trocar"><Replace :size="14" /> Trocar</button>
        <button type="button" class="link" @click="desfazer"><Undo2 :size="14" /> Desfazer</button>
      </span>
    </div>

    <template v-else-if="digitou">
      <div class="aviso" role="status">
        <span class="txt"><b>{{ desfeito && candidato ? 'Logo do catálogo não aplicado' : 'Instituição não encontrada' }}</b><small>Escolha uma cor e um ícone.</small></span>
        <button v-if="desfeito && candidato" type="button" class="link" @click="reaplicar">Usar logo de {{ candidato.nome }}</button>
      </div>
      <CampoBase v-if="comCor" rotulo="Cor" :tema="tema"><SeletorCor :model-value="cor" :paleta="PALETA" :padrao="corAtual" @update:model-value="emit('update:cor', $event)" /></CampoBase>
      <CampoBase rotulo="Ícone ou logo" :tema="tema"><SeletorIcone :model-value="icone" :padrao="padrao" @update:model-value="emit('update:icone', $event)" /></CampoBase>
    </template>
  </div>
</template>

<style scoped>
.ci { display: flex; flex-direction: column; gap: 12px; }
.busca { position: relative; }
.lupa { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--cor-texto-suave); pointer-events: none; }
.campo-inst { padding-left: 36px; }
.lista { position: absolute; z-index: 30; left: 0; right: 0; top: calc(100% + 4px); margin: 0; padding: 6px; list-style: none; max-height: 320px; overflow: auto; background: var(--cor-fundo-elevado); border: 1px solid var(--cor-borda); border-radius: 14px; box-shadow: var(--sombra-suave); }
.item { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 48px; padding: 6px 8px; background: none; border: none; border-radius: 10px; text-align: left; color: var(--cor-texto); font-family: var(--fonte-texto); cursor: pointer; }
.item:hover, .item:focus-visible { background: var(--cor-realce); outline: none; }
.txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.txt b { display: inline-flex; align-items: center; gap: 4px; font-size: 14px; font-weight: 600; }
.txt small { font-size: 12px; color: var(--cor-texto-suave); }
.aviso { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 10px 12px; border-radius: 14px; background: var(--cor-fundo); border: 1px solid var(--cor-card-borda); }
.acoes { display: flex; gap: 4px; flex-wrap: wrap; }
.link { display: inline-flex; align-items: center; gap: 5px; min-height: 44px; padding: 0 10px; background: none; border: none; color: var(--cor-texto-suave); font: 600 13px var(--fonte-texto); cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
.link:hover { color: var(--cor-texto); }
</style>
