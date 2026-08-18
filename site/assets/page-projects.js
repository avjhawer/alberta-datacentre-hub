/* Extracted from the original projects.html so the merged pages can compose it.
   Slot ids namespaced where they collided across pages. */
(async function () {
  const A = window.ADCH;
  const { $: $raw, esc, safeUrl, fmtNum, fmtDate, relTime, tierChip, regionChip } = A;
  /* Merged pages may not contain every slot this module knows about. Resolve
     misses to a detached node so a write is a harmless no-op rather than a
     crash that takes the rest of the page down with it. */
  const $ = sel => $raw(sel) || document.createElement('div');


  const [proj, news] = await Promise.all([
    A.loadData('projects', { confirmed: [], reported: [] }),
    A.loadData('news', { items: [] }),
  ]);
  A.renderLiveStatus(news);

  const rows = proj.confirmed || [];
  let q = '';

  function render() {
    const list = rows.filter(p =>
      !q || `${p.name} ${p.proponent} ${p.municipality} ${p.recordType}`.toLowerCase().includes(q));

    $('#count').textContent = `${list.length} of ${rows.length} confirmed records`;

    $('#proj-body').innerHTML = list.length ? list.map(p => `
      <tr>
        <td data-label="Name"><strong>${esc(p.name)}</strong>
          <div class="small muted">${esc(p.proponent || '')}</div></td>
        <td data-label="Record type">${esc(p.recordType)}</td>
        <td data-label="Municipality">${esc(p.municipality)}</td>
        <td class="num" data-label="Capacity (MW)" data-sort="${esc(p.capacityMW ?? 0)}">${esc(fmtNum(p.capacityMW))}</td>
        <td data-label="Stage">${A.statusBadge(p.stageStatus || 'neutral', p.stage)}</td>
        <td data-label="Source">${tierChip(p.sourceTier)}
          <a class="small" href="${esc(safeUrl(p.source))}" target="_blank" rel="noopener">Verify ↗</a></td>
      </tr>`).join('') : `
      <tr><td colspan="6"><div class="empty-state">
        ${esc(proj.confirmedNote || 'No confirmed records.')}
      </div></td></tr>`;

    $('#projects-detail-slot').innerHTML = list.map(p => `
      <div class="card">
        <div class="card-head"><h3>${esc(p.name)}</h3>
          <div class="card-action">${tierChip(p.sourceTier)}</div></div>
        <p class="small">${esc(p.summary)}</p>
        ${p.caution ? `<div class="alert-strip" style="margin:var(--s-3) 0">
          ${A.icon('alert')}<div class="alert-body small"><strong>Read carefully:</strong> ${esc(p.caution)}</div>
        </div>` : ''}
        <dl class="deflist">
          <div><dt>Decision body</dt><dd>${esc(p.decisionBody || '—')}</dd></div>
          <div><dt>Decision date</dt><dd>${esc(fmtDate(p.decisionDate))}</dd></div>
          <div><dt>Capacity</dt><dd>${esc(fmtNum(p.capacityMW))} MW${
            p.capacityNote ? ` <span class="muted">— ${esc(p.capacityNote)}</span>` : ''}</dd></div>
          <div><dt>Verification</dt><dd>${
            p.verificationStatus === 'pending'
              ? A.statusBadge('warning', 'Pending verification')
              : A.statusBadge('good', 'Verified')}
            ${p.verificationNote ? `<div class="small muted">${esc(p.verificationNote)}</div>` : ''}</dd></div>
        </dl>
        <p class="small" style="margin:var(--s-3) 0 0">
          <a href="${esc(safeUrl(p.source))}" target="_blank" rel="noopener">Verify at source — ${esc(p.sourceName)} ↗</a></p>
      </div>`).join('');
  }

  $('#q').addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); render(); });
  render();
  A.makeSortable($('#proj'));
  A.registerPaletteItems(rows.map(p => ({ label: p.name, kind: 'Project', href: 'projects.html' })));

  /* Reported bucket — leads, never facts. Each says what would confirm it. */
  const rep = proj.reported || [];
  $('#reported-slot').innerHTML = rep.length ? `
    <p class="small secondary">${esc(proj.reportedNote || '')}</p>
    <ul class="feed">${rep.map(r => `
      <li class="feed-item">
        <span class="headline">${esc(r.name)}${r.capacityMW ? ` — ${esc(fmtNum(r.capacityMW))} MW` : ''}</span>
        <div class="feed-meta">
          ${tierChip('reported')}
          ${A.statusBadge('warning', 'Unconfirmed')}
          <span>${esc(r.municipality || '')}</span>
        </div>
        <p class="summary">${esc(r.summary || '')}</p>
        ${r.caution ? `<div class="notice" style="margin:var(--s-2) 0 0">
          <strong>Read carefully:</strong> ${esc(r.caution)}</div>` : ''}
        ${r.whatWouldConfirmIt ? `<p class="small muted" style="margin:var(--s-2) 0 0">
          <strong>What would confirm it:</strong> ${esc(r.whatWouldConfirmIt)}</p>` : ''}
        <p class="small" style="margin:var(--s-2) 0 0">
          <a href="${esc(safeUrl(r.source))}" target="_blank" rel="noopener">${esc(r.sourceName)} ↗</a></p>
      </li>`).join('')}</ul>` : `
    <div class="empty-state">${esc(proj.reportedNote || 'Nothing here.')}</div>`;

  function renderLive(feed) {
    const live = (feed.items || []).filter(i => i.stream === 'projects').slice(0, 12);
    $('#projects-live-slot').innerHTML = live.length ? `
      <ul class="feed">${live.map(i => `
        <li class="feed-item">
          <a class="headline" href="${esc(safeUrl(i.url))}" target="_blank" rel="noopener">${esc(i.title)}</a>
          <div class="feed-meta">${regionChip(i.region)}<span>${esc(i.source)}</span>
            <span>·</span><span>${esc(relTime(i.published))}</span>${tierChip(i.tier || 'reported')}</div>
        </li>`).join('')}</ul>` : `
      <div class="empty-state">No project coverage yet — the feed refreshes every three hours.</div>`;
  }
  renderLive(news);
  A.startLiveRefresh(renderLive);
})();
