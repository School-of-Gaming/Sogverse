# Database (Supabase / Postgres)

This directory holds everything that defines the database: `migrations/` (append-only
history), `schema.sql` and `seed.sql` (current-state snapshots), and `config.toml`. The
generated TypeScript that mirrors the schema lives outside this dir at
`src/types/database.types.ts`, with convenience aliases in `src/types/index.ts` — they
move in lockstep with what's here.

## Current state lives in snapshot files, not migrations

**Rule: To understand the current schema — or to copy any existing object's definition
into a new migration — read the committed current-state files, not migrations.** Two
files hold the live state, and between them they cover almost everything:

- **`src/types/database.types.ts` + `src/types/index.ts`** — table/column/function
  *shapes* (types, signatures, enums). Auto-generated from the live schema.
- **`supabase/schema.sql`** — the things the type generator can't see: function bodies,
  RLS policies, triggers, grants, constraints. Dumped from a database built **purely from
  `migrations/`** (see step 4 of the migration workflow).

Both are regenerated on every migration and reflect current state, so you never
reconstruct it by hand.

**Why the snapshot is built from migrations and not dumped from a hosted database.** It
used to be dumped from the linked project, and on 2026-07-29 that was shown to be
unsound: the hosted database had been edited outside migrations more than once — a
function body reformatted, function-body comments stripped from two functions, two
`COMMENT ON` statements present that appear in no migration, a column dropped and
re-added so its ordinal moved. All of it flowed straight into the committed file, where
it then read as authoritative. Diffing the two hosted databases is what surfaced it;
tracing each case against migration source is what settled which one was wrong.

Generating the snapshot from migrations removes the whole class: the file cannot record
anything a migration did not do, and a hand-edit to a hosted database no longer has a
path into it. CI regenerates it on every run and fails when the committed copy disagrees,
so drift is caught the moment it is introduced rather than a release cycle later.

What that deliberately does *not* answer is whether a hosted database has drifted from
migrations — the snapshot is now a statement about `migrations/`, not about any live
system. **The Production Schema Drift workflow answers that half**, daily and on manual
dispatch: it dumps production and diffs it against the committed snapshot, which is sound
precisely because CI has already proven the snapshot equals what migrations produce. It
pins the same PostgreSQL 17 client the snapshot is built with, so a difference means
schema rather than tooling. Between the two, both directions are covered — the file can't
drift from the migrations, and production can't drift from the file unnoticed.

**Staging is deliberately not covered**, and carries known cosmetic drift: a reformatted
function body, comments stripped from a few others, two `COMMENT ON` statements belonging
to no migration, and a column that was dropped and re-added so its ordinal moved. None of
it behavioural. The ordinal in particular cannot be corrected without rebuilding the
table, so including staging would mean a permanently failing check reporting something
nobody intends to fix — and the reason to care is gone anyway, since staging can no longer
reach anything committed. If staging ever drifts in a way that changes *behaviour*, that
shows up as tests passing there and failing against production, which is a louder signal
than a dump diff. Migrations are append-only history — a later one can supersede
an earlier one (drop a constraint, rewrite a function, relax a rule), which is exactly
why eyeballing them for current state goes wrong. So when a migration must drop and
recreate an object — e.g. a function, to repoint it at a changed type — copy its body
from `schema.sql`, never from the migration that first defined it; that copy may already
be superseded.

**The same staleness trap applies to *conventions*, not just object bodies.** When you
need a template for how to author a new migration — grant boilerplate, `SECURITY
DEFINER` + `SET search_path` headers, header-comment style, ordering-key stamping — model
it on the **highest-numbered** migrations, never an arbitrary or early one. Conventions
have evolved and old migrations preserve the superseded version: explicit per-role
`GRANT`s replaced blanket/auto-expose grants (`00095`/`00099`), `clock_timestamp()`
replaced `now()` for cross-transaction ordering keys (`00117`), and `SET search_path TO
''` is the current default. The *rules* are written out in this file (grants, RLS,
nullability, `now()` vs `clock_timestamp()` below); the newest migrations are their
freshest worked examples. Pattern-matching on an old migration is how a dead convention
gets revived — when in doubt, the rule in this file wins over any example in
`migrations/`.

**Important:** `database.types.ts` is purely auto-generated — **never** hand-edit it,
even as a shortcut when the remote DB hasn't been updated yet. Always push the migration
first, then regenerate. After regenerating, check whether new tables or enums need
aliases added to `src/types/index.ts`.

### Objects that live outside `public` (not in `schema.sql`)

A few objects live **outside** the `public` schema and are therefore **not** in
`schema.sql` — so you have to be aware they exist or you'll assume `schema.sql` is the
whole story when it isn't. These are: triggers attached to `auth.users` (e.g. the
new-user → profile handler), RLS policies on `storage.objects`, and pg_cron jobs (the
last two aren't even DDL — they're rows in `storage.buckets`/`cron.job` — so no dump
captures them). This is a small, stable set that rarely changes. For *only* these,
current state lives in migration history: grep **every** migration touching the object
and trust the **highest-numbered** one. Do not hardcode a migration number for them
anywhere — the correct file moves the moment one is superseded, which is the staleness
trap this rule exists to avoid.

## CLI version

**Rule: always invoke the CLI as `npx supabase` — never a bare/global `supabase`.** The
CLI is a pinned exact devDependency, and CI pins the same version
(`SUPABASE_CLI_VERSION` in the workflow); the two move together in one commit, always.
The pin is load-bearing twice over: local-stack security semantics changed at v2.106.0
(no more auto-granted Data API privileges — the fail-closed regime the access-control
tests assume), and `gen types` / dump output formats drift across versions, so an
unpinned CLI turns every regeneration into spurious diffs. A globally installed
`supabase` on the machine may be any version; `npx` resolves the devDependency and makes
it irrelevant.

## Linking (first time only)

```bash
npx supabase link --project-ref "$(grep '^SUPABASE_PROJECT_REF=' .env.local | cut -d= -f2-)"
# Enter the password from SUPABASE_DB_PASSWORD in .env.local when prompted.
```

`SUPABASE_DB_PASSWORD` and `SUPABASE_PROJECT_REF` (used by the commands below) are in
`.env.local`, alongside the Supabase/Stripe/Daily.co keys.

## Migration workflow

**Rule: When a migration adds or modifies functions/tables, push it to remote and
regenerate types before committing.** DB tests and type-check depend on
`database.types.ts` matching the schema. This avoids a chicken-and-egg problem where
tests reference functions that aren't in the generated types yet. The full workflow for
a migration PR (run via the Bash tool):

1. Write the migration SQL file in `migrations/`.
2. Push to remote:
   ```bash
   npx supabase db push -p "$(grep '^SUPABASE_DB_PASSWORD=' .env.local | cut -d= -f2-)"
   ```
3. Regenerate types:
   ```bash
   npx supabase gen types typescript --project-id "$(grep '^SUPABASE_PROJECT_REF=' .env.local | cut -d= -f2-)" --schema public 2>/dev/null > src/types/database.types.ts
   ```
   `2>/dev/null` swallows the CLI's "new version available" notice so it doesn't end up
   in the output file. `cut -d= -f2-` (note the trailing `-`) keeps any `=` characters
   inside the value itself.

   **`--schema public` is load-bearing, not decoration.** Omitted, the flag has no default:
   the CLI asks the Management API for types without naming a schema, and the server
   answers with every schema the project's Data API currently exposes — a *dashboard
   setting*, not anything in this repo. So the generated file starts depending on a toggle
   nobody can see in a diff, and a regeneration arrives carrying an unrelated schema block
   (`graphql_public` is the one that showed up). Naming the schema makes regeneration
   depend only on the migrations, which is what lets "push, then regenerate, then diff"
   mean anything. If the app ever genuinely needs a second schema, add it here explicitly
   rather than dropping the flag.

   This surfaced the day the CLI was pinned as a devDependency: before the pin, a bare
   `supabase` resolved to whatever was installed globally (2.78.1 here), which defaulted
   the omitted flag to `public`; `npx` then resolved the pin (2.106.0), which does not.
   Every committed regeneration before that point was made by the older binary — the
   reason the block had never appeared despite the command never carrying the flag.

   **There is deliberately no npm script for this.** One existed and was wrong in three
   ways at once — bare `supabase` instead of `npx`, no `--schema`, and `--local` against a
   stack this project does not run — so it silently produced a different file than the
   documented command. A second call site for a command whose correctness depends on this
   many details is a liability; run the command above.
4. Refresh `supabase/schema.sql` — **CI generates this; you do not dump it.** Push the
   branch, let the Database Tests job run, then download its `schema-from-migrations`
   artifact and commit it as `supabase/schema.sql`. The job regenerates the snapshot from
   the stack it builds out of `migrations/` and fails when the committed copy disagrees,
   naming the artifact in the error.

   The reason it is not a local command is above: dumping from a hosted database lets that
   database's hand-edits into the file. Building from migrations makes that impossible, and
   the local stack this would otherwise need does not run on every machine (no Docker
   here — see `tests/CLAUDE.md`), so CI is the one place it can be produced consistently.
   The cost is a round trip: the first push after a migration fails this check by design,
   and the second carries the regenerated file.
5. Check `src/types/index.ts` — add convenience aliases for any new tables/enums.
6. Commit migration + updated types + `schema.sql` + tests together in the PR.

## Generated nullability can lie

**Rule: Verify generated nullability matches what the SQL actually guarantees.**
PostgreSQL has two ways to make a "nullable" column non-null in practice that the type
generator can't see: RPC `RETURNS TABLE` columns produced by an INNER JOIN (the
generator infers from the base column type alone, missing that the JOIN forbids null),
and CHECK constraints that encode conditional invariants like "column X is NOT NULL
whenever predicate P holds." Both are real, enforced guarantees, and both leave the
generated type nullable everywhere. After pushing and regenerating, check the affected
types in `database.types.ts` — the compiler trusts the column/function signature, not
the query or the constraint.

**Fix pattern — pick by where the truth lives** (lint forbids the cast; these are what
you reach for instead):

- **`.rpc()` returns (wrong nullability or `Json`):** parse the result through a zod
  schema in the feature's `*.contracts.ts`, written from the function body in
  `supabase/schema.sql`; the call site's declared return type checks the schema's
  output, and the db tests parse real RPC output through the same schema in CI. If the
  JOIN is ever relaxed, the parse fails loudly — unlike the old `Omit`+intersection alias
  casts this replaced, which went silently stale.
- **CHECK-tightened columns:** a type-guard helper (`(row): row is Tightened` whose body
  really checks the predicate) adjacent to the row alias in `src/types/index.ts`, doc
  comment naming the source constraint. Type predicates are trusted, not verified — keep
  the body a literal transcription of the CHECK.
- **Embedded `.from().select()` joins:** PostgREST joins are type-inferable — define the
  query in a standalone builder and derive the row type via
  `QueryData<ReturnType<typeof builder>>[number]` (import `QueryData` from
  `@supabase/supabase-js`). `!inner` makes a NOT-NULL-FK embed non-nullable. A
  hand-written row shape + cast throws away protection the generator already gives you.
  (Where a *test* must admit a value the generated type forbids — e.g. RLS nulling an
  embed — widen with a plain type annotation derived from `QueryData`, never a cast.)

## Access control: every object is GRANTed and RLS-protected

**Rule: Migrations must explicitly `GRANT` every object they create — new tables, views,
sequences, and functions have no Data API access by default, not even for
`service_role`.** This holds identically in every environment: fresh local stacks since
CLI v2.106.0, and hosted DBs since `00099` proactively revoked the legacy auto-expose
default privileges (ahead of Supabase's 2026-10-30 platform flip); `00095` backfilled
explicit grants for everything older. Grant deliberately per role —
`GRANT EXECUTE ... TO authenticated` for browser-called RPCs, `TO service_role` for
admin-client-called ones — and classify any function exposed to `authenticated`/`anon`
in the DB test suite's authorization spine (see below). A forgotten grant fails closed as
`permission denied` in CI's DB tests; never "fix" that with blanket `ON ALL TABLES`
grants or by re-adding auto-expose `ALTER DEFAULT PRIVILEGES` — the failure is the
feature. The `REVOKE EXECUTE` boilerplate in older migrations is historical and harmless.
Extra care with `SECURITY DEFINER` functions: they bypass RLS, so granting one broadly
is a privilege escalation vector.

**Rule: All new tables must enable RLS.** Add
`ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and appropriate policies.

**Rule: RLS INSERT/UPDATE policies must authorize both the actor AND the target.**
Checking only `column = auth.uid()` is insufficient — also verify the user is authorized
to reference the target entity (prevents IDOR).

**Rule: an exposed function's *body* is verified, not just its grant.** The DB test
suite's **authorization spine** (`docs/db-authorization-architecture.md` §3.4) queries the
PostgreSQL catalogs and requires every function reachable by `authenticated` to be one of
two things, with nothing escaping both:

- **Role-gated** — a `plpgsql` body whose *first statement* is a guard primitive
  (`PERFORM public.assert_admin();` / `assert_role(…)` / `assert_self(…)`, all raising
  ERRCODE `42501`), annotated with the roles it permits. The spine then signs in as every
  other role, calls it with all-NULL arguments, and requires the forbidden error — and
  signs in as a permitted role and requires anything *but* it, so a permissive annotation
  cannot pass vacuously.
- **Self-scoping** — every read and write keyed to `auth.uid()`, no guard by design,
  named to a scope test that proves it cannot answer about anyone else. `LANGUAGE sql`
  functions have no first statement, so they can only ever be this.

Alongside it: no exposed function may be `STRICT` (a `STRICT` function skips its body on
NULL input, so its guard would never run); no privilege-bearing column may be reachable by
an `UPDATE` grant, at table or column level; and every table `authenticated` can UPDATE or
DELETE needs a write-IDOR case proving a wrong user's statement affects zero rows. RLS
coverage (every table has it) and the table-level write-grant allowlist live in the
access-control test. (DB tests run against a real Postgres in CI — see `tests/CLAUDE.md`.)

## `now()` is frozen at transaction start

**Rule: When a timestamp is an ordering/sequence key compared across concurrent
transactions, stamp it with `clock_timestamp()`, not `now()`.** `now()` is
`transaction_timestamp()` — fixed at transaction start and identical for every statement
in that transaction. Transactions serialized on a row lock (e.g. the participation
product-gate lock) still have independent start times, so `now()` stamps can tie or
invert relative to lock-acquisition order: two concurrent `join_waitlist` calls each
derived waitlist rank 1 this way. `clock_timestamp()` reads the wall clock at the
statement — run under the lock it executes after the prior transaction committed, so
stamps follow real serialization order (keep an `id` tiebreaker for sub-tick ties).
`now()` stays correct for deadlines and defaults (`reserved_until`, `signed_up_at`) where
cross-row ordering doesn't matter.
