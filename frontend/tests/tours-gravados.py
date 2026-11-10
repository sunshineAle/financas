# Tour padrão: WebP real, sem interface interativa dentro da demonstração.
from playwright.sync_api import sync_playwright, expect
from PIL import Image, ImageChops
from pathlib import Path
import os, json
ROOT=Path(__file__).resolve().parents[1]
URL=os.environ.get('DAGDA_TEST_URL','http://127.0.0.1:8003/').split('?')[0]+'?modo=demo'
for chave in ['regras','revisar']:
    im=Image.open(ROOT/'public-pwa/tours'/f'{chave}.webp')
    assert im.is_animated and im.n_frames>=12
    assert im.width==300 and im.height>im.width
    im.seek(0);primeiro=im.convert('RGB');im.seek(im.n_frames//2)
    assert ImageChops.difference(primeiro,im.convert('RGB')).getbbox()
    t=json.loads((ROOT/'public-pwa/tours/tempos.json').read_text())[chave]
    assert len(t['passos'])==4 and t['total']>t['passos'][-1]
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    for largura in [390,1366]:
        c=b.new_context(viewport={'width':largura,'height':844})
        c.add_init_script("localStorage.setItem('dagda-previa-demo-79-81:sf:tours',JSON.stringify({ligado:false,vistos:[]}))")
        p=c.new_page();erros=[];p.on('pageerror',lambda e:erros.append(str(e)))
        p.goto(URL,wait_until='networkidle');expect(p.locator('main')).to_be_visible(timeout=25000)
        p.evaluate("location.hash='#/manual'")
        antes=p.evaluate("async()=>JSON.stringify((await(await fetch('/api/backup/exportar')).json()).tabelas)")
        p.evaluate("window.__escritas=[];const original=window.fetch;window.fetch=function(u,o={}){if(String(u).startsWith('/api/')&&!['GET','HEAD'].includes((o.method||'GET').toUpperCase()))window.__escritas.push(String(u));return original.apply(this,arguments)}")
        for nome,chave in [('Regras','regras'),('A revisar','revisar')]:
            p.get_by_role('button',name=nome,exact=True).click()
            tour=p.locator('[data-tour]');expect(tour).to_be_visible()
            img=tour.locator('img');expect(img).to_have_count(1)
            assert img.get_attribute('src').split('?')[0].endswith(f'tours/{chave}.webp')
            p.wait_for_function("()=>document.querySelector('[data-tour] img')?.naturalWidth===300")
            assert not tour.locator('input,select,textarea,button,[data-tour-exemplos]').count()
            assert img.get_attribute('draggable')=='false'
            assert img.evaluate("e=>getComputedStyle(e).pointerEvents")=='none'
            assert tour.locator('.passos li').count()==4
            expect(tour.locator('.passos li.atual')).to_contain_text('2.',timeout=6500)
            p.screenshot(path=f'/tmp/tour-gravado-{chave}-{largura}.png')
            p.get_by_role('button',name='Pular',exact=True).click()
            expect(tour).not_to_be_visible()
        depois=p.evaluate("async()=>JSON.stringify((await(await fetch('/api/backup/exportar')).json()).tabelas)")
        assert antes==depois and p.evaluate('window.__escritas')==[]
        assert not erros,erros
        print(f'PASS tours gravados {largura}px: animação vertical, padrão original, sem controles na imagem nem alteração do banco')
        c.close()
    b.close()
