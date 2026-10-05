---
name: hotfix-to-main
description: Ship a fix to prod ahead of the next release — a hotfix branch off main, PR'd into main, then merged back into dev.
---

Ship a fix to `main` (prod) ahead of the next full release. The textbook hotfix: branch off
`main`, put the fix there, PR it into `main` as a merge commit, then merge `main` back into
`dev` so staging and the next release carry it too.

The fix arrives on the hotfix branch one of two ways — written fresh against `main`, or
cherry-picked from `dev` when it already landed there. Both end in the same back-merge; a
cherry-picked commit meets its `dev` original there as an identical change, which merges
cleanly.

## Step 1 — Inputs & preflight

1. Confirm we are in the Sogverse repo and on a clean working tree. If not clean: stop and tell the user. Do not stash.
2. `git fetch origin` (always — `origin/main` and `origin/dev` must be fresh).
3. The arguments are either a description of the fix to write, or the `dev` commits to ship (hashes, or descriptions clear enough to identify them). If it is unclear which, show `git log origin/main..origin/dev --no-merges --oneline` and ask.
4. For each `dev` commit to ship, check it is not already on `main` by content: `git cherry origin/main <sha>^..<sha>` — a `-` row means an equivalent change already landed; drop it from the list and tell the user.
5. **Refuse a migration that would strand an older one (mandatory gate).** When the hotfix adds a file under `supabase/migrations/`, compare its versions against the ones waiting on `dev`:

   ```
   git diff --name-only --diff-filter=A origin/main...origin/dev -- supabase/migrations/
   ```

   Take each file's version — the digits before the first `_` — and compare them as strings, which is how the CLI orders them. **Stop** when `dev` holds a version lower than the hotfix's highest, and that file is not part of the hotfix. Prod applies migrations in version order and refuses a version below one it has already applied, so the hotfix would apply the higher one and the next full release's `db push` would then refuse the older one still waiting on `dev` — a red release that only a renamed, landed migration can clear. Name the stranded file and let the user choose: bring its commit into the hotfix, or ship the full release instead. A fresh migration written on the hotfix branch must likewise be stamped above every version on `dev`.

## Step 2 — Branch & fix

1. `git checkout -b hotfix/<slug> origin/main` — slug from what it fixes (e.g. `hotfix/checkout-promo-codes`). If the branch exists, append `-2`, `-3`, etc.
2. Either write the fix and commit it, or cherry-pick the `dev` commits in **chronological order (oldest first)** in one command: `git cherry-pick <hash1> <hash2> ...`.
3. If a cherry-pick conflicts, **stop. Do not auto-resolve.** A hotfix conflict usually means the fix textually depends on `dev` commits you are not bringing along. Surface the conflicting commit and ask the user to choose:
   - **Include the dependency** — abort, add the missing commit(s) to the list, restart Step 2. The hotfix grows; make sure the user actually wants the dependency on prod.
   - **Resolve by hand** — only when the overlap is trivial and the resolution is obvious.
   - **Write it fresh** — abort the cherry-pick and write the fix against `main` on this branch instead.

## Step 3 — Verify (mandatory gate)

Run `npm run lint`, `npm run type-check`, and the tests covering the changed code (`npx vitest run <files>`). **Any failure is a hard stop — do not push.**

This gate is mandatory because the fix lands on `main`'s older codebase. A clean cherry-pick only proves there was no *textual* conflict; the commit can still depend semantically on something that exists only on `dev` (a helper added two commits earlier, a renamed type, a regenerated database type). CI on the PR is the backstop, but failures should be caught before anything is pushed.

## Step 4 — Push & open the PR

1. `git push -u origin hotfix/<slug>`.
2. Draft and show the user before opening:
   - **Title:** `Hotfix: <what it fixes/enables>`. Keep under 70 chars.
   - **Summary:** what the change does and why it can't wait for the next release, plus the cherry-picked `dev` hashes if any.
   - **Test plan:** CI green, plus 1-3 hand-verifiable items on prod after deploy.
   - **Merge note:** merge as a **merge commit**, then merge `main` back into `dev` (Step 5).
3. Open with `gh pr create --base main --head hotfix/<slug>`.

## Step 5 — Merge `main` back into `dev`

Once the hotfix PR has merged, bring it into `dev` with a merge commit of its own:

```bash
git checkout dev && git pull --ff-only && git fetch origin \
  && git merge --no-ff origin/main -m "Merge the <slug> hotfix into dev" && git push origin dev
```

`--no-ff` is load-bearing, not style: it gives `dev` a commit of its own even when `dev` has nothing `main` lacks. A fast-forward would put `main`'s exact commit on `dev`, and Vercel, which deduplicates deployments by commit SHA, can then build it as a `dev` preview and skip the production deployment. Never reset `dev` to `main`.

A conflict here is between the hotfix and work on `dev` that touched the same lines — resolve it as any merge, keeping both intents, and run the gates before pushing.

The hotfix branch needs no manual deletion afterwards — `/cleanup-branches` picks it up once its commits are on `dev`.

## Notes

- A multi-commit hotfix is supported but suspect — the more commits, the more likely one drags a semantic dependency along. If the list grows past 2-3, ask whether a full release (`/pr-dev-to-main`) is the better move.
- `/pr-dev-to-main` refuses to release while `main` carries a commit `dev` lacks, so a skipped back-merge is caught at the next release rather than shipped around.
