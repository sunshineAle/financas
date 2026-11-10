# Apenas respostas Google fictícias; nenhuma exclusão real é executada.
from playwright.sync_api import sync_playwright, expect
from urllib.parse import urlparse, parse_qs
import os
URL=os.environ.get('DAGDA_TEST_URL','http://127.0.0.1:8003/').split('?')[0]
SDK="""window.google={accounts:{oauth2:{initTokenClient(o){return{requestAccessToken(){o.callback({access_token:'token-ficticio-94',expires_in:3600,scope:o.scope})}}},revoke(t,cb){cb()}}}};"""
COPIAS=[
    {'id':'previa-1','name':'previa-sistema-financeiro-1.sfin','size':'1200','createdTime':'2026-11-09T15:00:00Z'},
    {'id':'previa-2','name':'previa-sistema-financeiro-2.sfin','size':'1400','createdTime':'2026-11-08T15:00:00Z'},
    {'id':'oficial-1','name':'sistema-financeiro-oficial.sfin','size':'1800','createdTime':'2026-11-07T15:00:00Z'},
]
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    for gestao in [False,True]:
        ctx=b.new_context(viewport={'width':390,'height':844});ctx.add_init_script(SDK)
        ctx.add_init_script("localStorage.setItem('dagda-previa-demo-79-81:sf:tours',JSON.stringify({ligado:false}))")
        pedidos=[]
        def responder(route):
            req=route.request;pedidos.append((req.method,req.url))
            assert req.method=='GET', 'Cancelar/mostrar lista nunca deve modificar a nuvem'
            u=urlparse(req.url);q=parse_qs(u.query)
            if q.get('spaces')==['appDataFolder']:j={'files':COPIAS}
            elif "name = 'Dagda Capital'" in q.get('q',[''])[0]:j={'files':[{'id':'pasta-antiga','name':'Dagda Capital'}]}
            else:
                assert "'pasta-antiga' in parents" in q.get('q',[''])[0]
                j={'files':[{'id':'legada-1','name':'sistema-financeiro-antigo.sfin','size':'800','createdTime':'2026-10-29T10:00:00Z'}]}
            route.fulfill(status=200,json=j)
        ctx.route('https://www.googleapis.com/**',responder)
        page=ctx.new_page();erros=[];page.on('pageerror',lambda e:erros.append(str(e)))
        page.goto(URL+('?modo=demo' if gestao else ''),wait_until='networkidle')
        if gestao:
            expect(page.locator('main')).to_be_visible(timeout=20000)
            page.evaluate("location.hash='#/backup'")
            bloco=page.locator('#sec-restaurar')
            bloco.locator('[data-conectar-nuvem]').click()
            bloco.locator('[data-entrar="google"]').click()
        else:
            page.get_by_role('button',name='Entrar com Google',exact=True).click()
        lista=page.locator('[data-lista-backups]')
        expect(lista.locator('[data-selecionar-backup]')).to_have_count(4,timeout=15000)
        excluir=lista.get_by_role('button',name=__import__('re').compile('Excluir cópia de'))
        expect(excluir).to_have_count(2)
        # Originais do app e da pasta legada nunca ganham exclusão nesta prévia.
        linhas=lista.locator('.copia')
        readonly=[linhas.nth(i) for i in range(linhas.count()) if 'somente leitura' in linhas.nth(i).inner_text()]
        assert len(readonly)==2
        for linha in readonly:expect(linha.locator('.excluir')).to_have_count(0)
        if gestao:
            expect(excluir.first).to_be_enabled()
            excluir.first.click();expect(page.locator('[data-confirmacao]')).to_be_visible()
            page.locator('[data-confirmar-nao]').click();expect(page.locator('[data-confirmacao]')).not_to_be_visible()
            print('PASS94 gestão: exclusão identificável só nas duas cópias da prévia; cancelar não apaga nada')
        else:
            expect(lista.locator('[data-exclusao-entrada]')).to_contain_text('entre no app')
            for i in range(excluir.count()):expect(excluir.nth(i)).to_be_disabled()
            expect(lista.locator('[data-exclusao-bloqueada]')).to_have_count(2)
            print('PASS94 entrada: motivo explícito, exclusão bloqueada sem chave, oficiais e legado somente leitura')
        assert not erros,erros
        assert not any(m!='GET' for m,u in pedidos)
        ctx.close()
    b.close()
