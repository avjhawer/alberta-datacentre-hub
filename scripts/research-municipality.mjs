#!/usr/bin/env node
/* ============================================================================
   Pull evidence about how a municipality treats data centres.

   Fetches a municipality's bylaw and planning pages and prints every passage
   that mentions data centres, along with the use-class language around it.
   It does NOT decide the answer — it gives you the quotes so a human can fill
   the matrix row from a real source instead of from memory.

   Must run where the network reaches Alberta municipal sites; the authoring
   sandbox cannot, which is why this exists as a workflow.

     node scripts/research-municipality.mjs                  # all targets
     node scripts/research-municipality.mjs edmonton calgary # named targets
   ========================================================================= */

import { fetchText, mainText } from './lib/feed.mjs';

/* Candidate pages per municipality. Bylaw pages move; the crawl of a landing
   page usually finds the current one, so several routes are tried. */
const TARGETS = {
  edmonton: {
    name: 'City of Edmonton',
    pages: [
      'https://www.edmonton.ca/city_government/bylaws/zoning-bylaw',
      'https://zoningbylaw.edmonton.ca/',
      'https://www.edmonton.ca/business_economy/business-licences-permits',
      'https://webdocs.edmonton.ca/zoningbylaw/ZoningBylaw/Part1/Special_Land/',
    ],
  },
  calgary: {
    name: 'City of Calgary',
    pages: [
      'https://www.calgary.ca/planning/land-use.html',
      'https://www.calgary.ca/planning/land-use/bylaw-1p2007.html',
      'https://publicaccess.calgary.ca/lldm01/livelink.exe?func=ccpa.general&msgID=land-use-bylaw',
      'https://www.calgary.ca/development/data-centres.html',
    ],
  },
  parkland: {
    name: 'Parkland County',
    pages: ['https://www.parklandcounty.com/business-development/planning-and-development/land-use-bylaw/'],
  },
  rockyview: {
    name: 'Rocky View County',
    pages: ['https://www.rockyview.ca/build-plan-and-develop/planning/land-use-bylaw'],
  },
  sturgeon: {
    name: 'Sturgeon County',
    pages: ['https://www.sturgeoncounty.ca/building-development/data-centre-development/'],
  },
  greenview: {
    name: 'MD of Greenview No. 16',
    pages: ['https://mdgreenview.ab.ca/departments/planning-and-development/development-permits/'],
  },
};

const DC = /(data\s*centre|data\s*center|data\s*processing|server\s*farm|computing\s*facility)/i;
const USE_CLASS = /(permitted use|discretionary use|permitted and discretionary|prohibited)/i;
const DISTRICT = /\b([A-Z]{1,3}[-–]?\d{0,3}[A-Za-z]?)\s+(district|zone|zoning)\b/;

/** Split into sentences without dragging in a dependency. */
function sentences(text) {
  return text.replace(/\s+/g, ' ').split(/(?<=[.;:])\s+(?=[A-Z(])/);
}

function excerptsFor(text, re, limit = 12) {
  const out = [];
  for (const s of sentences(text)) {
    if (re.test(s) && s.length > 25 && s.length < 600) {
      out.push(s.trim());
      if (out.length >= limit) break;
    }
  }
  return out;
}

async function research(key) {
  const t = TARGETS[key];
  if (!t) { console.log(`unknown target: ${key}`); return; }

  console.log(`\n${'='.repeat(74)}\n${t.name}\n${'='.repeat(74)}`);

  for (const url of t.pages) {
    console.log(`\n--- ${url}`);
    let text;
    try {
      const html = await fetchText(url, { timeoutMs: 30000 });
      text = mainText(html);
    } catch (e) {
      console.log(`    UNREACHABLE: ${e.message}`);
      continue;
    }
    console.log(`    fetched, ${text.length} chars of readable text`);

    const dc = excerptsFor(text, DC);
    if (!dc.length) {
      console.log('    no data-centre mention on this page');
    } else {
      console.log(`    ${dc.length} data-centre passage(s):`);
      for (const s of dc) console.log(`      • ${s}`);
    }

    const uses = excerptsFor(text, new RegExp(`${DC.source}.*${USE_CLASS.source}|${USE_CLASS.source}.*${DC.source}`, 'i'), 6);
    if (uses.length) {
      console.log('    use-class language in the same sentence:');
      for (const s of uses) console.log(`      » ${s}`);
    }

    const d = text.match(DISTRICT);
    if (d) console.log(`    a district reference on the page: ${d[0]}`);
  }
}

const args = process.argv.slice(2).filter(a => !a.startsWith('-'));
const keys = args.length ? args : Object.keys(TARGETS);
for (const k of keys) await research(k);

console.log(`\n${'='.repeat(74)}`);
console.log('Read the passages above and fill the matrix by hand.');
console.log('If a municipality does not name data centres at all, that is itself');
console.log('the finding — record it as "not named in the bylaw", not as a guess.');
