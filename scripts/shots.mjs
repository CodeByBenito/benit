// Screenshots of any routes at the three review widths.
//   node scripts/shots.mjs --url http://localhost:3100 --out verification/shots /login /dev/painel
// Options: --full (full page), --widths 390,768,1440
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return false;
  args.splice(i, 1);
  return true;
};

const base = opt("url", "http://localhost:3100");
const out = opt("out", "verification/shots");
const widths = opt("widths", "390,768,1440").split(",").map(Number);
const full = flag("full");
const routes = args.length ? args : ["/"];

fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
let overflowed = 0;
for (const width of widths) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  for (const route of routes) {
    await page.goto(base + route, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const name = (route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home") + `-${width}.png`;
    await page.screenshot({ path: path.join(out, name), fullPage: full });
    if (overflow > 1) overflowed += 1;
    console.log(`${overflow > 1 ? "OVERFLOW " + overflow + "px" : "ok"}\t${width}\t${route}\t${name}`);
  }
  await ctx.close();
}
await browser.close();
process.exit(overflowed ? 1 : 0);
