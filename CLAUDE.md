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

**4. A rule may only assert a requirement with a primary source.**
`rules.json` drives the DP tool's live evaluation. A rule with
`kind: "requirement"` states a legal obligation, so `validate-data.mjs` fails CI
unless its `sourceTier` is `primary` *and* the source is a government or
regulator host. Everything weaker must be `kind: "question"`, which the UI
renders as "To establish" rather than "Requirement". The same host check now
applies to every `primary` record anywhere — a law firm's summary of an Act is
commentary, not the Act.

**5. A photograph is not published until someone has looked at it.**
`scripts/fetch-images.mjs` downloads free-licensed candidates from Wikimedia in
Actions; it ships none of them. A filename and a search term are not evidence of
content — the first run returned NASA buildings and an airport car park for
"data centre", and a Manitoba field for "Alberta". Open each candidate, keep
only what it actually shows, and record the rejects and why in
`images.json → rejected`. `photos.js` refuses to render an image missing author,
licence or source, because attribution is a licence condition rather than a
nicety.

**6. Never change an existing criterion `id` in `checklist.json`.** Those ids
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
- `rules.js` (`window.ADCHRules`) evaluates a project's stated parameters
  against `rules.json`. Pure and synchronous, so the DP tool can re-run it on
  every keystroke. It keeps requirements and questions strictly apart and never
  promotes one to the other.
- `approvals.js` (`window.ADCHApprovals`) draws the approvals flow from
  `approvals.json`: five lanes by five phases, with dependency connectors
  computed from real layout positions and redrawn whenever the grid box changes
  — a ResizeObserver, not a resize listener, because a print stylesheet changes
  the layout without firing `resize` and the PDF used to come out with the
  arrows drawn for the on-screen geometry. Same column means concurrent; an
  arrow means it does not. It appears on both the front page and the review page
  from one data file — edit the JSON, not the markup. It replaced the earlier
  two-track swimlane, which covered the same ground with less of it.

  It draws **two supply routes** from the same file: grid-connected, and
  off-grid where on-site generation feeds the load directly. A record with no
  `variants` array belongs to both, so every pre-existing node stayed correct
  when the second route was added; `optionalIn` carries "only some projects need
  this" per route, because on-site generation is conditional on the grid and
  unavoidable off it. `approvals-print.html` renders one route on its own,
  compressed so the matrix fits a single 11x17 landscape sheet with the notes on
  a second. Check that with `scratch/ap-test.mjs`, which measures it, rather than
  by eye.
- `checklist.js` is the DP review tool: multiple reviews (create, rename,
  duplicate, delete with undo), a parameter form, live findings per area, and
  eight accordions. Reviews live in `localStorage` under `adch.reviews.v2`;
  `load()` migrates `v1` rather than orphaning saved work — keep that migration
  if you bump the key again.
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

- **Typefaces are self-hosted**, not linked. `scripts/fetch-fonts.mjs` runs in
  Actions and writes `assets/fonts.css` plus the woff2 files. Space Grotesk is
  the display face, Inter the interface face. Self-hosting means no third-party
  dependency, no visitor leakage, and — the reason it matters here — the
  authoring session can actually see the typography it ships.
- **The accent is violet and is not a fourth categorical hue.** Validated
  against the three region hues it fails CVD separation, because blue and
  violet converge under deuteranopia. It is allowed only because it marks
  interaction rather than a data category, and because every region mark
  carries its label as text. If it is ever used to encode a category that
  reasoning collapses. The full argument is in `tokens.css`.

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

The DP tool has a browser-driven suite that must pass before shipping a change
to it — it covers rule evaluation, persistence, delete/undo, and the v1
migration:

```bash
node scratch/dp-test.mjs      # 23 assertions, needs the local server running
```

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
- `approvals.json → aeso-agreement` (grid lane, Phase 3) is `unverified`. The
  step is real — a system study is not a connection, and the transmission
  facility owner does not build against an unsigned commitment — but the exact
  instrument name could not be checked from the authoring sandbox, which cannot
  reach `aeso.ca`. `scripts/verify-seeds.mjs` now reads `approvals.json` and
  checks each node's `verifyPhrases` against its `startLink` page; run it in
  Actions, and promote the node to `primary` only once the wording is confirmed
  on AESO's own page.
- The off-grid route's nodes (`supply-concept`, `fuel-supply`, `auc-isd`,
  `auc-isd-order`, `plant-build`, `plant-commission`) are all `unverified`. The
  shape of the route is not in doubt — no connection means no system access
  service — but the instruments were not read from source, because the sandbox
  reaches neither `aeso.ca`, `auc.ab.ca` nor `aer.ca`. `auc-isd` carries
  `verifyPhrases`; run `scripts/verify-seeds.mjs` in Actions and promote only
  what the authority's own page confirms.
- `municipalities.json` has deliberately blank rows for Edmonton and Calgary.
  Blank means "not yet verified" and renders as *Needs research* — do not fill
  them with plausible guesses.
