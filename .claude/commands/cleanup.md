---
name: cleanup
description: Remove leftover worktrees and branches — ones whose sessions are all archived, or whose work has landed on dev — while keeping everything an open session still owns.
---

Clean up worktrees and branches that nothing needs any more. **A worktree or branch that
an unarchived session owns is open work and is kept**, whatever state it is in. Never
touch `main`, `dev`, the current branch, or the main checkout.

Two things decide what goes: **who owns it** (the sessions in this app) and **whether
its work is on `dev`** (git).

## 1. Take stock

1. `git fetch origin --prune`.
2. `git worktree list --porcelain` — every worktree, its branch (or detached HEAD).
   `git -C <worktree> status --porcelain` for each: a dirty worktree is kept, always.
3. Every local branch and every `origin/*` branch except `main`, `dev`, `HEAD`.
4. This repo's sessions: `list_sessions` with `include_archived: true` and a limit of
   300. The result overflows to a file; parse it with `node` rather than reading it.
   Keep the sessions whose `cwd` is this checkout or under it. Note the oldest
   `lastActivityAt`: nothing older than that can be matched.

## 2. Find each worktree's and branch's owner

- **By folder or branch:** a session whose `cwd` is the worktree's path, or whose
  `branch` is the branch. Sessions the app started in a worktree match this way.
- **By transcript:** a `/worktree-flow` worktree is made by a session running in the
  main checkout, so its `cwd` never matches. For every worktree still unmatched, run
  `search_session_transcripts` with `include_archived: true` and the query
  `worktrees\<name>`. For every unmatched branch, query the branch name.
- A nested worktree (one under another worktree's `.claude/worktrees/`) belongs to its
  parent's owner.

The owner's state is: **open** (any matching session is unarchived), **archived**
(every matching session is archived), or **unknown** (no session matched).

## 3. Has the work landed?

For each branch, `git cherry origin/dev <branch>` compares by content, so it is right
however the work reached `dev`. No `+` lines means **landed**; each `+` line is a
commit `dev` lacks. Compare against `origin/dev`, never local `dev`.

## 4. Classify and show

| Group | Rule |
|---|---|
| **Open work — keep** | Owner open, or the worktree is dirty |
| **Remove** | Owner archived or unknown, worktree clean (if any), branch landed |
| **Ask** | Owner archived or unknown and the branch has commits `dev` lacks — list the first 1–3 subjects |

A branch checked out in a kept worktree is kept with it. Show one table with every
worktree and branch, its owner (session title and state) and its group, then ask once
before removing anything. If nothing is in Remove or Ask, say so and stop.

## 5. Remove

Worktrees first, nested ones before their parent, each with the teardown script from
the main checkout:

```
.claude\scripts\worktree-teardown.ps1 -Worktree <name> -DeleteRemote
```

It unlinks the junctions, takes down a local Supabase stack, deletes the folder without
following links, and deletes the branch. Pass `-Branch <name>` for a detached HEAD whose
branch should also go, `-KeepBranch` when the branch is in Ask and the owner kept it.
**Never `git worktree remove`** — it follows the junctions into the main checkout's
`node_modules`. If the script refuses, report why; its refusals protect work.

Then the branches with no worktree: `git branch -D <branch>` (`-D`, because a
hash-based check refuses content-landed branches) and `git push origin --delete
<branch>` for those on origin.

Report what went, and anything the script refused.
