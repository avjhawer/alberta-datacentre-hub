#!/usr/bin/env node
/* ============================================================================
   Watch authoritative pages for silent changes -> site/data/alerts.json

   Feeds only carry what someone chose to announce. A quietly amended bylaw or
   an updated AESO process page produces no press release, so this hashes the
   readable text of each watched page and reports when it moves.

     node scripts/watch-sources.mjs
     node scripts/watch-sources.mjs --dry   (no writes)
   ========================================================================= */

import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { fetchText, mainText } from './lib/feed.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'site', 'data');
const MAX_ALERTS = 60;
const CONCURRENCY = 4;

const dry = process.argv.includes('--dry');

function sha(s) { return createHash('sha256').update(s).digest('hex').slice(0, 16); }

async function pool(items, limit, fn) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); }
  }));
  return out;
}

/** A short, human-readable description of what moved. */
function describeChange(before, after) {
  const wb = before ? before.split(' ').length : 0;
  const wa = after.split(' ').length;
  const delta = wa - wb;
  if (!before) return 'first capture';
  if (Math.abs(delta) < 5) return 'wording changed';
  return delta > 0 ? `about ${delta} words added` : `about ${Math.abs(delta)} words removed`;
}

async function main() {
  const sources = JSON.parse(await readFile(join(DATA, 'sources.json'), 'utf8'));
  const watch = sources.watch || [];

  let state = { pages: {} };
  try {
    state = JSON.parse(await readFile(join(DATA, 'watch-state.json'), 'utf8'));
    if (!state.pages) state.pages = {};
  } catch { /* first run */ }

  let alerts = { generatedAt: null, alerts: [] };
  try {
    alerts = JSON.parse(await readFile(join(DATA, 'alerts.json'), 'utf8'));
    if (!Array.isArray(alerts.alerts)) alerts.alerts = [];
  } catch { /* first run */ }

  console.log(`Checking ${watch.length} watched page(s)…`);
  const now = new Date().toISOString();
  const fresh = [];
  let okCount = 0;

  await pool(watch, CONCURRENCY, async (w) => {
    try {
      const html = await fetchText(w.url, { timeoutMs: 25000 });
      const text = mainText(html);
      if (text.length < 200) throw new Error(`only ${text.length} chars of text — likely blocked`);

      const hash = sha(text);
      const prev = state.pages[w.id];
      okCount++;

      if (!prev) {
        state.pages[w.id] = { hash, words: text.split(' ').length, checkedAt: now, url: w.url };
        console.log(`  new  ${w.id} — baseline captured`);
        return;
      }

      if (prev.hash !== hash) {
        const change = describeChange(' '.repeat(prev.words || 0).trim() || null, text);
        fresh.push({
          id: w.id,
          name: w.name,
          url: w.url,
          tier: w.tier || 'primary',
          detectedAt: now,
          previousCheck: prev.checkedAt,
          change: prev.words ? `${prev.words} → ${text.split(' ').length} words` : change,
        });
        console.log(`  CHANGED ${w.id} — ${prev.words} → ${text.split(' ').length} words`);
      } else {
        console.log(`  same ${w.id}`);
      }

      state.pages[w.id] = { hash, words: text.split(' ').length, checkedAt: now, url: w.url };
    } catch (err) {
      console.log(`  FAIL ${w.id} — ${err.message}`);
      if (state.pages[w.id]) state.pages[w.id].lastError = err.message;
    }
  });

  alerts.alerts = [...fresh, ...alerts.alerts].slice(0, MAX_ALERTS);
  alerts.generatedAt = now;

  if (dry) {
    console.log('\n--dry: no files written');
  } else {
    await writeFile(join(DATA, 'watch-state.json'), JSON.stringify(state, null, 2) + '\n');
    await writeFile(join(DATA, 'alerts.json'), JSON.stringify(alerts, null, 2) + '\n');
  }

  console.log(`\n${okCount}/${watch.length} pages reachable · ${fresh.length} change(s) detected.`);

  // Expose the change list to the workflow so it can open an issue.
  if (process.env.GITHUB_OUTPUT && fresh.length) {
    const summary = fresh.map(a => `- **${a.name}** (${a.change}) — ${a.url}`).join('\n');
    const { appendFileSync } = await import('node:fs');
    appendFileSync(process.env.GITHUB_OUTPUT, `changed=true\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `summary<<EOF\n${summary}\nEOF\n`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
