/* ============================================================================
   Site layout & urban design guidelines.

   Four cards of design practice for large data centres, each with a small
   hand-drawn schematic. The diagrams are inline SVG using theme tokens, so
   they invert correctly in dark mode and need no assets.

   Design practice, not regulation — the UI says so and nothing here is tiered
   above unverified.

   window.ADCHSiteDesign
   ========================================================================= */

(function () {
  'use strict';

  const A = window.ADCH;
  const { $, esc, icon } = A;

  let spec = null;
  let open = new Set();

  /* ------------------------------------------------------------- diagrams */
  /* Each is a schematic, not a drawing to scale. Strokes use currentColor so
     the card's text colour drives them; fills use tokens for theme safety. */

  const DIAGRAMS = {
    /* Section: rooftop plant hidden behind a parapet, with a sight line. */
    screening: `
      <svg viewBox="0 0 240 110" role="img" aria-label="Section through a roof: mechanical units concealed behind a parapet, with a sight line from an observer at ground level">
        <g class="dg-faint">
          <line x1="8" y1="96" x2="232" y2="96"/>
        </g>
        <rect class="dg-fill" x="46" y="52" width="150" height="44"/>
        <g class="dg-solid">
          <rect x="46" y="52" width="150" height="44"/>
          <rect x="70" y="36" width="26" height="16"/>
          <rect x="104" y="32" width="26" height="20"/>
          <rect x="138" y="38" width="22" height="14"/>
          <path d="M46 52 L46 28 M196 52 L196 28"/>
          <path d="M46 28 L58 28 M184 28 L196 28"/>
        </g>
        <g class="dg-accent">
          <path d="M12 74 L196 28" stroke-dasharray="4 3"/>
          <circle cx="12" cy="74" r="3"/>
        </g>
        <g class="dg-label">
          <text x="120" y="20" text-anchor="middle">parapet set to true clearance height</text>
          <text x="8" y="66">eye level</text>
        </g>
      </svg>`,

    /* Elevation: monolithic left, articulated right, berm along the base. */
    facade: `
      <svg viewBox="0 0 240 110" role="img" aria-label="Elevation comparing a flat monolithic wall with an articulated wall using stepped planes, fins and a landscape berm">
        <g class="dg-faint"><line x1="8" y1="92" x2="232" y2="92"/></g>
        <rect class="dg-fill-muted" x="16" y="44" width="94" height="48"/>
        <g class="dg-dashed"><rect x="16" y="44" width="94" height="48"/></g>
        <g class="dg-label"><text x="63" y="38" text-anchor="middle">flat plane</text></g>

        <g class="dg-solid">
          <path d="M130 92 L130 52 L154 52 L154 44 L186 44 L186 56 L210 56 L210 92"/>
          <path d="M160 44 L160 92 M170 44 L170 92 M180 44 L180 92"/>
        </g>
        <path class="dg-berm" d="M126 92 Q142 76 158 92 Z"/>
        <path class="dg-berm" d="M190 92 Q206 78 222 92 Z"/>
        <g class="dg-label">
          <text x="170" y="38" text-anchor="middle">stepped planes + fins</text>
          <text x="170" y="106" text-anchor="middle">berm hides the wall base</text>
        </g>
      </svg>`,

    /* Plan: plant sited to the interior, layered buffer to the receptor. */
    acoustic: `
      <svg viewBox="0 0 240 122" role="img" aria-label="Site plan: plant located toward the interior of the parcel, with the building shielding a sensitive receptor behind a layered buffer">
        <g class="dg-dashed"><rect x="12" y="10" width="216" height="80" rx="3"/></g>
        <rect class="dg-fill" x="96" y="28" width="86" height="46"/>
        <g class="dg-solid"><rect x="96" y="28" width="86" height="46"/></g>
        <g class="dg-plant">
          <rect x="190" y="36" width="14" height="12"/>
          <rect x="190" y="54" width="14" height="12"/>
        </g>
        <g class="dg-berm-plan"><rect x="40" y="18" width="10" height="64" rx="4"/></g>
        <g class="dg-faint"><rect x="56" y="18" width="6" height="64" rx="3"/></g>
        <g class="dg-accent"><circle cx="24" cy="50" r="4"/></g>
        <g class="dg-label">
          <text x="139" y="22" text-anchor="middle">building shields the receptor</text>
          <text x="197" y="30" text-anchor="middle">plant</text>
          <text x="24" y="104" text-anchor="middle">receptor</text>
          <text x="70" y="116" text-anchor="middle">berm + planting</text>
        </g>
      </svg>`,

    /* Section: roof catchment to bioretention to regional facility. */
    stormwater: `
      <svg viewBox="0 0 240 118" role="img" aria-label="Section: roof runoff routed to a bioretention cell and on to a regional stormwater management facility">
        <g class="dg-solid">
          <path d="M30 46 L120 46 L120 82 L30 82 Z"/>
          <path d="M30 46 L120 46"/>
        </g>
        <g class="dg-accent">
          <path d="M46 34 L46 44 M70 34 L70 44 M94 34 L94 44" stroke-dasharray="3 3"/>
          <path d="M120 60 L142 60" stroke-dasharray="4 3"/>
          <path d="M136 56 L142 60 L136 64" fill="none"/>
        </g>
        <path class="dg-water" d="M146 66 Q160 60 174 66 L174 74 Q160 80 146 74 Z"/>
        <g class="dg-faint"><path d="M146 70 Q160 64 174 70"/></g>
        <g class="dg-accent">
          <path d="M178 70 L196 70" stroke-dasharray="4 3"/>
          <path d="M190 66 L196 70 L190 74" fill="none"/>
        </g>
        <path class="dg-water" d="M200 62 Q214 56 228 62 L228 80 Q214 86 200 80 Z"/>
        <g class="dg-faint"><line x1="8" y1="90" x2="232" y2="90"/></g>
        <g class="dg-label">
          <text x="75" y="28" text-anchor="middle">roof catchment</text>
          <text x="160" y="106" text-anchor="middle">bioretention</text>
          <text x="212" y="106" text-anchor="middle">regional SWMF</text>
        </g>
      </svg>`,
  };

  /* ---------------------------------------------------------------- render */

  function card(c) {
    const isOpen = open.has(c.id);
    return `
      <article class="sd-card ${isOpen ? 'is-open' : ''}">
        <div class="sd-figure" aria-hidden="false">${DIAGRAMS[c.diagram] || ''}</div>

        <div class="sd-body">
          <div class="sd-head">
            <span class="sd-num">${esc(c.number)}</span>
            <h3 class="sd-title">${esc(c.title)}</h3>
          </div>
          <p class="sd-tagline">${esc(c.tagline)}</p>
          <p class="sd-lede">${esc(c.lede)}</p>

          <button class="sd-toggle" data-sd="${esc(c.id)}" aria-expanded="${isOpen}"
                  aria-controls="sd-${esc(c.id)}">
            <span>${isOpen ? 'Hide' : 'Show'} the ${c.moves.length} design moves</span>
            <span class="sd-chev" aria-hidden="true">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"
                   stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>
            </span>
          </button>

          <div class="sd-detail" id="sd-${esc(c.id)}" ${isOpen ? '' : 'hidden'}>
            <ul class="sd-moves">
              ${c.moves.map(m => `
                <li>
                  <span class="sd-move-label">${esc(m.label)}</span>
                  <span class="sd-move-text">${esc(m.text)}</span>
                </li>`).join('')}
            </ul>

            <div class="sd-asks">
              <h4>${icon('question')} What the panel will ask for</h4>
              <ul>${c.panelAsks.map(q => `<li>${esc(q)}</li>`).join('')}</ul>
            </div>
          </div>
        </div>
      </article>`;
  }

  function render() {
    const el = $('#sitedesign-slot');
    if (!el || !spec) return;
    el.innerHTML = `
      <div class="section-head">
        <h2>${esc(spec.title)}</h2>
        <button class="btn btn-small" id="sd-all">
          ${open.size === spec.cards.length ? 'Collapse all' : 'Expand all'}
        </button>
      </div>
      <p class="section-note secondary">${esc(spec.intro)}</p>
      <p class="small muted sd-audience">${icon('doc')} ${esc(spec.audience)}</p>

      <div class="sd-grid">${spec.cards.map(card).join('')}</div>

      <p class="sd-caution small">${icon('shield')} ${esc(spec.caution)}</p>`;
  }

  function wire() {
    $('#sitedesign-slot').addEventListener('click', e => {
      const t = e.target.closest('[data-sd]');
      if (t) {
        const id = t.dataset.sd;
        open.has(id) ? open.delete(id) : open.add(id);
        render();
        $(`[data-sd="${id}"]`)?.focus();   // the re-render replaces the button
        return;
      }
      if (e.target.closest('#sd-all')) {
        open = open.size === spec.cards.length ? new Set() : new Set(spec.cards.map(c => c.id));
        render();
        $('#sd-all')?.focus();
      }
    });
  }

  async function init() {
    if (!$('#sitedesign-slot')) return;
    spec = await A.loadData('site-design', null);
    if (!spec) {
      $('#sitedesign-slot').innerHTML =
        `<div class="empty-state">The design guidelines could not be loaded.</div>`;
      return;
    }
    render();
    wire();
  }

  window.ADCHSiteDesign = { init };
  document.addEventListener('DOMContentLoaded', init);
})();
