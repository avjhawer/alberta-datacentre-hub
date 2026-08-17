#!/usr/bin/env node
/* Offline tests for the ingestion library. Run: node test/test-lib.mjs */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseFeed, stripTags, decodeEntities, normalizeUrl, cleanUrl,
  titleKey, hostOf, findFeedLink, extractLinks, mainText,
} from '../scripts/lib/feed.mjs';
import { classifyRegion, classifyStream, score, isBreaking } from '../scripts/lib/classify.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0;
const t = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
};

console.log('feed parsing');

t('parses RSS items', async () => {});
const rss = await readFile(join(ROOT, 'test/fixtures/gn-dc-alberta.xml'), 'utf8');
const atom = await readFile(join(ROOT, 'test/fixtures/gn-sovereign-ai.xml'), 'utf8');

t('RSS yields 5 items', () => assert.equal(parseFeed(rss).length, 5));
t('Atom yields 2 items', () => assert.equal(parseFeed(atom).length, 2));
t('extracts outlet from <source>', () =>
  assert.equal(parseFeed(rss)[0].outlet, 'CBC News'));
t('Atom link href is used', () =>
  assert.match(parseFeed(atom)[0].url, /^https:\/\/ised-isde\.canada\.ca/));
t('CDATA and tags stripped from description', () =>
  assert.equal(parseFeed(rss)[0].summary, 'The regulation is now in force, setting a 75 MW threshold.'));
t('undated item yields null published', () =>
  assert.equal(parseFeed(rss)[4].published, null));
t('malformed input returns [] not a throw', () => {
  assert.deepEqual(parseFeed('<html><body>not a feed</body></html>'), []);
  assert.deepEqual(parseFeed(''), []);
  assert.deepEqual(parseFeed(null), []);
});

console.log('\ntext helpers');
t('decodes entities', () =>
  assert.equal(decodeEntities('AT&amp;T &#8212; &quot;x&quot;'), 'AT&T — "x"'));
t('strips script and style', () =>
  assert.equal(stripTags('<p>a</p><script>bad()</script><style>x{}</style><p>b</p>'), 'a b'));

console.log('\nurl handling');
t('cleanUrl strips tracking but preserves case', () =>
  assert.equal(cleanUrl('https://Ex.ca/Path?utm_source=x&id=7'), 'https://ex.ca/Path?id=7'));
t('cleanUrl keeps meaningful params', () =>
  assert.equal(cleanUrl('https://a.ca/x?page=2'), 'https://a.ca/x?page=2'));
t('normalizeUrl folds case and trailing slash for dedupe', () =>
  assert.equal(normalizeUrl('https://A.ca/Path/'), normalizeUrl('https://a.ca/path')));
t('hostOf drops www', () => assert.equal(hostOf('https://www.aeso.ca/x'), 'aeso.ca'));
t('titleKey matches syndicated variants', () =>
  assert.equal(
    titleKey('Alberta files the Data Centre Regulation; rules in force'),
    titleKey('Alberta Files Data Centre Regulation — Rules In Force')));

console.log('\nhtml discovery');
const html = `<html><head>
  <link rel="alternate" type="application/rss+xml" href="/news/feed.xml">
  </head><body><nav><a href="/skip">nav</a></nav>
  <a href="/datacentres/water.html">Water</a>
  <a href="https://other.example/x">External</a>
  <p>Real body text about data centres and the grid, long enough to matter.</p>
  <footer><a href="/foot">foot</a></footer></body></html>`;
t('finds advertised RSS feed', () =>
  assert.equal(findFeedLink(html, 'https://www.alberta.ca/datacentres/index.html'),
    'https://www.alberta.ca/news/feed.xml'));
t('extracts absolute links', () =>
  assert.ok(extractLinks(html, 'https://www.alberta.ca/datacentres/index.html')
    .includes('https://www.alberta.ca/datacentres/water.html')));
t('mainText drops nav and footer', () => {
  const txt = mainText(html);
  assert.ok(txt.includes('Real body text'));
  assert.ok(!txt.includes('nav'));
  assert.ok(!txt.includes('foot'));
});

console.log('\nclassification');
t('detects Alberta from municipality name', () =>
  assert.equal(classifyRegion({ title: 'Parkland County approves plan', summary: '' }), 'alberta'));
t('detects Canada', () =>
  assert.equal(classifyRegion({ title: 'ISED opens federal call', summary: '' }), 'canada'));
t('falls back to the feed region', () =>
  assert.equal(classifyRegion({ title: 'Generic industry note', summary: '' }, 'global'), 'global'));
t('regulation beats generic news', () =>
  assert.equal(classifyStream({ title: 'Bylaw amendment filed and in force', summary: '' }), 'regulation'));
t('municipal detected', () =>
  assert.equal(classifyStream({ title: 'Council public hearing on zoning', summary: '' }), 'municipal'));
t('technology detected', () =>
  assert.equal(classifyStream({ title: 'Liquid cooling and rack density rise', summary: '' }), 'technology'));

console.log('\nscoring');
const nowIso = new Date().toISOString();
const oldIso = new Date(Date.now() - 30 * 864e5).toISOString();
t('recent + decisive + primary scores high and is breaking', () => {
  const it = { title: 'Regulation in force; approval granted', summary: '',
               published: nowIso, region: 'alberta' };
  const s = score(it, { tier: 'primary' });
  assert.ok(s >= 12, `expected >=12, got ${s}`);
  assert.equal(isBreaking(it, s), true);
});
t('month-old item is never breaking', () => {
  const it = { title: 'Regulation in force; approval granted', summary: '',
               published: oldIso, region: 'alberta' };
  assert.equal(isBreaking(it, score(it, { tier: 'primary' })), false);
});
t('undated item is never breaking', () => {
  const it = { title: 'Approval granted', summary: '', published: null, region: 'alberta' };
  assert.equal(isBreaking(it, score(it, {})), false);
});
t('future-dated item scores 0', () => {
  const it = { title: 'Approved', summary: '',
               published: new Date(Date.now() + 864e5).toISOString(), region: 'alberta' };
  assert.equal(score(it, {}), 0);
});

console.log('\nchild-page crawl (auto-discovery of new government pages)');
const { isChildOf } = await import('../scripts/discover-sources.mjs');
const HUB = 'https://www.alberta.ca/datacentres/index.html';

t('finds a new sibling page under the hub', () =>
  assert.equal(isChildOf(HUB, 'https://www.alberta.ca/datacentres/water.html'), true));
t('rejects a different host', () =>
  assert.equal(isChildOf(HUB, 'https://www.aeso.ca/datacentres/water.html'), false));
t('rejects an unrelated section of the same site', () =>
  assert.equal(isChildOf(HUB, 'https://www.alberta.ca/health/clinics.html'), false));
t('rejects going more than one level deeper', () =>
  assert.equal(isChildOf(HUB, 'https://www.alberta.ca/datacentres/a/b/c.html'), false));
t('rejects binary assets', () =>
  assert.equal(isChildOf(HUB, 'https://www.alberta.ca/datacentres/report.pdf'), false));
t('directory-style parent works too', () =>
  assert.equal(
    isChildOf('https://www.aeso.ca/grid/connecting-to-the-grid/large-load-projects/',
              'https://www.aeso.ca/grid/connecting-to-the-grid/large-load-projects/queue'), true));
t('rejects the parent itself', () =>
  assert.equal(isChildOf(HUB, HUB), false));

console.log(`\n${pass} assertions passed`);
