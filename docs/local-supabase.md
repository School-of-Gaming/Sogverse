# Database Testing with Local Supabase

Day-to-day development uses the **remote** Supabase instance (configured in `.env.local`). A separate **local** Supabase instance runs in Docker and is used exclusively for database integration tests (`npm run test:db`).

In CI (GitHub Actions), these tests run automatically — Docker is pre-installed on the runners. You only need Docker on your own machine if you want to run `npm run test:db` locally.

## CI (no setup needed)

The `test-db` CI job runs on every push:
1. Spins up a local Supabase in Docker
2. Applies all migrations + seed data
3. Runs `npm run test:db`
4. Tears down

No configuration needed — it uses well-known local Supabase keys hardcoded in the workflow.

## Running Tests Locally (optional — requires Docker)

### Prerequisites

- **Docker Desktop** (WSL2 backend on Windows) — [download](https://www.docker.com/products/docker-desktop/)
  - ~4 GB install + ~3 GB for Supabase Docker images
- **Supabase CLI** — already in devDependencies, or install via scoop: `scoop install supabase`

### First-Time Setup

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

3. **Run tests**:
   ```bash
   npm run test:db
   ```

### Useful Commands

```bash
supabase start          # Start all services
supabase stop           # Stop (data persists between restarts)
supabase db reset       # Wipe, re-apply all migrations, re-seed
supabase status         # Show URLs and keys
```

## What Gets Tested

DB tests validate things that mocked tests can't catch:
- **RLS policies** — does the right user see the right rows?
- **RPCs** — does `adjust_token_balance()` actually work atomically?
- **CHECK constraints** — does overdraft prevention fire?
- **UNIQUE constraints** — does idempotency work?
- **Security** — can one user access another user's data?

## Test Architecture

Tests use a separate vitest config (`vitest.config.db.mts`) that:
- Uses `node` environment (no jsdom)
- Runs tests sequentially (shared database)
- Has a 15-second timeout (DB ops are slower than mocked tests)

### Access-Control Tests and Helper RPCs

`access-control.test.ts` queries PostgreSQL system catalogs (`pg_proc`, `pg_tables`, etc.) to verify function grants, RLS status, and table privileges. Because the tests connect through PostgREST (Supabase client), they can't run raw SQL — so the catalog queries are wrapped in helper RPCs (`_list_rpc_access`, `_list_tables_without_rls`, etc.) defined in `00010_access_control_helpers.sql`. These are `REVOKE`d from all roles (only the service-role client can call them) but they still ship to production as test scaffolding.

**Planned improvement:** Replace the helper RPCs with a direct PostgreSQL connection (`pg` package) for the access-control tests. This would let them query catalogs directly, remove the helper functions from production migrations, and keep behavioral tests (RLS, RPCs) on the Supabase client where they belong.

### Test Data Strategy

Seed entities use deterministic UUIDs in the `00000000-...-0000000000xx` range (defined in `tests/db/constants.ts`). Mutation tests create ephemeral rows (via RPCs like `enroll_gamer_in_group`) that get database-generated UUIDs — these are cleaned up between tests by reset helpers.

**Seed data is reference-only** — `seed.sql` creates immutable entities (users, products, groups, games, voice rooms) but no mutable state like enrollments or charges. This prevents cross-file interference: tests run sequentially in a single fork, so one file's mutations could corrupt another file's assumptions.

**Tests own their mutable state** via helpers in `tests/db/helpers.ts`:
- `seedEnrollment(admin)` — creates the test enrollment via direct INSERT (no token deduction). Used by read-only tests (RLS, gedu-groups) in `beforeAll`.
- `resetEnrollmentState(admin)` — deletes all test enrollments (cascades to charges), resets token balances and product cost. Used by mutation tests (enrollment, unenrollment, cron) in `beforeEach`.
- `resetTokenState(admin)` — resets token balances only.

### Test Users (from seed.sql)

| UUID suffix | Role | Email | Password |
|---|---|---|---|
| `...001` | admin | `admin@test.local` | `testpassword123` |
| `...002` | customer | `customer@test.local` | `testpassword123` |
| `...003` | gedu | `gedu@test.local` | `testpassword123` |
| `...004` | gamer | `testgamer@gamer.sogverse.internal` | `testpassword123` |
| `...005` | customer | `customer2@test.local` | `testpassword123` |

### Other Seed Entities

| Entity | UUID suffix | Notes |
|---|---|---|
| Game | `...010` | "Test Game" |
| Product | `...020` | "Test Product" — Wed 15:00 Helsinki, cost=2 |
| Group | `...030` | Gedu assigned to Test Product |
| Voice room | (auto) | Linked to Test Group |
| Parent-gamer link | `...100` | Customer 1 → Gamer |

Enrollments, charges, and token transactions are **not seeded** — tests create them as needed.

## Migration Workflow

1. Write migration in `supabase/migrations/`
2. Test locally (if Docker is available): `supabase db reset && npm run test:db`
3. Or just push — CI will validate the migration automatically
4. Push to remote: `supabase db push -p "$SUPABASE_DB_PASSWORD"`

## Troubleshooting (local only)

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
