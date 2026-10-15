# Admin analytics

The `/admin/analytics` page: the site's traffic and the families it brings in, for every
admin, most of whom have no Vercel access. The reads are here; the page body is in
`src/components/admin/analytics/`.

**Rule: the page shows three measures, and they never stand in for one another.** Each
counts a different population, and every place a figure appears says which:

- **Pages served** — HTML documents served to people on production, from Vercel's edge
  request log: every visitor, whatever they answered on the cookie banner. Bots are left
  out except `application` (the Facebook and Instagram in-app browsers, real parents).
  It counts full page loads only, and it cannot be split by campaign: the log's path
  carries no query string. It is the denominator.
- **Pageviews and visitors** — Vercel Web Analytics, which loads only for a visitor who
  accepted analytics. Among ad visitors that has been measured at roughly one in ten, so a
  pageview figure without its consent label reads as a fraction of the real traffic.
  Visitors are distinct device ids, so the page calls them approximate, and they never
  add across days or groups.
- **Signups** — customer profiles by `created_at`, from our own database: complete. Their
  UTM columns are written only for a parent whose consent cookie granted marketing
  (`src/lib/utm.ts`), so the split by campaign covers those families only. Only counts
  leave the read; `src/lib/utm.ts` forbids tying a campaign to one person beside what they
  did.

**Every day on the page is a UTC day**, because Vercel buckets at UTC midnight; the
signups are bucketed the same way so no figure uses another day boundary.

**The request log is read through an undocumented endpoint**, the observability query the
CLI's `vercel metrics` posts to. One function in `src/lib/vercel-analytics.server.ts` calls
it, and any failure there shows that measure as unavailable and leaves the rest standing.
It holds about the last 30 days, and filtering on content type is slow, so it is read one
day per call. The analytics token must be allowed to read it: a token that is not gets a
404 "Observability Data not found", which the page reports as refused rather than as a
passing failure.

**Every Vercel read is cached for the hour** in Next's data cache, keyed by the read, its
UTC days and the current UTC hour, so no answer is older than the hour it was read in and
admins moving between ranges cannot run down Vercel's rate limit. The request log is
cached per day, so a wider range reuses the days a narrower one read. Each section shows
when its figures were read. A failed read is never cached and never shown as zeros.
