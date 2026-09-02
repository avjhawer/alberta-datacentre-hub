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
  let variant = 'grid';

  const node = id => spec.nodes.find(n => n.id === id);

  /* A node, lane note or insight with no `variants` belongs to every route.
     The grid route was the silent assumption before the off-grid one existed,
     so "unmarked means both" keeps every existing record correct. */
  const inRoute = x => !x.variants || x.variants.includes(variant);
  const routeNodes = () => spec.nodes.filter(inRoute);
  const routeMeta = () => (spec.variants || []).find(v => v.id === variant) || {};

  /* `optional` means "only some projects need this". Off the grid, on-site
     generation is not one of those — it is the entire power supply. So the
     flag is carried per route rather than as a fixed property of the step. */
  const isOptional = n => n.optional || (n.optionalIn ? n.optionalIn.includes(variant) : false);
  const isRequiredHere = n => !!n.optionalIn && !n.optionalIn.includes(variant);

  /* Lane heads read differently on the off-grid route: same lane, same job,
     different actors. Overrides live in the data, not here. */
  function laneFor(l) {
    return Object.assign({}, l, (l.byVariant || {})[variant] || {});
  }

  /* ---------------------------------------------------------------- render */

  /* Paired approvals used to be joined by a dashed line. Across a five-lane
     grid that line has to cross whatever lies between, and on paper it was the
     single hardest thing on the sheet to follow — it looked like it joined the
     cards it passed over. A pair carries no sequence, so it does not need a
     line at all: a shared letter on both cards says the same thing and can be
     read without tracing anything. */
  let pairLetters = new Map();
  function assignPairs() {
    pairLetters = new Map();
    const seen = new Set();
    let next = 0;
    for (const n of routeNodes()) {
      for (const pid of n.pairedWith || []) {
        const other = node(pid);
        if (!other || !inRoute(other)) continue;
        const key = [n.id, pid].sort().join('~');
        if (seen.has(key)) continue;
        seen.add(key);
        const letter = String.fromCharCode(65 + next++);
        pairLetters.set(n.id, letter);
        pairLetters.set(pid, letter);
      }
    }
  }

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
          ${isOptional(n) ? '<span class="ap-tag ap-tag-opt">If required</span>' : ''}
          ${isRequiredHere(n) ? '<span class="ap-tag ap-tag-req">Required on this route</span>' : ''}
          ${n.blocksOccupancy ? '<span class="ap-tag ap-tag-block">Blocks occupancy</span>' : ''}
          ${pairLetters.has(n.id)
            ? `<span class="ap-tag ap-tag-pair">Pair ${esc(pairLetters.get(n.id))}</span>` : ''}
        </span>
      </button>`;
  }

  /* A rail down the left saying, for each block of lanes, which order of
     government is deciding. The question "is this mine or theirs?" is the one
     a planner asks first, and the lane labels alone did not answer it. */
  function levelBands() {
    const bands = [];
    let row = 2;                                  // row 1 is the phase header
    let i = 0;
    while (i < spec.lanes.length) {
      const level = spec.lanes[i].level;
      let span = 1;
      while (i + span < spec.lanes.length && spec.lanes[i + span].level === level) span++;
      const meta = (spec.levels || []).find(l => l.id === level) || { label: level, note: '' };
      // The rail text is rotated, so its length is a *height*. A band of one
      // lane cannot afford forty characters — it would set the row height for
      // the whole lane. The full wording stays on the lane tag and the drawer.
      bands.push(`
        <div class="ap-level ap-level-${esc(level)}"
             style="grid-row:${row} / span ${span};grid-column:1"
             title="${esc(meta.note)}">
          <span class="ap-level-text">${esc(meta.short || meta.label)}</span>
        </div>`);
      row += span; i += span;
    }
    return bands.join('');
  }

  function render() {
    assignPairs();
    root.innerHTML = `
      <div class="ap-head">
        <div>
          <h2 class="ap-title">${esc(spec.title)}</h2>
          <p class="ap-intro">${esc(routeMeta().intro || spec.intro)}</p>
        </div>
        <div class="ap-controls">
          ${(spec.variants || []).length > 1 ? `
            <div class="seg ap-routes" id="ap-routes" role="group" aria-label="How the site is powered">
              ${spec.variants.map(v => `
                <button class="seg-btn ${v.id === variant ? 'is-on' : ''}" data-route="${esc(v.id)}"
                        aria-pressed="${v.id === variant}" title="${esc(v.note)}">${esc(v.short)}</button>`).join('')}
            </div>` : ''}
          <button class="btn btn-small ${showCriticalOnly ? 'is-on' : ''}" id="ap-critical"
                  aria-pressed="${showCriticalOnly}">
            ${showCriticalOnly ? 'Show everything' : 'Highlight critical path'}
          </button>
          <a class="btn btn-small" id="ap-print" href="approvals-print.html?route=${esc(variant)}"
             target="_blank" rel="noopener">Print / PDF</a>
        </div>
      </div>

      <p class="ap-route-note small">${esc(routeMeta().note || '')}</p>

      <div class="ap-legend" role="list">
        <span role="listitem"><i class="ap-key ap-key-critical"></i>Critical path — sets the end date</span>
        <span role="listitem"><i class="ap-key ap-key-start"></i>Start in week one</span>
        <span role="listitem"><i class="ap-key ap-key-arrow"></i>Must finish before</span>
        <span role="listitem"><i class="ap-key ap-key-parallel"></i>Same column runs concurrently</span>
        <span role="listitem"><i class="ap-key ap-key-pair">A</i>Same letter: both required, neither authorises the other</span>
      </div>

      <div class="ap-scroll">
        <div class="ap-grid" id="ap-grid"
             style="--phases:${spec.phases.length}">
          <div class="ap-corner" style="grid-row:1;grid-column:1 / span 2"></div>
          ${spec.phases.map((p, pi) => `
            <div class="ap-phase" style="grid-row:1;grid-column:${pi + 3}">
              <span class="ap-phase-label">${esc(p.label)}</span>
              <span class="ap-phase-name">${esc(p.name)}</span>
              <span class="ap-phase-sub">${esc(p.sub)}</span>
            </div>`).join('')}

          ${levelBands()}

          ${spec.lanes.map((raw, li) => {
            const l = laneFor(raw);
            return `
            <div class="ap-lane-head ap-hue-${esc(l.hue)}" style="grid-row:${li + 2};grid-column:2">
              <span class="ap-lane-label">${esc(l.label)}</span>
              <span class="ap-lane-level ap-level-tag-${esc(l.level)}">${
                esc((spec.levels || []).find(x => x.id === l.level)?.label || l.level)}</span>
              <span class="ap-lane-body">${esc(l.body)}</span>
              <span class="ap-lane-note">${esc(l.note)}</span>
            </div>
            ${spec.phases.map((p, pi) => {
              const ns = routeNodes().filter(n => n.lane === raw.id && n.phase === p.id);
              return `<div class="ap-cell ap-hue-${esc(l.hue)}"
                           style="grid-row:${li + 2};grid-column:${pi + 3}">${ns.map(nodeCard).join('')}</div>`;
            }).join('')}`;
          }).join('')}

          <svg class="ap-wires" id="ap-wires" aria-hidden="true"></svg>
        </div>
      </div>

      <div class="ap-insights">
        ${spec.insights.filter(inRoute).map(i => `
          <div class="ap-insight ap-insight-${esc(i.tone)}">
            <span class="ap-insight-icon">${icon(i.icon)}</span>
            <div>
              <div class="ap-insight-title">${esc(i.title)}</div>
              <p class="ap-insight-text">${esc(i.text)}</p>
            </div>
          </div>`).join('')}
      </div>

      <p class="ap-caution small">${icon('shield')} ${esc(spec.caution)}</p>`;

    observeGrid();
    requestAnimationFrame(drawWires);
  }

  /* Connectors are computed from where the browser actually put the cards, so
     any layout change invalidates them — including a print stylesheet, which
     changes the layout without firing `resize`. Watching the grid box catches
     every cause. render() rebuilds the grid, so the observer follows it. */
  let gridObserver = null;
  function observeGrid() {
    if (!window.ResizeObserver) return;
    gridObserver?.disconnect();
    const grid = $('#ap-grid');
    if (!grid) return;
    gridObserver = new ResizeObserver(() => drawWires());
    gridObserver.observe(grid);
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

    /* Transitive reduction. An edge that a longer chain already implies adds
       ink and no information — and the one such edge here (the development
       permit decision straight to occupancy, which the building permit and
       inspections already carry) was also the only connector on the sheet that
       ran across cards it did not join. The drawer still lists every
       dependency; only the redundant *line* is dropped. */
    const deps = new Map(routeNodes().map(n =>
      [n.id, (n.dependsOn || []).filter(id => inRoute(node(id) || {}))]));
    /* deps maps a node to what must finish before it, so walk backwards: is
       `dep` an ancestor of `n` through some *other* parent of `n`? */
    const ancestorOf = (target, id, seen = new Set()) => {
      if (seen.has(target)) return false;
      seen.add(target);
      for (const parent of deps.get(target) || []) {
        if (parent === id || ancestorOf(parent, id, seen)) return true;
      }
      return false;
    };
    const implied = (depId, n) =>
      (deps.get(n.id) || []).some(other => other !== depId && ancestorOf(other, depId));

    // Only sequence is drawn as a line. Pairing is a letter on both cards —
    // see assignPairs.
    for (const n of routeNodes()) {
      for (const depId of n.dependsOn || []) {
        if (!inRoute(node(depId) || {})) continue;
        if (implied(depId, n)) continue;
        const from = document.getElementById(`apn-${depId}`);
        const to = document.getElementById(`apn-${n.id}`);
        if (!from || !to) continue;
        const crit = n.critical && node(depId)?.critical;
        const dim = showCriticalOnly && !crit;
        parts.push(`<path class="ap-wire ${crit ? 'is-critical' : ''} ${dim ? 'is-dim' : ''}"
                      data-from="${esc(depId)}" data-to="${esc(n.id)}"
                      d="${path(from.getBoundingClientRect(), to.getBoundingClientRect(), box)}"
                      marker-end="url(#${crit ? 'ap-arrow-crit' : 'ap-arrow'})"/>`);
      }
    }
    svg.innerHTML = parts.join('');
  }

  /* ---------------------------------------------------------------- drawer */

  function openDrawer(n, trigger) {
    lastFocus = trigger || document.activeElement;
    // Every relationship is filtered to the route on show: listing a step that
    // is not on the diagram in front of the reader would be worse than useless.
    const deps = (n.dependsOn || []).map(id => node(id)).filter(x => x && inRoute(x));
    const blocks = routeNodes().filter(x => (x.dependsOn || []).includes(n.id));
    const concurrent = routeNodes().filter(x =>
      x.phase === n.phase && x.id !== n.id && x.lane !== n.lane);
    // Pairing is symmetric even though the data records it on one side.
    const paired = routeNodes().filter(x =>
      (n.pairedWith || []).includes(x.id) || (x.pairedWith || []).includes(n.id));
    const lane = laneFor(spec.lanes.find(l => l.id === n.lane) || {});
    const levelMeta = (spec.levels || []).find(l => l.id === lane?.level);

    const d = $('#ap-drawer');
    d.innerHTML = `
      <div class="sq-drawer-head">
        <div>
          <div class="eyebrow">${esc(n.authority)}</div>
          <div class="ap-drawer-level ap-level-tag-${esc(lane?.level || '')}">${
            esc(levelMeta?.label || '')}</div>
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

        ${paired.length ? `<h4>Both of these are required</h4>
          <p class="ap-pair-note">Separate applications on separate records. Neither one authorises
             the other, and approval of one does not oblige the other.</p>
          <ul class="ap-rel">${paired.map(x =>
            `<li><button class="ap-jump" data-node="${esc(x.id)}">${esc(x.title)}</button>
             <span class="muted">${esc(x.authority)}</span></li>`).join('')}</ul>` : ''}

        ${n.watch ? `<div class="notice ap-watch"><strong>Watch for:</strong> ${esc(n.watch)}</div>` : ''}

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
      if (e.target.closest('#ap-critical')) { showCriticalOnly = !showCriticalOnly; render(); return; }
      const route = e.target.closest('[data-route]');
      if (route && root.contains(route)) { variant = route.dataset.route; render(); }
    });
    let t;
    window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(drawWires, 120); });

    // Print styles resize the grid without firing `resize`, so the PDF used to
    // come out with the arrows drawn for the on-screen layout. Watching the
    // grid box itself catches every cause, print included.
    window.addEventListener('beforeprint', drawWires);
  }

  async function init() {
    root = $('#approvals-slot');
    if (!root) return;
    spec = await A.loadData('approvals', null);
    if (!spec) { root.innerHTML = '<div class="empty-state">The approvals map could not be loaded.</div>'; return; }
    const asked = new URLSearchParams(location.search).get('route');
    if (asked && (spec.variants || []).some(v => v.id === asked)) variant = asked;
    render();
    wire();
    // Fonts and late layout shift the cards; redraw once things settle.
    setTimeout(drawWires, 350);
    if (document.fonts?.ready) document.fonts.ready.then(drawWires);
  }

  window.ADCHApprovals = {
    init, drawWires,
    setRoute(id) { if ((spec?.variants || []).some(v => v.id === id)) { variant = id; render(); } },
    route: () => variant,
  };
  document.addEventListener('DOMContentLoaded', init);
})();
