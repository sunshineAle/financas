"""Gera o ícone PROVISÓRIO do PWA (esfera de vidro, degradê Violeta #5E18D8 -> Petróleo #1597A8, sem texto).
Quando a logo definitiva chegar, troque a função `esfera` (ou substitua os PNGs de public-pwa/icons) e rode:
  python3 scripts/gerar-icone-pwa.py
Saídas: public-pwa/icons/icon-192.png, icon-512.png, icon-512-maskable.png, apple-touch-icon.png (180)."""
import os
from PIL import Image, ImageDraw, ImageFilter
VIOLETA, PETROLEO, FUNDO = (0x5E, 0x18, 0xD8), (0x15, 0x97, 0xA8), (0x14, 0x14, 0x13)
SAIDA = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public-pwa', 'icons')
S = 4  # supersampling

def mix(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def esfera(tam, fracao, fundo_cheio):
    n = tam * S
    img = Image.new('RGBA', (n, n), FUNDO + (255,) if fundo_cheio else (0, 0, 0, 0))
    d = int(n * fracao); x0 = (n - d) // 2
    # degradê diagonal violeta -> petróleo
    grad = Image.new('RGBA', (d, d))
    px = grad.load()
    for y in range(d):
        for x in range(d):
            px[x, y] = mix(VIOLETA, PETROLEO, (x + y) / (2 * d - 2)) + (255,)
    # sombra interna (borda mais escura) para volume
    vol = Image.new('L', (d, d), 0); dv = ImageDraw.Draw(vol)
    dv.ellipse((0, 0, d - 1, d - 1), fill=255)
    escuro = Image.new('RGBA', (d, d), (10, 6, 40, 120))
    miolo = Image.new('L', (d, d), 0); ImageDraw.Draw(miolo).ellipse((int(d * .08), int(d * .04), int(d * .92), int(d * .88)), fill=255)
    miolo = miolo.filter(ImageFilter.GaussianBlur(d * .09))
    grad = Image.composite(grad, Image.alpha_composite(grad, escuro), miolo)
    # brilho de vidro (elipse no alto-esquerda) e reflexo inferior suave
    luz = Image.new('RGBA', (d, d), (0, 0, 0, 0)); dl = ImageDraw.Draw(luz)
    dl.ellipse((int(d * .14), int(d * .08), int(d * .66), int(d * .42)), fill=(255, 255, 255, 120))
    luz = luz.filter(ImageFilter.GaussianBlur(d * .025))
    grad = Image.alpha_composite(grad, luz)
    baixo = Image.new('RGBA', (d, d), (0, 0, 0, 0)); db = ImageDraw.Draw(baixo)
    db.ellipse((int(d * .30), int(d * .70), int(d * .80), int(d * .96)), fill=(120, 240, 235, 60))
    baixo = baixo.filter(ImageFilter.GaussianBlur(d * .04))
    grad = Image.alpha_composite(grad, baixo)
    grad.putalpha(vol.filter(ImageFilter.GaussianBlur(1)))
    img.alpha_composite(grad, (x0, x0))
    return img.resize((tam, tam), Image.LANCZOS)

os.makedirs(SAIDA, exist_ok=True)
esfera(192, .86, False).save(os.path.join(SAIDA, 'icon-192.png'))
esfera(512, .86, False).save(os.path.join(SAIDA, 'icon-512.png'))
esfera(512, .58, True).save(os.path.join(SAIDA, 'icon-512-maskable.png'))   # zona segura do maskable (~80% -> 58% de folga)
esfera(180, .70, True).convert('RGB').save(os.path.join(SAIDA, 'apple-touch-icon.png'))
print('ícones gerados em', os.path.normpath(SAIDA))
