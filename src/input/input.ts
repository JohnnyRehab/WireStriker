import type { Input } from '../core/types.ts';

/** 画面のスクロールなどを止めたいキー */
export const BLOCK_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

interface PadLike {
  connected: boolean;
  axes: readonly number[];
  buttons: readonly { pressed: boolean; value: number }[];
}

/** 押されているキーとゲームパッドから、シミュレーションへ渡す入力を作る(純粋関数。テストできる) */
export function buildInput(keys: ReadonlySet<string>, pad: PadLike | null): Input {
  const k = (c: string): number => (keys.has(c) ? 1 : 0);
  const i: Input = {
    lx: k('KeyD') - k('KeyA'), ly: k('KeyW') - k('KeyS'),
    rx: k('ArrowRight') - k('ArrowLeft'), ry: k('ArrowUp') - k('ArrowDown'),
    dL: keys.has('KeyQ') || keys.has('ShiftLeft'), dR: keys.has('KeyE') || keys.has('ShiftRight'),
    tA: keys.has('KeyZ') || keys.has('KeyJ'), tB: keys.has('KeyX') || keys.has('KeyK'),
    jump: keys.has('Space'),
  };
  if (pad) {
    const dz = (v: number): number => (Math.abs(v) < 0.2 ? 0 : v);
    const ax = pad.axes, bt = pad.buttons;
    const pr = (n: number): boolean => !!bt[n] && (bt[n]!.pressed || bt[n]!.value > 0.3);
    const lx = dz(ax[0] || 0), ly = -dz(ax[1] || 0), rx = dz(ax[2] || 0), ry = -dz(ax[3] || 0);
    if (Math.abs(lx) > Math.abs(i.lx)) i.lx = lx;
    if (Math.abs(ly) > Math.abs(i.ly)) i.ly = ly;
    if (Math.abs(rx) > Math.abs(i.rx)) i.rx = rx;
    if (Math.abs(ry) > Math.abs(i.ry)) i.ry = ry;
    i.dL = i.dL || pr(4); i.dR = i.dR || pr(5);
    i.tA = i.tA || pr(6); i.tB = i.tB || pr(7);
    i.jump = i.jump || pr(0);
  }
  return i;
}

export function firstPad(): PadLike | null {
  try {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const g of pads) if (g && g.connected) return g;
  } catch { /* ゲームパッドが使えない環境 */ }
  return null;
}
