/* Extracted from the original policy.html so the merged pages can compose it.
   Slot ids namespaced where they collided across pages. */
(async function () {
  const A = window.ADCH;
  const { $: $raw, esc, safeUrl, fmtDate, relTime, tierChip, regionChip, REGION_LABEL } = A;
  /* Merged pages may not contain every slot this module knows about. Resolve
     misses to a detached node so a write is a harmless no-op rather than a
     crash that takes the rest of the page down with it. */
  const $ = sel => $raw(sel) || document.createElement('div');


  const [policy, news] = await Promise.all([
    A.loadData('policy', null),
    A.loadData('news', { items: [] }),
  ]);
  A.renderLiveStatus(news);

  if (!policy) {
    $('#main').innerHTML = '<div class="empty-state">Policy data unavailable.</div>';
    return;
  }

  /* --- Four commitments ------------------------------------------------- */
  const c = policy.commitments;
  if (c) {
    $('#commit-note').textContent = c.note;
    $('#commit-src').innerHTML =
      `${tierChip(c.sourceTier)} <a href="${esc(safeUrl(c.source))}" target="_blank" rel="noopener">${esc(c.sourceName)} ↗</a>`;
    $('#commit-slot').innerHTML = c.items.map((i, n) => `
      <div class="stat">
        <div class="eyebrow">Commitment ${n + 1}</div>
        <div style="font-weight:600">${esc(i.label)}</div>
        <div class="small secondary">${esc(i.detail)}</div>
      </div>`).join('');
  }

  /* --- Approvals pathway ------------------------------------------------ */
  const p = policy.pathway;
  if (p) {
    $('#pathway-note').textContent = p.note;
    $('#pathway-src').innerHTML =
      `<a href="${esc(safeUrl(p.source))}" target="_blank" rel="noopener">${esc(p.sourceName)} ↗</a>`;
    $('#pathway-slot').innerHTML = `
      <div class="grid grid-3" style="gap:var(--s-2)">
        ${p.steps.map(s => `<div class="chip" style="justify-content:flex-start">${esc(s)}</div>`).join('')}
      </div>`;
  }

  /* --- Timeline --------------------------------------------------------- */
  const records = (policy.records || []).slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const state = { q: '', regions: new Set() };

  const STATUS_MAP = {
    'in-force': ['good', 'In force'],
    'upcoming': ['warning', 'Upcoming'],
    'closed':   ['neutral', 'Closed'],
    'proposed': ['warning', 'Proposed'],
  };

  $('#region-chips').innerHTML = Object.keys(REGION_LABEL).map(r => {
    const n = records.filter(x => x.region === r).length;
    return n ? `<button class="filter-chip" data-val="${esc(r)}" aria-pressed="false">
        ${esc(REGION_LABEL[r])} <span class="count">${n}</span></button>` : '';
  }).join(' ');

  function render() {
    const q = state.q.toLowerCase();
    const list = records.filter(r => {
      if (state.regions.size && !state.regions.has(r.region)) return false;
      if (q && !`${r.title} ${r.summary} ${r.jurisdiction} ${r.type}`.toLowerCase().includes(q)) return false;
      return true;
    });

    $('#count').textContent = `${list.length} of ${records.length} records`;

    $('#timeline-slot').innerHTML = list.length ? list.map(r => {
      const [badge, label] = STATUS_MAP[r.status] || ['neutral', r.status];
      return `
      <li class="timeline-item ${r.status === 'upcoming' ? 'is-upcoming' : ''}">
        <div class="timeline-date">${esc(fmtDate(r.date))} · ${esc(r.jurisdiction)} · ${esc(r.type)}</div>
        <h4>${esc(r.title)}</h4>
        <div class="feed-meta" style="margin-bottom:var(--s-2)">
          ${A.statusBadge(badge, label)}
          ${r.effective ? `<span class="chip">Effective ${esc(fmtDate(r.effective))}</span>` : ''}
          ${regionChip(r.region)}
          ${tierChip(r.sourceTier)}
        </div>
        <p>${esc(r.summary)}</p>
        ${r.keyPoints?.length ? `<ul class="small secondary" style="margin:0 0 var(--s-2);padding-left:1.1em">
          ${r.keyPoints.map(k => `<li>${esc(k)}</li>`).join('')}</ul>` : ''}
        ${r.relevance ? `<div class="notice" style="margin:0 0 var(--s-2)">
          <strong>Why it matters for a DP review:</strong> ${esc(r.relevance)}</div>` : ''}
        <a class="small" href="${esc(safeUrl(r.source))}" target="_blank" rel="noopener">
          Verify at source — ${esc(r.sourceName)} ↗</a>
      </li>`;
    }).join('') : '<div class="empty-state">No records match these filters.</div>';
  }

  $('#region-chips').addEventListener('click', (e) => {
    const b = e.target.closest('.filter-chip');
    if (!b) return;
    const v = b.dataset.val;
    state.regions.has(v) ? state.regions.delete(v) : state.regions.add(v);
    b.setAttribute('aria-pressed', String(state.regions.has(v)));
    render();
  });
  $('#q').addEventListener('input', e => { state.q = e.target.value.trim(); render(); });

  render();

  /* --- Live layer: policy + regulation items from the feed -------------- */
  function renderLive(feed) {
    const live = (feed.items || [])
      .filter(i => i.stream === 'policy' || i.stream === 'regulation')
      .slice(0, 15);
    $('#policy-live-slot').innerHTML = live.length ? `
      <ul class="feed">${live.map(i => `
        <li class="feed-item">
          <a class="headline" href="${esc(safeUrl(i.url))}" target="_blank" rel="noopener">${esc(i.title)}</a>
          <div class="feed-meta">${regionChip(i.region)}<span>${esc(i.source)}</span>
            <span>·</span><span>${esc(relTime(i.published))}</span>${tierChip(i.tier || 'reported')}</div>
        </li>`).join('')}</ul>` : `
      <div class="empty-state">No live policy items yet — the feed refreshes every three hours.</div>`;
  }
  renderLive(news);

  A.registerPaletteItems(records.map(r => ({ label: r.title, kind: 'Policy', href: 'rules.html#framework' })));
  A.startLiveRefresh(renderLive);
})();
