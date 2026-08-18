/* ============================================================================
   DP review tool.

   A review is a project: its stated parameters, the regulatory findings those
   parameters trigger, and a per-criterion assessment across eight areas.

   All state lives in localStorage — nothing is uploaded, which is what makes it
   safe to keep pre-decision notes on a public site. Criterion ids are the
   storage keys, so they must never change; see CLAUDE.md.
   ========================================================================= */

(function () {
  'use strict';

  const A = window.ADCH, R = window.ADCHRules;
  const { $, $$, esc, safeUrl, fmtDate, icon, statusBadge } = A;

  const STORE = 'adch.reviews.v2';
  const STORE_V1 = 'adch.reviews.v1';

  const REF_PAGES = {
    municipal: { label: 'Municipal matrix', href: 'rules.html#municipal' },
    policy:    { label: 'Policy & regulation', href: 'rules.html#framework' },
    tech:      { label: 'Technology trends', href: 'context.html#tech' },
  };

  const AREA_ICON = {
    'land-use': 'municipal', 'power-grid': 'tech', 'water': 'precedent',
    'noise-air': 'alert', 'servicing': 'projects', 'environment': 'shield',
    'community': 'news', 'decommissioning': 'doc',
  };

  const SEVERITY_BADGE = {
    critical: 'critical', serious: 'serious', warning: 'warning',
    info: 'neutral', question: 'question',
  };

  let spec = null;      // checklist.json
  let ruleSpec = null;  // rules.json
  let muniData = null;  // municipalities.json
  let store = { reviews: [], activeId: null };
  let lastDeleted = null;       // for undo
  let filter = 'all';           // all | open | flagged
  let collapsed = new Set();    // area ids collapsed in the UI

  /* ------------------------------------------------------------- storage */

  function load() {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) { store = JSON.parse(raw); }
      else {
        // Migrate v1 rather than orphaning saved work. Criterion ids are
        // unchanged, so every recorded status and note carries across.
        const old = localStorage.getItem(STORE_V1);
        if (old) {
          const parsed = JSON.parse(old);
          store = {
            reviews: (parsed.reviews || []).map(r => ({ ...r, params: paramsFromLegacy(r) })),
            activeId: parsed.activeId || null,
          };
          save();
        }
      }
    } catch { /* corrupt state must not break the page */ }
    if (!Array.isArray(store.reviews)) store.reviews = [];
    for (const r of store.reviews) {
      if (!r.params) r.params = paramsFromLegacy(r);
      if (!r.items) r.items = {};
    }
  }

  /** v1 kept a couple of these as top-level strings. */
  function paramsFromLegacy(r) {
    return {
      capacityMW: r.capacityMW || '',
      municipality: r.municipality || '',
    };
  }

  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify(store));
      flashSaved();
    } catch (e) {
      alert('Could not save — browser storage may be full or blocked.\n\n' + e.message);
    }
  }

  let savedTimer = null;
  function flashSaved() {
    const el = $('#save-state');
    if (!el) return;
    el.textContent = 'Saved';
    el.classList.add('is-on');
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => el.classList.remove('is-on'), 1400);
  }

  const active = () => store.reviews.find(r => r.id === store.activeId) || null;

  function newReview(name) {
    const r = {
      id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      name: name || 'Untitled review',
      applicant: '',
      fileNumber: '',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      params: {},
      items: {},
    };
    store.reviews.push(r);
    store.activeId = r.id;
    save();
    return r;
  }

  function deleteReview(id) {
    const i = store.reviews.findIndex(r => r.id === id);
    if (i < 0) return;
    lastDeleted = { review: store.reviews[i], index: i };
    store.reviews.splice(i, 1);
    if (store.activeId === id) {
      store.activeId = store.reviews.length ? store.reviews[Math.max(0, i - 1)].id : null;
    }
    save();
    renderAll();
    showUndo(`Deleted “${lastDeleted.review.name}”.`);
  }

  function undoDelete() {
    if (!lastDeleted) return;
    store.reviews.splice(Math.min(lastDeleted.index, store.reviews.length), 0, lastDeleted.review);
    store.activeId = lastDeleted.review.id;
    lastDeleted = null;
    save();
    renderAll();
    hideUndo();
  }

  function showUndo(msg) {
    const bar = $('#undo-bar');
    if (!bar) return;
    $('#undo-msg').textContent = msg;
    bar.hidden = false;
    clearTimeout(showUndo._t);
    showUndo._t = setTimeout(hideUndo, 12000);
  }
  const hideUndo = () => { const b = $('#undo-bar'); if (b) b.hidden = true; };

  function touch() {
    const r = active();
    if (r) r.updated = new Date().toISOString();
    save();
  }

  /* -------------------------------------------------------------- scoring */

  function sectionStats(section, review) {
    let assessed = 0, met = 0, blocking = 0;
    for (const c of section.criteria) {
      const s = review.items[c.id]?.status || 'unset';
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

  const evaluateActive = () =>
    R.evaluate(ruleSpec, active()?.params || {}, muniData);

  /* ------------------------------------------------------------ fragments */

  /** Progress ring. Value is a percentage; tone drives the stroke colour. */
  function ring(pct, tone, size) {
    size = size || 40;
    const r = (size - 6) / 2, c = 2 * Math.PI * r;
    const off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
    return `
      <svg class="ring ring-${tone}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"
           role="img" aria-label="${pct}% assessed">
        <circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="4"/>
        <circle class="ring-value" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="4"
                stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"
                stroke-linecap="round" transform="rotate(-90 ${size / 2} ${size / 2})"/>
        <text class="ring-text" x="50%" y="50%" dominant-baseline="central" text-anchor="middle">${pct}</text>
      </svg>`;
  }

  function findingCard(f) {
    const isReq = f.kind === 'requirement';
    return `
      <div class="finding finding-${esc(f.severity)}">
        <div class="finding-head">
          ${statusBadge(SEVERITY_BADGE[f.severity] || 'neutral',
                        isReq ? 'Requirement' : 'To establish')}
          <span class="finding-title">${esc(f.title)}</span>
        </div>
        ${f.detail ? `<p class="finding-detail">${esc(f.detail)}</p>` : ''}
        ${f.ask ? `<p class="finding-ask"><strong>Ask:</strong> ${esc(f.ask)}</p>` : ''}
        <div class="finding-foot">
          ${A.tierChip(f.sourceTier)}
          ${f.source ? `<a href="${esc(safeUrl(f.source))}" target="_blank" rel="noopener">${esc(f.sourceName || 'Source')} ↗</a>`
                     : `<span class="muted">${esc(f.sourceName || 'No source — verify independently')}</span>`}
        </div>
      </div>`;
  }

  /* --------------------------------------------------------------- render */

  function renderProjectBar() {
    const el = $('#projects-slot');
    if (!el) return;
    const cards = store.reviews.map(r => {
      const o = overallStats(r);
      const pct = o.total ? Math.round((o.assessed / o.total) * 100) : 0;
      const isActive = r.id === store.activeId;
      const tone = o.blocking ? 'warn' : pct === 100 ? 'good' : 'neutral';
      return `
        <div class="proj-card ${isActive ? 'is-active' : ''}" data-open="${esc(r.id)}"
             tabindex="0" role="button" aria-pressed="${isActive}"
             aria-label="Open review ${esc(r.name)}">
          ${ring(pct, tone, 38)}
          <div class="proj-body">
            <div class="proj-name">${esc(r.name)}</div>
            <div class="proj-meta small muted">
              ${esc(r.params?.municipality || 'No municipality')}
              ${r.params?.capacityMW ? ` · ${esc(r.params.capacityMW)} MW` : ''}
            </div>
          </div>
          <div class="proj-actions">
            <button class="icon-btn" data-rename="${esc(r.id)}" title="Rename" aria-label="Rename ${esc(r.name)}">${icon('doc')}</button>
            <button class="icon-btn" data-dup="${esc(r.id)}" title="Duplicate" aria-label="Duplicate ${esc(r.name)}">${icon('projects')}</button>
            <button class="icon-btn icon-btn-danger" data-del="${esc(r.id)}" title="Delete"
                    aria-label="Delete ${esc(r.name)}">${icon('cross')}</button>
          </div>
        </div>`;
    }).join('');

    el.innerHTML = `
      <div class="proj-strip">
        ${cards || `<div class="empty-state">No reviews yet. Start one to assess an application against the regulations.</div>`}
        <button class="proj-new" id="btn-new">${icon('permits')}<span>New review</span></button>
      </div>`;
  }

  function renderParams(r) {
    const el = $('#params-slot');
    const muniOptions = (muniData?.municipalities || [])
      .map(m => `<option value="${esc(m.name)}"></option>`).join('');

    el.innerHTML = `
      <div class="params-grid">
        <label class="field">
          <span class="field-label">Review name</span>
          <input class="input" data-meta="name" value="${esc(r.name)}" placeholder="e.g. DP-2026-0142">
        </label>
        <label class="field">
          <span class="field-label">File number</span>
          <input class="input" data-meta="fileNumber" value="${esc(r.fileNumber || '')}">
        </label>
        ${(ruleSpec?.fields || []).map(f => {
          const v = r.params?.[f.key] ?? '';
          if (f.type === 'select') {
            return `
              <label class="field">
                <span class="field-label">${esc(f.label)}</span>
                <select class="input" data-param="${esc(f.key)}">
                  ${f.options.map(o =>
                    `<option value="${esc(o.value)}" ${String(v) === o.value ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
                </select>
                ${f.help ? `<span class="field-help">${esc(f.help)}</span>` : ''}
              </label>`;
          }
          if (f.type === 'municipality') {
            return `
              <label class="field">
                <span class="field-label">${esc(f.label)}</span>
                <input class="input" data-param="${esc(f.key)}" list="muni-list" value="${esc(v)}"
                       placeholder="e.g. Parkland County">
                ${f.help ? `<span class="field-help">${esc(f.help)}</span>` : ''}
              </label>`;
          }
          return `
            <label class="field">
              <span class="field-label">${esc(f.label)}${f.unit ? ` <span class="muted">(${esc(f.unit)})</span>` : ''}</span>
              <input class="input" data-param="${esc(f.key)}" value="${esc(v)}" inputmode="decimal">
              ${f.help ? `<span class="field-help">${esc(f.help)}</span>` : ''}
            </label>`;
        }).join('')}
      </div>
      <datalist id="muni-list">${muniOptions}</datalist>`;
  }

  /* Figures make two abstract numbers legible: how the stated load compares
     with the interim cap, and what the cooling choice does to water. Both are
     drawn only once the planner has entered the parameter they depend on. */
  function renderFigures(r) {
    const el = $('#figures-slot');
    if (!el || !window.ADCHFigures) return;
    const F = window.ADCHFigures;
    const mw = Number(r.params?.capacityMW);
    const cooling = r.params?.coolingType;
    const cap = 1200;   // AESO interim cap, verified — see grid.json

    const cards = [];
    if (Number.isFinite(mw) && mw > 0) {
      cards.push(`
        <div class="figure-card">
          <h3>This load against the interim cap</h3>
          <p class="figure-lede">The cap is reported fully allocated, so this is the share of a
             pool that is not currently available.</p>
          ${F.loadVsCap(mw, cap)}
        </div>`);
    }
    if (cooling) {
      cards.push(`
        <div class="figure-card">
          <h3>What this cooling choice means for water</h3>
          <p class="figure-lede">One design decision drives the whole water footprint.</p>
          ${F.coolingWater(cooling)}
        </div>`);
    }
    el.innerHTML = cards.length
      ? `<div class="grid grid-2">${cards.join('')}</div>` : '';
  }

  function renderFindingsSummary(res) {
    const el = $('#findings-slot');
    const c = res.counts;
    const order = [
      ['critical', 'Critical'], ['serious', 'Serious'],
      ['warning', 'Warning'], ['info', 'Note'], ['question', 'To establish'],
    ];
    const chips = order.filter(([k]) => c[k])
      .map(([k, label]) => `
        <button class="sev-chip sev-${k}" data-jump-sev="${k}">
          ${statusBadge(SEVERITY_BADGE[k], `${c[k]} ${label}`)}
        </button>`).join('');

    el.innerHTML = `
      <div class="findings-head">
        <div>
          <div class="eyebrow">Regulatory triggers</div>
          <p class="small secondary" style="margin:var(--s-1) 0 0">
            ${res.findings.length
              ? `${res.counts.requirement} requirement${res.counts.requirement === 1 ? '' : 's'} and
                 ${res.counts.questionKind} thing${res.counts.questionKind === 1 ? '' : 's'} to establish,
                 from ${res.answered} of ${res.totalFields} parameters entered.`
              : `Fill in the project parameters above and the regulations that engage will appear here.`}
          </p>
        </div>
        <div class="sev-chips">${chips}</div>
      </div>`;
  }

  function statusControl(criterionId, current) {
    return `
      <div class="status-seg" role="group" aria-label="Assessment">
        ${spec.statuses.filter(s => s.id !== 'unset').map(s => `
          <button class="seg-btn ${current === s.id ? 'is-on' : ''} seg-${s.badge}"
                  data-crit="${esc(criterionId)}" data-status="${esc(s.id)}"
                  aria-pressed="${current === s.id}">
            ${icon(s.badge === 'good' ? 'check' : s.badge === 'critical' ? 'cross'
                   : s.badge === 'warning' ? 'alert' : 'dash')}<span>${esc(s.label)}</span>
          </button>`).join('')}
      </div>`;
  }

  function renderSections(r, res) {
    const el = $('#sections-slot');
    el.innerHTML = spec.sections.map(section => {
      const st = sectionStats(section, r);
      const areaFindings = res.byArea[section.id] || [];
      const worst = areaFindings.reduce((w, f) =>
        (R.SEVERITY_ORDER[f.severity] ?? 9) < (R.SEVERITY_ORDER[w] ?? 9) ? f.severity : w, 'info');
      const isCollapsed = collapsed.has(section.id);

      const criteria = section.criteria.filter(c => {
        const s = r.items[c.id]?.status || 'unset';
        if (filter === 'open') return s === 'unset';
        if (filter === 'flagged') return s === 'notmet' || s === 'info';
        return true;
      });

      return `
        <section class="area ${isCollapsed ? 'is-collapsed' : ''}" id="area-${esc(section.id)}"
                 data-area="${esc(section.id)}">
          <button class="area-head" data-toggle="${esc(section.id)}"
                  aria-expanded="${!isCollapsed}" aria-controls="body-${esc(section.id)}">
            <span class="area-icon">${icon(AREA_ICON[section.id] || 'doc')}</span>
            ${ring(st.pct, st.blocking ? 'warn' : st.pct === 100 ? 'good' : 'neutral', 36)}
            <span class="area-titles">
              <span class="area-title">${esc(section.title)}</span>
              <span class="area-sub small muted">
                ${st.assessed}/${st.total} assessed
                ${st.blocking ? ` · ${st.blocking} flagged` : ''}
                ${areaFindings.length ? ` · ${areaFindings.length} regulatory trigger${areaFindings.length === 1 ? '' : 's'}` : ''}
              </span>
            </span>
            ${areaFindings.length
              ? statusBadge(SEVERITY_BADGE[worst] || 'neutral', `${areaFindings.length}`)
              : ''}
            <span class="area-chev" aria-hidden="true">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"
                   stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>
            </span>
          </button>

          <div class="area-body" id="body-${esc(section.id)}" ${isCollapsed ? 'hidden' : ''}>
            ${section.intro ? `<p class="area-intro secondary">${esc(section.intro)}</p>` : ''}

            ${areaFindings.length ? `
              <div class="findings-list">
                ${areaFindings.map(findingCard).join('')}
              </div>` : ''}

            <ul class="crit-list">
              ${criteria.length ? criteria.map(c => {
                const item = r.items[c.id] || {};
                const ref = REF_PAGES[c.ref];
                return `
                  <li class="crit" data-status="${esc(item.status || 'unset')}">
                    <div class="crit-main">
                      <p class="crit-text">${esc(c.text)}</p>
                      ${c.help ? `<p class="crit-help small secondary">${esc(c.help)}</p>` : ''}
                      ${ref ? `<a class="small" href="${esc(ref.href)}">${esc(ref.label)} →</a>` : ''}
                    </div>
                    ${statusControl(c.id, item.status || 'unset')}
                    <textarea class="input crit-note" data-note="${esc(c.id)}" rows="1"
                              placeholder="Note (stays in this browser)">${esc(item.note || '')}</textarea>
                  </li>`;
              }).join('') : `<li class="crit-empty muted small">Nothing matches this filter in this area.</li>`}
            </ul>
          </div>
        </section>`;
    }).join('');
  }

  function renderSummary(r, res) {
    const o = overallStats(r);
    const pct = o.total ? Math.round((o.assessed / o.total) * 100) : 0;
    $('#summary-slot').innerHTML = `
      <div class="summary-row">
        ${ring(pct, o.blocking ? 'warn' : pct === 100 ? 'good' : 'neutral', 64)}
        <div class="summary-figs">
          <div><strong>${o.assessed}</strong> of ${o.total} criteria assessed</div>
          <div class="small muted">
            ${o.met} met or N/A · ${o.blocking} flagged ·
            ${res.counts.requirement} regulatory requirement${res.counts.requirement === 1 ? '' : 's'} engaged
          </div>
          <div class="small muted">Updated ${esc(fmtDate(r.updated))}</div>
        </div>
      </div>`;
  }

  /* Open the areas the regulations actually engage, collapse the rest. Eight
     fully-expanded areas is 60-odd criteria of scrolling before you reach the
     part that matters, so the triggered areas come to you as you type.

     Any area the planner opens or closes by hand is theirs from then on — it
     is never re-collapsed underneath them. */
  const userToggled = new Set();
  function autoCollapse(res) {
    for (const s of spec.sections) {
      if (userToggled.has(s.id)) continue;
      const has = (res.byArea[s.id] || []).length > 0;
      has ? collapsed.delete(s.id) : collapsed.add(s.id);
    }
    const btn = $('#btn-expand');
    if (btn) btn.textContent = collapsed.size ? 'Expand all' : 'Collapse all';
  }

  function renderAll() {
    renderProjectBar();
    const r = active();
    const hasReview = !!r;
    $('#review-pane').hidden = !hasReview;
    $('#no-review').hidden = hasReview;
    if (!hasReview) return;

    const res = evaluateActive();
    autoCollapse(res);
    renderParams(r);
    renderFigures(r);
    renderFindingsSummary(res);
    renderSummary(r, res);
    renderSections(r, res);
    autosizeNotes();
  }

  function autosizeNotes() {
    $$('.crit-note').forEach(t => {
      t.style.height = 'auto';
      t.style.height = Math.min(240, t.scrollHeight) + 'px';
    });
  }

  /* --------------------------------------------------------------- export */

  function exportJson() {
    const r = active();
    if (!r) return;
    const res = evaluateActive();
    const payload = { ...r, findings: res.findings, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(r.name || 'review').replace(/[^\w.-]+/g, '-')}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function markdownSummary() {
    const r = active();
    if (!r) return '';
    const res = evaluateActive();
    const titles = Object.fromEntries(spec.sections.map(s => [s.id, s.title]));
    const o = overallStats(r);
    const out = [
      `# DP review — ${r.name}`, '',
      `- File number: ${r.fileNumber || '—'}`,
      `- Municipality: ${r.params?.municipality || '—'}`,
      `- Stated load: ${r.params?.capacityMW ? r.params.capacityMW + ' MW' : '—'}`,
      `- Assessed: ${o.assessed}/${o.total} criteria · ${o.blocking} flagged`,
      `- Updated: ${fmtDate(r.updated)}`, '',
      `## Regulatory triggers`, '',
      R.findingsToMarkdown(res, titles),
      `## Assessment`, '',
    ];
    for (const s of spec.sections) {
      const rows = s.criteria.filter(c => (r.items[c.id]?.status || 'unset') !== 'unset');
      if (!rows.length) continue;
      out.push(`### ${s.title}`, '');
      for (const c of rows) {
        const it = r.items[c.id];
        const label = (spec.statuses.find(x => x.id === it.status) || {}).label || it.status;
        out.push(`- **${label}** — ${c.text}`);
        if (it.note) out.push(`  - ${it.note.replace(/\n/g, ' ')}`);
      }
      out.push('');
    }
    out.push('---', '', '_Working notes, not a decision. Verify every figure against its source._');
    return out.join('\n');
  }

  async function copySummary(btn) {
    try {
      await navigator.clipboard.writeText(markdownSummary());
      const old = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(() => { btn.textContent = old; }, 1500);
    } catch {
      alert('Could not copy. Your browser may block clipboard access on this page.');
    }
  }

  function importJson(file) {
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const data = JSON.parse(fr.result);
        if (!data || typeof data !== 'object' || !data.items) throw new Error('Not a review export.');
        data.id = `r${Date.now().toString(36)}`;
        data.name = (data.name || 'Imported review') + ' (imported)';
        delete data.findings;
        if (!data.params) data.params = paramsFromLegacy(data);
        store.reviews.push(data);
        store.activeId = data.id;
        save();
        renderAll();
      } catch (e) {
        alert('Could not import that file.\n\n' + e.message);
      }
    };
    fr.readAsText(file);
  }

  /* ----------------------------------------------------------------- wire */

  function wire() {
    // Project strip: open, rename, duplicate, delete.
    $('#projects-slot').addEventListener('click', e => {
      const del = e.target.closest('[data-del]');
      const dup = e.target.closest('[data-dup]');
      const ren = e.target.closest('[data-rename]');
      const open = e.target.closest('[data-open]');

      if (del) {
        e.stopPropagation();
        const r = store.reviews.find(x => x.id === del.dataset.del);
        if (!r) return;
        const o = overallStats(r);
        const msg = o.assessed
          ? `Delete “${r.name}”?\n\nIt has ${o.assessed} assessed criteria and any notes you recorded. ` +
            `You can undo this straight away, but not after you leave the page.`
          : `Delete “${r.name}”?`;
        if (confirm(msg)) deleteReview(r.id);
        return;
      }
      if (dup) {
        e.stopPropagation();
        const src = store.reviews.find(x => x.id === dup.dataset.dup);
        if (!src) return;
        const copy = JSON.parse(JSON.stringify(src));
        copy.id = `r${Date.now().toString(36)}`;
        copy.name = `${src.name} (copy)`;
        copy.created = copy.updated = new Date().toISOString();
        store.reviews.push(copy);
        store.activeId = copy.id;
        save(); renderAll();
        return;
      }
      if (ren) {
        e.stopPropagation();
        const r = store.reviews.find(x => x.id === ren.dataset.rename);
        if (!r) return;
        const name = prompt('Rename review', r.name);
        if (name != null && name.trim()) { r.name = name.trim(); touch(); renderAll(); }
        return;
      }
      if (open) { store.activeId = open.dataset.open; save(); renderAll(); }
    });

    $('#projects-slot').addEventListener('keydown', e => {
      const card = e.target.closest('[data-open]');
      if (card && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        store.activeId = card.dataset.open; save(); renderAll();
      }
    });

    document.addEventListener('click', e => {
      if (e.target.closest('#btn-new')) {
        newReview(`Review ${store.reviews.length + 1}`);
        renderAll();
        setTimeout(() => $('[data-meta="name"]')?.focus(), 0);
      }
      if (e.target.closest('#undo-btn')) undoDelete();
      if (e.target.closest('#undo-close')) hideUndo();
    });

    // Parameters + metadata: live re-evaluation on input.
    $('#params-slot').addEventListener('input', e => {
      const r = active();
      if (!r) return;
      const meta = e.target.dataset.meta, param = e.target.dataset.param;
      if (meta) r[meta] = e.target.value;
      else if (param) r.params[param] = e.target.value;
      else return;
      r.updated = new Date().toISOString();
      save();
      const res = evaluateActive();
      autoCollapse(res);            // newly triggered areas open as you type
      renderFigures(r);
      renderFindingsSummary(res);
      renderSummary(r, res);
      renderSections(r, res);
      renderProjectBar();
      autosizeNotes();
    });
    $('#params-slot').addEventListener('change', e => {
      if (e.target.dataset.param) $('#params-slot').dispatchEvent(new Event('input', { bubbles: false }));
    });

    // Criterion status + notes.
    $('#sections-slot').addEventListener('click', e => {
      const btn = e.target.closest('[data-crit]');
      if (btn) {
        const r = active();
        const id = btn.dataset.crit, next = btn.dataset.status;
        const cur = r.items[id]?.status;
        r.items[id] = { ...(r.items[id] || {}), status: cur === next ? 'unset' : next };
        touch();
        const res = evaluateActive();
        renderSections(r, res); renderSummary(r, res); renderProjectBar(); autosizeNotes();
        return;
      }
      const tog = e.target.closest('[data-toggle]');
      if (tog) {
        const id = tog.dataset.toggle;
        userToggled.add(id);
        collapsed.has(id) ? collapsed.delete(id) : collapsed.add(id);
        renderSections(active(), evaluateActive());
        autosizeNotes();
      }
    });

    $('#sections-slot').addEventListener('input', e => {
      const t = e.target.closest('[data-note]');
      if (!t) return;
      const r = active();
      const id = t.dataset.note;
      r.items[id] = { ...(r.items[id] || {}), note: t.value };
      r.updated = new Date().toISOString();
      save();
      t.style.height = 'auto';
      t.style.height = Math.min(240, t.scrollHeight) + 'px';
    });

    // Toolbar.
    $('#filter-slot')?.addEventListener('click', e => {
      const b = e.target.closest('[data-filter]');
      if (!b) return;
      filter = b.dataset.filter;
      $$('#filter-slot [data-filter]').forEach(x => x.classList.toggle('is-on', x === b));
      renderSections(active(), evaluateActive());
      autosizeNotes();
    });

    $('#btn-expand')?.addEventListener('click', () => {
      const allOpen = collapsed.size === 0;
      collapsed = allOpen ? new Set(spec.sections.map(s => s.id)) : new Set();
      spec.sections.forEach(s => userToggled.add(s.id));
      $('#btn-expand').textContent = allOpen ? 'Expand all' : 'Collapse all';
      renderSections(active(), evaluateActive());
      autosizeNotes();
    });

    $('#btn-export')?.addEventListener('click', exportJson);
    $('#btn-copy')?.addEventListener('click', e => copySummary(e.currentTarget));
    $('#btn-print')?.addEventListener('click', () => window.print());
    $('#file-import')?.addEventListener('change', e => {
      if (e.target.files?.[0]) importJson(e.target.files[0]);
      e.target.value = '';
    });

    // Jump to the first finding of a severity when its chip is clicked.
    $('#findings-slot').addEventListener('click', e => {
      const chip = e.target.closest('[data-jump-sev]');
      if (!chip) return;
      const sev = chip.dataset.jumpSev;
      const res = evaluateActive();
      const first = res.findings.find(f => f.severity === sev);
      if (!first) return;
      collapsed.delete(first.area);
      renderSections(active(), res);
      autosizeNotes();
      const el = document.getElementById(`area-${first.area}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el?.classList.add('is-flash');
      setTimeout(() => el?.classList.remove('is-flash'), 1200);
    });
  }

  /* ----------------------------------------------------------------- init */

  async function init() {
    let news;
    [spec, ruleSpec, muniData, news] = await Promise.all([
      A.loadData('checklist', null),
      A.loadData('rules', null),
      A.loadData('municipalities', null),
      A.loadData('news', { items: [], sourceHealth: [] }),
    ]);
    A.renderLiveStatus(news);
    if (!spec) {
      $('#sections-slot').innerHTML =
        `<div class="empty-state">The checklist could not be loaded.</div>`;
      return;
    }
    load();
    if (!store.reviews.length) newReview('Sample review');
    else if (!store.activeId) store.activeId = store.reviews[0].id;

    wire();
    renderAll();

    A.registerPaletteItems([
      { label: 'DP review: new review', run: () => { newReview(`Review ${store.reviews.length + 1}`); renderAll(); } },
      { label: 'DP review: copy summary', run: () => copySummary(document.createElement('button')) },
      { label: 'DP review: export JSON', run: exportJson },
    ]);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
