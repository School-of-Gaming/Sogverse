# Testing

Tests live here in four categories — `unit/`, `integration/`, `db/`, and `smoke/` — plus
two support dirs: `mocks/` (shared mock factories — add new mocks here rather than
duplicating across files) and `helpers/`. Two Vitest configs drive them:
`vitest.config.mts` (runs `unit/` + `integration/`, as two projects — see below) and
`vitest.config.db.mts` (node, runs `db/`).

## Classification

| Category | What goes here | Convention |
|---|---|---|
| **unit** | Pure functions, service classes with injected mock dependencies, mapping/transform logic | `.test.ts`, Vitest |
| **integration** | Route handlers (import real POST/PATCH/GET), proxy, auth flows — full request pipeline with mocked external deps | `.test.ts`, Vitest |
| **db** | RPCs, constraints, RLS policies against real Postgres | `.test.ts`, Vitest (`vitest.config.db.mts`) |
| **smoke** | Assertions on the HTTP responses of a served production build — headers, CSP | `.spec.ts`, Playwright |

`npm run test` runs `unit/` + `integration/`. `npm run test:smoke` runs Playwright. To
run a single file, use `npx vitest run <file>` — never `npm run test -- --run <file>`:
the npm script already carries `--run`, so the doubled flag is a vitest error ("Expected
a single value for option --run").

## Node is the default environment; the DOM is opted into

Booting a jsdom realm is the single largest cost in this suite, and it was being paid by
every file — including the great majority, which never touch the DOM at all. So the
config splits `unit/` + `integration/` into two projects, and the rule for a new test is
one line: **write `.ts` unless the test renders, and it gets node.**

- **A `.tsx` test gets jsdom by extension.** Anything mounting React belongs in the
  component project, and there is nothing to declare.
- **A `.ts` test runs under node.** No `document`, no `window`, and Request, Response,
  FormData and File are the platform's own — which is what a route handler is actually
  handed, and why several route tests already wanted node before this split existed.
- **A `.ts` test that genuinely needs the DOM says so**, with a
  `// @vitest-environment jsdom` docblock on the very first line and a comment under it
  naming what needs it. That is the whole mechanism — it overrides the project's
  environment for that file alone. Reach for it when a helper under test is handed real
  elements or reads `document`, not as a way to avoid finding out why a test fails.
- **Do not add `// @vitest-environment node`** — it is what the file already gets. The
  directive survives only where a comment beside it names a concrete way jsdom would
  break that file, because a future reader moving it to jsdom needs to know.

Both projects load `tests/setup.ts`, so the router mock, the browser Supabase mock and
the inert `ResizeObserver` are there either way.

**Both projects run isolated, on forks, on one pool — each of those is load-bearing.**
Isolated because un-isolated measured no faster once there is no jsdom realm to rebuild
per file (that is what it saves; the imports are re-run either way), and it would let a
shared module keep whatever mocks were live when an earlier file first loaded it, so a
later file's own mock could quietly fail to apply. Forks because suites that pin a
timezone assign `process.env.TZ` at runtime, which a child process honours and a worker
thread ignores — the failure shows only on a UTC runner, and a developer's box already
in Helsinki never sees it, so a green local run under threads proves nothing. One pool
because Vitest sizes a pool per pool *type* and runs projects concurrently: two pool
types put two full-sized pools on the machine at once, which on a 4-vCPU runner doubled
the summed collect and test time and, with coverage on, timed out a component test that
passes on its own. A test that stubs env still hands it back (`vi.stubEnv` with
`vi.unstubAllEnvs()` in teardown, never a bare `process.env` assignment) — isolation
makes that hygiene rather than a load-bearing rule, and hygiene is cheaper to keep than
to restore.

## The rich-text editor stub

`mocks/rich-text-editor.tsx` stands in for the markdown editor, which is ProseMirror plus
a parser and a serialiser and is by a wide margin the heaviest thing a session-feed suite
loads. The surfaces that hold a note field pull it in through a dynamic import that a
test's module graph resolves whether or not the test ever opens one, so a suite rendering
a feed to check attendance marks or a send button pays for all of it to assert nothing
about it. Apply it with a factory naming the module:

```ts
vi.mock("@/components/ui/rich-text-editor", () => import("../../mocks/rich-text-editor"));
```

**It is only for a field the test treats as opaque.** The stub keeps the editor's props
as a field — accessible name, described-by, placeholder, seeded value, disabled state,
a change handler fed the field's text, and `role="textbox"` on the writing surface — and
keeps nothing of the markdown: no toolbar, no schema, no serialiser. A test that types
into a note and asserts on the markdown that comes out, or that exercises any editor
behaviour, keeps the real editor; against the stub it would be asserting on a textarea's
raw text. Tests of the editor itself never see it.

## The smoke check is a build gate first

`smoke/` is the only place we build the app and serve it. Playwright's config starts the
production server, so the check fails if the build breaks or the server refuses to boot —
and that gate is most of its value. The assertions on top of it are the ones that can
only be made against a real response: the static security headers, and the per-request
CSP nonce the proxy generates (which is absent in dev, so nothing else can verify it).

**It uses Playwright's request fixture only — never a browser.** That is deliberate, and
it is what keeps the job cheap: no engine matrix, no device emulation, no browser
binaries to install in CI, no retries, because HTTP header assertions are deterministic.
A spec here that needs a `page` does not belong here.

There was a browser-driven suite before, asserting on marketing copy and unauthenticated
redirects; it was deleted in August 2026 for churning on every copy edit while catching
nothing. `TODO.md` holds the plan for a real browser suite against a local Supabase stack
— that would be a new category, not an addition to this one.

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

### CI's database is not staging: it is the migrations *plus* the fixture layer

CI builds its database from `migrations/` and then loads `supabase/seed.sql` on top —
an arrangement that exists nowhere else. Staging carries the migrations' data without
the fixtures; CI carries both, side by side in the same tables. A DB test written and
hand-verified against staging can therefore fail its first CI run for reasons that are
not bugs, and one session lost four tests to exactly this class:

- **Whole-table claims must survive the fixture rows.** A sweep asserting "every row of
  this kind has property X" meets seed.sql's deliberately-minimal fixture rows, which
  often lack exactly the property real seeded data guarantees. Scope the claim to the
  rows it is actually about, or exclude the fixture ids by name (`TEST_IDS`) so
  anything *else* violating it still fails.
- **"Surely unused" values must be impossible, not merely unlikely.** A test that
  needs a free key or an absent record cannot guess one from the real world — the real
  seeded data is in CI too, and it is full of surprises (one guess at an unused Finnish
  postal code turned out to be Santa Claus's). Construct values that cannot exist by
  shape: negative numbers for an upstream key that is always positive, letters where
  the data is all digits.

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

### The proxy suite and the route-group drift guard

The proxy's tests live here (`integration/proxy.test.ts`), and so do the tests for the
external ⇄ internal path normalizer they depend on — it is the proxy's own security
plumbing, and splitting the two would put the bypass cases a directory away from the
decisions they are about.

**Requests are built prefixed by default.** Every page URL carries its locale, so the
suite's request helper applies a prefix itself and a bare-path helper sits beside it for
the redirect ladder's own cases — otherwise a hundred existing cases would each restate
a language they are not about.

The suite also carries the **route-group drift guard**: it walks the `(public)` route
group on disk and asserts every page it finds passes the proxy unauthenticated, because
the group means nothing to the proxy's hand-maintained public-route list and the two
drift silently. Two things it does with the locale segment, both load-bearing:

- **The `[locale]` segment is not walked** — it is the parent the walk starts under, and
  substituting a sample value there would test a locale that does not exist.
- **Each page is asserted twice**: reachable under one real, *non-English* prefix with
  the slug that locale actually serves (the filesystem yields internal segments, and
  asserting a prefixed-but-untranslated URL would green-light a path no user ever hits —
  under English the two forms coincide and the bug would pass), and **redirecting rather
  than serving on its bare path**, which is the ladder's contract.

## Unit test setup

`tests/setup.ts` (loaded by both projects) globally mocks `next/navigation`, the app's
own wrapped navigation module (`@/i18n/navigation`) and the browser Supabase client
(`@/lib/supabase/client`), exposing `mockSupabaseClient` for assertions. Components and
hooks under test get a working router and Supabase client without per-test wiring.

**The wrapped navigation mock is not optional decoration.** Components name routes
through that module now, and its hooks read a routing context that a rendered component
has no locale to supply — without the mock every test rendering a link fails. The stub's
`Link` renders a real anchor with the pathname's dynamic segments filled in from
`params`, so existing `getByRole("link")` and `href` assertions keep working, and it
emits **no locale prefix**: a test asserting on a route is asserting about the route, not
about which language the reader is in. `useParams` is exported for the same reason the
picker reads it — a locale switch on a dynamic route needs the concrete values.

**Two files deliberately unmock both navigation modules** — the page-metadata helper's
and the sitemap/robots tests. What they are *about* is the locale-prefixed, translated
URLs the real path builder produces, which the stub flattens; and `next/navigation` has
to come with it, because next-intl reads a redirect helper off it while constructing the
wrapped APIs and the setup's partial mock does not carry one. Unmocking is the right move
only for a test whose subject is the URL building itself.
