// ビルド: src/ を 1 つの IIFE にまとめ、CSS と HTML を埋め込んで dist/ に出す。
//   dist/index.html    … 単独で開ける完全な HTML
//   dist/artifact.html … アーティファクト公開用の断片(<html>/<body> は公開側が付ける)
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');

const result = await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'iife',
  target: 'es2022',
  minify: true,
  write: false,
  legalComments: 'none',
  logLevel: 'warning',
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = await read('src/ui/style.css');
const body = await read('src/ui/body.html');

const head = `<title>ワイヤー・ストライカー</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;700&family=Share+Tech+Mono&display=swap">
<style>
${css.trimEnd()}
</style>`;
const fragment = `${head}\n\n${body.trimEnd()}\n\n<script>\n${js.trimEnd()}\n</script>\n`;
const full = `<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<style>html,body{margin:0}</style>\n${head}\n</head>\n<body>\n${body.trimEnd()}\n<script>\n${js.trimEnd()}\n</script>\n</body>\n</html>\n`;

await mkdir(new URL('dist/', import.meta.url), { recursive: true });
await writeFile(new URL('dist/artifact.html', import.meta.url), fragment);
await writeFile(new URL('dist/index.html', import.meta.url), full);
console.log(`dist/artifact.html ${(fragment.length / 1024).toFixed(1)} KB, dist/index.html ${(full.length / 1024).toFixed(1)} KB`);
