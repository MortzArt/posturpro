import { chromium } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function walk(dir, out=[]) {
  for (const e of readdirSync(dir)) {
    const f = join(dir, e);
    const s = statSync(f);
    if (s.isDirectory()) walk(f, out);
    else if (f.endsWith('.css')) out.push(f);
  }
  return out;
}
const cssFiles = walk('.next/static');
let css = cssFiles.map(f => readFileSync(f,'utf8')).join('\n');

const html = `<!doctype html><html><head><style>${css}</style></head>
<body class="theme-storefront">
  <div id="old" class="factorial-card enter-fade mt-6 p-4 border border-warning/30 bg-warning/10">OLD</div>
  <div id="new" class="enter-fade mt-6 p-4 rounded-[var(--radius)] border border-warning/30 bg-warning/10">NEW</div>
</body></html>`;

const b = await chromium.launch();
const p = await b.newPage();
await p.setContent(html);
for (const id of ['old','new']) {
  const r = await p.$eval('#'+id, el => {
    const cs = getComputedStyle(el);
    return { bw: cs.borderTopWidth, bc: cs.borderTopColor, br: cs.borderTopRightRadius };
  });
  console.log(id.padEnd(4), '=> border-width:', r.bw, '| color:', r.bc, '| radius:', r.br);
}
await b.close();
