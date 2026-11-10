<script setup>
// Ilustrações interativas dos tours 96/97. Todo estado é local: nenhuma operação toca serviços ou banco.
import { ref, watch } from 'vue';
import { Plus, WandSparkles, ArrowRightLeft, Tags, PiggyBank, ReceiptText, Pause, Trash2 } from 'lucide-vue-next';
import CardPadrao from './CardPadrao.vue';
const props = defineProps({ chave: String, passo: { type: Number, default: 0 } });
const emit = defineEmits(['passo']);
const resultado = ref('');
const categoria = ref('Alimentação');
const listaAberta = ref(false);
const regraCriada = ref(false);
const regraPausada = ref(false);
const regraExcluida = ref(false);
const grupos = [
  { titulo: 'Regras de despesa', itens: ['Mercado do Bairro → Alimentação', 'Ônibus → Transporte', 'Farmácia → Saúde'] },
  { titulo: 'Regras de entrada', itens: ['Salário → Salário', 'Trabalho extra → Renda extra'] },
  { titulo: 'Regras de transferência', itens: ['ANA SILVA → sugerir transferência'] },
  { titulo: 'Metas e investimentos', itens: ['Caixinha → Reserva de Liberdade'] },
];
const todas = ['Padaria → Alimentação', 'Mercado do Bairro → Alimentação', 'Ônibus → Transporte', 'Farmácia → Saúde', 'Streaming → Lazer'];
watch(() => [props.chave, props.passo], () => {
  resultado.value = ''; listaAberta.value = false; categoria.value = props.passo === 2 ? 'Parcelas e acordos' : 'Alimentação';
});
function criarRegra() { regraCriada.value = true; resultado.value = 'Neste exemplo, compras com “Padaria” passam a usar Alimentação. Nenhuma regra sua foi criada.'; }
function pausarRegra() { regraPausada.value = !regraPausada.value; resultado.value = regraPausada.value ? 'Regra pausada neste exemplo: deixa de classificar novos lançamentos.' : 'Regra ativada novamente neste exemplo.'; }
function excluirRegra() { regraExcluida.value = true; resultado.value = 'Regra excluída só deste exemplo. Os lançamentos já existentes não são apagados.'; }
function simular(texto) { resultado.value = texto; }
</script>

<template>
  <section class="exemplos" data-tour-exemplos :data-tour-chave="chave" :data-tour-passo="passo" :aria-label="chave === 'regras' ? 'Exemplo fictício de Regras' : 'Exemplo fictício de A revisar'">
    <p class="selo-exemplo"><WandSparkles :size="15" aria-hidden="true" /> Exemplo fictício · seus dados não mudam</p>
    <template v-if="chave === 'regras'">
      <div v-if="passo === 0" class="mini-grade" data-exemplo-regras-blocos>
        <CardPadrao v-for="g in grupos" :key="g.titulo" class="mini-card">
          <template #cabecalho><div class="mini-cab"><b>{{ g.titulo }}</b><button type="button" class="mais" :aria-label="`Exemplo: adicionar em ${g.titulo}`" @click="emit('passo', 1)"><Plus :size="18" aria-hidden="true" /></button></div></template>
          <ul class="regras-mini"><li v-for="r in g.itens" :key="r">{{ r }}</li></ul>
          <button type="button" class="link" @click="emit('passo', 2)">Ver todas as regras</button>
        </CardPadrao>
      </div>
      <CardPadrao v-else-if="passo === 1" class="mini-card" titulo="Nova regra de despesa" data-exemplo-criar-regra>
        <label class="campo">Quando o nome contiver<input value="Padaria" readonly /></label>
        <label class="campo">Vai para a categoria<input value="Alimentação" readonly /></label>
        <button type="button" class="acao" :disabled="regraCriada" @click="criarRegra">{{ regraCriada ? 'Regra criada no exemplo' : 'Criar regra' }}</button>
        <p class="contexto">O + do bloco já escolhe o tipo de regra. Aqui o nome do extrato ensina o app a classificar.</p>
      </CardPadrao>
      <CardPadrao v-else-if="passo === 2" class="mini-card" titulo="Regras de despesa" data-exemplo-lista-completa>
        <p class="contexto">No bloco ficam só as 3 regras adicionadas mais recentemente.</p>
        <ul class="regras-mini"><li v-for="r in todas.slice(0, 3)" :key="r">{{ r }}</li></ul>
        <button type="button" class="link" @click="listaAberta = !listaAberta">{{ listaAberta ? 'Fechar lista do exemplo' : 'Ver todas as regras' }}</button>
        <section v-if="listaAberta" class="lista-completa" aria-label="Lista completa ilustrativa de regras" data-exemplo-popup-regras>
          <b>Lista completa · Regras de despesa</b>
          <ul class="regras-mini"><li v-for="r in todas" :key="r">{{ r }}</li></ul>
          <p class="contexto">Na página, essa lista abre numa janela sem sair de Regras.</p>
        </section>
      </CardPadrao>
      <CardPadrao v-else class="mini-card" titulo="Editar regra · Padaria" data-exemplo-editar-regra>
        <p v-if="!regraExcluida"><b>Padaria → Alimentação</b><span class="estado">{{ regraPausada ? 'Pausada' : 'Ativa' }}</span></p>
        <p v-else>Regra removida deste exemplo.</p>
        <div class="acoes"><button type="button" class="secundaria" :disabled="regraExcluida" @click="pausarRegra"><Pause :size="15" aria-hidden="true" /> {{ regraPausada ? 'Ativar' : 'Pausar' }}</button><button type="button" class="secundaria excluir" :disabled="regraExcluida" @click="excluirRegra"><Trash2 :size="15" aria-hidden="true" /> Excluir</button></div>
        <p class="contexto">Na lista real, toque na regra para editar. Arrastar para a esquerda pausa; para a direita exclui.</p>
      </CardPadrao>
    </template>

    <template v-else>
      <CardPadrao v-if="passo === 0" class="mini-card" titulo="Possível transferência" data-exemplo-transferencia>
        <p class="historia"><ArrowRightLeft :size="18" aria-hidden="true" /> Ana moveu dinheiro entre duas contas próprias.</p>
        <div class="lancamento"><b>PIX ANA SILVA</b><strong>− R$ 120,00</strong><small>Conta A · ontem</small></div>
        <div class="outra-ponta"><b>PIX ANA SILVA · + R$ 120,00</b><small>Conta B · mesmo titular, mesmo valor</small></div>
        <p class="contexto">Há uma única outra ponta com valor igual. O app sugere; Ana confirma.</p>
        <div class="acoes"><button type="button" class="acao" @click="simular('Par vinculado neste exemplo. O valor muda de conta sem virar entrada nem despesa.')">Vincular</button><button type="button" class="secundaria" @click="simular('A sugestão foi recusada neste exemplo. O lançamento é mantido sem conversão automática.')">Não é transferência</button></div>
      </CardPadrao>
      <CardPadrao v-else-if="passo === 1" class="mini-card" titulo="Sem categoria" data-exemplo-despesa>
        <p class="historia"><Tags :size="18" aria-hidden="true" /> A compra chegou no extrato sem uma categoria.</p>
        <div class="lancamento"><b>Mercado do Bairro</b><strong>− R$ 85,00</strong><small>Conta A · ontem</small></div>
        <label class="campo">Categoria para Mercado do Bairro<select v-model="categoria"><option>Alimentação</option><option>Transporte</option><option>Lazer</option></select></label>
        <div class="acoes"><button type="button" class="acao" @click="simular(`Categoria ${categoria} salva neste exemplo. A compra não é criada de novo.`)">Salvar</button><button type="button" class="secundaria" @click="simular('Ignorado somente neste exemplo: sai dos totais e do saldo da conta. Na tela real, o app pede confirmação.')">Ignorar</button></div>
      </CardPadrao>
      <CardPadrao v-else-if="passo === 2" class="mini-card" titulo="Uma parcela no extrato" data-exemplo-divida>
        <p class="historia"><ReceiptText :size="18" aria-hidden="true" /> O extrato trouxe “Pagamento de empréstimo”, mas sem categoria.</p>
        <div class="lancamento"><b>Pagamento de empréstimo</b><strong>− R$ 250,00</strong><small>Conta A · ontem</small></div>
        <label class="campo">Categoria para a saída<select v-model="categoria"><option>Parcelas e acordos</option><option>Outras despesas</option></select></label>
        <button type="button" class="acao" @click="simular('Categoria salva neste exemplo. A dívida não foi vinculada, reduzida nem quitada por essa ação.')">Salvar</button>
        <p class="limite">Categorizar não quita nem vincula a dívida. A revisar ainda não oferece vínculo de parcelas já importadas. Não crie outra saída para repetir esse pagamento.</p>
      </CardPadrao>
      <div v-else class="exemplos-reserva" data-exemplo-reserva>
        <CardPadrao class="mini-card" titulo="Guardar na meta">
          <p class="historia"><PiggyBank :size="18" aria-hidden="true" /> R$ 100,00 saíram da conta para a caixinha.</p>
          <b>Aplicação Caixinha · − R$ 100,00</b>
          <span class="meta">Meta: Reserva de Liberdade</span>
          <div class="acoes"><button type="button" class="acao" @click="simular('Guardar vinculado à Reserva de Liberdade neste exemplo. Mover o próprio dinheiro para a meta não é gasto.')">Vincular</button><button type="button" class="secundaria" @click="simular('Guardar não vinculado neste exemplo. Fica separado do orçamento, sem virar gasto.')">Não vincular</button></div>
        </CardPadrao>
        <CardPadrao class="mini-card" titulo="Resgatar da meta">
          <b>Resgate Caixinha · + R$ 110,00</b><span class="meta">Reserva de Liberdade · Rendimento: R$ 10,00</span>
          <p class="contexto">Neste exemplo, R$ 100,00 já eram da pessoa; só os R$ 10,00 de rendimento são entrada.</p>
          <div class="acoes"><button type="button" class="acao" @click="simular('Resgate vinculado neste exemplo: R$ 100,00 de principal e R$ 10,00 de rendimento separados.')">Vincular</button><button type="button" class="secundaria" @click="simular('Dinheiro de fora do app neste exemplo: classificado em Resgates e saques por escolha da pessoa.')">De fora</button><button type="button" class="secundaria" @click="simular('Mantido como entrada comum neste exemplo, por escolha da pessoa.')">Entrada</button></div>
        </CardPadrao>
      </div>
    </template>
    <p v-if="resultado" class="resultado" role="status" data-tour-resultado>{{ resultado }}</p>
  </section>
</template>

<style scoped>
.exemplos { min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.selo-exemplo { margin: 0; display: flex; align-items: center; gap: 6px; color: var(--cor-texto-suave); font-size: 12px; }
.mini-grade { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
@media (min-width: 769px) { .mini-grade { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.mini-card { padding: 12px; gap: 10px; border-radius: 15px; font-size: 13px; }
.mini-card :deep(.tit h2) { font-size: 15px; }
.mini-cab { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; width: 100%; }
.mini-cab b { min-width: 0; font-size: 13px; }
.mais { flex: none; display: grid; place-items: center; width: 44px; height: 44px; padding: 0; border: 1px solid var(--cor-borda); border-radius: 10px; background: var(--cor-realce); color: var(--cor-primaria); }
.regras-mini { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 7px; }
.regras-mini li { padding: 7px; border-radius: 8px; background: var(--cor-fundo); overflow-wrap: anywhere; }
.link { min-height: 44px; padding: 8px 0; background: none; color: var(--cor-primaria); border: none; text-align: left; font: 600 12px var(--fonte-texto); }
.campo { display: flex; flex-direction: column; gap: 5px; font-size: 12px; }
.campo input, .campo select { min-height: 44px; width: 100%; min-width: 0; padding: 7px 9px; border: 1px solid var(--cor-borda); border-radius: 10px; background: var(--cor-fundo); color: var(--cor-texto); font: inherit; }
.acoes { display: flex; gap: 7px; flex-wrap: wrap; }
.acao, .secundaria { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-height: 44px; padding: 8px 10px; border-radius: 10px; font: 600 12px var(--fonte-texto); cursor: pointer; }
.acao { background: var(--cor-primaria); border: 1px solid var(--cor-primaria); color: white; }
.secundaria { background: none; border: 1px solid var(--cor-borda); color: var(--cor-texto); }
.excluir { color: var(--cor-amarelo); }
button:disabled { opacity: .6; cursor: default; }
button:not(:disabled) { cursor: pointer; }
button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--cor-primaria); outline-offset: 2px; }
p { margin: 0; }
.contexto { color: var(--cor-texto-suave); font-size: 12px; line-height: 1.45; }
.historia { display: flex; align-items: flex-start; gap: 7px; font-size: 13px; line-height: 1.45; }
.historia svg { flex: none; color: var(--cor-primaria); }
.lancamento { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 8px; padding: 10px 0; border-block: 1px solid var(--cor-borda); }
.lancamento small { grid-column: 1 / -1; color: var(--cor-texto-suave); }
.lancamento strong { color: var(--cor-saida); font-size: 13px; }
.outra-ponta, .lista-completa { display: flex; flex-direction: column; gap: 5px; padding: 9px; background: var(--cor-fundo); border: 1px solid var(--cor-borda); border-radius: 10px; }
.outra-ponta small, .meta { color: var(--cor-texto-suave); font-size: 12px; }
.limite { padding: 9px; border-left: 3px solid var(--cor-primaria); background: var(--cor-realce); color: var(--cor-texto-suave); font-size: 12px; line-height: 1.45; }
.estado { display: inline-block; margin-left: 7px; font-size: 12px; color: var(--cor-texto-suave); }
.resultado { padding: 10px; border: 1px solid var(--cor-borda); border-radius: 10px; background: var(--cor-realce); font-size: 13px; line-height: 1.45; }
.exemplos-reserva { display: flex; flex-direction: column; gap: 10px; }
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto; } }
</style>
