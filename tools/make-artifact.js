// 公開専用: アーティファクトは1枚の HTML しか受け付けないので、index.html に CSS と JS を埋め込んだ断片を作る。
// 遊ぶのにも開発するのにも不要。使い方: node tools/make-artifact.js  → artifact.html(リポジトリには含めない)
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
let html = read('index.html');
const css = read('style.css');
html = html.replace('<link rel="stylesheet" href="style.css">', `<style>\n${css.trimEnd()}\n</style>`);
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => `<script>\n${read(src).trimEnd().replace(/<\/script/gi, '<\\/script')}\n</script>`);
// 公開側が <html>/<head>/<body> を付けるので、中身だけを取り出す
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1].replace(/<meta [^>]*>\n?/g, '').replace(/<style>html,body\{margin:0\}<\/style>\n?/, '');
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
writeFileSync(new URL('artifact.html', root), `${head.trim()}\n\n${body.trim()}\n`);
console.log('artifact.html を作りました');
