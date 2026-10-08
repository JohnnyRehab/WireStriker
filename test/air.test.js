import { test } from 'node:test';
import assert from 'node:assert/strict';
import { survey } from '../tools/survey.js';
import { WS } from './load.js';
const { defaultConfig, loadConfig, validateConfig, selfTest, PLAYER_H, PZ, newState, step, buildCrystal, grad, buildInput } = WS;
const quiet = () => {
    const r = loadConfig({ stage: { events: [] } });
    if (!r.ok)
        throw new Error(JSON.stringify(r.errors));
    return r.config;
};
const idle = buildInput(new Set(), null);
/** 高さ y の自機の前に、種類 kind の障害物を1つ置いて1フレーム進め、被弾したかを返す */
function hits(cfg, kind, py) {
    const s = newState(1, cfg);
    const d = cfg.stage.scenery[kind];
    s.p.y = py;
    s.sc.push({ t: kind, x: 0, z: PZ + cfg.rules.scrollSpeed, h: d.height, r: d.radius });
    step(s, idle, cfg);
    return s.p.hp < cfg.rules.playerHp;
}
test('浮いた障害物(y=5, 高さ3.5): 低く構えれば避けられ、中空・高空では当たる', () => {
    const c = quiet();
    assert.equal(hits(c, 'flt', 0), false, '地上');
    assert.equal(hits(c, 'flt', 5 - PLAYER_H - 0.4), false, '頭が底に届かない高さ');
    assert.equal(hits(c, 'flt', 5 - PLAYER_H + 0.4), true, '頭が底に届く高さ');
    assert.equal(hits(c, 'flt', 8), true, '最高高度でも上を抜けられない');
});
test('地上の柱(高さ5)は従来どおり: 高く飛べば越えられる', () => {
    const c = quiet();
    assert.equal(hits(c, 'pil', 2), true);
    assert.equal(hits(c, 'pil', 6), false);
});
test('空中障害物の設定が検証される(参照切れ・範囲外・y)', () => {
    const ev = structuredClone(defaultConfig.stage.events[0]);
    ev.scenery.air.kind = 'ghost';
    const a = validateConfig({ ...structuredClone(JSON.parse(JSON.stringify(defaultConfig))), stage: { ...JSON.parse(JSON.stringify(defaultConfig.stage)), events: [ev] } });
    assert.ok(!a.ok && a.errors.some((e) => e.path.endsWith('scenery.air.kind')));
    const b = loadConfig({ stage: { scenery: { flt: { y: 99 } } } });
    assert.ok(!b.ok && b.errors.some((e) => e.path === '$.stage.scenery.flt.y'));
    const c = loadConfig({ stage: { scenery: { flt: { mesh: 'sphere' } } } });
    assert.ok(!c.ok);
});
test('標準設定の決定性ハッシュ(空中障害物あり)を固定する', () => {
    const r = selfTest(defaultConfig);
    assert.equal(r.ok, true);
    assert.equal(r.hash.toString(16), '7b69d840');
    assert.equal(r.kills, 62);
});
test('設計の狙い: 飛び続けても障害物の被害を受ける(従来は 0 だった)', () => {
    const hp = (cfg) => { const r = loadConfig({ ...cfg, rules: { playerHp: 10000 } }); if (!r.ok)
        throw new Error('x'); return r.config; };
    const now = survey(hp({}), 8)['飛び続け+左右に揺れる'];
    assert.ok(now.障害物 >= 1, `飛び続けの障害物被弾: ${now.障害物}`);
    const ev = structuredClone(defaultConfig.stage.events[0]);
    ev.scenery.air = null;
    const before = survey(hp({ stage: { events: [ev] } }), 8)['飛び続け+左右に揺れる'];
    assert.equal(before.障害物, 0, '空中障害物なしだと、飛び続けは障害物を受けない');
});
test('crystal の形状は有限で、底が y=0・頂点が y=高さ', () => {
    const a = buildCrystal(grad([0, 0, 0], [1, 1, 1], 0, 3.5));
    assert.ok(a.length > 0 && a.length % 12 === 0 && a.every(Number.isFinite));
    const ys = [];
    for (let i = 0; i < a.length; i += 12)
        ys.push(a[i + 1], a[i + 7]);
    assert.equal(Math.min(...ys), 0);
    assert.ok(Math.abs(Math.max(...ys) - 3.5) < 1e-6);
});
