import type { Config } from '../data/types.ts';
import type { State } from '../core/types.ts';

export type OverlayKind = 'ready' | 'pause' | 'over';

const $ = (id: string): HTMLElement => {
  const n = document.getElementById(id);
  if (!n) throw new Error('#' + id + ' がありません');
  return n;
};

/** HUD とオーバーレイ。DOM を触るのはここだけ(変化があったときだけ書き換える) */
export class Ui {
  readonly el = {
    score: $('score'), dist: $('dist'), hp: $('hpfill'), pips: $('pips'), lock: $('lock'), st: $('st'),
    ov: $('ov'), ovt: $('ovt'), ovs: $('ovs'), ovr: $('ovr'), go: $('go') as HTMLButtonElement, pause: $('pausebtn'),
  };
  private prev: Record<string, unknown> = {};

  /** 設定が変わったら呼ぶ(ミサイルの最大数と体力の基準が変わるため) */
  setConfig(cfg: Config): void {
    const pips = this.el.pips;
    pips.textContent = '';
    for (let i = 0; i < cfg.rules.missileMax; i++) pips.appendChild(document.createElement('i'));
    this.prev = {};
  }

  private setText(node: HTMLElement, key: string, v: string): void {
    if (this.prev[key] !== v) { this.prev[key] = v; node.innerHTML = v; }
  }

  update(S: State, cfg: Config): void {
    const p = S.p, el = this.el;
    this.setText(el.score, 'sc', String(S.score).padStart(6, '0'));
    this.setText(el.dist, 'di', String(Math.floor(S.dist)).padStart(4, '0') + '<span style="font-size:12px"> m</span>');
    const hpPct = Math.round((p.hp / cfg.rules.playerHp) * 100);
    if (this.prev.hp !== hpPct) {
      this.prev.hp = hpPct;
      el.hp.style.width = 'calc(' + hpPct + '% - 2px)';
      el.hp.classList.toggle('low', hpPct <= 30);
    }
    if (this.prev.am !== p.ammoB) {
      this.prev.am = p.ammoB;
      const ch = el.pips.children;
      for (let i = 0; i < ch.length; i++) ch[i]!.className = i < p.ammoB ? 'on' : '';
    }
    const lk = p.lock ? 1 : 0;
    if (this.prev.lk !== lk) {
      this.prev.lk = lk;
      el.lock.textContent = lk ? 'LOCK ON' : 'NO LOCK';
      el.lock.className = lk ? 'on' : '';
    }
  }

  showOverlay(kind: OverlayKind, S: State): void {
    const el = this.el;
    el.ov.hidden = false;
    if (kind === 'ready') {
      el.ovt.textContent = 'ワイヤー・ストライカー';
      el.ovs.hidden = false; el.ovr.hidden = true; el.go.textContent = 'START [Enter]';
    } else if (kind === 'pause') {
      el.ovt.textContent = 'PAUSED'; el.ovs.hidden = true; el.ovr.hidden = true; el.go.textContent = 'RESUME [Enter]';
    } else {
      el.ovt.textContent = 'GAME OVER'; el.ovs.hidden = true; el.ovr.hidden = false;
      el.ovr.textContent = 'SCORE ' + String(S.score).padStart(6, '0') + '   撃墜 ' + S.kills + '   ' + Math.floor(S.dist) + ' m';
      el.go.textContent = 'RETRY [Enter]';
    }
    el.go.focus({ preventScroll: true });
  }

  hideOverlay(): void { this.el.ov.hidden = true; }
}
