#!/usr/bin/env node
/* ============================================================================
   Find the live home of a citation whose link has rotted.

   The approvals map cites an authority page for every step. Six of those
   returned 404 on the last verification run. Guessing a replacement from
   memory is exactly what this repository forbids, so this probes a list of
   candidate URLs from a runner that can actually reach them and reports, for
   each one, the HTTP status, the page title, and whether the wording that
   would make it the right document appears in the text.

   It decides nothing. It produces the evidence a human uses to decide.

   Must run in Actions — the authoring sandbox cannot reach alberta.ca,
   auc.ab.ca, aeso.ca or aer.ca.

     node scripts/probe-links.mjs
   ========================================================================= */

import { fetchText, mainText } from './lib/feed.mjs';

/* Each entry: what the citation is for, the candidates to try, and the wording
   that has to be on the page for it to be the right one. */
const TARGETS = [
  {
    id: 'mga',
    forWhat: 'Municipal Government Act — the five municipal cards',
    must: ['municipal government act'],
    candidates: [
      'https://www.alberta.ca/municipal-government-act',
      'https://www.alberta.ca/municipal-government-act.aspx',
      'https://www.alberta.ca/municipal-government-act-overview',
      'https://www.alberta.ca/municipal-government-act-review',
      'https://kings-printer.alberta.ca/documents/Acts/m26.pdf',
      'https://open.alberta.ca/publications/m26',
    ],
  },
  {
    id: 'safety-codes',
    forWhat: 'Safety Codes Act — building permit, inspections, occupancy',
    must: ['safety codes'],
    candidates: [
      'https://www.alberta.ca/safety-codes-act',
      'https://www.alberta.ca/safety-codes-act.aspx',
      'https://www.alberta.ca/building-safety-codes',
      'https://www.alberta.ca/permits-licences-and-safety-codes',
      'https://kings-printer.alberta.ca/documents/Acts/s01.pdf',
      'https://open.alberta.ca/publications/s01',
    ],
  },
  {
    id: 'water-act',
    forWhat: 'Water Act licence or approval',
    must: ['water act'],
    candidates: [
      'https://www.alberta.ca/water-act',
      'https://www.alberta.ca/water-act.aspx',
      'https://www.alberta.ca/water-licences-and-approvals',
      'https://www.alberta.ca/water-approvals-and-licences',
      'https://www.alberta.ca/water-use-reporting',
      'https://kings-printer.alberta.ca/documents/Acts/w03.pdf',
      'https://open.alberta.ca/publications/w03',
    ],
  },
  {
    id: 'auc-rule-007',
    forWhat: 'AUC Rule 007 — participant involvement, facility and power plant applications, industrial system designation',
    must: ['rule 007'],
    candidates: [
      'https://www.auc.ab.ca/rule-007/',
      'https://www.auc.ab.ca/rules/',
      'https://www.auc.ab.ca/regulatory-documents/rules/',
      'https://media.auc.ab.ca/prd-wp-uploads/Rules/Rule007.pdf',
      'https://www.auc.ab.ca/rule/rule-007/',
    ],
  },
  {
    id: 'auc-rule-012',
    forWhat: 'AUC Rule 012 — noise control',
    must: ['rule 012', 'noise'],
    candidates: [
      'https://www.auc.ab.ca/rule-012/',
      'https://www.auc.ab.ca/rules/',
      'https://media.auc.ab.ca/prd-wp-uploads/Rules/Rule012.pdf',
      'https://www.auc.ab.ca/rule/rule-012/',
    ],
  },
  {
    id: 'indigenous-consultation',
    forWhat: 'PROPOSED CARD — Indigenous consultation on provincial decisions',
    must: ['consultation'],
    candidates: [
      'https://www.alberta.ca/indigenous-consultation-office',
      'https://www.alberta.ca/aboriginal-consultation-office',
      'https://www.alberta.ca/indigenous-relations',
      'https://www.alberta.ca/first-nations-consultation-guidelines-land-management',
      'https://www.alberta.ca/consultation-first-nations-land-natural-resource-management',
    ],
  },
  {
    id: 'roadside-development',
    forWhat: 'PROPOSED CARD — roadside development permit near a provincial highway',
    must: ['roadside', 'highway'],
    candidates: [
      'https://www.alberta.ca/roadside-development-permits',
      'https://www.alberta.ca/roadside-development',
      'https://www.alberta.ca/highway-development-and-protection-regulation',
      'https://www.alberta.ca/permits-for-development-near-highways',
    ],
  },
  {
    id: 'public-lands',
    forWhat: 'PROPOSED CARD — public land disposition where a project crosses Crown land',
    must: ['public land'],
    candidates: [
      'https://www.alberta.ca/public-lands',
      'https://www.alberta.ca/public-land-dispositions',
      'https://www.alberta.ca/formal-dispositions-public-land',
    ],
  },
  {
    id: 'historical-resources',
    forWhat: 'Historical Resources Act clearance (named inside the clearances card)',
    must: ['historical resources'],
    candidates: [
      'https://www.alberta.ca/historical-resources-act',
      'https://www.alberta.ca/land-use-planning-historic-resources',
      'https://www.alberta.ca/historical-resources-management',
    ],
  },
  {
    id: 'aer-pipeline',
    forWhat: 'AER — pipeline licence for a fuel supply line (currently the AER home page)',
    must: ['pipeline'],
    candidates: [
      'https://www.aer.ca/regulating-development/project-application/application-processes/pipeline-applications',
      'https://www.aer.ca/regulating-development/project-application',
      'https://www.aer.ca/providing-information/by-topic/pipelines',
      'https://www.aer.ca/',
    ],
  },
];

const pad = (s, n) => String(s).padEnd(n);

for (const t of TARGETS) {
  console.log(`\n${'='.repeat(78)}\n${t.id} — ${t.forWhat}\n${'='.repeat(78)}`);
  for (const url of t.candidates) {
    let status = '', title = '', hits = [];
    try {
      const html = await fetchText(url, { timeoutMs: 25000 });
      status = 'OK';
      title = (html.match(/<title[^>]*>([\s\S]{0,160}?)<\/title>/i)?.[1] || '')
        .replace(/\s+/g, ' ').trim();
      const text = mainText(html).toLowerCase();
      hits = t.must.filter(m => text.includes(m.toLowerCase()));
    } catch (e) {
      status = e.message.replace(/\s+/g, ' ').slice(0, 40);
    }
    const verdict = status === 'OK'
      ? (hits.length === t.must.length ? 'USE — resolves and reads right'
         : hits.length ? `partial (found: ${hits.join(', ')})`
         : 'resolves but wording absent')
      : 'dead';
    console.log(`  ${pad(verdict, 32)} ${pad(status, 14)} ${url}`);
    if (title) console.log(`  ${' '.repeat(32)} title: ${title}`);
  }
}

console.log(`\n${'='.repeat(78)}`);
console.log('Nothing here is applied automatically. Read the verdicts, pick the URL');
console.log('that both resolves and reads like the right document, and edit the data.');
