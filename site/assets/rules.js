/* ============================================================================
   Regulatory rule evaluation.

   Takes a project's stated parameters and returns the rules they trigger,
   grouped by compliance area. Pure and synchronous, so the UI can re-run it on
   every keystroke.

   The honest bit: a rule is either a `requirement` (a primary source says so)
   or a `question` (something to establish). The evaluator keeps them apart and
   never promotes one to the other. Nothing here decides an application — it
   surfaces what the regulations engage and what to ask.

   window.ADCHRules
   ========================================================================= */

(function () {
  'use strict';

  const SEVERITY_ORDER = { critical: 0, serious: 1, warning: 2, info: 3, question: 4 };

  /** Is a value meaningfully present? 0 counts; empty string and null do not. */
  function present(v) {
    return v !== '' && v !== null && v !== undefined && !(typeof v === 'number' && Number.isNaN(v));
  }

  function coerce(v) {
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
    return v;
  }

  /** Evaluate one `when` clause against the project's parameters. */
  function test(when, params) {
    if (!when) return false;
    const raw = params[when.field];
    if (!present(raw)) return false;

    // Some rules should only fire once a companion field is filled in, so a
    // blank form does not light up with "below the threshold" style findings.
    if (when.alsoRequires && !present(params[when.alsoRequires])) return false;

    const v = coerce(raw);
    const target = when.value;

    switch (when.op) {
      case '>=': return typeof v === 'number' && v >= target;
      case '<=': return typeof v === 'number' && v <= target;
      case '>':  return typeof v === 'number' && v > target;
      case '<':  return typeof v === 'number' && v < target;
      case '=':  return String(v) === String(target);
      case 'in': return Array.isArray(target) && target.map(String).includes(String(v));
      default:   return false;
    }
  }

  /**
   * Municipal findings come from municipalities.json rather than from a
   * hardcoded rule, so the matrix stays the single source of truth. A blank
   * cell is explicitly "not yet verified" — never a pass.
   */
  function municipalFindings(spec, params, muniData) {
    if (!params.municipality || !muniData) return [];
    const row = (muniData.municipalities || [])
      .find(m => m.name === params.municipality || m.id === params.municipality);
    if (!row) return [];

    const cell = row.useClass;
    const templates = spec.municipalRules || {};
    let t, value = null;

    if (!cell || !cell.value) {
      t = templates.unknown;
    } else {
      value = String(cell.value);
      t = /discretion/i.test(value) ? templates.useClassDiscretionary : templates.useClassPermitted;
    }
    if (!t) return [];

    return [{
      id: `muni-${row.id}`,
      area: t.area,
      kind: 'question',
      severity: t.severity === 'question' ? 'question' : t.severity,
      title: `${row.name}: ${value || 'use class not verified'}`,
      detail: t.detail,
      ask: t.ask,
      source: row.source,
      sourceName: row.sourceName || row.name,
      sourceTier: cell ? (row.sourceTier || 'unverified') : 'unverified',
      fromMatrix: true,
    }];
  }

  /**
   * @returns {{findings: Array, byArea: Object, counts: Object, answered: number, totalFields: number}}
   */
  function evaluate(spec, params, muniData) {
    if (!spec) return { findings: [], byArea: {}, counts: {}, answered: 0, totalFields: 0 };
    params = params || {};

    const findings = (spec.rules || [])
      .filter(r => test(r.when, params))
      .map(r => ({ ...r }))
      .concat(municipalFindings(spec, params, muniData));

    findings.sort((a, b) =>
      (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9) ||
      String(a.title).localeCompare(String(b.title)));

    const byArea = {};
    for (const f of findings) (byArea[f.area] = byArea[f.area] || []).push(f);

    const counts = { critical: 0, serious: 0, warning: 0, info: 0, question: 0,
                     requirement: 0, questionKind: 0 };
    for (const f of findings) {
      if (counts[f.severity] !== undefined) counts[f.severity]++;
      if (f.kind === 'requirement') counts.requirement++; else counts.questionKind++;
    }

    const fields = spec.fields || [];
    const answered = fields.filter(f => present(params[f.key])).length;

    return { findings, byArea, counts, answered, totalFields: fields.length };
  }

  /** Plain-text rendering, used by the markdown export and the print view. */
  function findingsToMarkdown(result, areaTitles) {
    if (!result.findings.length) return '_No regulatory triggers from the parameters entered._\n';
    const out = [];
    for (const [area, list] of Object.entries(result.byArea)) {
      out.push(`### ${areaTitles[area] || area}`, '');
      for (const f of list) {
        out.push(`- **${f.title}** _(${f.kind === 'requirement' ? 'requirement' : 'to establish'}, ${f.severity})_`);
        if (f.detail) out.push(`  - ${f.detail}`);
        if (f.ask) out.push(`  - **Ask:** ${f.ask}`);
        if (f.sourceName) out.push(`  - Source: ${f.sourceName}${f.source ? ` — ${f.source}` : ''} (${f.sourceTier})`);
      }
      out.push('');
    }
    return out.join('\n');
  }

  window.ADCHRules = { evaluate, test, findingsToMarkdown, SEVERITY_ORDER };
})();
