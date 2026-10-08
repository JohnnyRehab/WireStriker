/**
 * ゲームの調整値・敵の定義・ステージ構成の型。
 * 実体は data/default.json にあり、validate.ts を通ったものだけがシミュレーションに渡る。
 * 数値はすべて設計値(原作の数値ではない)。
 */

/** 難易度に関わる値。E3 の難易度パネルはこの部分を編集する */
export interface Rules {
  playerHp: number;
  scrollSpeed: number;
  missileMax: number;
  /** 敵HPの倍率(四捨五入して最低1) */
  enemyHpMul: number;
  /** 敵弾の速度の倍率 */
  enemyBulletSpeedMul: number;
  /** 敵の発射頻度の倍率(待ち時間をこの値で割る) */
  enemyFireRateMul: number;
  /** 敵の出現間隔の倍率(小さいほど多く出る) */
  spawnIntervalMul: number;
  /** 敵と接触したときのダメージ */
  contactDamage: number;
  enemyBulletDamage: number;
  obstacleDamage: number;
}

/** 自機の動きの値 */
export interface PlayerParams {
  xBound: number;
  yMax: number;
  accel: number;
  maxSpeed: number;
  thrust: number;
  gravity: number;
  vyMax: number;
  fallSpeedMax: number;
  descendRate: number;
  jump: number;
  jumpGroundTol: number;
  dashFrames: number;
  dashSpeed: number;
  dashClimb: number;
  dashCarry: number;
  dashLag: number;
  lagDrag: number;
  invFrames: number;
  lockRange: number;
  lockCone: number;
}

export interface VulcanParams {
  cooldown: number;
  speed: number;
  life: number;
  damage: number;
  homing: number;
  jitter: number;
}

export interface MissileParams {
  cooldown: number;
  speed: number;
  life: number;
  damage: number;
  homing: number;
  regenFrames: number;
  salvo: number;
  spread: number;
  lift: number;
}

/** 出現位置などの指定。数値なら固定、オブジェクトなら乱数(出現のたびに引く) */
export type XSpec = number | { center: number; spread: number }; // center + (r-0.5)*spread
export type YSpec = number | { min: number; range: number }; // min + r*range
export type PhaseSpec = number | { range: number }; // r*range
export type DelaySpec = number | { min: number; range: number }; // min + floor(r*range)

export interface SwaySpec {
  amp: number;
  freq: number;
}

export interface DartAi {
  kind: 'dart';
  speedZ: number;
  swayX: SwaySpec;
  swayY: SwaySpec;
  fire: { zMin: number; zMax: number; bulletSpeed: number };
}

export interface TurretAi {
  kind: 'turret';
  fire: { zMin: number; zMax: number; bulletSpeed: number; reload: number };
}

export interface HeavyAi {
  kind: 'heavy';
  approachSpeed: number;
  stopZ: number;
  swayAmp: number;
  swayFreq: number;
  burst: { count: number; reload: number; gap: number; bulletSpeed: number };
}

export type EnemyAi = DartAi | TurretAi | HeavyAi;
export type EnemyMesh = 'dart' | 'turret' | 'heavy';

export interface EnemyDef {
  mesh: EnemyMesh;
  hp: number;
  radius: number;
  score: number;
  /** 爆発の色(0..4) */
  color: number;
  /** true なら自機に接触してダメージを与える */
  contact: boolean;
  /** true なら大きい爆発 */
  big: boolean;
  spawn: { x: XSpec; y: YSpec; phase: PhaseSpec; fireDelay: DelaySpec };
  ai: EnemyAi;
}

export type SceneryMesh = 'pillar' | 'rock' | 'crystal';

export interface SceneryDef {
  mesh: SceneryMesh;
  /** 底の高さ。0 なら地面に立つ。0 より大きければ宙に浮く */
  y: number;
  /** 底からの高さ。自機が [y, y+height] の高さにいると当たる(自機の体の高さ分は広げて判定) */
  height: number;
  radius: number;
}

/** 乱数で敵と障害物を出し続ける区間。区間内でだけタイマーが進む。1つまで */
export interface ProceduralEvent {
  op: 'procedural';
  t: number;
  until: number | null;
  enemies: { enemy: string; weight: number }[];
  firstSpawn: number;
  interval: { base: number; floor: number; decay: number; jitter: number };
  elite: { enemy: string; first: number; minTime: number; cooldown: number } | null;
  scenery: {
    firstSpawn: number;
    base: number;
    jitter: number;
    laneChance: number;
    laneSpread: number;
    sideMin: number;
    sideRange: number;
    primary: string;
    primaryChance: number;
    secondary: string;
    /** 空中の障害物。chance の確率で primary/secondary の代わりに kind を、自機の通り道(±spread/2)に出す。null なら出さない */
    air: { kind: string; chance: number; spread: number } | null;
  } | null;
}

/** 時刻 t(最初のフレームを0とする)から、interval ごとに count 回、敵を置く。乱数は使わない */
export interface SpawnEvent {
  op: 'spawn';
  t: number;
  enemy: string;
  x: number;
  /** null なら敵定義の既定の高さ */
  y: number | null;
  count: number;
  interval: number;
  dx: number;
  dy: number;
}

export interface SceneryEvent {
  op: 'scenery';
  t: number;
  kind: string;
  x: number;
  count: number;
  interval: number;
  dx: number;
}

export type StageEvent = ProceduralEvent | SpawnEvent | SceneryEvent;

export interface Stage {
  spawnZ: number;
  sceneryLead: number;
  scenery: Record<string, SceneryDef>;
  events: StageEvent[];
}

export interface Config {
  version: 1;
  name: string;
  rules: Rules;
  player: PlayerParams;
  weapons: { vulcan: VulcanParams; missile: MissileParams };
  enemies: Record<string, EnemyDef>;
  stage: Stage;
}
