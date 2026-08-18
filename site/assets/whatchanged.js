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

  const isNewItem = i => A.isNew(i, seen);
  const byRegionThenDate = (a, b) =>
    (REGION_RANK[a.region] ?? 3) - (REGION_RANK[b.region] ?? 3) ||
    (A.parseDate(b.published) - A.parseDate(a.published));

  const isPolicyish = i =>
    /policy|regulation|grid|legal/i.test([i.stream, i.topic, ...(i.topics || [])].join(' '));

  /* ---------------------------------------------------------------- digest */

  function renderDigest() {
    const items = data.news?.items || [];
    const alerts = data.alerts?.alerts || [];
    const fresh = seen ? items.filter(isNewItem) : items.slice(0, 25);
    const albertan = fresh.filter(i => i.region === 'alberta').length;
    const policy = fresh.filter(bearsOnDecision).length;

    const when = seen
      ? `since ${esc(A.fmtDate(new Date(seen).toISOString()))}`
      : 'in the current feed';

    const nothing = !alerts.length && !fresh.length;

    $('#digest-slot').innerHTML = `
      <div class="digest ${nothing ? 'is-quiet' : ''}">
        <div class="digest-main">
          <div class="eyebrow">${seen ? 'Since your last visit' : 'First visit'}</div>
          ${nothing
            ? `<p class="digest-line">Nothing new ${when}. The feed last refreshed
                 ${esc(relTime(data.news?.generatedAt))}.</p>`
            : `<p class="digest-line">
                 ${alerts.length ? `<strong class="digest-alert">${alerts.length} regulatory
                   ${alerts.length === 1 ? 'change' : 'changes'} detected</strong> · ` : ''}
                 <strong>${fresh.length}</strong> new ${fresh.length === 1 ? 'item' : 'items'} ${when}
                 ${albertan ? ` · <strong>${albertan}</strong> from Alberta` : ''}
                 ${policy ? ` · <strong>${policy}</strong> bearing on a decision` : ''}
               </p>`}
        </div>
        ${seen && (alerts.length || fresh.length)
          ? `<button class="btn btn-small" id="mark-read">Mark all as read</button>` : ''}
      </div>`;
  }

  /* ------------------------------------------------------------- attention */

  function renderAttention() {
    const alerts = data.alerts?.alerts || [];
    if (!alerts.length) { $('#attention-slot').innerHTML = ''; return; }

    $('#attention-slot').innerHTML = `
      <div class="section-head">
        <h2>Needs a look</h2>
      </div>
      <p class="section-note secondary">
        A watched authority page changed content without announcing it. These are the ones that
        can move under a live file.
      </p>
      <div class="attention-list">
        ${alerts.slice(0, 5).map(x => `
          <div class="attention-item">
            <span class="attention-mark">${icon('alert')}</span>
            <div class="attention-body">
              <div class="attention-title">${esc(x.name)}</div>
              <div class="small muted">Changed ${esc(relTime(x.detectedAt))}</div>
            </div>
            <a class="btn btn-small" href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener">
              View source ↗</a>
          </div>`).join('')}
      </div>`;
  }

  /* ------------------------------------------------------------------ feed */

  /* Topic tags alone missed obvious regulatory news, so the title is checked
     too. This only decides whether an item gets a marker, never where it sits. */
  const REG_WORDS = /\b(regulat|bylaw|permit|approv|reject|commission|AUC|AESO|tribunal|appeal|moratorium|legislat|policy|hearing|licence|license|zoning|rezon)/i;
  const bearsOnDecision = i =>
    REG_WORDS.test(i.title || '') || isPolicyish(i);

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
    const items = data.news?.items || [];
    const fresh = (seen ? items.filter(isNewItem) : items).sort(byRegionThenDate);

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
      const list = fresh.filter(i => i.region === g.region);
      if (!list.length) return '';
      // International is background: show a few unless asked for everything.
      const cap = showAll ? 999 : (g.id === 'global' ? 3 : 8);
      const hidden = Math.max(0, list.length - cap);
      return `
        <div class="feed-block">
          <h3 class="feed-block-title">
            ${regionChip(g.region)} ${esc(g.label)}
            <span class="feed-block-count">${list.length}</span>
          </h3>
          <p class="small secondary feed-block-note">${esc(g.note)}</p>
          <ul class="feed ${g.id === 'global' ? 'feed-compact' : ''}">
            ${list.slice(0, cap).map(row).join('')}
          </ul>
          ${hidden ? `<p class="small muted feed-more">${hidden} more not shown</p>` : ''}
        </div>`;
    }).join('');

    const total = fresh.length;
    const capped = fresh.length > (showAll ? 999 : 11);

    $('#feed-slot').innerHTML = `
      <div class="section-head">
        <h2>New since your last visit</h2>
        <span class="section-note">${total} item${total === 1 ? '' : 's'}</span>
      </div>
      ${blocks}
      ${capped && !showAll ? `<button class="btn" id="show-all">Show all ${total} items</button>` : ''}`;
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
          <span class="next-blurb">The framework in force, the municipal matrix, and the use class
            ambiguities behind it.</span>
        </a>
        <a class="next-card" href="context.html">
          <span class="next-icon">${icon('library')}</span>
          <span class="next-title">Context &amp; research</span>
          <span class="next-blurb">Precedent jurisdictions, site design guidance, technology
            trends and sources.</span>
        </a>
      </div>`;
  }

  function renderAll() {
    renderDigest();
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
      if (e.target.closest('#show-all')) { showAll = true; renderFeed(); }
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
