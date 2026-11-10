# Perfis descartáveis, dados fictícios e Google simulado. Nenhum login Google real.
from playwright.sync_api import sync_playwright, expect
from pathlib import Path
import json, os, tempfile
from urllib.parse import urlparse, parse_qs
URL = os.environ.get('DAGDA_TEST_URL', 'http://127.0.0.1:8001/')
ERROS = []
SDK = """window.google={accounts:{oauth2:{initTokenClient(opts){window.__escopoTeste=opts.scope;return{requestAccessToken(){opts.callback({access_token:'token-simulado-teste',expires_in:3600,scope:opts.scope})}}},revoke(t,cb){cb()}}}};"""
def observar(p):
    p.on('pageerror', lambda e: ERROS.append(str(e)))
def api(p, method, url, body=None):
    return p.evaluate('''async ([method,url,body])=>{const r=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const j=await r.json();if(!r.ok)throw Error(JSON.stringify(j));return j}''', [method,url,body])
def sem_tour(p):
    p.evaluate("localStorage.setItem('sf:tours',JSON.stringify({ligado:false}))")
with tempfile.TemporaryDirectory(prefix='dagda-smoke-') as tmp, sync_playwright() as pw:
    b = pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    contexto = b.new_context(accept_downloads=True, viewport={'width':390,'height':844})
    p = contexto.new_page(); observar(p)
    p.add_init_script("localStorage.setItem('oficial-sentinela','preservado')")
    p.goto(URL,wait_until='networkidle')
    expect(p.locator('[data-escolher-acesso]')).to_be_visible()
    expect(p.get_by_role('button',name='Entrar com Google',exact=True)).to_be_visible()
    p.locator('#exemplo-previa').click()
    expect(p.locator('main')).to_be_visible(timeout=20000)
    sem_tour(p)
    # O tour pode abrir antes de desligar a preferência. Não interfere no produto nem nos dados.
    if p.get_by_role('button',name='Pular',exact=True).is_visible():
        p.get_by_role('button',name='Pular',exact=True).click(force=True)
    assert 'Demonstração' in p.locator('body').inner_text()
    assert len(api(p,'GET','/api/contas')) >= 4
    pendentes = api(p,'GET','/api/transacoes/transferencias-pendentes')['itens']
    assert len(pendentes) == 2
    assert p.evaluate("Object.keys(localStorage).includes('oficial-sentinela')")
    print('PASS entrada visível com Google; demonstração abre sem cadastro/senha, com contas, cartões e transferências fictícias')
    p.evaluate("location.hash='#/revisar'")
    bloco=p.locator('[data-revisar-transferencias]')
    expect(bloco.locator('article')).to_have_count(2)
    assert p.locator('[data-revisar-categorias]').get_by_text('PIX ANA SILVA',exact=False).count()==0
    p.screenshot(path='/tmp/previa-transferencias-pendentes.png',full_page=True)
    bloco.locator('article').first.get_by_role('button',name='Vincular',exact=True).click()
    expect(p.locator('[data-revisar-transferencias]')).to_have_count(0)
    print('PASS par fictício vinculado sem duplicar as pendências')
    p.evaluate("location.hash='#/backup'")
    with p.expect_download() as download:
        p.locator('[data-deste-aparelho]').click()
    arquivo=Path(tmp)/'demo.sfin';download.value.save_as(arquivo)
    env=json.loads(arquivo.read_text());assert env['criptografia']['chave']=='mestra'
    assert 'Demonstração' not in json.dumps(env)
    print('PASS demonstração gera backup cifrado pela interface')
    # Monta um backup legado PBKDF2 com dados inteiramente fictícios (sem metadado novo de perfil).
    legado=p.evaluate('''async env=>{
      const d=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
      const b=v=>{const bytes=new Uint8Array(v);let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(s)};
      const key=async(s,salt,iterations)=>crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations},await crypto.subtle.importKey('raw',new TextEncoder().encode(s),'PBKDF2',false,['deriveKey']),{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
      const wrap=env.criptografia.chaves.senha;
      const master=await crypto.subtle.decrypt({name:'AES-GCM',iv:d(wrap.iv)},await key('demonstracao',d(wrap.sal),wrap.iter),d(wrap.ct));
      const mk=await crypto.subtle.importKey('raw',master,'AES-GCM',false,['decrypt']);
      let bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:d(env.criptografia.iv)},mk,d(env.dados));
      if(env.compressao==='gzip')bytes=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      const dados=JSON.parse(new TextDecoder().decode(bytes));delete dados.perfil;dados.usuario.nome='Perfil antigo fictício';
      const sal=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
      return {sfin:1,criado_em:'2026-10-29T10:00:00Z',criptografia:{alg:'AES-GCM-256',kdf:'PBKDF2-SHA256',iteracoes:1000,sal:b(sal),iv:b(iv)},dados:b(await crypto.subtle.encrypt({name:'AES-GCM',iv},await key('senha-antiga-ficticia',sal,1000),new TextEncoder().encode(JSON.stringify(dados))))};
    }''',env)
    p.get_by_role('button',name='Voltar ao acesso / restaurar backup',exact=True).click()
    expect(p.locator('[data-escolher-acesso]')).to_be_visible(timeout=15000)
    assert not p.get_by_role('heading',name='Olá, Demonstração').count()
    print('PASS demonstração separada da área de restauração')
    # Mesmo navegador: restauração de um arquivo LOCAL novo, e teste de senha incorreta.
    sem_tour(p)
    p.get_by_role('button',name='Restaurar meu Dagda',exact=True).click()
    p.locator('[data-arquivo-backup]').set_input_files(arquivo)
    p.get_by_placeholder('Senha da época do backup ou o código').fill('errada')
    expect(p.get_by_role('alert')).to_contain_text('incorreto')
    p.get_by_placeholder('Senha da época do backup ou o código').fill('demonstracao')
    expect(p.get_by_role('button',name='Restaurar e continuar')).to_be_visible(timeout=10000)
    p.get_by_role('button',name='Restaurar e continuar').click()
    expect(p.get_by_role('heading',name='Olá, Demonstração')).to_be_visible(timeout=15000)
    # Testar a demo a partir de um acesso já existente preserva esse acesso.
    p.locator('#exemplo-previa').click();expect(p.locator('main')).to_be_visible(timeout=20000)
    p.get_by_role('button',name='Voltar ao acesso / restaurar backup',exact=True).click()
    expect(p.get_by_role('heading',name='Olá, Demonstração')).to_be_visible(timeout=15000)
    print('PASS senha incorreta recusada; restauração local e acesso existente preservados ao abrir demonstração')
    # Perfil novo: só existem backups no Meu Drive antigo. O login Google deve encontrá-los sem escrita.
    c=b.new_context(viewport={'width':390,'height':844});c.add_init_script(SDK)
    pedidos=[]
    def google(route):
        req=route.request;u=urlparse(req.url);q=parse_qs(u.query)
        pedidos.append((req.method,req.url))
        assert req.method=='GET', 'Restaurar backup antigo nunca deve gravar/apagar no Drive'
        if q.get('alt')==['media']:
            route.fulfill(status=200,json=legado)
        elif q.get('spaces')==['appDataFolder']:
            route.fulfill(status=200,json={'files':[]})
        elif "name = 'Dagda Capital'" in q.get('q',[''])[0]:
            route.fulfill(status=200,json={'files':[{'id':'pasta-antiga','name':'Dagda Capital'}]})
        else:
            assert "'pasta-antiga' in parents" in q.get('q',[''])[0]
            route.fulfill(status=200,json={'files':[{'id':'arquivo-antigo','name':'sistema-financeiro-2026-10-29.sfin','size':str(len(json.dumps(legado))),'createdTime':'2026-10-29T10:00:00Z'}]})
    c.route('https://www.googleapis.com/**',google)
    q=c.new_page();observar(q);q.goto(URL,wait_until='networkidle');sem_tour(q)
    q.get_by_role('button',name='Entrar com Google',exact=True).click()
    expect(q.locator('[data-lista-backups] button')).to_have_count(1,timeout=15000)
    assert 'pasta antiga do Drive' in q.locator('[data-lista-backups]').inner_text()
    assert 'drive.file' in q.evaluate('window.__escopoTeste')
    q.locator('[data-lista-backups] button').click()
    q.get_by_placeholder('Senha da época do backup ou o código').fill('senha-antiga-ficticia')
    expect(q.get_by_role('button',name='Restaurar e continuar')).to_be_visible(timeout=15000)
    q.get_by_role('button',name='Restaurar e continuar').click()
    expect(q.get_by_role('heading',name='Olá, Perfil antigo fictício')).to_be_visible(timeout=15000)
    q.get_by_placeholder('Senha ou PIN',exact=True).fill('senha-antiga-ficticia')
    q.get_by_role('button',name='Entrar',exact=True).click()
    expect(q.locator('main').or_(q.get_by_role('heading',name='Código de recuperação',exact=True))).to_be_visible(timeout=15000)
    if q.get_by_role('heading',name='Código de recuperação',exact=True).is_visible():
        q.get_by_role('checkbox',name='Guardei a chave em local seguro',exact=True).check()
        q.get_by_role('button',name='Entrar no app',exact=True).click()
    expect(q.locator('main')).to_be_visible(timeout=15000)
    assert len(api(q,'GET','/api/contas')) >= 4
    assert q.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert all(m=='GET' for m,url in pedidos)
    print('PASS Google encontra backup na pasta antiga, restaura formato PBKDF2 sem novo perfil e sem gravar/apagar originais')
    print('Erros JavaScript:',ERROS);assert not ERROS
    b.close()
