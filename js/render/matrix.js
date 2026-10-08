(function (WS) {
'use strict';
const M = {
    id: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    mul(a, b) {
        const o = new Array(16);
        for (let c = 0; c < 4; c++)
            for (let r = 0; r < 4; r++) {
                let s = 0;
                for (let k = 0; k < 4; k++)
                    s += a[k * 4 + r] * b[c * 4 + k];
                o[c * 4 + r] = s;
            }
        return o;
    },
    T(x, y, z) { const m = M.id(); m[12] = x; m[13] = y; m[14] = z; return m; },
    S(x, y, z) { const m = M.id(); m[0] = x; m[5] = y; m[10] = z; return m; },
    Rx(a) { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; },
    Ry(a) { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; },
    Rz(a) { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; },
    persp(ty, asp, n, f, sy) {
        const tx = ty * asp;
        return [1 / tx, 0, 0, 0, 0, 1 / ty, 0, 0, 0, sy, (f + n) / (f - n), 1, 0, 0, (-2 * f * n) / (f - n), 0];
    },
};
function rotv(R, v) {
    return [
        R[0] * v[0] + R[4] * v[1] + R[8] * v[2],
        R[1] * v[0] + R[5] * v[1] + R[9] * v[2],
        R[2] * v[0] + R[6] * v[1] + R[10] * v[2],
    ];
}
Object.assign(WS, { M, rotv });
})(globalThis.WS || (globalThis.WS = {}));
