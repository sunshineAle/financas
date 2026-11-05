<script setup>
// Manual / Tutorial: passo a passo curto de cada parte do sistema. Seções recolhíveis (uma aberta por vez).
import { ref, onMounted, nextTick, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Landmark, CreditCard, FileText, Target, CloudUpload, ArrowLeftRight, ChevronDown, Rocket, CalendarClock, Scale, PlayCircle } from 'lucide-vue-next';
import { NOMES_TOUR, reverTour, toursLigados, ligarTours } from '../services/tour.js';
const dicas = ref(toursLigados());
const mudarDicas = () => { dicas.value = !dicas.value; ligarTours(dicas.value); };
const LISTA_TOURS = Object.keys(NOMES_TOUR).filter((k) => k !== 'o-que-mudou');

// Versão 1.0: nomes novos (Patrimônio, Compromissos, Categorias dentro de Transações) e "Rever tour" de cada página.
const SECOES = [
  { id: 'comeco', icone: Rocket, titulo: 'Primeiros passos', passos: [
    'No Início, o card "Primeiros passos" leva a cada etapa: conta, cartão, importar um extrato, início do mês e backup.',
    'Lance entradas, saídas e transferências pelo "+" do rodapé (no computador, "+ Adicionar" no menu).',
    'O "Saldo do mês" mostra o que entrou menos o que saiu; escolha outro mês no filtro de meses (um mês futuro mostra a previsão).',
    'Tocar de novo no item aceso do rodapé volta para a página principal dele.',
  ] },
  { id: 'patrimonio', icone: Scale, titulo: 'Patrimônio e Contas', passos: [
    'Patrimônio líquido = o que você tem (contas, metas, investimentos) − o que deve hoje (faturas abertas, dívidas, cheque especial).',
    'As abas Ativos | Passivos alternam os lados; no computador eles ficam lado a lado.',
    'Toque num bloco para abrir o detalhe; "Acessar …" leva à página. Parcelas futuras ficam em Compromissos.',
    'Em Contas, deslize o carrossel; segure um card para reordenar. No extrato, arraste uma transação para editar ou excluir e segure para selecionar várias.',
  ] },
  { id: 'transacoes', icone: ArrowLeftRight, titulo: 'Transações e categorias', passos: [
    'Últimas transações, o gráfico por categoria e as categorias com o limite ficam na mesma página.',
    '"Ver todas" abre o extrato completo: as barras escolhem o mês, a lupa busca por nome, categoria ou valor.',
    'Arraste uma transação para a esquerda para editar ou excluir; segure para selecionar várias e apagar de uma vez.',
    'Toque numa categoria para ver o mês a mês, definir o limite e filtrar por subcategoria.',
  ] },
  { id: 'compromissos', icone: CreditCard, titulo: 'Compromissos: cartões e dívidas', passos: [
    'O topo mostra o total a pagar: faturas abertas + parcelas de dívidas do mês.',
    'Crédito: cartões, cartão de loja e crediário. Toque num para ver a fatura, registrar o pagamento ou lançar uma compra.',
    'Dívidas: empréstimos, financiamentos e acordos, com o plano de quitação (bola de neve ou avalanche).',
    'Futuros: as parcelas dos próximos meses, fora do total de hoje.',
    'Cheque especial não é cadastrado como crédito: aparece em Contas quando a conta fica negativa.',
  ] },
  { id: 'faturas', icone: FileText, titulo: 'Faturas', passos: [
    'Cada compra conta na data da compra e cai na fatura do mês dela; pagamento da fatura não é gasto.',
    'Para quitar, use "Registrar pagamento" e escolha de qual conta o dinheiro sai.',
    'Estorno anula a compra; pagamento adiantado abate a fatura; cashback vira entrada.',
  ] },
  { id: 'custos-fixos', icone: CalendarClock, titulo: 'Custo de vida e avisos', passos: [
    'Em Custo de vida, Fixos são os valores iguais todo mês; Essenciais usam a média dos últimos 6 meses.',
    'Uma recorrência pode ter prazo (ex.: 5 meses) ou não; ela entra no custo de vida e na previsão.',
    'Os avisos ficam na sua foto, no topo.',
  ] },
  { id: 'metas', icone: Target, titulo: 'Metas e Reserva de Liberdade', passos: [
    'A Reserva de Liberdade é a sua meta de segurança financeira; "Quanto guardar" diz o tamanho ideal.',
    'Guardar e Resgatar movem dinheiro para a meta sem contar como gasto; só o rendimento é entrada.',
    'Ligue a meta à caixinha do banco e o app reconhece no extrato importado.',
  ] },
  { id: 'corretoras', icone: Landmark, titulo: 'Investimentos e corretoras', passos: [
    'Cadastre a corretora como conta (tipo "Corretora"). Banco → corretora é transferência; a compra sai da corretora.',
    'Toque num ativo para ver compras (data, cotas, preço, total), proventos e o preço médio.',
    'Metas aceitam só investimentos de resgate rápido; ações, FIIs, ETFs e cripto ficam em Investimentos.',
  ] },
  { id: 'backup', icone: CloudUpload, titulo: 'Backup e restauração', passos: [
    'Seus dados ficam neste aparelho. Faça backup com frequência (Dados e backup).',
    'Guarde o arquivo .sfin no aparelho ou envie ao Google Drive, OneDrive ou Dropbox.',
    'Para restaurar, na tela de entrada toque em "Restaurar backup" e escolha o arquivo ou a nuvem; depois use a senha da época ou a chave de recuperação.',
  ] },
];
// "Ver no manual" (balões de ajuda, anotação 64) chega com ?secao=<id>: abre e rola até essa seção.
const rota = useRoute();
const pedida = String(rota.query.secao || '');
const aberta = ref(SECOES.some((s) => s.id === pedida) ? pedida : 'comeco');
onMounted(() => { if (pedida) nextTick(() => document.getElementById('manual-' + pedida)?.scrollIntoView({ block: 'start' })); });
watch(() => rota.query.secao, (s) => { if (s && SECOES.some((x) => x.id === s)) { aberta.value = String(s); nextTick(() => document.getElementById('manual-' + s)?.scrollIntoView({ block: 'start' })); } });
const alternar = (id) => { aberta.value = aberta.value === id ? '' : id; };
</script>

<template>
  <div class="pagina">
    <h1 class="titulo-pagina">Manual</h1>
    <p class="intro">Um guia rápido, em passos curtos. Toque em um assunto para abrir.</p>
    <section class="secao tours" data-rever-tour>
      <div class="cab estatico"><span class="quadro"><PlayCircle :size="20" :stroke-width="1.8" /></span><b>Rever tour</b></div>
      <div class="lista-tours">
        <button v-for="k in LISTA_TOURS" :key="k" type="button" class="chip-tour" @click="reverTour(k)">{{ NOMES_TOUR[k] }}</button>
      </div>
      <label class="dicas"><input type="checkbox" :checked="dicas" @change="mudarDicas" /> Mostrar a dica de cada página na primeira visita</label>
    </section>
    <section v-for="s in SECOES" :id="'manual-' + s.id" :key="s.id" class="secao" :class="{ aberta: aberta === s.id }">
      <button type="button" class="cab" :aria-expanded="aberta === s.id" @click="alternar(s.id)">
        <span class="quadro"><component :is="s.icone" :size="20" :stroke-width="1.8" /></span>
        <b>{{ s.titulo }}</b>
        <ChevronDown :size="18" :stroke-width="1.8" class="seta" />
      </button>
      <ol v-if="aberta === s.id" class="passos">
        <li v-for="(p, i) in s.passos" :key="i">{{ p }}</li>
      </ol>
    </section>
  </div>
</template>

<style scoped>
.pagina { padding: 0 0 var(--espaco-fim); max-width: 640px; margin: 0 auto; display: flex; flex-direction: column; gap: 10px; }
.titulo-pagina { font-family: var(--fonte-display); font-size: 22px; margin: 0; text-align: center; }
.intro { margin: 0 0 6px; text-align: center; color: var(--cor-texto-suave); font-size: 13.5px; }
.secao { background: var(--cor-fundo-elevado); border: 1px solid var(--cor-borda); border-radius: var(--raio-padrao); padding: 6px; }
.cab { display: flex; align-items: center; gap: 14px; width: 100%; min-height: 56px; padding: 6px 10px; background: none; border: none; border-radius: 12px; color: var(--cor-texto); font-family: var(--fonte-texto); font-size: 15px; text-align: left; cursor: pointer; }
.cab b { flex: 1; font-weight: 600; }
.quadro { width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: var(--cor-entrada-fundo); color: var(--cor-primaria); flex-shrink: 0; }
.cab.estatico { cursor: default; }
.lista-tours { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 10px 8px 64px; }
.chip-tour { min-height: 34px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--cor-borda); background: var(--cor-card); color: var(--cor-texto); font: 500 13px var(--fonte-texto); cursor: pointer; }
.chip-tour:hover { border-color: var(--cor-primaria); }
.dicas { display: flex; align-items: center; gap: 8px; padding: 4px 10px 10px 64px; font-size: 13px; color: var(--cor-texto-suave); }
@media (max-width: 480px) { .lista-tours, .dicas { padding-left: 10px; } }
.seta { color: var(--cor-texto-suave); transition: transform 0.2s; }
.aberta .seta { transform: rotate(180deg); }
.passos { margin: 4px 10px 10px 64px; padding: 0; display: flex; flex-direction: column; gap: 8px; font-size: 14px; line-height: 1.5; color: var(--cor-texto); }
@media (max-width: 480px) { .passos { margin-left: 30px; } }
@media (prefers-reduced-motion: reduce) { .seta { transition: none; } }
</style>
