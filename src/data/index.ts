import rawDefault from './default.json' with { type: 'json' };
import { formatErrors, validateConfig } from './validate.ts';
import type { ValidateResult } from './validate.ts';
import type { Config } from './types.ts';

export type { Config } from './types.ts';
export * from './types.ts';
export { validateConfig, formatErrors } from './validate.ts';
export type { ValidateResult, ValidationError } from './validate.ts';

const res = validateConfig(rawDefault);
if (!res.ok) throw new Error('default.json が不正です\n' + formatErrors(res.errors));

/** 同梱の標準設定。検証済み・凍結済み */
export const defaultConfig: Config = res.config;

const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);

function isPlain(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** base に patch を重ねる。オブジェクトは再帰的に、配列と数値などは置き換え */
export function mergeRaw(base: unknown, patch: unknown): unknown {
  if (!isPlain(base) || !isPlain(patch)) return patch;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(base)) Object.defineProperty(out, k, { value: base[k], enumerable: true, writable: true, configurable: true });
  for (const k of Object.keys(patch)) {
    if (FORBIDDEN.has(k)) continue;
    Object.defineProperty(out, k, { value: mergeRaw(base[k], patch[k]), enumerable: true, writable: true, configurable: true });
  }
  return out;
}

/** 標準設定に一部だけ重ねて検証する。例: loadConfig({rules:{playerHp:60}}) */
export function loadConfig(patch: unknown): ValidateResult {
  return validateConfig(mergeRaw(rawDefault, patch));
}
