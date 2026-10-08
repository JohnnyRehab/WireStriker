"""2つの index.html(例: 以前のビルド版と今の版)で、同じ状態の描画がピクセル一致するか比べる。使い方: python3 compare_builds.py A.html B.html"""
import sys, io, os
import numpy as np
from PIL import Image
from common import ROOT, SCRIPTED_JS, launch
from playwright.sync_api import sync_playwright
import pathlib

def snap(b, url, frames):
    page = b.new_page(viewport={"width": 1280, "height": 720})
    page.route("**/fonts.g*/**", lambda r: r.abort())
    page.goto(url + "#debug"); page.wait_for_timeout(500)
    page.keyboard.press("Enter"); page.wait_for_timeout(150); page.keyboard.press("KeyP"); page.wait_for_timeout(150)
    page.add_style_tag(content="#ov{display:none!important}#lock{animation:none!important}")
    page.evaluate(f"""()=>{{const sc={SCRIPTED_JS};const w=__ws,t=w.newState(20261006,w.cfg);
      for(let f=0;f<{frames};f++){{w.step(t,sc(f),w.cfg);if(t.p.hp<30)t.p.hp=100;}}
      const S=w.S;for(const k of Object.keys(S))delete S[k];Object.assign(S,JSON.parse(JSON.stringify(t)));}}""")
    page.evaluate("()=>new Promise(r=>{let n=0;const f=()=>{if(++n>=70)r();else requestAnimationFrame(f)};requestAnimationFrame(f)})")
    sh = page.evaluate("__ws.S.shake")
    im = Image.open(io.BytesIO(page.screenshot())).convert("RGB"); page.close()
    return im, sh

a, c = [pathlib.Path(p).resolve().as_uri() for p in sys.argv[1:3]]
bad = 0
with sync_playwright() as p:
    b = launch(p)
    for frames in [int(v) for v in os.environ.get('FR','1500,2600').split(',')]:
        (x, sx), (y, sy) = snap(b, a, frames), snap(b, c, frames)
        if sx or sy: print("SKIP 画面揺れ中", frames); continue
        Image.fromarray(np.clip(np.abs(np.asarray(x,dtype=np.int16)-np.asarray(y,dtype=np.int16))*8,0,255).astype(np.uint8)).save(ROOT/f'test/browser/out/cmp-{frames}.png'); x.save(ROOT/f'test/browser/out/cmpA-{frames}.png'); y.save(ROOT/f'test/browser/out/cmpB-{frames}.png')
        n = int((np.abs(np.asarray(x, dtype=np.int16) - np.asarray(y, dtype=np.int16)).max(axis=2) > 0).sum())
        print(("OK   " if n == 0 else "FAIL ") + f"frames={frames}: 差のあるピクセル {n}"); bad += n != 0
sys.exit(1 if bad else 0)
