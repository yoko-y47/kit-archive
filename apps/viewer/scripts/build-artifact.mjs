// claude.ai に公開する形に整える（vite build --mode artifact の後に実行）
// - GLB は配信できないため、models/*.glb を base64 テキスト（models/*.glb.b64.txt）に置き換える
// - ページは公開時に <!doctype html>…<body> で包まれるため、index.html から自前の骨組みを外す
import { readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist-artifact/', import.meta.url).pathname;
const models = join(dist, 'models');
for (const f of readdirSync(models).filter(f => f.endsWith('.glb'))) {
  writeFileSync(join(models, f + '.b64.txt'), readFileSync(join(models, f)).toString('base64'));
  rmSync(join(models, f));
}
const page = join(dist, 'index.html');
const html = readFileSync(page, 'utf8')
  .replace(/<!doctype html>\s*/i, '')
  .replace(/<html[^>]*>\s*/i, '').replace(/\s*<\/html>\s*$/i, '\n')
  .replace(/<head>\s*/i, '').replace(/\s*<\/head>\s*/i, '\n')
  .replace(/<body>\s*/i, '').replace(/\s*<\/body>/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '');
writeFileSync(page, html);
console.log('dist-artifact ready:', readdirSync(dist).join(', '));
