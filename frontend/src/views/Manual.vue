<script setup>
// Manual / Tutorial: passo a passo curto de cada parte do sistema. Seções recolhíveis (uma aberta por vez).
import { ref } from 'vue';
import { Landmark, CreditCard, FileText, ReceiptText, Target, Tags, CloudUpload, ArrowLeftRight, ChevronDown, Rocket, CalendarClock } from 'lucide-vue-next';

const SECOES = [
  { id: 'comeco', icone: Rocket, titulo: 'Primeiros passos', passos: [
    'Cadastre suas contas em Contas (toque no "+" no fim do carrossel).',
    'Lance suas entradas e saídas pelo botão central "+" ou em Transações.',
    'Confira o Início: o "Saldo do mês" e o gráfico mostram para onde o dinheiro está indo.',
    'Troque o mês deslizando para o lado ou tocando nas abas do mês no topo.',
  ] },
  { id: 'contas', icone: Landmark, titulo: 'Contas', passos: [
    'Cada conta tem saldo próprio. Deslize o carrossel para ver as outras.',
    'Toque na conta para ver o extrato; use as ações do card para transferir, ajustar saldo ou editar.',
    'Segure um card por meio segundo para reordenar as contas.',
  ] },
  { id: 'transacoes', icone: ArrowLeftRight, titulo: 'Transações', passos: [
    'Escolha Entrada ou Saída, informe valor, data, conta e categoria.',
    'Use os filtros da lista para achar um lançamento; toque nele para editar ou excluir.',
    'A categoria define onde o gasto aparece no orçamento e nos relatórios.',
  ] },
  { id: 'cartoes', icone: CreditCard, titulo: 'Cartões', passos: [
    'Cadastre o cartão com limite, dia de fechamento e dia de vencimento.',
    'Lance as compras no cartão: parceladas, elas entram nas faturas dos meses seguintes.',
    'Cada cartão tem a cor própria, que você escolhe na edição.',
  ] },
  { id: 'faturas', icone: FileText, titulo: 'Faturas', passos: [
    'Abra o cartão e toque em "Ver fatura" para ver compras, valor, fechamento e vencimento.',
    'Navegue pelos meses para ver faturas passadas e futuras.',
    'Para quitar, use "Registrar pagamento" e escolha de qual conta o dinheiro sai.',
  ] },
  { id: 'dividas', icone: ReceiptText, titulo: 'Dívidas', passos: [
    'Aqui ficam as faturas a pagar, empréstimos, acordos e as compras parceladas de todos os cartões.',
    'Cadastre cada dívida com valor, parcelas e vencimento.',
    'Use as estratégias de quitação (bola de neve ou avalanche) para decidir qual pagar primeiro.',
    'Toque em um mês da "Evolução do total devido" para ver quanto foi pago e quanto falta.',
  ] },
  { id: 'categorias', icone: Tags, titulo: 'Categorias e orçamento', passos: [
    'Em Categorias, defina um limite mensal para cada despesa. Entradas não têm limite.',
    'A barra do topo mostra quanto do orçamento já foi usado e quanto ainda pode gastar.',
    'Crie, renomeie ou mude a cor e o ícone pelo menu de cada categoria.',
  ] },
  { id: 'custos-fixos', icone: CalendarClock, titulo: 'Custo de vida e avisos', passos: [
    'Em Mais > Custo de vida, aba Fixos, cadastre o que tem valor igual todo mês (aluguel, internet, assinaturas) com valor e dia.',
    'Na aba Essenciais, adicione as categorias que você paga todo mês com valor que muda (luz, água, mercado). O app estima pela média dos últimos 6 meses.',
    'Custo de vida = fixos + essenciais. A projeção do mês seguinte soma também as parcelas de cartão, dívidas e acordos.',
    'Pause um item para tirá-lo do cálculo sem apagar.',
    'O sino do topo avisa de fatura, parcela ou acordo vencendo e de orçamento no limite. Em Perfil você pode ligar os avisos no aparelho (1 por dia).',
  ] },
  { id: 'metas', icone: Target, titulo: 'Metas e Reserva de Liberdade', passos: [
    'Em Objetivos, crie metas com valor-alvo e acompanhe o percentual de cada uma.',
    'A Reserva de Liberdade é a sua meta de segurança financeira: alimente-a com regularidade.',
    'Na aba Investimentos você acompanha o que já está investido.',
  ] },
  { id: 'corretoras', icone: Landmark, titulo: 'Investimentos e corretoras', passos: [
    'Cadastre a sua corretora como uma conta: em Contas, toque no "+" e escolha o tipo "Corretora (investimentos)".',
    'Mande o dinheiro do banco para a corretora com "Transferir" na aba Investimentos. É uma transferência entre contas suas: não conta como gasto.',
    'Ao registrar uma compra (Guardar), ela sai da conta da corretora. Toque em um ativo para ver as compras (data, cotas, preço, total) e os proventos.',
    'Sem corretora cadastrada? Na hora de guardar, escolha "Conciliar com uma transferência do extrato" e indique a saída que aparece no extrato do banco.',
    'Metas aceitam só investimentos de liquidez rápida (CDB/RDB com liquidez diária, Tesouro Selic, LCI/LCA, poupança, fundos DI). Ações, FIIs, ETFs e cripto ficam só em Investimentos.',
    'Quando o extrato trouxer "Aplicação Caixinha", "Meu Porquinho" ou "Resgate CDB", o app pergunta se você quer vincular a uma meta. Se não vincular, o valor fica fora do orçamento.',
  ] },
  { id: 'backup', icone: CloudUpload, titulo: 'Backup', passos: [
    'Seus dados ficam neste aparelho. Faça backup com frequência para não perdê-los se o navegador limpar o cache.',
    'Baixe o arquivo de backup ou salve-o direto na pasta da sua nuvem (Drive, OneDrive etc.).',
    'Para recuperar, escolha o arquivo em Backup e confirme a senha de acesso.',
    'Em Perfil você vê quando foi o último backup.',
  ] },
];
const aberta = ref('comeco');
const alternar = (id) => { aberta.value = aberta.value === id ? '' : id; };
</script>

<template>
  <div class="pagina">
    <h1 class="titulo-pagina">Manual</h1>
    <p class="intro">Um guia rápido, em passos curtos. Toque em um assunto para abrir.</p>
    <section v-for="s in SECOES" :key="s.id" class="secao" :class="{ aberta: aberta === s.id }">
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
.seta { color: var(--cor-texto-suave); transition: transform 0.2s; }
.aberta .seta { transform: rotate(180deg); }
.passos { margin: 4px 10px 10px 64px; padding: 0; display: flex; flex-direction: column; gap: 8px; font-size: 14px; line-height: 1.5; color: var(--cor-texto); }
@media (max-width: 480px) { .passos { margin-left: 30px; } }
@media (prefers-reduced-motion: reduce) { .seta { transition: none; } }
</style>
