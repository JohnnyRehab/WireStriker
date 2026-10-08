/**
 * シミュレーション層。描画にも DOM にも依存しない。後で Rust + WASM へ移す対象。
 * 調整値は Config から読む。定数として残っているのは、設計上の固定値だけ
 * (自機の奥行き位置 PZ、銃口の位置 MUZ、ロックオンの最短距離など)。
 */
import type { Config, EnemyDef, ProceduralEvent, SpawnEvent, SceneryEvent } from '../data/types.ts';
import { rnd } from './rng.ts';
import type { Bullet, Enemy, Input, State } from './types.ts';

/** 自機の奥行き位置(画面手前側の固定位置) */
export const PZ = 12;
/** 自機の体の高さ(足元 p.y から頭まで)。宙に浮く障害物の当たり判定に使う */
export const PLAYER_H = 3.5;
/** 銃口の位置(機体の向きに合わせて回す) */
const MUZ = [1.2, 2.4, 4.4] as const;

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

export function newState(seed: number, cfg: Config): State {
  const proc = cfg.stage.events.find((e): e is ProceduralEvent => e.op === 'procedural');
  return {
    seed: seed | 0, t: 0, scroll: 0, dist: 0, score: 0, kills: 0, nextId: 1, over: false, overT: 0,
    p: {
      x: 0, y: 0, vx: 0, vy: 0, hp: cfg.rules.playerHp, inv: 0, dash: 0, dx: 0, dy: 0, lag: 0,
      cdA: 0, cdB: 0, ammoB: cfg.rules.missileMax, regen: 0, lock: 0, yaw: 0, prevJump: false, prevD: false,
    },
    en: [], bl: [], eb: [], sc: [], fx: [],
    spawnT: proc ? proc.firstSpawn : 0,
    scT: proc?.scenery ? proc.scenery.firstSpawn : 0,
    heavyT: proc?.elite ? proc.elite.first : 0,
    shake: 0,
  };
}

export function findEn(s: State, id: number): Enemy | null {
  for (const e of s.en) if (e.id === id && e.hp > 0) return e;
  return null;
}

function explode(s: State, x: number, y: number, z: number, n: number, col: number, big: boolean): void {
  for (let i = 0; i < n; i++) {
    const a = rnd(s) * 6.2832, b = (rnd(s) - 0.5) * 2.4;
    const sp = 0.15 + rnd(s) * (big ? 0.7 : 0.4);
    s.fx.push({
      k: 's', x, y, z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.8 + (rnd(s) - 0.3) * 0.15, vz: b * sp * 0.6,
      life: 22 + Math.floor(rnd(s) * 16), max: 38, c: col,
    });
  }
  s.fx.push({ k: 'r', x, y, z, r: 0.4, life: 16, max: 16, c: col, big: big ? 1 : 0 });
  while (s.fx.length > 420) s.fx.shift();
}

function updateFx(s: State): void {
  for (let i = s.fx.length - 1; i >= 0; i--) {
    const f = s.fx[i]!;
    if (f.k === 's') {
      f.x += f.vx; f.y += f.vy; f.z += f.vz;
      f.vx *= 0.96; f.vy = f.vy * 0.96 - 0.004; f.vz *= 0.96;
    } else {
      f.r += f.big ? 0.55 : 0.35;
    }
    if (--f.life <= 0) s.fx.splice(i, 1);
  }
}

function hurt(s: State, cfg: Config, n: number): void {
  const p = s.p;
  if (p.inv > 0 || s.over) return;
  p.hp -= n; p.inv = cfg.player.invFrames; s.shake = 14;
  if (p.hp <= 0) {
    p.hp = 0; s.over = true;
    explode(s, p.x, p.y + 2, PZ, 40, 0, true);
    explode(s, p.x, p.y + 2, PZ, 20, 4, true);
  }
}

function eFire(s: State, cfg: Config, e: Enemy, spd: number): void {
  const p = s.p;
  spd *= cfg.rules.enemyBulletSpeedMul;
  const dx = p.x - e.x, dy = p.y + 2 - e.y, dz = PZ - e.z;
  const l = Math.hypot(dx, dy, dz) || 1;
  s.eb.push({ x: e.x, y: e.y, z: e.z - 1.5, vx: (dx / l) * spd, vy: (dy / l) * spd, vz: (dz / l) * spd, life: 260 });
}

/** 待ち時間を発射頻度の倍率で割る(倍率1なら恒等) */
function wait(cfg: Config, frames: number): number {
  return Math.max(1, Math.round(frames / cfg.rules.enemyFireRateMul));
}

function fire(s: State, cfg: Config, kind: 'A' | 'B', i: number): void {
  const p = s.p;
  const cyw = Math.cos(p.yaw), syw = Math.sin(p.yaw);
  const mx = p.x + MUZ[0] * cyw + MUZ[2] * syw, my = p.y + MUZ[1], mz = PZ - MUZ[0] * syw + MUZ[2] * cyw;
  let vx = 0, vy = 0, vz = 1;
  if (p.lock) {
    const e = findEn(s, p.lock);
    if (e) { vx = e.x - mx; vy = e.y - my; vz = e.z - mz; }
  }
  let l = Math.hypot(vx, vy, vz) || 1; vx /= l; vy /= l; vz /= l;
  let spd: number, life: number, dmg: number, home: number;
  if (kind === 'A') {
    const w = cfg.weapons.vulcan;
    spd = w.speed; life = w.life; dmg = w.damage; home = w.homing;
    vx += (rnd(s) - 0.5) * w.jitter; vy += (rnd(s) - 0.5) * w.jitter;
  } else {
    const w = cfg.weapons.missile;
    spd = w.speed; life = w.life; dmg = w.damage; home = w.homing;
    vx += (i - (w.salvo - 1) / 2) * w.spread; vy += w.lift;
  }
  l = Math.hypot(vx, vy, vz) || 1; vx /= l; vy /= l; vz /= l;
  const b: Bullet = { k: kind, x: mx, y: my, z: mz, vx: vx * spd, vy: vy * spd, vz: vz * spd, spd, life, dmg, home, tgt: p.lock };
  s.bl.push(b);
}

function killEnemy(s: State, cfg: Config, e: Enemy, byPlayer: boolean): void {
  e.hp = 0;
  if (byPlayer) { s.score += e.score; s.kills++; }
  const big = cfg.enemies[e.type]!.big;
  explode(s, e.x, e.y, e.z, big ? 36 : 16, e.col, big);
}

/* ---------------- 敵の生成 ---------------- */

/** rand が true なら出現位置などを乱数で決める(乱数を引く順番は x, y, phase, fireDelay)。false なら中央値で決める */
function makeEnemy(s: State, cfg: Config, type: string, rand: boolean, ox: number | null, oy: number | null): Enemy {
  const def: EnemyDef = cfg.enemies[type]!;
  const sp = def.spawn;
  const id = s.nextId++;
  const x = ox !== null ? ox : typeof sp.x === 'number' ? sp.x : sp.x.center + (rand ? (rnd(s) - 0.5) * sp.x.spread : 0);
  const y = oy !== null ? oy : typeof sp.y === 'number' ? sp.y : sp.y.min + (rand ? rnd(s) * sp.y.range : sp.y.range / 2);
  const ph = typeof sp.phase === 'number' ? sp.phase : rand ? rnd(s) * sp.phase.range : sp.phase.range / 2;
  const fd = typeof sp.fireDelay === 'number' ? sp.fireDelay : sp.fireDelay.min + (rand ? Math.floor(rnd(s) * sp.fireDelay.range) : Math.floor(sp.fireDelay.range / 2));
  const hp = Math.max(1, Math.round(def.hp * cfg.rules.enemyHpMul));
  const z = cfg.stage.spawnZ;
  const fireT = wait(cfg, fd);
  const kind = def.ai.kind;
  if (kind === 'dart') return { id, type, x, bx: x, y, by: y, z, hp, r: def.radius, ph, fireT, flash: 0, score: def.score, col: def.color };
  if (kind === 'turret') return { id, type, x, y, z, hp, r: def.radius, ph, fireT, flash: 0, score: def.score, col: def.color };
  return { id, type, x, y, z, hp, r: def.radius, ph, fireT, burst: 0, flash: 0, score: def.score, col: def.color };
}

function spawnProcedural(s: State, cfg: Config, ev: ProceduralEvent): void {
  const el = ev.elite;
  if (el && s.heavyT <= 0 && !s.en.some((e) => e.type === el.enemy && e.hp > 0) && s.t > el.minTime) {
    s.heavyT = el.cooldown;
    s.en.push(makeEnemy(s, cfg, el.enemy, true, null, null));
    return;
  }
  let total = 0;
  for (const c of ev.enemies) total += c.weight;
  const r = rnd(s) * total;
  let acc = 0, pick = ev.enemies[ev.enemies.length - 1]!.enemy;
  for (const c of ev.enemies) { acc += c.weight; if (r < acc) { pick = c.enemy; break; } }
  s.en.push(makeEnemy(s, cfg, pick, true, null, null));
}

function pushScenery(s: State, cfg: Config, kind: string, x: number): void {
  const d = cfg.stage.scenery[kind]!;
  s.sc.push({ t: kind, x, z: cfg.stage.spawnZ + cfg.stage.sceneryLead, h: d.height, r: d.radius });
}

function runProcedural(s: State, cfg: Config, ev: ProceduralEvent): void {
  s.heavyT--;
  if (--s.spawnT <= 0) {
    const iv = ev.interval;
    const v = Math.max(iv.floor, iv.base - Math.floor(s.t / iv.decay)) + Math.floor(rnd(s) * iv.jitter);
    s.spawnT = Math.max(1, Math.round(v * cfg.rules.spawnIntervalMul));
    spawnProcedural(s, cfg, ev);
  }
  const sc = ev.scenery;
  if (sc && --s.scT <= 0) {
    s.scT = sc.base + Math.floor(rnd(s) * sc.jitter);
    const inLane = rnd(s) < sc.laneChance;
    const x = inLane ? (rnd(s) - 0.5) * sc.laneSpread : (rnd(s) < 0.5 ? -1 : 1) * (sc.sideMin + rnd(s) * sc.sideRange);
    let kind = rnd(s) < sc.primaryChance ? sc.primary : sc.secondary;
    let px = x;
    if (sc.air && rnd(s) < sc.air.chance) { kind = sc.air.kind; px = (rnd(s) - 0.5) * sc.air.spread; }
    pushScenery(s, cfg, kind, px);
  }
}

/** 時刻が決まっている配置。状態を持たないので、フレーム番号だけで決まる(乱数は使わない) */
function runExplicit(s: State, cfg: Config, f: number): void {
  for (const ev of cfg.stage.events) {
    if (ev.op === 'procedural') continue;
    const d = f - ev.t;
    if (d < 0 || d % ev.interval !== 0) continue;
    const k = d / ev.interval;
    if (k >= ev.count) continue;
    if (ev.op === 'spawn') {
      const e: SpawnEvent = ev;
      s.en.push(makeEnemy(s, cfg, e.enemy, false, e.x + k * e.dx, e.y === null ? null : e.y + k * e.dy));
    } else {
      const e: SceneryEvent = ev;
      pushScenery(s, cfg, e.kind, e.x + k * e.dx);
    }
  }
}

/* ---------------- 1フレーム ---------------- */

export function step(s: State, inp: Input, cfg: Config): void {
  const R = cfg.rules, P = cfg.player;
  s.t++;
  if (s.over) { s.overT++; updateFx(s); if (s.shake > 0) s.shake--; return; }
  const p = s.p;
  s.scroll = (s.scroll + R.scrollSpeed) % 4;
  s.dist += R.scrollSpeed;
  if (s.shake > 0) s.shake--;
  if (p.inv > 0) p.inv--;
  if (p.cdA > 0) p.cdA--;
  if (p.cdB > 0) p.cdB--;

  /* ---- 入力解釈(ハリアー型:2本のスティックの合算で移動) ---- */
  const mx = clamp(inp.lx + inp.rx, -1, 1), my = clamp(inp.ly + inp.ry, -1, 1);
  const jumpIn = !!inp.jump || (inp.lx < -0.6 && inp.rx > 0.6);
  const dAny = !!(inp.dL || inp.dR);
  const dashPress = dAny && !p.prevD;
  p.prevD = dAny;

  if (dashPress && p.dash === 0 && p.lag === 0) {
    let dx = mx, dy = my;
    if (Math.abs(dx) + Math.abs(dy) < 0.3) { dx = inp.dL ? -1 : 1; dy = 0; }
    const l = Math.hypot(dx, dy) || 1;
    p.dx = dx / l; p.dy = dy / l; p.dash = P.dashFrames;
  }

  /* ---- 移動 ---- */
  if (p.dash > 0) {
    p.x += p.dx * P.dashSpeed; p.y += p.dy * P.dashClimb; p.vy = 0; p.vx = p.dx * P.dashSpeed * P.dashCarry;
    p.dash--; if (p.dash === 0) p.lag = P.dashLag;
  } else if (p.lag > 0) {
    p.lag--; p.vx *= P.lagDrag; p.x += p.vx;
    p.vy = clamp(p.vy - P.gravity, -P.fallSpeedMax, P.vyMax); p.y += p.vy;
  } else {
    p.vx += clamp(mx * P.maxSpeed - p.vx, -P.accel, P.accel); p.x += p.vx;
    p.vy += (my > 0 ? my * P.thrust : my * P.descendRate) - P.gravity;
    if (jumpIn && !p.prevJump && p.y < P.jumpGroundTol) p.vy = P.jump;
    p.vy = clamp(p.vy, -P.fallSpeedMax, P.vyMax); p.y += p.vy;
  }
  p.prevJump = jumpIn;
  if (p.y <= 0) { p.y = 0; if (p.vy < 0) p.vy = 0; }
  if (p.y > P.yMax) { p.y = P.yMax; if (p.vy > 0) p.vy = 0; }
  p.x = clamp(p.x, -P.xBound, P.xBound);

  /* ---- ロックオン ---- */
  let best = 0, bs = 1e9, bestE: Enemy | null = null;
  const ax = p.x, ay = p.y + 2;
  for (const e of s.en) {
    if (e.hp <= 0) continue;
    const dz = e.z - PZ;
    if (dz < 6 || dz > P.lockRange) continue;
    const ang = Math.hypot(e.x - ax, e.y - ay) / dz;
    if (ang > P.lockCone) continue;
    const sc = ang * 100 + dz * 0.3;
    if (sc < bs) { bs = sc; best = e.id; bestE = e; }
  }
  p.lock = best;
  const wantYaw = bestE ? clamp(Math.atan2(bestE.x - p.x, bestE.z - PZ) * 0.6, -0.5, 0.5) : 0;
  p.yaw += (wantYaw - p.yaw) * 0.12;

  /* ---- 射撃 ---- */
  const V = cfg.weapons.vulcan, Mi = cfg.weapons.missile;
  if (inp.tA && p.cdA === 0) { p.cdA = V.cooldown; fire(s, cfg, 'A', 0); }
  if (inp.tB && p.cdB === 0 && p.ammoB > 0) {
    p.cdB = Mi.cooldown;
    const n = Math.min(Mi.salvo, p.ammoB);
    for (let i = 0; i < n; i++) fire(s, cfg, 'B', i);
    p.ammoB -= n;
  }
  if (p.ammoB < R.missileMax) { if (++p.regen >= Mi.regenFrames) { p.regen = 0; p.ammoB++; } } else p.regen = 0;

  /* ---- ステージのイベント ---- */
  const f = s.t - 1;
  for (const ev of cfg.stage.events) {
    if (ev.op === 'procedural' && f >= ev.t && (ev.until === null || f < ev.until)) runProcedural(s, cfg, ev);
  }
  runExplicit(s, cfg, f);

  /* ---- 敵 ---- */
  for (const e of s.en) {
    if (e.hp <= 0) continue;
    if (e.flash > 0) e.flash--;
    const def = cfg.enemies[e.type]!;
    const ai = def.ai;
    if (ai.kind === 'dart') {
      e.z -= ai.speedZ;
      e.x = e.bx! + Math.sin(s.t * ai.swayX.freq + e.ph) * ai.swayX.amp;
      e.y = e.by! + Math.sin(s.t * ai.swayY.freq + e.ph) * ai.swayY.amp;
      if (--e.fireT <= 0 && e.z > ai.fire.zMin && e.z < ai.fire.zMax) { eFire(s, cfg, e, ai.fire.bulletSpeed); e.fireT = 99999; }
    } else if (ai.kind === 'turret') {
      e.z -= R.scrollSpeed;
      if (--e.fireT <= 0 && e.z > ai.fire.zMin && e.z < ai.fire.zMax) { eFire(s, cfg, e, ai.fire.bulletSpeed); e.fireT = wait(cfg, ai.fire.reload); }
    } else {
      if (e.z > ai.stopZ) e.z -= ai.approachSpeed;
      else e.x = Math.sin(s.t * ai.swayFreq + e.ph) * ai.swayAmp;
      if (--e.fireT <= 0) { e.burst = ai.burst.count; e.fireT = wait(cfg, ai.burst.reload); }
      if (e.burst! > 0 && s.t % ai.burst.gap === 0) { eFire(s, cfg, e, ai.burst.bulletSpeed); e.burst!--; }
    }
    const dx = e.x - p.x, dy = e.y - (p.y + 2), dz = e.z - PZ;
    if (def.contact && Math.hypot(dx, dy, dz) < e.r + 1.3) { killEnemy(s, cfg, e, false); hurt(s, cfg, R.contactDamage); }
  }

  /* ---- プレイヤー弾 ---- */
  for (let i = s.bl.length - 1; i >= 0; i--) {
    const b = s.bl[i]!;
    if (b.tgt) {
      const e = findEn(s, b.tgt);
      if (e) {
        let dx = e.x - b.x, dy = e.y - b.y, dz = e.z - b.z;
        const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
        let vx = b.vx / b.spd, vy = b.vy / b.spd, vz = b.vz / b.spd;
        vx += (dx - vx) * b.home; vy += (dy - vy) * b.home; vz += (dz - vz) * b.home;
        const m = Math.hypot(vx, vy, vz) || 1;
        b.vx = (vx / m) * b.spd; b.vy = (vy / m) * b.spd; b.vz = (vz / m) * b.spd;
      } else b.tgt = 0;
    }
    b.x += b.vx; b.y += b.vy; b.z += b.vz; b.life--;
    let dead = b.life <= 0 || b.z > 200 || b.y < -1;
    if (!dead) {
      for (const e of s.en) {
        if (e.hp <= 0) continue;
        const dx = e.x - b.x, dy = e.y - b.y, dz = e.z - b.z, rr = e.r + 0.5;
        if (dx * dx + dy * dy + dz * dz < rr * rr) {
          e.hp -= b.dmg; e.flash = 4;
          explode(s, b.x, b.y, b.z, b.k === 'B' ? 8 : 3, 4, false);
          if (e.hp <= 0) killEnemy(s, cfg, e, true);
          dead = true; break;
        }
      }
    }
    if (dead) s.bl.splice(i, 1);
  }
  for (let i = s.en.length - 1; i >= 0; i--) {
    const e = s.en[i]!;
    if (e.hp <= 0 || e.z < 1.5) s.en.splice(i, 1);
  }

  /* ---- 敵弾 ---- */
  for (let i = s.eb.length - 1; i >= 0; i--) {
    const b = s.eb[i]!;
    b.x += b.vx; b.y += b.vy; b.z += b.vz; b.life--;
    const dx = b.x - p.x, dy = b.y - (p.y + 2), dz = b.z - PZ;
    let dead = b.life <= 0 || b.z < 0;
    if (!dead && dx * dx + dy * dy + dz * dz < 2.6) { hurt(s, cfg, R.enemyBulletDamage); explode(s, b.x, b.y, b.z, 6, 1, false); dead = true; }
    if (dead) s.eb.splice(i, 1);
  }

  /* ---- 背景の障害物 ---- */
  for (let i = s.sc.length - 1; i >= 0; i--) {
    const o = s.sc[i]!;
    o.z -= R.scrollSpeed;
    const y0 = cfg.stage.scenery[o.t]!.y;
    if (Math.abs(o.z - PZ) < 1.3 && Math.abs(o.x - p.x) < o.r + 0.9 && p.y < y0 + o.h && p.y + PLAYER_H > y0) {
      hurt(s, cfg, R.obstacleDamage); explode(s, o.x, y0 + o.h * 0.5, o.z, 10, 0, false); o.z = -9;
    }
    if (o.z < 1) s.sc.splice(i, 1);
  }
  updateFx(s);
}
