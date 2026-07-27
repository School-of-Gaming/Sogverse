# Testing

Tests live here in four categories — `unit/`, `integration/`, `db/`, and `e2e/` — plus
two support dirs: `mocks/` (shared mock factories — add new mocks here rather than
duplicating across files) and `helpers/`. Two Vitest configs drive them:
`vitest.config.mts` (jsdom, runs `unit/` + `integration/`) and `vitest.config.db.mts`
(node, runs `db/`).

## Classification

| Category | What goes here | Convention |
|---|---|---|
| **unit** | Pure functions, service classes with injected mock dependencies, mapping/transform logic | `.test.ts`, Vitest |
| **integration** | Route handlers (import real POST/PATCH/GET), proxy, auth flows — full request pipeline with mocked external deps | `.test.ts`, Vitest |
| **db** | RPCs, constraints, RLS policies against real Postgres | `.test.ts`, Vitest (`vitest.config.db.mts`) |
| **e2e** | Playwright browser tests against running dev server | `.spec.ts`, Playwright |

`npm run test` runs `unit/` + `integration/` (the jsdom config). `npm run test:e2e`
runs Playwright.

## DB tests run in CI, not locally

DB tests hit a **real Postgres** and we don't run a local stack (no Docker). They run in
remote CI against a fresh database — so the way to exercise them is to push your branch
and let CI run `test:db`, not to run them on this machine. Their setup
(`tests/db/setup.ts`) fails fast if `SUPABASE_SERVICE_ROLE_KEY` is unset, which is the
expected outcome locally.

Because they run against a real DB, they're also where the schema-side guarantees get
verified: the access-control catalog checks, and the zod RPC-result schemas from each
feature's `*.contracts.ts` parsed against live RPC output. See `supabase/CLAUDE.md` for
the migration workflow and the access-control rules these tests enforce.

### DB test conventions

Shared helpers and constants live in `tests/db/`:

- `helpers.ts` — `createAdminTestClient()` (service-role, bypasses RLS, for
  setup/teardown and assertions) and `createAuthenticatedClient(email, password)` (signs
  in via Supabase Auth and returns a client that respects RLS; each call is a fresh
  client with no shared session).
- `product-helpers.ts` — product-specific seed/reset helpers: `createTestProduct()`,
  `createScheduleSlot()`, `deleteTestProducts()`, `resetFamilySubs()`.
- `constants.ts` — `TEST_IDS` (deterministic UUIDs matching `supabase/seed.sql`),
  `TEST_CREDENTIALS` (email/password per role), and `SEED` values (names that must match
  seed data).

The deterministic `TEST_IDS` (and the credentials/seed values) must stay in sync with
`supabase/seed.sql` — they're the same fixtures viewed from two sides.

## Integration test conventions

Integration tests import route handlers directly and call them with mock `Request`
objects:

```typescript
vi.mock("@/lib/auth", () => ({ requireRole: (...args) => mockRequireRole(...args) }));
import { POST } from "@/app/api/path/route";
const response = await POST(createRequest({ ... }));
```

Mock `requireRole()` to return `{ user, profile, supabase }` for authenticated scenarios
or a `NextResponse` error for unauthorized. Mock Supabase clients
(`@/lib/supabase/admin`, `@/lib/supabase/server`) with `vi.mock()`. Route handlers that
import Next.js's `server-only` marker work because `vitest.config.mts` aliases it to a
stub in `tests/mocks/server-only.ts`.

A route that goes through `defineRoute` still runs the same role gate underneath, so
the same `requireRole` mock drives it and an existing test needs no rewrite. The per-
route bar is unchanged: unauthenticated, wrong role, bad input, happy path.

### The route posture registry

The integration suite carries a registry classifying every API route handler — auth
posture, body discipline, and the test that exercises it — beside the four checks that
consume it. **Adding an API route means adding its registry entry in the same change**,
or the build fails. Three things about maintaining it:

- **A posture that is not role-gated needs a written reason.** Reasons are the whole
  point: a deliberately public route and a route missing its gate look identical
  without one. Write the sentence you would want to read in a security review.
- **Warts are recorded, not excused.** A route standing off the shared primitive, a
  handler with no test, a body parsed without a schema — each has a slot in the
  registry. Recording one keeps it countable; hiding it is how it survives.
- **The untested list is a ratchet, and it is at zero.** The check asserts equality
  against an empty list rather than being deleted once it emptied, so a handler that
  ships with no test fails immediately instead of quietly starting a new backlog. Add
  the test, not an entry.
- **A recorded exception expires on its own.** The checks fail when a file that claims
  to stand off the primitive starts using it, so fixing the code forces the annotation
  to be deleted in the same change instead of rotting into a rubber stamp.

## Unit test setup

`tests/setup.ts` (the jsdom config's setup file) globally mocks `next/navigation` and the
browser Supabase client (`@/lib/supabase/client`), exposing `mockSupabaseClient` for
assertions. Components and hooks under test get a working router and Supabase client
without per-test wiring.
