import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDart, buildMountains, buildPillar, buildRobot, buildRock, buildTurret, grad } from '../src/render/geometry.ts';

const col = grad([0.1, 0.2, 0.3], [0.9, 0.8, 0.7], 0, 5);
const ok = (a: Float32Array, name: string) => {
  assert.ok(a.length > 0 && a.length % 12 === 0, `${name}: 長さが12の倍数`);
  assert.ok(a.every(Number.isFinite), `${name}: 有限`);
};

test('全メッシュが空でなく有限の線分データになっている', () => {
  ok(buildDart(col), 'dart'); ok(buildTurret(col), 'turret'); ok(buildPillar(col), 'pillar');
  ok(buildRock(col), 'rock'); ok(buildMountains(), 'mount');
  const r = buildRobot(col);
  ok(r.torso, 'torso'); r.thigh.forEach((a, i) => ok(a, 'thigh' + i)); r.shin.forEach((a, i) => ok(a, 'shin' + i));
});

test('形状は毎回同じ(山の乱数は固定シード)', () => {
  assert.deepEqual(buildMountains(), buildMountains());
  assert.deepEqual(buildRobot(col).torso, buildRobot(col).torso);
});

test('機体の線分数(形を変えたら気づけるようにする)', () => {
  const r = buildRobot(col);
  const n = (a: Float32Array) => a.length / 12;
  assert.deepEqual([n(buildDart(col)), n(buildTurret(col)), n(buildPillar(col)), n(buildRock(col)), n(buildMountains())].every((v) => v > 0), true);
  assert.ok(n(r.torso) > 100, `torso ${n(r.torso)}`);
});
