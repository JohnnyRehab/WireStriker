/** シミュレーション状態の型。JSON.stringify の結果がそのまま決定性ハッシュになるので、キーの順序も仕様の一部 */
export interface Input {
  lx: number; ly: number; rx: number; ry: number;
  dL: boolean; dR: boolean; tA: boolean; tB: boolean; jump: boolean;
}

export interface Player {
  x: number; y: number; vx: number; vy: number; hp: number; inv: number;
  dash: number; dx: number; dy: number; lag: number;
  cdA: number; cdB: number; ammoB: number; regen: number;
  lock: number; yaw: number; prevJump: boolean; prevD: boolean;
}

export interface Enemy {
  id: number;
  /** 設定の enemies のキー */
  type: string;
  x: number;
  bx?: number;
  y: number;
  by?: number;
  z: number;
  hp: number;
  r: number;
  ph: number;
  fireT: number;
  burst?: number;
  flash: number;
  score: number;
  col: number;
}

export interface Bullet {
  k: 'A' | 'B';
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  spd: number; life: number; dmg: number; home: number; tgt: number;
}
export interface EnemyBullet { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number }
export interface Scenery { t: string; x: number; z: number; h: number; r: number }
export type Fx =
  | { k: 's'; x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; c: number }
  | { k: 'r'; x: number; y: number; z: number; r: number; life: number; max: number; c: number; big: number };

export interface State {
  seed: number; t: number; scroll: number; dist: number; score: number; kills: number;
  nextId: number; over: boolean; overT: number;
  p: Player;
  en: Enemy[]; bl: Bullet[]; eb: EnemyBullet[]; sc: Scenery[]; fx: Fx[];
  spawnT: number; scT: number; heavyT: number; shake: number;
}
