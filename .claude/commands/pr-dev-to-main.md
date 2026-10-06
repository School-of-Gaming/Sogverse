---
name: pr-dev-to-main
description: Open the dev → main release PR, merged as a merge commit.
---

Open a dev → main release PR. `dev` is staging and `main` is prod; a release is one PR from
`dev` into `main`, merged as a merge commit, and nothing happens to `dev` afterwards. `main`
collects one release merge commit per release that `dev` never gets — that is normal, and
the next release PR merges cleanly over it. (`main`'s branch protection deliberately does
not require the branch to be up to date: CI on the PR already tests the merged result.)

**Never reset or force-push `dev` to `main`.** Vercel deduplicates deployments by commit
SHA, so pushing `main`'s merge commit to `dev` before Vercel has picked up the `main` push
builds it as a `dev` preview and skips the production deployment — the 2026-10-05 release
shipped its migrations to prod with no app deploy that way. For the same reason `main` is
never fast-forwarded to a commit `dev` already holds.

## Step 1 — Preflight

1. Confirm we are in the Sogverse repo and on a clean working tree. If not clean: stop and tell the user. Do not stash.
2. `git fetch origin` (always — `origin/main` and `origin/dev` must be fresh).
3. Read `origin/dev` and `origin/main`, not local `dev` / `main`. Local branches may be stale.

## Step 2 — Check the release set

```bash
git log origin/main..origin/dev --no-merges --format=%H%x09%s
```

- **Empty** → tell the user "nothing to release" and stop.
- **`main` carries no work `dev` lacks** — `git log origin/dev..origin/main --no-merges --oneline` must be empty. A row here is a hotfix that was never merged back into `dev`; stop and have it merged back (`/hotfix-to-main`'s last step) before releasing, or the release would ship `dev` without it.
- **Check for dragged-in history** — the failure worth catching here is history that arrived from outside this release cycle (an old branch merged in late, a wrong base). Its signature is a *date* older than the previous release, not a large count:

  ```bash
  git log origin/main -1 --format=%cd --date=short                    # previous release point
  git log origin/main..origin/dev --no-merges --format=%cd --date=short | sort -u
  ```

  Read the *commit* date (`%cd`), never the author date (`%ad`): a rebase keeps each commit's author date, so a feature branch begun before the last release and rebased onto `dev` after it shows old author dates while being legitimately new work. Every commit in the release set should date on or after the previous release. Anything older is the signal to stop and show the user the list. **Volume is not that signal** — a busy few days here is legitimately 150+ commits, and a count threshold fires on every healthy release until it gets reflexively waved through, which is worse than no check at all.
- Print `git diff origin/main..origin/dev --shortstat` — the file/line totals should roughly match what the PR will produce. If they don't, flag it.
- Print `git diff origin/main..origin/dev --name-only --diff-filter=A -- supabase/migrations/` — the schema surface, carried to Step 3.
- Print `git diff origin/main..origin/dev --name-only -- scripts/register-discord-command.ts` — non-empty means the release changes the Discord bot's commands, which live on each Discord app separately and reach prod's only by hand. Carried to Step 3.
- Verify the merge is clean: `git merge-tree --write-tree origin/main origin/dev | grep -i conflict || echo "clean"`. Any conflict output is a surprise worth stopping on; show the user before drafting anything.

## Step 3 — Draft and open the PR

Draft the title and summary from the release commits:
- **Title:** `Release YYYY-MM-DD: <2-3 themes>` derived from the commits. Keep under 70 chars.
- **Summary:** bullet list grouped by theme — Sessions/Sorg/admin/etc. — drawing language directly from commit subjects, not invented.
- **Schema surface:** state the migrations the release carries, from the Step 2 listing — the numeric range and count, or "no migrations in this release" when there are none. Migrations are the least reversible thing a release ships, so the body names them every time rather than leaving it to whoever happens to be drafting to remember.
- **Test plan:** checklist tied to the themes (CI green, plus 2-4 hand-verifiable items based on what changed). Include a migrations line whenever the release carries any, and, when it changes the bot's commands, a post-merge line: run `npx tsx scripts/register-discord-command.ts --production`.
- **Merge note:** merge as a merge commit, not squash or rebase, and leave `dev` alone afterwards.

**Open the PR without asking** — `gh pr create --base main --head dev`. Running this command *is* the instruction to open it, and a PR is cheap to edit or close, so a confirmation step here buys nothing and costs a round trip. Show the drafted title + body alongside the returned URL rather than ahead of it; the user edits on GitHub, or tells you what to change and you push the edit with `gh pr edit`.

The one thing that earns a pause is a finding that would change the user's mind about opening it at all — and every such finding already has its own stop above: a dirty tree, an unmerged-back hotfix, history predating the last release, a shortstat that doesn't match, a conflict from the merge probe. Anything the checks pass is a clean release: draft it and open it. If something *else* surprises you — a check that passes but reads wrong — say so in the same message as the URL rather than holding the PR hostage to it.

If a prior open dev → main PR exists, close it with a comment pointing at the new PR.

## Notes

- This command changes nothing locally (the `merge-tree --write-tree` probe only adds unreferenced objects, which get collected); the PR is its only lasting effect.
- Shipping a *subset* of `dev` to `main` is a hotfix — `/hotfix-to-main`.
