# Migration ordering across parallel branches

**Investigation, 2026-09-18. Nothing here is decided.** Prompted by an incident where two
parallel branches' migrations broke staging's admin dashboard and would have failed the
next release's migration step. Claims marked *verified* were checked on this date; the
rest are general knowledge or reasoning and must be re-verified before anything is
committed to. If a direction is chosen, it becomes a `docs/plans/` plan and this file is
deleted.

## The incident

| Date | What happened |
|---|---|
| 09-15 | The Fennoa export branch claims 00259 and 00263 on staging. The gedu-substitution branch claims 00260–00262 and 00264–00265 around them. |
| 09-17 | The Lynx partner-API branch, started later, claims 00266 and 00267, merges into `dev`, and is **released**: CI pushes both to prod. |
| 09-18 | The Fennoa branch merges into `dev`. Its 00259/00263 now sort below prod's latest. |

Two separate failures came out of it:

1. **The release would have refused the migrations.** Prod's CI job runs a plain
   `supabase db push`, and the CLI does not apply a local migration numbered below the
   remote's latest applied version without `--include-all` (flag *verified* on CLI
   2.106.0, the version CI pins; the refusal itself was not reproduced). Nothing flagged
   it before the release: no check compares migration numbers against `dev` or `main`,
   and no rule says a branch must merge above `dev`'s highest. `supabase/CLAUDE.md`'s
   line that a collision "resolves itself when both branches land on `dev`" is about
   staging's history, and was misread at the merge as covering this.
2. **One function silently lost a change.** 00263 (Fennoa) and 00264 (gedu) both replace
   the admin dashboard's read function, each starting from the body that predates the
   other. Staging applied 00264 last, which dropped 00263's new field, and `dev`'s code
   failed to parse the dashboard. Every from-scratch build (CI, prod) would do the same
   once both land, because 00264 sorts after 00263. Nothing detects this: both files
   are valid, and each branch's tests pass on its own.

**Manual correction, 09-18:** `dev`'s two migrations were renamed 00268/00269 (same SQL,
number references updated), and staging's history rows were moved to the new versions.
Staging's dashboard function was replaced by hand with a combined body. The gedu branch
carries a notice at the top of its root `CLAUDE.md` listing what it owes before merging.
Known leftover: on staging, the database comments on functions these migrations touched
still cite the old numbers, since only the history rows moved.

## How it works today

- **Versions** are 5-digit sequential numbers, claimed when a branch first pushes to the
  one shared staging database. The claim is checked against staging's history table at
  push time. That check prevents two branches taking the same number and says nothing
  about the order they will ship in.
- **Staging** receives each branch's migrations on push, so it applies them in *push*
  order across branches.
- **CI's DB tests and `supabase/schema.sql`** build a fresh database from `migrations/`
  in *filename* order.
- **Prod** receives `main` through CI's plain `db push` after a release merges, so it
  applies in filename order, restricted to versions above its latest.
- **`/hotfix-to-main`** does not mention migrations. A hotfix carrying one lands on prod
  ahead of `dev`, a second path to the same out-of-order state.
- **Merges into `dev` are local `--no-ff` merges, then a push.** There is no PR and no
  required check, so any CI check on `dev` fires only after the merge has landed. This
  constrains every option below.

The CLI rules underneath, which the options below build on:

1. A local file whose version is already in the remote's history counts as applied, and
   its SQL never runs.
2. A remote version with no local file makes `db push` refuse outright. This is the
   staging problem that the psql plus `migration repair` pathway in `supabase/CLAUDE.md`
   works around.
3. A local version below the remote's latest is skipped with an error unless
   `--include-all` is passed.
4. An applied migration never re-runs, even if edited.

## What ordering actually protects

This is the core of the question, and the answer decides between the options.

**Order matters only between migrations where one builds on the other**: it alters a
table the other created, or calls a function the other defined. Such a dependency is
always ordered correctly by *creation time*, because a migration can only build on one
that existed when it was written. A version derived from creation time (a timestamp)
keeps that ordering with no rule at all.

**Migrations written in parallel cannot build on each other.** Each branch cannot see the
other's. So a pair of parallel migrations is one of two kinds:

- **Independent** (Fennoa's and Lynx's touched different tables and functions). They
  commute: any order produces the same schema. The prod refusal protects nothing here.
- **Conflicting** (00263/00264: both replace one function). **No order is correct.**
  Whichever runs last wins and discards the other's change. The right result is a third
  body combining both, which neither author wrote. Strict ordering cannot fix this:
  renumbering 00264 above 00269 still runs it after the Fennoa change and still drops the
  field.

So strict linear ordering buys one thing: **prod applies in the order CI tested.** That
only matters for a conflicting pair, which is a defect whichever order it runs in. The
real hazard is conflict, and nothing detects it today.

**Residual risk, whatever is chosen:** data migrations (backfills, `UPDATE`s) can fail to
commute without touching the same schema object. For example, one branch backfills a
column from a table whose meaning another branch changes. Neither schema comparison nor
object matching sees that. Such migrations are rare here, but it is the case that would
most weaken "order doesn't matter".

## Options

The options are not exclusive. The ordering choice (A or B) and the conflict detection
(C, D or E) are separate decisions.

### A. Keep sequential numbers and enforce "merge above the target's highest"

Written rule, plus a check that every migration a branch adds is newer than the newest
on its target. This is the Django/Atlas approach, and the fix
`supabase-branching-vs-projects.md` already proposed. Prod order equals tested order.

Against: every overtaken branch renumbers by hand *and* rewrites staging's history rows,
which is exactly today's correction repeated whenever branches run in parallel, and
parallel worktrees are the normal way work happens here. The check must run before the
local merge to be useful (see the merge gate below). It does nothing about conflicts.
The owner's read: "an annoying-to-follow patch rather than a cleanly enforced system."

### B. Timestamp versions plus `--include-all` (the Rails/Liquibase model)

`supabase migration new` already names files `YYYYMMDDHHMMSS_name.sql`. Timestamps end
same-number collisions and the push-time history check. `--include-all` on prod (and on
staging) applies independent migrations in whatever order they arrive. There is nothing
for anyone to follow. Existing 00001–00269 keep their names, and timestamps sort after
them, whether the CLI compares versions as text or as numbers (the leading zeros make
both agree; to verify).

Against: prod may apply in a different order than CI tested, which is safe only if
parallel migrations commute, so B leans on a conflict detector. CLI rule 2 (a remote
version with no local file) still refuses on staging. It does nothing about conflicts
by itself.

### C. Detect conflicting parallel migrations by object name

List the objects each side defines or replaces since the merge-base: functions, views,
policies, named constraints, triggers. Fail if both sides touch the same one: "both
branches replace X; add a migration combining them." It works on migration files alone,
so **it can run locally in the merge gate** with no database.

Against: it is a heuristic. It misses dynamic SQL and objects changed inside `DO`
blocks, and deciding what counts as "touching" a table is noisy (two branches adding
different columns to one table is normal and harmless; those clash loudly in CI's
from-scratch build if they conflict).

### D. Detect conflicts exactly, by merging the schema three ways

Build four schema dumps: the merge-base (S0), the branch (S1), the target (S2), and all
migrations combined (S12). Three-way merge S1 and S2 over S0 as text (as `git
merge-file` does). **Fail if the merge conflicts, or if the merged text differs from
S12.** The second condition is exactly "the combined migrations do not produce both
sides' changes", which is the 00263/00264 case: the text merge keeps both hunks, while
S12 has only the last writer's body. It needs no parsing and has no heuristics.

Against: four database builds per run, so CI only, which means it cannot sit in a local
merge gate without a change to how `dev` merges happen. It depends on `pg_dump` output
being stable and ordered by name (to verify: dependency ordering can move objects). It
also flags a real but benign case: both sides editing one function's comment.

### E. Keep definitions in one file per object

Supabase's declarative schema files (a schema directory as the source of truth,
migrations generated by `supabase db diff`), or Flyway-style repeatable migrations. Two
branches editing one function edit one file, and git itself raises the conflict. This is
the structural fix for the conflict hazard.

Against: a large migration for a repo whose 269 migrations each restate whole function
bodies with guard and assertion blocks. The diff tool's known gaps (data changes, and
possibly grants, policies and comments) need research, and much of `supabase/CLAUDE.md`'s
authoring practice would change.

### F. Per-branch databases (Supabase Branching)

Covered in `supabase-branching-vs-projects.md`. It removes staging contention (CLI rules
1 and 2 in the shared database) but not ordering or conflicts, which move to git.

## The merge gate, whichever option is chosen

Every check above is most useful *before* the branch lands on `dev`, and today that
merge is a local command with no PR. Three ways to close it:

- **Local checks** in `/worktree-flow`'s landing gates, next to lint and the tests.
  Works for A and C; not for D, since there is no local Postgres on the owner's machine.
- **Require the branch's CI to be green on its last push** before the local merge.
  Works for everything; costs a wait at landing.
- **Merge into `dev` through PRs with required checks.** The strongest option, and a
  process change.

A check that runs only on `dev` after the push still has value: it turns `dev` red within
minutes, and the release PR's required checks stop it before prod. It just fires after
the fact.

## Current lean

This is the researching session's lean, not the owner's. The owner has deliberately not
committed to a direction.

**B + C now, with D as a later upgrade in CI.** B removes the ordering rule entirely,
since strict ordering protects nothing a creation-time version does not. C covers the one
hazard that actually loses changes, runs locally, and costs little. D is the exact form
of C if C's false positives or misses prove costly. E is the principled end state but a
project of its own. A is the smallest change but keeps the manual renumber and history
surgery as a recurring cost.

What would change the answer:
- **Data migrations becoming common** weakens B (commuting is no longer mostly true),
  and favours A's single order.
- **Adopting Branching (F)** removes staging's history surgery, which makes A's
  renumbering cheaper.
- **Merges into `dev` moving to PRs** makes D practical as the only detector.
- **The CLI or `--include-all` behaving differently than described** changes B. Verify
  first.

## To verify before committing to anything

- Reproduce the refusal and `--include-all` on a scratch database with `db push
  --dry-run`: the error text, and whether mixed 5- and 14-digit versions sort as
  expected.
- Whether Vercel's production promotion is gated on the migrations job. The answer
  decides whether a failed migration step leaves prod on old code or runs new code
  against the old schema.
- For C, run the detector over the repo's history (every pair of branches merged into
  `dev` with overlapping lifetimes) to measure hits and false positives.
- For D, whether `pg_dump`'s ordering is stable enough to diff as text, and what the
  extra builds cost in CI minutes.
- For E, the declarative diff tool's current gaps.
- What else assumes 5-digit sequential names: the seed generators under `scripts/` pick
  "the next free migration number", and prose across the repo cites migrations by
  number.
