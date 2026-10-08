(function (WS) {
'use strict';
const { defaultConfig, formatErrors, loadConfig, newState, step, hash, selfTest, BLOCK_KEYS, buildInput, firstPad, Renderer, Ui } = WS;
const ui = new Ui();
const el = ui.el;
let cfg = defaultConfig;
let S = newState(20261006, cfg);
let mode = 'ready';
let ready = true;
let glLost = false;
let renderer = null;
const keys = new Set();
try {
    renderer = new Renderer(document.getElementById('gl'), document.getElementById('glow1'), document.getElementById('glow2'));
}
catch (err) {
    console.error(err);
    ready = false;
}
ui.setConfig(cfg);
function startOrResume() {
    if (!ready)
        return;
    if (mode === 'over' || mode === 'ready')
        S = newState((Date.now() & 0x7fffffff) | 0, cfg);
    mode = 'play';
    ui.hideOverlay();
    try {
        window.focus();
    }
    catch { /* 無視 */ }
}
function pause() { if (mode === 'play') {
    mode = 'pause';
    ui.showOverlay('pause', S);
} }
window.addEventListener('keydown', (e) => {
    if (BLOCK_KEYS.has(e.code))
        e.preventDefault();
    if (e.repeat && (e.code === 'Enter' || e.code === 'KeyP' || e.code === 'Escape'))
        return;
    keys.add(e.code);
    if (e.code === 'Enter' && mode !== 'play') {
        e.preventDefault();
        startOrResume();
    }
    else if (e.code === 'KeyP' || e.code === 'Escape') {
        if (mode === 'play')
            pause();
        else if (mode === 'pause')
            startOrResume();
    }
});
window.addEventListener('keyup', (e) => { keys.delete(e.code); });
window.addEventListener('blur', () => { keys.clear(); pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden)
    pause(); });
el.go.addEventListener('click', startOrResume);
el.pause.addEventListener('click', () => { if (mode === 'play')
    pause();
else if (mode === 'pause')
    startOrResume(); });
window.addEventListener('resize', () => renderer?.resize());
if (renderer) {
    const r = renderer;
    r.cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); glLost = true; });
    r.cv.addEventListener('webglcontextrestored', () => {
        try {
            r.init();
            r.resize();
            glLost = false;
        }
        catch (err) {
            console.error(err);
            ready = false;
        }
    });
}
/* ---- メインループ(固定60Hz) ---- */
const STEP = 1000 / 60;
let last = performance.now(), acc = 0;
function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(100, now - last);
    last = now;
    if (mode === 'play') {
        acc += dt;
        let n = 0;
        while (acc >= STEP && n < 5) {
            step(S, buildInput(keys, firstPad()), cfg);
            acc -= STEP;
            n++;
        }
        if (n >= 5)
            acc = 0;
        if (S.over && S.overT > 110) {
            mode = 'over';
            ui.showOverlay('over', S);
        }
    }
    else if (mode === 'ready') {
        S.t++;
        S.scroll = (S.scroll + cfg.rules.scrollSpeed) % 4;
    }
    ui.update(S, cfg);
    if (ready && !glLost)
        renderer?.render(S, cfg);
}
/* ---- 起動 ---- */
if (!ready) {
    el.ovs.textContent = 'このブラウザではWebGL2を利用できません。対応ブラウザでお試しください。';
    el.go.disabled = true;
}
const tr = selfTest(cfg);
el.st.textContent = '決定性テスト ' + (tr.ok ? 'OK' : 'NG') + ' #' + tr.hash.toString(16).padStart(8, '0') + ' / ' + tr.frames + 'f / 撃墜' + tr.kills;
ui.showOverlay('ready', S);
requestAnimationFrame(frame);
/* ---- デバッグ用(#debug のときだけ公開) ---- */
if (location.hash === '#debug') {
    const w = window;
    w.__ws = {
        get S() { return S; },
        get cfg() { return cfg; },
        get mode() { return mode; },
        step, newState, selfTest, hash,
        /** 標準設定に patch を重ねて適用し、最初からやり直す。不正なら適用せずエラー文を返す */
        apply(patch) {
            const r = loadConfig(patch);
            if (!r.ok)
                return formatErrors(r.errors);
            cfg = r.config;
            ui.setConfig(cfg);
            S = newState(20261006, cfg);
            mode = 'ready';
            ui.showOverlay('ready', S);
            return null;
        },
    };
}
})(globalThis.WS || (globalThis.WS = {}));
