(function (WS) {
'use strict';
const { formatErrors, validateConfig } = WS;
const rawDefault = WS.rawDefault;
const res = validateConfig(rawDefault);
if (!res.ok)
    throw new Error('標準設定(default-config.js)が不正です\n' + formatErrors(res.errors));
/** 同梱の標準設定。検証済み・凍結済み */
const defaultConfig = res.config;
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
function isPlain(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}
/** base に patch を重ねる。オブジェクトは再帰的に、配列と数値などは置き換え */
function mergeRaw(base, patch) {
    if (!isPlain(base) || !isPlain(patch))
        return patch;
    const out = {};
    for (const k of Object.keys(base))
        Object.defineProperty(out, k, { value: base[k], enumerable: true, writable: true, configurable: true });
    for (const k of Object.keys(patch)) {
        if (FORBIDDEN.has(k))
            continue;
        Object.defineProperty(out, k, { value: mergeRaw(base[k], patch[k]), enumerable: true, writable: true, configurable: true });
    }
    return out;
}
/** 標準設定に一部だけ重ねて検証する。例: loadConfig({rules:{playerHp:60}}) */
function loadConfig(patch) {
    return validateConfig(mergeRaw(rawDefault, patch));
}
Object.assign(WS, { defaultConfig, mergeRaw, loadConfig });
})(globalThis.WS || (globalThis.WS = {}));
