/* ============================================================================
   Classification and breaking-news scoring.

   Deterministic and keyword-driven on purpose: no API key, no model call, and
   the same input always produces the same output — which matters when the
   result feeds a permit review.
   ========================================================================= */

const REGION_RULES = [
  ['alberta', [
    // Municipality and region names only. Deliberately no generating-station
    // or facility names: those are tied to specific proponents, and this file
    // must not carry any association with a named project.
    'alberta', 'aeso', 'auc ', 'calgary', 'edmonton', 'parkland county',
    'rocky view', 'sturgeon county', 'greenview', 'leduc', 'strathcona county',
    'industrial heartland', 'red deer', 'grande prairie', 'lethbridge',
  ]],
  ['canada', [
    'canada', 'canadian', 'ottawa', 'ontario', 'quebec', 'québec',
    'british columbia', 'manitoba', 'saskatchewan', 'nova scotia',
    'new brunswick', 'ised', 'federal',
  ]],
];

const STREAM_RULES = [
  ['regulation', [
    'regulation', 'bylaw', 'by-law', 'statute', 'legislation', 'bill ',
    'in force', 'filed', 'amendment', 'rule 012', 'levy', 'tariff', 'act',
  ]],
  ['policy', [
    'policy', 'strategy', 'framework', 'moratorium', 'consultation',
    'memorandum', 'mou', 'budget', 'program', 'review', 'inquiry',
  ]],
  ['municipal', [
    'council', 'municipal', 'county', 'zoning', 'land use', 'development permit',
    'public hearing', 'rezoning', 'planning commission', 'subdivision',
  ]],
  ['projects', [
    'project', 'campus', 'facility', 'megawatt', ' mw', 'gigawatt', ' gw',
    'construction', 'break ground', 'approved', 'application', 'proposal',
    'investment', 'build',
  ]],
  ['technology', [
    'cooling', 'liquid', 'immersion', 'chip', 'gpu', 'rack', 'density',
    'efficiency', 'pue', 'wue', 'waste heat', 'smr', 'nuclear', 'turbine',
  ]],
  ['market', [
    'earnings', 'capex', 'revenue', 'stock', 'valuation', 'acquisition',
    'merger', 'funding', 'billion', 'ipo',
  ]],
];

/** High-signal words for the breaking band, weighted by how decisive they are. */
const SIGNAL = [
  [5, ['in force', 'filed', 'comes into force', 'royal assent', 'moratorium']],
  [4, ['approved', 'approval', 'rejected', 'refused', 'denied', 'curtailment']],
  [4, ['allocation', 'allocated', 'cap ', 'suspended', 'halted', 'paused']],
  [3, ['regulation', 'bylaw', 'levy', 'ruling', 'decision', 'order']],
  [3, ['public hearing', 'council votes', 'passes', 'adopted']],
  [2, ['announce', 'launch', 'propose', 'consultation', 'megawatt', 'gigawatt']],
];

function hay(item) {
  return `${item.title} ${item.summary || ''}`.toLowerCase();
}

export function classifyRegion(item, feedRegion) {
  const h = hay(item);
  for (const [region, words] of REGION_RULES) {
    if (words.some(w => h.includes(w))) return region;
  }
  return feedRegion || 'global';
}

export function classifyStream(item) {
  const h = hay(item);
  let best = null, bestHits = 0;
  for (const [stream, words] of STREAM_RULES) {
    const hits = words.reduce((n, w) => n + (h.includes(w) ? 1 : 0), 0);
    if (hits > bestHits) { best = stream; bestHits = hits; }
  }
  return best || 'news';
}

/**
 * Score an item for the breaking band.
 * Recency dominates; keyword signal and source tier modify it.
 */
export function score(item, { tier = 'reported' } = {}) {
  const h = hay(item);
  let s = 0;

  for (const [weight, words] of SIGNAL) {
    if (words.some(w => h.includes(w))) s += weight;
  }

  if (tier === 'primary') s += 4;                       // regulators outrank media
  if (item.region === 'alberta') s += 3;                // this site's focus

  const ts = item.published ? Date.parse(item.published) : NaN;
  if (Number.isFinite(ts)) {
    const ageH = (Date.now() - ts) / 36e5;
    if (ageH < 0) return 0;                             // future-dated: ignore
    if (ageH <= 12) s += 8;
    else if (ageH <= 48) s += 5;
    else if (ageH <= 96) s += 2;
    else s -= 4;
  } else {
    s -= 2;                                             // undated is weak evidence
  }

  return s;
}

/** Items are "breaking" only if recent AND high-signal. */
export function isBreaking(item, s) {
  const ts = item.published ? Date.parse(item.published) : NaN;
  if (!Number.isFinite(ts)) return false;
  const ageH = (Date.now() - ts) / 36e5;
  return ageH <= 48 && s >= 12;
}
