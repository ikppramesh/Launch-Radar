# Launch Radar

Every gadget launched worldwide, logged day by day, with a link to the coverage.

**Live site:** https://gadgets-ir.vercel.app/ (Vercel) · https://ikppramesh.github.io/Launch-Radar/ (GitHub Pages)

## How it stays up to date

Nothing needs to run on your computer. A GitHub Actions workflow
([.github/workflows/update.yml](.github/workflows/update.yml)) runs **every 3 hours** on GitHub's servers:

1. Reads ~25 gadget news feeds (GSMArena, The Verge, Engadget, Gizmochina, Gadgets 360, …) plus Google News
   searches across 6 country editions (US, India, UK, Singapore, Australia, Canada).
2. Keeps only headlines about a hardware **launch**. Rumours, leaks, deals, reviews and software updates are dropped.
   Each item is tagged *Launched* or *Upcoming*, plus brand, category and market.
3. Merges the same launch reported by several outlets into one row. The **Buzz** column shows how many outlets covered it.
4. Saves one file per day in `public/data/YYYY-MM-DD.json`, commits it, and redeploys the site.

To force an update right now: **Actions → Update gadget launches → Run workflow**.

## Using the site

- **Day strip / date picker:** pick any day; *Last 7 days* shows a week grouped by day.
- **Launched / Upcoming / All:** launched products vs. announced launch dates and teasers.
- **Filters:** search, category chips, brand, region, sort by newest or most-covered.
- Click a row to see the summary and every outlet's link. **Open ↗** goes to the article.
- **Export CSV** downloads the current view. The URL keeps your filters, so you can share or bookmark it.

## Run locally (optional)

Requires Node 18+. There are no dependencies to install.

```bash
npm start          # http://localhost:3000, refreshes on start and every 3 h
npm run fetch      # one-off data update
```

Settings (environment variables): `PORT`, `REFRESH_HOURS`, `TZ_DISPLAY` (timezone that defines "today", defaults to the system zone).

## Customising

- Add or remove sources: [src/sources.js](src/sources.js)
- Tune what counts as a launch, categories, brands, regions: [src/classify.js](src/classify.js)
