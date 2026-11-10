# Dian Cécht: teste de fluxos reais com contas fictícias; SDK/API Google são simulados.
# Regras85 possui suíte própria em regras-responsivas.py.
from playwright.sync_api import sync_playwright, expect
from urllib.parse import urlparse, parse_qs
import os
URL = os.environ.get('DAGDA_TEST_URL', 'http://127.0.0.1:8001/').split('?')[0]
SDK = """window.google={accounts:{oauth2:{initTokenClient(opts){return{requestAccessToken(){opts.callback({access_token:'teste-ficticio',expires_in:3600,scope:opts.scope})}}},revoke(t,cb){cb()}}}};"""

def sem_tour(page):
    page.evaluate("localStorage.setItem('sf:tours',JSON.stringify({ligado:false}))")
    if page.get_by_role('button', name='Pular', exact=True).is_visible():
        page.get_by_role('button', name='Pular', exact=True).click(force=True)

def testar_apple_opcoes(browser):
    casos = [
        ('iPhone Safari', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1', 'iPhone', 5, 'Instalar no iPhone ou iPad', 'Compartilhar'),
        ('iPad desktop UA', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', 'MacIntel', 5, 'Instalar no iPhone ou iPad', 'Compartilhar'),
        ('Chrome iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/130.0.0.0 Mobile/15E148 Safari/604.1', 'iPhone', 5, 'Instalar no iPhone ou iPad', 'Safari'),
        ('Mac Safari', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', 'MacIntel', 0, 'Instalar no Mac', 'Safari'),
        ('Android Chrome', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36', 'Linux armv8l', 5, 'Instalar o Dagda Capital', 'Instalar'),
    ]
    for nome, ua, plataforma, pontos, titulo, trecho in casos:
        ctx = browser.new_context(user_agent=ua, viewport={'width':390,'height':844})
        ctx.add_init_script(SDK)
        ctx.add_init_script(f"Object.defineProperty(navigator,'platform',{{get:()=>{plataforma!r}}});Object.defineProperty(navigator,'maxTouchPoints',{{get:()=>{pontos}}});")
        page = ctx.new_page(); erros=[]
        page.on('pageerror',lambda e:erros.append(str(e)))
        page.goto(URL,wait_until='networkidle')
        botao=page.get_by_role('button',name=('Instalar aplicativo' if nome == 'Android Chrome' else 'Como instalar'),exact=True)
        expect(botao).to_be_visible();botao.click()
        modal=page.get_by_role('dialog',name=titulo,exact=True)
        expect(modal).to_be_visible();expect(modal.locator('[data-instalacao-previa]')).to_contain_text('não será instalada')
        # Tab e Shift+Tab devem permanecer no diálogo modal.
        for tecla in ['Tab'] * 5 + ['Shift+Tab'] * 5:
            page.keyboard.press(tecla)
            assert modal.evaluate('e=>e.contains(document.activeElement)'), 'Foco saiu do modal'
        assert trecho in modal.inner_text()
        modal.get_by_role('button',name='Entendi',exact=True).click();expect(modal).not_to_be_visible()
        expect(botao).to_be_focused()
        botao.click();expect(modal).to_be_visible();page.keyboard.press('Escape');expect(modal).not_to_be_visible()
        # Os provedores são definidos por configuração, não pelo sistema operacional.
        page.get_by_role('button',name='Restaurar meu Dagda',exact=True).click()
        origem=page.get_by_role('dialog',name='Restaurar Backup',exact=True)
        expect(origem.locator('[data-arquivo-backup]')).to_have_count(1)
        assert 'OneDrive' not in origem.inner_text() and 'Dropbox' not in origem.inner_text()
        origem.locator('[data-conectar-nuvem]').click()
        expect(origem.locator('[data-entrar="google"]')).to_be_visible()
        expect(origem.locator('[data-entrar]')).to_have_count(1)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        assert not erros,erros
        print(f'PASS {nome}: instruções explícitas/fechamento/foco e só Google configurado + arquivo (simulação em Chromium)')
        ctx.close()

def testar_backup_rapido(browser):
    ultimo = '2026-01-01T00:00:00.000Z'
    for caso in ['cancelar', 'sucesso', 'falha', 'offline', 'destino-indisponivel', 'sem-destino', 'rota-fria']:
        destino = 'microsoft' if caso == 'destino-indisponivel' else None if caso == 'sem-destino' else 'google'
        ctx = browser.new_context(viewport={'width':390,'height':844})
        ctx.add_init_script(SDK)
        # Configuração já escolhida pelo usuário fictício; automatico=true não autoriza envio sem confirmação.
        import json
        cfg = {'intervalo':'semanal','criptografar':True,'automatico':True,'manter':10,'ultimo':ultimo,'ultimoDestino':destino,'instalado_em':ultimo}
        if caso == 'rota-fria': cfg['intervalo'] = 'desligado'
        cfg_js = json.dumps(json.dumps(cfg))
        ctx.add_init_script(f"localStorage.setItem('dagda-previa-demo-79-81:sf:backup:cfg',{cfg_js});localStorage.setItem('dagda-previa-demo-79-81:sf:tours',JSON.stringify({{ligado:false}}));localStorage.setItem('dagda-previa-demo-79-81:sf:nuvem:estado',JSON.stringify({{google:{{conectado:true}},microsoft:{{conectado:true}}}}));")
        if caso == 'rota-fria': ctx.add_init_script("sessionStorage.setItem('dagda-previa-demo-79-81:sf:abrir-rota','/?confirmarBackup=1')")
        pedidos=[];pendentes=[];texto_enviado=[]
        def responder(route):
            req = route.request
            pedidos.append((req.method, req.url))
            if req.method == 'POST' and 'upload/drive' in req.url:
                texto_enviado.append(req.post_data.split('Content-Type: application/octet-stream\r\n\r\n',1)[1].rsplit('\r\n--',1)[0])
                assert 'previa-sistema-financeiro-' in req.post_data
                assert '"parents":["appDataFolder"]' in req.post_data
                assert 'Demonstração' not in req.post_data
                if caso == 'falha': route.fulfill(status=500,body='Falha simulada')
                else: pendentes.append(route)
            elif 'alt=media' in req.url: route.fulfill(status=200,body=texto_enviado[-1])
            else: route.fulfill(status=200,json={'files':[]})
        ctx.route('https://www.googleapis.com/**',responder)
        page=ctx.new_page();erros=[];page.on('pageerror',lambda e:erros.append(str(e)))
        page.goto(URL+'?modo=demo',wait_until='networkidle');expect(page.locator('main')).to_be_visible(timeout=20000)
        modal=page.get_by_role('dialog',name='Fazer backup agora?',exact=True)
        expect(modal).to_be_visible(timeout=15000)
        assert not pedidos, 'Lembrete transmitiu antes da confirmação'
        ler_cfg=lambda: page.evaluate("JSON.parse(localStorage.getItem('sf:backup:cfg'))")
        assert ler_cfg()['ultimo']==ultimo
        assert '/backup' not in page.evaluate('location.hash')
        if caso=='sem-destino':
            expect(modal.get_by_role('button',name='Escolher destino',exact=True)).to_be_visible()
            modal.get_by_role('button',name='Escolher destino',exact=True).click()
            expect(page).to_have_url(__import__('re').compile(r'#/mais/dados-backup'))
            assert not pedidos
        elif caso in ['cancelar', 'rota-fria']:
            modal.get_by_role('button',name='Agora não',exact=True).click();expect(modal).not_to_be_visible()
            assert not pedidos and ler_cfg()['ultimo']==ultimo
            # Notificação abre a confirmação em cima da página atual, não a seção de backup.
            page.evaluate("location.hash='#/?confirmarBackup=1'")
            expect(modal).to_be_visible();assert '/backup' not in page.evaluate('location.hash')
            modal.get_by_role('button',name='Agora não',exact=True).click();assert not pedidos
        else:
            if caso=='offline': ctx.set_offline(True)
            modal.get_by_role('button',name='Fazer backup',exact=True).click()
            if caso=='sucesso':
                expect(modal.get_by_role('button',name='Fazendo backup…',exact=True)).to_be_disabled(timeout=15000)
                page.wait_for_function("document.querySelector('[data-backup-rapido] [role=status]') !== null")
                assert ler_cfg()['ultimo']==ultimo, 'Data foi marcada antes do upload terminar'
                # Clique repetido no controle desabilitado não cria outro upload.
                modal.get_by_role('button',name='Fazendo backup…',exact=True).evaluate('e=>e.click()')
                page.wait_for_timeout(200)
                assert len(pendentes)==1
                assert len([x for x in pedidos if x[0]=='POST'])==1
                pendentes[0].fulfill(status=200,json={'id':'backup-ficticio-enviado'})
                expect(modal).not_to_be_visible(timeout=15000)
                expect(page.get_by_role('status').filter(has_text='Backup enviado ao Google Drive.')).to_be_visible()
                assert ler_cfg()['ultimo']!=ultimo and ler_cfg()['ultimoDestino']=='google'
                # Um novo prazo precisa voltar a pedir confirmação, mesmo sem reiniciar o app.
                page.clock.install()
                page.clock.fast_forward(8 * 24 * 60 * 60 * 1000)
                page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
                expect(modal).to_be_visible(timeout=15000)
                assert len([x for x in pedidos if x[0]=='POST'])==1, 'Novo prazo disparou envio sem confirmar'
                modal.get_by_role('button',name='Agora não',exact=True).click()
            else:
                expect(modal.get_by_role('alert')).to_be_visible(timeout=15000)
                mensagem=modal.get_by_role('alert').inner_text()
                if caso=='offline': assert 'Sem internet' in mensagem and not pedidos
                elif caso=='destino-indisponivel': assert 'não está configurado' in mensagem and not pedidos
                else: assert 'indisponível' in mensagem or '500' in mensagem
                assert ler_cfg()['ultimo']==ultimo and ler_cfg()['ultimoDestino']==destino
                assert not page.get_by_role('status').filter(has_text='Backup enviado').count()
                expect(modal.get_by_role('button',name='Fazer backup',exact=True)).to_be_enabled()
        assert not erros,erros
        print(f'PASS Backup rápido: {caso}, sem transmissão indevida e data só após sucesso real')
        ctx.close()

if __name__ == '__main__':
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
        testar_apple_opcoes(browser)
        testar_backup_rapido(browser)
        browser.close()
    print('Não testado: aparelho Apple físico; Chrome com UA Apple não é o motor Safari/WebKit.')
