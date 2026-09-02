#!/usr/bin/env node
/* ============================================================================
   Render the approvals map as Mermaid, from the same data the site draws.

   Written rather than hand-authored so the two can never drift: edit
   approvals.json and re-run this, and the interactive diagram, the print sheet
   and the GitHub-rendered flowchart all say the same thing.

   Mermaid has no true swimlanes, so each lane is a subgraph. Nodes are emitted
   in phase order, which gives a left-to-right reading, but Mermaid does its own
   layout — the phase columns are a reading order here, not a grid. The site's
   own diagram is the one with real columns.

     node scripts/build-mermaid.mjs            > docs/approvals-flowcharts.md
   ========================================================================= */

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const spec = JSON.parse(await readFile(join(ROOT, 'site/data/approvals.json'), 'utf8'));

/* Mermaid ids: keep them alphanumeric so no renderer has to guess. */
const mid = id => id.replace(/[^A-Za-z0-9]/g, '_');
/* Labels are quoted, so only a double quote needs handling. */
const lbl = s => String(s).replace(/"/g, "'");

const inRoute = (x, v) => !x.variants || x.variants.includes(v);
const isOptional = (n, v) => n.optional || (n.optionalIn ? n.optionalIn.includes(v) : false);

function badges(n, v) {
  const b = [];
  if (n.startNow) b.push('start now');
  if (isOptional(n, v)) b.push('if required');
  else if (n.optionalIn) b.push('required here');
  if (n.blocksOccupancy) b.push('blocks occupancy');
  return b.length ? ` — ${b.join(', ')}` : '';
}

function chart(v) {
  const nodes = spec.nodes.filter(n => inRoute(n, v));
  const ids = new Set(nodes.map(n => n.id));
  const out = ['flowchart LR'];

  for (const laneRaw of spec.lanes) {
    const lane = Object.assign({}, laneRaw, (laneRaw.byVariant || {})[v] || {});
    const mine = spec.phases.flatMap(p =>
      nodes.filter(n => n.lane === laneRaw.id && n.phase === p.id));
    if (!mine.length) continue;
    out.push(`  subgraph ${mid(laneRaw.id)}["${lbl(lane.label)} · ${lbl(lane.body)}"]`);
    out.push('    direction LR');
    for (const n of mine) {
      const phase = spec.phases.find(p => p.id === n.phase);
      const text = `${lbl(n.title)}<br/><small>${lbl(phase.label)} · ${lbl(n.authority)}${lbl(badges(n, v))}</small>`;
      // A hexagon for the two hard gates, a plain box for everything else.
      out.push(n.emphasis === 'risk' && n.phase === 'p3'
        ? `    ${mid(n.id)}{{"${text}"}}`
        : `    ${mid(n.id)}["${text}"]`);
    }
    out.push('  end');
  }

  out.push('');

  /* Same transitive reduction the site applies: an edge a longer chain already
     implies is not drawn. Kept identical so the two media agree. */
  const deps = new Map(nodes.map(n => [n.id, (n.dependsOn || []).filter(id => ids.has(id))]));
  const ancestorOf = (target, id, seen = new Set()) => {
    if (seen.has(target)) return false;
    seen.add(target);
    return (deps.get(target) || []).some(par => par === id || ancestorOf(par, id, seen));
  };
  const implied = (dep, n) =>
    (deps.get(n.id) || []).some(other => other !== dep && ancestorOf(other, dep));

  const drawnPairs = new Set();
  for (const n of nodes) {
    for (const dep of n.dependsOn || []) {
      if (!ids.has(dep) || implied(dep, n)) continue;
      const crit = n.critical && spec.nodes.find(x => x.id === dep)?.critical;
      out.push(`  ${mid(dep)} ${crit ? '==>' : '-->'} ${mid(n.id)}`);
    }
    // Paired approvals: both required, neither authorising the other, so the
    // link carries no arrowhead and no direction. Pairing is recorded on both
    // sides, so de-duplicate on the pair rather than drawing it twice.
    for (const pid of n.pairedWith || []) {
      if (!ids.has(pid)) continue;
      const key = [n.id, pid].sort().join('~');
      if (drawnPairs.has(key)) continue;
      drawnPairs.add(key);
      out.push(`  ${mid(n.id)} <-.-> |both required| ${mid(pid)}`);
    }
    // A parallel requirement of the same decision: no sequence between them.
    for (const pid of n.parallelTo || []) {
      if (ids.has(pid)) out.push(`  ${mid(pid)} -.- |required alongside| ${mid(n.id)}`);
    }
    // The decommissioning standard was fixed at the agreement, years earlier.
    for (const sid of n.standardSetBy || []) {
      if (ids.has(sid)) out.push(`  ${mid(sid)} -.-> |standard set here| ${mid(n.id)}`);
    }
  }

  out.push('');
  const risky = nodes.filter(n => n.emphasis === 'risk').map(n => mid(n.id));
  out.push('  classDef risk stroke-dasharray:6 4,stroke-width:2px,font-weight:bold;');
  out.push('  classDef gate stroke-width:3px,font-weight:bold;');
  if (risky.length) out.push(`  class ${risky.join(',')} risk;`);
  const end = nodes.filter(n => n.isEnd).map(n => mid(n.id));
  if (end.length) out.push(`  class ${end.join(',')} gate;`);
  return out.join('\n');
}

const L = [];
L.push('# Approvals flowcharts');
L.push('');
L.push('Generated by `scripts/build-mermaid.mjs` from `site/data/approvals.json`.');
L.push('Do not edit this file by hand — edit the data and re-run the script, so the');
L.push('interactive diagram, the print sheet and these charts stay in agreement.');
L.push('');
L.push('> Mermaid has no true swimlanes. Each lane below is a subgraph and each card');
L.push('> names its phase, but the layout is Mermaid\'s own — the phase *columns* only');
L.push('> exist on the site\'s own diagram and its print sheet.');
L.push('');
L.push('## Phases');
L.push('');
L.push('| Phase | Stage | |');
L.push('|---|---|---|');
for (const p of spec.phases) L.push(`| ${p.label} | ${p.name} | ${p.sub} |`);
L.push('');
L.push('## Notation');
L.push('');
L.push('| Mark | Meaning |');
L.push('|---|---|');
L.push('| `==>` thick arrow | Critical path — delay here moves the finish date |');
L.push('| `-->` arrow | Must finish before |');
L.push('| `<-.->` dashed, no arrowhead | Both required, neither authorises the other |');
L.push('| `-.->` dashed | The standard was set at the other end, not the sequence |');
L.push('| `-.-` dashed, no arrow | A parallel requirement of the same decision |');
L.push('| Hexagon | A hard gate: nothing downstream starts until it clears |');
L.push('| Dashed border, bold | Added as an execution or financial risk — see the notes |');
L.push('');

for (const v of spec.variants) {
  L.push(`## ${v.label}`);
  L.push('');
  L.push(v.note);
  L.push('');
  L.push('```mermaid');
  L.push(chart(v.id));
  L.push('```');
  L.push('');
}

L.push('## Source tiers');
L.push('');
L.push('Every card carries one. Nothing below `primary` states a requirement.');
L.push('');
L.push('| Card | Tier |');
L.push('|---|---|');
for (const n of spec.nodes) L.push(`| ${n.title} | ${n.sourceTier} |`);
L.push('');
console.log(L.join('\n'));
