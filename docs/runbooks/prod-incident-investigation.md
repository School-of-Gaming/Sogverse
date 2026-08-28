# Investigating a prod incident (Vercel + Supabase logs)

How to investigate "the site was broken N minutes ago" with the Vercel and Supabase
CLIs — the reusable methodology, with the gotchas that each cost trial-and-error.

## Vercel logs (the historical-query gotchas)

- `vercel logs <deployment-url>` only **live-tails forward** and auto-aborts after
  5 min — useless for a past incident.
- For history, query the **linked project** with `--no-follow --since 90m --until 25m`
  (ISO or relative).
- **CRITICAL: pass `--no-branch`.** `vercel logs` auto-filters by the current git
  branch (`dev`), but prod runs **`main`** — without `--no-branch` you get "No logs
  found" and wrongly conclude there is no traffic.
- Add `--environment production`. `--level error` surfaces server-side thrown errors;
  `--json` puts the full stack/message in `message` (the status field is
  `responseStatusCode`, not `statusCode`). `--status-code` wants integers (`500`), not
  `5xx` (that 400s). Output is capped at ~100 lines per query.
- **Browser-side auth calls Supabase directly and bypasses Vercel entirely.** Its
  failures surface as errors thrown inside the proxy/SSR page render (a GET page log),
  not as a failing API POST — so don't conclude "no error" because no POST failed.
- **`vercel logs --json` carries NO timing** — no `duration`, no `initDuration` — so
  the CLI alone cannot distinguish a cold start from a slow render. Per-invocation
  timing needs the dashboard (Observability → Traces, web only).
- Two log lines per request: `source:"serverless-middleware"` (the proxy) and
  `source:"serverless"` (the page/route render). The `cache` field (`HIT`/`MISS`) is
  genuinely useful — `MISS` on a public route confirms it isn't edge-cached.
- **Server render timing without the dashboard:** `curl -s -o /dev/null -w
  "ttfb=%{time_starttransfer}s total=%{time_total}s" <url>` measures pure server render.
  Hit it 3× back-to-back: request 1 vs 2/3 shows warm-vs-warmer. `X-Vercel-Cache` +
  `X-Vercel-Id` (region) come back in headers. Measured prod home 2026-05-31: warm
  ~175–200 ms total — steady-state server render is fast; a 4 s browser LCP on a hard
  initial load is a cold/initial artifact, not a per-request cost.
- The CLI's auth token lives in the standard Vercel CLI auth file under the user
  profile; the REST deployment-events endpoint returns empty for historical runtime
  logs — use the CLI instead.

## Supabase prod (NOT staging)

- Connection: `remote-supabase-psql.md`. Always confirm which project you are on before
  drawing conclusions — the plain `SUPABASE_*` keys point at staging.
- **`auth.audit_log_entries` is EMPTY on prod** (audit logging disabled). For
  sign-in/signup/session forensics query the `auth` schema directly: `auth.sessions`
  (sign-ins), `auth.users` (`created_at` / `last_sign_in_at`), `auth.refresh_tokens`
  (rotation / `revoked`). Cross-reference those timestamps against the Vercel error
  timestamps to confirm a theory.
- Supabase's own service-level logs live in Logflare analytics, reachable via the
  Management API with `SUPABASE_ACCESS_TOKEN` (in `.env.local`; see
  `supabase-db-inspection.md` for what it can and cannot reach). In practice the
  DB-password psql path plus Vercel's `--level error` logs already capture what is
  needed.

## General approach

Trust the log evidence over the nearest-matching doc — a plausible-sounding past bug
write-up can be a decoy. Pin down the incident time window first, pull Vercel
`--level error --json` for it, then corroborate against the `auth`-schema tables by
matching timestamps to the second.
