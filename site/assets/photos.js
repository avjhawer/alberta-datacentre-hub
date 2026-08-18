/* ============================================================================
   Photographs.

   Renders a photo into a slot, with the caption and the attribution the
   licence requires. Attribution is not optional decoration — CC BY and
   CC BY-SA both require author, licence and a link, so the renderer refuses
   to output an image that has not got them.

   Every photograph here was opened and checked by eye; see the review note in
   site/data/images.json and the record of what was rejected and why.

   window.ADCHPhotos
   ========================================================================= */

(function () {
  'use strict';
  const A = window.ADCH;
  const { esc, safeUrl } = A;

  let spec = null;

  /** Author strings from Commons often carry markup remnants; keep it short. */
  const cleanAuthor = a => String(a || 'Unknown')
    .replace(/\s+/g, ' ')
    .replace(/^\s*(photo|image)\s*(by)?[:\s]*/i, '')
    .trim()
    .slice(0, 80);

  function figure(img, { hero = false } = {}) {
    if (!img) return '';
    // A licence condition, so treat a missing field as a reason not to publish.
    if (!img.author || !img.licence || !img.descriptionUrl) {
      console.warn('photo omitted — incomplete attribution:', img.file);
      return '';
    }
    return `
      <figure class="photo ${hero ? 'photo-hero' : ''}">
        <img src="assets/img/${esc(img.file)}" alt="${esc(img.caption || '')}"
             loading="lazy" decoding="async"
             width="${esc(String(img.width || ''))}" height="${esc(String(img.height || ''))}">
        <figcaption>
          <strong>${esc(img.caption || '')}</strong>
          <br>
          Photo: ${esc(cleanAuthor(img.author))} ·
          <a href="${esc(safeUrl(img.licenceUrl || img.descriptionUrl))}"
             target="_blank" rel="noopener license">${esc(img.licence)}</a> ·
          <a href="${esc(safeUrl(img.descriptionUrl))}" target="_blank" rel="noopener">source</a>
        </figcaption>
      </figure>`;
  }

  const byRole = role => (spec?.images || []).find(i => i.role === role);

  /** Fill any element carrying data-photo="role". */
  function mount() {
    document.querySelectorAll('[data-photo]').forEach(el => {
      const img = byRole(el.dataset.photo);
      const html = figure(img, { hero: el.hasAttribute('data-photo-hero') });
      if (html) el.innerHTML = html;
      else el.remove();          // no verified photo for this slot: show nothing
    });
  }

  async function init() {
    if (!document.querySelector('[data-photo]')) return;
    spec = await A.loadData('images', null);
    if (!spec) { document.querySelectorAll('[data-photo]').forEach(e => e.remove()); return; }
    mount();
  }

  window.ADCHPhotos = { init, figure, byRole };
  document.addEventListener('DOMContentLoaded', init);
})();
