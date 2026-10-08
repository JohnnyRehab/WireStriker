"""dist/index.html を実ブラウザで開いて確かめる: 起動・決定性テスト・操作・スマホ幅・GL エラー・コンテキスト喪失復帰"""
import sys, pathlib
from common import ROOT, launch, watch, ignorable
from playwright.sync_api import sync_playwright

url = (ROOT / "index.html").as_uri() + "#debug"
fails = []
def check(ok, msg):
    print(("OK   " if ok else "FAIL ") + msg)
    if not ok: fails.append(msg)

with sync_playwright() as p:
    b = launch(p)
    for name, vp in [("desktop", (1280, 720)), ("phone", (390, 760))]:
        page = b.new_page(viewport={"width": vp[0], "height": vp[1]})
        errs = []; watch(page, errs)
        page.goto(url); page.wait_for_timeout(800)
        st = page.inner_text("#st")
        check("決定性テスト OK #7b69d840 / 3600f / 撃墜62" in st, f"[{name}] 決定性テスト表示: {st}")
        check(page.evaluate("document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight"), f"[{name}] ページがはみ出さない")
        page.screenshot(path=str(ROOT / f"test/browser/out/shot-{name}-title.png"))
        page.keyboard.press("Enter"); page.wait_for_timeout(300)
        check(page.evaluate("__ws.mode")=="play", f"[{name}] Enter で開始")
        page.keyboard.down("KeyZ"); page.keyboard.down("ArrowRight"); page.keyboard.down("KeyW")
        page.wait_for_timeout(2500)
        t = page.evaluate("__ws.S.t"); check(t > 20, f"[{name}] 時間が進む t={t}")
        check(page.evaluate("__ws.S.bl.length>0"), f"[{name}] バルカンが出る")
        page.keyboard.press("KeyP"); page.wait_for_timeout(100)
        check(page.evaluate("__ws.mode")=="pause", f"[{name}] P で一時停止")
        t1 = page.evaluate("__ws.S.t"); page.wait_for_timeout(300)
        check(page.evaluate("__ws.S.t")==t1, f"[{name}] 一時停止中は進まない")
        page.screenshot(path=str(ROOT / f"test/browser/out/shot-{name}-pause.png"))
        # 長めに実行してスクリーンショット
        page.keyboard.press("Enter"); page.wait_for_timeout(6000)
        page.screenshot(path=str(ROOT / f"test/browser/out/shot-{name}-play.png"))
        check(page.evaluate("document.documentElement.scrollWidth<=innerWidth"), f"[{name}] プレイ中もはみ出さない")
        bad = [e for e in errs if not ignorable(e)]
        check(not bad, f"[{name}] コンソールにエラー・警告なし {bad[:3]}")
        page.close()

    # 空中障害物の見た目(一時停止中の状態に置いて撮る)
    page = b.new_page(viewport={"width": 1280, "height": 720}); page.route("**/fonts.g*/**", lambda r: r.abort())
    page.goto(url); page.wait_for_timeout(400)
    page.keyboard.press("Enter"); page.wait_for_timeout(200); page.keyboard.press("KeyP")
    page.evaluate("""()=>{const S=__ws.S;S.sc.length=0;S.en.length=0;for(const [x,z,t,h,r] of [[-3,40,'flt',3.5,1.8],[4,60,'flt',3.5,1.8],[0,80,'pil',5,0.9],[-6,100,'flt',3.5,1.8]])S.sc.push({t,x,z,h,r});}""")
    page.evaluate("()=>new Promise(r=>{let n=0;const f=()=>{if(++n>=40)r();else requestAnimationFrame(f)};requestAnimationFrame(f)})")
    page.add_style_tag(content="#ov{display:none!important}")
    page.screenshot(path=str(ROOT / "test/browser/out/shot-air.png")); page.close()
    # デバッグ用 apply: 不正な設定は適用されず、正しい設定は反映される
    page = b.new_page(viewport={"width": 1280, "height": 720}); errs = []; watch(page, errs)
    page.goto(url); page.wait_for_timeout(500)
    msg = page.evaluate("__ws.apply({rules:{playerHp:-1}})")
    check(bool(msg) and "playerHp" in msg, f"不正な設定は拒否される: {msg}")
    check(page.evaluate("__ws.cfg.rules.playerHp")==100, "拒否後も設定は元のまま")
    check(page.evaluate("__ws.apply({rules:{playerHp:40,missileMax:6}})") is None, "正しい設定は適用される")
    check(page.evaluate("document.querySelectorAll('#pips i').length")==6, "ミサイル数のピップが設定に追従")
    check(page.evaluate("__ws.S.p.hp")==40, "体力の初期値が設定に追従")
    # WebGL コンテキスト喪失→復帰
    page.evaluate("""()=>{const c=document.getElementById('gl');const g=c.getContext('webgl2');const x=g.getExtension('WEBGL_lose_context');window.__x=x;x.loseContext();}""")
    page.wait_for_timeout(300)
    page.evaluate("window.__x.restoreContext()"); page.wait_for_timeout(600)
    page.keyboard.press("Enter"); page.wait_for_timeout(500)
    t0 = page.evaluate("__ws.S.t"); page.wait_for_timeout(2500)
    t1 = page.evaluate("__ws.S.t")
    check(page.evaluate("__ws.mode")=="play" and t1 > t0, f"コンテキスト復帰後も進行する t {t0}→{t1}")
    bad = [e for e in errs if not ignorable(e) and "WebGL" not in e and "Context" not in e]
    check(not bad, f"apply/復帰でエラーなし {bad[:3]}")
    b.close()

print("\n結果:", "すべて成功" if not fails else f"{len(fails)} 件失敗")
sys.exit(1 if fails else 0)
