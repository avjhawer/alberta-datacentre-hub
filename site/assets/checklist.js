/* ============================================================================
   DP review tool.
   All state lives in localStorage — nothing is uploaded, which is what makes
   it safe to keep pre-decision notes on a public site.
   ========================================================================= */

(function () {
  const A = window.ADCH;
  const { $, $$, esc, safeUrl, fmtDate } = A;

  const STORE = 'adch.reviews.v1';
  const REF_PAGES = {
    municipal: { label: 'Municipal matrix', href: 'municipal.html' },
    policy:    { label: 'Policy & regulation', href: 'policy.html' },
    tech:      { label: 'Technology trends', href: 'tech.html' },
  };

  let spec = null;       // checklist.json
  let store = { reviews: [], activeId: null };

  /* ------------------------------------------------------------ storage */

  function load() {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) store = JSON.parse(raw);
    } catch { /* corrupt state should not break the page */ }
    if (!Array.isArray(store.reviews)) store.reviews = [];
  }

  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify(store));
    } catch (e) {
      alert('Could not save — browser storage may be full or blocked.\n\n' + e.message);
    }
  }

  function active() {
    return store.reviews.find(r => r.id === store.activeId) || null;
  }

  function newReview(name) {
    const r = {
      id: `r${Date.now().toString(36)}`,
      name: name || 'Untitled review',
      municipality: '',
      applicant: '',
      fileNumber: '',
      capacityMW: '',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      items: {},   // criterionId -> { status, note }
    };
    store.reviews.push(r);
    store.activeId = r.id;
    save();
    return r;
  }

  /* -------------------------------------------------------------- scoring */

  function sectionStats(section, review) {
    let assessed = 0, met = 0, blocking = 0;
    for (const c of section.criteria) {
      const v = review.items[c.id];
      const s = v?.status || 'unset';
      if (s !== 'unset') assessed++;
      if (s === 'met' || s === 'na') met++;
      if (s === 'notmet' || s === 'info') blocking++;
    }
    const total = section.criteria.length;
    return { total, assessed, met, blocking, pct: total ? Math.round((assessed / total) * 100) : 0 };
  }

  function overallStats(review) {
    return spec.sections.reduce((acc, s) => {
      const st = sectionStats(s, review);
      acc.total += st.total; acc.assessed += st.assessed;
      acc.met += st.met; acc.blocking += st.blocking;
      return acc;
    }, { total: 0, assessed: 0, met: 0, blocking: 0 });
  }

  /* --------------------------------------------------------------- render */

  function renderReviewPicker() {
    const sel = $('#review-select');
    sel.innerHTML = store.reviews.length
      ? store.reviews.map(r =>
          `<option value="${esc(r.id)}" ${r.id === store.activeId ? 'selected' : ''}>${esc(r.name)}</option>`).join('')
      : `<option value="">No reviews yet</option>`;
  }

  function renderMeta(r) {
    $('#meta-slot').innerHTML = `
      <div class="grid grid-4">
        <label class="field"><span class="eyebrow">Review name</span>
          <input class="search-input" data-meta="name" value="${esc(r.name)}"></label>
        <label class="field"><span class="eyebrow">Municipality</span>
          <input class="search-input" data-meta="municipality" value="${esc(r.municipality)}"
                 list="muni-list" placeholder="e.g. Parkland County"></label>
        <label class="field"><span class="eyebrow">File number</span>
          <input class="search-input" data-meta="fileNumber" value="${esc(r.fileNumber)}"></label>
        <label class="field"><span class="eyebrow">Stated load (MW)</span>
          <input class="search-input" data-meta="capacityMW" value="${esc(r.capacityMW)}"
                 inputmode="decimal"></label>
      </div>`;
  }

  function renderSummary(r) {
    const o = overallStats(r);
    const pct = o.total ? Math.round((o.assessed / o.total) * 100) : 0;
    $('#summary-slot').innerHTML = `
      <div class="grid grid-4">
        <div class="stat">
          <div class="stat-label">Criteria assessed</div>
          <div class="stat-value">${o.assessed}<span class="unit">/ ${o.total}</span></div>
          <div class="meter" style="margin-top:var(--s-2)">
            <div class="meter-track"><div class="meter-fill ${pct >= 100 ? 'is-full' : ''}"
                 style="width:${pct}%"></div></div>
          </div>
        </div>
        <div class="stat">
          <div class="stat-label">Met or not applicable</div>
          <div class="stat-value">${o.met}</div>
          <div class="stat-foot">of ${o.total} criteria</div>
        </div>
        <div class="stat">
          <div class="stat-label">Outstanding</div>
          <div class="stat-value">${o.blocking}</div>
          <div class="stat-foot">Not met or needs info</div>
        </div>
        <div class="stat">
          <div class="stat-label">Last updated</div>
          <div class="stat-value" style="font-size:var(--t-h2)">${esc(fmtDate(r.updated))}</div>
          <div class="stat-foot">Stored in this browser only</div>
        </div>
      </div>`;
  }

  function statusControl(criterionId, current) {
    return `
      <div class="status-group" role="radiogroup" aria-label="Status">
        ${spec.statuses.filter(s => s.id !== 'unset').map(s => `
          <button type="button" class="status-opt" data-crit="${esc(criterionId)}" data-status="${esc(s.id)}"
                  role="radio" aria-checked="${current === s.id}"
                  data-badge="${esc(s.badge)}">${esc(s.label)}</button>`).join('')}
      </div>`;
  }

  function renderSections(r) {
    $('#sections-slot').innerHTML = spec.sections.map(sec => {
      const st = sectionStats(sec, r);
      return `
      <section class="card review-section" id="sec-${esc(sec.id)}">
        <div class="card-head">
          <h2>${esc(sec.title)}</h2>
          <div class="card-action">
            <span class="small muted">${st.assessed}/${st.total} assessed</span>
            ${st.blocking ? A.statusBadge('warning', `${st.blocking} outstanding`) : ''}
          </div>
        </div>
        <div class="meter" style="margin-bottom:var(--s-3)">
          <div class="meter-track"><div class="meter-fill ${st.pct >= 100 ? 'is-full' : ''}"
               style="width:${st.pct}%"></div></div>
        </div>
        ${sec.intro ? `<p class="secondary small">${esc(sec.intro)}</p>` : ''}
        <ul class="crit-list">
          ${sec.criteria.map(c => {
            const v = r.items[c.id] || {};
            const ref = c.ref ? REF_PAGES[c.ref] : null;
            return `
            <li class="crit" data-crit="${esc(c.id)}">
              <div class="crit-main">
                <div class="crit-text">
                  ${esc(c.text)}
                  ${c.origin === 'precedent'
                    ? `<span class="chip" title="From the Loudoun County standards and JLARC/WRI impact research — this is where applications get contested.">Precedent</span>` : ''}
                </div>
                ${c.help ? `<p class="crit-help">${esc(c.help)}</p>` : ''}
                ${ref ? `<a class="small" href="${esc(ref.href)}">Reference: ${esc(ref.label)} →</a>` : ''}
              </div>
              <div class="crit-controls">
                ${statusControl(c.id, v.status || 'unset')}
                <textarea class="crit-note" data-crit="${esc(c.id)}" rows="1"
                          placeholder="Notes…">${esc(v.note || '')}</textarea>
                <!-- A textarea cannot grow to its content when printed, so the
                     note is mirrored into a div that only the print stylesheet
                     shows. Kept in sync by the input handler. -->
                <div class="crit-note-print">${esc(v.note || '')}</div>
              </div>
            </li>`;
          }).join('')}
        </ul>
      </section>`;
    }).join('');
  }

  function renderAll() {
    const r = active();
    $('#no-review').hidden = !!r;
    $('#review-body').hidden = !r;
    renderReviewPicker();
    if (!r) return;
    renderMeta(r);
    renderSummary(r);
    renderSections(r);
  }

  function touch() {
    const r = active();
    if (r) { r.updated = new Date().toISOString(); save(); }
  }

  /* --------------------------------------------------------------- export */

  function exportJson() {
    const r = active();
    if (!r) return;
    const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dp-review-${r.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function markdownSummary() {
    const r = active();
    if (!r) return '';
    const o = overallStats(r);
    const L = [];
    L.push(`# DP review — ${r.name}`, '');
    if (r.municipality) L.push(`**Municipality:** ${r.municipality}`);
    if (r.fileNumber)   L.push(`**File number:** ${r.fileNumber}`);
    if (r.capacityMW)   L.push(`**Stated load:** ${r.capacityMW} MW`);
    L.push(`**Progress:** ${o.assessed} of ${o.total} criteria assessed · ${o.blocking} outstanding`, '');

    for (const sec of spec.sections) {
      const rows = sec.criteria
        .map(c => ({ c, v: r.items[c.id] }))
        .filter(x => x.v && x.v.status && x.v.status !== 'unset');
      if (!rows.length) continue;
      L.push(`## ${sec.title}`, '');
      for (const { c, v } of rows) {
        const label = spec.statuses.find(s => s.id === v.status)?.label || v.status;
        L.push(`- **${label}** — ${c.text}${v.note ? `\n  - ${v.note.replace(/\n/g, '\n  - ')}` : ''}`);
      }
      L.push('');
    }
    L.push('---', '', '_Prepared with the Alberta Data Centre Hub DP review tool. Confirm every requirement against the current bylaw and regulation text before making or recommending a decision._');
    return L.join('\n');
  }

  async function copySummary(btn) {
    const md = markdownSummary();
    try {
      await navigator.clipboard.writeText(md);
      const t = btn.innerHTML;
      btn.innerHTML = `${A.icon('check')}<span>Copied</span>`;
      setTimeout(() => { btn.innerHTML = t; }, 1800);
    } catch {
      const w = window.open('', '_blank');
      w.document.body.innerText = md;
    }
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const r = JSON.parse(reader.result);
        if (!r || typeof r !== 'object' || !r.items) throw new Error('Not a review file');
        r.id = `r${Date.now().toString(36)}`;
        r.name = `${r.name || 'Imported review'} (imported)`;
        store.reviews.push(r);
        store.activeId = r.id;
        save(); renderAll();
      } catch (e) {
        alert('Could not import that file: ' + e.message);
      }
    };
    reader.readAsText(file);
  }

  /* ----------------------------------------------------------------- init */

  async function init() {
    spec = await A.loadData('checklist', null);
    if (!spec) {
      $('#main').innerHTML = '<div class="empty-state">Checklist definition unavailable.</div>';
      return;
    }

    $('#disclaimer').textContent = spec.disclaimer;

    // Municipality autocomplete from the matrix
    const muni = await A.loadData('municipalities', { municipalities: [] });
    $('#muni-list').innerHTML = (muni.municipalities || [])
      .map(m => `<option value="${esc(m.name)}"></option>`).join('');

    load();
    renderAll();

    /* --- events ------------------------------------------------------- */

    $('#new-review').addEventListener('click', () => {
      const name = prompt('Name this review (e.g. "DP 2026-014 — quarter section NE 12-52-27-W4"):');
      if (name === null) return;
      newReview(name.trim() || 'Untitled review');
      renderAll();
    });

    $('#review-select').addEventListener('change', (e) => {
      store.activeId = e.target.value; save(); renderAll();
    });

    $('#delete-review').addEventListener('click', () => {
      const r = active();
      if (!r) return;
      if (!confirm(`Delete "${r.name}"? This cannot be undone — export it first if you want a copy.`)) return;
      store.reviews = store.reviews.filter(x => x.id !== r.id);
      store.activeId = store.reviews[0]?.id || null;
      save(); renderAll();
    });

    $('#export-review').addEventListener('click', exportJson);
    $('#copy-summary').addEventListener('click', (e) => copySummary(e.currentTarget));
    $('#print-review').addEventListener('click', () => window.print());
    $('#import-file').addEventListener('change', (e) => {
      if (e.target.files[0]) importJson(e.target.files[0]);
      e.target.value = '';
    });

    // Meta fields
    $('#meta-slot').addEventListener('input', (e) => {
      const key = e.target.dataset.meta;
      const r = active();
      if (!key || !r) return;
      r[key] = e.target.value;
      touch();
      if (key === 'name') renderReviewPicker();
    });

    // Status buttons + notes (delegated, so re-renders don't lose handlers)
    $('#sections-slot').addEventListener('click', (e) => {
      const btn = e.target.closest('.status-opt');
      if (!btn) return;
      const r = active();
      if (!r) return;
      const id = btn.dataset.crit;
      const next = btn.dataset.status;
      const cur = r.items[id]?.status;
      r.items[id] = r.items[id] || {};
      r.items[id].status = (cur === next) ? 'unset' : next;   // click again to clear
      touch();
      renderSummary(r);
      // update just this group, so notes keep focus and scroll position holds
      const group = btn.closest('.status-group');
      $$('.status-opt', group).forEach(b =>
        b.setAttribute('aria-checked', String(b.dataset.status === r.items[id].status)));
      const sec = btn.closest('.review-section');
      const specSec = spec.sections.find(s => `sec-${s.id}` === sec.id);
      if (specSec) {
        const st = sectionStats(specSec, r);
        $('.meter-fill', sec).style.width = `${st.pct}%`;
        $('.card-action', sec).innerHTML =
          `<span class="small muted">${st.assessed}/${st.total} assessed</span>` +
          (st.blocking ? A.statusBadge('warning', `${st.blocking} outstanding`) : '');
      }
    });

    $('#sections-slot').addEventListener('input', (e) => {
      if (!e.target.classList.contains('crit-note')) return;
      const r = active();
      if (!r) return;
      const id = e.target.dataset.crit;
      r.items[id] = r.items[id] || {};
      r.items[id].note = e.target.value;
      // grow the textarea with its content
      e.target.style.height = 'auto';
      e.target.style.height = `${Math.min(e.target.scrollHeight, 220)}px`;
      // keep the print mirror in sync
      const mirror = e.target.parentElement.querySelector('.crit-note-print');
      if (mirror) mirror.textContent = e.target.value;
      touch();
    });

    // Command palette: jump straight to a section
    A.registerPaletteItems(spec.sections.map(s => ({
      label: `DP review — ${s.title}`,
      kind: 'Criteria',
      action: () => document.getElementById(`sec-${s.id}`)?.scrollIntoView({ behavior: 'smooth' }),
    })));
  }

  document.addEventListener('DOMContentLoaded', init);
})();
