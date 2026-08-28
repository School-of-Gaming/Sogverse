# Supabase DB inspection (IO / perf / storage)

How to investigate a remote Supabase DB (prod or staging) for IO, performance, or
storage questions — methodology, not point-in-time facts. Connection details live in
`remote-supabase-psql.md`; incident forensics in `prod-incident-investigation.md`.

## `supabase inspect db` (the fast path)

- The CLI is logged in to the org account — `supabase projects list` shows staging +
  prod `sogverse` + a sandbox. No re-auth needed.
- **Use the SESSION pooler (port 5432), NOT the transaction pooler (6543).** Over 6543
  every inspect command fails with `prepared statement "lrupsc_1_0" already exists` —
  the CLI's prepared statements are incompatible with transaction pooling. (Plain psql
  is fine on 6543; only the CLI needs 5432.)
- Pass `--db-url` **percent-encoded**. Encode the password:
  `ENC=$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$PW")`,
  then `postgresql://postgres.<ref>:${ENC}@<host>:5432/postgres`.
- Most useful subcommands for IO triage: `db-stats` (cache hit rates + sizes + WAL),
  `traffic-profile` (per-table read/write block-IO — the best single "what's doing IO"
  view), `vacuum-stats` (bloat / pending autovacuum), `outliers`/`calls`
  (pg_stat_statements — these dump >90KB, redirect to a file). `cache-hit`/`seq-scans`
  are deprecated aliases of `db-stats`/`index-stats`.
- Strip CLI noise with `grep -vE 'new version|recommend updating|Connecting to remote'`.

## Direct psql for what the CLI doesn't cover

- `SET default_transaction_read_only = on;` first — safety on prod.
- Two-arg `round()` needs `::numeric` (`round(x::numeric, 1)`); on bare
  `double precision` it errors.
- **Disk/storage usage:** `pg_database_size('postgres')` is the logical DB size (the
  metric counting against a storage quota). WAL (`pg_ls_waldir()`) is separate and
  transient. `pg_total_relation_size()` per table for the breakdown.
- **What's burning disk IO:** `pg_stat_statements` ordered by `shared_blks_read` (disk
  reads), `shared_blks_dirtied`/`written` (writes), `temp_blks_written` (sort/hash
  spills), `wal_bytes`. pgss is cumulative since `stats_reset` — no per-execution
  timestamps, so it can't say *when* something ran.
- **Cache effectiveness:** `pg_statio_user_tables` heap hit/read, or `pg_stat_database`
  blks_hit/read. High hit ratio ⇒ reads aren't the IO problem; look at writes.
- **Time-bucketed load** (blip vs trend): bucket `auth.sessions.created_at` /
  `auth.refresh_tokens.created_at` by `date_trunc`. Token-rotation + session writes are
  usually the dominant app-driven disk IO; tokens-per-session ≈ 1 is normal, a high
  ratio signals a refresh stampede.
- **Live activity:** `pg_stat_activity` (`application_name` distinguishes postgrest /
  Supavisor / postgres_exporter / your own session); connections vs `max_connections`.

## Egress / usage (billing metrics)

- **The CLI has no usage/billing command.** "Cached Egress" = bytes served through
  Supabase's CDN — for Sogverse that's the public `product-images` Storage bucket.
  Investigate the *cause* via psql (`storage.objects` metadata size joined to
  `products`) + a real GET on a public object URL (a HEAD lies about Cache-Control).
- **Billing usage numbers (egress by category) are dashboard-only — stop looking for an
  API.** Verified 2026-08-18 with a working PAT: the public Management API
  (`api.supabase.com/v1`) has no usage/billing endpoint — only the node-level
  Prometheus dump (CPU/disk/pgbouncer/NIC, ~1MB, no CDN egress meters). The dashboard's
  usage paths return 401 for PATs (dashboard session auth only).
- `SUPABASE_ACCESS_TOKEN` (`sbp_` prefix) in `.env.local` is the CLI's own login token
  (goes stale if `supabase logout` runs). Works for `/v1/*`: orgs, projects, config,
  analytics endpoints.

## Where the CLI/psql path runs out

- **Node-level infra gauges** — disk IOPS/throughput, burst budget, CPU, memory, disk
  space (what "Disk IO Budget" emails measure) — are NOT in the DB catalogs; psql sees
  the workload, never the EBS volume's meter. Two routes: (1) Dashboard →
  Reports/Database → Disk IO + the Observability IOPS view (web only); (2) the
  privileged Prometheus endpoint
  `https://<ref>.supabase.co/customer/v1/privileged/metrics` (basic auth
  `service_role:<key>`).
  - **The prod service-role key is deliberately NOT in `.env.local`** (only staging's
    is; prod rejects it). Intentional: the key is god-mode and the owner wants to
    minimize prod/staging misroute risk. **Only ask for it when an investigation
    genuinely needs route (2)** — a live, scriptable read of node gauges the dashboard
    can't give. For one-off infra questions, the dashboard is the expected path.
- The **CPU "Max per day"** dashboard bar is a per-day instantaneous max — a single
  query spike inflates it. The time-of-day breakdown is the real picture; busy slivers
  that are **IOwait** (red), not User/System, mean a disk-IO story, not a CPU one.
- **Watch your own footprint:** ad-hoc investigation queries (recursive catalog CTEs,
  pgss dumps, `inspect db outliers`) themselves spill to temp and burn IO — the
  investigator shows up in the very charts being read. On a small/burstable instance an
  unthrottled agent can dent the burst budget by itself. Prefer staging for heavy
  exploration, especially before a known traffic event.
