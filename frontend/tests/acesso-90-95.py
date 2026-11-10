# Somente dados fictícios e perfis descartáveis. Apple é simulado por UA no Chromium.
from playwright.sync_api import sync_playwright, expect
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
import json, os, tempfile
URL = os.environ.get('DAGDA_TEST_URL', 'http://127.0.0.1:8003/').split('?')[0]
SDK = "window.google={accounts:{oauth2:{}}};"
ATRASAR_WORKER = """
window.__workerIniciado=0;window.__workerRecebido=0;window.__atrasoWorker=1200;
const Nativo=window.Worker;
window.Worker=class {
 constructor(...args){this.interno=new Nativo(...args);this.interno.onmessage=e=>{window.__workerRecebido++;setTimeout(()=>this.onmessage?.(e),window.__atrasoWorker)};this.interno.onerror=e=>this.onerror?.(e)}
 postMessage(m){window.__workerIniciado++;this.interno.postMessage(m)}
 terminate(){this.interno.terminate()}
};
"""
ERROS=[]
def observar(p):p.on('pageerror',lambda e:ERROS.append(str(e)))
def api(p,url):return p.evaluate('async url=>(await(await fetch(url)).json())',url)
def contexto(b,largura=390,ua=None):
 c=b.new_context(viewport={'width':largura,'height':844},**({'user_agent':ua} if ua else {}));c.add_init_script(SDK);return c
with tempfile.TemporaryDirectory(prefix='dagda-90-95-') as tmp, sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for largura,ua,rotulo,titulo in [
  (390,'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1','Como instalar','Instalar no iPhone ou iPad'),
  (1366,'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15','Como instalar','Instalar no Mac'),
  (1366,None,'Instalar aplicativo','Instalar o Dagda Capital')]:
  c=contexto(b,largura,ua);p=c.new_page();observar(p);p.goto(URL,wait_until='networkidle')
  expect(p.locator('[data-escolher-acesso]')).to_be_visible();expect(p.get_by_role('button',name='Entrar com Google',exact=True)).to_be_visible()
  assert not p.locator('[data-escolher-acesso]').get_by_role('button',name='Testar com dados fictícios',exact=True).count()
  p.get_by_role('button',name=rotulo,exact=True).click();m=p.get_by_role('dialog',name=titulo,exact=True);expect(m).to_be_visible()
  assert 'prévia' in m.locator('[data-instalacao-previa]').inner_text()
  assert 'usando o recurso do seu navegador' in m.inner_text()
  m.get_by_role('button',name='Entendi',exact=True).click();expect(m).not_to_be_visible();c.close()
 print('PASS90/93 Google só no primeiro acesso; Testar fora da tela final; rótulos por plataforma e orientação sem instalar prévia (390/1366 px)')
 c=contexto(b);p=c.new_page();observar(p);p.goto(URL,wait_until='networkidle')
 p.get_by_role('button',name='Criar acesso novo',exact=True).click()
 p.get_by_label('Apelido',exact=True).fill('Pessoa fictícia');p.get_by_label('Senha ou PIN',exact=True).fill('1234');p.get_by_label('Repita a senha ou PIN',exact=True).fill('1234')
 p.get_by_role('button',name='Salvar senha e entrar',exact=True).click()
 expect(p.get_by_role('checkbox',name='Guardei a chave em local seguro',exact=True)).to_be_visible(timeout=15000)
 p.get_by_role('checkbox',name='Guardei a chave em local seguro',exact=True).check();p.get_by_role('button',name='Entrar no app',exact=True).click()
 expect(p.locator('main')).to_be_visible(timeout=20000);p.reload(wait_until='networkidle')
 login=p.locator('[data-login]');expect(login).to_be_visible()
 assert not login.get_by_role('button',name='Entrar com Google',exact=True).count()
 assert not login.get_by_role('button',name='Testar com dados fictícios',exact=True).count()
 expect(login.get_by_role('button',name='Esqueci a senha',exact=True)).to_be_visible();expect(login.get_by_role('button',name='Restaurar backup',exact=True)).to_be_visible()
 c.close();print('PASS90 desbloqueio diário preserva PIN e recuperação, sem Google/Testar')
 # A demonstração fornece um esquema válido para o teste real de recuperação, sem dados pessoais.
 c=contexto(b);p=c.new_page();observar(p);p.goto(URL+'?modo=demo',wait_until='networkidle');expect(p.locator('main')).to_be_visible(timeout=20000)
 dados=api(p,'/api/backup/exportar')
 fixture=p.evaluate('''async dados=>{
 const senha='senha-ficticia',sal=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
 const base=await crypto.subtle.importKey('raw',new TextEncoder().encode(senha),'PBKDF2',false,['deriveKey']);
 const k=await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:sal,iterations:1000},base,{name:'AES-GCM',length:256},false,['encrypt']);
 const b=v=>{const a=new Uint8Array(v);let s='';for(let i=0;i<a.length;i+=0x8000)s+=String.fromCharCode(...a.subarray(i,i+0x8000));return btoa(s)};
 return {sfin:1,criado_em:new Date().toISOString(),criptografia:{kdf:'PBKDF2-SHA256',alg:'AES-GCM-256',sal:b(sal),iv:b(iv),iteracoes:1000},dados:b(await crypto.subtle.encrypt({name:'AES-GCM',iv},k,new TextEncoder().encode(JSON.stringify(dados))))};
 }''',dados)
 arq=Path(tmp)/'ficticio.sfin';arq.write_text(json.dumps(fixture));c.close()
 c=contexto(b);c.add_init_script(ATRASAR_WORKER);p=c.new_page();observar(p);p.goto(URL,wait_until='networkidle')
 p.get_by_role('button',name='Restaurar meu Dagda',exact=True).click();p.locator('[data-arquivo-backup]').set_input_files(arq)
 m=p.get_by_role('dialog',name='Restaurar backup',exact=True);expect(m).to_be_visible();campo=m.get_by_placeholder('Senha da época do backup ou o código')
 assert not m.get_by_role('button',name='Conferir backup',exact=True).count()
 campo.fill('senha-ficticia');p.wait_for_timeout(300);assert not p.evaluate('window.__workerIniciado')
 p.wait_for_function('window.__workerRecebido>=1',timeout=15000)
 campo.fill('incorreta') # O Worker real terminou, mas seu retorno foi atrasado para exercitar a corrida.
 assert not m.locator('[data-resultado-validacao]').count();assert not m.get_by_role('button',name='Restaurar e continuar',exact=True).count()
 expect(m.get_by_role('alert')).to_be_visible(timeout=15000)
 assert not m.locator('[data-resultado-validacao]').count();assert not m.get_by_role('button',name='Restaurar e continuar',exact=True).count()
 print('PASS95 debounce e retorno atrasado de senha antiga não habilitam restauração')
 campo.fill('senha-ficticia');expect(m.locator('[data-resultado-validacao]')).to_be_visible(timeout=20000)
 principal=m.get_by_role('button',name='Restaurar e continuar',exact=True);expect(principal).to_be_visible()
 assert principal.bounding_box()['height']>=48
 caixa=m.bounding_box();botao=principal.bounding_box();assert abs((botao['x']+botao['width']/2)-(caixa['x']+caixa['width']/2))<3
 assert not p.locator('main').count() # Nenhum clique no CTA: dados não foram aplicados nem acesso criado.
 # Alterar a senha invalida o conteúdo imediatamente, antes do próximo debounce.
 campo.fill('outra');assert not m.locator('[data-resultado-validacao]').count()
 # Começa uma validação válida e fecha antes do callback: o arquivo seguinte não pode receber esse resultado.
 campo.fill('senha-ficticia');iniciados=p.evaluate('window.__workerRecebido');p.wait_for_function('(n)=>window.__workerRecebido>n',arg=iniciados,timeout=15000)
 m.get_by_role('button',name='Voltar',exact=True).click();expect(m).not_to_be_visible()
 ruim=Path(tmp)/'corrompido.sfin';corrompido={**fixture,'dados':'AAAA'};ruim.write_text(json.dumps(corrompido));p.locator('input[type=file]').first.set_input_files(ruim)
 expect(m).to_be_visible();campo.fill('senha-ficticia');campo.press('Enter');expect(m.get_by_role('alert')).to_be_visible(timeout=20000)
 assert not m.locator('[data-resultado-validacao]').count();assert not principal.count()
 print('PASS95 conteúdo só após Worker real; CTA central e grande; nunca auto-restaura; trocar arquivo/Enter/cifra corrompida são seguros')
 assert not ERROS,ERROS;print('Erros JavaScript:',ERROS);b.close()
