# Requer a compilação atual da prévia servida em DAGDA_TEST_URL (padrão porta 8001).
# Só usa banco fictício de um perfil de navegador descartável.
from playwright.sync_api import sync_playwright, expect
import os, re
URL = os.environ.get('DAGDA_TEST_URL', 'http://127.0.0.1:8001/')
URL = URL.split('?')[0] + '?modo=demo'
def api(page, method, url, body=None):
    return page.evaluate("""async ([method,url,body])=>{
      const r=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
      const j=await r.json();if(!r.ok)throw Error(JSON.stringify(j));return j;
    }""", [method,url,body])
with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    for width in [390, 1366]:
        contexto = browser.new_context(viewport={'width':width,'height':900})
        page = contexto.new_page(); erros=[]
        page.on('pageerror', lambda e: erros.append(str(e)))
        page.goto(URL,wait_until='networkidle');expect(page.locator('main')).to_be_visible(timeout=20000)
        page.evaluate("localStorage.setItem('sf:tours',JSON.stringify({ligado:false}))")
        if page.get_by_role('button',name='Pular',exact=True).is_visible():
            page.get_by_role('button',name='Pular',exact=True).click(force=True)
        criadas=[]
        for n in range(1,5):
            resposta=api(page,'POST','/api/regras',{'tipo':'transferencia','padrao':f'Regra teste {n}'})
            criadas.append(resposta['regra'])
            assert criadas[-1]['criado_em']
        api(page,'PUT',f"/api/regras/{criadas[0]['id']}",{'padrao':'Regra antiga editada'})
        page.evaluate("location.hash='#/regras'")
        bloco=page.locator('[data-bloco-regras="transferencia"]')
        expect(bloco.locator('.regra-item')).to_have_count(3)
        texto=bloco.locator('.lista').inner_text()
        assert 'Regra teste 4' in texto and 'Regra teste 3' in texto and 'Regra teste 2' in texto
        assert 'Regra antiga editada' not in texto
        adicionar=bloco.get_by_role('button',name='Adicionar em Regras de transferência',exact=True)
        pos=adicionar.bounding_box();titulo=bloco.locator('h2').bounding_box()
        cab=bloco.locator('.cab-bloco').bounding_box()
        assert pos['x'] > titulo['x'] and abs(pos['y']-titulo['y']) < 5
        assert abs((pos['x']+pos['width'])-(cab['x']+cab['width'])) < 2
        assert pos['width'] >= 44 and pos['height'] >= 44
        cols=page.locator('.grade-regras').evaluate("e=>getComputedStyle(e).gridTemplateColumns.split(' ').length")
        assert cols == (1 if width==390 else 2)
        ver=bloco.get_by_role('button',name=re.compile('Ver todas as regras'))
        ver.click()
        lista=page.get_by_role('dialog',name='Regras de transferência',exact=True)
        expect(lista).to_be_visible();expect(lista.locator('.regra-item')).to_have_count(5)
        # Editar dentro da lista abre uma janela por vez e cancelar devolve a lista completa.
        lista.get_by_role('button',name=re.compile('Editar regra Regra antiga editada')).click()
        expect(page.get_by_role('dialog',name='Editar regra',exact=True)).to_be_visible()
        expect(page.get_by_role('dialog')).to_have_count(1)
        page.get_by_role('dialog',name='Editar regra',exact=True).get_by_role('button',name='Fechar',exact=True).click()
        expect(lista).to_be_visible();expect(lista.locator('.regra-item')).to_have_count(5)
        page.keyboard.press('Escape');expect(lista).not_to_be_visible()
        expect(ver).to_be_focused()
        adicionar.click()
        expect(page.get_by_role('dialog',name='Nova regra de transferência',exact=True)).to_be_visible()
        page.get_by_role('dialog').get_by_role('button',name='Fechar',exact=True).click()
        # Categoria vazia continua visível e não abre uma janela sem conteúdo.
        vazio=page.locator('[data-bloco-regras="entrada"]')
        if not vazio.locator('.regra-item').count():
            expect(vazio.get_by_role('button',name=re.compile('Ver todas as regras'))).to_be_disabled()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path=f'/tmp/regras-92-{width}.png',full_page=True)
        assert not erros,erros
        print(f'PASS Regras em {width}px: três por criação, edição não reordena, lista completa, retorno e foco, + na extremidade oposta por tipo, sem overflow')
        contexto.close()
    browser.close()
