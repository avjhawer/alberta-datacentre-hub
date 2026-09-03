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
                     ${n.isEnd ? 'is-end' : ''} ${n.emphasis === 'risk' ? 'is-risk' : ''}
                     ${dim ? 'is-dim' : ''}"
              id="apn-${esc(n.id)}" data-node="${esc(n.id)}"
              aria-label="${esc(n.title)}, ${esc(n.authority)} — open detail">
        <span class="ap-node-authority">${esc(n.authority)}</span>
        <span class="ap-node-title">${esc(n.title)}</span>
        <span class="ap-node-badges">
          ${n.startNow ? '<span class="ap-tag ap-tag-start">Start now</span>' : ''}
          ${isOptional(n) ? '<span class="ap-tag ap-tag-opt">If required</span>' : ''}
          ${isRequiredHere(n) ? '<span class="ap-tag ap-tag-req">Required on this route</span>' : ''}
          ${n.blocksOccupancy ? '<span class="ap-tag ap-tag-block">Blocks occupancy</span>' : ''}
          ${n.blocksNote ? `<span class="ap-tag ap-tag-block">${esc(n.blocksNote)}</span>` : ''}
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
             target="_blank" rel="noopener">Print sheet</a>
          <a class="btn btn-small" id="ap-download" download
             href="downloads/alberta-data-centre-approvals-${
               variant === 'offgrid' ? 'off-grid' : 'grid-connected'}.pdf">Download PDF</a>
        </div>
      </div>

      <p class="ap-route-note small">${esc(routeMeta().note || '')}</p>

      <div class="ap-legend" role="list">
        <span role="listitem"><i class="ap-key ap-key-critical"></i>Critical path — delay here moves the finish date</span>
        <span role="listitem"><i class="ap-key ap-key-arrow"></i>Arrow: must finish before</span>
        <span role="listitem"><i class="ap-key ap-key-parallel"></i>Same column: same stage, no order implied between them</span>
        <span role="listitem"><i class="ap-key ap-key-pair">A</i>The same letter on two cards:
          one thing, two applications — both required, neither authorises the other</span>
      </div>
      <div class="ap-legend ap-legend-badges" role="list">
        <span role="listitem"><span class="ap-tag ap-tag-start">Start now</span>Independent of everything else — begin in week one</span>
        <span role="listitem"><span class="ap-tag ap-tag-opt">If required</span>Only some projects engage this</span>
        <span role="listitem"><span class="ap-tag ap-tag-req">Required on this route</span>Conditional on the other route, not this one</span>
        <span role="listitem"><span class="ap-tag ap-tag-block">Blocks …</span>Blocks what it names — that step cannot start until this is done</span>
        <span role="listitem"><i class="ap-key ap-key-lane"></i>Lane colour marks which authority decides — it is not a ranking</span>
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
              /* Two cards stacked in one cell with a dependency between them get
                 a wider gap. The default 8px is not enough room to draw an arrow
                 in: the building permit to inspections link came out as a red
                 stub with a head bigger than the line. */
              const linked = ns.some((x, i) => ns.slice(i + 1).some(y =>
                (y.dependsOn || []).includes(x.id) || (x.dependsOn || []).includes(y.id)));
              return `<div class="ap-cell ${linked ? 'is-linked' : ''} ap-hue-${esc(l.hue)}"
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
     every lane between them.

     `anchors` carries where on each card's edge this particular line should
     attach — see spreadAnchors. Everything lands on a midpoint when a card has
     only one line on that side. */
  function path(a, b, box, vertical, anchors) {
    const { from, to } = anchors;

    if (vertical) {
      const x1 = a.left + a.width * from - box.left;
      const x2 = b.left + b.width * to - box.left;
      const goingDown = b.top > a.top;
      const y1 = (goingDown ? a.bottom : a.top) - box.top;
      const y2 = (goingDown ? b.top : b.bottom) - box.top;
      const dy = Math.min(60, Math.max(8, Math.abs(y2 - y1) * 0.4));
      return `M ${x1} ${y1} C ${x1} ${y1 + (goingDown ? dy : -dy)}, ` +
             `${x2} ${y2 - (goingDown ? dy : -dy)}, ${x2} ${y2}`;
    }

    const x1 = a.right - box.left, y1 = a.top + a.height * from - box.top;
    const x2 = b.left - box.left,  y2 = b.top + b.height * to - box.top;
    /* Bounded both ways. A flat 18px minimum bulged the short hops between
       adjacent columns into an S in a 21px gutter; an unbounded 45% swung the
       long ones wide.

       `bow` separates lines that share a channel. Four connectors leave the
       Phase 3 municipal cell for Phase 4, and with one dx they ran as a single
       rope down the column gutter — spread at their ends, indistinguishable in
       the middle. Each gets its own curvature instead. */
    const dx = Math.min(60, Math.max(7, (x2 - x1) * 0.4)) + (anchors.bow || 0);
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  }

  /* Where several lines meet the same card edge, share it out along that edge
     instead of stacking them all on the midpoint. Two arrows ending on the same
     point drew two heads at different angles on top of each other, which read as
     one lumpy broken arrow — the substation construction card had exactly that,
     with the connection agreement and the AUC permit both landing on it.

     Ordered by the far end's position so the lines do not cross each other on
     the way in, and capped so nothing creeps into a rounded corner. */
  function spreadAnchors(edges) {
    const share = (keyOf, along, field) => {
      const groups = new Map();
      for (const e of edges) {
        const k = keyOf(e);
        if (k == null) continue;
        (groups.get(k) || groups.set(k, []).get(k)).push(e);
      }
      for (const list of groups.values()) {
        list.sort((p, q) => along(p) - along(q));
        const n = list.length;
        list.forEach((e, i) => {
          const span = field === 'from' ? (e.vertical ? e.a.width : e.a.height)
                                        : (e.vertical ? e.b.width : e.b.height);
          const frac = n > 1 ? (i + 1) / (n + 1) : 0.5;
          const offset = Math.max(-14, Math.min(14, (frac - 0.5) * span));
          e.anchors[field] = 0.5 + offset / span;
        });
      }
    };
    for (const e of edges) e.anchors = { from: 0.5, to: 0.5 };
    // Horizontal lines attach to vertical edges, so they share out along y and
    // are ordered by the other card's y; vertical lines are the transpose.
    share(e => (e.vertical ? null : `h-in:${e.toId}`),    e => e.a.top,   'to');
    share(e => (e.vertical ? null : `h-out:${e.fromId}`), e => e.b.top,   'from');
    share(e => (e.vertical ? `v-in:${e.toId}` : null),    e => e.a.left,  'to');
    share(e => (e.vertical ? `v-out:${e.fromId}` : null), e => e.b.left,  'from');

    /* Connectors crossing the same column gutter share a narrow channel, and
       with one curvature they ran as a single rope down it. Each gets a bow
       proportional to how far it travels vertically, so a long run swings clear
       of a short hop.

       Continuous rather than ranked, deliberately: bowing by index made two
       lines converging on the same card from adjacent sources swap places and
       cross, because their rank differed while their geometry did not. Scaling
       by distance keeps lines with similar geometry roughly parallel. */
    for (const e of edges) {
      if (e.vertical) continue;
      e.anchors.bow = Math.min(26, Math.abs(e.a.top - e.b.top) * 0.03);
    }
    return edges;
  }

  function drawWires() {
    const svg = $('#ap-wires'), grid = $('#ap-grid');
    if (!svg || !grid) return;
    const box = grid.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    svg.setAttribute('width', box.width);
    svg.setAttribute('height', box.height);

    /* markerUnits="userSpaceOnUse" is the point of this: the default scales the
       arrowhead by the stroke width, so thickening the line for print tripled
       the head and it swallowed the short connectors between adjacent columns.
       Fixed size instead. refX sits on the tip, so the tip lands exactly on the
       card border rather than overshooting into it. */
    const parts = [`
      <defs>
        <marker id="ap-arrow" viewBox="0 0 10 10" refX="10" refY="5"
                markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto">
          <path d="M0.5 1.4 L10 5 L0.5 8.6 z" class="ap-arrowhead"/>
        </marker>
        <marker id="ap-arrow-crit" viewBox="0 0 10 10" refX="10" refY="5"
                markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto">
          <path d="M0.5 1.4 L10 5 L0.5 8.6 z" class="ap-arrowhead-crit"/>
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
    const edges = [];
    for (const n of routeNodes()) {
      for (const depId of n.dependsOn || []) {
        if (!inRoute(node(depId) || {})) continue;
        if (implied(depId, n)) continue;
        const from = document.getElementById(`apn-${depId}`);
        const to = document.getElementById(`apn-${n.id}`);
        if (!from || !to) continue;
        const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
        edges.push({
          fromId: depId, toId: n.id, a, b,
          vertical: Math.abs((a.left + a.width / 2) - (b.left + b.width / 2)) < a.width * 0.6,
          crit: !!(n.critical && node(depId)?.critical),
        });
      }
    }

    for (const e of spreadAnchors(edges)) {
      const dim = showCriticalOnly && !e.crit;
      parts.push(`<path class="ap-wire ${e.crit ? 'is-critical' : ''} ${dim ? 'is-dim' : ''}"
                    data-from="${esc(e.fromId)}" data-to="${esc(e.toId)}"
                    d="${path(e.a, e.b, box, e.vertical, e.anchors)}"
                    marker-end="url(#${e.crit ? 'ap-arrow-crit' : 'ap-arrow'})"/>`);
    }
    svg.innerHTML = parts.join('');
  }

  /* ---------------------------------------------------------------- drawer */

  function openDrawer(n, trigger) {
    lastFocus = trigger || document.activeElement;
    // Every relationship is filtered to the route on show: listing a step that
    // is not on the diagram in front of the reader would be worse than useless.
    const deps = [...(n.dependsOn || []), ...(n.dependsOnBadged || [])]
      .map(id => node(id)).filter(x => x && inRoute(x));
    const blocks = routeNodes().filter(x =>
      (x.dependsOn || []).includes(n.id) || (x.dependsOnBadged || []).includes(n.id));
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
          <p class="ap-pair-note">${pairLetters.has(n.id)
            ? `Marked <strong>Pair ${esc(pairLetters.get(n.id))}</strong> on the diagram. ` : ''}Two
             separate applications on separate records, to two different authorities, for the same
             thing on one site. Neither authorises the other, and a decision on one does not oblige
             the other. There is no order between them — either can be filed or decided first, which
             is why they carry a letter rather than an arrow.</p>
          <ul class="ap-rel">${paired.map(x =>
            `<li><button class="ap-jump" data-node="${esc(x.id)}">${esc(x.title)}</button>
             <span class="muted">${esc(x.authority)}</span></li>`).join('')}</ul>` : ''}

        ${(() => {
          const par = routeNodes().filter(x =>
            (n.parallelTo || []).includes(x.id) || (x.parallelTo || []).includes(n.id));
          const set = (n.standardSetBy || []).map(id => node(id)).filter(x => x && inRoute(x));
          const back = routeNodes().filter(x => (x.standardSetBy || []).includes(n.id));
          let h = '';
          if (par.length) h += `<h4>Required alongside</h4>
            <p class="ap-pair-note">A parallel requirement of the same decision — not a step after
               it, and not something the other one waits for.</p>
            <ul class="ap-rel">${par.map(x =>
              `<li><button class="ap-jump" data-node="${esc(x.id)}">${esc(x.title)}</button>
               <span class="muted">${esc(x.authority)}</span></li>`).join('')}</ul>`;
          if (set.length) h += `<h4>Standard set by</h4>
            <p class="ap-pair-note">Fixed years earlier, at the other end of the file.</p>
            <ul class="ap-rel">${set.map(x =>
              `<li><button class="ap-jump" data-node="${esc(x.id)}">${esc(x.title)}</button></li>`).join('')}</ul>`;
          if (back.length) h += `<h4>Sets the standard for</h4>
            <ul class="ap-rel">${back.map(x =>
              `<li><button class="ap-jump" data-node="${esc(x.id)}">${esc(x.title)}</button></li>`).join('')}</ul>`;
          return h;
        })()}

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
