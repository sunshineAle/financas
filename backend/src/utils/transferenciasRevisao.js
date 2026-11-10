// Reconhecimento por evidências. Nenhuma sugestão altera a classificação ou o saldo.
const db = require('../db');
const dados = require('../dados');
const R = require('./regras');
const L = require('./lancamentos');
const normalizar = t => R.normalizar(t).replace(/[^a-z0-9]+/g, ' ').trim();
const centavos = v => Math.round(Number(v) * 100);
const valido = t => !t.tipo_mov && !t.vinculo && !t.ignorada && Number(t.valor) !== 0;
const pix = t => /\b(pix|ted|doc|transf|transferencia|trans)\b/.test(normalizar(t.descricao));
function reconhecer(descricao, nome) {
  const d = normalizar(descricao).split(' '), n = normalizar(nome).split(' ').filter(Boolean);
  if (!n.length) return 0;
  let melhor = 0;
  for (let i = 0; i < d.length; i++) {
    if (d[i] !== n[0]) continue;
    let j = 1;
    for (; j < n.length && i+j < d.length; j++) {
      if (d[i+j] === n[j]) continue;
      if (d[i+j].length >= 3 && n[j].startsWith(d[i+j])) { const depois=d[i+j+1]; const terminal=!depois || /^[0-9]/.test(depois) || /^(pix|trans|transf|pgt|pagamento|recebido|enviado|via|em|nov|out|jan|fev|mar|abr|mai|jun|jul|ago|set|dez)$/.test(depois); if(terminal) melhor = Math.max(melhor, 2); j = -1; break; }
      // Não aceitar sobrenome contraditório como se o primeiro nome estivesse sozinho.
      if (/^[a-z]+$/.test(d[i+j]) && !/^(pix|trans|transf|ted|doc|pgt|pagamento|recebido|enviado|via|em|de|para|nov|out|jan|fev|mar|abr|mai|jun|jul|ago|set|dez)$/.test(d[i+j])) { j = -1; break; }
      break;
    }
    if (j >= 0) melhor = Math.max(melhor, j === n.length ? (n.length > 1 ? 3 : 1) : j > 1 ? 2 : 1);
  }
  return melhor;
}
function contexto(usuarioId) {
  const regras = db.prepare("SELECT * FROM regras_categorias WHERE usuario_id = ? AND tipo = 'transferencia' AND ativa = 1 AND excluido_em IS NULL").all(usuarioId);
  const contas = db.prepare('SELECT id,nome,icone,cor,tipo FROM contas WHERE usuario_id = ? AND excluido_em IS NULL').all(usuarioId);
  const cfg = db.prepare('SELECT nome_titular FROM configuracoes WHERE usuario_id = ? AND excluido_em IS NULL').get(usuarioId);
  const usuario = db.prepare('SELECT nome FROM usuarios WHERE id = ?').get(usuarioId);
  const nomes = [...new Set([cfg?.nome_titular, ...regras.map(r=>r.padrao), ...(cfg?.nome_titular ? [] : [usuario?.nome])].map(normalizar).filter(n=>n && !/^(pix|ted|transferencia|eu)$/.test(n)))];
  const linhas = db.prepare('SELECT * FROM transacoes WHERE usuario_id = ? AND excluido_em IS NULL').all(usuarioId).filter(t=>valido(t) && t.revisao !== 'transferencia_recusada' && contas.some(c=>c.id===t.conta_id));
  return { regras, nomes, contas, linhas };
}
const evidencia = (t,ctx) => Math.max(0,...ctx.nomes.map(n=>reconhecer(t.descricao,n)));
function classificacao(t) {
  let regra = null;
  try { if(t.classificacao_origem==='regra' && t.regra_snapshot) regra=JSON.parse(t.regra_snapshot); } catch {}
  const cat = t.categoria_id ? db.prepare('SELECT nome FROM categorias_orcamento WHERE id = ?').get(t.categoria_id) : null;
  return {regra,categoriaNome:cat?.nome || t.categoria_receita || null};
}
function itemPara(t,ctx,manual=false) {
  const externa=t.tipo_mov==='saldo_proprio_externo';
  if(!externa && !valido(t)) return null;
  if(!manual && (externa || t.revisao==='transferencia_recusada')) return null;
  const e=evidencia(t,ctx), todas=ctx.linhas.filter(p=>p.id!==t.id && p.conta_id!==t.conta_id && centavos(p.valor)===-centavos(t.valor));
  const coerentes=todas.filter(p=>evidencia(p,ctx)>0 && pix(p));
  const mesmaData=coerentes.filter(p=>String(p.data).slice(0,10)===String(t.data).slice(0,10));
  const cl=classificacao(t), resolvida=t.classificacao_origem==='regra' || (cl.categoriaNome && !/^(geral|sem categoria)$/i.test(cl.categoriaNome));
  if(!manual) {
    if(!pix(t) || !e) return null;
    // Primeiro nome só é suficiente para uma possibilidade com outra ponta coerente no mesmo dia.
    if(e===1 && !mesmaData.length) return null;
    if(resolvida && (e<2 || !mesmaData.length)) return null;
  }
  // Datas distintas continuam disponíveis para revisão manual; nunca preferir um par remoto automaticamente.
  const sugestao=todas.length===1 && mesmaData.length===1 && e>0 ? mesmaData[0] : null;
  const conta=ctx.contas.find(c=>c.id===t.conta_id);
  const candidatas=todas.map(p=>{const c=ctx.contas.find(c=>c.id===p.conta_id);return {id:p.id,contaId:p.conta_id,contaNome:c?.nome,contaIcone:c?.icone,contaCor:c?.cor,contaTipo:c?.tipo,descricao:p.descricao,data:p.data,valor:p.valor};});
  const proximas=ctx.linhas.some(p=>p.conta_id!==t.conta_id && Math.sign(p.valor)!==Math.sign(t.valor) && Math.abs(centavos(p.valor)+centavos(t.valor))===1 && evidencia(p,ctx)>0);
  const motivo=resolvida?'Confira a classificação deste lançamento.':todas.length>1?'Há mais de uma possibilidade.':e===1?'Nome incompleto: confira as duas pontas.':todas.length&&!mesmaData.length?'Confira as datas dos lançamentos.':'Confira se é dinheiro entre suas contas.';
  return {id:t.id,descricao:t.descricao,valor:t.valor,data:t.data,contaId:t.conta_id,contaNome:conta?.nome,contaIcone:conta?.icone,contaCor:conta?.cor,contaTipo:conta?.tipo,externa,classificacao:cl,conflito:!!resolvida,evidencia:e===3?'Nome completo':e===2?'Nome cortado':e===1?'Primeiro nome':'Conferência manual',motivo,sugestaoId:sugestao?.id||null,sugestaoContaId:sugestao?.conta_id||null,candidatas,contas:ctx.contas.filter(c=>c.id!==t.conta_id),diferencaCentavos:proximas&&!todas.length};
}
function sugerir(t,ctx){return itemPara(t,ctx);}
function listar(u){const ctx=contexto(u);return ctx.linhas.map(t=>sugerir(t,ctx)).filter(Boolean);}
function obter(u,id){const t=db.prepare('SELECT * FROM transacoes WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(String(id),u);const item=t&&itemPara(t,contexto(u),true);if(!item)throw new L.ErroLancamento('Este lançamento não pode ter a origem revisada.',404);return item;}
function snapshot(t){return JSON.stringify({categoria_id:t.categoria_id,categoria_receita:t.categoria_receita,subcategoria:t.subcategoria,classificacao_origem:t.classificacao_origem,regra_id:t.regra_id,regra_snapshot:t.regra_snapshot,categorizacao_automatica:t.categorizacao_automatica});}
function restaurar(t){let anterior={};try{anterior=JSON.parse(t.classificacao_anterior||'{}');}catch{};dados.atualizar('transacoes',t.id,{...anterior,tipo_mov:null,ignorada:0,classificacao_anterior:null,revisao:'transferencia_recusada'});}
function decidir(u,id,corpo){
  const item=corpo.manual?obter(u,id):listar(u).find(t=>t.id===id);
  if(!item)throw new L.ErroLancamento('A sugestão não está mais disponível. Atualize a revisão.',409);
  const t=db.prepare('SELECT * FROM transacoes WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(id,u);
  return dados.transacao(()=>{
    if(['recusar','manter'].includes(corpo.acao)){if(t.tipo_mov==='saldo_proprio_externo')throw new L.ErroLancamento('Escolha É receita para mudar esta classificação.');dados.atualizar('transacoes',id,{revisao:'transferencia_recusada'}); if(item.sugestaoId) dados.atualizar('transacoes',item.sugestaoId,{revisao:'transferencia_recusada'}); return {ok:true};}
    if(corpo.acao==='externa'){
      if(t.valor<=0)throw new L.ErroLancamento('Saldo próprio externo está disponível para recebimentos.');
      if(t.tipo_mov==='saldo_proprio_externo')return {ok:true};
      dados.atualizar('transacoes',id,{classificacao_anterior:snapshot(t),tipo_mov:'saldo_proprio_externo',ignorada:2,revisao:'origem_confirmada',categoria_id:null,categoria_receita:null});return {ok:true};
    }
    if(corpo.acao==='receita'){if(t.tipo_mov==='saldo_proprio_externo')restaurar(t);else dados.atualizar('transacoes',id,{revisao:'transferencia_recusada'});return {ok:true};}
    if(corpo.acao!=='vincular')throw new L.ErroLancamento('Escolha como tratar este lançamento.');
    const contaId=String(corpo.contaId||'');if(!item.contas.some(c=>c.id===contaId))throw new L.ErroLancamento('Escolha a outra conta.');
    const parceiraId=corpo.parceiraId?String(corpo.parceiraId):null;
    if(parceiraId&&!item.candidatas.some(p=>p.id===parceiraId&&p.contaId===contaId))throw new L.ErroLancamento('A outra ponta precisa ter o mesmo valor exato, em sentido oposto.');
    if(!parceiraId&&item.candidatas.some(p=>p.contaId===contaId))throw new L.ErroLancamento('Escolha qual lançamento corresponde.');
    if(!parceiraId&&item.diferencaCentavos)throw new L.ErroLancamento('Os valores são diferentes. Confira antes de vincular.');
    if(t.tipo_mov==='saldo_proprio_externo')restaurar(t);
    return L.converterEmTransferencia(u,id,contaId,{parceiraId,buscarParceira:false});
  });
}
module.exports={contexto,sugerir,listar,decidir,obter,centavos,reconhecer};
