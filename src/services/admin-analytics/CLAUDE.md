# Admin analytics

The `/admin/analytics` page: the site's traffic, for every admin, most of whom have no
Vercel access. The reads are here; the page body is in `src/components/admin/analytics/`.

**Rule: the page shows what Vercel's Web Analytics dashboard shows, read through the
documented Web Analytics REST endpoint (`src/lib/vercel-analytics.server.ts`), and nothing
else.** Pageviews and visitors, the timeline, top pages, landing pages, campaigns,
referrers, countries and devices. Web Analytics loads only for a visitor who accepted
analytics, so every figure counts those visitors only, and the page says so beside them.
Visitors are distinct device ids, so the page calls them approximate, and they never add
across days or groups.

**Every day on the page is a UTC day**, because Vercel buckets at UTC midnight.

**Every Vercel read is cached for the hour** in Next's data cache, keyed by the read, its
UTC days and the current UTC hour, so no answer is older than the hour it was read in and
admins moving between ranges cannot run down Vercel's rate limit. Each section shows when
its figures were read. A failed read is never cached and never shown as zeros.

**The MCP analytics tools (`src/lib/mcp/analytics.ts`) read through these same functions**,
so an AI app's figure is the page's for the same days, from the same hour's cache. The
landing pages read names each page from the landing page directory in the database, and
takes an optional client for it: the page leaves it out and reads on its cookie session,
and **a tool must hand in the admin's token-bound client**, since a route handler behind
the MCP gate has no session cookie. The filtered reads (a page's paths, campaign labels)
exist for the tools and are cached under their own filter.

**A path asked about is matched in one of two ways.** With a language prefix it is that
one address; without one it is the page in every language, translated through the app's
own path normaliser into each language's address (`/shop` counts `/fi/kauppa`), plus the
bare path. The landing page segment is translated too (`/fi/tutustu/…`), and a landing
slug exists in its own language only, so a landing page is asked about by each language's
address, or by its id without a prefix.
