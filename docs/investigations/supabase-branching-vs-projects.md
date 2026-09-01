# Supabase branching vs. a separate staging project

Investigation record, 2026-08-20. **Nothing here is decided.** The org moved to the Pro
plan on 2026-08-20, which makes Supabase Branching available for the first time; this
doc records whether it could replace the separate staging project, what that would take,
and the order a cutover would go in if we do it. If the work is ever committed to, the
plan moves to `docs/plans/` and this file is deleted.

## Context: what the staging project does today

Two projects in the org: prod `sogverse` (Small compute) and `sogverse-staging` (Micro).
Staging is one shared mutable database carrying four jobs:

1. **Local dev target.** The plain `SUPABASE_*` keys in `.env.local` point at it; there is
   no local Supabase stack.
2. **Preview backend.** Every Vercel preview — the `dev` alias `sogverse-staging.sog.gg`
   *and* every feature-branch preview — hits the same database.
3. **Migration staging.** The documented workflow is "`db push` to staging, then
   `gen types` from it". CI's DB tests do **not** use it: they build an ephemeral local
   stack from `migrations/` + `seed.sql`.
4. **Accumulated test state.** Known test accounts, Stripe test-mode customers and
   subscriptions wired to test webhooks, product images in storage.

The team shape matters: **one human plus many Claude agents working in parallel
worktrees.** The problems `supabase/CLAUDE.md` documents as an occasional two-branches-
in-one-week collision are the steady state under that shape, and all of them come from
the database being shared:

- Two branches pick the same "next" migration number; the second push sees the version
  already in `schema_migrations` and **silently skips** the file.
- Once remote history holds a version whose file lives only on another unmerged branch,
  `db push` refuses, and the documented escape hatch is `psql -f` + `migration repair`
  — an agent hand-editing shared history.
- A migration lands before the code that calls it and breaks staging for everyone.
- Staging carries known drift that is tolerated because it cannot be reset.

## What branching is (verified 2026-08-20)

- A branch is a **separate instance** with its own Postgres, Auth, Storage, Realtime and
  API keys, inside the production project. It shares no compute with prod: branch
  compute is its own invoice line, and a load test on a branch cannot slow prod.
- **Persistent branches** are the intended staging replacement: never auto-paused or
  auto-deleted. **Ephemeral branches** are created per PR by the GitHub integration,
  receive migrations on every push to their git branch, and are deleted on merge/close.
- **Branching 2.0** made Git optional (dashboard, CLI, Management API all create
  branches); merging produces a pg-delta schema diff. We would stay on the Git workflow:
  `supabase/migrations` is the source of truth and CI already regenerates `schema.sql`
  from it.
- The pinned CLI (2.106.0) exposes the full shape:

  ```
  supabase branches create [flags] [<name>]
    --size        nano | micro | small | … | 48xlarge
    --region      eu-north-1, …
    --persistent
    --with-data   clone production data into the branch
    --git-branch  associate a git branch
  ```

- A new branch is built from `supabase/migrations` + `supabase/seed.sql` and **starts
  empty** unless `--with-data` is passed. `seed.sql` runs **once, at creation**, never
  again. A persistent branch then accumulates state the normal way, exactly like the
  staging project — minus drift, plus a reset button. Branches have no backups or PITR.
- `config.toml` already carries `[remotes.production]` / `[remotes.staging]` blocks with
  per-environment auth `site_url` — that is the mechanism branches use for per-branch
  config, so that half is done.
- Nothing in `src/` references the staging project id. The cutover surface is
  `.env.local`, Vercel env vars, Stripe test-mode webhook targets, and `config.toml`.

## Cost: a wash, not a saving

List prices: Micro ≈ $10/mo ($0.01344/hr), Small ≈ $15/mo; Pro includes $10/mo of
compute credits that apply to **project** compute only — **credits do not apply to branch
compute**.

| | compute | credit | paid |
|---|---|---|---|
| Today (Small prod + Micro staging) | $25 | −$10 | **$15/mo** |
| Drop staging project | $15 | −$10 | **$5/mo** |
| + persistent `staging` branch on Micro | +$9.70 | — | **≈ $15/mo** |
| + persistent `staging` branch on Small | +$15 | — | **≈ $20/mo** |

Ephemeral branches add $0.01344/hr ≈ **$0.32 per branch per day open** — an agent's
two-day worktree costs under a dollar; ten in flight is still small. The case for
branching is workflow isolation, not the invoice.

## Migration conflicts: moved to git, not removed

Branching changes *where* a conflict shows up — from the database (silent, shared) to git
(visible, per-PR) — and then it is on us to make git catch it.

1. **Same version number on two branches.** Each branch's database only knows its own
   file, so both work in isolation and the clash surfaces at the `dev` merge as two files
   with one prefix. Do not rely on the CLI rejecting that. Fix: **timestamp versions**
   (`supabase migration new` default; our 5-digit sequence is what makes two authors pick
   the same next number) plus **a PR check that every migration added by the branch is
   newer than the newest on the target branch** (~20 lines comparing filename prefixes).
2. **Out-of-order arrival.** `…198` authored Monday merges after `…199` authored Tuesday.
   `db push` by default skips migrations older than the last applied (`--include-all`
   exists for exactly that). Whether the branch deploy step runs include-all is
   **unverified**; the PR check above makes it moot because `198` cannot merge without
   being renamed newer than `199`.
3. **Semantic conflicts** — different numbers, same object. A dropped column that another
   migration references fails loudly (on `dev`'s branch and in CI's from-scratch build).
   Two `CREATE OR REPLACE` of the same function is last-writer-wins and silent; no tooling
   catches it. Mitigations: **re-sync the feature branch with `dev` before merge** so the
   ephemeral branch has run the combined set before `dev` does, and read CI's `schema.sql`
   regeneration diff on `dev` as the one place the merged *result* is visible as text.

What disappears outright: the silent skip, the "someone else's number is in the history
table" refusal, and the `psql` + `migration repair` pathway.

## What it would not fix

"Claude gets lost in outdated migration files" is already solved by `supabase/schema.sql`
and `src/types/database.types.ts` plus the rule to read those instead of migrations;
branching changes nothing in the repo. Indirect help only: live introspection of a branch
is trustworthy (it equals its git ref's migrations), and rebuilding every non-prod
environment from migrations makes **squashing** the history safe — which is the real fix
for the haystack. Prod would need one `migration repair` pass after a squash; it is the
one environment verified to match migration source exactly.

## Shape if we do it

- `main` → production (the project itself).
- `dev` → one **persistent** `staging` branch (Small to keep perf A/Bs comparable,
  `eu-north-1` — the default region may not be the parent's), serving
  `sogverse-staging.sog.gg` and local dev. Keeps its data between deploys; only ever
  receives migrations from `dev`. Stripe test-mode flows live here, since per-PR URLs
  cannot hold a stable webhook target (already true today).
- `feat/*` → one **ephemeral** branch per worktree, owned by its agent. `/worktree-flow`
  creates it (`branches create --git-branch feat/x --size micro --region eu-north-1`),
  writes its URL/keys into that worktree's `.env.local` (`branches get <name> -o env`),
  and deletes it at teardown. The agent pushes migrations and regenerates types against
  its own ref and cannot reach another agent's environment, `staging`, or prod.

Design in, rather than hope for:

- **Token blast radius.** `SUPABASE_ACCESS_TOKEN` is org-scoped; an agent that can create
  branches can reset or delete `staging`, and Supabase offers no per-branch protection we
  know of. Mitigation is the one used for `dev` in git: the skill does create/delete
  deterministically, and a hard rule in `supabase/CLAUDE.md` says agents touch only the
  branch named after their own worktree.
- **`seed.sql` becomes the product every agent previews against.** Today it is a minimal
  CI fixture set. A thin seed tempts hand-inserts per branch and makes every preview look
  different; a decent one (a few products of each type, a family with gamers, a verified
  gedu) pays for itself on the first review. It is the same file CI loads, so both gain.
- **`--with-data` is real but sensitive.** Cloning prod into the persistent branch would
  give it the real catalogue for free, but also real families' names, emails and
  children — staging would then be as sensitive as prod. Ephemeral branches stay
  seed-only regardless.
- **Permissions are project-scoped.** A branch lives inside the prod project, so dashboard
  access to staging is dashboard access to prod. Likely already the case at this team
  size; still a difference from two projects.

## Order, if committed to

Each step pays off even if the next is never taken.

1. Timestamp migration versions + the PR ordering check. Valuable on the two-project
   setup too.
2. Create the persistent `staging` branch tied to `dev`; seed it; point the `dev` preview
   alias and local dev at it. Keep the staging project alive alongside.
3. Run one full `feat/*` → `dev` → `main` cycle through it. Decide whether the CI deploy
   job's `db push` to prod or the integration's merge step applies prod migrations —
   keep exactly one.
4. Turn on per-worktree ephemeral branches, folded into `/worktree-flow`, once `seed.sql`
   is good enough that a fresh preview is worth opening.
5. Pause the staging project for a couple of weeks, then delete it. Then squash the
   migration history.

Rewrite `supabase/CLAUDE.md`'s workflow and "staging is shared" sections in the same
change as step 2; most of the contention section gets deleted.

## Still to verify in the dashboard before committing

- That `main` can be the production git branch while a persistent branch tracks `dev`
  (Branching 2.0 describes optional per-branch git sync; believed yes).
- Whether the branch deploy step applies out-of-order migrations (include-all semantics).
- How a persistent branch is reset in practice (dashboard action vs. delete-and-recreate).

Sources: [Branching docs](https://supabase.com/docs/guides/deployment/branching) ·
[Manage Branching usage](https://supabase.com/docs/guides/platform/manage-your-usage/branching) ·
[Introducing Branching 2.0](https://supabase.com/blog/branching-2-0) ·
[Branching without Git is now the default](https://supabase.com/blog/branching-without-git-is-now-the-default)
