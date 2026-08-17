#!/usr/bin/env node
/* ============================================================================
   Check curated records against their live source pages.

   Two jobs:
     1. Link health — is the source still reachable? Link rot is the quiet way
        a reference site becomes untrustworthy.
     2. Claim presence — do the distinctive figures and phrases in a record
        still appear on the page it cites?

   This does NOT prove a record is true; a page can be reachable and still not
   support the claim. It tells you where to look. A record whose figures no
   longer appear on its own source is the first thing to re-read by hand.

   Run in Actions (the sandbox that authored these records cannot reach
   alberta.ca or aeso.ca):

     node scripts/verify-seeds.mjs
     node scripts/verify-seeds.mjs --json     machine-readable output
   ========================================================================= */

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchText, mainText } from './lib/feed.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'site', 'data');
const asJson = process.argv.includes('--json');

/** Numbers worth checking: 3+ digits, or a decimal, with separators removed. */
function numericTokens(text) {
  const out = new Set();
  for (const m of String(text).matchAll(/\b\d[\d,\.]{2,}\b/g)) {
    const raw = m[0].replace(/[,\s]/g, '');
    if (raw.replace(/\./g, '').length >= 3) out.add(raw);
  }
  return [...out];
}

/** Does the page contain this number, allowing for comma/space formatting? */
function pageHasNumber(pageText, token) {
  const digits = token.replace(/\./g, '');
  const flexible = digits.split('').join('[,\\s]?');
  return new RegExp(`\\b${flexible}\\b`).test(pageText.replace(/ /g, ' '));
}

function collectRecords(policy, grid, projects) {
  const recs = [];

  for (const r of policy?.records || []) {
    recs.push({
      file: 'policy.json', id: r.id, label: r.title,
      url: r.source, tier: r.sourceTier,
      claims: numericTokens([r.title, r.summary, ...(r.keyPoints || [])].join(' ')),
    });
  }

  // Grid figures are split by how well evidenced they are; check each block
  // against its own citation so a drift in either is visible separately.
  for (const block of ['verified', 'reported', 'fromRegulation']) {
    const b = grid?.[block];
    if (!b?.source) continue;
    recs.push({
      file: `grid.json (${block})`, id: `grid-${block}`,
      label: `Grid figures — ${block}`,
      url: b.source, tier: b.sourceTier,
      claims: Object.entries(b)
        .filter(([k, val]) => typeof val === 'number' && val >= 100 && !k.startsWith('_'))
        .map(([, val]) => String(val)),
    });
  }

  // Both buckets are checked: a `reported` record is still expected to be
  // traceable to something, and confirming one is how it earns promotion.
  for (const [bucket, list] of [['confirmed', projects?.confirmed], ['reported', projects?.reported]]) {
    for (const p of list || []) {
      recs.push({
        file: `projects.json (${bucket})`, id: p.id, label: p.name,
        url: p.source, tier: p.sourceTier, status: p.verificationStatus,
        claims: numericTokens([p.name, p.summary, p.capacityMW].join(' ')),
      });
    }
  }

  return recs;
}

async function main() {
  const [policy, grid, projects] = await Promise.all([
    readFile(join(DATA, 'policy.json'), 'utf8').then(JSON.parse).catch(() => null),
    readFile(join(DATA, 'grid.json'), 'utf8').then(JSON.parse).catch(() => null),
    readFile(join(DATA, 'projects.json'), 'utf8').then(JSON.parse).catch(() => null),
  ]);

  const records = collectRecords(policy, grid, projects);
  const results = [];

  for (const rec of records) {
    const row = { ...rec, reachable: false, http: null, found: [], missing: [], note: '' };
    try {
      const html = await fetchText(rec.url, { timeoutMs: 25000 });
      const text = mainText(html);
      row.reachable = true;
      row.http = 200;
      if (text.length < 200) {
        row.note = 'page returned almost no readable text (JS-rendered or blocked)';
      }
      for (const c of rec.claims) {
        (pageHasNumber(text, c) ? row.found : row.missing).push(c);
      }
    } catch (err) {
      row.note = err.message;
    }
    results.push(row);
  }

  if (asJson) {
    console.log(JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2));
    return;
  }

  const dead = results.filter(r => !r.reachable);
  const suspect = results.filter(r => r.reachable && r.claims.length && !r.found.length);

  console.log(`Checked ${results.length} records against their cited sources.\n`);
  for (const r of results) {
    const mark = !r.reachable ? 'UNREACHABLE'
      : (r.claims.length && !r.found.length) ? 'NO FIGURES FOUND'
      : 'ok';
    console.log(`[${mark}] ${r.file} · ${r.label}`);
    console.log(`         ${r.url}`);
    if (r.status) console.log(`         recorded status: ${r.status}`);
    if (r.found.length)   console.log(`         figures present on page: ${r.found.join(', ')}`);
    if (r.missing.length) console.log(`         figures NOT on page:     ${r.missing.join(', ')}`);
    if (r.note) console.log(`         note: ${r.note}`);
    console.log();
  }

  console.log('---');
  console.log(`${results.length - dead.length}/${results.length} sources reachable.`);
  if (dead.length) {
    console.log(`\n${dead.length} unreachable — fix or replace these links:`);
    for (const r of dead) console.log(`  - ${r.label}: ${r.note}`);
  }
  if (suspect.length) {
    console.log(`\n${suspect.length} record(s) whose figures do not appear on the cited page.`);
    console.log('This does not mean they are wrong — the page may be JS-rendered, paginated,');
    console.log('or the figure may live in a linked PDF. It means: read these by hand before');
    console.log('relying on them, and correct or remove anything that does not hold.');
    for (const r of suspect) console.log(`  - ${r.file} · ${r.label}`);
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import('node:fs');
    const L = ['### Seed verification', ''];
    L.push(`- ${results.length - dead.length}/${results.length} cited sources reachable`);
    if (dead.length) {
      L.push('', '**Unreachable:**');
      for (const r of dead) L.push(`- ${r.label} — ${r.note}`);
    }
    if (suspect.length) {
      L.push('', '**Figures not found on the cited page** (read by hand):');
      for (const r of suspect) L.push(`- ${r.file} · ${r.label}`);
    }
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, L.join('\n') + '\n');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
