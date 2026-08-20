/* ============================================================================
   Approvals process flow — provincial through municipal, ending at occupancy.

   Five lanes (who decides) by five phases (when), with dependency connectors
   drawn from real layout positions so the arrows are true rather than
   decorative. Anything sharing a column runs concurrently; anything joined by
   an arrow does not.

   Connectors are drawn after layout and redrawn on resize, because their
   geometry depends on where the browser actually put the cards.

   window.ADCHApprovals
   ========================================================================= */

(function () {
  'use strict';

  const A = window.ADCH;
  const { $, $$, esc, safeUrl, icon, statusBadge } = A;

  let spec = null;
  let root = null;
  let showCriticalOnly = false;
  let lastFocus = null;

  const node = id => spec.nodes.find(n => n.id === id);

  /* ---------------------------------------------------------------- render */

  function nodeCard(n) {
    const dim = showCriticalOnly && !n.critical;
    return `
      <button class="ap-node ${n.critical ? 'is-critical' : ''} ${n.startNow ? 'is-start' : ''}
                     ${n.isEnd ? 'is-end' : ''} ${dim ? 'is-dim' : ''}"
              id="apn-${esc(n.id)}" data-node="${esc(n.id)}"
              aria-label="${esc(n.title)}, ${esc(n.authority)} — open detail">
        <span class="ap-node-authority">${esc(n.authority)}</span>
        <span class="ap-node-title">${esc(n.title)}</span>
        <span class="ap-node-badges">
          ${n.startNow ? '<span class="ap-tag ap-tag-start">Start now</span>' : ''}
          ${n.optional ? '<span class="ap-tag ap-tag-opt">If required</span>' : ''}
          ${n.blocksOccupancy ? '<span class="ap-tag ap-tag-block">Blocks occupancy</span>' : ''}
        </span>
      </button>`;
  }

  function render() {
    root.innerHTML = `
      <div class="ap-head">
        <div>
          <h2 class="ap-title">${esc(spec.title)}</h2>
          <p class="ap-intro">${esc(spec.intro)}</p>
        </div>
        <div class="ap-controls">
          <button class="btn btn-small ${showCriticalOnly ? 'is-on' : ''}" id="ap-critical"
                  aria-pressed="${showCriticalOnly}">
            ${showCriticalOnly ? 'Show everything' : 'Highlight critical path'}
          </button>
        </div>
      </div>

      <div class="ap-legend" role="list">
        <span role="listitem"><i class="ap-key ap-key-critical"></i>Critical path — sets the end date</span>
        <span role="listitem"><i class="ap-key ap-key-start"></i>Start in week one</span>
        <span role="listitem"><i class="ap-key ap-key-arrow"></i>Must finish before</span>
        <span role="listitem"><i class="ap-key ap-key-parallel"></i>Same column runs concurrently</span>
      </div>

      <div class="ap-scroll">
        <div class="ap-grid" id="ap-grid"
             style="--phases:${spec.phases.length}">
          <div class="ap-corner"></div>
          ${spec.phases.map(p => `
            <div class="ap-phase">
              <span class="ap-phase-label">${esc(p.label)}</span>
              <span class="ap-phase-name">${esc(p.name)}</span>
              <span class="ap-phase-sub">${esc(p.sub)}</span>
            </div>`).join('')}

          ${spec.lanes.map(l => `
            <div class="ap-lane-head ap-hue-${esc(l.hue)}">
              <span class="ap-lane-label">${esc(l.label)}</span>
              <span class="ap-lane-body">${esc(l.body)}</span>
              <span class="ap-lane-note">${esc(l.note)}</span>
            </div>
            ${spec.phases.map(p => {
              const ns = spec.nodes.filter(n => n.lane === l.id && n.phase === p.id);
              return `<div class="ap-cell ap-hue-${esc(l.hue)}">${ns.map(nodeCard).join('')}</div>`;
            }).join('')}`).join('')}

          <svg class="ap-wires" id="ap-wires" aria-hidden="true"></svg>
        </div>
      </div>

      <div class="ap-insights">
        ${spec.insights.map(i => `
          <div class="ap-insight ap-insight-${esc(i.tone)}">
            <span class="ap-insight-icon">${icon(i.icon)}</span>
            <div>
              <div class="ap-insight-title">${esc(i.title)}</div>
              <p class="ap-insight-text">${esc(i.text)}</p>
            </div>
          </div>`).join('')}
      </div>

      <p class="ap-caution small">${icon('shield')} ${esc(spec.caution)}</p>`;

    requestAnimationFrame(drawWires);
  }

  /* ----------------------------------------------------------------- wires */

  /* Two routings, because one shape cannot serve both cases honestly.
     Left-to-right when the dependency crosses phases; top-to-bottom when both
     sit in the same phase column, which otherwise drags a long diagonal across
     every lane between them. */
  function path(a, b, box) {
    const sameColumn = Math.abs((a.left + a.width / 2) - (b.left + b.width / 2)) < a.width * 0.6;

    if (sameColumn) {
      const x1 = a.left + a.width / 2 - box.left;
      const x2 = b.left + b.width / 2 - box.left;
      const goingDown = b.top > a.top;
      const y1 = (goingDown ? a.bottom : a.top) - box.top;
      const y2 = (goingDown ? b.top : b.bottom) - box.top;
      const dy = Math.max(16, Math.abs(y2 - y1) * 0.4);
      return `M ${x1} ${y1} C ${x1} ${y1 + (goingDown ? dy : -dy)}, ` +
             `${x2} ${y2 - (goingDown ? dy : -dy)}, ${x2} ${y2}`;
    }

    const x1 = a.right - box.left, y1 = a.top + a.height / 2 - box.top;
    const x2 = b.left - box.left,  y2 = b.top + b.height / 2 - box.top;
    const dx = Math.max(18, (x2 - x1) * 0.45);
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  }

  function drawWires() {
    const svg = $('#ap-wires'), grid = $('#ap-grid');
    if (!svg || !grid) return;
    const box = grid.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    svg.setAttribute('width', box.width);
    svg.setAttribute('height', box.height);

    const parts = [`
      <defs>
        <marker id="ap-arrow" viewBox="0 0 8 8" refX="7" refY="4"
                markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L8 4 L0 8 z" class="ap-arrowhead"/>
        </marker>
        <marker id="ap-arrow-crit" viewBox="0 0 8 8" refX="7" refY="4"
                markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M0 0 L8 4 L0 8 z" class="ap-arrowhead-crit"/>
        </marker>
      </defs>`];

    for (const n of spec.nodes) {
      for (const depId of n.dependsOn || []) {
        const from = document.getElementById(`apn-${depId}`);
        const to = document.getElementById(`apn-${n.id}`);
        if (!from || !to) continue;
        const crit = n.critical && node(depId)?.critical;
        const dim = showCriticalOnly && !crit;
        parts.push(`<path class="ap-wire ${crit ? 'is-critical' : ''} ${dim ? 'is-dim' : ''}"
                      d="${path(from.getBoundingClientRect(), to.getBoundingClientRect(), box)}"
                      marker-end="url(#${crit ? 'ap-arrow-crit' : 'ap-arrow'})"/>`);
      }
    }
    svg.innerHTML = parts.join('');
  }

  /* ---------------------------------------------------------------- drawer */

  function openDrawer(n, trigger) {
    lastFocus = trigger || document.activeElement;
    const deps = (n.dependsOn || []).map(id => node(id)).filter(Boolean);
    const blocks = spec.nodes.filter(x => (x.dependsOn || []).includes(n.id));
    const concurrent = spec.nodes.filter(x =>
      x.phase === n.phase && x.id !== n.id && x.lane !== n.lane);

    const d = $('#ap-drawer');
    d.innerHTML = `
      <div class="sq-drawer-head">
        <div>
          <div class="eyebrow">${esc(n.authority)}</div>
          <h3 id="ap-drawer-title">${esc(n.title)}</h3>
        </div>
        <button class="icon-btn" id="ap-close" aria-label="Close">${icon('cross')}</button>
      </div>
      <div class="sq-drawer-body">
        <p class="sq-lede">${esc(n.what)}</p>
        ${n.why ? `<h4>Why it matters</h4><p>${esc(n.why)}</p>` : ''}

        ${deps.length ? `<h4>Cannot start until</h4>
          <ul class="ap-rel">${deps.map(x =>
            `<li><button class="ap-jump" data-node="${esc(x.id)}">${esc(x.title)}</button>
             <span class="muted">${esc(x.authority)}</span></li>`).join('')}</ul>` : ''}

        ${blocks.length ? `<h4>Blocks</h4>
          <ul class="ap-rel">${blocks.map(x =>
            `<li><button class="ap-jump" data-node="${esc(x.id)}">${esc(x.title)}</button>
             <span class="muted">${esc(x.authority)}</span></li>`).join('')}</ul>` : ''}

        ${concurrent.length ? `<h4>Can run at the same time as</h4>
          <ul class="ap-rel ap-rel-flat">${concurrent.map(x =>
            `<li><button class="ap-jump" data-node="${esc(x.id)}">${esc(x.title)}</button></li>`).join('')}</ul>` : ''}

        ${n.startLink ? `
          <div class="notice ap-start">
            <strong>Where this starts:</strong>
            <a href="${esc(safeUrl(n.startLink))}" target="_blank" rel="noopener">${esc(n.startLabel)} ↗</a>
          </div>` : ''}

        <div class="sq-drawer-foot">${A.tierChip(n.sourceTier)}</div>
      </div>`;
    d.hidden = false;
    $('#ap-scrim').hidden = false;
    requestAnimationFrame(() => {
      d.classList.add('is-open');
      $('#ap-scrim').classList.add('is-open');
      $('#ap-close')?.focus();
    });
    document.addEventListener('keydown', onKey);
  }

  function closeDrawer() {
    const d = $('#ap-drawer'), s = $('#ap-scrim');
    if (!d || d.hidden) return;
    d.classList.remove('is-open'); s.classList.remove('is-open');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => { d.hidden = true; s.hidden = true; d.innerHTML = ''; }, 200);
    lastFocus?.focus();
  }

  function onKey(e) {
    if (e.key === 'Escape') { closeDrawer(); return; }
    if (e.key !== 'Tab') return;
    const f = $('#ap-drawer').querySelectorAll('a[href], button');
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ------------------------------------------------------------------ wire */

  function wire() {
    document.addEventListener('click', e => {
      const jump = e.target.closest('.ap-jump');
      if (jump) { const n = node(jump.dataset.node); if (n) openDrawer(n, jump); return; }
      const card = e.target.closest('[data-node]');
      if (card && root.contains(card)) { const n = node(card.dataset.node); if (n) openDrawer(n, card); return; }
      if (e.target.closest('#ap-close') || e.target.closest('#ap-scrim')) closeDrawer();
      if (e.target.closest('#ap-critical')) { showCriticalOnly = !showCriticalOnly; render(); }
    });
    let t;
    window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(drawWires, 120); });
  }

  async function init() {
    root = $('#approvals-slot');
    if (!root) return;
    spec = await A.loadData('approvals', null);
    if (!spec) { root.innerHTML = '<div class="empty-state">The approvals map could not be loaded.</div>'; return; }
    render();
    wire();
    // Fonts and late layout shift the cards; redraw once things settle.
    setTimeout(drawWires, 350);
    if (document.fonts?.ready) document.fonts.ready.then(drawWires);
  }

  window.ADCHApprovals = { init, drawWires };
  document.addEventListener('DOMContentLoaded', init);
})();
