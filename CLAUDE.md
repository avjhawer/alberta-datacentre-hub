# Working on this repository

Context for a future Claude Code session. Read this before changing anything.

## What this is

A live intelligence portal on data centre development in Alberta and Canada,
used by a Senior Development Planner to review data centre development permits
and shared with their team. Published to GitHub Pages from `site/`.

## Hard constraints — do not relax these

**1. The site must never assert that a permit application exists.**
This is the owner's explicit requirement, not a stylistic preference. Every
record carries `sourceTier` of `primary` / `reported` / `unverified`.
`scripts/validate-data.mjs` fails CI if a non-primary record appears in
`projects.json`'s `confirmed` array. Media-reported projects belong in the news
feed, badged as coverage, never restated as fact in the tracker.

**2. Never name a proponent or a project unless a primary source confirms it.**
Municipal rows describe what a bylaw *requires*, never who has applied.

**3. Do not auto-ingest arbitrary domains.** `scripts/discover-sources.mjs`
auto-promotes only government and regulator TLDs (see
`sources.json → discovery.authorityPatterns`). Everything else is proposed in an
issue for human approval. This is a safety property, not a convenience setting.

**4. Never change an existing criterion `id` in `checklist.json`.** Those ids
are the localStorage keys for saved reviews; changing one silently detaches a
planner's recorded notes and statuses. Add new ids instead.

## Architecture

Plain HTML/CSS/JS. **No framework, no npm dependencies, no build step** — the
site is served directly from `site/`. Keep it that way: it is the reason nothing
rots and the owner can edit content without a toolchain.

- Every page is a static HTML file that loads `assets/app.js`, then renders
  itself from JSON in `site/data/`.
- `app.js` injects the sidebar and top bar into `#sidebar` / `#topbar` based on
  `<body data-page="…">`, and exports helpers on `window.ADCH`.
- `charts.js` (`window.ADCHCharts`) builds the meter, bar chart and sparkline by
  hand, each with a table-view twin.
- Content is data, not markup. To add a record, edit JSON — not HTML.

### Data flow

```
sources.json ──> fetch-news.mjs ──> news.json ──> every page's "live layer"
             └─> watch-sources.mjs ──> alerts.json + watch-state.json
             └─> discover-sources.mjs ──> candidate-sources.json (+ sources.json)
```

Automation writes **only** `news.json`, `alerts.json`, `watch-state.json`,
`candidate-sources.json`. Humans edit only the others. Never blur that line —
it is what makes concurrent editing safe.

## Design system

Documented in `assets/tokens.css`. Key points:

- The categorical region palette (Alberta/Canada/Global) is **validated** — it
  passes CVD and normal-vision separation in both light and dark on all pairs.
  If you change a hue, re-run a palette validator; do not eyeball it. Do not add
  a fourth region hue: three is the all-pairs cap.
- `--region-global` is below 3:1 on the light surface by design. Marks in that
  colour must always carry a visible label and a table view.
- Status colours are reserved for state and never reused as series colours.
  Status always renders as **icon + label + colour**, never colour alone — which
  is also what makes the printed checklist legible in black and white.
- Form follows the data's job: the MW cap is a **meter** (a ratio against a
  limit), the queue figure is the **hero number**. No pie charts, no dual-axis
  charts, no value-ramps on nominal categories, one hue per bar chart.
- Dark mode is a selected set of steps, declared under both
  `@media (prefers-color-scheme: dark)` (guarded with
  `:root:not([data-theme="light"])`) and `:root[data-theme="dark"]`.

## Testing

```bash
node test/test-lib.mjs                                # 35 assertions, offline
node scripts/fetch-news.mjs --fixture test/fixtures   # pipeline without network
node scripts/validate-data.mjs                        # schema check
python3 -m http.server 8000 -d site                   # then click through
```

Screenshot pages in **both themes** at 1440 / 1024 / 375 before calling a UI
change done. Playwright's Chromium is at
`/opt/pw-browsers/chromium-*/chrome-linux/chrome`.

## Environment notes

The sandboxed session that built this **cannot reach** `alberta.ca`, `aeso.ca`,
`auc.ab.ca`, `news.google.com` and similar — the egress proxy returns 403. That
is a property of the sandbox, not of the code. GitHub Actions runners have open
network access, which is why all ingestion runs there. Test ingestion locally
with `--fixture`; verify live behaviour from an Actions run.

## Pending work

- Seeded records marked `"verificationStatus": "pending"` (in `grid.json` and
  `projects.json`) were compiled from research summaries and still need
  confirming against their live source pages.
- `municipalities.json` has deliberately blank rows for Edmonton and Calgary.
  Blank means "not yet verified" and renders as *Needs research* — do not fill
  them with plausible guesses.
