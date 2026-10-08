import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WS } from './load.js';
const { defaultConfig, loadConfig, hash, scripted, selfTest, newState, step, buildInput } = WS;
const cfgOf = (patch) => {
    const r = loadConfig(patch);
    if (!r.ok)
        throw new Error(JSON.stringify(r.errors));
    return r.config;
};
const idle = buildInput(new Set(), null);
const run = (cfg, frames, seed = 1) => {
    const s = newState(seed, cfg);
    for (let f = 0; f < frames; f++)
        step(s, scripted(f), cfg);
    return s;
};
test('倍率が1なら何も変わらない(難易度の乗数は無効化できる)', () => {
    const same = cfgOf({ rules: { enemyHpMul: 1, enemyBulletSpeedMul: 1, enemyFireRateMul: 1, spawnIntervalMul: 1 } });
    assert.equal(hash(run(same, 1500)), hash(run(defaultConfig, 1500)));
});
test('同じ設定・同じ入力なら必ず同じ結果(カスタム設定でも)', () => {
    const c = cfgOf({ rules: { playerHp: 40, enemyHpMul: 2, spawnIntervalMul: 0.5 }, weapons: { missile: { salvo: 4 } } });
    const a = selfTest(c), b = selfTest(c);
    assert.equal(a.hash, b.hash);
    assert.notEqual(a.hash, selfTest(defaultConfig).hash);
});
test('体力・ミサイル数の初期値は設定に従う', () => {
    const s = newState(1, cfgOf({ rules: { playerHp: 37, missileMax: 5 } }));
    assert.equal(s.p.hp, 37);
    assert.equal(s.p.ammoB, 5);
});
test('enemyHpMul が敵の体力に効く(四捨五入・最低1)', () => {
    const hpOf = (mul) => {
        const c = cfgOf({ rules: { enemyHpMul: mul, spawnIntervalMul: 0.1 } });
        const s = run(c, 120);
        return s.en.filter((e) => e.type === 'dart').map((e) => e.hp);
    };
    assert.ok(hpOf(1).length > 0 && hpOf(1).every((h) => h === 2 || h === 1));
    assert.ok(hpOf(0.1).every((h) => h === 1));
});
test('時刻指定の配置(spawn)は、決まったフレームに決まった位置へ出る', () => {
    const c = cfgOf({
        stage: { events: [{ op: 'spawn', t: 10, enemy: 'turret', x: -6, y: null, count: 3, interval: 20, dx: 6, dy: 0 }] },
    });
    const s = newState(5, c);
    const seen = [];
    const known = new Set();
    for (let f = 0; f < 80; f++) {
        step(s, idle, c);
        for (const e of s.en)
            if (!known.has(e.id)) {
                known.add(e.id);
                seen.push({ t: s.t - 1, x: e.x });
            }
    }
    assert.deepEqual(seen, [{ t: 10, x: -6 }, { t: 30, x: 0 }, { t: 50, x: 6 }]);
    assert.equal(s.seed, 5 | 0, '乱数を使わない(シードが進まない)');
});
test('procedural が無いステージでは敵は時刻指定のものだけ', () => {
    const c = cfgOf({ stage: { events: [{ op: 'scenery', t: 0, kind: 'pil', x: 3, count: 2, interval: 5, dx: 1 }] } });
    const s = newState(1, c);
    for (let f = 0; f < 600; f++)
        step(s, idle, c);
    assert.equal(s.en.length, 0);
    assert.equal(s.kills, 0);
});
test('procedural の開始・終了時刻の外では何も出ない', () => {
    const ev = structuredClone(defaultConfig.stage.events[0]);
    ev.t = 100;
    ev.until = 200;
    const c = cfgOf({ stage: { events: [ev] } });
    const s = newState(2, c);
    let first = -1, last = -1;
    const known = new Set();
    for (let f = 0; f < 400; f++) {
        step(s, idle, c);
        for (const e of s.en)
            if (!known.has(e.id)) {
                known.add(e.id);
                if (first < 0)
                    first = f;
                last = f;
            }
    }
    assert.ok(first >= 100 && last < 200, `${first}..${last}`);
});
test('シミュレーションは設定を書き換えない(凍結されているので書けば例外になる)', () => {
    assert.doesNotThrow(() => run(defaultConfig, 1200));
});
test('ゲームオーバー後は状態が進まず、スコアと撃墜数も止まる', () => {
    const c = cfgOf({ rules: { playerHp: 1, contactDamage: 5, enemyBulletDamage: 5, obstacleDamage: 5 } });
    const s = newState(3, c);
    let f = 0;
    for (; f < 6000 && !s.over; f++)
        step(s, idle, c);
    assert.ok(s.over, 'ゲームオーバーに到達する');
    const score = s.score, kills = s.kills, dist = s.dist;
    for (let i = 0; i < 100; i++)
        step(s, scripted(i), c);
    assert.equal(s.score, score);
    assert.equal(s.kills, kills);
    assert.equal(s.dist, dist);
});
