---
name: cleanup-branches
description: Delete local and remote branches whose content has fully landed on dev (rebase-and-merge aware).
---

Clean up feature branches whose work is already on `dev`. Do NOT delete `main` or `dev`.

This repo rebase-and-merges feature branches, which gives each commit a new hash on `dev`. `git branch --merged` (hash-based) misses those branches and reports them as unmerged forever. Use `git cherry` instead — it compares by *patch-id* (content), so a branch counts as merged when every one of its commits has an equivalent on `dev`.

## Steps

1. `git fetch origin --prune` so `origin/dev` is fresh.
2. Build the candidate list:
   - **Local:** every local branch except `main`, `dev`, and the current branch.
   - **Remote:** every `origin/*` branch except `origin/main`, `origin/dev`, and `origin/HEAD`.
3. For each candidate, run `git cherry origin/dev <branch>`. Count lines starting with `+` (unmerged commits).
   - `+` count is `0` AND total commit count is `> 0` → **fully merged by content**, safe to delete.
   - Any `+` lines → branch has unique work; keep.
   - Zero commits relative to `origin/dev` (empty output) → branch is identical to dev; treat as merged.
4. Show the user a table grouped into "Safe to delete" and "Has unique work (keep)". For the keep list, show `<+count> of <total> unmerged`. For branches with unique commits, list the first 1–3 commit subjects so the user can see what they'd lose.
5. Ask for confirmation before deleting anything.
6. If confirmed, delete each safe-to-delete branch:
   - Local: `git branch -D <branch>` (use `-D`, not `-d` — hash-based check would refuse).
   - Remote: `git push origin --delete <branch>`.
7. If nothing qualifies, just say so.

## Notes

- Never delete a branch with `+` lines without explicit user override — those commits genuinely don't exist on `dev`.
- Skip release branches (`release/*`) — they're disposable and `/pr-dev-to-main` already deletes them as part of its flow.
- The `origin/dev` reference is intentional: after a `/pr-dev-to-main` release the local `dev` is reset to `main`, but if the user is between releases the local `dev` may have unmerged feature commits not yet pushed. `origin/dev` is the authoritative reference.
