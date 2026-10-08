// 分割前のシミュレーション(test/golden/legacy-sim.cjs)との一致を、毎フレームの状態全体で確かめる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { defaultConfig, loadConfig } from '../src/data/index.ts';
import type { Config } from '../src/data/index.ts';
import { hash, scripted, selfTest } from '../src/core/selftest.ts';
import { newState, step } from '../src/core/sim.ts';
import type { Input, State } from '../src/core/types.ts';

interface Legacy {
  newState(seed: number): State;
  step(s: State, i: Input): void;
  hash(s: State): number;
  scripted(f: number): Input;
  selfTest(): { ok: boolean; hash: number; kills: number };
}
/** 分割前と同じ遊びになる設定: 標準設定から空中の障害物だけを外したもの */
const legacyConfig: Config = (() => {
  const ev = structuredClone(defaultConfig.stage.events[0]) as { scenery: { air: unknown } };
  ev.scenery.air = null;
  const r = loadConfig({ stage: { events: [ev] } });
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.config;
})();
const legacy = createRequire(import.meta.url)('./golden/legacy-sim.cjs') as Legacy;

/** 別の入力列(押しっぱなし・不規則)。scripted とは違う場面を通す */
function wild(f: number): Input {
  const q = (n: number): number => Math.sin(f * n) ;
  return {
    lx: q(0.13) > 0.3 ? 1 : q(0.13) < -0.3 ? -1 : 0, ly: q(0.07), rx: q(0.21), ry: q(0.05) > 0 ? 1 : -1,
    dL: f % 53 < 3, dR: f % 71 < 3, tA: f % 7 < 5, tB: f % 90 === 0, jump: f % 41 === 0 || (f % 300 > 280),
  };
}

test('空中障害物なしの設定は、分割前と同じ決定性ハッシュ #88ea9d7f / 撃墜68', () => {
  const r = selfTest(legacyConfig);
  assert.equal(r.hash, 0x88ea9d7f);
  assert.equal(r.kills, 68);
  assert.equal(r.ok, true);
  assert.equal(legacy.selfTest().hash, r.hash);
});

for (const [name, seed, input, frames, resetHp] of [
  ['scripted / seed 20261006', 20261006, scripted, 3600, true],
  ['wild / seed 7', 7, wild, 4000, true],
  ['wild / 体力リセットなし(ゲームオーバーまで通す)', 99, wild, 5000, false],
] as const) {
  test(`毎フレームの状態が分割前と完全一致: ${name}`, () => {
    const a = legacy.newState(seed), b = newState(seed, legacyConfig);
    let overSeen = false;
    for (let f = 0; f < frames; f++) {
      legacy.step(a, input(f)); step(b, input(f), legacyConfig);
      if (resetHp) {
        if (a.p.hp < 30) a.p.hp = 100;
        if (b.p.hp < 30) b.p.hp = legacyConfig.rules.playerHp;
      }
      overSeen ||= b.over;
      // JSON 全体の一致(キー順を含む)。ずれたら最初のフレームで止める
      if (JSON.stringify(a) !== JSON.stringify(b)) assert.fail(`frame ${f} で状態が食い違いました`);
    }
    assert.equal(hash(a), hash(b));
    if (!resetHp) assert.ok(overSeen, 'このシナリオはゲームオーバーまで到達する想定');
  });
}
