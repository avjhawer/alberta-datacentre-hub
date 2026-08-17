/* ============================================================================
   Charts — hand-built, no libraries.
   Rules held here (see the design system):
     - form chosen by the data's job: a ratio-against-a-limit is a METER,
       never a pie and never a one-bar bar chart
     - one hue for every bar on nominal categories (no value-ramp)
     - marks are thin; 4px rounded data-end, square at the baseline
     - gridlines solid hairlines, never dashed
     - selective direct labels, never a number on every point
     - every chart ships a table-view twin (the WCAG-clean equivalent)
     - no dual-axis charts anywhere
   ========================================================================= */

(function () {
  const { esc, fmtNum } = window.ADCH;

  /**
   * Wrap a chart and its table twin in a toggle. `render` returns the chart
   * HTML; `rows` is [[label, value], ...] for the table.
   */
  function withTableTwin(id, title, chartHtml, columns, rows) {
    return `
      <div class="viz" id="${esc(id)}">
        <div class="card-head">
          <h3>${esc(title)}</h3>
          <div class="card-action">
            <div class="viz-toggle" role="group" aria-label="${esc(title)} view">
              <button type="button" data-view="chart" aria-pressed="true">Chart</button>
              <button type="button" data-view="table" aria-pressed="false">Table</button>
            </div>
          </div>
        </div>
        <div data-viz-pane="chart">${chartHtml}</div>
        <div data-viz-pane="table" hidden>
          <div class="table-wrap">
            <table class="data">
              <thead><tr>${columns.map((c, i) =>
                `<th${i > 0 ? ' class="num"' : ''}>${esc(c)}</th>`).join('')}</tr></thead>
              <tbody>${rows.map(r => `<tr>${r.map((cell, i) =>
                `<td${i > 0 ? ' class="num"' : ''}>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
            </table>
          </div>
        </div>
      </div>`;
  }

  /** Wire the chart/table toggles inside `root`. */
  function wireVizToggles(root = document) {
    root.querySelectorAll('.viz-toggle').forEach(group => {
      group.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-view]');
        if (!btn) return;
        const viz = btn.closest('.viz');
        const view = btn.dataset.view;
        group.querySelectorAll('button').forEach(b =>
          b.setAttribute('aria-pressed', String(b.dataset.view === view)));
        viz.querySelectorAll('[data-viz-pane]').forEach(p =>
          p.hidden = p.dataset.vizPane !== view);
      });
    });
  }

  /**
   * Meter — a single ratio against a limit.
   * segments: [{label, value, severity}] filling a track of `limit`.
   */
  function meter({ id, title, limit, unit = 'MW', segments, note }) {
    const total = segments.reduce((s, x) => s + x.value, 0);
    const pct = limit > 0 ? Math.min(100, (total / limit) * 100) : 0;
    const isFull = pct >= 99.5;

    // Severity of the fill reflects headroom, not identity.
    const sev = pct >= 99.5 ? 'sev-critical' : pct >= 80 ? 'sev-warning' : '';

    const chart = `
      <div class="meter">
        <div class="meter-track" role="img"
             aria-label="${esc(fmtNum(total))} of ${esc(fmtNum(limit))} ${esc(unit)} allocated, ${pct.toFixed(0)} percent">
          <div class="meter-fill ${sev} ${isFull ? 'is-full' : ''}" style="width:${pct.toFixed(2)}%"></div>
        </div>
        <div class="meter-scale">
          <span>0</span>
          <span>${esc(fmtNum(limit))} ${esc(unit)} cap</span>
        </div>
        <div class="meter-legend">
          <span><strong>${esc(fmtNum(total))} ${esc(unit)}</strong> allocated</span>
          <span class="muted">${esc(fmtNum(Math.max(0, limit - total)))} ${esc(unit)} remaining</span>
        </div>
        ${note ? `<p class="small muted" style="margin:0">${esc(note)}</p>` : ''}
      </div>`;

    return withTableTwin(
      id, title, chart,
      ['Measure', `${unit}`],
      [
        ['Interim cap', fmtNum(limit)],
        ['Allocated', fmtNum(total)],
        ['Remaining', fmtNum(Math.max(0, limit - total))],
      ]
    );
  }

  /**
   * Horizontal bar chart on nominal categories.
   * One hue for every bar — bar length already encodes magnitude.
   */
  function barChart({ id, title, unit = '', items, valueLabel = 'Value' }) {
    const max = Math.max(1, ...items.map(i => Number(i.value) || 0));
    const chart = `
      <div class="barchart" role="img"
           aria-label="${esc(title)}. ${items.map(i => `${i.label}: ${i.value}`).join('; ')}">
        ${items.map(i => {
          const w = ((Number(i.value) || 0) / max) * 100;
          return `
          <div class="bar-row">
            <div class="bar-label" title="${esc(i.label)}">${esc(i.label)}</div>
            <div class="bar-track"><div class="bar-fill" style="width:${w.toFixed(2)}%"></div></div>
            <div class="bar-value">${esc(fmtNum(i.value))}${esc(unit)}</div>
          </div>`;
        }).join('')}
      </div>`;

    return withTableTwin(
      id, title, chart,
      ['Category', valueLabel],
      items.map(i => [i.label, fmtNum(i.value)])
    );
  }

  /**
   * Sparkline for a stat tile. The trailing segment carries the accent; the
   * rest is de-emphasised. No axis, no labels — the tile's value is the point.
   */
  function sparkline(values, { width = 120, height = 28, recent = 3 } = {}) {
    const vals = values.filter(v => Number.isFinite(v));
    if (vals.length < 2) return '';
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = (max - min) || 1;
    const pad = 3;
    const pt = (v, i) => {
      const x = (i / (vals.length - 1)) * (width - pad * 2) + pad;
      const y = height - pad - ((v - min) / span) * (height - pad * 2);
      return [x, y];
    };
    const pts = vals.map(pt);
    const path = (from) => pts.slice(from).map((p, i) =>
      `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const splitAt = Math.max(0, pts.length - 1 - recent);
    const [lx, ly] = pts[pts.length - 1];

    return `
      <svg class="sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"
           aria-hidden="true" focusable="false">
        <path class="spark-line" d="${path(0)}"/>
        <path class="spark-recent" d="${path(splitAt)}"/>
        <circle class="spark-dot" cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="3"/>
      </svg>`;
  }

  window.ADCHCharts = { meter, barChart, sparkline, withTableTwin, wireVizToggles };
})();
