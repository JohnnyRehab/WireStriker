// index.html の <script src> を、書かれた順に読み込む。ブラウザと同じファイル・同じ順序でテストするため。
// main.js(画面の起動)だけは DOM が要るので読まない。
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
export const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);

export const WS = {};
globalThis.WS = WS;
for (const src of scripts) {
  if (src.endsWith('/main.js')) continue;
  vm.runInThisContext(readFileSync(new URL(src, root), 'utf8'), { filename: src });
}
