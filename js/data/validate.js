(function (WS) {
'use strict';
/** 上限。エディタや共有URLから巨大な設定が来ても固まらないようにする */
const LIMITS = {
    maxEnemyKinds: 16,
    maxSceneryKinds: 16,
    maxEvents: 200,
    maxSpawnTotal: 2000,
    maxNameLength: 64,
    idPattern: /^[a-z][a-z0-9_]{0,15}$/,
};
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
function isBag(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}
class Reader {
    errors = [];
    fail(path, message) {
        this.errors.push({ path, message });
    }
    /** 値がオブジェクトで、キーが過不足なく揃っているか。ダメなら null */
    exact(v, path, keys) {
        if (!isBag(v)) {
            this.fail(path, 'オブジェクトが必要です');
            return null;
        }
        let ok = true;
        for (const k of Object.keys(v)) {
            if (FORBIDDEN.has(k) || !keys.includes(k)) {
                this.fail(`${path}.${k}`, '未知のキーです');
                ok = false;
            }
        }
        for (const k of keys) {
            if (!Object.prototype.hasOwnProperty.call(v, k)) {
                this.fail(`${path}.${k}`, 'キーがありません');
                ok = false;
            }
        }
        return ok ? v : null;
    }
    num(v, path, r) {
        if (typeof v !== 'number' || !Number.isFinite(v)) {
            this.fail(path, '有限の数値が必要です');
            return r[0];
        }
        if (r[2] && !Number.isInteger(v)) {
            this.fail(path, '整数が必要です');
            return r[0];
        }
        if (v < r[0] || v > r[1]) {
            this.fail(path, `${r[0]} から ${r[1]} の範囲で指定してください(値: ${v})`);
            return r[0];
        }
        return v;
    }
    bool(v, path) {
        if (typeof v !== 'boolean') {
            this.fail(path, 'true か false が必要です');
            return false;
        }
        return v;
    }
    /** 表に書かれた全項目が数値のグループ */
    group(v, path, table) {
        const keys = Object.keys(table);
        const o = this.exact(v, path, keys);
        const out = {};
        for (const k of keys)
            out[k] = this.num(o ? o[k] : undefined, `${path}.${k}`, table[k]);
        return out;
    }
    id(v, path) {
        if (typeof v !== 'string' || !LIMITS.idPattern.test(v)) {
            this.fail(path, '名前は英小文字で始まる16文字以内の英小文字・数字・_ です');
            return '';
        }
        return v;
    }
}
/* ---------------- 各部の範囲表 ---------------- */
const RULES = {
    playerHp: [1, 10000, true],
    scrollSpeed: [0.05, 3],
    missileMax: [0, 60, true],
    enemyHpMul: [0.1, 20],
    enemyBulletSpeedMul: [0.1, 5],
    enemyFireRateMul: [0.1, 10],
    spawnIntervalMul: [0.1, 10],
    contactDamage: [0, 1000],
    enemyBulletDamage: [0, 1000],
    obstacleDamage: [0, 1000],
};
const PLAYER = {
    xBound: [1, 40],
    yMax: [0.5, 30],
    accel: [0.001, 2],
    maxSpeed: [0.01, 3],
    thrust: [0, 1],
    gravity: [0, 1],
    vyMax: [0.05, 3],
    fallSpeedMax: [0.05, 3],
    descendRate: [0, 1],
    jump: [0, 3],
    jumpGroundTol: [0, 3],
    dashFrames: [1, 60, true],
    dashSpeed: [0, 5],
    dashClimb: [0, 5],
    dashCarry: [0, 5],
    dashLag: [0, 120, true],
    lagDrag: [0, 1],
    invFrames: [0, 600, true],
    lockRange: [10, 300],
    lockCone: [0.05, 3],
};
const VULCAN = {
    cooldown: [1, 600, true],
    speed: [0.1, 10],
    life: [1, 1000, true],
    damage: [0, 1000],
    homing: [0, 1],
    jitter: [0, 1],
};
const MISSILE = {
    cooldown: [1, 600, true],
    speed: [0.1, 10],
    life: [1, 1000, true],
    damage: [0, 1000],
    homing: [0, 1],
    regenFrames: [1, 3000, true],
    salvo: [1, 12, true],
    spread: [0, 2],
    lift: [-1, 1],
};
const POS = [-60, 60];
const HEIGHT = [0, 40];
const FRAMES = [0, 1_000_000, true];
const FRAMES1 = [1, 1_000_000, true];
const SWAY = { amp: [0, 30], freq: [0, 1] };
/* ---------------- 敵 ---------------- */
function readSpec(r, v, path, fixed, keys) {
    if (typeof v === 'number')
        return r.num(v, path, fixed);
    return r.group(v, path, keys);
}
function readAi(r, v, path) {
    const kind = isBag(v) ? v.kind : undefined;
    const fire = (p, x, extra) => r.group(x, p, { zMin: [0, 400], zMax: [0, 400], bulletSpeed: [0.05, 10], ...extra });
    if (kind === 'dart') {
        const o = r.exact(v, path, ['kind', 'speedZ', 'swayX', 'swayY', 'fire']);
        return {
            kind: 'dart',
            speedZ: r.num(o?.speedZ, `${path}.speedZ`, [0, 5]),
            swayX: r.group(o?.swayX, `${path}.swayX`, SWAY),
            swayY: r.group(o?.swayY, `${path}.swayY`, SWAY),
            fire: fire(`${path}.fire`, o?.fire, {}),
        };
    }
    if (kind === 'turret') {
        const o = r.exact(v, path, ['kind', 'fire']);
        return { kind: 'turret', fire: fire(`${path}.fire`, o?.fire, { reload: [1, 5000, true] }) };
    }
    if (kind === 'heavy') {
        const o = r.exact(v, path, ['kind', 'approachSpeed', 'stopZ', 'swayAmp', 'swayFreq', 'burst']);
        return {
            kind: 'heavy',
            approachSpeed: r.num(o?.approachSpeed, `${path}.approachSpeed`, [0, 5]),
            stopZ: r.num(o?.stopZ, `${path}.stopZ`, [5, 400]),
            swayAmp: r.num(o?.swayAmp, `${path}.swayAmp`, [0, 30]),
            swayFreq: r.num(o?.swayFreq, `${path}.swayFreq`, [0, 1]),
            burst: r.group(o?.burst, `${path}.burst`, {
                count: [1, 20, true],
                reload: [1, 5000, true],
                gap: [1, 120, true],
                bulletSpeed: [0.05, 10],
            }),
        };
    }
    r.fail(`${path}.kind`, "'dart' 'turret' 'heavy' のどれかが必要です");
    return { kind: 'turret', fire: { zMin: 0, zMax: 0, bulletSpeed: 1, reload: 1 } };
}
function readEnemy(r, v, path) {
    const o = r.exact(v, path, ['mesh', 'hp', 'radius', 'score', 'color', 'contact', 'big', 'spawn', 'ai']);
    const mesh = o?.mesh;
    if (mesh !== 'dart' && mesh !== 'turret' && mesh !== 'heavy')
        r.fail(`${path}.mesh`, "'dart' 'turret' 'heavy' のどれかが必要です");
    const sp = r.exact(o?.spawn, `${path}.spawn`, ['x', 'y', 'phase', 'fireDelay']);
    const ai = readAi(r, o?.ai, `${path}.ai`);
    const spawn = {
        x: readSpec(r, sp?.x, `${path}.spawn.x`, POS, { center: POS, spread: [0, 120] }),
        y: readSpec(r, sp?.y, `${path}.spawn.y`, HEIGHT, { min: HEIGHT, range: [0, 40] }),
        phase: readSpec(r, sp?.phase, `${path}.spawn.phase`, [0, 100], { range: [0, 100] }),
        fireDelay: readSpec(r, sp?.fireDelay, `${path}.spawn.fireDelay`, [1, 5000, true], {
            min: [1, 5000, true],
            range: [0, 5000, true],
        }),
    };
    return {
        mesh: (mesh === 'dart' || mesh === 'turret' || mesh === 'heavy' ? mesh : 'dart'),
        hp: r.num(o?.hp, `${path}.hp`, [1, 10000, true]),
        radius: r.num(o?.radius, `${path}.radius`, [0.2, 20]),
        score: r.num(o?.score, `${path}.score`, [0, 1_000_000, true]),
        color: r.num(o?.color, `${path}.color`, [0, 4, true]),
        contact: r.bool(o?.contact, `${path}.contact`),
        big: r.bool(o?.big, `${path}.big`),
        spawn,
        ai,
    };
}
function readScenery(r, v, path) {
    const o = r.exact(v, path, ['mesh', 'y', 'height', 'radius']);
    const mesh = o?.mesh;
    if (mesh !== 'pillar' && mesh !== 'rock' && mesh !== 'crystal')
        r.fail(`${path}.mesh`, "'pillar' 'rock' 'crystal' のどれかが必要です");
    return {
        mesh: mesh === 'rock' ? 'rock' : mesh === 'crystal' ? 'crystal' : 'pillar',
        y: r.num(o?.y, `${path}.y`, [0, 30]),
        height: r.num(o?.height, `${path}.height`, [0.1, 40]),
        radius: r.num(o?.radius, `${path}.radius`, [0.1, 20]),
    };
}
/* ---------------- ステージ ---------------- */
function readEvents(r, v, path, enemies, scenery) {
    if (!Array.isArray(v)) {
        r.fail(path, '配列が必要です');
        return [];
    }
    if (v.length > LIMITS.maxEvents)
        r.fail(path, `イベントは ${LIMITS.maxEvents} 件までです`);
    const out = [];
    let procedural = 0;
    let spawnTotal = 0;
    const ref = (name, p, set) => {
        const s = r.id(name, p);
        if (s && !set.has(s))
            r.fail(p, `'${s}' は定義されていません`);
        return s;
    };
    v.slice(0, LIMITS.maxEvents).forEach((ev, i) => {
        const p = `${path}[${i}]`;
        const op = isBag(ev) ? ev.op : undefined;
        if (op === 'spawn') {
            const o = r.exact(ev, p, ['op', 't', 'enemy', 'x', 'y', 'count', 'interval', 'dx', 'dy']);
            const count = r.num(o?.count, `${p}.count`, [1, 100, true]);
            spawnTotal += count;
            out.push({
                op: 'spawn',
                t: r.num(o?.t, `${p}.t`, FRAMES),
                enemy: ref(o?.enemy, `${p}.enemy`, enemies),
                x: r.num(o?.x, `${p}.x`, POS),
                y: o?.y === null ? null : r.num(o?.y, `${p}.y`, HEIGHT),
                count,
                interval: r.num(o?.interval, `${p}.interval`, FRAMES1),
                dx: r.num(o?.dx, `${p}.dx`, POS),
                dy: r.num(o?.dy, `${p}.dy`, POS),
            });
        }
        else if (op === 'scenery') {
            const o = r.exact(ev, p, ['op', 't', 'kind', 'x', 'count', 'interval', 'dx']);
            const count = r.num(o?.count, `${p}.count`, [1, 100, true]);
            spawnTotal += count;
            out.push({
                op: 'scenery',
                t: r.num(o?.t, `${p}.t`, FRAMES),
                kind: ref(o?.kind, `${p}.kind`, scenery),
                x: r.num(o?.x, `${p}.x`, POS),
                count,
                interval: r.num(o?.interval, `${p}.interval`, FRAMES1),
                dx: r.num(o?.dx, `${p}.dx`, POS),
            });
        }
        else if (op === 'procedural') {
            if (++procedural > 1)
                r.fail(p, "'procedural' は1つまでです");
            out.push(readProcedural(r, ev, p, enemies, scenery, ref));
        }
        else {
            r.fail(`${p}.op`, "'spawn' 'scenery' 'procedural' のどれかが必要です");
        }
    });
    if (spawnTotal > LIMITS.maxSpawnTotal)
        r.fail(path, `配置の合計は ${LIMITS.maxSpawnTotal} 個までです(現在 ${spawnTotal})`);
    return out;
}
function readProcedural(r, v, p, enemies, scenery, ref) {
    const o = r.exact(v, p, ['op', 't', 'until', 'enemies', 'firstSpawn', 'interval', 'elite', 'scenery']);
    const t = r.num(o?.t, `${p}.t`, FRAMES);
    const until = o?.until === null ? null : r.num(o?.until, `${p}.until`, FRAMES1);
    if (until !== null && until <= t)
        r.fail(`${p}.until`, 't より大きい値が必要です');
    const list = [];
    const arr = o?.enemies;
    if (!Array.isArray(arr) || arr.length < 1 || arr.length > 8)
        r.fail(`${p}.enemies`, '1〜8件の配列が必要です');
    else {
        arr.forEach((it, i) => {
            const q = `${p}.enemies[${i}]`;
            const e = r.exact(it, q, ['enemy', 'weight']);
            list.push({ enemy: ref(e?.enemy, `${q}.enemy`, enemies), weight: r.num(e?.weight, `${q}.weight`, [0.001, 1000]) });
        });
    }
    let elite = null;
    if (o?.elite !== null) {
        const e = r.exact(o?.elite, `${p}.elite`, ['enemy', 'first', 'minTime', 'cooldown']);
        elite = {
            enemy: ref(e?.enemy, `${p}.elite.enemy`, enemies),
            first: r.num(e?.first, `${p}.elite.first`, FRAMES),
            minTime: r.num(e?.minTime, `${p}.elite.minTime`, FRAMES),
            cooldown: r.num(e?.cooldown, `${p}.elite.cooldown`, FRAMES1),
        };
    }
    let sc = null;
    if (o?.scenery !== null) {
        const s = r.exact(o?.scenery, `${p}.scenery`, [
            'firstSpawn', 'base', 'jitter', 'laneChance', 'laneSpread', 'sideMin', 'sideRange', 'primary', 'primaryChance', 'secondary', 'air',
        ]);
        const q = `${p}.scenery`;
        sc = {
            firstSpawn: r.num(s?.firstSpawn, `${q}.firstSpawn`, FRAMES1),
            base: r.num(s?.base, `${q}.base`, FRAMES1),
            jitter: r.num(s?.jitter, `${q}.jitter`, [0, 1000, true]),
            laneChance: r.num(s?.laneChance, `${q}.laneChance`, [0, 1]),
            laneSpread: r.num(s?.laneSpread, `${q}.laneSpread`, [0, 120]),
            sideMin: r.num(s?.sideMin, `${q}.sideMin`, [0, 60]),
            sideRange: r.num(s?.sideRange, `${q}.sideRange`, [0, 60]),
            primary: ref(s?.primary, `${q}.primary`, scenery),
            primaryChance: r.num(s?.primaryChance, `${q}.primaryChance`, [0, 1]),
            secondary: ref(s?.secondary, `${q}.secondary`, scenery),
            air: null,
        };
        if (s?.air !== null) {
            const a = r.exact(s?.air, `${q}.air`, ['kind', 'chance', 'spread']);
            sc.air = { kind: ref(a?.kind, `${q}.air.kind`, scenery), chance: r.num(a?.chance, `${q}.air.chance`, [0, 1]), spread: r.num(a?.spread, `${q}.air.spread`, [0, 60]) };
        }
    }
    const iv = r.group(o?.interval, `${p}.interval`, {
        base: [1, 1000, true],
        floor: [1, 1000, true],
        decay: [1, 10000, true],
        jitter: [0, 1000, true],
    });
    return { op: 'procedural', t, until, enemies: list, firstSpawn: r.num(o?.firstSpawn, `${p}.firstSpawn`, FRAMES1), interval: iv, elite, scenery: sc };
}
/* ---------------- 入口 ---------------- */
function mapOf(r, v, path, max, read) {
    const out = {};
    if (!isBag(v)) {
        r.fail(path, 'オブジェクトが必要です');
        return out;
    }
    const keys = Object.keys(v);
    if (keys.length < 1 || keys.length > max)
        r.fail(path, `1〜${max}件が必要です`);
    for (const k of keys.slice(0, max)) {
        if (!LIMITS.idPattern.test(k) || FORBIDDEN.has(k)) {
            r.fail(`${path}.${k}`, '名前は英小文字で始まる16文字以内の英小文字・数字・_ です');
            continue;
        }
        Object.defineProperty(out, k, { value: read(v[k], `${path}.${k}`), enumerable: true, writable: true, configurable: true });
    }
    return out;
}
function deepFreeze(o) {
    if (typeof o === 'object' && o !== null && !Object.isFrozen(o)) {
        Object.freeze(o);
        for (const k of Object.keys(o))
            deepFreeze(o[k]);
    }
    return o;
}
function validateConfig(input) {
    const r = new Reader();
    const o = r.exact(input, '$', ['version', 'name', 'rules', 'player', 'weapons', 'enemies', 'stage']);
    if (o?.version !== 1)
        r.fail('$.version', 'version は 1 のみ対応しています');
    const name = typeof o?.name === 'string' && o.name.length >= 1 && o.name.length <= LIMITS.maxNameLength ? o.name : '';
    if (!name)
        r.fail('$.name', `1〜${LIMITS.maxNameLength}文字の文字列が必要です`);
    const w = r.exact(o?.weapons, '$.weapons', ['vulcan', 'missile']);
    const enemies = mapOf(r, o?.enemies, '$.enemies', LIMITS.maxEnemyKinds, (x, p) => readEnemy(r, x, p));
    const st = r.exact(o?.stage, '$.stage', ['spawnZ', 'sceneryLead', 'scenery', 'events']);
    const scenery = mapOf(r, st?.scenery, '$.stage.scenery', LIMITS.maxSceneryKinds, (x, p) => readScenery(r, x, p));
    const events = readEvents(r, st?.events, '$.stage.events', new Set(Object.keys(enemies)), new Set(Object.keys(scenery)));
    const config = {
        version: 1,
        name,
        rules: r.group(o?.rules, '$.rules', RULES),
        player: r.group(o?.player, '$.player', PLAYER),
        weapons: {
            vulcan: r.group(w?.vulcan, '$.weapons.vulcan', VULCAN),
            missile: r.group(w?.missile, '$.weapons.missile', MISSILE),
        },
        enemies,
        stage: {
            spawnZ: r.num(st?.spawnZ, '$.stage.spawnZ', [30, 400]),
            sceneryLead: r.num(st?.sceneryLead, '$.stage.sceneryLead', [0, 100]),
            scenery,
            events,
        },
    };
    if (r.errors.length)
        return { ok: false, errors: r.errors };
    return { ok: true, config: deepFreeze(config) };
}
/** 検証エラーを1行ずつの文章にする */
function formatErrors(errors) {
    return errors.map((e) => `${e.path}: ${e.message}`).join('\n');
}
Object.assign(WS, { LIMITS, validateConfig, formatErrors });
})(globalThis.WS || (globalThis.WS = {}));
