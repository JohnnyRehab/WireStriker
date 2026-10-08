"""分割前(test/golden/legacy-index.html)と分割後(dist/index.html)で、同じ状態の描画がピクセル一致するか比べる"""
import sys, io, os
import numpy as np
from PIL import Image
from common import ROOT, SCRIPTED_JS, launch, watch, ignorable
from playwright.sync_api import sync_playwright

LEGACY = ROOT / "test/browser/out/legacy-wrapped.html"
frag = (ROOT / "test/golden/legacy-index.html").read_text()
LEGACY.write_text('<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + frag + '</body></html>')
NEW = ROOT / "index.html"

def snap(page, url, frames, withCfg):
    page.route("**/fonts.g*/**", lambda r: r.abort())
    page.goto(url + "#debug"); page.wait_for_timeout(500)
    page.keyboard.press("Enter"); page.wait_for_timeout(150); page.keyboard.press("KeyP"); page.wait_for_timeout(150)
    page.add_style_tag(content="#ov{display:none!important}#lock{animation:none!important}")
    page.evaluate(f"""()=>{{
      const sc={SCRIPTED_JS};
      const w=__ws, t=w.newState(20261006{', w.cfg' if withCfg else ''});
      for(let f=0;f<{frames};f++){{w.step(t,sc(f){', w.cfg' if withCfg else ''});if(t.p.hp<30)t.p.hp=100;}}
      const S=w.S; for(const k of Object.keys(S))delete S[k]; Object.assign(S,JSON.parse(JSON.stringify(t)));
    }}""")
    # カメラの追従(1フレームごとに近づく)が収束するまで、描画フレームを数えて待つ
    page.evaluate("()=>new Promise(r=>{let n=0;const f=()=>{if(++n>="+os.environ.get('PARITY_WAIT','70')+")r();else requestAnimationFrame(f)};requestAnimationFrame(f)})")
    return Image.open(io.BytesIO(page.screenshot())).convert("RGB")

fails = 0
with sync_playwright() as p:
    b = launch(p)
    for vp in [v for v in [(1280, 720), (390, 760)] if os.environ.get('PARITY_VP') in (None, str(v[0]))]:
        for frames in [f for f in (700, 1500, 2600) if os.environ.get('PARITY_FRAMES') in (None, str(f))]:
            ims = []
            for url, cfgf in [(LEGACY.as_uri(), False), (NEW.as_uri(), True)]:
                page = b.new_page(viewport={"width": vp[0], "height": vp[1]}); errs = []; watch(page, errs)
                # 画面揺れが乱数なので、shake が 0 のフレームだけ比較できる
                im = snap(page, url, frames, cfgf)
                shake = page.evaluate("__ws.S.shake")
                ims.append((im, shake)); page.close()
            (a, sa), (c, sc_) = ims
            if sa or sc_:
                print(f"SKIP {vp} frames={frames}: 画面揺れ中 (shake={sa},{sc_})"); continue
            d = np.abs(np.asarray(a, dtype=np.int16) - np.asarray(c, dtype=np.int16))
            n = int((d.max(axis=2) > 0).sum()); mx = int(d.max())
            ok = n == 0
            print(("OK   " if ok else "FAIL ") + f"{vp} frames={frames}: 差のあるピクセル {n} / 最大差 {mx}")
            if not ok:
                fails += 1
                Image.fromarray(np.clip(d * 8, 0, 255).astype(np.uint8)).save(ROOT / f"test/browser/out/parity-diff-{vp[0]}-{frames}.png")
    b.close()
sys.exit(1 if fails else 0)
