# Migrations without a shared staging database

Agents stop writing to staging. A local database generates the database files, which now
include the current schema as one file per object; staging receives `dev` from CI;
migration versions are timestamps assigned at landing; a feature that changes the schema
gets its own local Supabase stack, free and managed by the agent; and the long numbered
history is squashed into a baseline.

**Precondition (owner's commitment, 2026-09-18):** `feat/gedu-substitution`, the last
branch carrying numbered migrations already applied to staging, has merged into `dev`
before this work starts. Verify that first; if it has not, stop and ask.

## Problem

Work here is one human plus many Claude agents in parallel worktrees, and every worktree
pushes its migrations to one shared staging database in order to regenerate the types.
That single shared, mutable database, and a migration history nobody can read, cause a
family of failures:

- Two branches claim the same next 5-digit number; the second push finds the version in
  staging's history and its SQL is silently skipped.
- A version on staging whose file lives on someone else's unmerged branch makes `db push`
  refuse, and the documented escape is `psql -f` plus `migration repair`: an agent
  hand-editing shared history.
- A migration lands on staging before its code and breaks staging for everyone.
- **Nothing orders migrations across branches.** On 2026-09-18 a branch merged into `dev`
  with versions *below* ones already released to prod. Prod's plain `db push` refuses
  those, so the next release would have failed at its migration step.
- **Nothing detects two branches changing one object.** In the same incident two
  migrations each replaced one function from the body that predated the other. The later
  one won and silently dropped the earlier one's field; both files were valid and each
  branch's tests passed alone.
- **An agent cannot learn the current schema from the history**, because the history
  contradicts itself: half of all migrations redefine a function some later one
  redefines again. `supabase/schema.sql` exists to answer that, but CI generates it only
  on `dev`, so it lags and is stale for exactly the objects your own branch touched.

## Scale

Every schema-changing piece of work is affected: over 250 migrations, several a week,
usually more than one branch in flight; 134 functions, and roughly half of all migrations
redefine one. The ordering failure reached `dev` once and was caught by hand a release
early; the lost change reached staging and broke the admin dashboard. A whole section of
`supabase/CLAUDE.md` exists only to coach agents through staging collisions, and CI has
made over sixty bot commits to keep `schema.sql` current.

## The decision

1. **Agents never write to staging or prod on their own initiative.** They read them to
   investigate; every write a piece of work needs goes to a seed file or a local
   database. A procedure skill run at the owner's explicit instruction (creating an admin
   account, correcting an email, putting test data on staging) is the exception and
   stays as it is. This is a written rule, not a mechanism: `.env.local` stays a plain
   copy with its current keys.
2. **A local database generates the database files.** One script command starts a bare
   database (the Postgres container alone) from the worktree's migrations, generates
   `database.types.ts` and the schema directory (decision 4), and removes the database
   again: under a minute, no push, no network. The agent commits the files in its own
   feature commit. The script builds the database the way CI does (same pinned CLI, the
   CLI's default service versions, `pg_dump` run inside the database container), so the
   two produce the same bytes.
3. **The full CI compares, and its output is the authority.** Its database job already
   builds from `migrations/`; it generates the same files from that build, fails on every
   branch when they differ from what is committed, and uploads what it generated as an
   artifact whether it passed or not. Local generation is the fast path, not a second
   source of truth: when the two disagree, or on a day the local database will not start,
   the agent takes CI's files, so schema work never waits on the owner's machine being
   healthy. **A red comparison is triaged in this order:** regenerate locally and compare
   again (the committed files were stale or hand-edited); where git merged or conflicted
   in a generated file, apply decision 5's inspection; where local output still differs
   from CI's for an object nobody changed, the generators have drifted (usually the CLI
   pin moved): commit CI's artifact and fix the script.
4. **Current schema is a generated directory, `supabase/schema/`, one file per object,
   replacing `schema.sql`.** A file per table holds the table with its indexes,
   constraints, policies, triggers, grants and comments; a file per function holds its
   definition, grants and comment; enums and other types share one; what belongs to no
   object (the schema's own block, default privileges) shares another. It is never
   hand-edited and is committed by the branch that changed it, exactly like the types.
   For `public`, migrations become write-only: written and applied, never read to learn
   state. It is raw `pg_dump` of `public`, cut on the object headers the dump already
   carries. The few things of ours a `public` dump does not carry (the extensions the
   migrations create, our triggers on `auth.users`, our policies on `storage.objects`,
   the rows that define storage buckets and cron jobs, and which tables belong to the
   realtime publication) are not in it: that set is small and rarely changes, and it is
   still learned from the migration that last touched it.
5. **The comparison plus git is the conflict detector.** Two branches changing one object
   change one file, so git raises a conflict when the later branch syncs with `dev`
   (including an edit racing a drop). A merge git resolves cleanly but the migrations do
   not reproduce (both hunks kept in the file, the last writer's body in the database)
   fails the comparison. **The rule, wherever git conflicted in a generated file or the
   regenerated output differs from what git merged: never hand-edit; take the
   regenerated output, then read both sides' changes to that object and confirm each
   survives in it.** When both survive (two branches each added a column or a policy to
   one table, and only the order differs) commit the regenerated file. When one is
   missing, write the migration that combines them, and regenerate. The same inspection
   applies to a red comparison on `dev`: committing the regenerated output unread would
   accept the last writer and turn the build green over a lost change.
6. **CI pushes `dev` to staging**, as it already pushes `main` to prod, but deliberately
   unlike that job it does not wait for the test jobs, so staging's schema trails its
   code by about a minute rather than by a whole CI run. Runs are serialized.
7. **Migration versions are timestamps (`YYYYMMDDHHMMSS`, what `supabase migration new`
   produces), assigned at landing.** Landing is already serialized through one human, so
   it is the queue.
8. **A branch carrying migrations lands synced.** Merge `origin/dev` into the branch,
   restamp the branch's own migrations to now (relative order kept), regenerate (or,
   with no local database that day, push the synced branch and take CI's artifact), and
   require the output to equal the working tree. A difference in a file both sides
   touched is decision 5's conflict. Then merge `--no-ff` as today. Waiting for the
   branch's full CI is advisory, as it is today. Branches without migrations land exactly
   as today.
9. **An unlanded migration is mutable; a landed one is not.** No shared database has
   applied an unlanded file, so an agent edits it instead of stacking fix-ups.
10. **A feature that changes the schema gets its own local Supabase stack, and the agent
    manages it.** It costs nothing to run, so it has the lifecycle the worktree's dev
    server already has: no owner switch, no asking first, and an agent may start one to
    verify its own work in a browser. A feature without migrations keeps pointing its
    dev server at staging, exactly as today.
    - *Up:* build the stack from the worktree's migrations, load `seed.sql` and the rich
      seed, and point the worktree's dev server at it. Only the services the app uses
      run: the database, auth, the REST layer and its gateway, realtime, storage.
    - *A later schema change* goes to the running stack: a new migration is applied on
      top; an edited one is an in-place reset of the database (about a minute).
    - *Parked:* stopping a stack keeps its data and frees its memory; it resumes in about
      half a minute without replaying migrations. A stack is parked whenever its dev
      server is not running, so several features can wait for review at no cost.
    - *Down:* landing the feature, or tearing its worktree down, removes the stack and
      its data.
    - Stacks are independent: each has its own name and ports, several run at once, and
      resetting one leaves the others untouched.
11. **Two seeds.** `supabase/seed.sql` stays the deliberately minimal fixture set the DB
    tests are written against, and the only seed the CLI loads (`config.toml` has no seed
    section; `seed.sql` is the default, and stays the default). A second,
    rich example seed builds a realistic catalogue for previews through the admin RPCs;
    only the local stack script applies it. It exists to help a human review UI, so
    CI never touches it.
12. **The numbered history is squashed into a baseline**, once, right after a release,
    covering exactly the migrations prod has applied. On prod and staging only the
    migration history table is edited; no SQL of the baseline runs on either.

## Rejected alternatives

- **Keep sequential numbers and enforce "merge above the target's highest".** Same-number
  collisions return the moment staging stops being the registry that hands numbers out.
- **`--include-all` on staging and prod**, so order stops mattering. Prod could then apply
  a different order than CI tested; a conflicting pair would leave prod with a different
  last writer than the snapshot records, silently, in the one environment verified to
  match migration source.
- **A conflict detector that matches object names across branches.** A heuristic (misses
  dynamic SQL and `DO` blocks) where decision 5 is exact and needs no code of its own.
- **Authored declarative schemas with generated migrations.** Supabase's diff tool has
  gaps that sit on this repo's grant and revoke regime, and agents write deltas well.
  What was missing was a trustworthy view of state, which the generated directory gives
  without inverting who authors what.
- **Hosted preview branches of the staging project as the per-feature database**,
  switched on and off by the owner. Measured and workable (about ten seconds to create,
  half a minute to fill, $0.01344 per started hour), but it bills, nothing pauses or
  deletes an idle one, an agent could not be allowed to start one unasked, and it made
  the owner the keeper of a running resource. Owner's ruling: the development loop stays
  free, with nothing to switch. Every lifetime scheme built to contain the bill (a
  nightly delete job, a database per command, an hourly lease, relying on an idle
  auto-pause Supabase no longer has) went with it, as did branching off the prod project
  and `--with-data`.
- **A manual GitHub Action as the generator.** One generator makes byte equality free,
  but every generation costs a push, a wait and an artifact download; the workflow file
  has to reach `main` before it can be dispatched at all; and a branch's first push is
  red by design. The escape hatch it offered (files from somewhere other than the
  owner's machine) is what the full CI's uploaded artifact gives, with no second
  workflow.
- **A second generator for our objects outside `public`**, committed beside the schema
  directory and defined as "what the migrations added" to the auth, storage, extension
  and cron catalogs. The Problem never asked for it; the set is small and stable; and
  finding what the migrations added needs a bare reference database, which CI does not
  build, so it is the one place where two generators agreeing byte for byte is
  unsolved. The squash, the only step where losing one of those objects is a live risk,
  compares them once, locally (step 8). Listed in Follow-ups.
- **A version check in place of the script installing the CLI**, with the install
  recorded in the owner's machine-config repo. The version that must be installed is
  this repo's pin, so the thing that reads the pin does the install; the stack is
  agent-managed end to end, and a printed command is one more thing to run by hand.
- **A hosted database to regenerate the files.** Costs a billed hour per use for
  something a local container does for free.
- **Letting the full CI generate and bot-commit the files.** Slower, and it puts machine
  commits in the history.
- **Docker Desktop instead of Docker Engine inside the WSL distro.** Its install, its
  licence acceptance, its updates and its repairs all go through a GUI or a UAC prompt,
  and its licence depends on company size. The stack is managed entirely by agents, so
  everything has to be a command: the engine in the distro is installed, configured and
  repaired from a shell, and one script hides the distro from every caller.
- **A local database that borrows staging's hosted auth, storage and REST services.**
  They are not separable: the REST layer is generated from the schema the migration
  changes, auth keeps its users in the same database the app's rows reference, storage
  keeps its object records and our policies there, and realtime reads that database's
  change stream. A feature's database comes with its own set or does not work.
- **Listing the rich seed in `config.toml`'s seed paths.** That governs every stack the
  CLI starts, so it would load the rich seed into CI's database *before* the DB tests,
  whose whole-table claims are written against the minimal fixtures.
- **A CI step applying the rich seed to prove it still runs.** Owner's ruling: the rich
  seed is rich to help humans review UI, and is not something CI needs.
- **A comparison that only warns on feature branches**, failing hard on `dev` and `main`
  alone. One behaviour everywhere is simpler and catches a stale file before it lands.
- **Requiring the branch's full CI green before every migration-bearing landing.** The
  sync-and-regenerate check of decision 8 catches a conflicting merge in about a
  minute; the full CI stays advisory, as it is today.
- **Read-only database roles and a generated worktree env file** to enforce decision 1.
  Deferred by the owner: see whether the written rule holds first.
- **Renaming the numbered migrations to timestamps.** Rewrites applied history on prod
  for nothing; they sort first as they are, and the squash removes them.

## Steps

These are separate pieces of work that land on `dev` as separate branches, in this
order unless noted; each pays off alone. Step 8 alone is constrained in *when* it may
land (see there).

1. **Rewrite the rules first.** `supabase/CLAUDE.md` becomes the canonical home of the
   migration procedure, for worktrees *and* for work done directly on `dev`; the flows
   reference it rather than restating it. In this step: the read-never-write rule and
   "never amend a *landed* migration". The remaining sections change with the step that
   changes their subject. Until step 2 lands there is no other way to regenerate the
   types, so the rule ships with one named exception, the existing push-then-generate
   workflow, and step 2 deletes the exception with the workflow. This step gates step 3:
   CI must not own staging while the documented workflow still tells agents to push
   there. As built, the amend rule treats a migration pushed to staging as landed for as
   long as the push-then-generate exception stands; step 2 removes that sentence with the
   exception.
2. **The local database script, generation, and the comparison**, for the types. One
   script under `scripts/`, exposed as an npm script, is the only thing that knows the
   database lives in WSL; every caller, agent or flow, uses it and never the distro
   directly. In this step it gains `generate`. What it owns:
   - *The boundary.* Its real logic is shell files run inside the distro; it translates
     the worktree's path, sets the Linux `PATH` itself, and keeps the noise WSL writes
     to stderr out of its output. It holds a keep-alive session for as long as a
     database of its own is running, and releases it with the last one, so a running
     stack never depends on a terminal happening to be open. See the constraints for
     what goes wrong otherwise.
   - *The CLI.* It installs the Linux release of the Supabase CLI inside the distro at
     the version `package.json` pins, and reinstalls when the pin moves, so local and
     CI never run different versions.
   - *The shadow workdir.* The CLI is never run against the worktree's own `supabase/`
     directory. The script builds a directory outside the repo holding a rewritten copy
     of `config.toml` (its own project id; every port shifted) with `migrations/` and
     the seed linked back to the worktree. It lives in the distro's own filesystem, not
     on the Windows side. This is what lets several databases coexist,
     keeps the repo clean, and, because a shadow workdir carries no linked-project
     version pins, gives the CLI's default service versions, which is what CI gets.
   - *`generate`.* Database container only; types through the CLI pointed at the
     database URL with `--schema public` (the `--local` form is broken in the pinned
     CLI, see constraints, and without the schema flag a local database's exposed-schema
     list brings back the `graphql_public` block `supabase/CLAUDE.md` exists to keep
     out); remove the database. CI runs the identical command: it has never generated
     types, so this is a new step there, not a changed one.
   Confirm from inside a worktree that the isolation guard admits the npm script, since
   the guard refuses commands it cannot verify stay inside the worktree and this one
   writes outside it by design.
   Add the comparison to the full CI's database job, and have it upload what it
   generated as an artifact on every run, pass or fail. **Generate, compare and upload
   before the DB tests run**: today the job regenerates its snapshot after them, so a
   red test run produces no files at all, which is exactly when decision 3's escape
   hatch is needed. **Before relying on any of it, prove the two
   generators agree**: generate locally, push, and let the comparison run. Where they
   cannot be made identical, CI's artifact is the source and the difference is a defect
   in the script (decision 3). Separately, compare the generated types with the committed file on
   current `dev`: the committed one came from staging, so a difference is expected (it
   was measured as boilerplate only: a PostgREST version block and the parenthesisation
   of the helper types, with no table, column, enum or function differing). Confirm
   that is still all it is, then commit the from-migrations output as the new truth.
   Replace the migration workflow in `supabase/CLAUDE.md`: write → generate → commit,
   the same in a worktree and directly on `dev`, with decision 3's triage order for a red
   comparison, on a branch or on `dev`, and where to download CI's artifact. The
   statement that this machine has no Docker (`tests/CLAUDE.md`) is the stated reason
   the DB tests are CI-only; replace the reason rather than deleting it: nothing wires
   the test runner to a local stack yet, and improvising one against the repo's own
   `supabase/` directory dirties it (constraints). The rule itself stays absolute until
   the follow-up is taken, including once step 7's stacks exist: a stack carries the
   rich seed, and the DB tests' whole-table claims are written against the minimal one.
   **Steps 2 and 3 land back to back.** In between, nothing pushes to staging
   automatically, so whoever lands a migration on `dev` pushes `dev`'s migrations to
   staging by hand, which is the same command CI is about to run.
3. **CI pushes `dev` to staging.** A job on push to `dev`, with no `needs`, a
   `concurrency` group so two pushes never run `db push` against staging at once, and
   only the CLI installed. It connects as the prod job does (`supabase link`, then
   `db push`). Two new repository secrets from the
   owner, named apart from prod's (`SUPABASE_STAGING_PROJECT_REF`,
   `SUPABASE_STAGING_DB_PASSWORD`; prod's keep their current names, asymmetry
   accepted); the existing `SUPABASE_ACCESS_TOKEN` secret serves
   both. It runs only on `dev`, so it is neither a required check on `main` nor a
   Vercel deployment check, and the workflow header's two edits outside the repo do not
   apply. *Before the first run*, reconcile staging's migration
   history with `dev`: list versions on staging with no file on `dev` (leftovers of
   abandoned branches) and resolve each with the owner, because a remote version with no
   local file makes `db push` refuse outright. **The job lands only once both owner
   items are done**, the secrets and the reconciliation; it is not written to skip
   quietly without them. State the recovery for a failed push:
   each migration is its own transaction, so staging holds the ones before the failure
   and `dev`'s run stays red until the fix; fix forward with a new migration, never by
   editing staging.
4. **Timestamps at landing.** A small restamp script (renames the migrations a branch
   adds relative to `origin/dev` to fresh timestamps, preserving order);
   `/worktree-flow` Phase 5 gains decision 8 for migration-bearing branches;
   `/hotfix-to-main` refuses a commit carrying a migration when `dev` holds an older
   unreleased one, and says why; a tripwire in the full CI on `dev` asserts every
   *timestamped* migration a push adds sorts above every one already there, and that no
   push adds a numbered one unless it also deletes numbered ones (which is the squash,
   and nothing else); it fails the run, fires after the fact, and is the only gate
   covering direct-on-`dev` work. Its remedy: staging's `db push` refuses an
   out-of-order file for the same reason prod's would, so no environment has applied
   it; rename it to a fresh timestamp in a follow-up commit, the one case in which a
   landed file is renamed. A restamped branch is not pushed again before it merges: the
   local regenerate-and-compare is the gate and `dev`'s own CI run follows the merge
   (the no-local-database path pushes only because CI is then the generator). Delete the "staging is shared,
   and migration numbers are contended" section of `supabase/CLAUDE.md`; update the
   reference-data generators under `scripts/`, which hold migration file names as
   literals (so an applied migration is never regenerated) and tell the operator to pick
   "the next free number": new files come from `supabase migration new`, and whatever
   the generators key on must survive the landing restamp, so key on the descriptive
   part of the name, not the version.
5. **The schema directory.** The split; `generate` and the comparison produce
   and check the directory alongside the types; delete `schema.sql` and the CI step that
   commits it; keep that step's guard against a dump that silently lost an object
   class. What the split has to get right, from the dump as it is today:
   - Constraint, trigger, policy and row-security headers name their table, so they
     attribute mechanically. **Index headers carry only the index name**: take the table
     from the statement's `ON` clause.
   - **Grant headers spell a function's signature with parameter names; function headers
     use types only.** Normalise both to one key, in a way that still works the day an
     overload appears (there are none today, and no sequences or column defaults emitted
     as separate entries).
   - Give `supabase/schema/**` the `-text linguist-generated=true` attribute
     `schema.sql` has in `.gitattributes`, and for the same reason: a CHECK constraint
     holds a literal carriage return, and line-ending normalisation would make the
     comparison unmatchable forever. For the same reason the generated files are
     written inside the distro and never pass through a Windows shell's text handling.
   - One subdirectory per object class, since a table and a function may share a name.
   - Within an object class the dump is alphabetical, so adding an unrelated object
     moves no other file's bytes; keep dump order inside each file.
   Rewrite "Current state lives in snapshot files" in `supabase/CLAUDE.md` (including
   the own-branch staleness warning, which this retires; the "objects outside `public`"
   section stays, because those objects are still learned from migrations) and every
   live reference to `schema.sql`. Find them with a grep on the day; where they were at
   the time of writing, not a complete list: the root `CLAUDE.md`, the CI workflow, doc
   comments in the service contract files and one DB test, the architecture docs
   (database authorization, products), the procedure skills in `.claude/skills/`,
   `TODO.md`, and the other open plan that cites it. Investigations are point-in-time
   and stay as written. The dump keeps the filters today's step applies to it.
   Nothing executable reads the file. Delete the `TODO.md` item about the snapshot's bot
   commit blocking release PRs: removing the bot commit resolves it.
6. **The rich example seed**, as its own file, not in `config.toml`. Built through the
   admin RPCs under impersonated admin claims (the pattern in
   the `staging-test-data` skill): products of every type and lifecycle state,
   families with gamers, certified and uncertified gedus, groups with sessions and
   feedback. It is a `.sql` file the local stack script applies after `seed.sql`:
   accounts as direct auth inserts exactly as `seed.sql` does them (same shared test
   password), everything product-shaped through the RPCs. **Prices only have to
   render.** A local stack's users do not exist in Stripe's test mode, so checkout and
   billing are verified on staging as today, and the seed creates nothing in Stripe.
   Because it calls the RPCs, it fails loudly when one's contract has changed; that
   surfaces when a stack is brought up, and is fixed then. It needs a database and
   nothing else (it runs over a plain database connection under transaction-local
   claims, no HTTP service involved), so it is written and proven against step 2's
   database-only build, before step 7 exists.
7. **Local stacks.** Needs steps 2 and 6. The script gains `up`, `park`, `down`, `reset`
   and `list`. `up` allocates the stack's port block, starts the trimmed service set,
   applies both seeds, and writes the stack's URL and keys into the *worktree's*
   `.env.local`, keeping the staging values aside to restore on `down`. It replaces
   only what the app reads to reach Supabase: the URL, the anon key and the service-role
   key. The linked-project ref, the database password and the staging sign-in
   credentials stay, deliberately: the CLI commands and the procedure skills in a
   worktree keep meaning staging. A worktree's
   `.env.local` is sometimes edited on purpose, so `down` restores only the keys `up`
   replaced and leaves the rest; the main checkout's `.env.local` is never touched by
   the script and is the recovery copy when `down` never ran. `list` shows
   every stack, running or parked, with its worktree and its memory, and flags one whose
   worktree is gone; that flag is the only orphan sweep. `/worktree-flow`: Phase 3 stays
   what it is, the preview of a UI change; when the branch also carries a migration it
   brings a stack up first, without asking. A schema change with nothing to look at
   never gets a stack: `generate` is all it needs. Stopping the
   worktree's dev server parks the stack; teardown runs `down` after its tree kill. One thing
   to settle while building: the app running end to end against a stack, which was only
   proven at the HTTP level.
8. **The squash.** Needs steps 3 and 5. *Constraint on timing:* it is built and landed
   immediately after a release, while the migrations on `dev` are exactly the ones prod
   has applied; any migration that lands during the work stays a separate file after
   the baseline.
   - **The baseline is two files: schema, then reference data**, so nobody scrolls
     megabytes of inserts to read the DDL. They keep **5-digit versions, the highest two
     of the files they replace**: numbered files sort before every timestamp, so a
     migration that landed during the work still runs after the baseline on a fresh
     build (a baseline stamped at landing would sort *above* it and break every fresh
     build); and every environment that applied the old history already records those
     two versions as applied. The schema file takes the lower of the two, so the DDL
     runs before the inserts.
   - The schema file is more than a `public` schema dump. It also creates the extensions
     the old migrations created, our triggers on `auth.users`, our policies on
     `storage.objects`, the bucket and cron definitions, and the realtime publication's
     table membership, written as statements. A plain `public` dump would silently cost
     every fresh database the new-user profile trigger, all storage RLS, and realtime on
     the chat tables.
   - The data file holds what the old migrations inserted (location tree, postal codes,
     lookup rows), taken from a data dump of a from-migrations database rather than by
     keeping the old data migrations, because later migrations wiped, re-pointed and
     backfilled what earlier ones inserted. The reference-data generators still emit new
     migrations that apply on top of a baseline, but their record of which countries are
     already seeded names files the squash deletes: drop those entries in the same
     change, so a re-run for a country the baseline already holds fails instead of
     re-seeding it.
   - **Proof, mechanical and required:** build one local database from the old files and
     one from the baseline (no seeds); the schema directory (which is why this needs
     step 5), the types, and a data-only dump of `public` must be identical. So must,
     as a one-off for this proof, a listing of our objects outside `public` taken the
     same way from both: extensions, triggers on `auth.users`, policies on
     `storage.objects`, the bucket and cron rows, and the realtime publication's tables.
     That listing is what proves the schema-file bullet above. The migration history table is excluded; it differs by
     construction.
   - **History, an operator step the owner approves at the time:** assert the *numbered*
     versions the environment's history records as applied are exactly the numbered
     files being squashed (timestamped ones that landed meanwhile are expected and
     untouched; no hold on other work is needed), then mark every
     version below the lower baseline version as reverted with `migration repair`,
     leaving both baseline versions applied. It touches the
     history table only. Staging: just before the squash merges into `dev`. **Prod: in
     the same sitting as the release that carries it, immediately before the release
     merge**, because between the repair and that deploy `main` still holds the old
     files and any `db push` from it (a hotfix) would try to replay the whole history.
     Rollback at any point before the deploy: mark the same versions applied again.
     Until that release has gone out, the squash branch leaves a notice at the top of
     the root `CLAUDE.md` saying the next release owes prod's history repair first, and
     why; the release that pays it deletes the notice. A release that skips it fails
     safe: prod's `db push` refuses and the production promotion is held. This step, and
     with it the plan, is complete when the squash merges into `dev`: the notice, not
     the plan file, carries the debt to prod from there.
   - A feature branch open across the squash syncs as usual; git resolves the deleted
     files. If it had also touched `schema.sql` or a numbered migration, regenerate.
   - Rewrite prose in `CLAUDE.md` files and `docs/` that sends a reader to a numbered
     migration ("as 00127 does", "model it on the highest-numbered migrations") so it
     states its rule without the number.

## Acceptance criteria

- A migration written in a worktree reaches a green branch CI, on its first push, with
  regenerated files and **no connection to staging** at any point. With the local
  database unavailable, the same migration still lands, from CI's artifact.
- Two branches each adding a migration land in either order with no renaming by hand and
  no edit to any history table; prod's plain `db push` applies both.
- Two branches that each replace the same function cannot both land silently: the second
  hits a git conflict in that function's file, or fails the comparison.
- A push to `dev` carrying a migration applies it to staging without anyone running a
  command.
- Hand-editing `database.types.ts` or any file under `supabase/schema/` fails the full
  CI. `schema.sql` is gone and nothing refers to it.
- A schema-changing worktree's dev server shows the rich seed's data from its own local
  stack within about two minutes, without the owner doing anything and at no cost; two
  such stacks run at once (three when the machine's other work leaves the memory for
  it); a parked stack holds no memory and comes back with its data
  in under a minute; landing the branch removes its stack and its data. No caller ever
  invokes the distro directly, and the repo stays clean after every script command.
- After the squash: the proof passed; `migrations/` holds the two baseline files plus
  only what landed since; a fresh build still has the new-user profile trigger and
  storage RLS; `db push --dry-run` reports nothing to apply on staging and on prod.
- `npm run lint`, `type-check`, `test` clean; DB tests green in CI.

## Constraints discovered while deciding

Measured on the owner's machine on 2026-09-18, with Docker Engine in the WSL distro and
the pinned CLI, unless noted.

- **The engine is Ubuntu's own `docker.io` package inside the `Ubuntu-24.04` WSL
  distro**, recorded in the owner's machine-config repo, not in this one. The distro has
  systemd enabled, so the package install starts the daemon; group membership took
  effect without restarting the distro.
- **Never shut down or terminate the WSL distro to fix something.** It is shared with
  the owner's other long-running work, which a restart destroys. Restart the Docker
  service or the stack, never WSL. The script says so where it handles failures.
- All 257 migrations plus `seed.sql` apply cleanly to a local database; the stack
  answers on plain `localhost` from the Windows side, for every stack at once.
- Timings: first start with image downloads 149 s; full start with images cached, which
  replays every migration, 61 s; database reset 55 s; database container only 41 s;
  the trimmed service set 29 s; park 16 s; resume from parked 32 s with no replay and
  the data intact.
- Idle memory: the full stack about 1.05 GB, the trimmed set 656 MB, the database alone
  138 MB. Three full stacks ran together at about 1 GB each, and resetting one left the
  others' data untouched.
- **WSL is capped at 12 GB and the cap is shared** with the owner's other workloads,
  which at times take about 7 GB. One or two stacks beside that is comfortable; three is
  tight. That is arithmetic from the measured per-stack cost, not an observed run.
- The app uses realtime and storage; it uses no edge functions and no storage image
  transformations. So the trimmed set is the database, auth, the REST layer, the
  gateway, realtime and storage. It has no mail catcher: an auth email cannot be read on
  a trimmed stack, which is fine because the seeds create accounts directly.
- **The CLI's help text lists the wrong names for excluding services.** The valid names
  are the ones its own warning prints, and an invalid name is ignored with a warning,
  not an error: the service starts anyway. The cost of getting one wrong is memory, and
  `list` shows each stack's.
- Stacks coexist when the project id and every port differ, and nothing else has to.
  `env()` substitution works for a port (verified on the API port only) and **not** for
  the project id. `config.toml` has three project ids (its own and one per remote):
  rewrite the first only. It has a port field with a digit in its *name*, so rewrite
  ports by key, not by "the first number on the line".
- The CLI follows symlinks for `migrations/` and the seed.
- Run against the repo's own `supabase/` directory, the CLI creates an untracked
  `.branches/` directory there that is not gitignored, and takes service versions from
  the linked project's pins in `.temp/`: different images from the CLI's defaults (an
  older Postgres image of 4.5 GB against 1.7 GB), so mixing the two doubles the disk
  used. A shadow workdir avoids both.
- **Type generation's `--local` form fails in the pinned CLI** with a password
  authentication error, against a database that accepts the same credentials directly.
  Pointed at the database URL it works.
- The CLI's Linux release is two binaries that must sit together; extracting one alone
  fails with a clear message. The distro has no Node, and it inherits the Windows
  `PATH`, so a bare `npm` or `node` inside it resolves to the Windows install.
- Crossing from a Windows shell into the distro mangles `~` and rooted Linux paths,
  inline environment assignments (the Windows `PATH` leaks in and splits on the space in
  "Program Files"), and anything with `$` or nested quotes; the two sides' `/tmp` are
  different directories; every invocation writes a terminal-size warning to stderr.
- Disk: about 6.5 GB of images for the trimmed set at the current versions, shared by
  every stack; a parked stack adds only its data. A CLI version bump downloads new
  images and leaves the old ones until pruned, and the distro's virtual disk on `C:`
  does not shrink when they are.
- **Whether the distro stays up with nothing attached could not be isolated**, in two
  attempts. A container answered from the Windows side for five minutes with no
  `wsl.exe` process on the machine and was never restarted, but interactive shells
  were alive inside the distro both times, and they cannot be ruled out as what kept it
  up. So the script does not depend on the answer: it holds a keep-alive while anything
  of its own is running. A detached `sleep infinity` session started hidden from the
  Windows side was shown to work and to clean up.
- A script piped into the distro from PowerShell arrives with a byte-order mark, which
  silently turns its first line into a command that is not found. Start such a script
  with a throwaway line.
- **Not verified:** that local and CI generation are byte-identical (step 2 proves it
  first), and the app running end to end against a local stack.
- **The CLI version is pinned in two places**, `package.json` and the CI workflow's
  environment, kept equal by convention only (`supabase/CLAUDE.md` says they move in one
  commit). The script reads the first and CI the second, and byte equality between the
  generators rests on them matching.
- `pg_dump` of `public` does not emit the realtime publication's table membership, which
  is why a DB test asserts it and why the squash has to carry it by hand.
- CI builds its database with a trimmed `supabase start` and runs raw `pg_dump` inside
  the database container, so the client always matches the server. `supabase db dump`
  silently omits triggers; the directory must be raw `pg_dump` too. Strip the dump's
  version header line regardless.
- That mixed 5-digit and 14-digit versions sort as expected in the CLI was reasoned
  (leading zeros make text and numeric order agree), not run. Check it against a local
  database before step 4 ships.
- Merges into `dev` are local, with no PR and no required check, so every gate that must
  run *before* landing lives in the landing procedure; CI on `dev` fires afterwards.
- The release pipeline holds Vercel's production promotion until CI's prod migration job
  succeeds, so a refused migration leaves prod on old code rather than new code on an old
  schema.
- Vercel builds a preview for every pushed branch, against staging's database; a
  schema-changing branch's preview therefore runs new code on staging's schema (see
  Follow-ups).
- Function comments in the database narrate their own history by migration number
  ("since 00171…"). The squash leaves those citations pointing at files that exist only
  in git history. That is accepted here; see Follow-ups.

## Owner decisions and actions

- Add the two staging secrets to the repository (step 3).
- Resolve any staging history versions that have no file on `dev` (step 3).
- Approve each `migration repair` pass of the squash, staging and then prod (step 8).
  It rewrites the history table only, but it is prod.
- What the rich seed's catalogue should look like, where the implementer's draft of it
  needs a product owner's eye (names, ages, prices that read as real).

## Follow-ups

Cut from this plan on purpose. Proposed to the owner by headline when the plan is
deleted; only the ones named are kept.

- Run the DB tests locally against a stack, instead of only in CI.
- A generated record of our objects outside `public`, beside the schema directory, once
  there is a cheap bare reference to diff against in CI.
- A shared Vercel preview for a schema-changing branch. Only a hosted database can back
  one, so it would be a hosted preview branch switched on for that purpose, plus that
  git branch's Vercel preview env vars. Until then such a preview runs new code against
  staging's schema and its new parts break.
- Prune superseded images after a CLI version bump, and compact the distro's virtual
  disk.
- Reset staging to clear its cosmetic drift.
- Read-only roles and a generated worktree env file, if the written rule is seen to fail.
- Rewrite function comments to describe current behaviour only, dropping their
  migration-number changelogs.
