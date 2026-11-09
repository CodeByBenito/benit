#!/usr/bin/env node
/**
 * Scroll verifier (replaces the skill's verificar.mjs, which wasn't available).
 * Scrolls a page top→bottom in three modes (desktop, mobile, reduced motion),
 * taking a screenshot every step so dead zones, contrast problems, clipped
 * elements and animations that finish off-screen can be inspected.
 *
 * Usage: node scripts/verify-scroll.mjs --url http://localhost:3000 --out verification [--step 0.6]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => (cur.startsWith("--") ? [...acc, [cur.slice(2), arr[i + 1]]] : acc), [])
);
const url = args.url ?? "http://localhost:3000";
const out = args.out ?? "verification";
const stepRatio = Number(args.step ?? 0.6);
const only = args.only;

const modes = [
  { name: "desktop", viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" },
  { name: "mobile", viewport: { width: 390, height: 844 }, reducedMotion: "no-preference", isMobile: true, hasTouch: true },
  { name: "reduced", viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" },
].filter((m) => !only || m.name === only);

const browser = await chromium.launch();
const report = [];

for (const mode of modes) {
  const dir = path.join(out, mode.name);
  mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({
    viewport: mode.viewport,
    reducedMotion: mode.reducedMotion,
    isMobile: mode.isMobile,
    hasTouch: mode.hasTouch,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800); // intro animations

  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  const vh = mode.viewport.height;
  const step = Math.round(vh * stepRatio);
  let y = 0;
  let i = 0;
  const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

  while (y <= total) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(mode.reducedMotion === "reduce" ? 250 : 1100);
    const file = path.join(dir, `${String(i).padStart(3, "0")}-y${y}.png`);
    await page.screenshot({ path: file });
    i++;
    y += step;
    const newTotal = await page.evaluate(() => document.documentElement.scrollHeight);
    if (newTotal > total && y > total) break;
  }

  report.push({ mode: mode.name, url, scrollHeight: total, screenshots: i, horizontalOverflow: overflowX, errors });
  await context.close();
}

await browser.close();
writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
