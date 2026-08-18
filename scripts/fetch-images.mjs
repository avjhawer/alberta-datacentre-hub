#!/usr/bin/env node
/* ============================================================================
   Fetch openly-licensed photographs from Wikimedia Commons.

   Runs in Actions, because the authoring sandbox cannot reach Wikimedia. For
   each search term it takes the best free-licensed match, downloads a
   web-sized copy into site/assets/img/, and records the attribution that the
   licence requires into site/data/images.json.

   Nothing here decides what ships. A filename is not evidence of content, so
   every downloaded image is reviewed by eye before it is used on a page.

     node scripts/fetch-images.mjs
   ========================================================================= */

import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IMG_DIR = join(ROOT, 'site', 'assets', 'img');
const DATA = join(ROOT, 'site', 'data', 'images.json');

const UA = 'AlbertaDataCentreHub/1.0 (https://github.com/avjhawer/alberta-datacentre-hub)';

/* What each slot is FOR, so the review step can judge whether a hit fits. */
const SLOTS = [
  { id: 'grid',        want: 'High-voltage transmission towers or lines on open prairie',
    terms: ['Alberta transmission line', 'electricity pylon prairie Canada', 'transmission tower Alberta'] },
  { id: 'substation',  want: 'An electrical substation, ideally Canadian',
    terms: ['electrical substation Alberta', 'electrical substation Canada', 'transformer substation'] },
  { id: 'datacentre',  want: 'A data centre exterior or server hall',
    terms: ['data center building exterior', 'data centre server room', 'server room rack'] },
  { id: 'cooling',     want: 'Industrial cooling plant, chillers or cooling towers',
    terms: ['industrial cooling tower', 'chiller plant rooftop', 'HVAC cooling equipment industrial'] },
  { id: 'landscape',   want: 'Alberta rural or agricultural land, the setting these sites occupy',
    terms: ['Alberta prairie farmland', 'Alberta agricultural landscape', 'rural Alberta countryside'] },
  { id: 'generation',  want: 'Power generation in Alberta — gas plant, wind or solar',
    terms: ['Alberta wind farm', 'natural gas power plant Alberta', 'power station Alberta'] },
];

const FREE = /(^|\b)(cc0|cc[- ]by([- ]sa)?([- ]\d(\.\d)?)?|public domain|pd[- ]|no restrictions)/i;

async function api(params) {
  const url = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams(params);
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Commons API ${res.status}`);
  return res.json();
}

function meta(info, key) {
  const v = info?.extmetadata?.[key]?.value;
  return v ? String(v).replace(/<[^>]*>/g, '').trim() : '';
}

async function search(term) {
  const d = await api({
    action: 'query', format: 'json', generator: 'search',
    gsrsearch: `filetype:bitmap ${term}`, gsrnamespace: '6', gsrlimit: '8',
    prop: 'imageinfo', iiprop: 'url|extmetadata|size|mime', iiurlwidth: '1600',
  });
  const pages = Object.values(d?.query?.pages || {});
  const out = [];
  for (const p of pages) {
    const info = p.imageinfo?.[0];
    if (!info || !/^image\/(jpeg|png)$/.test(info.mime || '')) continue;
    if (info.width < 900) continue;                       // too small to use large
    const licence = meta(info, 'LicenseShortName') || meta(info, 'License');
    if (!FREE.test(licence)) continue;                    // free licences only
    out.push({
      title: p.title.replace(/^File:/, ''),
      licence,
      licenceUrl: meta(info, 'LicenseUrl'),
      author: meta(info, 'Artist') || 'Unknown',
      credit: meta(info, 'Credit'),
      description: meta(info, 'ImageDescription').slice(0, 300),
      descriptionUrl: info.descriptionurl,
      downloadUrl: info.thumburl || info.url,
      width: info.thumbwidth || info.width,
      height: info.thumbheight || info.height,
    });
  }
  return out;
}

async function download(url, dest) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  return buf.length;
}

async function main() {
  await mkdir(IMG_DIR, { recursive: true });
  const record = { _comment: 'Downloaded by scripts/fetch-images.mjs. Every entry must keep its author, licence and source page — that is the condition of use. Reviewed by eye before appearing on any page.', fetchedAt: new Date().toISOString(), images: [] };

  for (const slot of SLOTS) {
    console.log(`\n=== ${slot.id} — ${slot.want}`);
    let picked = null;
    for (const term of slot.terms) {
      let hits = [];
      try { hits = await search(term); }
      catch (e) { console.log(`  "${term}" failed: ${e.message}`); continue; }
      console.log(`  "${term}" → ${hits.length} free-licensed candidate(s)`);
      // Take up to 3 per slot so there is a real choice at review time.
      for (const h of hits.slice(0, 3)) {
        const n = record.images.filter(i => i.slot === slot.id).length;
        if (n >= 3) break;
        const ext = /\.png$/i.test(h.title) ? 'png' : 'jpg';
        const file = `${slot.id}-${n + 1}.${ext}`;
        try {
          const bytes = await download(h.downloadUrl, join(IMG_DIR, file));
          console.log(`    saved ${file}  (${(bytes / 1024).toFixed(0)} KB)  ${h.licence}`);
          record.images.push({ slot: slot.id, want: slot.want, file, ...h, bytes });
        } catch (e) { console.log(`    download failed: ${e.message}`); }
      }
      if (record.images.filter(i => i.slot === slot.id).length >= 3) break;
    }
    if (!record.images.some(i => i.slot === slot.id)) console.log('  NOTHING FOUND');
  }

  await writeFile(DATA, JSON.stringify(record, null, 2) + '\n');
  console.log(`\n${record.images.length} candidate image(s) downloaded.`);
  console.log('Review each one by eye before using it. Attribution is in site/data/images.json.');
}

main().catch(e => { console.error(e); process.exit(1); });
