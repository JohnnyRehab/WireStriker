import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInput } from '../src/input/input.ts';

test('キーボード: WASD と矢印、Q/E=ダッシュ、Z/X=武器、Space=ジャンプ', () => {
  const i = buildInput(new Set(['KeyD', 'KeyW', 'ArrowLeft', 'KeyQ', 'KeyZ', 'Space']), null);
  assert.deepEqual(i, { lx: 1, ly: 1, rx: -1, ry: 0, dL: true, dR: false, tA: true, tB: false, jump: true });
});

test('ゲームパッド: デッドゾーン20%、強い方を採用、ボタンを合算', () => {
  const pad = {
    connected: true, axes: [0.1, -0.9, 0.5, 0],
    buttons: Array.from({ length: 8 }, (_, n) => ({ pressed: n === 5 || n === 6, value: 0 })),
  };
  const i = buildInput(new Set(['KeyA']), pad);
  assert.equal(i.lx, -1, 'キーの -1 の方が強い');
  assert.equal(i.ly, 0.9, 'Y 軸は反転して上が正');
  assert.equal(i.rx, 0.5);
  assert.ok(i.dR && i.tA && !i.tB && !i.dL);
});
