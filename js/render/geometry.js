(function (WS) {
'use strict';
const { M, rotv } = WS;
/**
 * ローポリ・ノーテクスチャの形状データ。GL には依存せず、線分の配列(Float32Array)を返すだけ。
 * 1線分 = 12個の数: 始点(x,y,z) 始点色(r,g,b) 終点(x,y,z) 終点色(r,g,b)
 */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
class Geo {
    a = [];
    cf;
    constructor(cf) { this.cf = cf; }
    line(p, q) {
        const c1 = this.cf(p[1]), c2 = this.cf(q[1]);
        this.a.push(p[0], p[1], p[2], c1[0], c1[1], c1[2], q[0], q[1], q[2], c2[0], c2[1], c2[2]);
    }
    build() { return new Float32Array(this.a); }
}
function grad(lo, hi, y0, y1) {
    return (y) => { const t = clamp((y - y0) / (y1 - y0), 0, 1); return [lo[0] + (hi[0] - lo[0]) * t, lo[1] + (hi[1] - lo[1]) * t, lo[2] + (hi[2] - lo[2]) * t]; };
}
function box(g, cx, cy, cz, sx, sy, sz, o0) {
    const o = o0 || {};
    const tt = o.tt === undefined ? 1 : o.tt, tb = o.tb === undefined ? 1 : o.tb;
    const R = M.mul(M.Ry(o.ry || 0), M.mul(M.Rx(o.rx || 0), M.Rz(o.rz || 0)));
    const v = [];
    for (let iy = 0; iy < 2; iy++) {
        const k = iy ? tt : tb, y = (iy ? 0.5 : -0.5) * sy;
        for (let ix = 0; ix < 2; ix++)
            for (let iz = 0; iz < 2; iz++) {
                const p = rotv(R, [(ix ? 0.5 : -0.5) * sx * k, y, (iz ? 0.5 : -0.5) * sz * k]);
                v.push([p[0] + cx, p[1] + cy, p[2] + cz]);
            }
    }
    const ring = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (let i = 0; i < 4; i++) {
        const a = ring[i], b = ring[(i + 1) % 4];
        for (let iy = 0; iy < 2; iy++)
            g.line(v[iy * 4 + a[0] * 2 + a[1]], v[iy * 4 + b[0] * 2 + b[1]]);
        g.line(v[a[0] * 2 + a[1]], v[4 + a[0] * 2 + a[1]]);
    }
}
function ngon(g, cx, cy, cz, r, h, n, tt0, tb0, o0) {
    const o = o0 || {};
    const tt = tt0 === undefined ? 1 : tt0, tb = tb0 === undefined ? 1 : tb0;
    const R = M.mul(M.Ry(o.ry || 0), M.mul(M.Rx(o.rx || 0), M.Rz(o.rz || 0)));
    const bot = [], top = [];
    for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2 + (o.off || 0), c = Math.cos(a), s = Math.sin(a);
        const pb = rotv(R, [c * r * tb, -h / 2, s * r * tb]), pt = rotv(R, [c * r * tt, h / 2, s * r * tt]);
        bot.push([pb[0] + cx, pb[1] + cy, pb[2] + cz]);
        top.push([pt[0] + cx, pt[1] + cy, pt[2] + cz]);
    }
    for (let i = 0; i < n; i++) {
        g.line(bot[i], bot[(i + 1) % n]);
        g.line(top[i], top[(i + 1) % n]);
        g.line(bot[i], top[i]);
    }
}
function pyramid(g, cx, cy, cz, r, h, n, off) {
    const ring = [];
    for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2 + (off || 0);
        ring.push([cx + Math.cos(a) * r, cy, cz + Math.sin(a) * r]);
    }
    const apex = [cx, cy + h, cz];
    for (let i = 0; i < n; i++) {
        g.line(ring[i], ring[(i + 1) % n]);
        g.line(ring[i], apex);
    }
}
function buildRobot(cf) {
    const T = new Geo(cf), TH = [new Geo(cf), new Geo(cf)], SH = [new Geo(cf), new Geo(cf)];
    /* 胴体 */
    box(T, 0, 3.05, 0, 1.55, 1.0, 0.95, { tt: 0.82 });
    box(T, 0, 3.1, 0.52, 0.95, 0.6, 0.18, { tt: 0.9 });
    box(T, 0, 3.62, 0.08, 0.9, 0.3, 0.7, { tb: 1.1, tt: 0.7 });
    box(T, 0, 2.4, 0, 0.95, 0.45, 0.65, { tt: 1.15, tb: 0.8 });
    box(T, 0, 1.95, 0, 1.05, 0.4, 0.72);
    box(T, 0, 1.7, 0.42, 0.5, 0.5, 0.15, { tb: 0.8 });
    box(T, 0, 1.75, -0.4, 0.6, 0.45, 0.15, { tb: 0.8 });
    /* 頭部とアンテナ */
    ngon(T, 0, 3.98, 0.05, 0.36, 0.46, 6, 0.9, 1.0);
    box(T, 0, 3.98, 0.36, 0.5, 0.14, 0.1);
    box(T, 0.42, 3.98, 0, 0.14, 0.3, 0.3);
    box(T, -0.42, 3.98, 0, 0.14, 0.3, 0.3);
    T.line([0.15, 4.2, -0.02], [0.5, 4.98, -0.08]);
    T.line([-0.15, 4.2, -0.02], [-0.5, 4.98, -0.08]);
    /* バックパック */
    box(T, 0.8, 3.75, -0.5, 0.28, 0.95, 0.3);
    box(T, -0.7, 3.4, -0.5, 0.5, 0.5, 0.4);
    /* 肩・サイドスカート */
    for (const s of [-1, 1]) {
        box(T, s * 1.2, 3.4, 0, 0.9, 0.7, 1.0, { tt: 0.7, rz: -s * 0.22 });
        box(T, s * 1.25, 3.82, 0, 0.6, 0.35, 0.7, { tt: 0.6, rz: -s * 0.3 });
        box(T, s * 1.35, 2.75, 0, 0.4, 0.85, 0.42, { tb: 0.9 });
        box(T, s * 0.7, 1.75, 0.05, 0.35, 0.55, 0.7, { rz: -s * 0.18 });
    }
    /* 左腕(下ろしている) */
    box(T, -1.4, 2.0, 0.2, 0.4, 0.85, 0.45, { rx: -0.25 });
    box(T, -1.4, 1.5, 0.4, 0.38, 0.34, 0.4);
    /* 右腕とライフル */
    box(T, 1.3, 2.35, 0.7, 0.38, 0.38, 0.9);
    box(T, 1.25, 2.3, 1.25, 0.4, 0.4, 0.4);
    box(T, 1.2, 2.4, 2.6, 0.2, 0.24, 3.0);
    box(T, 1.2, 2.35, 1.4, 0.34, 0.44, 0.9, { tt: 0.8 });
    box(T, 1.2, 2.72, 1.6, 0.18, 0.18, 0.55);
    box(T, 1.2, 2.4, 4.2, 0.28, 0.28, 0.2);
    /* 脚 */
    for (let i = 0; i < 2; i++) {
        const s = i ? 1 : -1, th = TH[i], sh = SH[i];
        box(th, s * 0.42, 1.45, 0, 0.52, 0.95, 0.55, { tb: 0.85 });
        box(th, s * 0.42, 1.0, 0.3, 0.46, 0.34, 0.3);
        box(sh, s * 0.42, 0.6, -0.05, 0.46, 0.95, 0.58, { tb: 0.8 });
        box(sh, s * 0.42, 0.65, -0.42, 0.4, 0.7, 0.25);
        box(sh, s * 0.42, 0.35, -0.2, 0.5, 0.3, 0.4);
        box(sh, s * 0.42, 0.14, 0.22, 0.58, 0.26, 1.1, { tb: 0.9 });
        box(sh, s * 0.42, 0.18, 0.82, 0.5, 0.2, 0.4, { tt: 0.7 });
    }
    return { torso: T.build(), thigh: [TH[0].build(), TH[1].build()], shin: [SH[0].build(), SH[1].build()] };
}
function buildDart(cf) {
    const g = new Geo(cf);
    const F = [0, 0, -1.8], B = [0, 0, 1.6], Tp = [0, 0.7, 0], U = [0, -0.5, 0], L = [-0.8, 0, 0.2], R = [0.8, 0, 0.2];
    for (const e of [[F, Tp], [F, U], [F, L], [F, R], [B, Tp], [B, U], [B, L], [B, R], [Tp, L], [Tp, R], [U, L], [U, R]])
        g.line(e[0], e[1]);
    for (const s of [-1, 1]) {
        const tip = [s * 2.8, 0.15, 1.1];
        g.line([s * 0.8, 0, 0.2], tip);
        g.line(tip, [s * 0.9, 0, 1.4]);
        g.line(tip, [s * 0.9, 0, -0.5]);
        g.line([s * 0.9, 0, -0.5], [s * 0.8, 0, 0.2]);
    }
    g.line(B, [0, 1.3, 2.0]);
    g.line([0, 1.3, 2.0], [0, 0.7, 0]);
    return g.build();
}
function buildTurret(cf) {
    const g = new Geo(cf);
    ngon(g, 0, -0.55, 0, 1.5, 0.7, 6, 0.85, 1.0);
    pyramid(g, 0, -0.2, 0, 1.25, 1.1, 6, 0);
    box(g, 0, 0.45, -1.1, 0.28, 0.28, 1.8);
    box(g, 0, 0.45, -2.05, 0.4, 0.4, 0.2);
    g.line([-1.5, -0.9, 0], [-2.0, -0.9, 0.8]);
    g.line([1.5, -0.9, 0], [2.0, -0.9, 0.8]);
    return g.build();
}
function buildPillar(cf) {
    const g = new Geo(cf);
    ngon(g, 0, 2.5, 0, 0.9, 5, 6, 0.85, 1.0);
    for (const y of [1.7, 3.4]) {
        const ring = [];
        for (let i = 0; i < 6; i++) {
            const a = i / 6 * Math.PI * 2, k = 1 - y / 5 * 0.15;
            ring.push([Math.cos(a) * 0.9 * k, y, Math.sin(a) * 0.9 * k]);
        }
        for (let i = 0; i < 6; i++)
            g.line(ring[i], ring[(i + 1) % 6]);
    }
    return g.build();
}
function buildRock(cf) {
    const g = new Geo(cf);
    pyramid(g, 0, 0, 0, 1.7, 2, 4, Math.PI / 4);
    g.line([-1.2, 0, -1.2], [1.2, 0, 1.2]);
    g.line([1.2, 0, -1.2], [-1.2, 0, 1.2]);
    return g.build();
}
function buildMountains() {
    const g = new Geo(() => [0.10, 0.26, 0.55]);
    let sd = 7;
    const r = () => { sd = (sd * 1103515245 + 12345) & 0x7fffffff; return sd / 0x7fffffff; };
    const z = 190;
    let prev = null;
    for (let x = -260; x <= 260; x += 11) {
        const h = 6 + Math.pow(r(), 1.6) * 30;
        const pk = [x, h, z];
        if (prev) {
            g.line(prev, pk);
        }
        g.line([x, 0, z], pk);
        prev = pk;
    }
    g.line([-300, 0, z], [300, 0, z]);
    return g.build();
}
/* ---- 描画ヘルパ ---- */
/** 宙に浮く結晶(上下に尖った六角の双錐)。底が y=0、高さ 3.5、半径 1.8 */
function buildCrystal(cf) {
    const g = new Geo(cf);
    const n = 6, h = 3.5, r = 1.8, mid = h / 2;
    const ring = [];
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        ring.push([Math.cos(a) * r, mid, Math.sin(a) * r]);
    }
    const top = [0, h, 0], bot = [0, 0, 0];
    for (let i = 0; i < n; i++) {
        g.line(ring[i], ring[(i + 1) % n]);
        g.line(ring[i], top);
        g.line(ring[i], bot);
    }
    g.line(bot, top);
    return g.build();
}
Object.assign(WS, { Geo, grad, buildRobot, buildDart, buildTurret, buildPillar, buildRock, buildMountains, buildCrystal });
})(globalThis.WS || (globalThis.WS = {}));
