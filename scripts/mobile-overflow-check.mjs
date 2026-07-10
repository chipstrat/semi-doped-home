#!/usr/bin/env node
// Regression check: no horizontal overflow at mobile width.
// Usage: node scripts/mobile-overflow-check.mjs [base-url]
//   base-url defaults to https://semidoped.com — pass http://localhost:4321
//   after `npm run preview` to check a local build.
// Runs in CI against the local build (see deploy.yml), or anywhere playwright
// exists (framework:~/semidoped/sdd-pod needs PW_CHANNEL=chrome).
// Exits 1 if any page scrolls horizontally at 390px, printing the offenders.
import { chromium } from 'playwright';

const base = process.argv[2] || 'https://semidoped.com';
const pages = ['/', '/episodes/', '/partners/'];

const channel = process.env.PW_CHANNEL;
const browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();

// include the newest episode page
await page.goto(base + '/episodes/', { waitUntil: 'domcontentloaded' });
const epHref = await page.locator('a[href^="/episodes/"]:not([href="/episodes/"])').first()
  .getAttribute('href').catch(() => null);
if (epHref) pages.push(epHref);

let failed = false;
for (const path of pages) {
  await page.goto(base + path, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1000);
  const res = await page.evaluate(() => {
    const d = document.documentElement;
    const offenders = [];
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.right > d.clientWidth + 2 || r.left < -2) {
        offenders.push(`${el.tagName}.${String(el.className).slice(0, 50)} right=${Math.round(r.right)}`);
        if (offenders.length >= 5) break;
      }
    }
    return { scrollW: d.scrollWidth, clientW: d.clientWidth, offenders };
  });
  // Fail only on real horizontal scroll. Elements past the viewport edge are
  // fine when a clipping ancestor contains them (decorative wafer backgrounds
  // do this on purpose) — print them as diagnostics, not failures.
  const ok = res.scrollW <= res.clientW;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${path} scroll=${res.scrollW} client=${res.clientW}`);
  if (!ok) { failed = true; res.offenders.forEach(o => console.log('     ', o)); }
}
await browser.close();
process.exit(failed ? 1 : 0);
