# Reading Vercel Web Analytics & Speed Insights

How to read traffic/perf *measurements* for the prod app programmatically (team slug
`school-of-gaming`, projectId `prj_25TSZ5ipsOc5Jx8s3nNMqrnXtVWA`). Distinct from
`prod-incident-investigation.md`, which owns incident forensics via `vercel logs`.

- **`vercel metrics` (re-verified 2026-08-28, CLI 59.4.0) is the easiest read — no token
  handling at all.** Needs CLI ≥ 59. `vercel metrics schema` lists every metric;
  `vercel metrics schema <metric>` gives its aggregations and dimensions. Standing flags
  here: `--project sogverse --scope school-of-gaming --prod` (drop `--prod` and filter
  `environment eq 'preview'` for staging). Filters repeat and AND together
  (`-f "route eq '/shop'" -f "device_type eq 'desktop'"`); `--granularity 1d
  --bucket-timezone Europe/Helsinki` gives a daily series.
- **Read the number off `--json`, not off the printed table.** `--json` returns
  `summary[0]` (the aggregate over the whole window — the figure you actually want) and
  `data[]` (per-bucket). The human table prints only per-bucket min/max and an **`avg`
  column that averages the per-bucket aggregate**, which is not the window's percentile
  and can sit far below it when the slow buckets are the thin ones.
- **With `--group-by`, `summary` becomes one entry per group — and `--limit` silently
  defaults to 10.** The flag means "max groups per time bucket", so grouping by `route` on
  a project with ~78 live routes returns the top ten and looks like the whole list. Pass
  `--limit 100` (with `--granularity 1d`, so the cap applies per day rather than per
  auto-chosen bucket) whenever the question is "what is the distribution" rather than "what
  is the top handful". Ordering is by the count aggregation even when you asked for
  uniques, so a uniques listing comes back in the wrong order — sort it yourself.
- **The 30-day floor is `vercel metrics`' observability query, not the account** —
  `--since 45d` is a hard `bad_request`, not a clamp. Compare windows by stepping inside
  that month (`--since 14d --until 7d`); a regression older than 30 days cannot be dated
  from the CLI at all. The Web Analytics REST endpoint below is not bound by it and
  reaches back 24 months on our entitlement, so date an old regression there instead.
- **Prefetch share is a zero-code read: `vercel.request.count` carries
  `is_prefetch_request`.** Its `path_type eq 'streaming_func'` slice equals
  `vercel.function_invocation.count` request for request (verified 2026-09-08, same
  number on both metrics for a whole day), so `--group-by is_prefetch_request --group-by
  path_type` splits function invocations into prefetches and real navigations directly.
  Term-time reading: prefetch is 84–86% of invocations and 57% of all edge requests
  (`../investigations/request-amplification.md`). Two consequences for reading alerts:
  Vercel's "function invocations spike" / "edge requests spike" anomaly mails fire on the
  Monday-after-weekend ramp (weekend days run 5–12k invocations, weekdays 30–48k), and a
  single admin browser working the sidebar-and-list pages can be a quarter of a day's
  invocations without anything being wrong — group by `client_ip` and then by `route`
  for that IP before concluding abuse; `bot_category`, `waf_action` and `http_status`
  are the other three reads that clear a spike.
- **Web Analytics is two metrics, not one — pick deliberately.**
  `vercel.analytics_pageview.count` is **pageviews**, and is what any "where do people go"
  question wants: dimensions `route`, `request_path`, `referrer_hostname`,
  `request_hostname`, `device_type`, `browser_name`, `os_name`, `country`, `visitor_id`,
  and (re-verified 2026-09-15) the five UTM fields `utm_source`, `utm_medium`,
  `utm_campaign`, `utm_content`, `utm_term` — so "views of a landing page by campaign" is
  a `--group-by utm_campaign` read, not a dashboard-only one. Remember what feeds it: the
  script mounts only for a visitor who accepted analytics on the cookie banner, so every
  pageview count is of consenting visitors.
  `vercel.analytics_event.count` is **custom events only** — dimensions incl. `event_name`,
  `event_data/<prop>`, `request_path`, `route`, `visitor_id`. E.g.
  `--filter "event_name eq 'dashboard_nav'" --group-by event_data/role --since 30d`;
  `--aggregation unique/visitor_id` for uniques on either. Custom events carry
  `request_path`/`route` automatically. The docs' "2 properties per custom event on Pro"
  is **not** observed to truncate — a 3-property event arrives whole.
- **Web Analytics is reachable from a script by plain bearer token, through the
  documented REST endpoint — re-verified 2026-09-15 against prod, and the thing to build
  anything durable on.** `GET https://api.vercel.com/v1/query/web-analytics/visits/aggregate`
  with `teamId`, `projectId`, `since`, `until` and up to two `by` dimensions
  (`by=day&by=utmCampaign`); a third is rejected. `limit` caps at 100 and the overflow is
  **folded into a literal `"Others"` row** rather than dropped, so a listing that could
  exceed 100 wants a narrower `filter`, not a bigger limit — and an unnoticed `"Others"`
  row is how a top-N read gets mistaken for the whole distribution. `filter` takes
  `eq`/`ne`/`in`/`and`/`or`/`not`/`startswith`, e.g. `route eq '/shop'` for one page
  across every language or `startswith(requestPath,'/shop/')` for a subtree. Each bucket
  returns `pageviews` and `visitors`; buckets are UTC midnight, so a daily series here is
  not the Helsinki day the CLI's `--bucket-timezone` gives, and **an absent UTM value
  comes back as the empty string, not null** — group keys have to be normalised before
  they are joined to anything. Rate limit 400 per minute window, 0.4–1.0 s per call. The
  team holds the `web-analytics-plus` entitlement, so the window is **24 months** (data
  from 2026-05-31, when analytics was switched on). Separately: the CLI's `vercel metrics`
  posts to an undocumented `POST /v2/observability/query`, which does allow four `groupBy`
  dimensions and a `bucketTimezone` — reach for it only when two dimensions genuinely will
  not do, because nothing about it is in the REST docs and it can change without notice.
- **`route` is one row per page across every language; `request_path` keeps the split.**
  The app supplies `route` itself as the untranslated, locale-stripped route template, so
  `-f "route eq '/shop'"` covers `/fi/kauppa` and `/sv/butik` too — group by
  `request_path` when the question is which language a page was read in.
- **Unique `visitor_id` is per device and resets — treat it as ordering, not headcount.**
  It routinely exceeds any plausible number of people for an authenticated route.
- **`referrer_hostname` can neither prove nor disprove inbound clicks from email.**
  Same-origin navigation reports it blank, and so do the many mail clients that strip the
  referrer, so both land in one indistinguishable bucket — on our authenticated product
  pages that bucket is over 99% of hits. Attributing a mail's clicks means putting a marker
  in the link and grouping by `request_path`; no dimension recovers it after the fact.
- **Speed Insights is in `vercel metrics` too, and it is the sharper Core Web Vitals
  tool.** `vercel.speed_insights.{ttfb,fcp,lcp,inp}_ms` and `.cls`, each with a
  `*_count` companion giving `n`; aggregations include `p50` through `p99`. Dimensions:
  `route`, `request_path`, `device_type`, `browser_name`, `os_name`, `country`,
  `deployment_id`, `request_hostname`, plus **`attribution_target`**, which names the
  LCP element by CSS path — that is what turns an LCP number into a diagnosis rather
  than a complaint. **Take the device split by default:** the two populations can differ
  by multiples on one route, and a combined p75 hides it. Pull `p50` beside `p75` for
  the same reason — a large gap between them means a bimodal route (a fast majority and
  a slow minority), which is a different problem from a uniformly slow one.
- **For an image-driven LCP, `vercel.image_transformation.*` is the companion read.**
  `.count` counts *new* transformations — i.e. optimizer cache misses — with dimensions
  incl. `optimized_width_pixels`, `image_transformation_region` and
  `source_image_hostname`; `.request_duration_ms` is what that miss cost the visitor who
  triggered it. A low count is not reassurance: at a few transforms a day every one is a
  cold encode, paid synchronously in front of somebody's LCP.
- **`npm run perf:insights` (`scripts/speed-insights.mjs`) is the broad periodic pull,
  and it holds one number `vercel metrics` cannot produce at all: the
  good/improvable/poor **distribution** — the share of real pageviews in each bucket.**
  `vercel metrics` filters accept dimensions only, the measure is not one
  (`-f "lcp_ms ge 2500"` → `invalid_query`), and there is no rating dimension, so no
  combination of flags gets there. Percentiles are reproducible; bucket shares are not.
  That matters because `../architecture/performance.md` grades on the poor-bucket share
  as well as p75 — **a snapshot pulled only from `vercel metrics` is missing half of
  what a verdict is supposed to weigh.** Use `vercel metrics` for a specific question,
  the script for a snapshot, and do not retire the script on the strength of the metrics
  path covering "most" of it.
- **Web Analytics internal endpoint — verified working 2026-08-18:**
  `https://vercel.com/api/web-analytics/v2/overview` and `.../v2/timeseries` with
  `teamId=<team slug>&projectId=...&environment=production&from=<ISO>&to=<ISO>`,
  `Authorization: Bearer <CLI token>`. Overview returns `{total, devices}` (pageviews,
  unique devices). `v1` and unversioned paths 404. No per-path breakdown endpoint found
  — the dashboard's Analytics → Pages panel is the fallback.
- **Prefer the documented public API over that internal endpoint for anything durable** —
  its shape is no longer a guess: the bullet above records it as verified against prod.
- **Auth: `vercel metrics` rides the CLI's own login and needs no token handling**, so
  any session can run it directly — prefer it for that reason alone.
- **The script reads the CLI's auth file directly, and that file moves.** The CLI keeps
  a short-lived OAuth access token (`token`, `expiresAt`, `refreshToken`) and refreshes
  it for its own calls; `VERCEL_TOKEN` still overrides. On Windows the CLI moved the
  file from `%APPDATA%/com.vercel.cli/Data` to `%APPDATA%/xdg.data/com.vercel.cli`
  **without deleting the old one**, so a machine logged in across the move keeps a live
  file and a frozen one, and reading the frozen one yields a token that looks fine and
  is rejected. The script checks every known location and **skips any candidate whose
  `expiresAt` has passed**, so a newer file wins wherever the CLI puts it next. When it
  reports the token expired, run `vercel login` — interactive, so the owner runs it via
  `!` — and retry.
- **Read the script's failure mode before assuming the endpoint moved.** "Vercel token
  expired" is the script's own check and wants `vercel login`. A raw **403
  `invalidToken`** means a token that is unexpired but not accepted — a revoked login,
  or a `VERCEL_TOKEN` scoped to the public API rather than the dashboard endpoints. Only
  a **404** means the internal API moved: re-capture the request URL from the
  dashboard's network tab and update the script's paths. The three want different
  responses and the 404 is the rarest.
- Baseline for scale judgments — **date it, and re-pull each term.** Last 7d prod on
  2026-09-08: **15,748 pageviews / 2,634 unique visitor ids** (~2,250 pv/day). The same
  7-day window read 3,866 pageviews / 622 devices on 2026-08-18 — a **4× step that is
  entirely seasonal**, from the autumn term and the school-facing traffic arriving with it.
  A summer baseline understates term time by multiples, so never compare across the term
  boundary without saying which side each figure sits on.
- **Traffic shape in term time (30d to 2026-09-08), for judging whether a route's `n` can
  carry a percentile at all:** the public `/schools/*` pages are the largest block by a
  wide margin, then the sign-in funnel (`/login`, `/select-profile`, `/parent/unlock`); the
  role dashboards sit roughly an order of magnitude below the landing pages, and the
  per-product and voice-room routes an order below those, in the high hundreds per month.
- **Domain → branch mapping (verified 2026-08-18):** `sogverse.sog.gg` = production,
  serves `main`. `sogverse-staging.sog.gg` = staging, serves the latest `dev` preview
  deployment (updates on every dev push, no release needed).
  `sogverse-git-dev-school-of-gaming.vercel.app` is the stable raw alias for the same
  dev tip.
