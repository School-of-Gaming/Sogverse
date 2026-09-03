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

- **The keys are new-format** (`sb_secret_…` / `sb_publishable_…`, both projects), not
  legacy JWTs. **Reach the REST and Auth APIs through `supabase-js`, not curl.** A
  hand-rolled call to `/rest/v1/` or `/auth/v1/` is rejected whatever header shape you
  try — `apikey` alone, `Authorization: Bearer` alone, or both — while the *same key*
  through `createClient(url, key)` authenticates first time. Don't read the rejection as
  a bad or revoked key and go hunting for a replacement; that is the trap, and it costs
  an hour. A one-off script under `scripts/` run with `npx tsx` is the cheap path.
  (Storage batch-delete over curl with `-H "apikey: $KEY"` worked 2026-08-19 and is not
  re-verified since; treat curl as fine for storage and wrong for REST/Auth.)
- **Read `sb-error-code` before theorising.** The gateway names the reason in that
  response header and distinguishes the cases that look identical from the status line:
  `UNAUTHORIZED_INVALID_API_KEY` is the wrong key for the project, whereas
  `UNAUTHORIZED_INVALID_API_KEY_TYPE` is a valid key rejected for how it was presented —
  the signature of the curl trap above. `sb-project-ref` on the same response confirms
  which project answered. The body is empty, so the headers are the only signal.
- For prod incident forensics (the `auth` schema tables, Vercel logs) see
  `prod-incident-investigation.md`; for IO/perf/storage investigation see
  `supabase-db-inspection.md`.
