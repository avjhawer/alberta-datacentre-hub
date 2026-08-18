/* Extracted from the original news.html so the merged pages can compose it.
   Slot ids namespaced where they collided across pages. */
(async function () {
  const A = window.ADCH;
  const { $: $raw, $$, esc, safeUrl, relTime, tierChip, regionChip, REGION_LABEL } = A;
  /* Merged pages may not contain every slot this module knows about. Resolve
     misses to a detached node so a write is a harmless no-op rather than a
     crash that takes the rest of the page down with it. */
  const $ = sel => $raw(sel) || document.createElement('div');


  let news = await A.loadData('news', { items: [], sourceHealth: [] });
  A.renderLiveStatus(news);

  const STREAMS = ['policy', 'regulation', 'projects', 'municipal', 'technology', 'market', 'news'];
  const state = { q: '', regions: new Set(), streams: new Set() };
  const seen = A.lastSeenAt();

  function items() { return Array.isArray(news?.items) ? news.items : []; }

  function filtered() {
    const q = state.q.toLowerCase();
    return items().filter(i => {
      if (state.regions.size && !state.regions.has(i.region)) return false;
      if (state.streams.size && !state.streams.has(i.stream)) return false;
      if (q && !(`${i.title} ${i.summary || ''} ${i.source || ''}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }

  function countBy(key, val) { return items().filter(i => i[key] === val).length; }

  function renderChips() {
    $('#region-chips').innerHTML = Object.keys(REGION_LABEL).map(r => `
      <button class="filter-chip" data-kind="region" data-val="${esc(r)}"
              aria-pressed="${state.regions.has(r)}">
        ${esc(REGION_LABEL[r])} <span class="count">${countBy('region', r)}</span>
      </button>`).join(' ');

    $('#stream-chips').innerHTML = STREAMS
      .filter(s => countBy('stream', s) > 0)
      .map(s => `
        <button class="filter-chip" data-kind="stream" data-val="${esc(s)}"
                aria-pressed="${state.streams.has(s)}">
          ${esc(s[0].toUpperCase() + s.slice(1))} <span class="count">${countBy('stream', s)}</span>
        </button>`).join(' ');
  }

  function render() {
    const list = filtered();
    $('#result-count').textContent =
      `${list.length} of ${items().length} item${items().length === 1 ? '' : 's'}`;

    $('#feed-slot').innerHTML = list.length ? `
      <ul class="feed">
        ${list.map(i => `
          <li class="feed-item">
            <a class="headline ${A.isNew(i, seen) ? 'is-new' : ''}"
               href="${esc(safeUrl(i.url))}" target="_blank" rel="noopener">${esc(i.title)}</a>
            ${i.summary ? `<p class="summary">${esc(i.summary)}</p>` : ''}
            <div class="feed-meta">
              ${regionChip(i.region)}
              <span>${esc(i.source || '')}</span>
              <span>·</span><span>${esc(relTime(i.published))}</span>
              ${tierChip(i.tier || 'reported')}
              ${i.breaking ? '<span class="chip" style="color:var(--status-critical);border-color:currentColor">Breaking</span>' : ''}
            </div>
          </li>`).join('')}
      </ul>` : `
      <div class="empty-state">
        ${items().length
          ? 'No items match these filters.'
          : '<p>The news feed has not run yet.</p><p class="small">It refreshes every three hours once deployed.</p>'}
      </div>`;
  }

  function renderHealth() {
    const h = Array.isArray(news?.sourceHealth) ? news.sourceHealth : [];
    if (!h.length) {
      // Returning early here used to leave "Loading…" on screen forever.
      $('#health-slot').innerHTML = `
        <div class="empty-state">
          No source health recorded yet. It is written by the ingestion run, which fires every
          three hours once deployed.
        </div>`;
      return;
    }
    $('#health-slot').innerHTML = `
      <div class="table-wrap">
        <table class="data responsive-cards">
          <thead><tr><th>Source</th><th>Status</th><th class="num">Items</th><th>Detail</th></tr></thead>
          <tbody>
            ${h.map(s => `
              <tr>
                <td data-label="Source">${esc(s.name)}</td>
                <td data-label="Status">${A.statusBadge(s.ok ? 'good' : 'critical', s.ok ? 'OK' : 'Failed')}</td>
                <td class="num" data-label="Items">${esc(s.count ?? 0)}</td>
                <td data-label="Detail" class="secondary">${esc(s.error || '')}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  $('#filters').addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-chip');
    if (!btn) return;
    const set = btn.dataset.kind === 'region' ? state.regions : state.streams;
    const v = btn.dataset.val;
    set.has(v) ? set.delete(v) : set.add(v);
    btn.setAttribute('aria-pressed', String(set.has(v)));
    render();
  });

  $('#q').addEventListener('input', (e) => { state.q = e.target.value.trim(); render(); });

  renderChips(); render(); renderHealth();
  A.markSeen();

  A.startLiveRefresh((fresh) => { news = fresh; renderChips(); render(); renderHealth(); });
})();
