/* Extracted from the original municipal.html so the merged pages can compose it.
   Slot ids namespaced where they collided across pages. */
(async function () {
  const A = window.ADCH;
  const { $: $raw, esc, safeUrl, relTime, tierChip, regionChip } = A;
  /* Merged pages may not contain every slot this module knows about. Resolve
     misses to a detached node so a write is a harmless no-op rather than a
     crash that takes the rest of the page down with it. */
  const $ = sel => $raw(sel) || document.createElement('div');


  const [muni, news] = await Promise.all([
    A.loadData('municipalities', null),
    A.loadData('news', { items: [] }),
  ]);
  A.renderLiveStatus(news);

  if (!muni) { $('#main').innerHTML = '<div class="empty-state">Municipal data unavailable.</div>'; return; }

  const cols = muni.columns;
  const rows = muni.municipalities;
  let q = '';

  $('#matrix-head').innerHTML =
    `<th class="sortable">Municipality</th>` +
    cols.map(c => `<th>${esc(c.label)}</th>`).join('');

  function cell(v) {
    if (!v) return `<span class="muted small">Needs research</span>`;
    const badge = A.statusBadge(v.status || 'neutral', v.value);
    return v.detail
      ? `<span title="${esc(v.detail)}">${badge}</span>`
      : badge;
  }

  function render() {
    const list = rows.filter(m =>
      !q || `${m.name} ${m.area} ${m.regulations} ${m.notes}`.toLowerCase().includes(q));

    $('#count').textContent = `${list.length} of ${rows.length} municipalities`;

    $('#matrix-body').innerHTML = list.map(m => `
      <tr>
        <td data-label="Municipality">
          <strong>${esc(m.name)}</strong>
          ${m.priority ? '<span class="chip" style="margin-left:6px">Primary</span>' : ''}
          <div class="small muted">${esc(m.area)}</div>
        </td>
        ${cols.map(c => `<td data-label="${esc(c.label)}">${cell(m[c.key])}</td>`).join('')}
      </tr>`).join('');

    $('#municipal-detail-slot').innerHTML = list.map(m => `
      <div class="card">
        <div class="card-head">
          <h3>${esc(m.name)}</h3>
          <div class="card-action">${tierChip(m.sourceTier)}</div>
        </div>
        ${m.regulations ? `<p class="small"><strong>Governing text:</strong> ${esc(m.regulations)}</p>` : ''}
        ${m.notes ? `<p class="small secondary">${esc(m.notes)}</p>` : ''}
        <dl class="deflist">
          ${cols.filter(c => m[c.key]?.detail).map(c => `
            <div><dt>${esc(c.label)}</dt><dd>${esc(m[c.key].detail)}</dd></div>`).join('')}
        </dl>
        <p class="small" style="margin:var(--s-3) 0 0">
          <a href="${esc(safeUrl(m.source))}" target="_blank" rel="noopener">Verify at source — ${esc(m.sourceName)} ↗</a>
          ${(m.extraLinks || []).map(l =>
            ` · <a href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join('')}
        </p>
      </div>`).join('');
  }

  $('#q').addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); render(); });

  render();
  A.makeSortable($('#matrix'));
  A.registerPaletteItems(rows.map(m => ({ label: m.name, kind: 'Municipality', href: 'municipal.html' })));

  function renderLive(feed) {
    const live = (feed.items || []).filter(i => i.stream === 'municipal').slice(0, 12);
    $('#municipal-live-slot').innerHTML = live.length ? `
      <ul class="feed">${live.map(i => `
        <li class="feed-item">
          <a class="headline" href="${esc(safeUrl(i.url))}" target="_blank" rel="noopener">${esc(i.title)}</a>
          <div class="feed-meta">${regionChip(i.region)}<span>${esc(i.source)}</span>
            <span>·</span><span>${esc(relTime(i.published))}</span>${tierChip(i.tier || 'reported')}</div>
        </li>`).join('')}</ul>` : `
      <div class="empty-state">No municipal items yet — the feed refreshes every three hours.</div>`;
  }
  renderLive(news);
  A.startLiveRefresh(renderLive);
})();
