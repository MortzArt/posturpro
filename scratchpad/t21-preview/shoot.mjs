import { chromium } from "playwright";

const BASE = "http://localhost:3111/es-MX";
const OUT = "scratchpad/t21-preview";
const pages = [
  ["sillas", "/sillas"],
  ["categorias", "/categorias"],
  ["marcas", "/marcas"],
  ["empresas", "/empresas"],
  ["carrito", "/carrito"],
  ["contacto", "/contacto"],
  ["showroom", "/showroom"],
  ["404", "/no-such-page-xyz"],
];

const viewports = [
  ["desktop", 1280, 900],
  ["mobile", 375, 812],
];

const browser = await chromium.launch();
for (const [vpName, w, h] of viewports) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  for (const [name, path] of pages) {
    try {
      await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${name}-${vpName}.png`, fullPage: false });
      console.log(`shot ${name}-${vpName}`);
    } catch (err) {
      console.log(`FAIL ${name}-${vpName}: ${err.message}`);
    }
  }
  await ctx.close();
}
await browser.close();
console.log("done");
