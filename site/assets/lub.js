/* ============================================================================
   Land use bylaw ambiguities & use class matrix.

   Three zoning routes a data centre gets pushed down, and the friction points
   where the district's assumptions break. Tabs for the approaches, expandable
   rows for the friction points, tag filtering across both.

   These are PATTERNS, not any named municipality's standards — the data file
   says so and the UI repeats it. Municipality-specific facts belong in
   municipalities.json with the bylaw as the source.

   window.ADCHLub
   ========================================================================= */

(function () {
  'use strict';

  const A = window.ADCH;
  const { $, $$, esc, icon, statusBadge } = A;

  let spec = null;
  let activeApproach = 'approach-a';
  let activeTag = 'all';
  let open = new Set();

  const tagById = id => (spec.tags || []).find(t => t.id === id);

  function tagChip(id) {
    const t = tagById(id);
    if (!t) return '';
    return statusBadge(t.tone, t.label);
  }

  /** Does this item survive the current tag filter? */
  const matches = item => activeTag === 'all' || (item.tags || []).includes(activeTag);

  /* ---------------------------------------------------------------- render */

  function renderFilters() {
    const counts = id => id === 'all'
      ? spec.approaches.length + spec.frictionPoints.length
      : [...spec.approaches, ...spec.frictionPoints].filter(x => (x.tags || []).includes(id)).length;

    return `
      <div class="lub-filters" role="group" aria-label="Filter by tag">
        <button class="lub-chip ${activeTag === 'all' ? 'is-on' : ''}" data-tag="all">
          All <span class="lub-count">${counts('all')}</span>
        </button>
        ${spec.tags.map(t => `
          <button class="lub-chip lub-chip-${esc(t.tone)} ${activeTag === t.id ? 'is-on' : ''}"
                  data-tag="${esc(t.id)}" title="${esc(t.note)}">
            ${esc(t.label)} <span class="lub-count">${counts(t.id)}</span>
          </button>`).join('')}
      </div>`;
  }

  function renderApproachTabs() {
    const shown = spec.approaches.filter(matches);
    const current = shown.find(a => a.id === activeApproach) || shown[0];

    if (!shown.length) {
      return `<div class="empty-state">No zoning approach carries that tag.</div>`;
    }

    return `
      <div class="lub-tabs" role="tablist" aria-label="Zoning approaches">
        ${shown.map(a => `
          <button class="lub-tab ${a.id === current.id ? 'is-on' : ''}"
                  role="tab" aria-selected="${a.id === current.id}"
                  aria-controls="lub-panel" id="tab-${esc(a.id)}"
                  data-approach="${esc(a.id)}">
            <span class="lub-tab-letter">${esc(a.letter)}</span>
            <span class="lub-tab-text">
              <span class="lub-tab-name">${esc(a.name)}</span>
              <span class="lub-tab-class">${esc(a.typicalClass)}</span>
            </span>
          </button>`).join('')}
      </div>

      <div class="lub-panel" id="lub-panel" role="tabpanel" aria-labelledby="tab-${esc(current.id)}">
        <div class="lub-panel-head">
          <div>
            <h3 class="lub-panel-title">${esc(current.name)}</h3>
            <p class="lub-panel-sum">${esc(current.summary)}</p>
          </div>
          <div class="lub-panel-tags">
            ${statusBadge(current.classTone, current.typicalClass)}
            ${(current.tags || []).map(tagChip).join('')}
          </div>
        </div>

        <p class="lub-detail">${esc(current.detail)}</p>

        <div class="lub-cols">
          <div class="lub-col lub-col-good">
            <h4>${icon('check')} What it gives you</h4>
            <ul>${current.strengths.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
          </div>
          <div class="lub-col lub-col-bad">
            <h4>${icon('alert')} Where it leaks</h4>
            <ul>${current.frictions.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
          </div>
        </div>

        <div class="notice lub-ask">
          <strong>How to work it:</strong> ${esc(current.ask)}
        </div>
      </div>`;
  }

  function renderFrictionMatrix() {
    const shown = spec.frictionPoints.filter(matches);
    if (!shown.length) {
      return `<div class="empty-state">No friction point carries that tag.</div>`;
    }

    return `
      <h3 class="lub-sub">Where the district's assumptions break</h3>
      <p class="small secondary lub-sub-note">
        Each row is a standard written for a use that behaves nothing like a data centre.
        Expand one to see how the three approaches handle it.
      </p>

      <div class="lub-fricts">
        ${shown.map(f => {
          const isOpen = open.has(f.id);
          return `
            <div class="lub-frict ${isOpen ? 'is-open' : ''}">
              <button class="lub-frict-head" data-frict="${esc(f.id)}"
                      aria-expanded="${isOpen}" aria-controls="fr-${esc(f.id)}">
                <span class="lub-frict-name">${esc(f.name)}</span>
                <span class="lub-frict-tags">${(f.tags || []).map(tagChip).join('')}</span>
                <span class="lub-frict-chev" aria-hidden="true">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"
                       stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>
                </span>
              </button>

              <div class="lub-frict-body" id="fr-${esc(f.id)}" ${isOpen ? '' : 'hidden'}>
                <p class="lub-frict-issue">${esc(f.issue)}</p>
                <p class="lub-frict-why"><strong>Why it matters:</strong> ${esc(f.why)}</p>

                <div class="lub-mini-wrap">
                  <table class="lub-mini">
                    <caption class="visually-hidden">How each approach handles ${esc(f.name)}</caption>
                    <thead>
                      <tr>${spec.approaches.map(a =>
                        `<th scope="col"><span class="lub-mini-letter">${esc(a.letter)}</span> ${esc(a.shortName)}</th>`).join('')}</tr>
                    </thead>
                    <tbody>
                      <tr>${spec.approaches.map(a =>
                        `<td>${esc(f.byApproach[a.id] || '—')}</td>`).join('')}</tr>
                    </tbody>
                  </table>
                </div>

                <div class="notice lub-check">
                  <strong>Check:</strong> ${esc(f.check)}
                </div>
              </div>
            </div>`;
        }).join('')}
      </div>`;
  }

  function render() {
    const el = $('#lub-slot');
    if (!el || !spec) return;
    el.innerHTML = `
      <div class="section-head">
        <h2>${esc(spec.title)}</h2>
      </div>
      <p class="section-note secondary">${esc(spec.intro)}</p>

      ${renderFilters()}
      ${renderApproachTabs()}
      ${renderFrictionMatrix()}

      <p class="lub-caution small">
        ${icon('shield')} ${esc(spec.caution)}
      </p>`;
  }

  /* ------------------------------------------------------------------ wire */

  function wire() {
    $('#lub-slot').addEventListener('click', e => {
      const tag = e.target.closest('[data-tag]');
      if (tag) {
        activeTag = tag.dataset.tag;
        // Keep a visible approach selected when the filter changes under it.
        const shown = spec.approaches.filter(matches);
        if (shown.length && !shown.some(a => a.id === activeApproach)) activeApproach = shown[0].id;
        render();
        return;
      }
      const tab = e.target.closest('[data-approach]');
      if (tab) {
        activeApproach = tab.dataset.approach;
        render();
        // The re-render replaces the button that was clicked, so focus has to
        // be put back or keyboard users lose their place in the tablist.
        $(`#tab-${activeApproach}`)?.focus();
        return;
      }

      const fr = e.target.closest('[data-frict]');
      if (fr) {
        const id = fr.dataset.frict;
        open.has(id) ? open.delete(id) : open.add(id);
        render();
        $(`[data-frict="${id}"]`)?.focus();
      }
    });

    // Arrow-key movement between tabs, as a tablist should behave.
    $('#lub-slot').addEventListener('keydown', e => {
      if (!e.target.closest('[role="tab"]')) return;
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const tabs = $$('#lub-slot [role="tab"]');
      const i = tabs.findIndex(t => t === e.target);
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      activeApproach = next.dataset.approach;
      render();
      $(`#tab-${activeApproach}`)?.focus();
    });
  }

  async function init() {
    if (!$('#lub-slot')) return;
    spec = await A.loadData('lub-ambiguities', null);
    if (!spec) {
      $('#lub-slot').innerHTML =
        `<div class="empty-state">The use class matrix could not be loaded.</div>`;
      return;
    }
    render();
    wire();
  }

  window.ADCHLub = { init };
  document.addEventListener('DOMContentLoaded', init);
})();
