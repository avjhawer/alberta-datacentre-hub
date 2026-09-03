#!/usr/bin/env node
/* ============================================================================
   Render the print sheet to PDF, one file per supply route.

   The sheet is a fixed artboard sized to 17x11in, so this only has to load it
   and print it — no scaling, no page-size guessing. `preferCSSPageSize` takes
   the size from the page's own `@page` rule, which is the single place it is
   declared.

   Playwright is a CI-only tool here. The site itself still has no dependencies
   and no build step: these PDFs are a convenience for people who want the wall
   chart, not something the pages need.

     node scripts/build-pdfs.mjs            # expects a server on :8765
   ========================================================================= */

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'site', 'downloads');
const BASE = process.env.BASE || 'http://127.0.0.1:8765';

const ROUTES = [
  ['grid', 'alberta-data-centre-approvals-grid-connected.pdf'],
  ['offgrid', 'alberta-data-centre-approvals-off-grid.pdf'],
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

for (const [route, file] of ROUTES) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}/approvals-print.html?route=${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.fonts?.ready);

  // The connectors are computed from layout; make sure they exist before
  // printing rather than trusting that they settled.
  const wires = await page.$$eval('.ap-wire', els => els.length);
  const nodes = await page.$$eval('.ap-cell .ap-node', els => els.length);
  if (!wires || !nodes) throw new Error(`${route}: nothing rendered (${nodes} cards, ${wires} connectors)`);
  if (errors.length) throw new Error(`${route}: page errors — ${errors.join('; ')}`);

  await page.pdf({ path: join(OUT, file), preferCSSPageSize: true, printBackground: true });
  console.log(`${file}: ${nodes} cards, ${wires} connectors`);
  await page.close();
}

await browser.close();
