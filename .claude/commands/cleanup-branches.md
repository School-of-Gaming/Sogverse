---
name: cleanup-branches
description: Delete local and remote branches that have already been merged into dev.
---

Clean up merged feature branches. Do NOT delete `main` or `dev`.

1. List all local branches merged into `dev` (excluding `main`, `dev`, and the current branch).
2. List all remote branches merged into `dev` (excluding `main`, `dev`, and `HEAD`).
3. Show the user both lists and ask for confirmation before deleting anything.
4. If confirmed, delete the local branches with `git branch -d` and the remote branches with `git push origin --delete`.
5. If there are no merged branches to clean up, just say so.
