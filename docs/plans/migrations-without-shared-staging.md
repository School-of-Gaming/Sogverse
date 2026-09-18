# Migrations without a shared staging database

Agents stop writing to staging. Generated database files come from an on-demand GitHub
Action, staging receives `dev` from CI, migration versions are timestamps assigned at
landing, and the only hosted database a feature ever gets is one the owner switches on to
verify UI.

**Precondition (owner's commitment, 2026-09-18):** `feat/gedu-substitution`, the last
branch carrying old-style numbered migrations already applied to staging, has merged into
`dev` before this work starts. Verify that first; if it has not, stop and ask.

## Problem

Work here is one human plus many Claude agents in parallel worktrees, and every worktree
pushes its migrations to one shared staging database in order to regenerate the types.
That single shared, mutable database is the cause of a family of failures:

- Two branches claim the same next 5-digit number; the second push finds the version in
  staging's history and its SQL is silently skipped.
- A version on staging whose file lives on someone else's unmerged branch makes `db push`
  refuse, and the documented escape is `psql -f` plus `migration repair`: an agent
  hand-editing shared history.
- A migration lands on staging before its code and breaks staging for everyone.
- Nothing orders migrations across branches. On 2026-09-18 a branch merged into `dev`
  with versions *below* ones already released to prod. Prod's plain `db push` refuses
  those, so the next release would have failed at the migration step. Fixing it meant
  renaming files and moving staging's history rows by hand.

## Scale

Every schema-changing piece of work is affected: 255 migrations so far, several a week,
usually more than one branch in flight. The ordering failure reached `dev` once and was
caught by hand a release early. The contention section of `supabase/CLAUDE.md` exists
only to coach agents through these collisions.

## The decision

1. **Agents never write to staging or prod.** They read them to investigate; every write
   goes to a seed file or a branch database. This is a written rule, not a mechanism:
   `.env.local` stays a plain copy with its current keys.
2. **A manual GitHub Action generates the database files.** Run on demand against a ref,
   it does one job: start a bare database, apply that ref's migrations, generate
   `database.types.ts`, upload it as an artifact. No lint, no tests, no build, no commit.
   The agent triggers it, waits, downloads the artifact and commits the file in its own
   feature commit. Because the action needs the ref on GitHub and a pushed branch
   triggers the full CI, the agent pushes to a scratch ref the full CI ignores, generates
   from that, and deletes it; the real branch is pushed once, complete.
3. **The full CI compares.** Its database job already builds from `migrations/`; it also
   generates the types from that build and fails when they differ from the committed
   file. That is what catches a stale, hand-edited or wrongly merged types file.
4. **CI pushes `dev` to staging**, as it already pushes `main` to prod. The job runs on
   every push to `dev` and does not wait for the test jobs, so staging's schema trails
   its code by about a minute rather than by a whole CI run.
5. **Migration versions are timestamps (`YYYYMMDDHHMMSS`, what `supabase migration new`
   produces), assigned at landing.** Landing is already serialized through one human, so
   it is the queue. The existing 00001–00269 keep their names; timestamps sort after
   them.
6. **A branch carrying migrations lands on a synced, green commit.** Merge `origin/dev`
   into the branch, restamp the branch's own migrations to now (relative order kept),
   regenerate, push, wait for the branch's CI to go green, then merge `--no-ff` as today.
   Branches without migrations land exactly as today.
7. **An unlanded migration is mutable; a landed one is not.** No shared database has
   applied an unlanded file, so an agent edits it instead of stacking fix-ups.
8. **The owner switches a branch database on and off by saying so.** A running branch
   database is the only thing here that costs money, and only a human verifying UI needs
   one.
   - *On:* create a preview branch of the **staging** project named for the git branch,
     push the worktree's migrations and both seeds, point the worktree's dev server at
     it. A later schema change is pushed to the *running* database: a new migration is a
     plain push; an edited one is an in-place reset of its contents plus a push. The
     instance is never deleted and recreated for this.
   - *Off:* the owner says so, or the feature lands.
   - *Never otherwise:* an agent does not create one on its own initiative, including to
     verify its own work in a browser. It asks.
   - *Visibility:* whenever `/worktree-flow` starts or lands, and whenever a database is
     switched on, list the branch databases that are up with their age and cost so far.
9. **Two seeds.** `supabase/seed.sql` stays the deliberately minimal fixture set the DB
   tests are written against. A second, rich example seed builds a realistic catalogue
   for previews, through the admin RPCs rather than hand-inserts.

## Rejected alternatives

- **Keep sequential numbers and enforce "merge above the target's highest".** Same-number
  collisions return the moment staging stops being the registry that hands numbers out.
- **`--include-all` on staging and prod**, so order stops mattering. Prod could then apply
  a different order than CI tested; a conflicting pair would leave prod with a different
  last writer than the snapshot records, silently, in the one environment verified to
  match migration source.
- **Branches of the prod project, and a persistent `staging` branch replacing the staging
  project.** Couples agents' tooling to prod's project and forces a cutover of staging's
  URL, Vercel env vars and Stripe webhooks, for no gain over branching off staging.
- **Any automated database lifetime**: a nightly delete job, a database per command, an
  hourly lease held by a keeper process, relying on Supabase's idle auto-pause. The last
  no longer exists (Supabase removed it from its docs on 2026-08-11, and a probe left
  untouched for 11½ minutes never stopped). The rest are systems guessing when the owner
  needs something the owner can simply state.
- **A hosted database to regenerate the types.** Costs a billed hour per use for
  something CI's runners do for free.
- **Letting the full CI generate and bot-commit the files.** Slower, and it puts machine
  commits in the history.
- **Read-only database roles and a generated worktree env file** to enforce decision 1.
  Deferred by the owner: see whether the written rule holds first.
- **`--with-data`**, to give previews staging's data. Makes a database depend on
  something other than git, and Supabase gates it behind the PITR add-on.

## Steps

Each is independently verifiable. 1–3 can be built in parallel; 4 needs 1; 5 needs 4.

1. **The generate action.** A new workflow with a manual trigger and a ref input. It
   starts the local stack with only what type generation needs, applies the ref's
   migrations, generates the types with the same pinned CLI and `--schema public`, and
   uploads the file. Make the full CI ignore pushes to the scratch-ref namespace
   (`gen/**`). Add the comparison to the full CI's database job. Verify the locally
   generated file is byte-identical to the committed one on current `dev` before relying
   on it; if it is not, find out why before going further.
2. **CI pushes `dev` to staging.** A job on push to `dev`, independent of the test jobs,
   mirroring the prod job. Needs two new repository secrets from the owner: staging's
   project ref and database password. *Before the first run*, reconcile staging's
   migration history with `dev`: list versions present on staging with no file on `dev`
   (leftovers of abandoned branches) and resolve each with the owner, because a remote
   version with no local file makes `db push` refuse outright.
3. **The rich example seed**, as its own seed file listed after `seed.sql` in
   `config.toml`'s seed paths so branch pushes pick up both. Built through the admin
   RPCs under impersonated admin claims (the pattern in
   `docs/runbooks/staging-test-data.md`): products of every type and lifecycle state,
   families with gamers, certified and uncertified gedus, groups with sessions and
   feedback. Fixed Stripe test-mode price ids (test mode is one shared account).
   Decide with the DB suite in view whether CI loads it *after* the DB tests, as a
   check that it still applies, rather than before them: the suite's whole-table claims
   are written against the minimal fixtures (`tests/CLAUDE.md`).
4. **The branch database script** under `scripts/`: `on`, `off`, `push`, `reset`, `list`.
   It is the only reader of `SUPABASE_ACCESS_TOKEN`. Constraints it must honour are
   under "Constraints" below. `on` writes the branch's URL and keys into the *worktree's*
   `.env.local` (keeping the staging values aside to restore on `off`); the dev server
   reloads env files on change.
5. **The flows.**
   - `/worktree-flow`: Phase 1 lists running branch databases; Phase 3 gains "if the
     change is schema-dependent, ask the owner whether to switch a database on"; Phase 5
     gains the synced-green landing for migration-bearing branches (decision 6), the
     restamp, and `off` in teardown after the tree kill.
   - `/cleanup-branches`: also deletes any Supabase preview branch whose git branch is
     gone, shown in the same confirmation table.
   - `/hotfix-to-main`: refuses a commit carrying a migration when `dev` holds an older
     unreleased migration, and says why.
   - A small restamp script: renames the migrations a branch adds relative to
     `origin/dev` to fresh timestamps, preserving their order.
6. **The tripwire.** In the full CI on `dev`: every migration added by a push sorts
   above every migration that was already there. It fires after the fact and exists to
   catch a landing that skipped the restamp.
7. **Rewrite `supabase/CLAUDE.md`** in the same change: the migration workflow becomes
   write → generate via the action → commit; "never amend a pushed migration" becomes
   "never amend a *landed* migration"; the whole "staging is shared, and migration
   numbers are contended" section is deleted; add the read-never-write rule and the
   never-create-a-database-unasked rule. Update the reference-data generators under
   `scripts/`, which hold migration file names as literals and tell the operator to pick
   "the next free number". Update the root `CLAUDE.md` Database tripwires to match.

## Acceptance criteria

- A migration written in a worktree reaches a green branch CI with regenerated types and
  **no connection to staging** at any point.
- Two branches each adding a migration land in either order with no renaming by hand and
  no edit to any history table; prod's plain `db push` applies both.
- A push to `dev` carrying a migration applies it to staging without anyone running a
  command.
- Hand-editing `database.types.ts` fails the full CI.
- "Switch the database on" yields a worktree dev server showing the rich seed's data
  within about two minutes; "off" leaves no preview branch on the staging project.
- Landing a branch whose database is still up deletes it.
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
- A hosted branch's schema dump matched CI's from-migrations dump byte for byte, so a
  branch database is a faithful stand-in for what CI builds.
- Supabase deletes a preview branch only when a PR closes, and `feat/*` branches have no
  PRs. Nothing pauses an idle branch. Every deletion is ours.
- Compute bills **by the started hour, per instance** ($0.01344 for Micro; documented for
  projects, assumed for branches). Off-then-on within an hour bills twice, so leaving one
  up over a short break is cheaper. A forgotten one costs about $0.32 a day.
- Creating the first branch leaves a default `main` entry in `branches list` for the
  staging project itself. It is the project, not an instance to delete.
- `SUPABASE_ACCESS_TOKEN` is org-scoped: the script must take the staging project ref
  explicitly and refuse any other, and must never delete a branch it did not name from a
  git branch.
- An in-place reset of a hosted branch database was not tried on the probe. If the CLI
  cannot do it, dropping and re-pushing is the fallback; recreating the instance is not.
- Whether mixed 5-digit and 14-digit versions sort as expected in the CLI was reasoned
  (leading zeros make text and numeric order agree), not run. Check with
  `db push --dry-run` against a branch database before step 5 ships.
- Merges into `dev` are local, with no PR and no required check, so every gate that must
  run *before* landing lives in `/worktree-flow`; CI on `dev` can only fire afterwards.
- The release pipeline holds Vercel's production promotion until CI's prod migration job
  succeeds, so a refused migration leaves prod on old code rather than new code on an old
  schema.
- GitHub Actions minutes for the generate runs have not been checked against the plan's
  allowance.

## Owner decisions and actions

- Add the two staging secrets to the repository (step 2).
- Resolve any staging history versions that have no file on `dev` (step 2).
- Anything in the rich seed that touches Stripe beyond fixed test-mode price ids.

## Follow-ups

Cut from this plan on purpose. Proposed to the owner by headline when the plan is
deleted; only the ones named are kept.

- **A generated per-object schema directory replacing `schema.sql`**, produced by the
  same action and compared by the same CI step. It makes two branches editing one
  function collide in git, and makes a clean merge the migrations do not reproduce fail
  CI: the lost-change half of the 2026-09-18 incident, which this plan does not fix.
- A shared Vercel preview for a schema-changing branch: the same "on", plus setting that
  git branch's Vercel preview env vars. Until then such a preview runs new code against
  staging's schema and its new parts break.
- Squash the migration history into a baseline, carrying the reference-data migrations
  and the bucket and cron rows explicitly; rewrite prose that cites migrations by number.
- Reset staging to clear its cosmetic drift.
- Read-only roles and a generated worktree env file, if the written rule is seen to fail.
