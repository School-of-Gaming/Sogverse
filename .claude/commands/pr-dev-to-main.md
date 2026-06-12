---
name: pr-dev-to-main
description: Open a clean dev → main release PR that sidesteps squash-merge phantom conflicts.
---

Open a dev → main release PR. The default case is easy: `dev` is strictly ahead of `main`, so a direct merge-commit PR is clean. The release-branch machinery exists only for the *divergent* case — when `main` carries commits whose content duplicates `dev`'s under different hashes (squash/rebase "twins", left behind by a hotfix or a release where the post-merge `dev` reset was skipped). A naive `dev` → `main` PR against twins drags duplicate commits into a 3-way merge and produces phantom conflicts on files that are actually identical. So: detect divergence first, take the simple path when there is none, and cherry-pick onto a fresh release branch only when there is.

## Step 1 — Preflight

1. Confirm we are in the Sogverse repo and on a clean working tree. If not clean: stop and tell the user. Do not stash.
2. `git fetch origin` (always — `origin/main` and `origin/dev` must be fresh).
3. Read `origin/dev` and `origin/main`, not local `dev` / `main`. Local branches may be stale.

## Step 2 — Classify: divergent or not

Compute the candidate release set and the divergence signal:

```bash
git log origin/main..origin/dev --no-merges --format=%H%x09%s > /tmp/dev-commits.txt
git log origin/dev..origin/main --no-merges --format=%s | sort -u > /tmp/main-subjects.txt
```

Sanity check the dev-side set first:
- If `/tmp/dev-commits.txt` is empty → tell the user "nothing to release" and stop.
- If it is suspiciously large (e.g. >40 commits) → something is off; show the user the list and ask before proceeding.
- Print `git diff origin/main..origin/dev --shortstat` — the file/line totals should roughly match what the PR will produce. If they don't, flag it.

Then pick the path by the divergence signal:
- **`/tmp/main-subjects.txt` is EMPTY** → no non-merge commit on `main` that `dev` lacks → no twins possible → **Simple path (Step 3A)**.
- **`/tmp/main-subjects.txt` is NON-EMPTY** → `main` has diverged (twins from a hotfix or a skipped reset) → **Divergent path (Step 3B)**.

This gate makes the command self-healing: if a release ever leaves twins behind, the next run detects them here and reaches for the release branch automatically.

## Step 3A — Simple path (no divergence)

`dev` is strictly ahead of `main`, so release `dev` directly — no release branch, no cherry-pick.

1. The PR is `--base main --head dev`. The cherry-pick list is the whole of `/tmp/dev-commits.txt`.
2. (Optional) `npm run type-check` on the current `dev` tip. No new commits are synthesized here and CI on `dev` already covers the tip, so this is a light sanity check, not a gate.
3. Proceed to Step 4 to draft the PR.

**Merge strategy matters here.** The PR body must instruct: **merge as a merge commit, not squash or rebase.** A merge commit lands `dev`'s exact commits on `main`, so the two branches stay in sync and the post-merge reset is a tidy formality. A squash or rebase merge rewrites hashes and re-forks `dev` from `main` — which makes the post-merge reset mandatory, and the *next* release will see the twins and take the divergent path. (Nothing breaks either way — the Step 2 gate self-heals — but the merge commit is the clean choice.)

## Step 3B — Divergent path (twins present)

Squash/rebase twins exist on `main`. Filter them out and cherry-pick the genuinely-new commits onto a fresh branch off `origin/main`.

1. Walk `/tmp/dev-commits.txt` in **chronological order (oldest first — reverse the log output)** and keep only rows whose subject is NOT in `/tmp/main-subjects.txt`. That is the cherry-pick list.
2. `git checkout -b release/$(date +%Y-%m-%d) origin/main` (if a branch with that name already exists, append `-2`, `-3`, etc.).
3. Cherry-pick the filtered commits in chronological order: `git cherry-pick <hash1> <hash2> ...` in one command. If they're truly duplicates of squash-merged work, they should apply cleanly. If conflicts appear:
   - **Stop.** Do not auto-resolve. Tell the user which commit conflicted and ask whether to skip it (likely already on main via squash) or to resolve manually.
   - Common cause: a feature was partially squashed to main; the cherry-picked commit overlaps with a later squash. Usually safe to `git cherry-pick --skip`.
4. After cherry-pick completes, run `npm run type-check`. If it fails, stop and surface the errors — do not push a broken branch.
5. `git push -u origin release/YYYY-MM-DD`. Then proceed to Step 4, with the PR head set to `release/YYYY-MM-DD`.

## Step 4 — Draft the PR

Draft the title and summary from the release commits (the whole dev set on the simple path, the filtered cherry-pick list on the divergent path):
- **Title:** `Release YYYY-MM-DD: <2-3 themes>` derived from the commits. Keep under 70 chars.
- **Summary:** bullet list grouped by theme — Sessions/Sorg/admin/etc. — drawing language directly from commit subjects, not invented.
- **Test plan:** checklist tied to the themes (CI green, plus 2-4 hand-verifiable items based on what changed).
- **Merge note (simple path only):** state that the PR must be merged as a merge commit, not squash/rebase — see Step 3A.
- **Post-merge block:** include the dev-reset command verbatim so the user runs it after merging:

  ```
  git checkout dev && git fetch origin && git reset --hard origin/main && git push --force-with-lease origin dev
  ```

Show the user the drafted title + body before opening the PR. Let them edit. Then open with `gh pr create --base main --head <dev | release/YYYY-MM-DD>`.

If a prior open dev → main PR exists (e.g. someone pushed `dev` directly), close it with a comment pointing at the new PR.

## Step 5 — Remind about dev reset

After the PR URL is returned, remind the user to reset `dev` to `main` after merge, to maintain the invariant **`dev := main` after every release** so the next release starts linear:

- **Simple path:** "When this PR merges, run the post-merge command in the PR body. With a merge commit `dev` is already an ancestor of `main`, so this just keeps things tidy and linear."
- **Divergent path:** "When this PR merges, run the post-merge command in the PR body, then `/cleanup-branches` to drop the merged `release/YYYY-MM-DD` branch."

Do not perform the reset now — it is destructive to `dev` and must wait until merge. The reset is load-bearing after a squash/rebase merge (it realigns the drifted hashes) and a tidy formality after a merge commit.

On the divergent path, this command does not delete the release branch itself — `/cleanup-branches`'s cherry-by-content check picks it up automatically once `dev` has been reset to `main`.

## Notes

- This command is read-mostly. On the simple path there are no local writes at all (just the PR); on the divergent path the release branch and PR are the only writes. No force-pushes to `dev` or `main` ever happen here.
- **Shipping a *subset* of `dev` to `main` (hotfix) is a different operation — this command does not do it; use `/hotfix-to-main`.** A hotfix deliberately creates twins (the originals stay on `dev`, **never reset it** after a hotfix); the next full `pr-dev-to-main` run detects them at Step 2 and takes the divergent path.
- If the user wants the *real* `dev` branch's merge-commit history preserved on `main`, the simple path already does that (merge commit). The divergent path necessarily rewrites hashes via cherry-pick — that's inherent to filtering out twins.
- The squash-twin filter (divergent path) is by subject, not by content. If two genuinely-different commits happen to share a subject across `main` and `dev`, the filter will drop the dev one. Unlikely but possible — eyeball the cherry-pick list before running.
