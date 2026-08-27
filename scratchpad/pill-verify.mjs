import { chromium } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
function walk(dir, out=[]) { for (const e of readdirSync(dir)) { const f=join(dir,e); const s=statSync(f); if(s.isDirectory()) walk(f,out); else if(f.endsWith('.css')) out.push(f);} return out; }
const css = walk('.next/static').map(f=>readFileSync(f,'utf8')).join('\n');
// resolved keep-shopping class string (outline + xl base) + pill-outline
const cls = "group/button inline-flex shrink-0 items-center justify-center border bg-clip-padding text-xs/relaxed font-medium whitespace-nowrap transition-colors border-border h-12 min-w-12 gap-1.5 rounded-full px-8 text-base font-semibold pill-outline cart-press gap-1.5";
const html = `<!doctype html><html><head><style>${css}</style></head><body class="theme-storefront"><a id="k" class="${cls}">Keep</a></body></html>`;
const b = await chromium.launch(); const p = await b.newPage(); await p.setContent(html);
const r = await p.$eval('#k', el => { const cs=getComputedStyle(el); return {bw:cs.borderTopWidth, bc:cs.borderTopColor, br:cs.borderTopRightRadius, color:cs.color}; });
console.log('keep-shopping pill =>', JSON.stringify(r));
await b.close();
