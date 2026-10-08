"""ブラウザ検証の共通部分。Playwright(Python)と同梱の Chromium を使う。"""
import pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]


def launch(p):
    return p.chromium.launch(args=ARGS)


def watch(page, errors):
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))


def ignorable(e):
    # 外部フォントを読めない環境での失敗は問題にしない
    return "fonts.g" in e or "ERR_" in e or "Failed to load resource" in e


# 1フレームごとに scripted と同じ入力列を作る関数(JS 側)
SCRIPTED_JS = """
(f)=>{const a=f*0.031;return{lx:Math.sin(a),ly:Math.cos(a*1.3),rx:Math.sin(a*0.7),ry:Math.sin(a*0.4),
dL:f%97>=10&&f%97<14,dR:f%131>=40&&f%131<44,tA:(f%60)<40,tB:f%200===150,jump:f%173===5};}
"""
