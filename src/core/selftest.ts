import type { Config } from '../data/types.ts';
import { newState, step } from './sim.ts';
import type { Input, State } from './types.ts';

/** 状態を JSON にして FNV-1a でハッシュする。キーの順序も含めて一致を見る */
export function hash(s: State): number {
  const str = JSON.stringify(s);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

/** 検証用の決まった入力列 */
export function scripted(f: number): Input {
  const a = f * 0.031;
  return {
    lx: Math.sin(a), ly: Math.cos(a * 1.3), rx: Math.sin(a * 0.7), ry: Math.sin(a * 0.4),
    dL: f % 97 >= 10 && f % 97 < 14, dR: f % 131 >= 40 && f % 131 < 44,
    tA: f % 60 < 40, tB: f % 200 === 150, jump: f % 173 === 5,
  };
}

export function allFinite(o: unknown): boolean {
  if (typeof o === 'number') return Number.isFinite(o);
  if (o && typeof o === 'object') for (const k in o) if (!allFinite((o as Record<string, unknown>)[k])) return false;
  return true;
}

export interface SelfTestResult { ok: boolean; hash: number; frames: number; kills: number }

/** 同じ入力で2回回して一致を見る。体力が減ったら戻して、3600フレーム全部を確かめる */
export function selfTest(cfg: Config, seed = 20261006, frames = 3600): SelfTestResult {
  const hs: number[] = [];
  let fin = true, kills = 0;
  for (let k = 0; k < 2; k++) {
    const s = newState(seed, cfg);
    for (let f = 0; f < frames; f++) {
      step(s, scripted(f), cfg);
      if (s.p.hp < 30) s.p.hp = cfg.rules.playerHp;
    }
    hs.push(hash(s));
    fin = fin && allFinite(s);
    kills = s.kills;
  }
  return { ok: hs[0] === hs[1] && fin && kills > 0, hash: hs[0]!, frames, kills };
}
