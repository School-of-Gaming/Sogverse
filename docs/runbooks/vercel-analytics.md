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
- **Pro serves the latest 30 days only** — `--since 45d` is a hard `bad_request`, not a
  clamp. Compare windows by stepping inside that month (`--since 14d --until 7d`); a
  regression older than 30 days cannot be dated from here at all.
- **Web Analytics: `vercel.analytics_event.count`** — dimensions incl. `event_name`,
  `event_data/<prop>`, `request_path`, `route`, `visitor_id`. E.g.
  `--filter "event_name eq 'dashboard_nav'" --group-by event_data/role --since 30d`;
  `--aggregation unique/visitor_id` for uniques. Custom events carry
  `request_path`/`route` automatically. The docs' "2 properties per custom event on Pro"
  is **not** observed to truncate — a 3-property event arrives whole.
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
- **A public, documented Web Analytics API exists**
  (`api.vercel.com/v1/query/web-analytics/visits/aggregate`, groupBy
  time/route/country/referrer). Prefer it for anything durable; shape unverified as of
  2026-08-18.
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
- Baseline for scale judgments: **2026-08-18, last 7d prod: 3,866 pageviews / 622
  devices** (~550 pv/day, ~90 visitors/day).
- **Domain → branch mapping (verified 2026-08-18):** `sogverse.sog.gg` = production,
  serves `main`. `sogverse-staging.sog.gg` = staging, serves the latest `dev` preview
  deployment (updates on every dev push, no release needed).
  `sogverse-git-dev-school-of-gaming.vercel.app` is the stable raw alias for the same
  dev tip.
