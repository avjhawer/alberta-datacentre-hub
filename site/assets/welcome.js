/* ============================================================================
   The welcome — what this site is, who it is for, and how to use it.

   The front page used to open on "What changed", which answers a question a
   newcomer has not asked yet. Someone landing here cold needs three things
   before the news means anything: what the site is for, what they can do with
   it, and why they should believe it.

   Open on a first visit, folded to one line once the reader has started
   tracking or closed it — a regular should not scroll past an introduction
   every morning. The choice is remembered, and the guide is always one tap
   from coming back.

   Every number in "What's inside" is counted from the data files, so it
   cannot drift from what the site actually holds.

   window.ADCHWelcome
   ========================================================================= */

(function () {
  'use strict';

  const A = window.ADCH;
  const { $, esc, icon, fmtNum, tierChip } = A;
  const KEY = 'adch.welcome';

  let open = true;
  let facts = null;

  function stored() {
    try { return localStorage.getItem(KEY); } catch { return null; }
  }
  function remember(v) {
    try { localStorage.setItem(KEY, v); } catch { /* private mode: fine */ }
  }

  const TASKS = [
    { href: '#whats-new', icon: 'dashboard', title: 'See what is new',
      text: 'News and rule changes from the last week, Alberta first. Press Start tracking and next time you see only what changed since.' },
    { href: 'permits.html', icon: 'permits', title: 'Review an application',
      text: 'Enter what an application states — load, power, water, site — and see which rules it engages and what still needs establishing.' },
    { href: 'approvals.html', icon: 'projects', title: 'Follow the approvals path',
      text: 'Who approves what, in what order, from first enquiry to occupancy. Tap any step for what it is and where it starts.' },
    { href: 'rules.html', icon: 'policy', title: 'Look up a rule',
      text: 'What the province requires, the grid connection limits, and how each municipality regulates data centres, side by side.' },
    { href: 'context.html', icon: 'library', title: 'Read the background',
      text: 'What happened where data centres were built elsewhere, technology trends, site design guidance and the source documents.' },
  ];

  function insideHtml() {
    if (!facts) return '';
    const rows = [
      [facts.steps, 'approval steps mapped', 'approvals.html'],
      [facts.munis, 'municipalities compared', 'rules.html#municipal'],
      [facts.criteria, 'review criteria in the permit tool', 'permits.html'],
      [facts.rules, 'rules it checks automatically', 'permits.html'],
      [facts.feeds, 'news sources, read every 3 hours', '#whats-new'],
      [facts.watched, 'official pages checked daily for quiet edits', '#attention-slot'],
    ].filter(r => r[0] > 0);
    if (!rows.length) return '';
    return `
      <h2 class="welcome-h">What is inside</h2>
      <div class="welcome-inside">
        ${rows.map(([n, label, href]) => `
          <a class="welcome-stat" href="${esc(href)}">
            <span class="welcome-stat-n">${esc(fmtNum(n))}</span>
            <span class="welcome-stat-l">${esc(label)}</span>
          </a>`).join('')}
      </div>`;
  }

  function render() {
    const el = $('#welcome-slot');
    if (!el) return;
    // On a phone the two reference sections start folded: three screens of
    // introduction before the first headline is its own kind of unfriendly.
    const wide = !window.matchMedia?.('(max-width: 720px)').matches;
    el.innerHTML = `
      <div class="welcome ${open ? 'is-open' : 'is-closed'}">
        <div class="welcome-head">
          <div class="welcome-headtext">
            <span class="eyebrow">Alberta Data Centre Hub</span>
            <h1 class="welcome-title">Everything you need to review a data centre proposal in Alberta</h1>
            <p class="welcome-lede">A working reference for development planners, and for anyone
              following these proposals. It tracks the rules as they change, lays out the approvals
              path, and walks you through reviewing an application, with every fact tied to its source.</p>
          </div>
          <button class="btn btn-small welcome-toggle" id="welcome-toggle" aria-expanded="${open}"
                  aria-controls="welcome-body">${open ? 'Hide this guide' : 'How to use this site'}</button>
        </div>

        <div class="welcome-body" id="welcome-body" ${open ? '' : 'hidden'}>
          <h2 class="welcome-h">What do you want to do?</h2>
          <div class="welcome-tasks">
            ${TASKS.map((t, i) => `
              <a class="welcome-task" href="${esc(t.href)}">
                <span class="welcome-task-icon">${icon(t.icon)}</span>
                <span class="welcome-task-title">${esc(t.title)}</span>
                <span class="welcome-task-text">${esc(t.text)}</span>
                <span class="welcome-task-go" aria-hidden="true">${i === 0 ? 'Jump down ↓' : 'Open →'}</span>
              </a>`).join('')}
          </div>

          ${insideHtml()}

          <div class="welcome-more">
            <details class="welcome-fold" ${wide ? 'open' : ''}>
              <summary><h2 class="welcome-h">How to read what you find</h2></summary>
              <ul class="welcome-trust">
                <li>${tierChip('primary')}<span>Comes from a regulator, a municipality or a government
                  publication. Requirements are only ever stated from these.</span></li>
                <li>${tierChip('reported')}<span>Media coverage. The outlet is named and it is treated
                  as a lead, not a fact.</span></li>
                <li>${tierChip('unverified')}<span>Not yet checked against the authority's own page.
                  Shown so you know to ask.</span></li>
              </ul>
              <p class="welcome-note">${icon('shield')} This site never says a permit application exists
                unless a primary source confirms it, and it is a guide to the process, not legal advice.</p>
            </details>

            <details class="welcome-fold" ${wide ? 'open' : ''}>
              <summary><h2 class="welcome-h">Get the most from it</h2></summary>
              <ol class="welcome-tips">
                <li><strong>Start tracking.</strong> One press below, and from then on the front page
                  shows only what is new since your last visit.</li>
                <li><strong>Tap things.</strong> Headline numbers, approval steps and findings open
                  the detail and the source behind them.</li>
                <li><strong>Search.</strong> The search box at the top jumps straight to any page.</li>
                <li><strong>Share.</strong> The Share button copies a link to the page you are on.</li>
              </ol>
            </details>
          </div>
        </div>
      </div>`;
  }

  async function init() {
    if (!$('#welcome-slot')) return;
    const pref = stored();
    // No choice made yet: open for a newcomer, folded for someone already tracking.
    open = pref ? pref === 'open' : !A.lastSeenAt();
    render();

    document.addEventListener('click', e => {
      if (e.target.closest('#welcome-toggle')) {
        open = !open; remember(open ? 'open' : 'closed'); render();
        $('#welcome-toggle')?.focus();
        return;
      }
      // Starting to track is the reader saying "I know what this is now".
      if (e.target.closest('#mark-read') && !stored()) { open = false; render(); }
    });

    const [ap, mu, ru, ch, so] = await Promise.all([
      A.loadData('approvals', null), A.loadData('municipalities', null),
      A.loadData('rules', null), A.loadData('checklist', null), A.loadData('sources', null),
    ]);
    // Some collections are arrays and some are keyed objects.
    const count = x => (Array.isArray(x) ? x.length : x && typeof x === 'object' ? Object.keys(x).filter(k => !k.startsWith('_')).length : 0);
    facts = {
      // Steps on the default (grid-connected) route, which is what the map opens on.
      steps: (ap?.nodes || []).filter(n => !n.variants || n.variants.includes('grid')).length,
      munis: (mu?.municipalities || []).length,
      criteria: (ch?.sections || []).reduce((n, s) => n + (s.criteria || []).length, 0),
      rules: count(ru?.rules) + count(ru?.municipalRules),
      feeds: (so?.feeds || []).length,
      watched: (so?.watch || []).length,
    };
    render();
  }

  window.ADCHWelcome = { init };
  document.addEventListener('DOMContentLoaded', init);
})();
