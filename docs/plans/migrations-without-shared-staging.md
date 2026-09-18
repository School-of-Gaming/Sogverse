# Migrations without a shared staging database

Agents stop writing to staging. An on-demand GitHub Action generates the database files,
which now include the current schema as one file per object; staging receives `dev` from
CI; migration versions are timestamps assigned at landing; the only hosted database a
feature ever gets is one the owner switches on to verify UI; and the long numbered
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
   investigate; every write a piece of work needs goes to a seed file or a branch
   database. A runbook run at the owner's explicit instruction (creating an admin
   account, correcting an email, putting test data on staging) is the exception and
   stays as it is. This is a written rule, not a mechanism: `.env.local` stays a plain
   copy with its current keys.
2. **A manual GitHub Action generates the database files.** Run on demand against a
   branch, it does one job: start a bare database, apply that branch's migrations,
   generate `database.types.ts` and the schema directory (decision 4), and upload them as
   an artifact. No lint, no tests, no build, no commit. The agent triggers it, waits,
   downloads the artifact and commits the files in its own feature commit.
3. **The full CI compares.** Its database job already builds from `migrations/`; it
   generates the same files from that build and fails, on every branch, when they differ
   from what is committed. A branch's first push of a new migration is therefore red on
   this one step until the generated files are committed; that is expected and short.
4. **Current schema is a generated directory, `supabase/schema/`, one file per object,
   replacing `schema.sql`.** A file per table holds the table with its indexes,
   constraints, policies, triggers, grants and comments; a file per function holds its
   definition, grants and comment; enums and other types share one; what belongs to no
   object (the schema's own block, default privileges) shares another. It is never
   hand-edited and is committed by the branch that changed it, exactly like the types.
   Migrations become write-only: written and applied, never read to learn state. Two
   generators feed it:
   - *The split*, for `public`: raw `pg_dump` cut on the object headers the dump already
     carries.
   - *A second generator* for the few objects outside `public` that today
     can only be learned by grepping migrations: the extensions the migrations create,
     our triggers on `auth.users`, our policies on `storage.objects`, and the rows that
     define storage buckets and cron jobs. "Ours" is **what the migrations added**: the
     difference, for those catalogs, between the bare stack and the migrated one. No
     list of names to maintain, so a future migration cannot be silently left out, and
     the platform's own auth and storage objects, which change with every CLI bump,
     never enter.
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
   restamp the branch's own migrations to now (relative order kept), run the generate
   action, and require its output to equal the working tree. A difference in a file both
   sides touched is decision 5's conflict. Then merge `--no-ff` as today. Waiting for the
   branch's full CI is advisory, as it is today. Branches without migrations land exactly
   as today.
9. **An unlanded migration is mutable; a landed one is not.** No shared database has
   applied an unlanded file, so an agent edits it instead of stacking fix-ups.
10. **The owner switches a branch database on and off by saying so.** A running branch
    database is the only thing here that costs money, and only a human verifying UI
    needs one.
    - *On:* create a preview branch of the **staging** project named for the git branch,
      push the worktree's migrations, `seed.sql` and the rich seed, and point the
      worktree's dev server at it. A later schema change is pushed to the *running*
      database: a new migration is a plain push; an edited one is an in-place reset of
      its contents plus a push. The instance is never deleted and recreated for this.
    - *Off:* the owner says so, or the feature lands.
    - *Never otherwise:* an agent does not create one on its own initiative, including
      to verify its own work in a browser. It asks.
    - *Visibility:* whenever a database is switched on, and when `/worktree-flow` lands,
      list the branch databases that are up with their age and cost so far.
11. **Two seeds.** `supabase/seed.sql` stays the deliberately minimal fixture set the DB
    tests are written against, and the only seed the CLI loads (`config.toml` has no seed
    section; `seed.sql` is the default, and stays the default). A second,
    rich example seed builds a realistic catalogue for previews through the admin RPCs;
    only the branch database script applies it. It exists to help a human review UI, so
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
- **Authored declarative schemas with generated migrations.** Supabase's diff tool needs
  a local Docker shadow database this machine does not have, its gaps sit on this repo's
  grant and revoke regime, and agents write deltas well. What was missing was a
  trustworthy view of state, which the generated directory gives without inverting who
  authors what.
- **Branches of the prod project, and a persistent `staging` branch replacing the staging
  project.** Couples agents' tooling to prod's project and forces a cutover of staging's
  URL, Vercel env vars and Stripe webhooks, for no gain over branching off staging.
- **Any automated database lifetime**: a nightly delete job, a database per command, an
  hourly lease held by a keeper process, relying on Supabase's idle auto-pause. The last
  no longer exists (Supabase removed it from its docs on 2026-08-11, and a probe left
  untouched for 11½ minutes never stopped). The rest are systems guessing when the owner
  needs something the owner can simply state.
- **A hosted database to regenerate the files.** Costs a billed hour per use for
  something CI's runners do for free.
- **Letting the full CI generate and bot-commit the files.** Slower, and it puts machine
  commits in the history.
- **A scratch-ref namespace the full CI ignores**, so a branch is pushed only once,
  complete. Vercel builds every pushed ref, the tidiness was nobody's requirement, and a
  short red first push is cheaper than the namespace, the ignore rule and the delete
  step.
- **Listing the rich seed in `config.toml`'s seed paths.** That governs the local stack,
  so it would load the rich seed into CI's database *before* the DB tests, whose
  whole-table claims are written against the minimal fixtures.
- **A CI step applying the rich seed to prove it still runs.** Owner's ruling: the rich
  seed is rich to help humans review UI, and is not something CI needs.
- **A comparison that only warns on feature branches**, failing hard on `dev` and `main`
  alone. One behaviour everywhere is simpler and catches a stale file before it lands.
- **Requiring the branch's full CI green before every migration-bearing landing.** The
  sync-and-regenerate check of decision 8 catches a conflicting merge in about two
  minutes; the full CI stays advisory, as it is today.
- **Read-only database roles and a generated worktree env file** to enforce decision 1.
  Deferred by the owner: see whether the written rule holds first.
- **`--with-data`**, to give previews staging's data. Makes a database depend on
  something other than git, and Supabase gates it behind the PITR add-on.
- **Renaming the numbered migrations to timestamps.** Rewrites applied history on prod
  for nothing; they sort first as they are, and the squash removes them.

## Steps

These are separate pieces of work that land on `dev` as separate branches, in this
order unless noted; each pays off alone. Step 8 alone is constrained in *when* it may
land (see there).

1. **Rewrite the rules first.** `supabase/CLAUDE.md` becomes the canonical home of the
   migration procedure, for worktrees *and* for work done directly on `dev`; the flows
   reference it rather than restating it. In this step: the read-never-write rule, the
   never-create-a-database-unasked rule, and "never amend a *landed* migration". The
   remaining sections change with the step that changes their subject. This step gates
   step 3: CI must not own staging while the documented workflow still tells agents to
   push there.
2. **The generate action and the comparison**, for the types. A separate workflow file
   with a manual trigger and no inputs: the branch is the ref it is dispatched on
   (`gh workflow run … --ref <branch>`). **GitHub only dispatches a workflow whose file
   exists on the default branch, which is `main`**, so the first act of this step is
   shipping the bare workflow file to `main` through `/hotfix-to-main`; later edits to
   it take effect on a branch without another release, because a dispatched run uses the
   ref's copy. The local stack with only what type generation needs; the pinned CLI;
   `gen types typescript --local --schema public`, which replaces the documented
   staging command wholesale rather than sitting beside it. Add the comparison to the
   full CI's database job. Before relying on it, compare the generated file with the
   committed one on current `dev`. The committed file was generated from staging, which
   carries known cosmetic drift (a moved column ordinal), so a difference is likely:
   confirm it is drift and not a missing migration, then commit the from-migrations
   output as the new truth. Replace the migration
   workflow in `supabase/CLAUDE.md`: write → push the branch → run the action → commit
   the artifact. For a migration written directly on `dev`: push it to a short-lived
   ordinary branch, generate, commit, push `dev`, delete the branch. Also state the
   recovery for a red comparison on `dev`: run the action against `dev`, then apply
   decision 5's inspection before committing anything.
3. **CI pushes `dev` to staging.** A job on push to `dev`, with no `needs`, a
   `concurrency` group so two pushes never run `db push` against staging at once, and
   only the CLI installed. It connects as the prod job does (`supabase link`, then
   `db push`); the session-pooler constraint below was measured on a branch database
   and is the script's concern, not this job's. Two new repository secrets from the
   owner, named apart from prod's (`SUPABASE_STAGING_PROJECT_REF`,
   `SUPABASE_STAGING_DB_PASSWORD`); the existing `SUPABASE_ACCESS_TOKEN` secret serves
   both. *Before the first run*, reconcile staging's migration
   history with `dev`: list versions on staging with no file on `dev` (leftovers of
   abandoned branches) and resolve each with the owner, because a remote version with no
   local file makes `db push` refuse outright. State the recovery for a failed push:
   each migration is its own transaction, so staging holds the ones before the failure;
   fix forward with a new migration, never by editing staging.
4. **Timestamps at landing.** A small restamp script (renames the migrations a branch
   adds relative to `origin/dev` to fresh timestamps, preserving order);
   `/worktree-flow` Phase 5 gains decision 8 for migration-bearing branches;
   `/hotfix-to-main` refuses a commit carrying a migration when `dev` holds an older
   unreleased one, and says why; a tripwire in the full CI on `dev` asserts every
   *timestamped* migration a push adds sorts above every one already there, and that no
   push adds a numbered one unless it also deletes numbered ones (which is the squash,
   and nothing else); it fires after the fact, and is the only gate covering
   direct-on-`dev` work; delete the "staging is shared,
   and migration numbers are contended" section of `supabase/CLAUDE.md`; update the
   reference-data generators under `scripts/`, which hold migration file names as
   literals (so an applied migration is never regenerated) and tell the operator to pick
   "the next free number": new files come from `supabase migration new`, and whatever
   the generators key on must survive the landing restamp, so key on the descriptive
   part of the name, not the version.
5. **The schema directory.** The two generators; the action and the comparison produce
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
     comparison unmatchable forever.
   - One subdirectory per object class, since a table and a function may share a name.
   - Within an object class the dump is alphabetical, so adding an unrelated object
     moves no other file's bytes; keep dump order inside each file.
   Rewrite "Current state lives in snapshot files" in `supabase/CLAUDE.md` (including
   the own-branch staleness warning and the "objects outside `public`" section, both of
   which this retires) and every live reference to `schema.sql`: the root `CLAUDE.md`,
   the CI workflow, doc comments in the service contract files, the database
   authorization architecture doc, the runbooks, and the other open plan that cites it.
   Nothing executable reads the file. Delete the `TODO.md` item about the snapshot's bot
   commit blocking release PRs: removing the bot commit resolves it.
6. **The rich example seed**, as its own file, not in `config.toml`. Built through the
   admin RPCs under impersonated admin claims (the pattern in
   `docs/runbooks/staging-test-data.md`): products of every type and lifecycle state,
   families with gamers, certified and uncertified gedus, groups with sessions and
   feedback. It is a `.sql` file the branch database script applies after `seed.sql`:
   accounts as direct auth inserts exactly as `seed.sql` does them (same shared test
   password), everything product-shaped through the RPCs. **Prices only have to
   render.** A branch database receives no Stripe webhooks, so checkout and billing are
   verified on staging as today, and the seed creates nothing in Stripe. Because
   it calls the RPCs, it fails loudly when one's contract has changed; that surfaces
   when a database is switched on, and is fixed then.
7. **The branch database script** under `scripts/`: `on`, `off`, `push`, `reset`, `list`.
   Needs step 6. It is the only reader of `SUPABASE_ACCESS_TOKEN`. `on` writes the
   branch's URL and keys into the *worktree's* `.env.local`, keeping the staging values
   aside to restore on `off`. `/worktree-flow`: Phase 3 asks the owner whether to switch
   a database on when the change is schema-dependent; teardown runs `off` after its tree
   kill. `/cleanup-branches` also deletes any Supabase preview branch whose git branch
   is gone, in the same confirmation table.
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
     two versions as applied.
   - The schema file is more than a `public` schema dump. It also creates the extensions
     the old migrations created, our triggers on `auth.users`, our policies on
     `storage.objects`, and the bucket and cron definitions, written as statements. A
     plain `public` dump would silently cost every fresh database the new-user profile
     trigger and all storage RLS.
   - The data file holds what the old migrations inserted (location tree, postal codes,
     lookup rows), taken from a data dump of a from-migrations database rather than by
     keeping the old data migrations, because later migrations wiped, re-pointed and
     backfilled what earlier ones inserted. The reference-data generators are
     unaffected: they emit new migrations, which apply on top of a baseline as before.
   - **Proof, mechanical and required:** build one database from the old files and one
     from the baseline (no seeds); the schema directory (both generators, which is why
     this needs step 5), the types, and a data-only dump of `public` must be identical.
     The migration history table is excluded; it differs by construction. Run it in a
     one-off manual action.
   - **History, an operator step the owner approves at the time:** assert the *numbered*
     versions in the environment's history are exactly the numbered files being
     squashed (timestamped ones that landed meanwhile are expected and untouched; no
     hold on other work is needed), then mark every
     version below the baseline's as reverted with `migration repair`. It touches the
     history table only. Staging: just before the squash merges into `dev`. **Prod: in
     the same sitting as the release that carries it, immediately before the release
     merge**, because between the repair and that deploy `main` still holds the old
     files and any `db push` from it (a hotfix) would try to replay the whole history.
     Rollback at any point before the deploy: mark the same versions applied again.
     Until that release has gone out, the squash branch leaves a notice at the top of
     the root `CLAUDE.md` saying the next release owes prod's history repair first, and
     why; the release that pays it deletes the notice. A release that skips it fails
     safe: prod's `db push` refuses and the production promotion is held.
   - A feature branch open across the squash syncs as usual; git resolves the deleted
     files. If it had also touched `schema.sql` or a numbered migration, regenerate.
   - Rewrite prose in `CLAUDE.md` files and `docs/` that sends a reader to a numbered
     migration ("as 00127 does", "model it on the highest-numbered migrations") so it
     states its rule without the number.

## Acceptance criteria

- A migration written in a worktree reaches a green branch CI with regenerated files and
  **no connection to staging** at any point.
- Two branches each adding a migration land in either order with no renaming by hand and
  no edit to any history table; prod's plain `db push` applies both.
- Two branches that each replace the same function cannot both land silently: the second
  hits a git conflict in that function's file, or fails the comparison.
- A push to `dev` carrying a migration applies it to staging without anyone running a
  command.
- Hand-editing `database.types.ts` or any file under `supabase/schema/` fails the full
  CI. `schema.sql` is gone and nothing refers to it.
- "Switch the database on" yields a worktree dev server showing the rich seed's data
  within about two minutes; "off" leaves no preview branch on the staging project;
  landing a branch whose database is still up deletes it.
- After the squash: the proof passed; `migrations/` holds the two baseline files plus
  only what landed since; a fresh build still has the new-user profile trigger and
  storage RLS; `db push --dry-run` reports nothing to apply on staging and on prod.
- `npm run lint`, `type-check`, `test` clean; DB tests green in CI.

## Constraints discovered while deciding

Measured on a probe branch of the staging project, 2026-09-18, unless noted.

- Branching works on the staging project from the CLI with no GitHub integration.
  Creation takes about ten seconds and **the branch starts empty**: nothing feeds it
  migrations, so the script pushes them.
- A full push of all migrations plus `seed.sql` takes about **32 seconds**, including the
  seed's direct inserts into the auth schema and ~36k reference locations.
- **Push through the session pooler (port 5432) only.** Through the transaction pooler
  (6543, which is the URL `branches get -o env` returns) a push recorded eleven versions
  as applied while creating no tables, then failed. The direct database host is IPv6-only
  and does not resolve from the owner's machine.
- A hosted branch's schema dump matched CI's from-migrations dump byte for byte across
  16,320 lines, bar the `pg_dump` version header. With one generator (the action) the
  version question does not arise; strip the header line anyway.
- `supabase db dump` silently omits triggers; the snapshot is raw `pg_dump` for that
  reason (see the CI workflow's comments) and the directory must be too.
- Supabase deletes a preview branch only when a PR closes, and `feat/*` branches have no
  PRs. Nothing pauses an idle branch. Every deletion is ours.
- Compute bills **by the started hour, per instance** ($0.01344 for Micro; documented for
  projects, assumed for branches). Off-then-on within an hour bills twice, so leaving one
  up over a short break is cheaper. A forgotten one costs about $0.32 a day.
- Creating the first branch leaves a default `main` entry in `branches list` for the
  staging project itself. It is the project, not an instance to delete.
- `SUPABASE_ACCESS_TOKEN` is org-scoped: the script must take the staging project ref
  explicitly and refuse any other, and must only ever delete a branch named for a git
  branch.
- An in-place reset of a hosted branch database was not tried on the probe; the CLI's
  `db reset` against a database URL is the likely tool. If it cannot, drop and re-push
  the contents; recreating the instance is not the fallback.
- That mixed 5-digit and 14-digit versions sort as expected in the CLI was reasoned
  (leading zeros make text and numeric order agree), not run. Check with
  `db push --dry-run` against a branch database before step 4 ships.
- Merges into `dev` are local, with no PR and no required check, so every gate that must
  run *before* landing lives in the landing procedure; CI on `dev` fires afterwards.
- The release pipeline holds Vercel's production promotion until CI's prod migration job
  succeeds, so a refused migration leaves prod on old code rather than new code on an old
  schema.
- Vercel builds every pushed branch, which is why no scratch-ref namespace exists.
- Function comments in the database narrate their own history by migration number
  ("since 00171…"). The squash leaves those citations pointing at files that exist only
  in git history. That is accepted here; see Follow-ups.
- GitHub Actions minutes for the generate runs have not been checked against the plan's
  allowance.

## Owner decisions and actions

- Merge the hotfix PR that ships the generate workflow file to `main` (step 2).
- Add the two staging secrets to the repository (step 3).
- Resolve any staging history versions that have no file on `dev` (step 3).
- Approve each `migration repair` pass of the squash, staging and then prod (step 8).
  It rewrites the history table only, but it is prod.
- What the rich seed's catalogue should look like, where the implementer's draft of it
  needs a product owner's eye (names, ages, prices that read as real).

## Follow-ups

Cut from this plan on purpose. Proposed to the owner by headline when the plan is
deleted; only the ones named are kept.

- A shared Vercel preview for a schema-changing branch: the same "on", plus setting that
  git branch's Vercel preview env vars. Until then such a preview runs new code against
  staging's schema and its new parts break.
- Reset staging to clear its cosmetic drift.
- Read-only roles and a generated worktree env file, if the written rule is seen to fail.
- Rewrite function comments to describe current behaviour only, dropping their
  migration-number changelogs.
