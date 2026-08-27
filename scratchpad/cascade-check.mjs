import { chromium } from '@playwright/test';
const html = `<!doctype html><html><head><style>
@layer theme, base, components, utilities;
@layer utilities { .border { border-style:solid; border-width:1px } .border-red { border-color:red } }
.ts .factorial-card { border:0 }
</style></head><body class="ts">
<div class="factorial-card border border-red" id="t">x</div>
</body></html>`;
const b = await chromium.launch();
const p = await b.newPage();
await p.setContent(html);
const bw = await p.$eval('#t', el => getComputedStyle(el).borderTopWidth);
console.log('borderTopWidth =', bw, bw==='0px' ? '=> BORDER SUPPRESSED (bug confirmed)' : '=> border renders');
await b.close();
