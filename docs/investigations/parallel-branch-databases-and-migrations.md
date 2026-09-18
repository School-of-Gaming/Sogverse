# Databases and migrations across parallel branches

**Investigation. Nothing here is decided.** Research dates: 2026-08-20 (Supabase
Branching, after the org moved to the Pro plan), 2026-09-18 (the migration-ordering
incident, and a review of the owner's four proposals the same day). Claims marked
*verified* were checked on the date given; the rest is general knowledge or reasoning and
must be re-verified before anything is committed to. If a direction is chosen, it becomes
a `docs/plans/` plan and this file is deleted.

## The problem

The team is **one human plus many Claude agents in parallel worktrees**, and every
worktree shares one mutable staging database. There is no local Supabase stack on the
owner's machine; Docker runs only in CI. Staging (`sogverse-staging`, Micro, a separate
project from prod `sogverse`, Small) carries four jobs:

1. **Local dev target** for every worktree, through the keys in `.env.local`.
2. **Preview backend** for the `dev` alias and for every feature-branch Vercel preview.
3. **Migration staging**: `db push` there, then `gen types` from it. CI's DB tests do
   not use it; they build a stack from `migrations/` + `seed.sql`.
4. **Accumulated test state**: test accounts, Stripe test-mode customers and
   subscriptions wired to test webhooks, product images in storage.

What `supabase/CLAUDE.md` documents as an occasional collision is the steady state under
this shape: two branches pick the same next number and the second is silently skipped;
a version whose file lives on another unmerged branch makes `db push` refuse, and the
escape is `psql -f` plus `migration repair` against shared history; a migration lands
before its code and breaks staging for everyone; staging carries drift that cannot be
reset.

## The incident, 2026-09-15 to 09-18

| Date | What happened |
|---|---|
| 09-15 | The Fennoa export branch claims 00259 and 00263 on staging. The gedu-substitution branch claims 00260–00262 and 00264–00265 around them. |
| 09-17 | The Lynx partner-API branch, started later, claims 00266 and 00267, merges into `dev`, and is **released**: CI pushes both to prod. |
| 09-18 | The Fennoa branch merges into `dev`. Its 00259/00263 now sort below prod's latest. |

Two separate failures:

1. **The release would have refused the migrations.** Prod's CI job runs a plain
   `db push`, which does not apply a local version below the remote's latest without
   `--include-all` (flag *verified* on CLI 2.106.0; the refusal was not reproduced).
   Nothing compared a branch's versions against `dev` or `main` before the merge.
2. **One function silently lost a change.** 00263 and 00264 each replace the admin
   dashboard's read function from the body that predates the other. The later one wins
   and drops the earlier one's field, on staging and in every from-scratch build. Both
   files are valid and each branch's tests pass alone, so nothing detects it.

Corrected by hand: the two migrations were renamed 00268/00269, staging's history rows
moved, and staging's function replaced with a combined body. The gedu branch carries a
notice in its root `CLAUDE.md` listing what it owes before merging. Leftover: function
comments on staging still cite the old numbers.

## How it works today

- **Versions** are 5-digit sequential numbers, claimed at first push to staging and
  checked against its history table. That prevents duplicates and says nothing about
  ship order.
- **Staging** applies in *push* order across branches. **CI and `schema.sql`** build in
  *filename* order. **Prod** applies `main` in filename order, above its latest only.
- **`/hotfix-to-main`** does not mention migrations. A hotfix carrying one lands on prod
  ahead of `dev`: a second path to the out-of-order state.
- **Merges into `dev` are local `--no-ff` merges, then a push.** No PR, no required
  check, so a CI check on `dev` fires only after the merge has landed.
- **A failed prod migration step leaves prod on old code.** Vercel's Deployment Checks
  hold the production promotion until CI's deploy job reports (per the CI workflow's
  header and `docs/plans/CLAUDE.md`; the dashboard's check list was not inspected).

The CLI rules underneath:

1. A local file whose version is already in remote history counts as applied; its SQL
   never runs.
2. A remote version with no local file makes `db push` refuse outright.
3. A local version below the remote's latest is refused unless `--include-all`.
4. An applied migration never re-runs, even if edited.

## What ordering actually protects

**Order matters only between migrations where one builds on the other.** Such a
dependency is always ordered correctly by creation time, because a migration can only
build on one that existed when it was written.

**Migrations written in parallel cannot build on each other**, so a parallel pair is one
of two kinds:

- **Independent** (different tables and functions). They commute; any order gives the
  same schema.
- **Conflicting** (both replace one function). **No order is correct.** The last writer
  wins and discards the other's change. The right result is a third body combining
  both, which neither author wrote.

So ordering and conflict are separate hazards. A single enforced order buys one thing:
**every database applies the same sequence**, so whatever a conflicting pair does, it
does identically in CI, on staging, in `schema.sql` and on prod. Without it, a conflict
the detector misses can leave prod with a different last writer than `schema.sql`
records, which is silent drift in the one environment verified to match migration source.

**Residual risk either way:** data migrations (backfills, `UPDATE`s) can fail to commute
without touching the same schema object. Rare here, and invisible to any schema-level
detector.

## The decisions

Four decisions, largely independent. Each lists its options and the current lean.

### 1. Versions and ordering

**Timestamps replace the 5-digit sequence in every option worth considering.**
`supabase migration new` already names files `YYYYMMDDHHMMSS_name.sql`; same-number
collisions and the push-time history check disappear. Existing 00001–00269 keep their
names and sort first whether the CLI compares versions as text or numbers (to verify).
The reference-data generators under `scripts/` hold migration file names as literals and
tell the operator to pick "the next free number"; they change with this.

What remains is what happens when a branch is overtaken, which under parallel worktrees
is most landings that carry a migration:

- **A. Enforce "newer than the target's newest" at landing.** One order everywhere.
  The overtaken branch renames its files. On a *shared* staging that also means moving
  history rows by hand, which is the 09-18 correction repeated at every landing, and
  what earned this option the owner's read of "an annoying-to-follow patch". On
  *per-branch* databases (decision 3) the rename touches nothing shared: the branch's
  own database is about to be deleted, and staging only ever receives `dev`. The rename
  can then be a mechanical step of the landing flow rather than a rule someone follows.
- **B. `--include-all` on staging and prod.** Nothing to follow; independent migrations
  apply in arrival order. Safe only while parallel migrations commute, so it leans
  entirely on the conflict detector, and a miss lets prod diverge from `schema.sql`.

### 2. Conflict detection

Needed under A and B alike; neither touches the hazard that actually lost a change.

- **C. By object name.** List the functions, views, policies, constraints and triggers
  each side defines or replaces since the merge-base; fail when both touch one. Works on
  files alone, so it runs locally at landing. A heuristic: misses dynamic SQL and `DO`
  blocks, and "touching a table" is noisy (two branches adding different columns is
  normal, and a real clash there fails loudly in CI's build).
- **D. Exactly, by three-way schema merge.** Dump the merge-base, the branch, the target
  and the combined set; three-way merge the dumps as text; fail on a merge conflict or
  when the merged text differs from the combined dump. No parsing, no heuristics, and it
  is exactly the 00263/00264 case. Four database builds, so CI only. Depends on
  `pg_dump` ordering being stable (to verify), and flags both sides editing one comment.
- **E. One file per object** (Supabase declarative schemas, or repeatable migrations).
  Git itself raises the conflict. The structural fix, and a project of its own: 255
  migrations restate whole function bodies with guard and assertion blocks, the diff
  tool has known gaps (data changes; possibly grants, policies, comments), and most of
  `supabase/CLAUDE.md`'s authoring practice would change.

### 3. Where branch databases live: Supabase Branching

Facts, *verified 2026-08-20*:

- A branch is a **separate instance** (own Postgres, Auth, Storage, Realtime, keys)
  inside the production project. It shares no compute with prod.
- **Persistent** branches are never auto-paused or auto-deleted: the intended staging
  replacement. **Ephemeral** branches are disposable.
- The pinned CLI exposes `branches create` with `--size`, `--region`, `--persistent`,
  `--with-data` and `--git-branch`, and `branches get <name> -o env` prints a branch's
  URL and keys.
- A new branch is built from `supabase/migrations` + `supabase/seed.sql` and **starts
  empty** unless `--with-data`. `seed.sql` runs **once, at creation**. No backups, no
  PITR.
- `config.toml` already carries `[remotes.*]` blocks with per-environment auth settings,
  the mechanism branches use for per-branch config.
- Nothing in `src/` references the staging project id. The cutover surface is
  `.env.local`, Vercel env vars, Stripe test-mode webhook targets and `config.toml`.

**Cost is a wash.** Micro ≈ $10/mo ($0.01344/hr), Small ≈ $15/mo; Pro's $10 compute
credit applies to project compute only, not branches.

| | compute | credit | paid |
|---|---|---|---|
| Today (Small prod + Micro staging) | $25 | −$10 | **$15/mo** |
| Drop the staging project | $15 | −$10 | **$5/mo** |
| + persistent `staging` branch on Micro | +$9.70 | — | **≈ $15/mo** |
| + persistent `staging` branch on Small | +$15 | — | **≈ $20/mo** |

An ephemeral Micro branch costs **$0.01344 per hour it runs**: ≈ $0.11 for an eight-hour
working day, ≈ $0.32 if left up for 24 hours, ≈ $9.70 if forgotten for a month. The
budget is tight enough that the last figure is the one to design against. *Checked
2026-09-18:*

- **Preview branches no longer auto-pause when idle.** They did: in January 2025 the
  branching lead documented a pause after 5 minutes of inactivity with a wake on the
  next request. On 2026-08-11 the same engineer merged a docs change removing it as
  "outdated guidance", leaving deletion on PR merge or close as the only automatic
  lifecycle. The probe agrees: untouched for 11 minutes 36 seconds (no connections, no
  control-plane polling) its status read `ACTIVE_HEALTHY` and
  `pg_postmaster_start_time()` was unchanged from creation, so Postgres never stopped.
  What still says otherwise is stale: the branching troubleshooting page, an unused
  5-minute constant in the docs' shared config, and the "aren't automatically paused"
  wording on persistent branches.
- The pinned CLI has explicit **`branches pause` and `branches unpause`**.
- Supabase's billing docs count compute hours for active instances only. Whether a
  paused branch bills anything else (disk) is to measure.
- Branches are also billed for disk, egress and storage like their parent; a seed-sized
  branch stays inside the included quotas.
- `--size nano` is offered by the CLI; the branching docs price only Micro as the
  default. On paid orgs Nano is believed to bill at the Micro rate. To verify.

So a running branch bills until something deletes it, and Supabase deletes one only when
a PR closes, which `feat/*` branches do not have. The owner has ruled out a scheduled
cleanup job of our own as a pattern. What is left is to make forgetting impossible
rather than cleaned up after: **a branch database exists only while the owner has asked
for one** (see the proposal), and everything that can be done without one is. Deleting and recreating is sound by construction (state is
migrations + seed) and costs under a minute. `branches pause` exists but helps nothing
here: it needs the same knowledge of when work stopped that deletion does.

**The shape:**

- `main` → production (the project itself).
- `dev` → one **persistent** `staging` branch (Small, to keep perf comparisons honest;
  `eu-north-1`, since the default region may not be the parent's), serving
  `sogverse-staging.sog.gg`. It only ever receives migrations from `dev`. Stripe
  test-mode flows live here, since a per-branch URL cannot hold a stable webhook target.
- `feat/*` → one **ephemeral** branch per worktree, owned by its agent. `/worktree-flow`
  creates it where it copies `.env.local` today, writes the branch's URL and keys into
  the worktree's copy, and deletes it at teardown. There are no PRs for `feat/*`, so
  the GitHub integration's per-PR automation never fires; the flow owns the lifecycle.

What disappears outright: the silent skip, the "someone else's version is in the history
table" refusal, the `psql` + `migration repair` pathway, and most of the contention
section of `supabase/CLAUDE.md`. What does not: ordering and conflicts move from the
database (silent, shared) to git (visible, per-landing), and then it is on us to make
the landing gate catch them.

Design in, rather than hope for:

- **Token blast radius.** `SUPABASE_ACCESS_TOKEN` is org-scoped; an agent that can
  create branches can delete `staging`. The flow does create/delete deterministically,
  and a hard rule says an agent touches only the branch named after its own worktree.
- **Storage starts empty.** Migrations create buckets, but no seed can upload objects,
  so a fresh branch has no product images. Needs a fallback the UI already tolerates,
  or a copy step at branch creation.
- **Feature-branch Vercel previews** keep pointing at `staging` unless Supabase's Vercel
  integration rewrites preview env vars per branch (to verify). Until then a preview of
  a branch with migrations is only trustworthy locally.
- **`--with-data` is sensitive.** Cloning prod into `staging` brings real families'
  names, emails and children. Ephemeral branches stay seed-only regardless.
- **Permissions are project-scoped.** Dashboard access to `staging` is dashboard access
  to prod.
- **Squashing becomes safe** once every non-prod environment rebuilds from migrations.
  Prod needs one `migration repair` pass afterwards.

### 4. Seed data

Once branches are per-worktree, **the seed is the product every agent previews
against**. Findings, 2026-09-18:

- `supabase/seed.sql` is 265 lines: a handful of auth users, one gedu profile, two
  gamers with their parent links, one location, one feedback row. **No products.**
- It is also the DB suite's fixture set, and `tests/CLAUDE.md` calls it deliberately
  minimal: deterministic IDs and credentials mirror it, and tests scope their claims to
  it. Growing it changes what those tests run against.
- The generators under `scripts/` do not produce test data. They emit **reference-data
  migrations** (the location tree, postal codes), which every branch already gets from
  `migrations/`. There is nothing there to reuse for families or products.
- `docs/runbooks/staging-test-data.md` rules that product-shaped data is never
  hand-inserted; the admin RPCs are the only writers that keep the invariants. A seed
  can honour that by calling the same RPCs under impersonated admin claims, which also
  makes the seed fail loudly when an RPC's contract changes.
- Seeded products need Stripe price IDs. Test mode is one shared account, so fixed
  test-mode IDs work from any branch; webhooks still only reach `staging`.

Open: one seed file for CI and previews, or a second preview-only file listed in
`config.toml`'s seed paths (whether hosted branches honour that list is to verify). One
file keeps CI and previews identical; two keeps the fixture set minimal and the DB
suite's assumptions intact.

### The landing gate

Every check above is most useful *before* the branch lands on `dev`.

- **Local checks in `/worktree-flow`'s landing gates**, next to lint and the tests.
  Works for the ordering check and for C, both of which read files only. Not for D.
- **Require the branch's CI green on its last push.** Works for everything; costs a
  wait.
- **Merge into `dev` through PRs with required checks.** Strongest, and a process change.

A check that runs only on `dev` after the push still has value: `dev` goes red within
minutes and the release PR's required checks stop it before prod.

## Proposal, 2026-09-18

The researching session's proposal, made after the owner said existing workflows and
conventions are not constraints: design for one human landing the work of many parallel
agents, from the ground up. Not yet accepted. It supersedes the earlier leans (B + C in
the morning; restamp + C at midday), both of which worked around the current shape.

Three principles, each removing a class rather than policing it:

1. **No agent shares mutable state with another.** An agent's schema work needs no
   hosted database: CI builds what it needs from the branch's own migrations. `staging`
   and prod are written by CI from a git ref and by nothing else; agents read them and
   never write them. The one hosted database a feature ever gets is the disposable one
   the owner switches on to verify it.
2. **Every database is a pure function of a git ref** (migrations + seed). Anything can
   be thrown away and rebuilt, so nothing is repaired by hand.
3. **Conflicts surface in git as text**, where agents resolve them well, never in a
   database, where they are silent.

The design:

- **The only thing that costs money is a running branch database, and only a human
  verifying UI needs one, so the owner switches it on and off by saying so** (owner's
  ruling, 2026-09-18). Earlier drafts automated the lifetime (a nightly delete, a
  database per command, an hourly lease); all are dropped, because each is a system
  guessing when the owner needs something the owner can simply state. Everything else
  in the workflow is free and needs no hosted database at all.
  - *On:* the owner asks; Claude creates a branch of the **staging** project (not of
    prod: *proven 2026-09-18*, see the probe below), pushes the worktree's migrations
    and both seeds through the session pooler, and points the worktree's running dev
    server at it. After feedback that changes the schema, Claude pushes to the *running*
    database: a new migration is a plain push; an edited one is a reset of the
    database's contents followed by a push (half a minute). The instance, its keys and
    its billed hour stay the same. It is never deleted and recreated for this.
  - *Off:* the owner says so, or the feature lands: `/worktree-flow`'s teardown deletes
    the branch, and `/cleanup-branches` deletes any whose git branch is gone. Data
    entered while testing dies with it; the next one starts from the seeds.
  - *Never otherwise.* An agent does not create a branch database on its own
    initiative, including to verify its own work in a browser; it asks. This is a rule
    in `supabase/CLAUDE.md`.
  - *Visibility, not automation:* whenever a flow starts or lands, and whenever a
    database is switched on, Claude lists the branch databases that are up with their
    age and cost so far, so one left running is seen rather than guessed at.
  - Compute bills by the started hour per instance, so switching off and on again
    within the hour bills twice; leaving one up across a short break is the cheaper
    call, and it is the owner's.
  Prod's project never gains branches, a mistake is confined to the staging project,
  and staging needs no cutover: its URL, Vercel env vars and Stripe webhook targets
  stay as they are.
- **A manual GitHub Action is the generator.** A dedicated workflow, run on demand
  against a ref, does one job: start a bare database, apply that ref's migrations,
  produce the types and the schema directory, and upload them as an artifact. It runs
  no lint, no tests and no build, and it commits nothing. The agent triggers it, waits,
  downloads the artifact, and commits the files in its own feature commit, as the types
  are committed today. That replaces "push to staging, then regenerate" with no hosted
  database; it should take about two minutes; and the history carries no bot commits.
  One generator also means one `pg_dump` and one CLI version, so the generated files
  cannot differ by who produced them.
  - The action needs the ref on GitHub, and a pushed branch triggers the full CI. So
    the agent pushes the migration to a scratch ref the full CI ignores, generates
    from that, and deletes it. The real branch is pushed once, complete and green.
  - The full CI keeps the comparison: its DB job already builds from migrations, so
    requiring what it generates to equal what was committed costs nothing extra, and
    it is what catches a stale, hand-edited or wrongly merged generated file.
- **A shared Vercel preview is the same switch with one more step.** Vercel still deploys every
  pushed branch, and that deployment still points at staging. For a branch with no
  migration that is today's behaviour and is fine. For a schema-changing branch it runs
  new code against a schema that lacks the branch's migrations, so its new parts break.
  Sharing one with the team before a merge is rare (most team review happens on staging
  afterwards), so it is something the owner asks for: switch the branch's database on,
  set that git branch's Vercel preview env vars to it, redeploy, and print the URL and
  the cost (≈ $0.32 a day). Landing deletes the
  database and the env vars; `/cleanup-branches` catches one that was abandoned.
  Stripe webhooks do not reach it, and the branch's auth redirect URLs must admit the
  preview domain.
- **Worktrees read shared environments and never write them.** Reading staging or prod
  to fact-check a feature stays useful; every write goes to a seed file or a branch
  database. This is a written rule in `supabase/CLAUDE.md` and nothing more for now
  (owner's ruling, 2026-09-18): `.env.local` stays a copy. Enforcing it with read-only
  database roles and a generated worktree env file is a future improvement, to build
  only if the rule is seen to fail.
- **CI pushes `dev` to staging**, as it already pushes `main` to prod. The `db push`
  to staging leaves the agent workflow entirely.
- **An unlanded migration is mutable.** No shared database has applied it (CI builds
  from scratch every run, and a branch database resets in half a minute), so an agent
  edits the file instead of stacking fix-up migrations. Immutability starts at landing, which
  retires "never amend a pushed migration" for everything before that point.
- **Versions are timestamps, assigned at landing.** Landing is already serialized
  through one human, so it is a merge queue: sync with `dev`, restamp the branch's
  migrations to now (relative order kept), push, merge. Order equals landing order in
  every environment by construction. A tripwire in CI on `dev` asserts new versions
  exceed the previous maximum. `/hotfix-to-main` refuses a migration when an older
  unreleased one exists on `dev`.
- **Current state is a generated directory, one file per object, committed by the branch
  that changed it.** This replaces `schema.sql` and answers "how does an agent know the
  current schema when the history contradicts itself": it never reads the history.
  Migrations become write-only (written, applied, never consulted), and the state lives
  in `supabase/schema/`: a file per table holding the table with its indexes,
  constraints, policies, triggers, grants and comments; a file per function with its
  grants and comment; one for types. A script produces it by splitting `pg_dump` on the
  object headers the dump already carries. The manual action generates it from the
  *branch's* migrations in the same run as the types, the branch commits it, and it is
  never hand-edited, exactly like the types. Today's snapshot is generated only on `dev`,
  which is why it lags and is stale for whatever your own branch touched.
- **CI verifies instead of committing:** the same job requires what it generated to be
  identical to what the branch committed. The bot commit to `dev` (62 so far) goes
  away.
- **That check plus git is option D, exactly, for one build instead of four.** Two
  branches changing one object change one file, so git raises the conflict at sync; and
  a merge git resolves cleanly but the migrations do not reproduce (the 00263/00264
  shape: both hunks kept in the file, last writer's body in the database) fails the CI
  comparison. It covers every object class, needs no authoring change, no generator and
  no idempotent object files, which is why it replaces the one-file-per-function idea
  this proposal first carried. The rule for a conflict in a generated file: never edit
  it; write the migration that combines both changes, push, and commit what CI
  generates.
- **CI also regenerates the types from its from-migrations stack and diffs them against
  the committed file**, so the types cannot disagree with `migrations/` after a merge.
- **Landing requires the branch's CI green on the synced, restamped commit.** DB tests
  are CI-only and are not in the landing gates today; with this, the combined migration
  set is built and checked before `dev` sees it, without PRs.
- **Two seeds, and the second is a priority, not a follow-up.** `seed.sql` stays the
  minimal fixture set the DB tests are written against. A rich example seed is what
  previews run on: it builds a detailed, realistic catalogue through the admin RPCs
  (products of every type and state, families with gamers, certified and uncertified
  gedus, groups with sessions), switching a database on applies it (and uploads a few
  images), and CI applies it after the DB tests to prove it still runs. It ships with
  the first step, because without it a preview is an empty app.

**The probe, 2026-09-18.** A preview branch was created on the staging project from the
CLI (Micro, `eu-north-1`), with no GitHub integration involved:

- Creation took about ten seconds. **The branch starts empty**: without the integration
  nothing feeds it migrations, so the script pushes them itself.
- `db push --db-url … --include-seed` applied all 255 migrations and `seed.sql` in
  **32 seconds**, including the seed's direct inserts into the auth schema and the
  35,857 reference locations. 56 tables, 134 functions, 59 MB.
- **The push must go through the session pooler (port 5432).** Through the transaction
  pooler (6543, the URL `branches get -o env` hands out) it recorded eleven versions as
  applied while creating no tables, then failed on the twelfth. The direct database
  host does not resolve from the owner's machine (IPv6 only).
- **A dump of the hosted branch, taken with CI's flags, matched the committed snapshot
  byte for byte across 16,320 lines**, apart from the `pg_dump` version header (18.2
  locally, 17.6 in CI; the script strips that line) and comments citing the migrations
  renumbered that morning, which CI had not yet regenerated. A branch-generated
  snapshot and a CI-generated one are therefore comparable as plain text.
- The branch's control-plane status is readable without touching its database.
- Creating the first branch enables Branching on the project, which leaves a default
  `main` entry in `branches list` for the staging project itself. It is the project,
  not an extra instance. The probe ran for 40 minutes (under one cent) and was deleted.

**Work done directly on `dev`** (small changes that skip `/worktree-flow`) stays
workable. Without a migration nothing changes. With one, the generated files come from
the same manual action and scratch ref, then `dev` is pushed once, green. The version is stamped at commit, which *is* landing,
so order holds; if the push is rejected because `dev` moved, rebase and restamp. What
such a change skips is review, exactly as today; the release PR's required checks still
stand between it and prod.

**The existing 00001–00269 keep their names.** Timestamps sort after them, so nothing is
renamed; renaming applied history buys nothing and costs a history rewrite on prod.
They leave by **squash**, last, once every non-prod database rebuilds from git: one
baseline migration replaces them, prod and staging get one `migration repair` pass (no
SQL runs), and the proof is that CI's from-migrations dump is byte-identical before and
after. Two cautions: a schema-only squash drops data, so the reference-data migrations
(location tree, postal codes) and the rows that define buckets and cron jobs must be
carried over explicitly; and prose across the repo that cites migrations by number
needs rewriting to state its rule without the number. The squash also cuts
branch-creation time, which is paid on every recreate.

Rejected for the proposal: branches under the prod project (couples agents to prod for
no gain once staging stays a project); `--include-all` (gives up one order everywhere);
authored declarative schemas with generated migrations, Supabase's or our own (the diff
tool needs a local Docker shadow database this machine does not have, its gaps sit on
this repo's grant and revoke regime, and agents write deltas well; what was missing was
a trustworthy view of state, which the generated directory gives without inverting
authorship); `--with-data` (makes a database depend on something other than git);
pausing branches rather than deleting them (rests cost on knowing when work stopped).

## Order, if committed to

Assumes `feat/gedu-substitution`, the last branch under the old numbering with
migrations already on staging, has merged into `dev` before any of this starts (owner's
commitment, 2026-09-18).

Each step pays off even if the next is never taken.

1. The manual generate action (types now, the schema directory in step 4); the on/off branch
   database with its deletion in `/worktree-flow` and `/cleanup-branches`; the rich
   example seed. Agents stop pushing to staging, which ends every shared-staging
   collision at once.
2. CI pushes `dev` to staging; staging's credentials leave `.env.local`; rewrite
   `supabase/CLAUDE.md`'s workflow and delete its contention section.
3. Timestamps assigned at landing, the CI-green landing gate, the tripwire, the hotfix
   rule.
4. The generated schema directory replaces `schema.sql`: the split script, generation
   beside the types, CI verifying instead of committing.
5. The opt-in shared Vercel preview command.
6. Squash the migration history; reset staging to clear its drift.

## What would change the answer

- **Branching not being available on the staging project** puts worktree branches under
  prod, and brings back the persistent-`staging`-branch cutover described in decision 3.
- **Staying on shared staging** makes assigning versions at landing expensive (history
  rows move by hand each time) and favours B + C instead.
- **Branch-generated and CI-generated dumps diverging** (a `pg_dump` major-version
  difference that reaches past the header, or a hosted-only object in `public`) moves
  generation into CI as an artifact the branch downloads and commits.
- **Landing ever becoming concurrent** (a second human, or agents merging unattended)
  turns the landing sequence into something that needs a real merge queue or PRs.
- **Hotfixes carrying migrations becoming routine** makes the refusal rule a nuisance;
  prod's push would take `--include-all` as the exception path instead.

## To verify before committing to anything

- On a scratch database with `db push --dry-run`: the refusal's error text,
  `--include-all`, and that mixed 5- and 14-digit versions sort as expected.
- That Vercel's per-git-branch preview env vars can be set from a script, for the
  opt-in shared preview.
- How branch compute hours are counted, by reading the usage page after a few uses:
  that a part hour bills in full as documented for projects, and whether the buckets
  are clock hours or run from the branch's creation.
- GitHub Actions minutes: what the generate runs cost against the plan's allowance.
- That the contents of a running branch database can be reset in place from the CLI
  (not tried on the probe), and that `gen types` against CI's local stack matches what
  the hosted database produced.
- That `pg_dump`'s per-object headers split cleanly into files for every object class
  in the snapshot, and that the split is stable when an unrelated object is added.
- That `gen types --local` output in CI matches the hosted output byte for byte.
- That `main` can be the production git branch while a persistent branch tracks `dev`.
- Whether the branch deploy step applies out-of-order migrations.
- How a persistent branch is reset (dashboard action or delete-and-recreate), and
  whether a CLI-created branch with `--git-branch` receives migrations on push or the
  agent runs `db push` against its ref.
- Nano's price on a paid org.
- Whether Supabase's Vercel integration sets per-branch preview env vars.
- What else assumes 5-digit names: the reference-data generators, and prose across the
  repo that cites migrations by number.

Sources: [Branching docs](https://supabase.com/docs/guides/deployment/branching) ·
[Manage Branching usage](https://supabase.com/docs/guides/platform/manage-your-usage/branching) ·
[Introducing Branching 2.0](https://supabase.com/blog/branching-2-0) ·
[Branching without Git is now the default](https://supabase.com/blog/branching-without-git-is-now-the-default) ·
[docs PR documenting the 5-minute auto-pause, 2025-01](https://github.com/supabase/supabase/pull/32854) ·
[docs PR removing it as outdated, 2026-08](https://github.com/supabase/supabase/pull/48744) ·
[docs PR on branches as clones of the base project, 2026-08](https://github.com/supabase/supabase/pull/49594)
