/* ============================================================================
   Sticky in-page contents for the merged reference pages.
   Highlights the section you are actually looking at, so a long page still
   tells you where you are.
   ========================================================================= */
(function () {
  'use strict';
  const toc = document.querySelector('.page-toc');
  if (!toc) return;

  const links = [...toc.querySelectorAll('a[href^="#"]')];
  const sections = links
    .map(a => document.getElementById(a.getAttribute('href').slice(1)))
    .filter(Boolean);
  if (!sections.length) return;

  const setCurrent = id => links.forEach(a =>
    a.classList.toggle('is-current', a.getAttribute('href') === `#${id}`));

  // Whichever section occupies the reading band near the top of the viewport.
  const io = new IntersectionObserver(entries => {
    const visible = entries.filter(e => e.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (visible.length) setCurrent(visible[0].target.id);
  }, { rootMargin: '-15% 0px -70% 0px', threshold: 0 });

  sections.forEach(s => io.observe(s));
  setCurrent(sections[0].id);
})();
