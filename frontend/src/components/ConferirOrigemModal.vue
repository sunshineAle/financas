<script setup>
import { computed, ref, watch } from 'vue';
import { ArrowRightLeft, ChevronDown } from 'lucide-vue-next';
import Modal from './Modal.vue';
import SeletorPopup from './SeletorPopup.vue';
import LinhaTransacao from './LinhaTransacao.vue';
import IconeBanco from './IconeBanco.vue';
import AjudaSecao from './AjudaSecao.vue';
import { carregarOrigem, confirmarOrigem, linhaDaOrigem, nomeDaConta, dataDaOrigem } from '../services/origemTransferencia.js';
import { lancamentoFoiSalvo } from '../services/lancamento.js';
import '../styles/formularios.css';
const props = defineProps({ aberto: Boolean, transacaoId: [String, Number], manual: Boolean });
const emit = defineEmits(['fechar', 'salvo']);
const item = ref(null), carregando = ref(false), salvando = ref(false), erro = ref('');
const escolha = ref(''), contaId = ref(''), parceiraId = ref(''), seletor = ref('');
let versao = 0;
watch(() => [props.aberto, props.transacaoId], async () => {
  const atual = ++versao;
  item.value = null; erro.value = ''; escolha.value = ''; contaId.value = ''; parceiraId.value = ''; seletor.value = '';
  if (!props.aberto || !props.transacaoId) return;
  carregando.value = true;
  try {
    const r = await carregarOrigem(props.transacaoId);
    if (atual !== versao) return;
    item.value = r;
    contaId.value = r.sugestaoContaId || ''; parceiraId.value = r.sugestaoId || '';
  } catch (e) { if (atual === versao) erro.value = e.message; }
  finally { if (atual === versao) carregando.value = false; }
}, { immediate: true });
const entrada = computed(() => Number(item.value?.valor) > 0);
const contas = computed(() => item.value?.contas || []);
const conta = computed(() => contas.value.find(c => String(c.id) === String(contaId.value)));
const candidatas = computed(() => (item.value?.candidatas || []).filter(c => String(c.contaId) === String(contaId.value)));
const parceira = computed(() => candidatas.value.find(c => String(c.id) === String(parceiraId.value)));
const opcoes = computed(() => [
  { valor: 'atual', titulo: entrada.value ? 'É receita' : item.value?.externa ? 'É despesa' : 'Manter como despesa', texto: entrada.value ? 'Um recebimento novo.' : item.value?.externa ? 'Um gasto de verdade, com a categoria de antes.' : 'Preservar a classificação deste lançamento.' },
  { valor: 'vincular', titulo: 'Outra conta cadastrada', texto: 'Dinheiro movido entre suas contas.' },
  { valor: 'externa', titulo: 'Movimentação própria', texto: entrada.value ? 'Dinheiro seu vindo de uma conta fora do Dagda.' : 'Dinheiro seu indo para uma conta fora do Dagda.' },
]);
const podeConfirmar = computed(() => item.value && escolha.value && !carregando.value && !salvando.value && (escolha.value !== 'vincular' || (conta.value && !item.value.diferencaCentavos && (!candidatas.value.length || parceira.value))));
function escolherConta(c) { contaId.value = c.id; parceiraId.value = ''; seletor.value = ''; }
function fechar() { if (!salvando.value) emit('fechar'); }
async function salvar() {
  if (!podeConfirmar.value) return;
  erro.value = ''; salvando.value = true;
  try {
    const acao = escolha.value === 'atual' ? (item.value.externa ? 'receita' : 'manter') : escolha.value;
    await confirmarOrigem(item.value.id, { acao, contaId: contaId.value || undefined, parceiraId: parceiraId.value || undefined, manual: props.manual });
    lancamentoFoiSalvo(); emit('salvo'); emit('fechar');
  } catch (e) { erro.value = e.message; }
  finally { salvando.value = false; }
}
const infoLinha = t => ({ nome: nomeDaConta(t) });
</script>
<template>
  <Modal :aberto="aberto && !seletor" titulo="Conferir origem" tema="neutro" :largura="560" @fechar="fechar">
    <div class="conferir-origem" data-conferir-origem>
      <p v-if="carregando" role="status">Carregando lançamento…</p>
      <template v-if="item">
        <LinhaTransacao :t="linhaDaOrigem(item)" :info="infoLinha(item)" :clicavel="false" />
        <p v-if="item.classificacao?.regra" class="regra" data-regra-origem>Regra “{{ item.classificacao.regra.padrao }}”<template v-if="item.classificacao.regra.categoriaNome"> → {{ item.classificacao.regra.categoriaNome }}</template></p>
        <p v-else-if="item.classificacao?.categoriaNome && !item.externa" class="nota">Classificado em {{ item.classificacao.categoriaNome }}</p>
        <p v-else-if="item.externa" class="nota">Classificação atual: movimentação própria, com conta fora do Dagda.</p>
        <div class="pergunta"><b>{{ entrada ? 'Como este valor entrou?' : 'Como tratar este lançamento?' }}</b><AjudaSecao titulo="Origem do dinheiro" :texto="['Receita e despesa mudam o seu resultado. Dinheiro seu indo ou vindo de uma conta fora do Dagda é só movimentação própria: conta nas entradas ou saídas do mês, mas não nas receitas, nas despesas nem no orçamento.', 'PIX e o nome no extrato são indícios. A classificação só muda depois de confirmar. A decisão vale para este lançamento e não altera suas regras.']" /></div>
        <div class="origens" role="radiogroup" aria-label="Origem do dinheiro">
          <button v-for="o in opcoes" :key="o.valor" type="button" role="radio" :aria-checked="escolha === o.valor" :aria-label="o.titulo" :disabled="salvando" :class="['opcao-origem', { selecionada: escolha === o.valor }]" @click="escolha = o.valor"><span class="radio" aria-hidden="true" /><span><b>{{ o.titulo }}</b><small>{{ o.texto }}</small></span></button>
        </div>
        <template v-if="escolha === 'vincular'">
          <button type="button" class="escolher-conta" :disabled="salvando || !contas.length" @click="seletor = 'conta'"><span><small>{{ entrada ? 'De qual conta?' : 'Para qual conta?' }}</small><b>{{ conta?.nome || 'Escolher conta' }}</b></span><ChevronDown :size="18" /></button>
          <p v-if="!contas.length" class="nota">Nenhuma outra conta cadastrada para vincular.</p>
          <template v-if="conta">
            <button v-if="candidatas.length" type="button" class="escolher-conta" :disabled="salvando" @click="seletor = 'lancamento'"><span><small>Lançamento correspondente</small><b>{{ parceira ? parceira.descricao : 'Escolher lançamento' }}</b></span><ChevronDown :size="18" /></button>
            <LinhaTransacao v-if="parceira" :t="linhaDaOrigem(parceira)" :info="infoLinha(parceira)" :clicavel="false" data-outra-ponta />
            <p v-if="parceira && item.data.slice(0,10) !== parceira.data.slice(0,10)" class="consequencia">Datas diferentes: {{ dataDaOrigem(item.data) }} e {{ dataDaOrigem(parceira.data) }}. Confira se são o mesmo movimento.</p>
            <p v-if="!candidatas.length" class="consequencia" data-criar-contraparte>Ao confirmar, será criada uma {{ entrada ? 'saída' : 'entrada' }} em {{ conta.nome }}.</p>
          </template>
          <p v-if="item.diferencaCentavos" class="consequencia">Os valores são diferentes. Confira os lançamentos antes de vincular.</p>
        </template>
        <p v-if="escolha === 'externa'" class="consequencia" data-consequencia-externa>Este valor já {{ entrada ? 'entrou no' : 'saiu do' }} saldo de {{ nomeDaConta(item) }} e continua assim. Ele aparece como Movimentação própria, {{ entrada ? 'vinda de' : 'para' }} uma conta fora do Dagda: conta {{ entrada ? 'nas entradas' : 'nas saídas' }} do mês, mas não {{ entrada ? 'como receita' : 'como despesa nem no orçamento' }}. Nenhuma outra conta será criada.</p>
        <p v-if="escolha === 'atual' && item.externa" class="consequencia">Este valor volta a contar {{ entrada ? 'nas receitas' : 'nas despesas, com a categoria que tinha antes' }}. O saldo da conta continua o mesmo.</p>
      </template>
      <p v-if="erro" class="sf-erro" role="alert">{{ erro }}</p>
    </div>
    <template #rodape><div class="rodape-origem tema-neutro"><button type="button" class="sf-botao secundario" :disabled="salvando" @click="fechar">Voltar</button><button type="button" class="sf-botao primario" data-confirmar-origem :disabled="!podeConfirmar" @click="salvar">{{ salvando ? 'Salvando…' : 'Confirmar' }}</button></div></template>
  </Modal>
  <SeletorPopup :aberto="aberto && !!seletor" :titulo="seletor === 'conta' ? 'Outra conta da transferência' : 'Lançamento correspondente'" tema="neutro" @fechar="seletor = ''">
    <div class="opcoes-popup">
      <template v-if="seletor === 'conta'"><button v-for="c in contas" :key="c.id" type="button" class="opcao" @click="escolherConta(c)"><IconeBanco :icone="c.icone" :nome="c.nome" :tamanho="28" /><span>{{ c.nome }}</span></button></template>
      <template v-else><button v-for="c in candidatas" :key="c.id" type="button" class="opcao opcao-lancamento" @click="parceiraId = c.id; seletor = ''"><LinhaTransacao :t="linhaDaOrigem(c)" :info="infoLinha(c)" :clicavel="false" /><span class="data-completa">{{ dataDaOrigem(c.data) }}</span></button></template>
    </div>
  </SeletorPopup>
</template>
<style scoped>
.conferir-origem { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
p { margin: 0; }
.pergunta { display: flex; align-items: center; gap: 5px; font-size: 14px; }
.origens { display: flex; flex-direction: column; gap: 7px; }
.opcao-origem { min-height: 56px; display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--cor-borda); border-radius: 12px; background: var(--cor-fundo); color: var(--cor-texto); text-align: left; cursor: pointer; font: inherit; }
.opcao-origem.selecionada { border-color: var(--cor-primaria); background: var(--cor-realce); }
.opcao-origem:focus-visible, .escolher-conta:focus-visible, .opcao:focus-visible { outline: 2px solid var(--cor-primaria); outline-offset: 2px; }
.opcao-origem b, .opcao-origem small { display: block; }
.opcao-origem b { font-size: 14px; }.opcao-origem small { font-size: 12px; color: var(--cor-texto-suave); margin-top: 2px; }
.radio { width: 16px; height: 16px; border: 1.5px solid var(--cor-borda); border-radius: 50%; flex: none; }.selecionada .radio { border: 5px solid var(--cor-primaria); }
.regra, .nota { font-size: 12px; color: var(--cor-texto-suave); line-height: 1.4; }
.consequencia { border-left: 3px solid var(--cor-primaria); padding: 8px 10px; background: var(--cor-realce); border-radius: 0 8px 8px 0; font-size: 13px; line-height: 1.4; }
.escolher-conta { min-width: 0; min-height: 48px; display: flex; justify-content: space-between; gap: 10px; align-items: center; padding: 9px 12px; border-radius: 12px; border: 1px solid var(--cor-borda); background: var(--cor-fundo); color: var(--cor-texto); text-align: left; cursor: pointer; }
.escolher-conta span { min-width: 0; }.escolher-conta small, .escolher-conta b { display: block; }.escolher-conta small { font-size: 12px; color: var(--cor-texto-suave); }.escolher-conta b { font-size: 14px; overflow-wrap: anywhere; }
.rodape-origem { display: flex; gap: 8px; width: 100%; }.rodape-origem button { flex: 1; }
.opcoes-popup { display: flex; flex-direction: column; gap: 7px; }.opcao { min-height: 48px; padding: 9px 10px; display: flex; align-items: center; gap: 10px; border: 1px solid var(--cor-borda); border-radius: 12px; background: var(--cor-fundo); color: var(--cor-texto); font: inherit; text-align: left; cursor: pointer; }.opcao-lancamento { display: block; width: 100%; }.data-completa { font-size: 12px; color: var(--cor-texto-suave); }
</style>
