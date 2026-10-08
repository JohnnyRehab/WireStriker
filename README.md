# ワイヤー・ストライカー

ノーテクスチャのワイヤーフレーム(WebGL2)で描く、ハリアー型のシューティング。将来の「バーチャロン風」対戦ゲームの土台。
TypeScript + esbuild。シミュレーションは描画・DOM から独立していて、設定は JSON です。

## コマンド

| コマンド | 内容 |
|---|---|
| `npm install` | 依存の導入(typescript, esbuild, @types/node) |
| `npm run typecheck` | 型検査 |
| `npm test` | 単体テスト(Node 22.18 以降。TypeScript をそのまま実行) |
| `npm run build` | `dist/index.html`(単独で開ける)と `dist/artifact.html`(公開用の断片) |
| `npm run check` | 上の3つを順に |
| `python3 test/browser/smoke.py` | 実ブラウザでの起動・操作・スマホ幅・GL 復帰の確認(要 Playwright、先に build) |
| `python3 test/browser/parity.py` | 分割前との描画のピクセル一致の確認(同上、遅い) |

`dist/index.html#debug` で開くと `window.__ws`(状態・設定・`apply(patch)`)が使えます。

## 構成

```
src/
  data/    types.ts(型) default.json(標準設定) validate.ts(検証) index.ts(読み込み・重ね合わせ)
  core/    sim.ts(1フレーム) rng.ts types.ts selftest.ts(決定性テスト)  ← DOM/GL に触れない
  render/  renderer.ts geometry.ts(形状データ) matrix.ts shaders.ts
  input/   input.ts(キー/パッド→Input、純粋関数)
  ui/      hud.ts style.css body.html
  main.ts  ループと状態遷移
test/      *.test.ts と golden/(分割前のシミュレーション。編集禁止)、browser/
```

## 設定(E1)

調整値・敵・ステージは `src/data/default.json`。`validateConfig` を通ったものだけがシミュレーションに渡り、通った結果は凍結されます。
`loadConfig({rules:{playerHp:60}})` のように、標準設定へ一部だけ重ねて使えます。

- `rules` … 難易度。倍率(`enemyHpMul` など)は 1 で無効。
- `player` / `weapons` … 動きと武器の値。
- `enemies` … 敵の定義(体力・半径・出現位置の乱数仕様・AI)。AI は `dart` / `turret` / `heavy` の3種。
- `stage.events` … `procedural`(乱数で出し続ける区間。1つまで)、`spawn` / `scenery`(時刻指定の配置)。

注意: 時刻指定の配置は状態を持たず、フレーム番号だけで決まる。`procedural` はタイマーを状態に持つので、途中のフレームから始めるには状態ごと復元する必要がある。

## 空中障害物

障害物(`stage.scenery`)は底の高さ `y` と高さ `height` を持ち、自機の体(足元から3.5)がその範囲に重なると当たる。`y:0` は地面の柱や岩、`y>0` は宙に浮く物(`crystal`)。`procedural.scenery.air` で出現率と出す幅を決める。飛び続けても被害を受けるようにするための設計。操作方針ごとの被弾回数は `node tools/survey.ts` で測れる。

## 守っていること

- 標準設定の決定性ハッシュは `#7b69d840`(3600フレーム・撃墜62)。空中障害物を外した設定は、分割前の `#88ea9d7f`(撃墜68)と毎フレーム JSON 全体が一致する(`test/golden.test.ts`)。
- 乱数はシミュレーションの状態の一部。描画用の乱数(画面の揺れ)は別。
