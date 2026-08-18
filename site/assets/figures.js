/* ============================================================================
   Explanatory figures.

   Diagrams that carry information a sentence cannot: where Alberta's data
   centre activity is, how a project's load compares to the cap, and what
   cooling choice does to water. Hand-drawn SVG from theme tokens, so they
   invert in dark mode and need no assets.

   window.ADCHFigures — each returns an SVG string.
   ========================================================================= */

(function () {
  'use strict';
  const A = window.ADCH;
  const esc = A.esc;

  /* --- Alberta locator map --------------------------------------------------
     A deliberately simplified province outline. It is a locator, not a survey:
     it answers "roughly where is this" and nothing more, which is why it
     carries no scale bar and no boundaries it cannot honestly draw. */
  const PLACES = [
    { id: 'edmonton',  name: 'Edmonton',       x: 148, y: 150, major: true },
    { id: 'calgary',   name: 'Calgary',        x: 150, y: 214, major: true },
    { id: 'sturgeon',  name: 'Sturgeon Co.',   x: 146, y: 138 },
    { id: 'parkland',  name: 'Parkland Co.',   x: 128, y: 152 },
    { id: 'rockyview', name: 'Rocky View Co.', x: 146, y: 205 },
    { id: 'greenview', name: 'MD Greenview',   x: 92,  y: 92 },
    { id: 'olds',      name: 'Olds',           x: 146, y: 190 },
  ];

  function albertaMap(active) {
    const dots = PLACES.map(p => {
      const on = active && (p.id === active);
      return `
        <g class="fig-place ${on ? 'is-on' : ''} ${p.major ? 'is-major' : ''}">
          <circle cx="${p.x}" cy="${p.y}" r="${p.major ? 5 : 3.5}"/>
          <text x="${p.x + 8}" y="${p.y + 3}">${esc(p.name)}</text>
        </g>`;
    }).join('');

    return `
      <svg class="fig fig-map" viewBox="0 0 260 300" role="img"
           aria-label="Simplified locator map of Alberta showing Edmonton, Calgary and the municipalities that appear in this site">
        <path class="fig-land" d="M70 22 L212 22 L212 236 L188 268 L150 286 L96 286 L70 258 Z"/>
        <path class="fig-outline" d="M70 22 L212 22 L212 236 L188 268 L150 286 L96 286 L70 258 Z"/>
        <path class="fig-rockies" d="M70 258 L96 286 L96 210 L82 150 L70 96 Z"/>
        <g class="fig-places">${dots}</g>
        <text class="fig-note" x="130" y="298" text-anchor="middle">Locator only — not to scale</text>
      </svg>`;
  }

  /* --- Load against the cap -------------------------------------------------
     One bar, one limit line. Shows immediately whether a stated load is a
     rounding error against the interim cap or a serious fraction of it. */
  function loadVsCap(mw, capMW) {
    const W = 460, H = 96, pad = 8;
    const max = Math.max(capMW, mw || 0);
    const w = v => Math.max(2, (v / max) * (W - pad * 2));
    const barW = w(mw || 0), capW = w(capMW);
    const pct = capMW ? Math.round(((mw || 0) / capMW) * 100) : 0;

    return `
      <svg class="fig fig-bar" viewBox="0 0 ${W} ${H}" role="img"
           aria-label="This project's stated load is ${pct}% of the ${capMW} MW interim connection cap">
        <rect class="fig-track" x="${pad}" y="30" width="${W - pad * 2}" height="26" rx="4"/>
        <rect class="fig-value" x="${pad}" y="30" width="${barW}" height="26" rx="4"/>
        <line class="fig-limit" x1="${pad + capW}" y1="20" x2="${pad + capW}" y2="66"/>
        <text class="fig-label" x="${pad}" y="22">This project — ${esc(String(mw || 0))} MW</text>
        <text class="fig-label fig-limit-label" x="${pad + capW}" y="80" text-anchor="end">
          ${esc(String(capMW))} MW cap
        </text>
        <text class="fig-big" x="${pad + barW + 8}" y="49">${pct}%</text>
      </svg>`;
  }

  /* --- Cooling and water ----------------------------------------------------
     Why the cooling question matters: the same building consumes very
     differently depending on one design choice. Bands are indicative of the
     relationship, not quoted volumes — the labels say so. */
  function coolingWater(active) {
    const ROWS = [
      { id: 'air',         label: 'Air-cooled',        band: 6,  note: 'Little or no process water' },
      { id: 'closed-loop', label: 'Closed-loop liquid', band: 18, note: 'Charged once, recirculated' },
      { id: 'hybrid',      label: 'Hybrid',             band: 55, note: 'Switches to evaporative on hot days' },
      { id: 'evaporative', label: 'Evaporative',        band: 92, note: 'Consumes water continuously' },
    ];
    const W = 460, rowH = 40;
    return `
      <svg class="fig fig-cool" viewBox="0 0 ${W} ${ROWS.length * rowH + 26}" role="img"
           aria-label="Relative water consumption by cooling type: air-cooled lowest, evaporative highest">
        ${ROWS.map((r, i) => {
          const y = i * rowH + 8;
          const on = active === r.id;
          return `
            <g class="fig-row ${on ? 'is-on' : ''}">
              <text class="fig-label" x="0" y="${y + 13}">${esc(r.label)}</text>
              <rect class="fig-track" x="132" y="${y + 3}" width="${W - 140}" height="14" rx="7"/>
              <rect class="fig-water" x="132" y="${y + 3}" width="${(r.band / 100) * (W - 140)}" height="14" rx="7"/>
              <text class="fig-note" x="132" y="${y + 31}">${esc(r.note)}</text>
            </g>`;
        }).join('')}
        <text class="fig-note" x="0" y="${ROWS.length * rowH + 20}">
          Relative, not measured volumes — ask for the consumptive figure at design load.
        </text>
      </svg>`;
  }

  window.ADCHFigures = { albertaMap, loadVsCap, coolingWater, PLACES };
})();
