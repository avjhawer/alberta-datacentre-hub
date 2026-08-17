#!/usr/bin/env node
/* ============================================================================
   Find sources that do not exist yet.

   A fixed source list goes stale the moment a government body stands up a new
   site. Three layers, ordered by how much trust each one requires:

     a) child-page crawl of ALREADY-TRUSTED domains  -> auto-added
     b) RSS autodiscovery on watched pages           -> auto-upgraded
     c) authority-domain harvesting from the news    -> auto-promote after N
        sightings for government TLDs; everything else waits for approval

   Deliberate limit: arbitrary domains are never ingested sight-unseen. This
   site backs permit reviews, so an unvetted blog getting in silently is a real
   harm, not a tidiness problem.

     node scripts/discover-sources.mjs
     node scripts/discover-sources.mjs --dry
   ========================================================================= */

import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchText, extractLinks, findFeedLink, hostOf } from './lib/feed.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'site', 'data');
const dry = process.argv.includes('--dry');

const MAX_NEW_PER_PARENT = 12;

export function slug(url) {
  return hostOf(url).replace(/\./g, '-') + '-' +
    (new URL(url).pathname.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40) || 'root');
}

/** Same-site, one level deeper than the parent, and not already tracked. */
export function isChildOf(parentUrl, candidate) {
  try {
    const p = new URL(parentUrl), c = new URL(candidate);
    if (p.hostname !== c.hostname) return false;
    if (/\.(pdf|jpg|png|gif|zip|docx?|xlsx?|mp4)$/i.test(c.pathname)) return false;

    if (p.pathname.replace(/\/$/, '') === c.pathname.replace(/\/$/, '')) return false;

    const pSeg = p.pathname.replace(/\/$/, '').split('/').filter(Boolean);
    const cSeg = c.pathname.replace(/\/$/, '').split('/').filter(Boolean);

    // Compare against the parent's DIRECTORY. When the parent is a file
    // (…/datacentres/index.html) its newly published siblings sit at the same
    // depth, not deeper — that is the case we most need to catch.
    const base = /\.\w+$/.test(p.pathname) ? pSeg.slice(0, -1) : pSeg;

    if (cSeg.length <= base.length) return false;      // must be inside it
    if (cSeg.length > base.length + 1) return false;   // one level only
    return base.every((s, i) => cSeg[i] === s);
  } catch { return false; }
}

async function main() {
  const sources = JSON.parse(await readFile(join(DATA, 'sources.json'), 'utf8'));
  const cfg = sources.discovery || {};
  const patterns = (cfg.authorityPatterns || []).map(p => new RegExp(p, 'i'));

  const known = new Set([
    ...(sources.watch || []).map(w => w.url.replace(/\/$/, '')),
    ...(sources.feeds || []).map(f => f.url),
  ]);

  let added = 0, upgraded = 0;
  const log = [];

  /* --- (a) crawl trusted parents ------------------------------------- */
  for (const w of (sources.watch || []).filter(x => x.crawl)) {
    try {
      const html = await fetchText(w.url, { timeoutMs: 25000 });
      const links = extractLinks(html, w.url)
        .filter(l => isChildOf(w.url, l))
        .filter(l => !known.has(l.replace(/\/$/, '')))
        .slice(0, MAX_NEW_PER_PARENT);

      for (const l of links) {
        sources.watch.push({
          id: slug(l),
          name: `${w.name} — ${new URL(l).pathname.split('/').filter(Boolean).pop()}`,
          tier: w.tier || 'primary',
          url: l,
          discoveredFrom: w.id,
          discoveredAt: new Date().toISOString(),
        });
        known.add(l.replace(/\/$/, ''));
        added++;
        log.push(`  + watch  ${l}  (child of ${w.id})`);
      }

      /* --- (b) RSS autodiscovery on the same fetch --------------------- */
      const feedUrl = findFeedLink(html, w.url);
      if (feedUrl && !known.has(feedUrl)) {
        sources.feeds.push({
          id: `auto-${slug(w.url)}`,
          name: `${w.name} (feed)`,
          tier: w.tier || 'primary',
          region: w.region || 'alberta',
          url: feedUrl,
          discoveredFrom: w.id,
          discoveredAt: new Date().toISOString(),
        });
        known.add(feedUrl);
        upgraded++;
        log.push(`  + feed   ${feedUrl}  (autodiscovered on ${w.id})`);
      }
    } catch (err) {
      log.push(`  ! skip   ${w.id} — ${err.message}`);
    }
  }

  /* --- (c) harvest authority domains from the news stream ------------- */
  let cands = { generatedAt: null, candidates: [] };
  try {
    cands = JSON.parse(await readFile(join(DATA, 'candidate-sources.json'), 'utf8'));
    if (!Array.isArray(cands.candidates)) cands.candidates = [];
  } catch { /* first run */ }

  let news = { items: [] };
  try { news = JSON.parse(await readFile(join(DATA, 'news.json'), 'utf8')); } catch { /* none yet */ }

  const trackedHosts = new Set([...known].map(hostOf).filter(Boolean));
  const byHost = new Map(cands.candidates.map(c => [c.host, c]));
  const now = new Date().toISOString();

  for (const item of news.items || []) {
    const host = hostOf(item.url);
    if (!host || trackedHosts.has(host)) continue;
    const isAuthority = patterns.some(re => re.test(host));
    const rec = byHost.get(host) || {
      host, firstSeen: now, sightings: 0, isAuthority, examples: [], promoted: false,
    };
    rec.sightings++;
    rec.lastSeen = now;
    rec.isAuthority = isAuthority;
    if (rec.examples.length < 3 && !rec.examples.includes(item.url)) rec.examples.push(item.url);
    byHost.set(host, rec);
  }

  // Drop stale candidates outside the window.
  const windowMs = (cfg.windowDays || 30) * 864e5;
  const kept = [...byHost.values()].filter(c =>
    Date.now() - Date.parse(c.lastSeen || c.firstSeen) < windowMs);

  // Auto-promote government/regulator domains past the threshold.
  const threshold = cfg.autoPromoteAfter || 3;
  for (const c of kept) {
    if (c.promoted || !c.isAuthority || c.sightings < threshold) continue;
    const url = c.examples[0];
    if (!url) continue;
    sources.watch.push({
      id: slug(url),
      name: `${c.host} (auto-promoted)`,
      tier: 'primary',
      url: new URL(url).origin + new URL(url).pathname,
      discoveredFrom: 'news-harvest',
      discoveredAt: now,
    });
    c.promoted = true;
    added++;
    log.push(`  + watch  ${c.host}  (auto-promoted after ${c.sightings} sightings)`);
  }

  const pending = kept.filter(c => !c.promoted);

  console.log('Source discovery');
  console.log(log.length ? log.join('\n') : '  (no new sources)');
  console.log(`\n${added} watch page(s) added · ${upgraded} feed(s) autodiscovered · ` +
              `${pending.length} candidate(s) pending review.`);

  if (!dry) {
    cands.generatedAt = now;
    cands.candidates = kept;
    await writeFile(join(DATA, 'candidate-sources.json'), JSON.stringify(cands, null, 2) + '\n');
    await writeFile(join(DATA, 'sources.json'), JSON.stringify(sources, null, 2) + '\n');
  } else {
    console.log('--dry: no files written');
  }

  if (process.env.GITHUB_OUTPUT) {
    const { appendFileSync } = await import('node:fs');
    const nonAuthority = pending.filter(c => !c.isAuthority && c.sightings >= 2);
    if (nonAuthority.length) {
      const body = nonAuthority
        .map(c => `- \`${c.host}\` — seen ${c.sightings}× · e.g. ${c.examples[0]}`)
        .join('\n');
      appendFileSync(process.env.GITHUB_OUTPUT, `candidates=true\n`);
      appendFileSync(process.env.GITHUB_OUTPUT, `candidate_body<<EOF\n${body}\nEOF\n`);
    }
  }
}

// Only run when invoked directly, so tests can import the helpers above.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  main().catch(err => { console.error(err); process.exit(1); });
}
