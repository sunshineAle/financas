# Taransi/Sarutahiko: Chromium e UAs simulados. Não representa teste físico de iOS/WebKit.
# Prompt de instalação é simulado; cache e service worker executam de verdade no build oficial local.
from playwright.sync_api import sync_playwright, expect
from urllib.parse import urlparse
import os
URL=os.environ.get('DAGDA_TEST_URL','http://127.0.0.1:8005/financas/').split('?')[0]
assert urlparse(URL).hostname in ['localhost','127.0.0.1'], 'Teste somente em build local'
CASES=[
 ('iPhone Safari','Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1','iPhone',5,'Como instalar','Instalar no iPhone ou iPad'),
 ('iPad desktop','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15','MacIntel',5,'Como instalar','Instalar no iPhone ou iPad'),
 ('Mac Safari','Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15','MacIntel',0,'Como instalar','Instalar no Mac'),
 ('Android Chrome','Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36','Linux armv8l',5,'Instalar aplicativo','Instalar o Dagda Capital'),
 ('Windows Chrome',None,'Win32',0,'Instalar aplicativo','Instalar o Dagda Capital'),
]
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for name,ua,platform,touch,label,title in CASES:
  c=b.new_context(viewport={'width':1366 if name.startswith(('Windows','Mac')) else 390,'height':844},**({'user_agent':ua} if ua else {}))
  c.add_init_script(f"Object.defineProperty(navigator,'platform',{{get:()=>{platform!r}}});Object.defineProperty(navigator,'maxTouchPoints',{{get:()=>{touch}}})")
  p=c.new_page();errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
  p.goto(URL+'?modo=demo',wait_until='networkidle');expect(p.locator('[data-escolher-acesso]')).to_be_visible()
  assert not p.locator('#faixa-previa,#exemplo-previa,#reiniciar-previa').count()
  assert not p.evaluate('typeof window.__SF_ABRIR_DEMO!=="undefined" || typeof window.__SF_REINICIAR_PREVIA!=="undefined"')
  p.evaluate('window.__sfInstalar=null')
  button=p.get_by_role('button',name=label,exact=True);expect(button).to_be_visible();button.click()
  m=p.get_by_role('dialog',name=title,exact=True);expect(m).to_be_visible()
  assert not m.locator('[data-instalacao-previa]').count()
  assert 'usando o recurso do seu navegador' in m.inner_text()
  for key in ['Tab']*4+['Shift+Tab']*4:
   p.keyboard.press(key);assert m.evaluate('e=>e.contains(document.activeElement)')
  m.get_by_role('button',name='Entendi',exact=True).click();expect(m).not_to_be_visible()
  expect(button).to_be_focused()
  print(f'PASS Taransi {name}: orientação adaptada, foco, sem prévia ou auto-demo')
  if name=='Windows Chrome':
   for outcome in ['accepted','dismissed','expired']:
    p.evaluate('''outcome=>{window.__convites=0;const e=new Event('beforeinstallprompt',{cancelable:true});e.prompt=()=>{window.__convites++;return outcome==='expired'?Promise.reject(Error('vencido')):Promise.resolve()};e.userChoice=Promise.resolve({outcome});window.dispatchEvent(e)}''',outcome)
    button.click()
    p.wait_for_function('window.__convites===1')
    assert p.evaluate('window.__sfInstalar===null')
    if outcome=='expired':
     expect(p.get_by_role('dialog',name=title,exact=True)).to_be_visible()
     p.get_by_role('button',name='Entendi',exact=True).click()
    else:assert not p.get_by_role('dialog',name=title,exact=True).count()
   p.evaluate("window.dispatchEvent(new Event('appinstalled'))");expect(button).not_to_be_visible()
   print('PASS Taransi convite nativo simulado: aceito/dispensado/vencido e appinstalled')
   p.wait_for_function('navigator.serviceWorker.controller!==null',timeout=30000)
   scope=p.evaluate('async()=> (await navigator.serviceWorker.ready).scope');assert scope==URL,scope
   # Primeira consulta das animações ocorre já offline; query nova exercita URL com versão.
   c.set_offline(True)
   for key in ['regras','revisar']:
    r=p.evaluate("async u=>{const r=await fetch(u);return {ok:r.ok,size:(await r.arrayBuffer()).byteLength}}",URL+f'tours/{key}.webp?taransi=offline-primeira-abertura')
    assert r['ok'] and r['size']>50000,r
   p.reload(wait_until='domcontentloaded');expect(p.locator('[data-escolher-acesso]')).to_be_visible(timeout=20000)
   print('PASS Taransi service worker: escopo /financas/, primeira consulta offline dos tours e reabertura offline')
  assert not errors,errors
  c.close()
 b.close()
