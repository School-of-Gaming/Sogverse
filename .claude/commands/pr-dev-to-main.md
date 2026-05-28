---
name: pr-dev-to-main
description: Open a clean dev → main release PR that sidesteps squash-merge phantom conflicts.
---

Open a dev → main release PR. Do not just push `dev` to a PR — feature branches get squash-merged directly to `main`, which leaves `dev` and `main` with the same content under different commit hashes. A naive `dev` → `main` PR then drags 60+ duplicate commits into a 3-way merge and produces phantom conflicts on files that are actually identical. Avoid this by cherry-picking only the genuinely-new commits onto a fresh release branch off `origin/main`.

## Step 1 — Preflight

1. Confirm we are in the Sogverse repo and on a clean working tree. If not clean: stop and tell the user. Do not stash.
2. `git fetch origin` (always — `origin/main` and `origin/dev` must be fresh).
3. Read `origin/dev` and `origin/main`, not local `dev` / `main`. Local branches may be stale.

## Step 2 — Identify the genuinely-new commits

Squash merges create commits on `main` whose *subjects* match commits on `dev` but whose *hashes* do not. Filter them out by subject.

```bash
git log origin/main..origin/dev --no-merges --format=%H%x09%s > /tmp/dev-commits.txt
git log origin/dev..origin/main --no-merges --format=%s | sort -u > /tmp/main-subjects.txt
```

Walk `/tmp/dev-commits.txt` in **chronological order (oldest first — reverse the log output)** and keep only rows whose subject is NOT in `/tmp/main-subjects.txt`. That is the cherry-pick list.

Sanity check the count:
- If the list is empty → tell the user "nothing to release" and stop.
- If the list is suspiciously large (e.g. >40 commits) → something is off; show the user the list and ask before proceeding.
- Print `git diff origin/main..origin/dev --shortstat` — the file/line totals should roughly match what the cherry-pick will produce. If they don't, flag it.

## Step 3 — Build the release branch

1. `git checkout -b release/$(date +%Y-%m-%d) origin/main` (if a branch with that name already exists, append `-2`, `-3`, etc.).
2. Cherry-pick the filtered commits in chronological order: `git cherry-pick <hash1> <hash2> ...` in one command. If they're truly duplicates of squash-merged work, they should apply cleanly. If conflicts appear:
   - **Stop.** Do not auto-resolve. Tell the user which commit conflicted and ask whether to skip it (likely already on main via squash) or to resolve manually.
   - Common cause: a feature was partially squashed to main; the cherry-picked commit overlaps with a later squash. Usually safe to `git cherry-pick --skip`.
3. After cherry-pick completes, run `npm run type-check`. If it fails, stop and surface the errors — do not push a broken branch.
4. `git push -u origin release/YYYY-MM-DD`.

## Step 4 — Draft the PR

Draft the title and summary from the cherry-picked commits:
- **Title:** `Release YYYY-MM-DD: <2-3 themes>` derived from the commits. Keep under 70 chars.
- **Summary:** bullet list grouped by theme — Sessions/Sorg/admin/etc. — drawing language directly from commit subjects, not invented.
- **Test plan:** checklist tied to the themes (CI green, plus 2-4 hand-verifiable items based on what changed).
- **Post-merge block:** include the dev-reset command verbatim so the user runs it after merging:

  ```
  git checkout dev && git fetch origin && git reset --hard origin/main && git push --force-with-lease origin dev
  ```

Show the user the drafted title + body before opening the PR. Let them edit. Then open with `gh pr create --base main --head release/YYYY-MM-DD`.

If a prior open dev → main PR exists (e.g. someone pushed `dev` directly), close it with a comment pointing at the new PR.

## Step 5 — Remind about dev reset

After the PR URL is returned, tell the user: **"When this PR merges, reset `dev` to `main` so the next release doesn't drift. Run the post-merge command in the PR body, then `/cleanup-branches` to drop the merged `release/YYYY-MM-DD` branch."** Do not perform the reset now — it is destructive to `dev` and must wait until merge.

This command does not delete the release branch itself — `/cleanup-branches`'s cherry-by-content check picks it up automatically once `dev` has been reset to `main`.

## Notes

- This command is read-mostly until Step 3. The release branch and PR are the only writes. No force-pushes to `dev` or `main` ever happen here.
- If the user wants the *real* `dev` branch pushed to a PR instead (e.g. they specifically want the merge-commit history preserved on `main`), they should say so — this command intentionally does not do that.
- The squash-twin filter is by subject, not by content. If two genuinely-different commits happen to share a subject across `main` and `dev`, the filter will drop the dev one. Unlikely but possible — eyeball the cherry-pick list before running.
