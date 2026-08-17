/* ============================================================================
   Alberta Data Centre Hub — app shell
   Renders the sidebar + top bar, wires the command palette, theme/density
   toggles, data loading, live refresh, and the shared filter/sort helpers.
   No dependencies. Every page includes this and sets <body data-page="...">.
   ========================================================================= */

/* ------------------------------------------------------------------ icons */

const ICON = {
  dashboard: 'M3 3h7v7H3zM14 3h7v4h-7zM14 10h7v11h-7zM3 13h7v8H3z',
  news:      'M4 4h13v16H4zM17 8h3v10a2 2 0 0 1-2 2M7 8h7M7 12h7M7 16h4',
  policy:    'M6 2h9l5 5v15H6zM14 2v6h6M9 13h8M9 17h6',
  precedent: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
  tech:      'M9 3h6v3h4v4h3v6h-3v4h-4v3H9v-3H5v-4H2v-6h3V6h4zM9 9h6v6H9z',
  projects:  'M3 5h18M3 12h18M3 19h18M7 3v4M13 10v4M17 17v4',
  municipal: 'M3 21h18M5 21V9l7-5 7 5v12M10 21v-6h4v6',
  permits:   'M9 3h6l1 2h3v16H5V5h3zM8 12l2.5 2.5L16 9',
  library:   'M4 4h5v16H4zM10 4h4v16h-4zM16 5l4 1-3 15-4-1z',
  search:    'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4.2-4.2',
  sun:       'M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon:      'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z',
  density:   'M3 5h18M3 10h18M3 15h18M3 20h18',
  menu:      'M3 6h18M3 12h18M3 18h18',
  share:     'M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v13M8 7l4-4 4 4',
  alert:     'M12 3l9 16H3zM12 9v5M12 17h.01',
  check:     'M4 12l5 5L20 6',
  cross:     'M6 6l12 12M18 6L6 18',
  question:  'M9 9a3 3 0 1 1 4 2.8c-.7.3-1 .9-1 1.7v.5M12 17h.01',
  dash:      'M5 12h14',
  shield:    'M12 2l8 3v7c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V5z',
  doc:       'M6 2h9l5 5v15H6z',
  external:  'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
};

/** Inline SVG icon. `paths` may contain multiple subpaths separated by M. */
function icon(name, cls) {
  const d = ICON[name];
  if (!d) return '';
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${cls ? ` class="${cls}"` : ''}><path d="${d}"/></svg>`;
}

/* ------------------------------------------------------------ site config */

const NAV = [
  {
    label: 'Intelligence',
    items: [
      { id: 'dashboard',  href: 'index.html',      icon: 'dashboard', label: 'Dashboard' },
      { id: 'news',       href: 'news.html',       icon: 'news',      label: 'News feed' },
      { id: 'policy',     href: 'policy.html',     icon: 'policy',    label: 'Policy & regulation' },
      { id: 'precedents', href: 'precedents.html', icon: 'precedent', label: 'Precedents & impacts' },
      { id: 'tech',       href: 'tech.html',       icon: 'tech',      label: 'Technology trends' },
    ],
  },
  {
    label: 'Review',
    items: [
      { id: 'projects',  href: 'projects.html',  icon: 'projects',  label: 'Project tracker' },
      { id: 'municipal', href: 'municipal.html', icon: 'municipal', label: 'Municipal matrix' },
      { id: 'permits',   href: 'permits.html',   icon: 'permits',   label: 'DP review tool' },
      { id: 'library',   href: 'library.html',   icon: 'library',   label: 'Reference library' },
    ],
  },
];

const REFRESH_MS = 5 * 60 * 1000;
const LS = {
  theme:   'adch.theme',
  density: 'adch.density',
  lastSeen:'adch.lastSeen',
};

/* --------------------------------------------------------------- helpers */

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Escape text for safe interpolation into HTML. */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Only allow http(s) URLs through to href attributes. */
function safeUrl(u) {
  try {
    const url = new URL(String(u), location.href);
    return (url.protocol === 'http:' || url.protocol === 'https:') ? url.href : '#';
  } catch { return '#'; }
}

function fmtNum(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return Number(n).toLocaleString('en-CA');
}

/** Compact display for large values: 19,565 -> 19.6K */
function fmtCompact(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  if (Math.abs(v) >= 1000) {
    return new Intl.NumberFormat('en-CA', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
  }
  return fmtNum(v);
}

function parseDate(s) {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDate(s) {
  const d = parseDate(s);
  if (!d) return '—';
  return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** "12 minutes ago" / "3 days ago". */
function relTime(s) {
  const d = parseDate(s);
  if (!d) return '';
  const secs = Math.round((Date.now() - d.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat('en-CA', { numeric: 'auto' });
  const units = [
    ['year', 31536000], ['month', 2592000], ['week', 604800],
    ['day', 86400], ['hour', 3600], ['minute', 60],
  ];
  for (const [unit, secsPer] of units) {
    if (Math.abs(secs) >= secsPer) return rtf.format(-Math.round(secs / secsPer), unit);
  }
  return 'just now';
}

/* ------------------------------------------------------------ data loading */

const dataCache = new Map();

/**
 * Load a JSON file from data/. Returns `fallback` when the file is missing or
 * malformed — the site degrades by hiding a section, never by blanking a page.
 */
async function loadData(name, fallback = null, { bust = false } = {}) {
  const url = `data/${name}.json${bust ? `?t=${Date.now()}` : ''}`;
  try {
    const res = await fetch(url, { cache: bust ? 'no-store' : 'default' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    dataCache.set(name, json);
    return json;
  } catch (err) {
    console.warn(`[adch] could not load ${name}.json —`, err.message);
    return dataCache.get(name) ?? fallback;
  }
}

/* --------------------------------------------------------- theme & density */

function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.setAttribute('data-theme', theme);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

function currentTheme() {
  return localStorage.getItem(LS.theme) || 'system';
}

function cycleTheme() {
  const order = ['system', 'light', 'dark'];
  const next = order[(order.indexOf(currentTheme()) + 1) % order.length];
  localStorage.setItem(LS.theme, next);
  applyTheme(next);
  updateThemeButton();
}

function updateThemeButton() {
  const btn = $('#theme-toggle');
  if (!btn) return;
  const t = currentTheme();
  btn.innerHTML = icon(t === 'dark' ? 'moon' : 'sun');
  btn.title = `Theme: ${t} (click to change)`;
  btn.setAttribute('aria-label', `Theme: ${t}. Click to change.`);
}

function applyDensity(d) {
  document.documentElement.setAttribute('data-density', d === 'compact' ? 'compact' : 'comfortable');
}

function toggleDensity() {
  const next = (localStorage.getItem(LS.density) === 'compact') ? 'comfortable' : 'compact';
  localStorage.setItem(LS.density, next);
  applyDensity(next);
  const btn = $('#density-toggle');
  if (btn) btn.title = `Density: ${next} (click to change)`;
}

/* Apply before first paint to avoid a flash of the wrong theme. */
applyTheme(currentTheme());
applyDensity(localStorage.getItem(LS.density) || 'comfortable');

/* ------------------------------------------------------------- shell render */

function renderShell() {
  const page = document.body.dataset.page || '';

  const sidebar = $('#sidebar');
  if (sidebar) {
    sidebar.innerHTML = `
      <div class="sidebar-sticky">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true">AB</div>
        <div class="brand-text">
          <div class="brand-name">Data Centre Hub</div>
          <div class="brand-sub">Alberta &amp; Canada</div>
        </div>
      </div>
      <nav class="nav" aria-label="Main">
        ${NAV.map(group => `
          <div class="nav-group">
            <div class="nav-group-label">${esc(group.label)}</div>
            ${group.items.map(it => `
              <a class="nav-link" href="${esc(it.href)}"
                 ${it.id === page ? 'aria-current="page"' : ''}>
                ${icon(it.icon)}<span>${esc(it.label)}</span>
              </a>`).join('')}
          </div>`).join('')}
      </nav>
      <div class="sidebar-foot" id="source-health"></div>
      </div>`;
  }

  const topbar = $('#topbar');
  if (topbar) {
    topbar.innerHTML = `
      <button class="icon-btn drawer-toggle" id="drawer-toggle"
              aria-label="Open navigation" aria-expanded="false">${icon('menu')}</button>
      <button class="cmdk-trigger" id="cmdk-trigger" aria-label="Search and jump to (Command K)">
        ${icon('search')}<span>Search or jump to…</span><kbd>⌘K</kbd>
      </button>
      <div class="topbar-spacer"></div>
      <div class="live-status" id="live-status" title="Data refreshes automatically">
        <span class="live-dot" aria-hidden="true"></span>
        <span class="live-text">Loading…</span>
      </div>
      <button class="icon-btn" id="density-toggle" aria-label="Toggle row density">${icon('density')}</button>
      <button class="icon-btn" id="theme-toggle" aria-label="Toggle theme"></button>
      <button class="btn" id="share-btn">${icon('share')}<span>Share</span></button>`;
  }

  updateThemeButton();
  const dBtn = $('#density-toggle');
  if (dBtn) dBtn.title = `Density: ${localStorage.getItem(LS.density) || 'comfortable'} (click to change)`;

  $('#theme-toggle')?.addEventListener('click', cycleTheme);
  $('#density-toggle')?.addEventListener('click', toggleDensity);
  $('#cmdk-trigger')?.addEventListener('click', () => openPalette());
  $('#drawer-toggle')?.addEventListener('click', () => {
    const sb = $('#sidebar');
    const open = sb.classList.toggle('is-open');
    $('#drawer-toggle').setAttribute('aria-expanded', String(open));
  });
  $('#share-btn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    try {
      await navigator.clipboard.writeText(location.href);
      const original = btn.innerHTML;
      btn.innerHTML = `${icon('check')}<span>Link copied</span>`;
      setTimeout(() => { btn.innerHTML = original; }, 1800);
    } catch {
      prompt('Copy this link to share:', location.href);
    }
  });
}

/* ------------------------------------------------------- command palette */

let paletteIndex = [];
let paletteOpen = false;

function registerPaletteItems(items) {
  paletteIndex = paletteIndex.concat(items);
}

function basePaletteItems() {
  return NAV.flatMap(g => g.items.map(it => ({
    label: it.label, kind: 'Page', href: it.href,
  })));
}

function openPalette() {
  if (paletteOpen) return;
  paletteOpen = true;

  const backdrop = document.createElement('div');
  backdrop.className = 'cmdk-backdrop';
  backdrop.innerHTML = `
    <div class="cmdk-panel" role="dialog" aria-modal="true" aria-label="Search and jump to">
      <input class="cmdk-input" id="cmdk-input" type="text" autocomplete="off"
             placeholder="Search pages, projects, municipalities, criteria…">
      <ul class="cmdk-results" id="cmdk-results" role="listbox"></ul>
    </div>`;
  document.body.appendChild(backdrop);

  const input = $('#cmdk-input', backdrop);
  const list = $('#cmdk-results', backdrop);
  const all = basePaletteItems().concat(paletteIndex);
  let matches = all.slice(0, 12);
  let sel = 0;

  function render() {
    if (!matches.length) {
      list.innerHTML = `<li class="cmdk-empty">No matches</li>`;
      return;
    }
    list.innerHTML = matches.map((m, i) => `
      <li class="cmdk-result" role="option" data-i="${i}"
          aria-selected="${i === sel}">
        <span>${esc(m.label)}</span><span class="kind">${esc(m.kind)}</span>
      </li>`).join('');
  }

  function go(m) {
    if (!m) return;
    close();
    if (m.href) location.href = m.href;
    else if (m.action) m.action();
  }

  function close() {
    paletteOpen = false;
    backdrop.remove();
    document.removeEventListener('keydown', onKey, true);
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, matches.length - 1); render(); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); sel = Math.max(sel - 1, 0); render(); }
    else if (e.key === 'Enter')     { e.preventDefault(); go(matches[sel]); }
  }

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    matches = (q
      ? all.filter(m => m.label.toLowerCase().includes(q) || m.kind.toLowerCase().includes(q))
      : all
    ).slice(0, 12);
    sel = 0;
    render();
  });

  list.addEventListener('click', (e) => {
    const li = e.target.closest('.cmdk-result');
    if (li) go(matches[Number(li.dataset.i)]);
  });

  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', onKey, true);

  render();
  input.focus();
}

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openPalette();
  } else if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) {
    e.preventDefault();
    const s = $('.search-input');
    if (s) s.focus(); else openPalette();
  }
});

/* -------------------------------------------------------------- liveness */

let lastGeneratedAt = null;

function renderLiveStatus(news) {
  const el = $('#live-status');
  if (!el) return;
  const dot = $('.live-dot', el);
  const text = $('.live-text', el);
  const gen = news?.generatedAt;

  if (!gen) {
    dot.classList.add('is-stale');
    text.textContent = 'Awaiting first update';
    el.title = 'The news feed has not run yet. It refreshes every 3 hours once deployed.';
    return;
  }

  const ageH = (Date.now() - new Date(gen).getTime()) / 36e5;
  dot.classList.toggle('is-stale', ageH > 12);
  text.textContent = `Updated ${relTime(gen)}`;
  el.title = `Feed last generated ${fmtDate(gen)}. Refreshes every 3 hours.`;

  const health = $('#source-health');
  if (health && Array.isArray(news.sourceHealth) && news.sourceHealth.length) {
    const ok = news.sourceHealth.filter(s => s.ok).length;
    const total = news.sourceHealth.length;
    const failed = total - ok;
    health.innerHTML = failed
      ? `<span title="${esc(news.sourceHealth.filter(s => !s.ok).map(s => s.name).join(', '))}">${ok}/${total} sources live</span>`
      : `${total} sources live`;
  }
}

/** Watermark of the reader's last visit, for the "new since" markers. */
function lastSeenAt() {
  const v = Number(localStorage.getItem(LS.lastSeen));
  return Number.isFinite(v) && v > 0 ? v : null;
}
function markSeen() {
  localStorage.setItem(LS.lastSeen, String(Date.now()));
}

function isNew(item, seen) {
  if (!seen) return false;
  const d = parseDate(item.published);
  return d ? d.getTime() > seen : false;
}

/**
 * Re-fetch news.json every 5 minutes while the tab is open, so a left-open
 * tab stays current. Holds the previous render at reduced opacity rather than
 * flashing a skeleton.
 */
function startLiveRefresh(onUpdate) {
  let timer = null;

  async function tick() {
    if (document.hidden) return;
    const main = $('#main');
    main?.classList.add('is-refreshing');
    const news = await loadData('news', null, { bust: true });
    main?.classList.remove('is-refreshing');
    if (news && news.generatedAt !== lastGeneratedAt) {
      lastGeneratedAt = news.generatedAt;
      renderLiveStatus(news);
      onUpdate?.(news);
    }
  }

  timer = setInterval(tick, REFRESH_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  window.addEventListener('pagehide', () => clearInterval(timer));
}

/* ---------------------------------------------------------- table sorting */

/**
 * Make a table sortable. Values come from `data-sort` on each cell when
 * present, otherwise the cell text. Numeric when every value parses.
 */
function makeSortable(table) {
  const heads = $$('th.sortable', table);
  heads.forEach((th, col) => {
    th.tabIndex = 0;
    const activate = () => {
      const dir = th.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending';
      heads.forEach(h => h.removeAttribute('aria-sort'));
      th.setAttribute('aria-sort', dir);

      const tbody = $('tbody', table);
      const rows = $$('tr', tbody);
      const val = (tr) => {
        const cell = tr.children[col];
        return cell?.dataset.sort ?? cell?.textContent.trim() ?? '';
      };
      const allNumeric = rows.every(r => {
        const v = val(r).replace(/[, ]/g, '');
        return v === '' || v === '—' || !Number.isNaN(Number(v));
      });

      rows.sort((a, b) => {
        let x = val(a), y = val(b);
        if (allNumeric) {
          x = Number(String(x).replace(/[, ]/g, '')) || 0;
          y = Number(String(y).replace(/[, ]/g, '')) || 0;
          return dir === 'ascending' ? x - y : y - x;
        }
        return dir === 'ascending' ? x.localeCompare(y) : y.localeCompare(x);
      });
      rows.forEach(r => tbody.appendChild(r));
    };
    th.addEventListener('click', activate);
    th.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
    });
  });
}

/* --------------------------------------------------------- shared badges */

const TIER_META = {
  primary:  { icon: 'shield',   label: 'Primary source', cls: 'chip-primary',
              title: 'Confirmed against a regulator, municipality or government publication.' },
  reported: { icon: 'news',     label: 'Reported',       cls: 'chip-reported',
              title: 'Media or law-firm coverage. Not confirmed against a primary source.' },
  unverified:{ icon: 'question',label: 'Unverified',     cls: 'chip-reported',
              title: 'Not confirmed. Treat as a lead only.' },
};

function tierChip(tier) {
  const m = TIER_META[tier] || TIER_META.unverified;
  return `<span class="chip ${m.cls}" title="${esc(m.title)}">${icon(m.icon)}${esc(m.label)}</span>`;
}

const REGION_LABEL = { alberta: 'Alberta', canada: 'Canada', global: 'Global' };

function regionChip(region) {
  const label = REGION_LABEL[region] || 'Other';
  return `<span class="chip chip-region chip-${esc(region)}">${esc(label)}</span>`;
}

const STATUS_META = {
  good:     { icon: 'check',    cls: 'badge-good' },
  warning:  { icon: 'alert',    cls: 'badge-warning' },
  serious:  { icon: 'alert',    cls: 'badge-serious' },
  critical: { icon: 'cross',    cls: 'badge-critical' },
  neutral:  { icon: 'dash',     cls: 'badge-neutral' },
  question: { icon: 'question', cls: 'badge-neutral' },
};

/** Status always renders as icon + label + colour — never colour alone. */
function statusBadge(kind, label) {
  const m = STATUS_META[kind] || STATUS_META.neutral;
  return `<span class="badge ${m.cls}">${icon(m.icon)}${esc(label)}</span>`;
}

/* --------------------------------------------------------------- exports */

window.ADCH = {
  $, $$, esc, safeUrl, icon,
  fmtNum, fmtCompact, fmtDate, relTime, parseDate,
  loadData, renderShell, registerPaletteItems, openPalette,
  renderLiveStatus, startLiveRefresh, lastSeenAt, markSeen, isNew,
  makeSortable, tierChip, regionChip, statusBadge,
  REGION_LABEL,
};

document.addEventListener('DOMContentLoaded', renderShell);
