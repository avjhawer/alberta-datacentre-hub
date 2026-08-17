# Alberta &amp; Canada Data Centre Development Hub

A live intelligence portal for data centre development — government policy,
regulation, grid access, projects and technology — with Alberta as the deep
focus, built for development permit review.

**Live site:** https://avjhawer.github.io/alberta-datacentre-hub/

---

## What it does

| Page | Purpose |
|---|---|
| **Dashboard** | The grid constraint at a glance, breaking items, regulatory change alerts |
| **News feed** | Aggregated coverage, filterable by region and topic, with per-source health |
| **Policy &amp; regulation** | Curated timeline of legislation, regulation and grid process, plus a live layer |
| **Precedents &amp; impacts** | Loudoun County, JLARC and independent land/water/community research |
| **Technology trends** | What each technical choice changes about an application you have to assess |
| **Project tracker** | Only projects confirmed by a primary source |
| **Municipal matrix** | Side-by-side comparison of how each municipality regulates data centres |
| **DP review tool** | A structured permit review with export, shareable summary and print-to-PDF |
| **Reference library** | The governing documents and the analysis worth reading |

## How it stays live

Scheduled GitHub Actions do three things no static site does on its own:

1. **Ingest** every configured feed every 3 hours, classifying each item by
   region and stream so the policy, municipal and technology pages each get a
   live layer of their own — not just the news page.
2. **Watch** authoritative pages daily by content hash, because a quietly
   amended bylaw produces no press release. A change raises an on-site alert
   and opens an issue.
3. **Discover** sources that did not exist when the list was written — child
   pages of trusted domains and advertised RSS feeds are added automatically;
   unknown non-government domains wait for approval.

## Accuracy

Every record carries a source tier — `primary` (regulator, municipality or
government publication), `reported` (media coverage), or `unverified`. The
project tracker admits **only** primary-source records, enforced by CI. Media
reports reach the site through the news feed, badged as coverage with the outlet
named, and are never restated as fact.

See [MAINTENANCE.md](MAINTENANCE.md) for the full rule and how to change anything.

## Running it locally

No build step and no dependencies.

```bash
python3 -m http.server 8000 -d site
# then open http://localhost:8000
```

## Scripts

```bash
node scripts/fetch-news.mjs                      # ingest feeds -> site/data/news.json
node scripts/fetch-news.mjs --fixture test/fixtures   # offline, no network
node scripts/watch-sources.mjs [--dry]           # detect changes to watched pages
node scripts/discover-sources.mjs [--dry]        # find new sources
node scripts/validate-data.mjs                   # schema-check every data file
node test/test-lib.mjs                           # library tests
```

Node 22+ (uses built-in `fetch`). No npm dependencies anywhere in the project.

## Layout

```
site/            The published site — plain HTML/CSS/JS, no framework
  assets/        tokens.css (design tokens), style.css, app.js, charts.js,
                 checklist.js (DP tool), admin.js (data editor)
  data/          All content as JSON — this is what you edit
scripts/         Ingestion, change-watch, discovery, validation
  lib/           Shared feed parsing and classification
test/            Offline tests and feed fixtures
```

## Editing

Four routes, easiest first — issue forms, the built-in `/admin.html` editor,
direct JSON editing on GitHub, or asking Claude. All documented in
[MAINTENANCE.md](MAINTENANCE.md).
