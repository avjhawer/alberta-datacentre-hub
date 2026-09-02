# Maintaining the site

Written for a planner, not an engineer. You do not need to know how to code to
change anything on this site.

---

## The one rule

**The site must never assert that a permit application exists.**

Everything below follows from that. This site backs development permit reviews,
so a plausible-sounding but unconfirmed claim is worse than a missing one.

Every record carries a `sourceTier`:

| Tier | Means | Where it may appear |
|---|---|---|
| `primary` | A regulator, municipality, or government publication | Anywhere, including the project tracker |
| `reported` | Media or law-firm coverage | The news feed and the reference library only |
| `unverified` | Not confirmed. A lead. | Marked as such, never presented as fact |

The validator **rejects** any non-primary record placed in the project
tracker's `confirmed` list. That is deliberate and should not be worked around.

---

## Four ways to change things

### 1. Issue forms — no code at all

Go to the repository's **Issues → New issue** and pick a form:

- **Add a source** — a feed or an authority page to monitor. A workflow
  validates it and commits it for you, then closes the issue. If something is
  wrong it comments telling you what to fix.
- **Add or update a municipality** — a row in the matrix.
- **Report something wrong** — an inaccurate record or a broken link.

This is the route to give your team. They can contribute without touching code
and without write access to anything.

### 2. The built-in editor

Open **`/admin.html`** on the live site (it is deliberately not in the
navigation). Pick a file, edit it in form fields, then **Copy JSON** and paste
it over the file on GitHub. It runs entirely in your browser.

### 3. Edit the JSON directly on GitHub

Every piece of content is a plain record in `site/data/`. On GitHub, open the
file, click the pencil icon, edit, and commit. The site republishes in about a
minute.

### 4. Ask Claude

The repository carries a `CLAUDE.md` describing the architecture and the data
contracts, so a future Claude Code session has the context to make changes from
a plain-English request.

---

## What each file holds

| File | What it is | Edit it? |
|---|---|---|
| `policy.json` | Legislation, regulation, strategy, grid process | Yes |
| `municipalities.json` | The municipal requirements matrix | Yes |
| `projects.json` | Project tracker — primary sources only | Yes, carefully |
| `grid.json` | The dashboard's headline figures, split into `verified` / `reported` / `fromRegulation` | Yes |
| `sources.json` | Feeds polled, and pages watched for changes | Yes |
| `library.json` | Reference links | Yes |
| `precedents.json` | Precedent jurisdictions and impact research | Yes |
| `tech.json` | Technology trends | Yes |
| `checklist.json` | The DP review criteria | Yes — see the warning below |
| `rules.json` | Thresholds the DP tool tests a project against | Yes — see below |
| `news.json` | **Generated.** The aggregated feed | No |
| `alerts.json` | **Generated.** Regulatory change alerts | No |
| `watch-state.json` | **Generated.** Page hashes | No |
| `candidate-sources.json` | **Generated.** Discovered candidate sources | No |

**Nothing ever conflicts:** the automation only writes the four generated
files; you only edit the others. A scheduled run can never clobber your edit.

### Editing the checklist

You can freely add, reword, reorder and remove criteria. One caution:

> **Never change an existing criterion's `id`.** Those ids are the keys your
> saved reviews are stored under, so changing one silently detaches the notes
> and status already recorded against it. Add a new criterion with a new id
> instead. The validator blocks duplicate ids for the same reason.

### Editing the regulatory rules

`rules.json` is what makes the DP tool react to a project's parameters. Each
rule says: when this field crosses this value, show this finding.

Two kinds, and the difference is enforced by CI:

- **`"kind": "requirement"`** — states a legal obligation. Allowed *only* with a
  `primary` source on a government or regulator site. Renders as **Requirement**.
- **`"kind": "question"`** — something for you to establish. Renders as
  **To establish**. Use this whenever you cannot cite the issuing body.

If you add a requirement without a government source, validation fails with a
message telling you to either change the kind or cite the regulator. That is
deliberate: the tool is used to inform decisions, so it must never present a
plausible-sounding rule as settled law.

To add a rule, copy an existing one and change `when` (the field, operator and
value), `title`, `detail`, `ask`, and the source. The `area` must match a
section id in `checklist.json`.

---

## How the site stays current

| What runs | When | What it does |
|---|---|---|
| `update-news.yml` | Every 3 hours | Fetches every feed, classifies each item by region and stream, scores for the breaking band, commits `news.json` |
| `watch-sources.yml` | Daily, 07:15 MDT | Hashes every watched authority page, raises an alert and opens an issue when one changes; discovers new sources |
| `validate-data.yml` | Every push and PR | Schema-checks all data files and runs the tests |
| `apply-issue-form.yml` | On issue submission | Turns an "Add a source" form into a validated commit |
| `deploy.yml` | On push to `main`, and called by the two jobs above | Publishes to GitHub Pages |

The two data jobs call the deploy themselves rather than relying on their own
commit to trigger it. They have to: GitHub does not start an `on: push`
workflow for a push made by a workflow using the built-in token, so for a
while the repository's data went on updating every three hours while the
published site stayed at whichever commit a person last pushed. If you add
another job that commits into `site/`, give it the same `publish` job or the
change will not reach readers.

### Printing the approvals diagram

The diagram has a **Print / PDF** button in its header. It opens a print sheet
carrying just the diagram for whichever supply route you were looking at —
grid-connected or off-grid.

In the browser's print dialog choose **paper size 11 × 17 (Tabloid)**,
**landscape**, and turn **background graphics on** (Chrome hides them by
default, and the lane colours and phase bands are backgrounds). Then "Save as
PDF" or print. It comes out as two sheets: the matrix on the first, the notes on
the second. The page is sized in the stylesheet, so "scale to fit" is not
needed — leave scaling at 100%.

### Where new sources come from

1. **Child pages of trusted domains — fully automatic.** Pages marked
   `"crawl": true` in `sources.json` are crawled one level down daily. If the
   Government of Alberta publishes a new page under `/datacentres/`, it is
   monitored the next day.
2. **RSS autodiscovery — fully automatic.** Any watched page that advertises a
   feed is upgraded from hash-watching to full ingestion.
3. **Authority-domain harvesting — automatic past a threshold.** Government
   domains (`.gc.ca`, `.alberta.ca`, `.ab.ca`, `.gov`) seen 3+ times in the
   news feed are promoted automatically.
4. **Everything else waits for you.** Non-government domains are collected into
   a weekly issue for one-click approval. Arbitrary domains are never ingested
   sight-unseen — that is how misinformation gets into a source you rely on.

---

## If something breaks

**A page is blank or a section is missing.** The site hides a section rather
than blanking the page when a data file is unreadable. Check the most recent
`Validate data` workflow run for the error, or open `/admin.html` and press
**Check**.

**The news feed is empty or stale.** Open the **News feed** page and scroll to
**Source health** — it lists which feeds responded on the last run and the
error for any that did not. Replace a persistently dead feed URL in
`sources.json`. The `LIVE` dot in the header goes grey when the data is more
than 12 hours old.

**A workflow failed.** Open the Actions tab and read the run's summary. The
validation errors name the file, the record, and the problem in plain language.

**You committed something wrong.** Every change is a commit. Open the file's
history on GitHub and revert it in two clicks.

---

## Verifying facts against their sources

Run the **Verify seeds** workflow (Actions tab → Verify seeds → Run workflow).
It fetches every curated record's cited page and reports two things: whether
the link still works, and whether the record's distinctive figures still appear
on that page. It runs automatically every Monday to catch link rot.

It does *not* prove a record is true — a page can be reachable and still not
support the claim. It tells you which records to read by hand.

**What the first run found (17 Aug 2026).** All 10 sources were reachable. The
1,200 MW cap and its 2028 window were confirmed on AESO's own pages. Four
figures were *not* found on the page they cited:

| Figure | Cited to | What was done |
|---|---|---|
| 19,565 MW queue demand | AESO | Moved to `grid.reported`; the dashboard no longer leads with it |
| 1,864 MW Greenlight | AUC homepage | Record moved from `confirmed` to `reported` |
| $100B Alberta target | Strategy landing page | Lives in the strategy PDF, not the landing page |
| $925.6M Budget 2025 | ISED landing page | Lives in the budget document |

That is the process working as intended, not a failure. **When a figure cannot
be found on its cited page, the fix is to re-cite it, demote it, or remove it —
never to leave it sitting where a reader would take it as confirmed.**

### The grid figures are split on purpose

`grid.json` has three blocks:

- **`verified`** — found on AESO's own pages. The dashboard hero must read from
  here, and validation enforces that this block is `primary` tier.
- **`reported`** — media summaries only. Rendered with a visible "not confirmed
  by AESO" caveat.
- **`fromRegulation`** — defined in the Data Centre Regulation rather than
  published by AESO.

If you update a figure, move it into the block that matches its evidence, then
re-run Verify seeds.
