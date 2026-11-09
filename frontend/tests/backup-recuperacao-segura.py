# Dados fictícios; API Google simulada. Testa recuperação sem tocar no banco ativo.
from playwright.sync_api import sync_playwright, expect
from pathlib import Path
from urllib.parse import urlparse,parse_qs
import tempfile, os, json, re
URL=os.environ.get('DAGDA_TEST_URL','http://127.0.0.1:8003/').split('?')[0]
SDK="""window.google={accounts:{oauth2:{initTokenClient(o){return{requestAccessToken(){o.callback({access_token:'simulado',expires_in:3600})}}},revoke(t,cb){cb()}}}};"""
def api(p,url):return p.evaluate('async u=>(await(await fetch(u)).json())',url)
with tempfile.TemporaryDirectory() as tmp, sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 c=b.new_context(accept_downloads=True,viewport={'width':390,'height':844});c.add_init_script(SDK)
 p=c.new_page();erros=[];p.on('pageerror',lambda e:erros.append(str(e)))
 p.goto(URL,wait_until='networkidle');expect(p.get_by_role('heading',name='Bem-vindo de volta',exact=True)).to_be_visible()
 p.get_by_role('button',name='Criar acesso novo',exact=True).click();expect(p.get_by_role('heading',name='Novo acesso',exact=True)).to_be_visible()
 assert not p.get_by_role('button',name='Restaurar meu Dagda',exact=True).count()
 p.get_by_role('button',name='Voltar',exact=True).click();expect(p.get_by_role('heading',name='Bem-vindo de volta')).to_be_visible()
 print('PASS86–87 login compacto, cadastro com Voltar e sem botão de restauração duplicado')
 p.locator('#exemplo-previa').click();expect(p.locator('main')).to_be_visible(timeout=20000)
 p.evaluate("localStorage.setItem('sf:tours',JSON.stringify({ligado:false}))")
 if p.get_by_role('button',name='Pular',exact=True).is_visible():p.get_by_role('button',name='Pular',exact=True).click(force=True)
 p.evaluate("location.hash='#/backup'")
 with p.expect_download() as d:p.locator('[data-deste-aparelho]').click()
 arq=Path(tmp)/'ficticio.sfin';d.value.save_as(arq);texto=arq.read_text()
 antes=api(p,'/api/backup/exportar')['tabelas']
 p.locator('[data-arquivo-backup]').set_input_files(arq)
 modal=p.get_by_role('dialog',name='Restaurar backup',exact=True);expect(modal).to_be_visible()
 modal.get_by_placeholder('Senha da época do backup ou o código').fill('demonstracao')
 modal.get_by_role('button',name='Conferir backup',exact=True).click()
 expect(modal.locator('[data-resultado-validacao]')).to_be_visible(timeout=30000)
 assert api(p,'/api/backup/exportar')['tabelas']==antes
 assert 'demonstracao' not in texto and 'Demonstração' not in texto
 modal.get_by_role('button',name='Voltar',exact=True).click()
 ruim=Path(tmp)/'corrompido.sfin';env=json.loads(texto);env['dados']='AAAA';ruim.write_text(json.dumps(env))
 p.locator('[data-arquivo-backup]').set_input_files(ruim);expect(modal).to_be_visible()
 modal.get_by_placeholder('Senha da época do backup ou o código').fill('demonstracao');modal.get_by_role('button',name='Conferir backup',exact=True).click()
 expect(modal.get_by_role('alert')).to_be_visible();assert not modal.locator('[data-resultado-validacao]').count()
 assert api(p,'/api/backup/exportar')['tabelas']==antes
 modal.get_by_role('button',name='Voltar',exact=True).click()
 # JSON que pode ser lido mas não restaurado deve falhar no SQLite descartável.
 ruim.write_text(json.dumps({'sfin':1,'dados':{'formato':'sfin-dados','versao_esquema':1,'tabelas':{'contas':[{'id':'sem-nome'}]}}}))
 p.locator('[data-arquivo-backup]').set_input_files(ruim);expect(modal).to_be_visible();modal.get_by_role('button',name='Conferir backup',exact=True).click()
 expect(modal.get_by_role('alert')).to_be_visible(timeout=30000);assert not modal.locator('[data-resultado-validacao]').count()
 assert api(p,'/api/backup/exportar')['tabelas']==antes
 modal.get_by_role('button',name='Voltar',exact=True).click()
 print('PASS89 recuperação real em banco descartável; cifra corrompida e estrutura inválida recusadas; banco ativo idêntico')
 store={f'copia-{i}':{'id':f'copia-{i}','name':f'previa-sistema-financeiro-{i}.sfin','size':str(len(texto)),'createdTime':f'2026-10-{i:02}T10:00:00Z','texto':texto} for i in range(1,6)}
 apagados=[];comportamento={'corromper':False}
 def google(route):
  req=route.request;u=urlparse(req.url);qs=parse_qs(u.query);id=u.path.split('/')[-1]
  if req.method=='POST':
   recebido=req.post_data.split('Content-Type: application/octet-stream\r\n\r\n',1)[1].rsplit('\r\n--',1)[0]
   store['nova']={'id':'nova','name':'previa-sistema-financeiro-nova.sfin','size':str(len(recebido)),'createdTime':'2026-11-09T12:00:00Z','texto':recebido+('corrompido' if comportamento['corromper'] else '')}
   route.fulfill(status=200,json={'id':'nova'});return
  if req.method=='DELETE':apagados.append(id);store.pop(id);route.fulfill(status=204);return
  if qs.get('alt')==['media']:
   route.fulfill(status=200,body=store[id]['texto']);return
  if qs.get('spaces')==['drive']:route.fulfill(status=200,json={'files':[]});return
  route.fulfill(status=200,json={'files':[{k:v for k,v in x.items() if k!='texto'} for x in store.values()]})
 c.route('https://www.googleapis.com/**',google)
 p.locator('[data-origem-backup]').first.locator('[data-conectar-nuvem]').click()
 p.locator('[data-origem-backup]').first.locator('[data-entrar="google"]').click()
 expect(p.get_by_role('status').filter(has_text='Backup enviado ao Google Drive')).to_be_visible(timeout=60000)
 assert len(store)==4 and len(apagados)==2 and 'nova' in store
 assert api(p,'/api/backup/exportar')['tabelas']==antes
 print('PASS89 rotação6→4 só após download idêntico e recuperação isolada da nova cópia')
 # A lista de restauração permite gestão das cópias da prévia, protegendo a última válida.
 origem=p.locator('[data-origem-backup]').last;origem.locator('[data-conectar-nuvem]').click();origem.locator('[data-entrar="google"]').click()
 expect(p.locator('[data-lista-backups] [data-selecionar-backup]')).to_have_count(4)
 while len(store)>1:
  quantidade=len(store)
  p.locator('[data-lista-backups] button.excluir').first.click()
  p.locator('[data-confirmar-sim]').click()
  expect(p.locator('[data-lista-backups] [data-selecionar-backup]')).to_have_count(quantidade-1,timeout=30000)
  p.wait_for_function("!document.querySelector('[data-lista-backups] button:disabled')",timeout=30000)
 assert len(store)==1
 total=len(apagados);p.locator('[data-lista-backups] button.excluir').click();p.locator('[data-confirmar-sim]').click()
 expect(p.get_by_role('alert').filter(has_text='Exclusão bloqueada')).to_be_visible(timeout=30000)
 assert len(store)==1 and len(apagados)==total
 assert api(p,'/api/backup/exportar')['tabelas']==antes
 print('PASS89 exclusão manual confirmada preserva a última cópia; tentativa de apagar a última é bloqueada')
 # Mesmo com outras cópias presentes, uma única recuperável continua protegida.
 unica=next(iter(store))
 for i in ['a','b']:
  store['ruim-'+i]={'id':'ruim-'+i,'name':'previa-sistema-financeiro-ruim-'+i+'.sfin','size':'2','createdTime':'2020-01-01T00:00:00Z','texto':'{}'}
 origem.locator('[data-entrar="google"]').click()
 expect(p.locator('[data-lista-backups] [data-selecionar-backup]')).to_have_count(3)
 p.locator('[data-lista-backups] button.excluir').first.click();p.locator('[data-confirmar-sim]').click()
 expect(p.get_by_role('alert').filter(has_text='Exclusão bloqueada')).to_be_visible(timeout=30000)
 assert unica in store and len(store)==3 and len(apagados)==total
 print('PASS89 cópias corrompidas não contam como outra cópia recuperável')
 # Gravação na nuvem divergente não autoriza rotação nem muda a data do último sucesso.
 comportamento['corromper']=True
 cfg_antes=p.evaluate("JSON.parse(localStorage.getItem('sf:backup:cfg'))")
 p.locator('[data-origem-backup]').first.locator('[data-entrar="google"]').click()
 expect(p.get_by_role('alert').filter(has_text='diferente do enviado')).to_be_visible(timeout=30000)
 cfg_depois=p.evaluate("JSON.parse(localStorage.getItem('sf:backup:cfg'))")
 assert cfg_depois['ultimo']==cfg_antes['ultimo'] and len(apagados)==total and unica in store
 print('PASS89 readback divergente bloqueia rotação e não registra backup como concluído')
 comportamento['corromper']=False
 # Nome e acesso com PIN são preservados sem guardar o PIN em claro no envelope.
 p.evaluate("location.hash='#/mais/seguranca'")
 p.get_by_role('button',name=re.compile('Alterar senha ou PIN')).click()
 seguranca=p.get_by_role('dialog',name='Alterar senha de acesso',exact=True)
 seguranca.get_by_label(re.compile('^Senha atual')).fill('demonstracao')
 seguranca.get_by_label(re.compile('^Nova senha')).fill('2468')
 seguranca.get_by_label(re.compile('^Repita a nova senha')).fill('2468')
 seguranca.get_by_role('button',name='Alterar senha',exact=True).click()
 expect(seguranca).not_to_be_visible(timeout=15000)
 p.evaluate("location.hash='#/backup'")
 with p.expect_download() as d:p.locator('[data-deste-aparelho]').click()
 pin=Path(tmp)/'nome-e-pin.sfin';d.value.save_as(pin)
 envelope=json.loads(pin.read_text());assert not any(k in envelope for k in ['senha','pin','acesso','perfil'])
 novo=b.new_context(viewport={'width':390,'height':844});q=novo.new_page();q.on('pageerror',lambda e:erros.append(str(e)))
 q.goto(URL,wait_until='networkidle');q.evaluate("localStorage.setItem('sf:tours',JSON.stringify({ligado:false}))")
 q.get_by_role('button',name='Restaurar meu Dagda',exact=True).click();q.locator('[data-arquivo-backup]').set_input_files(pin)
 rest=q.get_by_role('dialog',name='Restaurar backup',exact=True)
 rest.get_by_placeholder('Senha da época do backup ou o código').fill('2468')
 rest.get_by_role('button',name='Conferir backup',exact=True).click()
 expect(rest.locator('[data-resultado-validacao]')).to_be_visible(timeout=30000)
 rest.get_by_role('button',name='Restaurar e continuar',exact=True).click()
 expect(q.get_by_role('heading',name='Olá, Demonstração',exact=True)).to_be_visible(timeout=15000)
 teclado=q.get_by_role('group',name='Teclado do PIN',exact=True)
 for numero in ['2','4','6','8']:teclado.get_by_role('button',name=numero,exact=True).click()
 q.get_by_role('button',name='Entrar',exact=True).click();expect(q.locator('main')).to_be_visible(timeout=15000)
 assert 'Demonstração' in q.locator('body').inner_text()
 print('PASS88 backup com PIN restaura nome e teclado numérico; PIN não é metadado aberto')
 assert not erros,erros
 p.screenshot(path='/tmp/backup89-protecao.png',full_page=True)
 b.close()
