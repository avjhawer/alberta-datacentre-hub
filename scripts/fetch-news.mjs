#!/usr/bin/env node
/* ============================================================================
   Ingest configured feeds -> site/data/news.json
   Runs in GitHub Actions every 3 hours. Each feed is fetched independently so
   one dead source degrades that source only, and its failure is recorded in
   sourceHealth rather than disappearing.

     node scripts/fetch-news.mjs
     node scripts/fetch-news.mjs --fixture test/fixtures   (offline test mode)
   ========================================================================= */

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchText, parseFeed, normalizeUrl, cleanUrl, titleKey, hostOf } from './lib/feed.mjs';
import { classifyRegion, classifyStream, score, isBreaking } from './lib/classify.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'site', 'data');
const MAX_ITEMS = 400;
const CONCURRENCY = 6;

const args = process.argv.slice(2);
const fixtureDir = args.includes('--fixture') ? args[args.indexOf('--fixture') + 1] : null;

/** Run tasks with a small concurrency cap — politeness, not performance. */
async function pool(items, limit, fn) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }));
  return out;
}

async function loadFixtures(dir) {
  const abs = join(ROOT, dir);
  const files = await readdir(abs);
  return Object.fromEntries(await Promise.all(
    files.filter(f => f.endsWith('.xml'))
      .map(async f => [f.replace(/\.xml$/, ''), await readFile(join(abs, f), 'utf8')])
  ));
}

async function main() {
  const sources = JSON.parse(await readFile(join(DATA, 'sources.json'), 'utf8'));
  const feeds = sources.feeds || [];
  const fixtures = fixtureDir ? await loadFixtures(fixtureDir) : null;

  console.log(`Fetching ${feeds.length} feed(s)${fixtures ? ' from fixtures' : ''}…`);

  const results = await pool(feeds, CONCURRENCY, async (feed) => {
    const t0 = Date.now();
    try {
      const xml = fixtures
        ? (fixtures[feed.id] ?? (() => { throw new Error('no fixture'); })())
        : await fetchText(feed.url);
      const parsed = parseFeed(xml);
      if (!parsed.length) throw new Error('parsed 0 items');
      console.log(`  ok   ${feed.id} — ${parsed.length} items (${Date.now() - t0}ms)`);
      return { feed, parsed, ok: true };
    } catch (err) {
      console.log(`  FAIL ${feed.id} — ${err.message}`);
      return { feed, parsed: [], ok: false, error: err.message };
    }
  });

  /* --- normalise, classify, score ------------------------------------- */
  const seenUrl = new Set();
  const seenTitle = new Set();
  const items = [];

  for (const { feed, parsed } of results) {
    for (const raw of parsed) {
      const nurl = normalizeUrl(raw.url);
      const tkey = titleKey(raw.title);
      if (seenUrl.has(nurl) || (tkey.length > 12 && seenTitle.has(tkey))) continue;
      seenUrl.add(nurl);
      if (tkey.length > 12) seenTitle.add(tkey);

      const item = {
        title: raw.title,
        url: cleanUrl(raw.url),
        source: raw.outlet || hostOf(raw.url) || feed.name,
        published: raw.published,
        summary: raw.summary || '',
        tier: feed.tier || 'reported',
        feedId: feed.id,
      };
      item.region = classifyRegion(item, feed.region);
      item.stream = classifyStream(item);
      const s = score(item, { tier: item.tier });
      item.score = s;
      item.breaking = isBreaking(item, s);
      items.push(item);
    }
  }

  // Newest first; breaking band is selected by score inside the site.
  items.sort((a, b) => {
    const ta = a.published ? Date.parse(a.published) : 0;
    const tb = b.published ? Date.parse(b.published) : 0;
    return tb - ta;
  });

  const kept = items.slice(0, MAX_ITEMS);

  // Cap the breaking band at 5, chosen by score among recent items.
  const breakingIds = new Set(
    kept.filter(i => i.breaking)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(i => i.url)
  );
  for (const i of kept) i.breaking = breakingIds.has(i.url);

  const out = {
    generatedAt: new Date().toISOString(),
    itemCount: kept.length,
    sourceHealth: results.map(r => ({
      id: r.feed.id,
      name: r.feed.name,
      ok: r.ok,
      count: r.parsed.length,
      error: r.error || '',
    })),
    streamCounts: kept.reduce((m, i) => (m[i.stream] = (m[i.stream] || 0) + 1, m), {}),
    regionCounts: kept.reduce((m, i) => (m[i.region] = (m[i.region] || 0) + 1, m), {}),
    items: kept,
  };

  await writeFile(join(DATA, 'news.json'), JSON.stringify(out, null, 2) + '\n');

  const okCount = results.filter(r => r.ok).length;
  console.log(`\nWrote ${kept.length} items from ${okCount}/${feeds.length} healthy feeds.`);
  console.log('  streams:', JSON.stringify(out.streamCounts));
  console.log('  regions:', JSON.stringify(out.regionCounts));
  console.log('  breaking:', kept.filter(i => i.breaking).length);

  // A total wipeout means something systemic — fail loudly so the run is red.
  if (okCount === 0 && feeds.length > 0) {
    console.error('\nAll feeds failed. Not treating this as success.');
    process.exit(1);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
