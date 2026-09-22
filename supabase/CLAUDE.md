# Database (Supabase / Postgres)

This directory holds everything that defines the database: `migrations/` (append-only
history), `schema/` (the current schema, one file per object), `seed.sql`, and
`config.toml`. The
generated TypeScript that mirrors the schema lives outside this dir at
`src/types/database.types.ts`, with convenience aliases in `src/types/index.ts` — they
move in lockstep with what's here.

## Agents do not write to staging or prod

**Rule: an agent never writes to staging or production on its own initiative. It reads
them to investigate; every write a piece of work needs goes to a seed file or to a local
database.** A shared mutable database makes one branch's write everybody's problem, and
the failures are silent ones: two branches claim the same migration version and the second
is skipped without a word; a version recorded on staging whose file lives on an unmerged
branch makes `db push` refuse for everyone; a migration applied there before the code that
needs it breaks staging for every other branch until that code deploys.

One thing authorizes a write, and nothing else: **a procedure skill in `.claude/skills/`,
run at the owner's explicit instruction** — creating an admin account, correcting an
email, putting test data on staging. The instruction is the authorization; the skill is
how the write is carried out safely.

## Current state lives in the generated files, not migrations

**Rule: To understand the current schema — or to copy any existing object's definition
into a new migration — read the committed generated files, not migrations.** Two of them
hold the live state, and between them they cover almost everything:

- **`src/types/database.types.ts` + `src/types/index.ts`** — table/column/function
  *shapes* (types, signatures, enums).
- **`supabase/schema/`** — the things the type generator can't see: function bodies, RLS
  policies, triggers, grants, constraints. One file per object:
  `tables/<table>.sql` (the table with its indexes, constraints, policies, triggers,
  grants and comments), `views/<view>.sql` (the view with its grants and comments),
  `functions/<function>.sql` (definition, grants, comment — an overload gets a suffixed
  file), `types/enums-and-types.sql`, and `misc/schema.sql` for the schema's own block
  and default privileges.

Both are written by `npm run db -- generate` from a database built out of *this
checkout's* `migrations/`, never reconstructed by hand, and both are committed by the
branch that changed them — so they describe the branch you are on, including its own
unmerged work. CI generates both the same way and fails when a committed file differs.

**A file per object is what turns two branches editing one object into a git conflict**,
raised when the later branch syncs with `dev` — including an edit racing a drop — rather
than a silent last-writer-wins. Wherever git conflicted in a generated file, or the
regenerated output differs from what git merged: never hand-edit it. Take the regenerated
output, then read both sides' changes to that object and confirm each survives in it.

**Why they are generated from `migrations/` and not dumped from a hosted database.**
**Staging is shared and mutable**: migrations land there from branches that have not
merged, so a dump taken at any moment is the union of everyone's in-flight work — a
schema which exists nowhere, and an agent reading it will write code against columns that
are not on `dev` or in production. Staging also carries known cosmetic drift, deliberately
left alone: a reformatted function body, comments stripped from a few others, two
`COMMENT ON` statements belonging to no migration, and a column dropped and re-added so
its ordinal moved. None of it behavioural, and the ordinal cannot be corrected without
rebuilding the table.

Generating from `migrations/` has one boundary of its own: the files cannot record
anything a migration did not do, so an object created outside one is absent rather than
wrong. What they deliberately do *not* answer is whether a hosted database matches — they
are a statement about `migrations/`, not about any live system, and there is no standing
check for that, on purpose. A migration that asserts its own end state catches a
divergence at the moment it runs, which is both earlier and more specific than a periodic
dump diff, and behavioural drift shows up as tests passing on staging and failing against
production. If a hosted database ever does drift, `pg_dump --schema public` against it and
compare the object you care about with its file under `supabase/schema/`; that is a
debugging step, not something worth running on a timer.

Migrations are append-only history — a later one can supersede
an earlier one (drop a constraint, rewrite a function, relax a rule), which is exactly
why eyeballing them for current state goes wrong. So when a migration must drop and
recreate an object — e.g. a function, to repoint it at a changed type — copy its body
from its file under `supabase/schema/functions/`, never from the migration that first
defined it; that copy may already be superseded.

**The same staleness trap applies to *conventions*, not just object bodies.** When you
need a template for how to author a new migration — grant boilerplate, `SECURITY
DEFINER` + `SET search_path` headers, header-comment style, ordering-key stamping — model
it on the **newest** migrations, never an arbitrary or early one. Conventions
have evolved and old migrations preserve the superseded version: explicit per-role
`GRANT`s replaced blanket/auto-expose grants, `clock_timestamp()` replaced `now()` for
cross-transaction ordering keys, and `SET search_path TO ''` is the current default. The
*rules* are written out in this file (grants, RLS, nullability, `now()` vs
`clock_timestamp()` below); the newest migrations are their freshest worked examples.
The baseline migration is a dump of a database, not authored SQL — it is the starting
state, never a model for a new migration. Pattern-matching on an old migration is how a dead convention
gets revived — when in doubt, the rule in this file wins over any example in
`migrations/`.

**Important:** `database.types.ts` is purely auto-generated — **never** hand-edit it,
even as a shortcut when a hosted database hasn't been updated yet: regenerate it with
`npm run db -- generate`. After regenerating, check whether new tables or enums need
aliases added to `src/types/index.ts`.

### Objects that live outside `public` (not in `supabase/schema/`)

A few objects live **outside** the `public` schema and are therefore **not** in
`supabase/schema/` — so you have to be aware they exist or you'll assume the directory is
the whole story when it isn't. These are: extensions the migrations create, triggers
attached to `auth.users` (e.g. the new-user → profile handler), RLS policies on
`storage.objects`, the tables in the `supabase_realtime` publication, and the rows that
define storage buckets and pg_cron jobs (those last aren't even DDL — they're rows in
`storage.buckets`/`cron.job` — so no dump captures them). This is a small, stable set
that rarely changes. For *only* these,
current state lives in migration history: grep **every** migration touching the object
and trust the **newest** one. Do not hardcode a migration version for them
anywhere — the correct file moves the moment one is superseded, which is the staleness
trap this rule exists to avoid.

## CLI version

**Rule: always invoke the CLI as `npx supabase` — never a bare/global `supabase`.** The
CLI is a pinned exact devDependency, and CI pins the same version
(`SUPABASE_CLI_VERSION` in the workflow); the two move together in one commit, and the
lint job checks they match.
The pin is load-bearing twice over: local-stack security semantics changed at v2.106.0
(no more auto-granted Data API privileges — the fail-closed regime the access-control
tests assume), and `gen types` / dump output formats drift across versions, so an
unpinned CLI turns every regeneration into spurious diffs. A globally installed
`supabase` on the machine may be any version; `npx` resolves the devDependency and makes
it irrelevant.

## Linking (first time only)

Linking is for the operator commands that address the hosted project by ref — `npx
supabase migration list --linked`, `migration repair` during the squash's history step,
and `supabase inspect` in the database-inspection skill. Nothing in the migration
workflow below needs it: `generate` builds in a shadow workdir, so a linked checkout's
`.temp/` pins never reach it.

```bash
npx supabase link --project-ref "$(grep '^SUPABASE_PROJECT_REF=' .env.local | cut -d= -f2-)"
# Enter the password from SUPABASE_DB_PASSWORD in .env.local when prompted.
```

`SUPABASE_DB_PASSWORD` and `SUPABASE_PROJECT_REF` are in `.env.local`, alongside the
Supabase/Stripe/Daily.co keys.

## Migration workflow

**Rule: a migration that adds or modifies functions or tables is committed together with
the regenerated types.** DB tests and type-check depend on `database.types.ts` matching
the schema, so a migration committed on its own leaves tests referencing functions the
generated types do not have.

The workflow is the same in a worktree as on `dev` directly. The steps (run via the Bash
tool):

1. Create the file with `npx supabase migration new <descriptive_name>`, which writes
   `migrations/<YYYYMMDDHHMMSS>_<descriptive_name>.sql`, and write the SQL into it. The
   timestamp is restamped when the branch lands, so nothing may key on it — the
   descriptive half is the stable name.
2. Regenerate:
   ```bash
   npm run db -- generate
   ```
   It builds a database from *this checkout's* `migrations/` inside the WSL distro,
   writes `src/types/database.types.ts` and `supabase/schema/` from it, and removes the
   database again. It needs Docker in the distro and takes about a minute; nothing else
   in the repo is touched.

   **`--schema public` is load-bearing, not decoration**, and the script passes it.
   Without a schema named, the CLI asks the database for every schema its Data API
   exposes and the generated file gains a block for each — `graphql_public` is the one
   that shows up. Naming the schema makes the output depend only on `migrations/`, which
   is what lets the comparison below mean anything. If the app ever genuinely needs a
   second schema, add it there explicitly rather than dropping the flag.
3. Check `src/types/index.ts` — add convenience aliases for any new tables/enums.
4. Commit the migration, both regenerated things and the tests together.

### CI compares the committed generated files against `migrations/`

CI's database job generates `database.types.ts` and `supabase/schema/` from `migrations/`
with the same command, fails the build when a committed file differs — printing the diff
— and uploads what it generated as the artifacts `database-types-from-migrations` and
`schema-from-migrations` on every run, pass or fail. **When local output and CI's
disagree, CI's is the authority**: it is built from the branch's migrations alone, with
nothing of this machine in the path.

**A red comparison is triaged in this order**, on a branch or on `dev`:

1. **Regenerate locally and compare again.** The committed file was stale or hand-edited,
   and the regenerated one is the fix.
2. **Where git merged or conflicted in a generated file, inspect before committing
   anything — never hand-edit it.** Take the regenerated output, then read both sides'
   changes to the object in question and confirm each survives in it — most often a
   schema file, where both sides rewrote one function body. When both survive,
   commit the regenerated file; when one is missing, write the migration that combines
   them, and regenerate. This holds on `dev` as much as on a branch: committing
   regenerated output unread accepts the last writer and turns the build green over a lost
   change.
3. **Where local output still differs from CI's for an object nobody changed**, the two
   generators have drifted — usually the CLI pin moved. Commit CI's artifact and fix the
   script.

**When the local database will not start**, push the branch and take CI's output instead:
the run's page on GitHub lists both under Artifacts, or
`gh run download <run-id> -n database-types-from-migrations` and `-n
schema-from-migrations` fetch them (`gh run list --branch <branch>` finds the run). The
first holds `database.types.ts` — copy it to `src/types/database.types.ts`; the second
holds the object tree — replace `supabase/schema/` with it.

### A branch carrying migrations lands synced

**Rule: before merging into `dev`, merge `origin/dev` into the branch, restamp the
branch's own migrations to now with `node scripts/restamp-migrations.mjs`, regenerate,
and require the output to equal the working tree — then merge `--no-ff`.** Landing is
serialised through one human, so the stamp taken at landing is the branch's queue
position and two branches can never claim one version. The regenerate is what proves the
merged migrations and the committed types agree; a difference in an object both sides
touched is the conflict case above. `/worktree-flow` Phase 5 has the commands.

A push to `dev` that adds a migration sorting below one `dev` already had fails the
`migration-order` job — the gate for work committed straight onto `dev`, which opens no
PR. Staging's `db push` should have refused the file, for the same reason prod's would,
so confirm that before touching it: `npx supabase migration list --linked` is a read. If
the version is not in staging's history, rename the file to a fresh timestamp in a
follow-up commit, which is the one case a landed migration file is renamed. If staging
did apply it, renaming would leave staging recording a version no file carries — a
reconciliation, run as a procedure skill at the owner's instruction.

### Landing on `dev` applies the migrations to staging

CI runs `db push` against the staging project on every push to `dev`, without waiting for
the test jobs, so staging's schema trails the code that landed with it by about a minute.
Nothing is run by hand.

**A failed push is fixed forward.** Each migration is its own transaction, so staging
keeps the ones that ran before the failure and `dev`'s run stays red until a new migration
corrects it — never by editing staging, which leaves its history disagreeing with the
files on `dev`.

### Never amend a landed migration

**Rule: once a migration has landed on `dev` it is never edited — every change ships as a
NEW migration, and the only thing a landed file ever suffers is the `migration-order`
rename above. A migration that has not landed is still yours: fix the file in
place rather than stacking a fix-up on it.** The CLI tracks applied migrations by version, so an edited
file that a database has already applied gets "Remote database is up to date" and its
new statements **never execute there** — only a fresh-from-`migrations/` build ever runs
them. That silently turns "I added an assertion" into "I added an assertion that has
never executed anywhere"; if the addition is assertion-only, a wrong assertion can even
pass CI vacuously. Accepted costs: fix-up migrations in history, and a replacement
function's assertion block must deliberately re-assert the invariants of the migration it
supersedes (re-derive them; a hand-copy dropped a clause once). psql remains the right
tool for *checking* staging state. A local stack that has already applied the file you
edited is the same trap on a smaller scale, and `npm run db -- reset` is its answer.

## A schema-changing worktree runs its own stack

**A migration that has to be looked at in the UI gets a local Supabase stack; a migration
with nothing to look at needs only `generate`.** `npm run db` with no argument prints what
every command does — the things its usage text does not say:

- **`up` rewrites exactly three `.env.local` values** — the project URL, the anon key and
  the service-role key — keeping the originals aside for `down` to put back. Everything
  else in the file stays as it was, `SUPABASE_PROJECT_REF` and `SUPABASE_DB_PASSWORD`
  included, so the `--linked` CLI commands, psql and the procedure skills in that worktree
  go on meaning staging. The stack is what the *app* reads and nothing more. Restart the
  dev server after `up`, or it keeps the old values.
- **Lifecycle:** a stack is parked whenever its dev server is not running (`park` frees
  the memory and keeps the data), and it goes `down` when the feature lands or its
  worktree is torn down — `/worktree-flow` Phase 5's teardown script runs `down` for you.
  If `down` never ran and the worktree is gone, the main checkout's `.env.local` is where
  the three original values are recovered from.
- **Memory:** about 660 MB settled, in a distro capped at 12 GB and shared with everything
  else running on this machine. Two stacks are comfortable, three tight; `list` shows them
  all with their memory.
- **The accounts are the two seeds'**: `seed.sql`'s fixtures — including the admin the
  rich seed reuses — and the families and educators `supabase/rich-seed.sql` adds, all on
  the one test password its header names. The trimmed service set has no mail catcher, so
  nothing emailed can be read on a stack; the seeded accounts are the way in.
- **The DB tests never run against a stack** — `tests/CLAUDE.md`, "DB tests run in CI, not
  locally".

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
  `supabase/schema/functions/`; the call site's declared return type checks the schema's
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
CLI v2.106.0, and hosted DBs since a migration revoked the legacy auto-expose default
privileges (ahead of Supabase's 2026-10-30 platform flip) after an earlier one backfilled
explicit grants for everything older. That revoke stands at the top of the baseline
schema migration, ahead of every object it creates: a fresh database is born with the
legacy defaults, and a schema dump can only add a grant, never take one back. Grant
deliberately per role —
`GRANT EXECUTE ... TO authenticated` for browser-called RPCs, `TO service_role` for
admin-client-called ones — and classify any function exposed to `authenticated`/`anon`
in the DB test suite's authorization spine (see below). A forgotten grant fails closed as
`permission denied` in CI's DB tests; never "fix" that with blanket `ON ALL TABLES`
grants or by re-adding auto-expose `ALTER DEFAULT PRIVILEGES` — the failure is the
feature. The `REVOKE EXECUTE ... FROM PUBLIC` boilerplate is **not** historical — it is
load-bearing: a created (or drop/recreated) function comes back `PUBLIC`-executable
(observed on staging when a drop/recreate cycle briefly left service-role-only paid-seat
writers callable by `anon` until re-revoked), so a migration
that creates or recreates a function must pair its per-role `GRANT`s with an explicit
`REVOKE EXECUTE ... FROM PUBLIC`.
Extra care with `SECURITY DEFINER` functions: they bypass RLS, so granting one broadly
is a privilege escalation vector.

**Rule: All new tables must enable RLS.** Add
`ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and appropriate policies.

**Rule: All new views must be declared `WITH (security_invoker = true)`, and a view
readable by `authenticated`/`anon` must additionally be classified in the DB test
suite's authorization spine.** A view has no RLS of its own; the flag is what makes the
*caller's* policies on the underlying tables decide its rows. Without it the view runs
with its owner's rights — and the owner holds `BYPASSRLS` — so it returns every row to
every caller, which is a data leak that looks from the application exactly like a
feature that works. Two checks enforce this and both fail the build: the access-control
test sweeps every public view for the flag (the direct analogue of its every-table-has-RLS
sweep), and the spine requires each exposed view to name a scope test proving two
different callers each get only what their own policies allow. Self-scoping is the only
classification a view can hold — there is no body to gate, so "role-gated" does not
apply. Write the flag in exactly that spelling: the check reads `reloptions` as stored
text, so `security_invoker = on` is reported as an offender. Exposure is measured per
*column*, so a view reachable only through a `GRANT SELECT(col)` still has to be
classified — that is a grant PostgREST answers reads against, and measuring at table
level would let one through unnamed.

**Rule: materialized views are banned outright in `public`.** This is not the
`security_invoker` rule applied to a second object class — it is a ban, because a matview
has no safe form. The option is not valid on one (there is no query left to re-run as the
caller), it cannot carry RLS, and its contents were computed under the role that
refreshed it — which holds `BYPASSRLS`, so what is stored is already every row of
everything it selected from, with no predicate left anywhere to narrow it. Granting one
to `authenticated` therefore publishes the underlying tables wholesale through the Data
API, and nothing the application does can walk that back. CI enforces it: the
access-control test fails on any relation of kind `materialized view` in `public`, and so
does the migration that widened the catalog helper to see them. If a rollup is genuinely
too expensive to compute per read, the answer is an ordinary table maintained by triggers
— RLS-capable, indexable, and cheap to reason about — not a matview with a grant on it.

**Rule: RLS INSERT/UPDATE policies must authorize both the actor AND the target.**
Checking only `column = auth.uid()` is insufficient — also verify the user is authorized
to reference the target entity (prevents IDOR).

**Rule: an exposed function's *body* is verified, not just its grant.** The DB test
suite's **authorization spine** (`docs/architecture/db-authorization.md` §3.4) queries the
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

**Views are held to the same requirement in their own registry**, with the difference
that self-scoping is the only classification available to one — see the views rule above
for what to write and which two checks enforce it.

Alongside it: no exposed function may be `STRICT` (a `STRICT` function skips its body on
NULL input, so its guard would never run); no privilege-bearing column may be reachable by
an `UPDATE` grant, at table or column level; and every table `authenticated` can UPDATE or
DELETE needs a write-IDOR case proving a wrong user's statement affects zero rows. RLS
coverage (every table has it), the `security_invoker` sweep over every view, and the
table-level write-grant allowlist live in the access-control test. (DB tests run against a real Postgres in CI — see `tests/CLAUDE.md`.)

## Logic lives in database functions on purpose

**The browser reads the database directly.** A service's read methods run in the browser,
against the Data API, with the signed-in user's token; only a write that needs a server
secret goes through an API route. No trusted server stands between an untrusted client and
the data, so the database is the only place a read can be authorized. That is the standard
Supabase shape, and everything in this section follows from it. It is why there are many
functions, and it is not drift to be corrected.

**Rule: what the caller's grants and RLS already admit is a plain query in the service
layer, never a function.** A function that only re-selects rows a policy would have
returned anyway adds a migration to every change and protects nothing.

**Rule: a `SECURITY DEFINER` function exists to cross an access boundary and hand back
less than the tables behind it, and its comment names which boundary.** There are three:

- **Rows the caller has no policy for, narrowed to the caller's own scope**: a gedu
  reading the families on their own roster, a family reading a first name out of a staff
  profile, anyone reading the staff tables that carry no `authenticated` grant at all.
- **An aggregate over rows the caller must never see**: a waitlist position, a seat
  count. No policy can express these; the answer is a count of other people's rows.
- **A write to a grant-locked table, or one that has to lock or be atomic across
  tables**: the write models in `docs/architecture/db-authorization.md`.

**A function is a data-minimisation device, so never widen RLS to retire one.** A policy
that admits the same rows publishes the raw table, every column of it, to that role's
browser through the Data API. That is a wider exposure than the function ever was, and
most of these tables hold children's data.

**Rule: a read function returns the whole of what its caller may see in that scope, as
stable entity-shaped data, and the page shaping happens in TypeScript.** "The whole" means
every field of the already-narrowed entities, not only the fields today's page renders;
the boundary the function enforces does not move. A function that returns exactly one
page's JSON turns each new UI field into a migration, and replacing a function body is the
one schema change two branches cannot merge: the last writer silently wins. This applies
when a function is next touched. It is not a sweep.

**Moving this logic into TypeScript over a direct Postgres connection does not fit, and
the measurements are in `docs/records/logic-in-database-evaluation-2026-09.md`.** A
connection running as the signed-in user can take over only the reads RLS already admits,
which was 5 of the 21 the app calls; every other read would need either wider RLS (above)
or a privileged server connection, a second authorization regime in TypeScript beside the
spine, and each browser read re-routed through a server route. Reopen it only on a new
fact, such as reads no longer being browser-direct, not on the observation that there are
a lot of functions.

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
`now()` stays correct for deadlines and defaults (`signed_up_at`) where cross-row
ordering doesn't matter.
