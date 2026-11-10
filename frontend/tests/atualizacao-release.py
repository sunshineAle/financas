# Migração real de SW 1.2.2→1.3: somente localhost e perfil fictício descartável.
from playwright.sync_api import sync_playwright, expect
from pathlib import Path
import json, shutil, tempfile, subprocess, tarfile, io
# Restaura somente a cópia temporária antiga para tornar a suíte repetível.
conteudo=subprocess.check_output(['git','archive','e583dcffc6360b930bbbe6d3b4844233300016cd','docs'],cwd='/workspace/financas')
with tempfile.TemporaryDirectory(prefix='dagda-old-') as extra:
 with tarfile.open(fileobj=io.BytesIO(conteudo)) as t:t.extractall(extra,filter='data')
 antigo=Path('/tmp/dagda-release/financas');shutil.rmtree(antigo);shutil.copytree(Path(extra)/'docs',antigo)
URL='http://127.0.0.1:8005/financas/'
OLD=Path('/tmp/dagda-release/financas')
NEW=Path('/workspace/financas/docs')
def api(p,url,body=None):
 return p.evaluate("async ([u,b])=>{const r=await fetch(u,b?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}:{});const j=await r.json();if(!r.ok)throw Error(JSON.stringify(j));return j}",[url,body])
def desbloquear(p):
 expect(p.get_by_role('heading',name='Olá, Migração fictícia',exact=True)).to_be_visible(timeout=20000)
 teclado=p.get_by_role('group',name='Teclado do PIN',exact=True)
 if teclado.is_visible():
  for n in '1234':teclado.get_by_role('button',name=n,exact=True).click()
 else:p.get_by_placeholder('Senha ou PIN',exact=True).fill('1234')
 p.get_by_role('button',name='Entrar',exact=True).click()
 expect(p.locator('main')).to_be_visible(timeout=20000)
with tempfile.TemporaryDirectory(prefix='dagda-release-qa-') as tmp,sync_playwright() as w:
 b=w.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 c=b.new_context(accept_downloads=True,viewport={'width':390,'height':844})
 c.add_init_script("localStorage.setItem('sf:tours',JSON.stringify({ligado:false}));localStorage.setItem('sf:novidades','1.3')")
 p=c.new_page();erros=[];p.on('pageerror',lambda e:erros.append(str(e)))
 p.goto(URL,wait_until='networkidle');p.evaluate('navigator.serviceWorker.ready.then(r=>r.active.state)');p.wait_for_function('!!navigator.serviceWorker.controller',timeout=20000)
 p.get_by_label('Apelido',exact=True).fill('Migração fictícia')
 p.get_by_label('Senha ou PIN',exact=True).fill('1234');p.get_by_label('Repita a senha ou PIN',exact=True).fill('1234')
 p.get_by_role('button',name='Salvar senha e entrar',exact=True).click()
 p.get_by_role('checkbox',name='Guardei a chave em local seguro',exact=True).check(timeout=20000)
 p.get_by_role('button',name='Entrar no app',exact=True).click();expect(p.locator('main')).to_be_visible(timeout=25000)
 conta=api(p,'/api/contas',{'nome':'Conta fictícia de migração','tipo':'corrente','saldo':321.45})
 api(p,'/api/transacoes',{'contaId':conta['id'],'tipo':'saida','descricao':'Mercado fictício de migração','valor':12.5,'data':'2026-11-10'})
 antes=api(p,'/api/backup/exportar');acesso=p.evaluate("localStorage.getItem('sf:acesso')");assert acesso and json.loads(acesso)
 Path('/tmp/dagda-release-antes.json').write_text(json.dumps(antes,indent=2))
 assert not p.evaluate("Object.keys(localStorage).some(k=>k.startsWith('dagda-previa'))")
 print('PASS perfil1.2.2 criado com PIN, conta e armazenamento oficial',flush=True)
 # Apenas substitui a cópia servida pelo servidor local de QA. Nenhum arquivo real do usuário.
 assert OLD==Path('/tmp/dagda-release/financas') and json.loads((OLD/'changelog.json').read_text())[0]['versao']=='1.2.2'
 shutil.rmtree(OLD);shutil.copytree(NEW,OLD)
 p.evaluate('async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update()}')
 p.get_by_role('button',name='Atualizar',exact=True).click(timeout=45000)
 p.wait_for_timeout(1800);p.reload(wait_until='networkidle');desbloquear(p)
 depois=api(p,'/api/backup/exportar');Path('/tmp/dagda-release-depois.json').write_text(json.dumps(depois,indent=2))
 assert depois['tabelas']['contas']==antes['tabelas']['contas']
 assert depois['tabelas'].get('transacoes',[])==antes['tabelas'].get('transacoes',[])
 assert p.evaluate("localStorage.getItem('sf:acesso')")==acesso
 assert not p.locator('#faixa-previa,#exemplo-previa').count()
 assert not p.get_by_role('button',name='Testar com dados fictícios',exact=True).count()
 print('PASS atualizaçãoSW1.2.2→1.3 preservou PIN/registro, conta, transações; sem controles de prévia',flush=True)
 p.evaluate("location.hash='#/backup'")
 if p.get_by_role('button',name='Pular',exact=True).is_visible():p.get_by_role('button',name='Pular',exact=True).click()
 with p.expect_download() as d:p.locator('[data-deste-aparelho]').click()
 arquivo=Path(tmp)/'ficticio-release.sfin';d.value.save_as(arquivo)
 env=json.loads(arquivo.read_text());assert env['criptografia'] and env['criptografia']['chave']=='mestra'
 rec=env['criptografia']['chaves']['recuperacao']
 print('PASS exportação1.3 cifrada após atualização',flush=True)
 novo=b.new_context(accept_downloads=True,viewport={'width':390,'height':844});novo.add_init_script("localStorage.setItem('sf:tours',JSON.stringify({ligado:false}))")
 q=novo.new_page();q.on('pageerror',lambda e:erros.append(str(e)));q.goto(URL,wait_until='networkidle')
 q.get_by_role('button',name='Restaurar meu Dagda',exact=True).click();q.locator('[data-arquivo-backup]').set_input_files(arquivo)
 modal=q.get_by_role('dialog',name='Restaurar backup',exact=True)
 modal.get_by_placeholder('Senha da época do backup ou o código').fill('1234')
 expect(modal.locator('[data-resultado-validacao]')).to_be_visible(timeout=30000)
 modal.get_by_role('button',name='Restaurar e continuar',exact=True).click();desbloquear(q)
 restaurado=api(q,'/api/backup/exportar');Path('/tmp/dagda-release-restaurado.json').write_text(json.dumps(restaurado,indent=2))
 # O importador remapeia usuario_id ao usuário deste aparelho; conteúdo/id/saldo da conta são preservados.
 normalizar=lambda contas:[{k:v for k,v in conta.items() if k!='usuario_id'} for conta in contas]
 assert normalizar(restaurado['tabelas']['contas'])==normalizar(depois['tabelas']['contas'])
 assert all(conta['usuario_id']==api(q,'/api/auth/me')['id'] for conta in restaurado['tabelas']['contas'])
 assert normalizar(restaurado['tabelas']['transacoes'])==normalizar(depois['tabelas']['transacoes'])
 assert not q.get_by_role('heading',name='Código de recuperação',exact=True).count()
 q.evaluate("location.hash='#/backup'")
 with q.expect_download() as d:q.locator('[data-deste-aparelho]').click()
 segunda=Path(tmp)/'restaurado-release.sfin';d.value.save_as(segunda)
 assert json.loads(segunda.read_text())['criptografia']['chaves']['recuperacao']==rec
 print('PASS restauração1.3 sem cadastro preserva nome/PIN/conta e mesmo código/chave de recuperação',flush=True)
 assert not erros,erros
 print('Erros JavaScript:',erros,flush=True);b.close()
