#!/usr/bin/env node
/* ============================================================================
   Validate every data file before it can reach the live site.

   This is the guardrail that makes hand-editing safe: a malformed record fails
   the check with a readable message instead of quietly breaking a page.

     node scripts/validate-data.mjs
   ========================================================================= */

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'site', 'data');

const TIERS = ['primary', 'reported', 'unverified'];
const errors = [];
const warnings = [];

const err = (file, msg) => errors.push(`${file}: ${msg}`);
const warn = (file, msg) => warnings.push(`${file}: ${msg}`);

async function read(name) {
  try {
    return JSON.parse(await readFile(join(DATA, `${name}.json`), 'utf8'));
  } catch (e) {
    err(`${name}.json`, `not valid JSON — ${e.message}`);
    return null;
  }
}

function checkUrl(file, where, url, { required = true } = {}) {
  if (!url) {
    if (required) err(file, `${where}: missing source URL`);
    return;
  }
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) err(file, `${where}: URL must be http(s) — got ${u.protocol}`);
  } catch {
    err(file, `${where}: malformed URL "${url}"`);
  }
}

function checkTier(file, where, tier) {
  if (!tier) { err(file, `${where}: missing sourceTier (one of ${TIERS.join(', ')})`); return; }
  if (!TIERS.includes(tier)) err(file, `${where}: sourceTier "${tier}" is not one of ${TIERS.join(', ')}`);
}

/* A `primary` source means the body that made the rule published it. A law
   firm's summary of an Act is useful, but it is commentary — tagging it primary
   is how a secondary reading quietly becomes "the regulation says". */
const AUTHORITY_HOST = /(^|\.)(gc\.ca|canada\.ca|alberta\.ca|ab\.ca|gov)$|(^|\.)(aeso|auc|aer)\.(ca|ab\.ca)$/;

function checkPrimaryIsAuthoritative(file, where, tier, url) {
  if (tier !== 'primary' || !url) return;
  let host;
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { return; }
  if (!AUTHORITY_HOST.test(host)) {
    err(file, `${where}: sourceTier "primary" but the source is ${host}, which is not a ` +
           `government or regulator host. A summary of a rule is not the rule — ` +
           `tag this "reported" or cite the issuing body directly.`);
  }
}

function checkDate(file, where, d, { required = true } = {}) {
  if (!d) { if (required) err(file, `${where}: missing date`); return; }
  if (Number.isNaN(Date.parse(d))) err(file, `${where}: unparseable date "${d}"`);
}

/* ------------------------------------------------------------------ main */

const policy = await read('policy');
if (policy) {
  const f = 'policy.json';
  if (!Array.isArray(policy.records)) err(f, 'records must be an array');
  else policy.records.forEach((r, i) => {
    const w = `records[${i}] (${r.id || 'no id'})`;
    if (!r.id) err(f, `${w}: missing id`);
    if (!r.title) err(f, `${w}: missing title`);
    checkDate(f, w, r.date);
    checkTier(f, w, r.sourceTier);
    checkUrl(f, w, r.source);
    checkPrimaryIsAuthoritative(f, w, r.sourceTier, r.source);
    if (!r.region) err(f, `${w}: missing region`);
  });
  const ids = (policy.records || []).map(r => r.id);
  const dupes = ids.filter((x, i) => ids.indexOf(x) !== i);
  if (dupes.length) err(f, `duplicate record ids: ${[...new Set(dupes)].join(', ')}`);
}

const projects = await read('projects');
if (projects) {
  const f = 'projects.json';
  for (const bucket of ['confirmed', 'reported']) {
    if (!Array.isArray(projects[bucket])) { err(f, `${bucket} must be an array`); continue; }
  }
  (projects.confirmed || []).forEach((p, i) => {
    const w = `confirmed[${i}] (${p.name || 'unnamed'})`;
    if (!p.name) err(f, `${w}: missing name`);
    checkTier(f, w, p.sourceTier);
    checkUrl(f, w, p.source);
    checkPrimaryIsAuthoritative(f, w, p.sourceTier, p.source);
    // The rule that matters: nothing unverified is allowed to sit in the
    // confirmed bucket, where the UI presents it as established fact.
    if (p.sourceTier !== 'primary') {
      err(f, `${w}: only primary-source records may appear in "confirmed" — ` +
             `move this to "reported" or supply a primary source`);
    }
    if (p.capacityMW != null && typeof p.capacityMW !== 'number') {
      err(f, `${w}: capacityMW must be a number`);
    }
  });
}

const muni = await read('municipalities');
if (muni) {
  const f = 'municipalities.json';
  if (!Array.isArray(muni.columns)) err(f, 'columns must be an array');
  (muni.municipalities || []).forEach((m, i) => {
    const w = `municipalities[${i}] (${m.name || 'unnamed'})`;
    if (!m.id) err(f, `${w}: missing id`);
    if (!m.name) err(f, `${w}: missing name`);
    checkTier(f, w, m.sourceTier);
    checkUrl(f, w, m.source);
    for (const col of muni.columns || []) {
      const cell = m[col.key];
      if (cell === null || cell === undefined) continue;   // "not yet verified"
      if (typeof cell !== 'object' || !('value' in cell)) {
        err(f, `${w}: column "${col.key}" must be null or an object with a "value"`);
      }
    }
  });
}

const sources = await read('sources');
if (sources) {
  const f = 'sources.json';
  const ids = new Set();
  for (const [bucket, list] of [['feeds', sources.feeds], ['watch', sources.watch]]) {
    if (!Array.isArray(list)) { err(f, `${bucket} must be an array`); continue; }
    list.forEach((s, i) => {
      const w = `${bucket}[${i}] (${s.id || 'no id'})`;
      if (!s.id) err(f, `${w}: missing id`);
      else if (ids.has(s.id)) err(f, `${w}: duplicate id "${s.id}"`);
      else ids.add(s.id);
      if (!s.name) err(f, `${w}: missing name`);
      checkUrl(f, w, s.url);
      checkTier(f, w, s.tier);
    });
  }
  for (const p of sources.discovery?.authorityPatterns || []) {
    try { new RegExp(p); } catch (e) { err(f, `discovery.authorityPatterns: bad regex "${p}" — ${e.message}`); }
  }
}

const checklist = await read('checklist');
if (checklist) {
  const f = 'checklist.json';
  const ids = new Set();
  if (!Array.isArray(checklist.sections)) err(f, 'sections must be an array');
  else checklist.sections.forEach((s, i) => {
    if (!s.id) err(f, `sections[${i}]: missing id`);
    if (!s.title) err(f, `sections[${i}]: missing title`);
    if (!Array.isArray(s.criteria) || !s.criteria.length) {
      err(f, `sections[${i}] (${s.id}): must have at least one criterion`);
      return;
    }
    s.criteria.forEach((c, j) => {
      const w = `sections[${i}].criteria[${j}]`;
      if (!c.id) err(f, `${w}: missing id — ids are the localStorage keys, so a ` +
                        `missing or changed id silently drops saved review notes`);
      else if (ids.has(c.id)) err(f, `${w}: duplicate criterion id "${c.id}" — this would ` +
                                     `make two criteria share one saved answer`);
      else ids.add(c.id);
      if (!c.text) err(f, `${w}: missing text`);
    });
  });
  if (!Array.isArray(checklist.statuses) || !checklist.statuses.length) {
    err(f, 'statuses must be a non-empty array');
  }
}

const library = await read('library');
if (library) {
  const f = 'library.json';
  (library.groups || []).forEach((g, i) => {
    if (!g.title) err(f, `groups[${i}]: missing title`);
    (g.links || []).forEach((l, j) => {
      const w = `groups[${i}].links[${j}] (${l.label || 'unlabelled'})`;
      if (!l.label) err(f, `${w}: missing label`);
      checkUrl(f, w, l.url);
      if (l.tier && !TIERS.includes(l.tier)) err(f, `${w}: bad tier "${l.tier}"`);
    });
  });
}

const grid = await read('grid');
if (grid) {
  const f = 'grid.json';
  // Figures are split by how well evidenced they are. The dashboard hero must
  // draw from `verified`, so that block is required and must be primary-tier.
  for (const block of ['verified', 'reported', 'fromRegulation']) {
    if (!grid[block] || typeof grid[block] !== 'object') {
      err(f, `missing "${block}" block — grid figures must be separated by how well evidenced they are`);
      continue;
    }
    checkTier(f, block, grid[block].sourceTier);
    checkUrl(f, block, grid[block].source);
    checkPrimaryIsAuthoritative(f, block, grid[block].sourceTier, grid[block].source);
  }
  if (grid.verified && grid.verified.sourceTier !== 'primary') {
    err(f, 'verified.sourceTier must be "primary" — the dashboard hero reads from this block');
  }
  for (const k of ['interimCapMW', 'allocatedMW']) {
    if (typeof grid.verified?.[k] !== 'number') err(f, `verified.${k} must be a number`);
  }
  for (const k of ['queueProjects', 'queueRequestedMW']) {
    if (typeof grid.reported?.[k] !== 'number') err(f, `reported.${k} must be a number`);
  }
  if (typeof grid.verified?.allocatedMW === 'number' && typeof grid.verified?.interimCapMW === 'number'
      && grid.verified.allocatedMW > grid.verified.interimCapMW) {
    warn(f, `verified.allocatedMW (${grid.verified.allocatedMW}) exceeds verified.interimCapMW ` +
            `(${grid.verified.interimCapMW}) — the meter will render full`);
  }
}

const rules = await read('rules');
if (rules) {
  const f = 'rules.json';
  const areaIds = new Set((checklist?.sections || []).map(s => s.id));
  const fieldKeys = new Set((rules.fields || []).map(x => x.key));
  const OPS = ['>=', '<=', '>', '<', '=', 'in'];
  const ids = new Set();

  if (!Array.isArray(rules.fields) || !rules.fields.length) err(f, 'fields must be a non-empty array');
  if (!Array.isArray(rules.rules)) err(f, 'rules must be an array');

  (rules.rules || []).forEach((r, i) => {
    const w = `rules[${i}] (${r.id || 'no id'})`;
    if (!r.id) err(f, `${w}: missing id`);
    else if (ids.has(r.id)) err(f, `${w}: duplicate rule id "${r.id}"`);
    else ids.add(r.id);
    if (!r.title) err(f, `${w}: missing title`);
    if (!r.ask) err(f, `${w}: missing "ask" — every rule must tell the planner what to do next`);

    // A rule's area must be a real checklist section, so the tool can file it.
    if (!areaIds.has(r.area)) {
      err(f, `${w}: area "${r.area}" is not a section id in checklist.json ` +
             `(have: ${[...areaIds].join(', ')})`);
    }
    if (!r.when || !fieldKeys.has(r.when.field)) {
      err(f, `${w}: when.field "${r.when?.field}" is not a declared field`);
    }
    if (!OPS.includes(r.when?.op)) err(f, `${w}: when.op must be one of ${OPS.join(', ')}`);
    if (r.when?.op === 'in' && !Array.isArray(r.when.value)) {
      err(f, `${w}: op "in" requires an array value`);
    }
    checkTier(f, w, r.sourceTier);
    checkPrimaryIsAuthoritative(f, w, r.sourceTier, r.source);

    // The honesty rule. A rule may only state a requirement as fact when a
    // primary source backs it; anything weaker has to be phrased as a question,
    // which is how the UI renders it.
    if (r.kind === 'requirement' && r.sourceTier !== 'primary') {
      err(f, `${w}: kind "requirement" asserts a legal obligation, so it needs a ` +
             `primary source — this one is "${r.sourceTier}". Change kind to "question" ` +
             `or supply a primary source.`);
    }
    if (r.kind === 'requirement' && !r.source) {
      err(f, `${w}: kind "requirement" must carry a source URL`);
    }
    if (!['requirement', 'question'].includes(r.kind)) {
      err(f, `${w}: kind must be "requirement" or "question"`);
    }
  });
}

for (const n of ['precedents', 'tech', 'news', 'alerts']) await read(n);

/* ---------------------------------------------------------------- report */

if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  warnings.forEach(w => console.log(`  ! ${w}`));
}

if (errors.length) {
  console.error(`\n${errors.length} error(s):`);
  errors.forEach(e => console.error(`  x ${e}`));
  console.error('\nFix these before the change can go live. See MAINTENANCE.md for each file\'s fields.');
  process.exit(1);
}

console.log('\nAll data files valid.');
