# Apenas contas e nomes fictícios em contexto Chromium descartável; APIs reais do build local.
from playwright.sync_api import sync_playwright, expect
from pathlib import Path
from urllib.parse import urlparse
import os, json, tempfile
URL=os.environ.get('DAGDA_TEST_URL','http://127.0.0.1:8007/financas/').split('?')[0]
assert urlparse(URL).hostname in ['localhost','127.0.0.1'], 'Somente build local descartável'
DIA='2026-11-10'
def api(p,url,body=None,metodo=None):
 return p.evaluate('''async ([u,b,m])=>{const r=await fetch(u,{method:m||(b?'POST':'GET'),headers:{'Content-Type':'application/json'},...(b?{body:JSON.stringify(b)}:{})});const j=await r.json();if(!r.ok)throw Error(JSON.stringify(j));return j}''',[url,body,metodo])
def exportar(p):return api(p,'/api/backup/exportar')
def tx(p,c,tipo,descricao,valor,data=DIA):return api(p,'/api/transacoes',{'contaId':c['id'],'tipo':tipo,'descricao':descricao,'valor':valor,'data':data})
def pendentes(p):return api(p,'/api/transacoes/transferencias-pendentes')['itens']
def linha(p,id):return next(t for t in exportar(p)['tabelas']['transacoes'] if t['id']==id)
def saldo(p,id):return next(t['saldo'] for t in api(p,'/api/contas') if t['id']==id)
def totais(p):return api(p,'/api/transacoes?mes=2026-11')['resumo']
def decidir(p,id,acao,**outros):return api(p,f'/api/transacoes/{id}/revisar-transferencia',{'acao':acao,'manual':True,**outros})
def iguais(a,b):assert round(float(a),2)==round(float(b),2),(a,b)
with tempfile.TemporaryDirectory(prefix='dagda-pix-qa-') as tmp, sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 c=b.new_context(accept_downloads=True,viewport={'width':390,'height':844})
 c.add_init_script("localStorage.setItem('sf:tours',JSON.stringify({ligado:false}));localStorage.setItem('sf:novidades-vista','1.4')")
 p=c.new_page();erros=[];p.on('pageerror',lambda e:erros.append(str(e)))
 p.goto(URL,wait_until='networkidle');p.get_by_role('button',name='Criar acesso novo',exact=True).click()
 p.get_by_label('Apelido',exact=True).fill('Pessoa fictícia');p.get_by_label('Senha ou PIN',exact=True).fill('1234');p.get_by_label('Repita a senha ou PIN',exact=True).fill('1234')
 p.get_by_role('button',name='Salvar senha e entrar',exact=True).click()
 p.get_by_role('checkbox',name='Guardei a chave em local seguro',exact=True).check(timeout=20000)
 p.get_by_role('button',name='Entrar no app',exact=True).click();expect(p.locator('main')).to_be_visible(timeout=25000)
 p.evaluate("location.hash='#/mais/perfil'")
 p.locator('[data-nome-titular]').click();m=p.get_by_role('dialog',name='Nome do titular',exact=True)
 m.get_by_label('Nome completo do titular',exact=True).fill('Ana Carolina Ferreira');m.get_by_role('button',name='Salvar',exact=True).click();expect(m).not_to_be_visible()
 cfg=api(p,'/api/configuracoes');assert cfg['nome_titular']=='Ana Carolina Ferreira'
 assert json.loads(p.evaluate("localStorage.getItem('sf:acesso')"))['apelido']=='Pessoa fictícia'
 assert exportar(p)['tabelas']['configuracoes'][0]['nome_titular']=='Ana Carolina Ferreira'
 print('PASS98 titular salvo no banco/backup sem mudar apelido',flush=True)
 a=api(p,'/api/contas',{'nome':'Conta A fictícia','tipo':'corrente','saldo':2000})
 d=api(p,'/api/contas',{'nome':'Conta B fictícia','tipo':'corrente','saldo':500})
 e=api(p,'/api/contas',{'nome':'Saldo externo fictício','tipo':'corrente','saldo':500})
 out=tx(p,a,'saida','PIX PGT ANA CAROLINA FERREIRA',37.5);inc=tx(p,d,'entrada','PIX KCR ANA CAROLINA FERR',37.5)
 itens=pendentes(p);item=next(t for t in itens if t['id']==out['id']);assert item['contaNome']==a['nome'];assert item['candidatas'][0]['contaNome']==d['nome']
 assert any(x['id']==inc['id'] for x in item['candidatas'])
 sa,sb=saldo(p,a['id']),saldo(p,d['id']);q=len(exportar(p)['tabelas']['transacoes'])
 decidir(p,out['id'],'vincular',contaId=d['id'],parceiraId=inc['id'])
 iguais(saldo(p,a['id']),sa);iguais(saldo(p,d['id']),sb);assert len(exportar(p)['tabelas']['transacoes'])==q
 assert not any(t['id'] in [out['id'],inc['id']] for t in pendentes(p))
 print('PASS98 títulos diferentes/full-truncado e vínculo sem duplicar saldo ou lançamento',flush=True)
 # Nome curto com duas pontas e recusa persistida; outra ponta não deve reapresentar o mesmo par.
 x=tx(p,a,'saida','PIX TRANS ANA',41.13);y=tx(p,d,'entrada','PIX PGT ANA',41.13)
 assert any(t['id']==x['id'] for t in pendentes(p))
 decidir(p,x['id'],'recusar')
 assert not any(t['id'] in [x['id'],y['id']] for t in pendentes(p))
 print('PASS98 primeiro nome com par coerente e recusa sem reaparecer pela outra ponta',flush=True)
 moradia=api(p,'/api/categorias',{'nome':'Moradia fictícia','tetoMensal':1000})
 regra=api(p,'/api/regras',{'tipo':'saida','padrao':'ALUGUEL','categoriaId':moradia['id']})
 aluguel=tx(p,a,'saida','PIX PGT LOCADOR ALUGUEL',900)
 assert not any(t['id']==aluguel['id'] for t in pendentes(p))
 conflito=tx(p,a,'saida','PIX ALUGUEL ANA CAROLINA FERREIRA',58.4);par=tx(p,d,'entrada','PIX ANA CAROLINA FERR',58.4)
 item=next(t for t in pendentes(p) if t['id']==conflito['id']);assert item.get('conflito')
 antesregra=api(p,'/api/regras');antes=linha(p,conflito['id']);sa=saldo(p,a['id'])
 decidir(p,conflito['id'],'manter')
 assert linha(p,conflito['id'])['categoria_id']==antes['categoria_id'];iguais(saldo(p,a['id']),sa)
 assert api(p,'/api/regras')==antesregra
 print('PASS101 aluguel legítimo fora da revisão; conflito mantém despesa e regra intactas',flush=True)
 # Uma entrada realmente registrada: reclassificação não pode somá-la de novo nem usar Ignorar.
 recebido=tx(p,e,'entrada','PIX BENEFICIO ANA',100)
 iguais(saldo(p,e['id']),600);antesreceitas=totais(p)['entradas'];ncontas=len(api(p,'/api/contas'));ntrans=len(exportar(p)['tabelas']['transacoes'])
 p.evaluate("id=>location.hash='#/transacoes?editar='+id",recebido['id'])
 p.locator('[data-conferir-origem-manual]').click();modal=p.get_by_role('dialog',name='Conferir origem',exact=True)
 expect(modal).to_be_visible()
 modal.get_by_role('radio',name='Saldo próprio fora do Dagda',exact=False).click()
 iguais(saldo(p,e['id']),600);iguais(totais(p)['entradas'],antesreceitas)
 expect(modal.locator('[data-consequencia-externa]')).to_be_visible();modal.locator('[data-confirmar-origem]').click();expect(modal).not_to_be_visible()
 iguais(saldo(p,e['id']),600);iguais(totais(p)['entradas'],antesreceitas-100)
 t=linha(p,recebido['id']);assert t['tipo_mov']=='saldo_proprio_externo' and t['ignorada']==2
 assert t.get('classificacao_anterior'), 'Backup precisa preservar a classificação anterior para desfazer'
 Path(tmp,'exportacao-ficticia-externa.json').write_text(json.dumps(exportar(p)))
 assert len(api(p,'/api/contas'))==ncontas and len(exportar(p)['tabelas']['transacoes'])==ntrans
 decidir(p,recebido['id'],'externa');iguais(saldo(p,e['id']),600);iguais(totais(p)['entradas'],antesreceitas-100)
 decidir(p,recebido['id'],'receita');iguais(saldo(p,e['id']),600);iguais(totais(p)['entradas'],antesreceitas)
 decidir(p,recebido['id'],'externa');outrosaldos={x['id']:x['saldo'] for x in api(p,'/api/contas') if x['id']!=e['id']}
 api(p,f"/api/transacoes/{recebido['id']}",metodo='DELETE');iguais(saldo(p,e['id']),500)
 for id,valor in outrosaldos.items():iguais(saldo(p,id),valor)
 print('PASS102 externo500+100 mantém600; sem receita/conta fictícia, repetir/reverter/excluir preservam saldos',flush=True)
 # Revisão compacta com ambas as contas e suas datas, sobre transações não confirmadas.
 um=tx(p,a,'saida','PIX ANA CAROLINA FERREIRA',66.22);dois=tx(p,d,'entrada','PIX TRANS ANA CAROLINA FERR',66.22)
 for largura in [390,1366]:
  p.set_viewport_size({'width':largura,'height':844});p.evaluate("location.hash='#/revisar'")
  bloco=p.locator('[data-revisar-transferencias]');expect(bloco).to_be_visible()
  assert a['nome'] in bloco.inner_text() and d['nome'] in bloco.inner_text()
  assert not bloco.locator('select').count()
  assert p.evaluate('document.documentElement.scrollWidth<=innerWidth')
  p.screenshot(path=f'/tmp/pix-release-{largura}.png')
 print('PASS99–100 contas reais visíveis e UI padrão sem select nativo/overflow em390/1366',flush=True)
 assert not erros,erros;print('Erros JavaScript:',erros,flush=True)
 b.close()
