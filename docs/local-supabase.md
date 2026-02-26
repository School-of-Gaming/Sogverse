# Local Supabase Setup

Local Supabase provides a Postgres instance for database integration tests and CI. Day-to-day development uses the remote Supabase instance as usual.

## Prerequisites

- **Docker Desktop** (WSL2 backend on Windows) — [download](https://www.docker.com/products/docker-desktop/)
- **Supabase CLI** — already in devDependencies, or install via scoop: `scoop install supabase`

Verify Docker is running:
```bash
docker --version
```

## First-Time Setup

1. **Start local Supabase** (from project root):
   ```bash
   supabase start
   ```
   This applies all migrations and runs `supabase/seed.sql`. First run downloads Docker images (~2-5 min).

2. **Copy environment template for tests**:
   ```bash
   cp .env.test.local.example .env.test.local
   ```
   The default keys work for all local Supabase instances — no changes needed.

3. **Verify**:
   ```bash
   npm run test:db
   ```

## Running Database Tests

```bash
npm run test:db       # Run all DB tests
npm run test:db:ui    # Run with Vitest UI
```

These tests use a separate vitest config (`vitest.config.db.mts`) that:
- Uses `node` environment (no jsdom)
- Runs tests sequentially (shared database)
- Has a 15-second timeout (DB ops are slower than mocked tests)

## What Gets Tested

DB tests validate things that mocked tests can't catch:
- **RLS policies** — does the right user see the right rows?
- **RPCs** — does `adjust_token_balance()` actually work atomically?
- **CHECK constraints** — does overdraft prevention fire?
- **UNIQUE constraints** — does idempotency work?

These run in CI on every push, so migration bugs and RPC security issues are caught before merging.

## Test Architecture

Tests use **UUID isolation** — all test data uses deterministic UUIDs in the `00000000-...-0000000000xx` range. Tests only clean up their own rows.

### Test Users (from seed.sql)

| UUID suffix | Role | Email | Password |
|---|---|---|---|
| `...001` | admin | `admin@test.local` | `testpassword123` |
| `...002` | customer | `customer@test.local` | `testpassword123` |
| `...003` | gedu | `gedu@test.local` | `testpassword123` |
| `...004` | gamer | `testgamer@gamer.sogverse.internal` | `testpassword123` |
| `...005` | customer | `customer2@test.local` | `testpassword123` |

## Useful Commands

```bash
supabase start          # Start all services
supabase stop           # Stop (data persists between restarts)
supabase db reset       # Wipe, re-apply all migrations, re-seed
supabase status         # Show URLs and keys
```

## Migration Workflow

1. Write migration in `supabase/migrations/`
2. `supabase db reset` — verify it applies cleanly locally
3. `npm run test:db` — verify DB tests still pass
4. Push to remote: `supabase db push -p "$SUPABASE_DB_PASSWORD"`

## Troubleshooting

### Docker not running
```
Error: Cannot connect to the Docker daemon
```
Start Docker Desktop and wait for it to fully initialize.

### Port conflicts
If port 54321 is in use, check `supabase/config.toml` and change the port, then update `.env.test.local`.

### pg_cron not available
Local Supabase may not include `pg_cron`. If a migration fails because of it, wrap the `pg_cron` calls in a guard:
```sql
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- pg_cron operations here
  END IF;
END $$;
```

### Stale state
If tests fail unexpectedly after migration changes:
```bash
supabase db reset    # Wipe and re-apply everything
npm run test:db      # Re-run tests
```
