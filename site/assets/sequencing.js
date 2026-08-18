/* ============================================================================
   AUC vs Municipal regulatory sequencing swimlane.

   Two tracks, four phases, and the cross-track gates where one track's
   decision constrains the other. Every step and gate opens a drawer with
   guidance written for the person doing the review.

   Self-contained: renders into #sequencing-slot and owns its own drawer.
   It must not touch the DP review tool below it.

   window.ADCHSequencing
   ========================================================================= */

(function () {
  'use strict';

  const A = window.ADCH;
  const { $, esc, safeUrl, icon } = A;

  let spec = null;
  let lastFocus = null;

  /* ------------------------------------------------------------- fragments */

  function stepCard(step) {
    return `
      <button class="sq-step" data-open-step="${esc(step.id)}"
              aria-label="${esc(step.title)} — open guidance">
        <span class="sq-step-short">${esc(step.short)}</span>
        <span class="sq-step-title">${esc(step.title)}</span>
        <span class="sq-step-more">Details ${icon('external')}</span>
      </button>`;
  }

  function gateButton(gate) {
    return `
      <button class="sq-gate sq-gate-${esc(gate.severity)}" data-open-gate="${esc(gate.id)}"
              aria-label="${esc(gate.label)}: ${esc(gate.title)} — open guidance">
        <span class="sq-gate-mark" aria-hidden="true">${icon('alert')}</span>
        <span class="sq-gate-text">
          <span class="sq-gate-label">${esc(gate.label)}</span>
          <span class="sq-gate-title">${esc(gate.title)}</span>
          <span class="sq-gate-sum">${esc(gate.summary)}</span>
        </span>
      </button>`;
  }

  /* Gates sit in a band between the two tracks, aligned to the phase after
     which they bite. The grid column is derived so they line up on desktop. */
  function gateBand() {
    const cols = spec.phases.map(p => p.id);
    return `
      <div class="sq-gateband" role="list">
        ${spec.gates.map(g => {
          const i = Math.max(0, cols.indexOf(g.afterPhase));
          return `<div class="sq-gate-cell" role="listitem" style="--col:${i + 1}">${gateButton(g)}</div>`;
        }).join('')}
      </div>`;
  }

  function trackRow(track) {
    return `
      <div class="sq-track sq-track-${esc(track.id)}">
        <div class="sq-track-head">
          <span class="sq-track-icon" aria-hidden="true">${esc(track.icon)}</span>
          <span class="sq-track-labels">
            <span class="sq-track-label">${esc(track.label)}</span>
            <span class="sq-track-bodies">${esc(track.bodies)}</span>
          </span>
        </div>
        <div class="sq-track-cells">
          ${spec.phases.map(p => {
            const step = spec.steps.find(s => s.track === track.id && s.phase === p.id);
            return `<div class="sq-cell">${step ? stepCard(step) : ''}</div>`;
          }).join('')}
        </div>
      </div>`;
  }

  function render() {
    const el = $('#sequencing-slot');
    if (!el || !spec) return;

    el.innerHTML = `
      <div class="section-head">
        <h2>${esc(spec.title)}</h2>
        <button class="btn btn-small" id="sq-toggle" aria-expanded="false"
                aria-controls="sq-board">Show chart</button>
      </div>
      <p class="section-note secondary">${esc(spec.intro)}</p>

      <div class="sq-board is-hidden" id="sq-board">
        <div class="sq-scroll" role="group" aria-label="Approval sequencing, two tracks by four phases">
          <div class="sq-inner">
            <div class="sq-phases" aria-hidden="true">
              ${spec.phases.map(p => `
                <div class="sq-phase">
                  <span class="sq-phase-label">${esc(p.label)}</span>
                  <span class="sq-phase-name">${esc(p.name)}</span>
                </div>`).join('')}
            </div>

            ${trackRow(spec.tracks[0])}
            ${gateBand()}
            ${trackRow(spec.tracks[1])}
          </div>
        </div>

        <p class="sq-caution small">
          ${icon('shield')} ${esc(spec.caution)}
        </p>
      </div>`;
  }

  /* ---------------------------------------------------------------- drawer */

  function drawerBody(item, kind) {
    const list = (item.questions || []).length ? `
      <h4>Ask the applicant</h4>
      <ul class="sq-qs">${item.questions.map(q => `<li>${esc(q)}</li>`).join('')}</ul>` : '';

    return `
      <div class="sq-drawer-head">
        <div>
          <div class="eyebrow">${kind === 'gate'
            ? `${esc(item.label)} · dependency gate` : 'Sequencing step'}</div>
          <h3 id="sq-drawer-title">${esc(item.title)}</h3>
        </div>
        <button class="icon-btn" id="sq-close" aria-label="Close">${icon('cross')}</button>
      </div>

      <div class="sq-drawer-body">
        <p class="sq-lede">${esc(item.detail)}</p>

        <h4>What this means for your review</h4>
        <p>${esc(item.planner)}</p>

        ${list}

        ${item.watch ? `
          <div class="notice sq-watch">
            <strong>Watch for:</strong> ${esc(item.watch)}
          </div>` : ''}

        <div class="sq-drawer-foot">
          ${A.tierChip(item.sourceTier)}
          ${item.source
            ? `<a href="${esc(safeUrl(item.source))}" target="_blank" rel="noopener">${esc(item.sourceName)} ↗</a>`
            : `<span class="muted">${esc(item.sourceName || 'No source — verify independently')}</span>`}
        </div>
      </div>`;
  }

  function openDrawer(item, kind, trigger) {
    lastFocus = trigger || document.activeElement;
    const d = $('#sq-drawer');
    d.innerHTML = drawerBody(item, kind);
    d.hidden = false;
    $('#sq-scrim').hidden = false;
    requestAnimationFrame(() => {
      d.classList.add('is-open');
      $('#sq-scrim').classList.add('is-open');
      $('#sq-close')?.focus();
    });
    document.addEventListener('keydown', onKey);
  }

  function closeDrawer() {
    const d = $('#sq-drawer'), s = $('#sq-scrim');
    if (!d || d.hidden) return;
    d.classList.remove('is-open');
    s.classList.remove('is-open');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => { d.hidden = true; s.hidden = true; d.innerHTML = ''; }, 200);
    lastFocus?.focus();
  }

  function onKey(e) {
    if (e.key === 'Escape') { closeDrawer(); return; }
    if (e.key !== 'Tab') return;
    // Keep focus inside the drawer while it is open.
    const f = $('#sq-drawer').querySelectorAll('a[href], button, [tabindex]:not([tabindex="-1"])');
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ------------------------------------------------------------------ wire */

  function wire() {
    document.addEventListener('click', e => {
      const s = e.target.closest('[data-open-step]');
      if (s) {
        const step = spec.steps.find(x => x.id === s.dataset.openStep);
        if (step) openDrawer(step, 'step', s);
        return;
      }
      const g = e.target.closest('[data-open-gate]');
      if (g) {
        const gate = spec.gates.find(x => x.id === g.dataset.openGate);
        if (gate) openDrawer(gate, 'gate', g);
        return;
      }
      if (e.target.closest('#sq-close') || e.target.closest('#sq-scrim')) closeDrawer();

      const t = e.target.closest('#sq-toggle');
      if (t) {
        const board = $('#sq-board');
        const hidden = board.classList.toggle('is-hidden');
        t.setAttribute('aria-expanded', String(!hidden));
        t.textContent = hidden ? 'Show chart' : 'Hide chart';
      }
    });
  }

  async function init() {
    if (!$('#sequencing-slot')) return;
    spec = await A.loadData('sequencing', null);
    if (!spec) {
      $('#sequencing-slot').innerHTML =
        `<div class="empty-state">The sequencing chart could not be loaded.</div>`;
      return;
    }
    render();
    wire();
  }

  window.ADCHSequencing = { init };
  document.addEventListener('DOMContentLoaded', init);
})();
