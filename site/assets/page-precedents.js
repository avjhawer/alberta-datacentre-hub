/* Extracted from the original precedents.html so the merged pages can compose it.
   Slot ids namespaced where they collided across pages. */
(async function () {
  const A = window.ADCH;
  const { $: $raw, esc, safeUrl, regionChip } = A;
  /* Merged pages may not contain every slot this module knows about. Resolve
     misses to a detached node so a write is a harmless no-op rather than a
     crash that takes the rest of the page down with it. */
  const $ = sel => $raw(sel) || document.createElement('div');


  const [prec, news] = await Promise.all([
    A.loadData('precedents', null),
    A.loadData('news', { items: [] }),
  ]);
  A.renderLiveStatus(news);

  if (!prec) { $('#main').innerHTML = '<div class="empty-state">Precedent data unavailable.</div>'; return; }

  $('#intro').textContent = prec.intro;

  $('#juris-slot').innerHTML = (prec.jurisdictions || []).map(j => `
    <div class="card">
      <div class="card-head">
        <h3>${esc(j.name)}</h3>
        <div class="card-action">${regionChip(j.region)}</div>
      </div>
      <p class="secondary">${esc(j.why)}</p>
      ${j.lessons?.length ? `
        <div class="eyebrow" style="margin-bottom:var(--s-2)">What it settled</div>
        <ul class="small" style="margin:0 0 var(--s-3);padding-left:1.1em">
          ${j.lessons.map(l => `<li>${esc(l)}</li>`).join('')}
        </ul>` : ''}
      <div class="grid" style="gap:var(--s-2)">
        ${(j.links || []).map(l => `
          <div>
            <a class="small" href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>
            ${l.fromBookmarks ? '<span class="chip" style="margin-left:6px">From your research</span>' : ''}
            ${l.note ? `<div class="small muted">${esc(l.note)}</div>` : ''}
          </div>`).join('')}
      </div>
    </div>`).join('');

  $('#research-slot').innerHTML = (prec.research || []).map(r => `
    <div class="card">
      <div class="card-head">
        <h3>${esc(r.title)}</h3>
        <div class="card-action">${regionChip(r.region)}</div>
      </div>
      <div class="feed-meta" style="margin-bottom:var(--s-2)">
        <span class="chip">${esc(r.topic)}</span>
        <span class="small muted">${esc(r.publisher)}</span>
        ${r.fromBookmarks ? '<span class="chip">From your research</span>' : ''}
      </div>
      <p class="small secondary">${esc(r.why)}</p>
      <a class="small" href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener">Read ↗</a>
    </div>`).join('');

  A.registerPaletteItems([
    ...(prec.jurisdictions || []).map(j => ({ label: j.name, kind: 'Precedent', href: 'precedents.html' })),
    ...(prec.research || []).map(r => ({ label: r.title, kind: 'Research', href: 'precedents.html' })),
  ]);
})();
