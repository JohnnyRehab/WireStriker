(function (WS) {
'use strict';
const { PZ, clamp, findEn, M, FS, VS, buildCrystal, buildDart, buildMountains, buildPillar, buildRobot, buildRock, buildTurret, grad } = WS;
const MAXSEG = 7000;
const PAL = [[0.40, 0.95, 1.0], [1.0, 0.35, 0.70], [1.0, 0.75, 0.25], [1.0, 0.35, 0.35], [1.0, 1.0, 1.0]];
const GROUND = [0.05, 0.30, 0.50];
const GROUND_HI = [0.09, 0.46, 0.72];
const WHITE = [1, 1, 1, 1];
class Renderer {
    cv;
    g1;
    g2;
    x1;
    x2;
    gl;
    prog;
    U = {};
    cornerBuf;
    dyn;
    player;
    heavy;
    meshes = {};
    view = { dpr: 1, VP: M.id(), W: 2, H: 2 };
    mvpBuf = new Float32Array(16);
    dynArr = new Float32Array(MAXSEG * 12);
    dn = 0;
    /** カメラの視覚用の状態(ゲーム状態には含めない) */
    vis = { camX: 0, camY: 3.6 };
    /** 描画だけに使う乱数(画面の揺れ)。シミュレーションの乱数とは別 */
    shakeRand;
    constructor(cv, g1, g2, shakeRand = Math.random) {
        const gl = cv.getContext('webgl2', { antialias: false, alpha: false });
        const c1 = g1.getContext('2d'), c2 = g2.getContext('2d');
        if (!gl || !c1 || !c2)
            throw new Error('WebGL2 を利用できません');
        this.cv = cv;
        this.g1 = g1;
        this.g2 = g2;
        this.gl = gl;
        this.x1 = c1;
        this.x2 = c2;
        this.shakeRand = shakeRand;
        this.init();
        this.resize();
    }
    shader(type, src) {
        const gl = this.gl;
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
            throw new Error(gl.getShaderInfoLog(sh) || 'shader error');
        return sh;
    }
    /** GL の資源を(再)作成する。コンテキスト復帰時にも呼ぶ */
    init() {
        const gl = this.gl;
        const prog = gl.createProgram();
        gl.attachShader(prog, this.shader(gl.VERTEX_SHADER, VS));
        gl.attachShader(prog, this.shader(gl.FRAGMENT_SHADER, FS));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
            throw new Error(gl.getProgramInfoLog(prog) || 'link error');
        this.prog = prog;
        for (const n of ['uMVP', 'uRes', 'uW', 'uFog', 'uFogOn', 'uTint'])
            this.U[n] = gl.getUniformLocation(prog, n);
        this.cornerBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerBuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 0, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.disable(gl.DEPTH_TEST);
        this.buildAll();
    }
    makeMesh(data, dynamic) {
        const gl = this.gl;
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerBuf);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        if (data)
            gl.bufferData(gl.ARRAY_BUFFER, data, dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
        for (let k = 0; k < 4; k++) {
            gl.enableVertexAttribArray(1 + k);
            gl.vertexAttribPointer(1 + k, 3, gl.FLOAT, false, 48, k * 12);
            gl.vertexAttribDivisor(1 + k, 1);
        }
        gl.bindVertexArray(null);
        return { vao, buf, n: data ? data.length / 12 : 0 };
    }
    robot(d) {
        return { torso: this.makeMesh(d.torso, false), thigh: d.thigh.map((a) => this.makeMesh(a, false)), shin: d.shin.map((a) => this.makeMesh(a, false)) };
    }
    buildAll() {
        const cyan = grad([0.22, 0.42, 1.0], [0.35, 0.95, 1.0], 0, 5);
        const red = grad([1.0, 0.22, 0.30], [1.0, 0.60, 0.50], 0, 5);
        const mag = grad([1.0, 0.25, 0.60], [1.0, 0.65, 0.90], -0.5, 0.7);
        const amb = grad([1.0, 0.50, 0.12], [1.0, 0.85, 0.40], -1, 1);
        const teal = grad([0.10, 0.45, 0.75], [0.20, 0.85, 0.95], 0, 5);
        this.player = this.robot(buildRobot(cyan));
        this.heavy = this.robot(buildRobot(red));
        this.meshes = {
            dart: this.makeMesh(buildDart(mag), false),
            turret: this.makeMesh(buildTurret(amb), false),
            pillar: this.makeMesh(buildPillar(teal), false),
            rock: this.makeMesh(buildRock(grad([0.10, 0.45, 0.75], [0.20, 0.85, 0.95], 0, 2)), false),
            crystal: this.makeMesh(buildCrystal(grad([0.55, 0.35, 1.0], [0.9, 0.75, 1.0], 0, 3.5)), false),
            mount: this.makeMesh(buildMountains(), false),
        };
        this.dyn = this.makeMesh(null, true);
    }
    resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.max(2, Math.floor(window.innerWidth * dpr)), h = Math.max(2, Math.floor(window.innerHeight * dpr));
        if (this.cv.width !== w || this.cv.height !== h) {
            this.cv.width = w;
            this.cv.height = h;
        }
        this.g1.width = Math.max(2, w >> 2);
        this.g1.height = Math.max(2, h >> 2);
        this.g2.width = Math.max(2, Math.round(w / 12));
        this.g2.height = Math.max(2, Math.round(h / 12));
        this.view.dpr = dpr;
    }
    setU(mvp, width, tint, fogOn, fogEnd) {
        const gl = this.gl, U = this.U;
        this.mvpBuf.set(mvp);
        gl.uniformMatrix4fv(U.uMVP, false, this.mvpBuf);
        gl.uniform2f(U.uRes, this.view.W, this.view.H);
        gl.uniform1f(U.uW, width * this.view.dpr);
        gl.uniform2f(U.uFog, 30, fogEnd || 165);
        gl.uniform1f(U.uFogOn, fogOn ? 1 : 0);
        gl.uniform4f(U.uTint, tint[0], tint[1], tint[2], tint[3]);
    }
    drawMesh(mesh, model, width, tint, fogOn, fogEnd) {
        if (!mesh || !mesh.n)
            return;
        this.setU(M.mul(this.view.VP, model), width, tint, fogOn, fogEnd);
        this.gl.bindVertexArray(mesh.vao);
        this.gl.drawArraysInstanced(this.gl.TRIANGLE_STRIP, 0, 4, mesh.n);
    }
    dl(ax, ay, az, bx, by, bz, c, k = 1) {
        if (this.dn >= MAXSEG)
            return;
        const o = this.dn * 12, a = this.dynArr;
        a[o] = ax;
        a[o + 1] = ay;
        a[o + 2] = az;
        a[o + 3] = c[0] * k;
        a[o + 4] = c[1] * k;
        a[o + 5] = c[2] * k;
        a[o + 6] = bx;
        a[o + 7] = by;
        a[o + 8] = bz;
        a[o + 9] = c[0] * k;
        a[o + 10] = c[1] * k;
        a[o + 11] = c[2] * k;
        this.dn++;
    }
    flush(width, fogOn, fogEnd) {
        if (!this.dn)
            return;
        const gl = this.gl;
        gl.bindVertexArray(this.dyn.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.dyn.buf);
        gl.bufferData(gl.ARRAY_BUFFER, this.dynArr.subarray(0, this.dn * 12), gl.DYNAMIC_DRAW);
        this.setU(this.view.VP, width, WHITE, fogOn, fogEnd);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.dn);
        this.dn = 0;
    }
    drawRobot(R, base, pose, width, tint) {
        const body = M.mul(base, M.mul(M.T(0, 1.9, 0), M.mul(M.Rz(pose.roll), M.mul(M.Rx(pose.pitch), M.T(0, -1.9, 0)))));
        this.drawMesh(R.torso, body, width, tint, true);
        for (let i = 0; i < 2; i++) {
            const s = i ? 1 : -1, a = pose.a[i], b = pose.b[i];
            const hipM = M.mul(base, M.mul(M.T(s * 0.42, 1.9, 0), M.mul(M.Rx(a), M.T(-s * 0.42, -1.9, 0))));
            this.drawMesh(R.thigh[i], hipM, width, tint, true);
            const kneeM = M.mul(hipM, M.mul(M.T(s * 0.42, 1.0, 0), M.mul(M.Rx(b), M.T(-s * 0.42, -1.0, 0))));
            this.drawMesh(R.shin[i], kneeM, width, tint, true);
        }
    }
    render(S, cfg) {
        const gl = this.gl, cv = this.cv, view = this.view, vis = this.vis;
        const W = cv.width, H = cv.height;
        view.W = W;
        view.H = H;
        gl.viewport(0, 0, W, H);
        gl.clearColor(0.004, 0.008, 0.02, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(this.prog);
        const asp = W / H, ty = Math.max(0.52, 0.92 / asp);
        const p = S.p;
        vis.camX += (p.x * 0.3 - vis.camX) * 0.1;
        vis.camY += (3.6 + p.y * 0.22 - vis.camY) * 0.08;
        const sh = S.shake > 0 ? S.shake * 0.025 : 0;
        const cx = vis.camX + (sh ? (this.shakeRand() - 0.5) * sh * 6 : 0), cy = vis.camY + (sh ? (this.shakeRand() - 0.5) * sh * 6 : 0);
        view.VP = M.mul(M.persp(ty, asp, 0.2, 260, 0.2), M.T(-cx, -cy, 0));
        /* 山のシルエットと地平線(霧なし・視差は小さく) */
        this.drawMesh(this.meshes.mount, M.T(vis.camX * 0.92, 0, 0), 1.6, WHITE, false);
        /* 地面のワイヤー格子 */
        for (let i = -15; i <= 15; i++) {
            const x = i * 4, c = i % 5 === 0 ? GROUND_HI : GROUND;
            this.dl(x, 0, 1.5, x, 0, 205, c);
        }
        for (let k = 1; k <= 51; k++) {
            const z = k * 4 - S.scroll;
            if (z < 1)
                continue;
            this.dl(-62, 0, z, 62, 0, z, GROUND);
        }
        this.flush(1.4, true, 115);
        /* 背景の障害物 */
        for (const o of S.sc) {
            const d = cfg.stage.scenery[o.t];
            const y0 = d ? d.y : 0;
            this.drawMesh(this.meshes[d ? d.mesh : 'rock'], M.T(o.x, y0, o.z), 1.8, WHITE, true);
            if (y0 > 0) {
                /* 浮いている物は、地面への影と細い線で高さを読めるようにする */
                const sc = [0.30, 0.16, 0.55], rr = d ? d.radius : 1;
                this.dl(o.x, 0.02, o.z, o.x, y0, o.z, sc, 1);
                for (let i = 0; i < 12; i++) {
                    const a = (i / 12) * 6.2832, b = ((i + 1) / 12) * 6.2832;
                    this.dl(o.x + Math.cos(a) * rr, 0.02, o.z + Math.sin(a) * rr, o.x + Math.cos(b) * rr, 0.02, o.z + Math.sin(b) * rr, sc, 1);
                }
            }
        }
        /* 敵 */
        for (const e of S.en) {
            if (e.hp <= 0)
                continue;
            const tint = e.flash > 0 ? [2.2, 2.2, 2.2, 1] : WHITE;
            const mesh = cfg.enemies[e.type].mesh;
            if (mesh === 'dart') {
                const rz = Math.cos(S.t * 0.04 + e.ph) * 0.5;
                this.drawMesh(this.meshes.dart, M.mul(M.T(e.x, e.y, e.z), M.Rz(rz)), 2, tint, true);
                this.dl(e.x, 0.02, e.z, e.x, e.y - 0.6, e.z, [0.5, 0.15, 0.3], 1);
                for (let i = 0; i < 10; i++) {
                    const a = (i / 10) * 6.2832, b = ((i + 1) / 10) * 6.2832;
                    this.dl(e.x + Math.cos(a) * 1.2, 0.02, e.z + Math.sin(a) * 1.2, e.x + Math.cos(b) * 1.2, 0.02, e.z + Math.sin(b) * 1.2, [0.7, 0.2, 0.45], 1);
                }
            }
            else if (mesh === 'turret') {
                this.drawMesh(this.meshes.turret, M.T(e.x, e.y, e.z), 2, tint, true);
            }
            else {
                const bob = Math.sin(S.t * 0.05 + e.ph) * 0.15;
                const base = M.mul(M.T(e.x, e.y - 3.2 + bob, e.z), M.mul(M.S(1.4, 1.4, 1.4), M.Ry(Math.PI)));
                const ph = S.t * 0.08;
                this.drawRobot(this.heavy, base, { roll: Math.sin(ph) * 0.05, pitch: 0.05, a: [Math.sin(ph) * 0.12, -Math.sin(ph) * 0.12], b: [0.1, 0.1] }, 2.1, tint);
            }
        }
        /* プレイヤー */
        if (!S.over) {
            const tgt = p.lock ? findEn(S, p.lock) : null;
            const air = clamp(p.y / 0.6, 0, 1);
            const ph = S.t * 0.33;
            const aG = [Math.sin(ph) * 0.7, Math.sin(ph + Math.PI) * 0.7];
            const bG = [Math.max(0, -Math.sin(ph - 0.9)) * 0.9, Math.max(0, -Math.sin(ph + Math.PI - 0.9)) * 0.9];
            const aA = [-0.25, 0.35], bA = [0.2, 0.55];
            const pose = {
                roll: -clamp(p.vx, -0.45, 0.45) * 0.5,
                pitch: 0.12 + (p.dash > 0 ? 0.35 : 0) - p.vy * 0.25,
                a: [aG[0] * (1 - air) + aA[0] * air, aG[1] * (1 - air) + aA[1] * air],
                b: [bG[0] * (1 - air) + bA[0] * air, bG[1] * (1 - air) + bA[1] * air],
            };
            const blink = p.inv > 0 && (S.t >> 2) & 1 ? 0.25 : 1;
            const base = M.mul(M.T(p.x, p.y, PZ), M.Ry(p.yaw));
            this.drawRobot(this.player, base, pose, 2.0, [1, 1, 1, blink]);
            /* 地面の影(高度の手がかり) */
            const sr = 1.5 / (1 + p.y * 0.12), sk = 0.8 / (1 + p.y * 0.2);
            for (let i = 0; i < 14; i++) {
                const a = (i / 14) * 6.2832, b = ((i + 1) / 14) * 6.2832;
                this.dl(p.x + Math.cos(a) * sr, 0.02, PZ + Math.sin(a) * sr * 1.3, p.x + Math.cos(b) * sr, 0.02, PZ + Math.sin(b) * sr * 1.3, [0.25, 0.7, 1.0], sk);
            }
            /* ロックオン枠 */
            if (tgt) {
                const h = tgt.r * 1.25 * (1 + 0.06 * Math.sin(S.t * 0.3)), l = h * 0.45, z = tgt.z - tgt.r, c = [1.0, 0.85, 0.35];
                for (const sx of [-1, 1])
                    for (const sy of [-1, 1]) {
                        const X = tgt.x + sx * h, Y = tgt.y + sy * h;
                        this.dl(X, Y, z, X - sx * l, Y, z, c, 1.2);
                        this.dl(X, Y, z, X, Y - sy * l, z, c, 1.2);
                    }
            }
        }
        /* 弾 */
        for (const b of S.bl) {
            const k = b.k === 'A' ? 3 : 2.2, c = b.k === 'A' ? [0.7, 1.0, 1.0] : [1.0, 0.95, 0.6];
            const m = Math.hypot(b.vx, b.vy, b.vz) || 1;
            this.dl(b.x, b.y, b.z, b.x - (b.vx / m) * k, b.y - (b.vy / m) * k, b.z - (b.vz / m) * k, c, 1.3);
            if (b.k === 'B') {
                const q = 0.35;
                this.dl(b.x - q, b.y, b.z, b.x + q, b.y, b.z, c);
                this.dl(b.x, b.y - q, b.z, b.x, b.y + q, b.z, c);
            }
        }
        for (const b of S.eb) {
            const q = 0.55, c = [1.0, 0.35, 0.55];
            this.dl(b.x - q, b.y, b.z, b.x, b.y + q, b.z, c);
            this.dl(b.x, b.y + q, b.z, b.x + q, b.y, b.z, c);
            this.dl(b.x + q, b.y, b.z, b.x, b.y - q, b.z, c);
            this.dl(b.x, b.y - q, b.z, b.x - q, b.y, b.z, c);
            this.dl(b.x, b.y, b.z - q, b.x, b.y, b.z + q, c);
        }
        /* 破片と衝撃輪 */
        for (const f of S.fx) {
            const c = PAL[f.c], k = f.life / f.max;
            if (f.k === 's') {
                this.dl(f.x, f.y, f.z, f.x - f.vx * 3, f.y - f.vy * 3, f.z - f.vz * 3, c, Math.min(1, k * 1.6));
            }
            else {
                const n = 16;
                for (let i = 0; i < n; i++) {
                    const a = (i / n) * 6.2832, b = ((i + 1) / n) * 6.2832;
                    this.dl(f.x + Math.cos(a) * f.r, f.y + Math.sin(a) * f.r, f.z, f.x + Math.cos(b) * f.r, f.y + Math.sin(b) * f.r, f.z, c, k);
                }
            }
        }
        this.flush(2.0, true);
        /* 発光用キャンバスへ縮小コピー */
        this.x1.clearRect(0, 0, this.g1.width, this.g1.height);
        this.x1.drawImage(cv, 0, 0, this.g1.width, this.g1.height);
        this.x2.clearRect(0, 0, this.g2.width, this.g2.height);
        this.x2.drawImage(cv, 0, 0, this.g2.width, this.g2.height);
    }
}
Object.assign(WS, { Renderer });
})(globalThis.WS || (globalThis.WS = {}));
