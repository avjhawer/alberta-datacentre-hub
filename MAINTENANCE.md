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
| `grid.json` | The dashboard's headline figures | Yes |
| `sources.json` | Feeds polled, and pages watched for changes | Yes |
| `library.json` | Reference links | Yes |
| `precedents.json` | Precedent jurisdictions and impact research | Yes |
| `tech.json` | Technology trends | Yes |
| `checklist.json` | The DP review criteria | Yes — see the warning below |
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

---

## How the site stays current

| What runs | When | What it does |
|---|---|---|
| `update-news.yml` | Every 3 hours | Fetches every feed, classifies each item by region and stream, scores for the breaking band, commits `news.json` |
| `watch-sources.yml` | Daily, 07:15 MDT | Hashes every watched authority page, raises an alert and opens an issue when one changes; discovers new sources |
| `validate-data.yml` | Every push and PR | Schema-checks all data files and runs the tests |
| `apply-issue-form.yml` | On issue submission | Turns an "Add a source" form into a validated commit |
| `deploy.yml` | On push to `main` | Publishes to GitHub Pages |

Because each data commit lands on `main`, the deploy re-runs automatically. The
loop closes with no manual step.

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

## Verifying a seeded fact

The records shipped at launch were compiled from research summaries, and the
grid figures and the AUC record are marked `"verificationStatus": "pending"`
until each is confirmed against its source page. When you confirm one:

1. Open the record's source link and check the figure or wording still holds.
2. Set `"verificationStatus": "verified"`.
3. If it does not hold, correct it — or remove it. A missing record is better
   than a wrong one.
