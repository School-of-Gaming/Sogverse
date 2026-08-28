# Reading Vercel Web Analytics & Speed Insights

How to read traffic/perf *measurements* for the prod app programmatically (team slug
`school-of-gaming`, projectId `prj_25TSZ5ipsOc5Jx8s3nNMqrnXtVWA`). Distinct from
`prod-incident-investigation.md`, which owns incident forensics via `vercel logs`.

- **`vercel metrics` (verified 2026-08-22) is the easiest read — no token handling at
  all.** Needs CLI ≥ 59. Shapes:
  `vercel metrics schema vercel.analytics_event` (dimensions incl. `event_name`,
  `event_data/<prop>`, `request_path`, `route`, `visitor_id`);
  `vercel metrics vercel.analytics_event.count --filter "event_name eq 'dashboard_nav'"
  --group-by event_data/role --since 30d --project sogverse --scope school-of-gaming
  --prod`; `--aggregation unique/visitor_id` for uniques; drop `--prod` and filter
  `environment eq 'preview'` for staging. Custom events carry `request_path`/`route`
  automatically. The docs' "2 properties per custom event on Pro" is **not** observed
  to truncate — a 3-property event arrives whole.
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
- **Speed Insights:** `npm run perf:insights` (`scripts/speed-insights.mjs`) — see
  `../architecture/performance.md`. Per-route `n` (datapoints) is the traffic proxy for
  route-level visit rates.
- **Auth:** the token is the Vercel CLI login (standard CLI auth file under the user
  profile; `VERCEL_TOKEN` env var overrides). If tooling can't read the auth file, have
  the owner run the script via `!`.
- Baseline for scale judgments: **2026-08-18, last 7d prod: 3,866 pageviews / 622
  devices** (~550 pv/day, ~90 visitors/day).
- **Domain → branch mapping (verified 2026-08-18):** `sogverse.sog.gg` = production,
  serves `main`. `sogverse-staging.sog.gg` = staging, serves the latest `dev` preview
  deployment (updates on every dev push, no release needed).
  `sogverse-git-dev-school-of-gaming.vercel.app` is the stable raw alias for the same
  dev tip.
