/* ============================================================================
   Browser-only data editor. Loads a data file, renders the records it knows
   how to edit as form fields, and hands back valid JSON to paste into GitHub.

   Deliberately has no backend and no write access — the commit is the user's,
   which keeps GitHub's history as the single record of who changed what.
   ========================================================================= */

(function () {
  const A = window.ADCH;
  const { $, esc } = A;

  const REPO = 'https://github.com/avjhawer/alberta-datacentre-hub';

  /* Which array inside each file is the editable list, and which fields to
     surface. Files not listed here are still editable as raw JSON. */
  const SCHEMA = {
    policy: {
      path: 'records', label: 'Regulatory records',
      fields: [
        ['id', 'text'], ['title', 'text'], ['date', 'date'],
        ['jurisdiction', 'text'],
        ['region', 'select', ['alberta', 'canada', 'global']],
        ['type', 'text'],
        ['status', 'select', ['in-force', 'upcoming', 'proposed', 'closed']],
        ['summary', 'textarea'], ['relevance', 'textarea'],
        ['source', 'url'], ['sourceName', 'text'],
        ['sourceTier', 'select', ['primary', 'reported', 'unverified']],
      ],
      title: r => r.title,
    },
    municipalities: {
      path: 'municipalities', label: 'Municipalities',
      fields: [
        ['id', 'text'], ['name', 'text'], ['area', 'text'],
        ['regulations', 'textarea'], ['notes', 'textarea'],
        ['source', 'url'], ['sourceName', 'text'],
        ['sourceTier', 'select', ['primary', 'reported', 'unverified']],
      ],
      title: r => r.name,
      note: 'Matrix cells (use class, district…) are nested objects — edit those in the raw JSON panel.',
    },
    projects: {
      path: 'confirmed', label: 'Confirmed projects',
      fields: [
        ['id', 'text'], ['name', 'text'], ['proponent', 'text'],
        ['recordType', 'text'], ['municipality', 'text'],
        ['capacityMW', 'number'], ['decisionBody', 'text'], ['decisionDate', 'date'],
        ['stage', 'text'], ['summary', 'textarea'], ['caution', 'textarea'],
        ['source', 'url'], ['sourceName', 'text'],
        ['sourceTier', 'select', ['primary', 'reported', 'unverified']],
        ['verificationStatus', 'select', ['pending', 'verified']],
      ],
      title: r => r.name,
      note: 'Only primary-source records belong here. Validation rejects anything else on commit.',
    },
    grid: { raw: true },
    sources: {
      path: 'watch', label: 'Watched authority pages',
      fields: [
        ['id', 'text'], ['name', 'text'], ['url', 'url'],
        ['tier', 'select', ['primary', 'reported', 'unverified']],
      ],
      title: r => r.name,
      note: 'Feeds are in the raw JSON panel under "feeds".',
    },
    library: { raw: true },
    tech: {
      path: 'trends', label: 'Technology trends',
      fields: [
        ['id', 'text'], ['title', 'text'], ['topic', 'text'], ['maturity', 'text'],
        ['summary', 'textarea'], ['planningImplication', 'textarea'],
      ],
      title: r => r.title,
    },
    precedents: { raw: true },
    checklist: { raw: true },
  };

  let current = null;   // { name, data }

  function setStatus(msg, kind = 'muted') {
    const el = $('#status');
    el.className = `small ${kind === 'error' ? '' : 'muted'}`;
    el.style.color = kind === 'error' ? 'var(--status-critical)'
                   : kind === 'ok' ? 'var(--status-good-text)' : '';
    el.textContent = msg;
  }

  function field([key, type, opts], rec, idx) {
    const v = rec[key] ?? '';
    const id = `f-${idx}-${key}`;
    if (type === 'select') {
      return `<label class="field"><span class="eyebrow">${esc(key)}</span>
        <select class="select-input" id="${id}" data-i="${idx}" data-k="${esc(key)}">
          <option value=""></option>
          ${opts.map(o => `<option value="${esc(o)}" ${v === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}
        </select></label>`;
    }
    if (type === 'textarea') {
      return `<label class="field" style="grid-column:1/-1"><span class="eyebrow">${esc(key)}</span>
        <textarea class="crit-note" id="${id}" data-i="${idx}" data-k="${esc(key)}"
          rows="2" style="min-height:56px">${esc(v)}</textarea></label>`;
    }
    const inputType = type === 'number' ? 'number' : type === 'date' ? 'date' : type === 'url' ? 'url' : 'text';
    const val = type === 'date' && v ? String(v).slice(0, 10) : v;
    return `<label class="field"><span class="eyebrow">${esc(key)}</span>
      <input class="search-input" type="${inputType}" id="${id}"
             data-i="${idx}" data-k="${esc(key)}" data-t="${esc(type)}" value="${esc(val)}"></label>`;
  }

  function renderForm() {
    const spec = SCHEMA[current.name];
    const slot = $('#form-slot');

    if (!spec || spec.raw) {
      $('#editor-title').textContent = 'Raw editing only';
      $('#add-record').hidden = true;
      slot.innerHTML = `<div class="empty-state">
        This file's shape is nested, so edit it in the raw JSON panel.
        <strong>Check</strong> will confirm it still parses before you paste it into GitHub.</div>`;
      return;
    }

    $('#add-record').hidden = false;
    $('#editor-title').textContent = spec.label;
    const list = current.data[spec.path] || [];

    slot.innerHTML = (spec.note ? `<p class="small secondary">${esc(spec.note)}</p>` : '') +
      (list.length ? list.map((rec, i) => `
        <details class="rec" ${list.length <= 2 ? 'open' : ''}
                 style="border-bottom:1px solid var(--hairline);padding:var(--s-2) 0">
          <summary style="cursor:pointer;font-weight:550;padding:var(--s-1) 0">
            ${esc(spec.title(rec) || '(untitled)')}
          </summary>
          <div class="grid grid-2" style="margin:var(--s-3) 0">
            ${spec.fields.map(f => field(f, rec, i)).join('')}
          </div>
          <button class="btn" data-del="${i}">Remove this record</button>
        </details>`).join('')
      : '<div class="empty-state">No records yet.</div>');
  }

  function syncRaw() {
    $('#raw').value = JSON.stringify(current.data, null, 2);
  }

  async function open(name) {
    const data = await A.loadData(name, null, { bust: true });
    if (!data) { setStatus(`Could not load ${name}.json`, 'error'); return; }
    current = { name, data };
    $('#gh-link').href = `${REPO}/edit/main/site/data/${name}.json`;
    renderForm();
    syncRaw();
    setStatus(`Loaded ${name}.json`, 'ok');
  }

  function init() {
    open($('#file-select').value);

    $('#file-select').addEventListener('change', e => open(e.target.value));

    $('#form-slot').addEventListener('input', (e) => {
      const t = e.target;
      if (t.dataset.i === undefined) return;
      const spec = SCHEMA[current.name];
      const rec = current.data[spec.path][Number(t.dataset.i)];
      let v = t.value;
      if (t.dataset.t === 'number') v = v === '' ? null : Number(v);
      rec[t.dataset.k] = v;
      syncRaw();
      setStatus('Edited — not yet saved anywhere', 'muted');
    });

    $('#form-slot').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-del]');
      if (!btn) return;
      const spec = SCHEMA[current.name];
      const i = Number(btn.dataset.del);
      const rec = current.data[spec.path][i];
      if (!confirm(`Remove "${spec.title(rec) || 'this record'}"?`)) return;
      current.data[spec.path].splice(i, 1);
      renderForm(); syncRaw();
    });

    $('#add-record').addEventListener('click', () => {
      const spec = SCHEMA[current.name];
      const blank = {};
      for (const [k] of spec.fields) blank[k] = '';
      blank.sourceTier = 'primary';
      (current.data[spec.path] ||= []).push(blank);
      renderForm(); syncRaw();
    });

    $('#raw').addEventListener('input', () => {
      try {
        current.data = JSON.parse($('#raw').value);
        renderForm();
        setStatus('Valid JSON', 'ok');
      } catch (err) {
        setStatus(`Invalid JSON: ${err.message}`, 'error');
      }
    });

    $('#validate').addEventListener('click', () => {
      try {
        JSON.parse($('#raw').value);
        setStatus('Valid JSON — safe to paste into GitHub', 'ok');
      } catch (err) {
        setStatus(`Invalid JSON: ${err.message}`, 'error');
      }
    });

    $('#copy').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText($('#raw').value);
        setStatus('Copied — now paste it over the file on GitHub', 'ok');
      } catch {
        $('#raw').select();
        setStatus('Press Ctrl/Cmd+C to copy the selected text', 'muted');
      }
    });

    $('#download').addEventListener('click', () => {
      const blob = new Blob([$('#raw').value], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${current.name}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
