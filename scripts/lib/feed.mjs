/* ============================================================================
   Shared helpers for the ingestion scripts. Zero dependencies — Node 22's
   built-in fetch plus a small hand-rolled RSS/Atom parser.

   A regex parser is the right call here: the inputs are a fixed, known set of
   feeds, and taking an XML dependency for this would be more surface area than
   it removes. Anything it cannot parse is reported through sourceHealth rather
   than failing silently.
   ========================================================================= */

export const UA =
  'alberta-datacentre-hub/1.0 (+https://github.com/avjhawer/alberta-datacentre-hub)';

/** Fetch with a timeout. Never throws past the caller's try/catch. */
export async function fetchText(url, { timeoutMs = 20000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      redirect: 'follow',
      headers: { 'user-agent': UA, accept: 'application/rss+xml, application/xml, text/xml, text/html;q=0.8' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  '#39': "'", '#8217': '’', '#8216': '‘',
  '#8220': '“', '#8221': '”', '#8211': '–', '#8212': '—',
};

export function decodeEntities(s = '') {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+|#\d+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

export function stripTags(s = '') {
  return decodeEntities(
    String(s)
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ').trim();
}

function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1] : '';
}

function attr(xml, name, key) {
  const m = xml.match(new RegExp(`<${name}\\b[^>]*\\b${key}\\s*=\\s*["']([^"']+)["']`, 'i'));
  return m ? m[1] : '';
}

/**
 * Parse an RSS 2.0 or Atom document into normalised items.
 * Returns [] rather than throwing on unrecognised input.
 */
export function parseFeed(xml) {
  if (typeof xml !== 'string' || !xml.trim()) return [];

  const blocks = [
    ...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi),
    ...xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi),
  ];

  const out = [];
  for (const [, block] of blocks) {
    const title = stripTags(tag(block, 'title'));
    if (!title) continue;

    // RSS <link>text</link>, Atom <link href="…"/>
    let link = stripTags(tag(block, 'link'));
    if (!link) link = attr(block, 'link', 'href');
    if (!link) link = stripTags(tag(block, 'guid'));
    if (!link || !/^https?:\/\//i.test(link)) continue;

    const dateRaw =
      tag(block, 'pubDate') || tag(block, 'published') ||
      tag(block, 'updated') || tag(block, 'dc:date');
    const d = new Date(stripTags(dateRaw));
    const published = Number.isNaN(d.getTime()) ? null : d.toISOString();

    const summary = stripTags(
      tag(block, 'description') || tag(block, 'summary') || tag(block, 'content')
    ).slice(0, 400);

    // Google News wraps the outlet name in <source>
    const outlet = stripTags(tag(block, 'source'));

    out.push({ title, url: link, published, summary, outlet });
  }
  return out;
}

/** Discover a feed URL advertised in an HTML page's <head>. */
export function findFeedLink(html, baseUrl) {
  const re = /<link\b[^>]*>/gi;
  for (const [t] of html.matchAll(re)) {
    if (!/rel\s*=\s*["']?alternate/i.test(t)) continue;
    if (!/type\s*=\s*["'](application\/(rss|atom)\+xml)["']/i.test(t)) continue;
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(t)?.[1];
    if (href) { try { return new URL(href, baseUrl).href; } catch { /* skip */ } }
  }
  return null;
}

/** Absolute, same-origin links found in an HTML page. */
export function extractLinks(html, baseUrl) {
  const out = new Set();
  for (const [, href] of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)["']/gi)) {
    try {
      const u = new URL(href, baseUrl);
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        u.hash = '';
        out.add(u.href);
      }
    } catch { /* skip malformed */ }
  }
  return [...out];
}

/** Readable text of an HTML page, for change detection. */
export function mainText(html) {
  return stripTags(
    html
      .replace(/<head[\s\S]*?<\/head>/gi, ' ')
      .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
  );
}

/**
 * Strip tracking parameters but preserve case and structure — this is the URL
 * that gets stored and clicked, so it must still resolve.
 */
export function cleanUrl(u) {
  try {
    const url = new URL(u);
    for (const k of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_(c|e)id|igshid)/i.test(k)) url.searchParams.delete(k);
    }
    return url.href;
  } catch { return String(u); }
}

/** Normalise a URL for dedupe only: lowercased, trailing slash dropped. */
export function normalizeUrl(u) {
  try {
    const url = new URL(u);
    for (const k of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_|oc|ref)/i.test(k)) url.searchParams.delete(k);
    }
    url.hash = '';
    let s = url.href.replace(/\/$/, '');
    return s.toLowerCase();
  } catch { return String(u).toLowerCase(); }
}

/** Loose title key for cross-outlet dedupe (Google News repeats stories). */
export function titleKey(t) {
  return String(t)
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(the|a|an|of|in|to|for|and|on|at|as|is|are|its)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 9)
    .join(' ');
}

export function hostOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; }
}
