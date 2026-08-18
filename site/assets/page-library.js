/* Extracted from the original library.html so the merged pages can compose it.
   Slot ids namespaced where they collided across pages. */
(async function () {
  const A = window.ADCH;
  const { $: $raw, esc, safeUrl, tierChip } = A;
  /* Merged pages may not contain every slot this module knows about. Resolve
     misses to a detached node so a write is a harmless no-op rather than a
     crash that takes the rest of the page down with it. */
  const $ = sel => $raw(sel) || document.createElement('div');


  const [lib, news] = await Promise.all([
    A.loadData('library', null),
    A.loadData('news', { items: [] }),
  ]);
  A.renderLiveStatus(news);

  if (!lib) { $('#main').innerHTML = '<div class="empty-state">Library unavailable.</div>'; return; }

  const state = { q: '', primaryOnly: false, bookmarksOnly: false };

  function render() {
    let shown = 0, total = 0;

    const html = (lib.groups || []).map(g => {
      const links = (g.links || []).filter(l => {
        total++;
        if (state.primaryOnly && l.tier !== 'primary') return false;
        if (state.bookmarksOnly && !l.fromBookmarks) return false;
        if (state.q && !`${l.label} ${l.note || ''} ${g.title}`.toLowerCase().includes(state.q)) return false;
        shown++;
        return true;
      });
      if (!links.length) return '';
      return `
        <section class="section">
          <div class="section-head">
            <h2>${esc(g.title)}</h2>
            <span class="section-note">${links.length} link${links.length === 1 ? '' : 's'}</span>
          </div>
          ${g.note ? `<p class="secondary small" style="margin-bottom:var(--s-3)">${esc(g.note)}</p>` : ''}
          <div class="card">
            <ul class="feed">
              ${links.map(l => `
                <li class="feed-item">
                  <a class="headline" href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>
                  ${l.note ? `<p class="summary">${esc(l.note)}</p>` : ''}
                  <div class="feed-meta">
                    ${tierChip(l.tier)}
                    ${l.fromBookmarks ? '<span class="chip">From your research</span>' : ''}
                    <span class="small muted">${esc(new URL(safeUrl(l.url)).hostname)}</span>
                  </div>
                </li>`).join('')}
            </ul>
          </div>
        </section>`;
    }).join('');

    $('#groups-slot').innerHTML = html || '<div class="empty-state">Nothing matches these filters.</div>';
    $('#count').textContent = `${shown} of ${total} links`;
  }

  $('#q').addEventListener('input', e => { state.q = e.target.value.trim().toLowerCase(); render(); });
  $('#only-primary').addEventListener('click', e => {
    state.primaryOnly = !state.primaryOnly;
    e.currentTarget.setAttribute('aria-pressed', String(state.primaryOnly));
    render();
  });
  $('#only-bookmarks').addEventListener('click', e => {
    state.bookmarksOnly = !state.bookmarksOnly;
    e.currentTarget.setAttribute('aria-pressed', String(state.bookmarksOnly));
    render();
  });

  render();

  A.registerPaletteItems((lib.groups || []).flatMap(g =>
    (g.links || []).map(l => ({ label: l.label, kind: 'Reference', href: 'library.html' }))));
})();
