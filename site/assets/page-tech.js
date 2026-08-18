/* Extracted from the original tech.html so the merged pages can compose it.
   Slot ids namespaced where they collided across pages. */
(async function () {
  const A = window.ADCH;
  const { $: $raw, esc, safeUrl, relTime, tierChip, regionChip } = A;
  /* Merged pages may not contain every slot this module knows about. Resolve
     misses to a detached node so a write is a harmless no-op rather than a
     crash that takes the rest of the page down with it. */
  const $ = sel => $raw(sel) || document.createElement('div');


  const [tech, news] = await Promise.all([
    A.loadData('tech', null),
    A.loadData('news', { items: [] }),
  ]);
  A.renderLiveStatus(news);

  if (!tech) { $('#main').innerHTML = '<div class="empty-state">Technology data unavailable.</div>'; return; }

  $('#intro').textContent = tech.intro;

  const trends = tech.trends || [];
  const topics = [...new Set(trends.map(t => t.topic))];
  const state = { q: '', topics: new Set() };

  $('#topic-chips').innerHTML = topics.map(t => `
    <button class="filter-chip" data-val="${esc(t)}" aria-pressed="false">
      ${esc(t)} <span class="count">${trends.filter(x => x.topic === t).length}</span>
    </button>`).join(' ');

  function render() {
    const list = trends.filter(t => {
      if (state.topics.size && !state.topics.has(t.topic)) return false;
      if (state.q && !`${t.title} ${t.summary} ${t.planningImplication}`.toLowerCase().includes(state.q)) return false;
      return true;
    });

    $('#count').textContent = `${list.length} of ${trends.length} trends`;

    $('#trend-slot').innerHTML = list.length ? list.map(t => `
      <div class="card">
        <div class="card-head">
          <h4>${esc(t.title)}</h4>
          <div class="card-action"><span class="chip">${esc(t.topic)}</span></div>
        </div>
        <div class="small muted" style="margin-bottom:var(--s-2)">${esc(t.maturity)}</div>
        <p class="small">${esc(t.summary)}</p>
        <div class="notice" style="margin:0">
          <strong>What it changes for a DP review:</strong> ${esc(t.planningImplication)}
        </div>
        ${(t.links || []).length ? `<p class="small" style="margin:var(--s-3) 0 0">
          ${t.links.map(l => `<a href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>
            ${l.fromBookmarks ? '<span class="chip" style="margin-left:6px">From your research</span>' : ''}`).join(' · ')}
        </p>` : ''}
      </div>`).join('') : '<div class="empty-state">No trends match these filters.</div>';
  }

  $('#topic-chips').addEventListener('click', e => {
    const b = e.target.closest('.filter-chip');
    if (!b) return;
    const v = b.dataset.val;
    state.topics.has(v) ? state.topics.delete(v) : state.topics.add(v);
    b.setAttribute('aria-pressed', String(state.topics.has(v)));
    render();
  });
  $('#q').addEventListener('input', e => { state.q = e.target.value.trim().toLowerCase(); render(); });

  render();
  A.registerPaletteItems(trends.map(t => ({ label: t.title, kind: 'Technology', href: 'context.html#tech' })));

  function renderLive(feed) {
    const live = (feed.items || []).filter(i => i.stream === 'technology').slice(0, 12);
    $('#tech-live-slot').innerHTML = live.length ? `
      <ul class="feed">${live.map(i => `
        <li class="feed-item">
          <a class="headline" href="${esc(safeUrl(i.url))}" target="_blank" rel="noopener">${esc(i.title)}</a>
          <div class="feed-meta">${regionChip(i.region)}<span>${esc(i.source)}</span>
            <span>·</span><span>${esc(relTime(i.published))}</span>${tierChip(i.tier || 'reported')}</div>
        </li>`).join('')}</ul>` : `
      <div class="empty-state">No technology coverage yet — the feed refreshes every three hours.</div>`;
  }
  renderLive(news);
  A.startLiveRefresh(renderLive);
})();
