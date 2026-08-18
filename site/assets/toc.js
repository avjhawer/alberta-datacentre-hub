/* ============================================================================
   Section switcher for the merged reference pages.

   These pages carry a lot; stacked, they ran to ten screens, which is the
   overload complaint in a different shape. So the contents bar SWITCHES
   sections rather than scrolling to them — one section is visible at a time
   and the page is always about a screen or two.

   Deep links still work: an incoming #hash selects that section, and selecting
   a section updates the hash so a link can be copied and shared.
   ========================================================================= */
(function () {
  'use strict';

  const toc = document.querySelector('.page-toc');
  if (!toc) return;

  const links = [...toc.querySelectorAll('a[href^="#"]')];
  const ids = links.map(a => a.getAttribute('href').slice(1));
  const sections = ids.map(id => document.getElementById(id)).filter(Boolean);
  if (sections.length < 2) return;

  function show(id, { push = true } = {}) {
    if (!ids.includes(id)) id = ids[0];
    sections.forEach(s => { s.hidden = s.id !== id; });
    links.forEach(a => {
      const on = a.getAttribute('href') === `#${id}`;
      a.classList.toggle('is-current', on);
      a.setAttribute('aria-current', on ? 'true' : 'false');
    });
    if (push && location.hash !== `#${id}`) {
      history.replaceState(null, '', `#${id}`);
    }
    // Landing on a switched section should start at its top, not mid-page.
    if (push) window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }

  toc.setAttribute('role', 'tablist');
  links.forEach(a => {
    a.setAttribute('role', 'tab');
    a.addEventListener('click', e => {
      e.preventDefault();
      show(a.getAttribute('href').slice(1));
      a.focus();
    });
  });

  // Arrow keys move along the bar, as a tablist should.
  toc.addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = links.findIndex(a => a === document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const next = links[(i + (e.key === 'ArrowRight' ? 1 : links.length - 1)) % links.length];
    show(next.getAttribute('href').slice(1));
    next.focus();
  });

  // In-page links to another section (e.g. "compare the matrix below") should
  // switch to it rather than scrolling into a hidden element.
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || toc.contains(a)) return;
    const id = a.getAttribute('href').slice(1);
    if (ids.includes(id)) { e.preventDefault(); show(id); }
  });

  window.addEventListener('hashchange', () => show(location.hash.slice(1), { push: false }));
  show(location.hash ? location.hash.slice(1) : ids[0], { push: false });
})();
