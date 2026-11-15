/* ============================================================================
   "What changed" — the front door.

   One question: what is new since you last looked? Everything else on this
   page is secondary to answering that in the first screen.

   Deliberate: the last-seen marker is NOT advanced automatically. If it were,
   opening the page would erase the very thing the page is for. The planner
   marks it read when they have read it.

   window.ADCHWhatChanged
   ========================================================================= */

(function () {
  'use strict';

  const A = window.ADCH, C = window.ADCHCharts;
  const { $, esc, safeUrl, fmtNum, relTime, icon, tierChip, regionChip, statusBadge } = A;

  const REGION_RANK = { alberta: 0, canada: 1, global: 2 };
  let data = {};
  let seen = null;
  let showAll = false;
  let showAllAlerts = false;
  let onlyDecision = false;

  /* "New" needs a window even before the reader has one of their own. On a
     first visit the page used to count every alert on file and every item in
     the feed as new — sixty "regulatory changes" in red, to someone who had
     not yet seen the site. A week is the honest default. */
  const WEEK = 7 * 864e5;
  const since = () => seen || (Date.now() - WEEK);
  const when = x => A.parseDate(x)?.getTime() || 0;

  function freshItems() {
    const items = data.news?.items || [];
    if (seen) return items.filter(isNewItem);
    const week = items.filter(i => when(i.published) > since());
    return week.length ? week : items.slice(0, 25);
  }

  /* The watcher logs a change every time a page's hash moves, so one page
     edited three times is three alerts. That is a log; what the reader needs
     is the list of pages. Group by page, keep the latest, count the rest.

     The watcher also records the word count either side. It cannot say what
     changed, but it can say how much — and "same length" against "+240 words"
     is the difference between a date in a footer and a rewritten section.
     Pages whose length moved are listed first. */
  function parseChange(x) {
    const m = /(\d[\d,]*)\s*→\s*(\d[\d,]*)\s*words/.exec(x.change || '');
    if (!m) return null;
    const from = Number(m[1].replace(/,/g, '')), to = Number(m[2].replace(/,/g, ''));
    return { from, to, delta: to - from };
  }
  function describeChange(x) {
    const c = parseChange(x);
    if (!c) return '';
    if (c.delta === 0) return 'Same word count — a small edit such as a date or a figure, or page furniture';
    const n = fmtNum(Math.abs(c.delta));
    return c.delta > 0 ? `${n} word${c.delta === 1 ? '' : 's'} added` : `${n} word${c.delta === -1 ? '' : 's'} removed`;
  }
  /* When dozens of unrelated sites change by exactly the same number of words
     in the same check, the pages did not all edit themselves — the watcher
     started reading them differently. In the data this was written against,
     46 of 60 log entries were "+7 words" with one timestamp. Counting those as
     regulatory change buries the six that are real, so they are set apart:
     still listed, never hidden, but not in the headline number. */
  const BULK_MIN = 5;
  function alertGroups() {
    const recent = (data.alerts?.alerts || []).filter(x => when(x.detectedAt) > since());
    const sig = x => { const c = parseChange(x); return c ? `${x.detectedAt}|${c.delta}` : null; };
    const tally = new Map();
    for (const x of recent) { const k = sig(x); if (k) tally.set(k, (tally.get(k) || 0) + 1); }
    const isBulk = x => (tally.get(sig(x)) || 0) >= BULK_MIN;

    const group = list => {
      const byPage = new Map();
      for (const x of list) {
        const key = x.url || x.id;
        const g = byPage.get(key);
        if (!g) byPage.set(key, { lead: x, count: 1 });
        else { g.count++; if (when(x.detectedAt) > when(g.lead.detectedAt)) g.lead = x; }
      }
      return byPage;
    };
    const real = group(recent.filter(x => !isBulk(x)));
    const bulk = [...group(recent.filter(isBulk)).values()].filter(g => !real.has(g.lead.url || g.lead.id));
    const moved = g => (parseChange(g.lead)?.delta ? 1 : 0);
    const pages = [...real.values()].sort((a, b) =>
      moved(b) - moved(a) || when(b.lead.detectedAt) - when(a.lead.detectedAt));
    return { pages, bulk };
  }

  const isNewItem = i => A.isNew(i, seen);
  const byRegionThenDate = (a, b) =>
    (REGION_RANK[a.region] ?? 3) - (REGION_RANK[b.region] ?? 3) ||
    (A.parseDate(b.published) - A.parseDate(a.published));

  const isPolicyish = i =>
    /policy|regulation|grid|legal/i.test([i.stream, i.topic, ...(i.topics || [])].join(' '));


  /* ---------------------------------------------------------- clustering */
  /* One event gets covered by eight outlets, and eight near-identical
     headlines is noise pretending to be volume. Group them and show the story
     once, with the other outlets available underneath. */

  const STOP = new Set(('the a an of for to in on at by and or as is are was were with from '
    + 'that this it its new says say said after over into amid could would will')
    .split(' '));

  function titleTokens(title) {
    // Outlet names are usually appended after a dash; they are not the story.
    const core = String(title).split(/\s+[-–—|]\s+/)[0];
    return new Set(core.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP.has(w)));
  }

  function similarity(a, b) {
    if (!a.size || !b.size) return 0;
    let shared = 0;
    for (const t of a) if (b.has(t)) shared++;
    return shared / Math.min(a.size, b.size);   // containment, not Jaccard:
  }                                              // headlines vary a lot in length

  function cluster(items) {
    const out = [];
    for (const item of items) {
      const toks = titleTokens(item.title);
      const hit = out.find(c => similarity(c.tokens, toks) >= 0.55);
      if (hit) { hit.others.push(item); hit.tokens = new Set([...hit.tokens].filter(t => toks.has(t))); }
      else out.push({ lead: item, others: [], tokens: toks });
    }
    return out;
  }

  /* ---------------------------------------------------------------- digest */

  function renderDigest() {
    const { pages } = alertGroups();
    const fresh = freshItems();
    // Count stories, not headlines, so the three figures are comparable.
    const stories = cluster(fresh);
    const albertan = cluster(fresh.filter(i => i.region === 'alberta')).length;
    const policy = stories.filter(c => bearsOnDecision(c.lead) ||
                                       c.others.some(bearsOnDecision)).length;

    const sinceLabel = seen ? `since ${esc(A.fmtDate(new Date(seen).toISOString()))}` : 'in the last 7 days';
    const nothing = !pages.length && !fresh.length;

    /* Every figure is a way in. A number that cannot be followed is a
       decoration; each of these jumps to the list it counts. */
    const figures = [
      { n: stories.length, label: stories.length === 1 ? 'new story' : 'new stories',
        tone: 'accent', href: '#feed-slot', key: 'stories' },
      { n: albertan, label: 'from Alberta', tone: 'alberta', href: '#feed-alberta', key: 'alberta' },
      { n: policy, label: 'bear on a decision', tone: 'warn', href: '#feed-slot', key: 'decision' },
    ];
    if (pages.length) {
      figures.unshift({ n: pages.length, tone: 'serious', href: '#attention-slot', key: 'pages',
        label: pages.length === 1 ? 'watched page changed' : 'watched pages changed' });
    }

    $('#digest-slot').innerHTML = `
      <div class="digest ${nothing ? 'is-quiet' : ''}">
        <div class="digest-top">
          <span class="eyebrow">${seen
            ? `Since your last visit · ${esc(sinceLabel.replace('since ', ''))}`
            : 'First visit · the last 7 days'}</span>
          ${seen && !nothing
            ? `<button class="btn btn-small" id="mark-read">Mark all as read</button>` : ''}
        </div>
        ${nothing
          ? `<p class="digest-quiet">Nothing new ${esc(sinceLabel)}. The feed last refreshed
               ${esc(relTime(data.news?.generatedAt))}.</p>`
          : `<div class="digest-figures">
               ${figures.map(f => `
                 <a class="digest-fig digest-fig-${f.tone}" href="${f.href}" data-digest="${f.key}">
                   <span class="digest-n">${esc(String(f.n))}</span>
                   <span class="digest-l">${esc(f.label)} <span class="digest-go" aria-hidden="true">↓</span></span>
                 </a>`).join('')}
             </div>`}
        ${seen ? '' : `
          <div class="digest-start">
            <p>New here? This is the last week. Press <strong>Start tracking</strong> and from then on
               this page shows only what has changed since you last looked.</p>
            <button class="btn btn-primary btn-small" id="mark-read">Start tracking</button>
          </div>`}
      </div>`;
  }

  /* ------------------------------------------------------------- attention */

  function renderAttention() {
    const { pages, bulk } = alertGroups();
    if (!pages.length && !bulk.length) { $('#attention-slot').innerHTML = ''; return; }
    const cap = showAllAlerts ? 999 : 5;
    const hidden = Math.max(0, pages.length - cap);

    $('#attention-slot').innerHTML = `
      <div class="section-head">
        <h2>Needs a look</h2>
        <span class="section-note">${pages.length} watched page${pages.length === 1 ? '' : 's'}</span>
      </div>
      <p class="section-note secondary">
        A watched authority page changed content without announcing it. These are the ones that
        can move under a live file. Pages whose length changed are listed first.
      </p>
      <div class="attention-list">
        ${pages.slice(0, cap).map(({ lead: x, count }) => {
          const what = describeChange(x);
          const moved = !!parseChange(x)?.delta;
          return `
          <div class="attention-item ${moved ? 'is-moved' : ''}">
            <span class="attention-mark">${icon('alert')}</span>
            <div class="attention-body">
              <div class="attention-title">${esc(x.name)}</div>
              <div class="small muted">Changed ${esc(relTime(x.detectedAt))}${
                count > 1 ? ` · ${count} times in this period` : ''}</div>
              ${what ? `<div class="small attention-what">${esc(what)}</div>` : ''}
            </div>
            <a class="btn btn-small" href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener">
              View source ↗</a>
          </div>`; }).join('')}
      </div>
      ${hidden ? `<button class="btn btn-small attention-more" id="show-all-alerts">Show ${hidden} more</button>` : ''}
      ${bulk.length ? `
        <details class="attention-bulk">
          <summary>${bulk.length} other page${bulk.length === 1 ? '' : 's'} changed by an identical amount
            in the same check — probably not real edits</summary>
          <p class="small secondary">A change of exactly the same size across unrelated sites at the
            same moment almost always means the watcher began reading pages differently, not that
            the pages say something new. They are listed so nothing is hidden; open one if it
            matters to a live file.</p>
          <ul class="attention-bulk-list">
            ${bulk.map(({ lead: x }) => `
              <li><a href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener">${esc(x.name)}</a>
                <span class="muted">${esc(describeChange(x))} · ${esc(relTime(x.detectedAt))}</span></li>`).join('')}
          </ul>
        </details>` : ''}`;
  }

  /* ------------------------------------------------------------------ feed */

  /* Topic tags alone missed obvious regulatory news, so the title is checked
     too. This only decides whether an item gets a marker, never where it sits. */
  const REG_WORDS = /\b(regulat|bylaw|permit|approv|reject|commission|AUC|AESO|tribunal|appeal|moratorium|legislat|policy|hearing|licence|license|zoning|rezon)/i;
  const bearsOnDecision = i =>
    REG_WORDS.test(i.title || '') || isPolicyish(i);

  function clusterRow(c) {
    const i = c.lead, n = c.others.length;
    return `
      <li class="feed-item">
        <a class="headline ${isNewItem(i) ? 'is-new' : ''}"
           href="${esc(safeUrl(i.url))}" target="_blank" rel="noopener">${esc(i.title)}</a>
        <div class="feed-meta">
          ${bearsOnDecision(i) ? statusBadge('warning', 'Bears on a decision') : ''}
          <span class="muted">${esc(i.source)}</span>
          <span class="muted">${esc(relTime(i.published))}</span>
        </div>
        ${n ? `
          <details class="also">
            <summary>Also covered by ${n} other outlet${n === 1 ? '' : 's'}</summary>
            <ul class="also-list">
              ${c.others.map(o => `
                <li><a href="${esc(safeUrl(o.url))}" target="_blank" rel="noopener">${esc(o.source)}</a>
                  <span class="muted">${esc(relTime(o.published))}</span></li>`).join('')}
            </ul>
          </details>` : ''}
      </li>`;
  }

  function row(i) {
    return `
      <li class="feed-item">
        <a class="headline ${isNewItem(i) ? 'is-new' : ''}"
           href="${esc(safeUrl(i.url))}" target="_blank" rel="noopener">${esc(i.title)}</a>
        <div class="feed-meta">
          ${bearsOnDecision(i) ? statusBadge('warning', 'Bears on a decision') : ''}
          <span class="muted">${esc(i.source)}</span>
          <span class="muted">${esc(relTime(i.published))}</span>
        </div>
      </li>`;
  }

  /* Group by region, not by topic. The classifier's topic tags put a Danish
     ground-breaking under "policy" while an AUC decision on an Alberta data
     centre fell into "everything else" — which is exactly backwards for a
     planner in Alberta. Region is the reliable signal; policy relevance rides
     along as a marker on the item. */
  const GROUPS = [
    { id: 'alberta', label: 'Alberta', region: 'alberta',
      note: 'Your jurisdiction. Read these first.' },
    { id: 'canada', label: 'Rest of Canada', region: 'canada',
      note: 'Federal moves and other provinces setting precedent.' },
    { id: 'global', label: 'International', region: 'global',
      note: 'Useful for precedent, rarely urgent.' },
  ];

  function renderFeed() {
    const matches = c => !onlyDecision || bearsOnDecision(c.lead) || c.others.some(bearsOnDecision);
    const fresh = freshItems().slice().sort(byRegionThenDate);

    if (!fresh.length) {
      $('#feed-slot').innerHTML = `
        <div class="section-head"><h2>New items</h2></div>
        <div class="empty-state">
          Nothing new since you last looked. <a href="context.html#library">Browse the reference
          library</a> or <a href="permits.html">open a review</a>.
        </div>`;
      return;
    }

    const blocks = GROUPS.map(g => {
      const list = cluster(fresh.filter(i => i.region === g.region)).filter(matches);
      if (!list.length) return '';
      // International is background: show a few unless asked for everything.
      const cap = showAll ? 999 : (g.id === 'global' ? 3 : 8);
      const hidden = Math.max(0, list.length - cap);
      return `
        <div class="feed-block" id="feed-${esc(g.id)}" data-region="${esc(g.region)}">
          <h3 class="feed-block-title">
            ${esc(g.label)}
            <span class="feed-block-count">${list.length}</span>
          </h3>
          <p class="small secondary feed-block-note">${esc(g.note)}</p>
          <ul class="feed ${g.id === 'global' ? 'feed-compact' : ''}">
            ${list.slice(0, cap).map(clusterRow).join('')}
          </ul>
          ${hidden ? `<p class="small muted feed-more">${hidden} more ${hidden === 1 ? 'story' : 'stories'} not shown</p>` : ''}
        </div>`;
    }).join('');

    const total = fresh.length;
    const capped = fresh.length > (showAll ? 999 : 11);
    const shown = cluster(fresh).filter(matches).length;

    $('#feed-slot').innerHTML = `
      <div class="section-head">
        <h2>${seen ? 'New since your last visit' : 'The last 7 days'}</h2>
        <span class="section-note">${onlyDecision
          ? `${shown} of ${cluster(fresh).length} stories`
          : `${cluster(fresh).length} stories · ${total} items`}</span>
      </div>
      <div class="feed-filter" role="group" aria-label="Filter stories">
        <button class="chip-btn ${onlyDecision ? '' : 'is-on'}" data-feed-filter="all"
                aria-pressed="${!onlyDecision}">Everything</button>
        <button class="chip-btn ${onlyDecision ? 'is-on' : ''}" data-feed-filter="decision"
                aria-pressed="${onlyDecision}">Bears on a decision</button>
      </div>
      ${blocks || '<div class="empty-state">Nothing in this period bears on a decision.</div>'}
      ${capped && !showAll ? `<button class="btn" id="show-all">Show every story</button>` : ''}`;
  }

  /* -------------------------------------------------------------- standing */

  function renderStanding() {
    const g = data.grid;
    if (!g?.verified) { $('#standing-slot').innerHTML = ''; return; }
    const v = g.verified, reg = g.fromRegulation, rep = g.reported;

    $('#standing-slot').innerHTML = `
      <div class="section-head">
        <h2>Standing constraints</h2>
        <a class="small" href="rules.html">Full rules &amp; requirements →</a>
      </div>
      <p class="section-note secondary">
        These change rarely. They are here so you do not have to go looking for them.
      </p>
      <div class="standing-row">
        <div class="standing-tile is-primary">
          <div class="standing-value">${esc(fmtNum(v.interimCapMW))}<span class="unit">MW</span></div>
          <div class="standing-label">Interim connection cap${v.allocatedMW >= v.interimCapMW ? ', fully allocated' : ''}</div>
          <div class="standing-foot">Through ${esc(v.capThrough)} · ${tierChip(v.sourceTier)}</div>
        </div>
        <div class="standing-tile">
          <div class="standing-value">${esc(fmtNum(reg.largeDataCentreThresholdMW))}<span class="unit">MW</span></div>
          <div class="standing-label">Large data centre threshold</div>
          <div class="standing-foot">Data Centre Regulation</div>
        </div>
        <div class="standing-tile">
          <div class="standing-value">${esc(reg.bridgedMaxYears)}<span class="unit">yrs</span></div>
          <div class="standing-label">Bridged access limit</div>
          <div class="standing-foot">Then the connection lapses</div>
        </div>
        <div class="standing-tile is-muted">
          <div class="standing-value">~${esc(fmtNum(rep.queueProjects))}</div>
          <div class="standing-label">Projects reported in the queue</div>
          <div class="standing-foot">${statusBadge('warning', 'Not confirmed by AESO')}</div>
        </div>
      </div>`;
  }

  /* ------------------------------------------------------------------ next */

  function renderNext() {
    $('#next-slot').innerHTML = `
      <div class="section-head"><h2>Go to</h2></div>
      <div class="next-grid">
        <a class="next-card" href="permits.html">
          <span class="next-icon">${icon('permits')}</span>
          <span class="next-title">Review an application</span>
          <span class="next-blurb">Enter a project's parameters and see the regulations it engages,
            area by area.</span>
        </a>
        <a class="next-card" href="rules.html">
          <span class="next-icon">${icon('policy')}</span>
          <span class="next-title">Rules &amp; requirements</span>
          <span class="next-blurb">The framework in force and the municipal comparison — what a
            rule actually says, with its source.</span>
        </a>
        <a class="next-card" href="context.html">
          <span class="next-icon">${icon('library')}</span>
          <span class="next-title">Context &amp; research</span>
          <span class="next-blurb">Precedent jurisdictions, site design guidance, technology
            trends and sources.</span>
        </a>
      </div>`;
  }

  /* A count, not the whole tracker. The full table is one click away. */
  async function renderTrackerSummary() {
    const el = $('#tracker-summary');
    if (!el) return;
    const proj = await A.loadData('projects', null);
    if (!proj) { el.innerHTML = ''; return; }
    const c = (proj.confirmed || []).length, r = (proj.reported || []).length;
    el.innerHTML = `
      <div class="tracker-tally">
        <span><strong>${c}</strong> confirmed by a primary source</span>
        <span><strong>${r}</strong> reported, unconfirmed</span>
      </div>`;
  }

  function renderAll() {
    renderDigest();
    renderTrackerSummary();
    renderAttention();
    renderFeed();
    renderStanding();
    renderNext();
  }

  function wire() {
    document.addEventListener('click', e => {
      if (e.target.closest('#mark-read')) {
        A.markSeen();
        seen = A.lastSeenAt();
        renderAll();
        return;
      }
      if (e.target.closest('#show-all')) { showAll = true; renderFeed(); return; }
      if (e.target.closest('#show-all-alerts')) { showAllAlerts = true; renderAttention(); return; }
      const ff = e.target.closest('[data-feed-filter]');
      if (ff) { onlyDecision = ff.dataset.feedFilter === 'decision'; renderFeed(); return; }
      // The digest figures are plain anchors, so they work without this. The
      // one that counts decision-relevant stories also narrows the feed to
      // them, and "from Alberta" may have no block to land on.
      const fig = e.target.closest('[data-digest]');
      if (fig) {
        const want = fig.dataset.digest === 'decision';
        if (want !== onlyDecision && (want || fig.dataset.digest === 'stories')) {
          onlyDecision = want; renderFeed();
        }
        if (!document.querySelector(fig.getAttribute('href'))) {
          e.preventDefault(); $('#feed-slot')?.scrollIntoView();
        }
      }
    });
  }

  async function init() {
    const [news, alerts, grid] = await Promise.all([
      A.loadData('news', { items: [], sourceHealth: [] }),
      A.loadData('alerts', { alerts: [] }),
      A.loadData('grid', null),
    ]);
    data = { news, alerts, grid };
    seen = A.lastSeenAt();
    A.renderLiveStatus(news);
    renderAll();
    wire();
    C?.wireVizToggles?.();
  }

  window.ADCHWhatChanged = { init };
  document.addEventListener('DOMContentLoaded', init);
})();
