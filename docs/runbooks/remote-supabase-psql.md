# Remote Supabase via psql (staging and prod)

How to connect to the remote Supabase databases with psql. Several other runbooks build
on this one.

- Pooler host is `aws-1-eu-north-1.pooler.supabase.com` (NOT `aws-0` — aws-0 answers
  "tenant/user not found"). **Both** staging and prod live in North EU / Stockholm on
  `aws-1`.
- Port `6543`, user `postgres.<project-ref>`, db `postgres`.
- Use the `PGPASSWORD` env var (single `%` survives in single quotes), not a connection
  string (where `%` must be URL-encoded). Read the password from `.env.local` so it
  never lands in chat or shell history:
  `PGPASSWORD=$(grep '^SUPABASE_PROD_DB_PASSWORD=' .env.local | cut -d= -f2-)`.
- **Writes: the session can open with `default_transaction_read_only = on`** (seen on
  staging 2026-08-18 — `cannot execute UPDATE in a read-only transaction`). Prefix write
  statements with `SET default_transaction_read_only = off;` and wrap them in an
  explicit `BEGIN READ WRITE; … COMMIT;`.
- **Two projects — pick deliberately.** Plain `SUPABASE_*` keys in `.env.local` =
  **staging** (`dbcozhkmfsczwgduizkg`). Prod is under `SUPABASE_PROD_DB_PASSWORD` /
  `SUPABASE_PROD_PROJECT_REF` (`yoqkelsopqsksqrkrorx`, project name `sogverse`).

  ```bash
  # staging (psql is on PATH — resolves to the scoop install in both PowerShell and Bash):
  PGPASSWORD='...' psql \
    -h aws-1-eu-north-1.pooler.supabase.com -p 6543 \
    -U postgres.dbcozhkmfsczwgduizkg -d postgres -f migration.sql
  # prod: same host/port, user postgres.yoqkelsopqsksqrkrorx, password from SUPABASE_PROD_DB_PASSWORD
  ```

- **Raw REST calls (storage, PostgREST via curl): the keys are new-format**
  (`sb_secret_…` / `sb_publishable_…`, both projects), not legacy JWTs. Send them as
  `-H "apikey: $KEY"` — `Authorization: Bearer` fails with `403 "Invalid Compact JWS"`
  (the server tries to parse the key as a JWT). App code is unaffected; only
  hand-crafted calls hit this. Verified against prod storage batch-delete 2026-08-19.
- For prod incident forensics (the `auth` schema tables, Vercel logs) see
  `prod-incident-investigation.md`; for IO/perf/storage investigation see
  `supabase-db-inspection.md`.
