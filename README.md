# ワイヤー・ストライカー

ノーテクスチャのワイヤーフレーム(WebGL2)で描く、ハリアー型のシューティング。将来の「バーチャロン風」対戦ゲームの土台。
**ビルドもコンパイルも要りません。`index.html` を開くだけで動きます**(ダブルクリックでよい。外部フォントだけネットから読みます)。
素の JavaScript を `<script src>` で順に読む作りで、ファイル間は1つの名前空間 `WS` で受け渡します。

## コマンド(開発者向け。遊ぶだけなら不要)

| コマンド | 内容 |
|---|---|
| `node --test "test/*.test.js"` | 単体テスト(Node 22 以降。インストール不要) |
| `node tools/survey.js` | 操作方針ごとの被弾回数を測る(難易度設計の材料) |
| `node tools/make-artifact.js` | 公開用に1枚へまとめた `artifact.html` を作る(公開専用) |
| `python3 test/browser/smoke.py` | 実ブラウザでの起動・操作・スマホ幅・GL 復帰の確認(要 Playwright) |
| `python3 test/browser/compare_builds.py A.html B.html` | 2つの版で描画が画素単位で一致するか |

`index.html#debug` で開くと `window.__ws`(状態・設定・`apply(patch)`)が使えます。
型は `js/types.d.ts` に参考として残していますが、実行には使いません(型の検査はしていません。代わりにテストで守ります)。

## 構成

```
index.html  style.css
js/
  data/    default-config.js(標準設定) validate.js(検証) config.js(読み込み・重ね合わせ)
  core/    sim.js(1フレーム) rng.js selftest.js(決定性テスト)  ← DOM/GL に触れない
  render/  renderer.js geometry.js(形状データ) matrix.js shaders.js
  input/   input.js(キー/パッド→Input、純粋関数)
  ui/      hud.js
  main.js  ループと状態遷移
  types.d.ts  型の参考資料
test/      *.test.js と load.js(index.html の script を同じ順に読む) golden/(分割前のシミュレーション。編集禁止) browser/
tools/     survey.js make-artifact.js
```

## 設定(E1)

調整値・敵・ステージは `js/data/default-config.js`。`validateConfig` を通ったものだけがシミュレーションに渡り、通った結果は凍結されます。
`loadConfig({rules:{playerHp:60}})` のように、標準設定へ一部だけ重ねて使えます。

- `rules` … 難易度。倍率(`enemyHpMul` など)は 1 で無効。
- `player` / `weapons` … 動きと武器の値。
- `enemies` … 敵の定義(体力・半径・出現位置の乱数仕様・AI)。AI は `dart` / `turret` / `heavy` の3種。
- `stage.events` … `procedural`(乱数で出し続ける区間。1つまで)、`spawn` / `scenery`(時刻指定の配置)。

注意: 時刻指定の配置は状態を持たず、フレーム番号だけで決まる。`procedural` はタイマーを状態に持つので、途中のフレームから始めるには状態ごと復元する必要がある。

## 空中障害物

障害物(`stage.scenery`)は底の高さ `y` と高さ `height` を持ち、自機の体(足元から3.5)がその範囲に重なると当たる。`y:0` は地面の柱や岩、`y>0` は宙に浮く物(`crystal`)。`procedural.scenery.air` で出現率と出す幅を決める。飛び続けても被害を受けるようにするための設計。操作方針ごとの被弾回数は `node tools/survey.js` で測れる。

## 守っていること

- 標準設定の決定性ハッシュは `#7b69d840`(3600フレーム・撃墜62)。空中障害物を外した設定は、分割前の `#88ea9d7f`(撃墜68)と毎フレーム JSON 全体が一致する(`test/golden.test.js`)。
- 乱数はシミュレーションの状態の一部。描画用の乱数(画面の揺れ)は別。
