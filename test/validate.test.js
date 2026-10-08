import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WS } from './load.js';
const { defaultConfig, formatErrors, loadConfig, mergeRaw, validateConfig } = WS;
const rawDefault = WS.rawDefault;
const clone = () => JSON.parse(JSON.stringify(rawDefault));
const paths = (r) => (r.ok ? [] : r.errors.map((e) => e.path));
test('default.json は検証を通り、深く凍結されている', () => {
    assert.ok(Object.isFrozen(defaultConfig));
    assert.ok(Object.isFrozen(defaultConfig.rules));
    assert.ok(Object.isFrozen(defaultConfig.stage.events[0]));
    assert.throws(() => { defaultConfig.rules.playerHp = 1; }, TypeError);
});
test('未知のキーと足りないキーを両方拒否する', () => {
    const c = clone();
    c.rules.playerHP = 50;
    delete c.rules.playerHp;
    const p = paths(validateConfig(c));
    assert.ok(p.includes('$.rules.playerHP'));
    assert.ok(p.includes('$.rules.playerHp'));
});
test('範囲外・NaN・整数でない値を拒否する', () => {
    for (const [mut, path] of [
        [(c) => { c.rules.playerHp = 0; }, '$.rules.playerHp'],
        [(c) => { c.rules.scrollSpeed = null; }, '$.rules.scrollSpeed'],
        [(c) => { c.player.dashFrames = 2.5; }, '$.player.dashFrames'],
        [(c) => { c.weapons.missile.salvo = 13; }, '$.weapons.missile.salvo'],
        [(c) => { c.enemies.dart.hp = '2'; }, '$.enemies.dart.hp'],
        [(c) => { c.enemies.dart.color = 5; }, '$.enemies.dart.color'],
    ]) {
        const c = clone();
        mut(c);
        assert.ok(paths(validateConfig(c)).includes(path), path);
    }
    const inf = clone();
    inf.rules.enemyHpMul = Infinity;
    assert.ok(!validateConfig(inf).ok);
});
test('全部のエラーをまとめて返す', () => {
    const c = clone();
    c.rules.playerHp = -1;
    c.player.xBound = 999;
    c.enemies.dart.hp = 0;
    const r = validateConfig(c);
    assert.ok(!r.ok && r.errors.length >= 3);
    assert.match(formatErrors(r.ok ? [] : r.errors), /\$\.player\.xBound/);
});
test('存在しない敵・障害物への参照を拒否する', () => {
    const c = clone();
    c.stage.events[0].enemies[0].enemy = 'ghost';
    c.stage.events[0].scenery.secondary = 'nope';
    const p = paths(validateConfig(c));
    assert.ok(p.includes('$.stage.events[0].enemies[0].enemy'));
    assert.ok(p.includes('$.stage.events[0].scenery.secondary'));
});
test('procedural は1つまで / 配置の合計に上限 / until は t より後', () => {
    const two = clone();
    two.stage.events.push(structuredClone(two.stage.events[0]));
    assert.ok(!validateConfig(two).ok);
    const many = clone();
    for (let i = 0; i < 25; i++)
        many.stage.events.push({ op: 'spawn', t: i, enemy: 'dart', x: 0, y: null, count: 100, interval: 1, dx: 0, dy: 0 });
    assert.ok(!validateConfig(many).ok);
    const u = clone();
    u.stage.events[0].t = 100;
    u.stage.events[0].until = 50;
    assert.ok(!validateConfig(u).ok);
});
test('敵・障害物の名前に使えない文字や __proto__ を拒否する', () => {
    const c = clone();
    c.enemies.Bad = c.enemies.dart;
    assert.ok(paths(validateConfig(c)).includes('$.enemies.Bad'));
    const evil = JSON.parse('{"enemies":{"__proto__":{"polluted":true}}}');
    const r = loadConfig(evil);
    assert.ok(r.ok, '標準設定に重ねる分には無視されて通る');
    assert.equal({}.polluted, undefined);
    const direct = JSON.parse(JSON.stringify(rawDefault).replace('"enemies":{', '"enemies":{"__proto__":{"x":1},'));
    assert.ok(!validateConfig(direct).ok);
    assert.equal({}.x, undefined);
});
test('loadConfig: 一部だけ重ねられ、元の標準設定は変わらない', () => {
    const r = loadConfig({ name: 'easy', rules: { playerHp: 60, enemyHpMul: 0.5 } });
    assert.ok(r.ok);
    if (r.ok) {
        assert.equal(r.config.rules.playerHp, 60);
        assert.equal(r.config.rules.scrollSpeed, 0.55);
        assert.equal(r.config.name, 'easy');
    }
    assert.equal(defaultConfig.rules.playerHp, 100);
    assert.equal(rawDefault.rules.playerHp, 100);
    assert.ok(!loadConfig({ rules: { playerHp: -5 } }).ok);
});
test('mergeRaw: 配列は置き換え、オブジェクトは再帰、入力は書き換えない', () => {
    const a = { x: { y: 1, z: [1, 2] }, k: 1 }, b = { x: { z: [9] } };
    const m = mergeRaw(a, b);
    assert.deepEqual(m, { x: { y: 1, z: [9] }, k: 1 });
    assert.deepEqual(a, { x: { y: 1, z: [1, 2] }, k: 1 });
});
