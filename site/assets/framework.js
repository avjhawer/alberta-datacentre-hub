/* ============================================================================
   The four-layer regulatory framework.

   Legislation, regulation, the AESO grid process, and the municipal bylaw —
   each administered by a different body. The point the diagram makes is that
   an application can satisfy one layer and fail another.

   Renders into #stack-slot.
   ========================================================================= */
(function () {
  'use strict';
  const A = window.ADCH;
  const { $, esc, tierChip } = A;

  const LAYERS = [
    { key: 'Legislation', label: 'Legislation', body: 'Legislature',
      note: 'The enabling Acts. Changing these takes a bill.' },
    { key: 'Regulation', label: 'Regulation', body: 'Government of Alberta',
      note: 'Where the thresholds and definitions live, including the 75 MW test.' },
    { key: 'Process', label: 'Grid process', body: 'AESO',
      note: 'Who may connect, in what order, and under what conditions.' },
    { key: 'Municipal', label: 'Municipal bylaw', body: 'Your council',
      note: 'Use class, districts, servicing and conditions — the layer you administer.' },
  ];

  async function init() {
    const el = $('#stack-slot');
    if (!el) return;
    const policy = await A.loadData('policy', null);
    if (!policy?.records) { el.innerHTML = ''; return; }

    const byType = t => policy.records.filter(r =>
      t === 'Process' ? /aeso|grid|process/i.test(r.type + r.title) : r.type === t);

    el.innerHTML = `
      <ol class="stack">
        ${LAYERS.map((L, i) => {
          const recs = L.key === 'Municipal' ? [] : byType(L.key);
          return `
            <li class="stack-layer">
              <div class="stack-rank">${i + 1}</div>
              <div class="stack-body">
                <div class="stack-head">
                  <span class="stack-label">${esc(L.label)}</span>
                  <span class="stack-body-name small muted">${esc(L.body)}</span>
                </div>
                <p class="small secondary stack-note">${esc(L.note)}</p>
                ${recs.length ? `
                  <ul class="stack-items">
                    ${recs.map(r => `
                      <li>
                        <a href="#record-${esc(r.id)}">${esc(r.title)}</a>
                        ${tierChip(r.sourceTier)}
                        <span class="small muted">${esc(A.fmtDate(r.date))}</span>
                      </li>`).join('')}
                  </ul>`
                : `<p class="small muted stack-items">
                     Varies by municipality — <a href="#municipal">compare the matrix below →</a>
                   </p>`}
              </div>
            </li>`;
        }).join('')}
      </ol>`;
  }

  document.addEventListener('DOMContentLoaded', init);
})();
