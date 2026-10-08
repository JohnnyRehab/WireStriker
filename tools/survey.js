// 操作方針ごとの被弾回数を測る(設計の判断材料)。使い方: node tools/survey.js [設定JSONのパス]
import { readFileSync } from 'node:fs';
import { WS } from '../test/load.js';
const { loadConfig, defaultConfig, newState, step } = WS;
const base = (o) => ({ lx: 0, ly: 0, rx: 0, ry: 0, dL: false, dR: false, tA: true, tB: false, jump: false, ...o });
const policies = {
    '飛び続け+左右に揺れる': (f) => base({ ly: 1, lx: Math.sin(f * 0.05) }),
    '飛び続け+中央': () => base({ ly: 1 }),
    '地上+左右に揺れる': (f) => base({ lx: Math.sin(f * 0.05) }),
    '中空(ときどき上昇)+揺れる': (f) => base({ ly: f % 90 < 45 ? 1 : 0, lx: Math.sin(f * 0.05) }),
};
function run(cfg, mk, seed, frames = 3600) {
    const s = newState(seed, cfg);
    const c = { 接触: 0, 敵弾: 0, 障害物: 0 };
    let prev = s.p.hp;
    for (let f = 0; f < frames; f++) {
        step(s, mk(f), cfg);
        const d = prev - s.p.hp;
        prev = s.p.hp;
        if (d === cfg.rules.contactDamage)
            c.接触++;
        else if (d === cfg.rules.enemyBulletDamage)
            c.敵弾++;
        else if (d === cfg.rules.obstacleDamage)
            c.障害物++;
    }
    return c;
}
export function survey(cfg, seeds = 20) {
    const out = {};
    for (const [name, mk] of Object.entries(policies)) {
        const t = { 接触: 0, 敵弾: 0, 障害物: 0 };
        for (let k = 1; k <= seeds; k++) {
            const c = run(cfg, mk, k * 7919);
            t.接触 += c.接触;
            t.敵弾 += c.敵弾;
            t.障害物 += c.障害物;
        }
        out[name] = { 接触: t.接触 / seeds, 敵弾: t.敵弾 / seeds, 障害物: t.障害物 / seeds };
    }
    return out;
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
    // 死なないよう体力を大きくし、各被弾が数えられるようにする(被ダメージの値は標準のまま)
    const patch = process.argv[2] ? JSON.parse(readFileSync(process.argv[2], 'utf8')) : {};
    const r = loadConfig({ ...patch, rules: { ...(patch.rules ?? {}), playerHp: 10000 } });
    if (!r.ok)
        throw new Error(JSON.stringify(r.errors));
    console.log(`設定: ${r.config.name} / 3600フレーム(60秒)あたりの被弾回数、20シードの平均`);
    console.table(survey(r.config));
    void defaultConfig;
}
