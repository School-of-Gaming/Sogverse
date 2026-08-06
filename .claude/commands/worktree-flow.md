---
name: worktree-flow
description: Take one piece of work through its whole life in an isolated worktree — branch off dev, build, preview, review, merge, tear down.
---

Take one piece of work, start to finish, in an isolated worktree. Everything
after the command — a task, a project, a plan, a bug — is the work itself. Read
it, then begin at Phase 1.

**Why this exists:** described in prose, this workflow gets executed differently
every time, because a description leaves a decision open everywhere it doesn't
name an exact value. This file names them. Where it gives an exact command, use
that command rather than an equivalent.

**First action, before any of the work:** register Phases 3–5 as tasks
(`TaskCreate`). Landing happens hours after setup, quite possibly past a context
compaction, and the tasks are what survive that. A worktree still sitting on disk
a day later is this command having failed.

---

## Phase 1 — Set up

Run these from the **main checkout** — the repository root, not a worktree. If the
session is already inside a worktree, stop and say so: a worktree-isolated
session cannot create or modify another worktree, and the guard will refuse.

1. **Verify the base — the latest `dev`, unless the user has said otherwise for
   this piece of work.** That is a standing repo rule (see the Branching section of the
   root `CLAUDE.md`), and this is the step that actually enforces it: no setting
   can, because no setting fetches. `git fetch origin dev`, confirm local `dev`
   matches `origin/dev`, fast-forward if behind. Never `main` — it trails `dev` by
   hundreds of commits.

   If they have named a different base, use it and say back which base you used,
   so a deliberate choice and a mistake never look the same in the transcript.

2. **Create the worktree**, branching from `dev` explicitly:

   ```
   git worktree add .claude/worktrees/<short-name> -b feat/<kebab-summary> dev
   ```

   `.claude/worktrees/` is the only correct location. It is gitignored, and
   because it sits *inside* the checkout, Node resolves `node_modules` upward
   from the parent — **so do not run `npm install`**, it is not needed and costs
   several minutes and a gigabyte. Sibling `Sogverse-<name>/` directories exist
   from older sessions; they each carry their own `node_modules` and are not the
   pattern to copy.

   Branch prefix is `feat/`. (`feature/` and bare names in the history are drift.)

3. **Enter it** — `EnterWorktree` with `path` set to the absolute path just
   created. Do not use `name`: that branches from `worktree.baseRef`, which is
   unset and defaults to `origin/main`.

4. **Copy `.env.local`** from the main checkout into the worktree. It is
   gitignored, so without it the app boots and silently cannot reach Supabase.

---

## Phase 2 — Build (interactive)

This phase is a conversation, not a batch job. The user starts with a task,
project, plan, or bug; work on it, bring decisions and anything surprising back to
them as they come up, and expect several rounds of feedback and fixes before
either of you is satisfied. Do not rush toward landing — Phase 5 begins only when
they say so.

Before reporting any piece of work complete:

- `npm run lint` — **zero errors and zero warnings**. A warning is a design
  signal; fix the cause rather than suppressing the rule.
- `npx tsc --noEmit` — clean.
- Unit tests with `npx vitest run <file>`. Never `npm run test -- --run`.
- DB tests are CI-only. If the change needs them, push the branch and let CI run
  them — never attempt them locally.

Commit as the work reaches coherent points rather than in one lump at the end.
Multiline commit messages go through the Bash tool with a heredoc and
`git commit -F -`, never a PowerShell here-string.

---

## Phase 3 — Preview (only when a UI change needs looking at)

Assume a dev server is already running on the main checkout and being watched. It
serves `dev`, so it cannot show a worktree branch — and that is the *only* reason
to start a second one.

- **Never restart, kill, or otherwise disturb a server you did not start.**
- Pick a port no one is already on, and verify it is free before binding rather
  than assuming. Next's default is 3000, so treat that and the next port or two as
  taken.
- Start it backgrounded: `npx next dev --turbopack -p <port>`.
- Report the specific URLs worth opening, not just the root.

---

## Phase 4 — Review (when the change is not trivial)

Run `/code-review` against the branch.

If you delegate it to a subagent, **launch that agent from inside this
worktree** — an agent inherits the session's worktree as its write root and
cannot be redirected into another one, even by calling `EnterWorktree` first.
Tell it explicitly that it is already in the right directory.

Then **assess the findings before relaying them**. Say which you accept, which
you think are wrong and why, and which are judgement calls for the user. A review
relayed without an opinion has moved the work no further forward.

---

## Phase 5 — Land

**Only on the user's explicit instruction to merge.** Not when the work looks done,
not when review comes back clean.

Order matters — several of these steps block the next one if skipped.

1. **Confirm clean:** lint and type-check pass, everything is committed.

2. **Stop the dev server first, if Phase 3 started one.** Stopping the background
   task kills only the wrapper — the Next child survives and keeps holding the
   port, which then blocks worktree removal and looks like a git error. Verify:
   `Get-NetTCPConnection -State Listen -LocalPort <port>`. If it is still
   listening, kill the owning PID — but confirm first that the PID owns only that
   port — the user may well have servers of their own running. Afterwards re-check
   that their ports are still up.

3. **Delete the copied `.env.local`** from the worktree.

4. **Leave the worktree** — `ExitWorktree` with `keep`, which returns the session
   to the main checkout. `remove` will refuse here, because the worktree was
   created by hand rather than by `EnterWorktree`.

5. **Merge and push**, from the main checkout on `dev`:

   ```
   git merge --no-ff feat/<branch>
   git push origin dev
   ```

   Subject line: `Merge the <thing> into dev` — matching the house style, not
   git's default text.

6. **Remove the worktree:** `git worktree remove <absolute-path>`. If it refuses
   because `node_modules` or `.next` are present, `rm -rf` the directory and then
   `git worktree prune`.

7. **Delete the branch** — local, and the remote too if it was ever pushed for
   CI. Do it now rather than leaving it for `cleanup-branches`; the merge just
   proved it is safe to delete, and that certainty decays.

8. **Report** what landed, and confirm the worktree, branch and server are all
   actually gone.

---

## Guardrails

- **Never `cd` to the main checkout from inside a worktree.** The isolation guard
  refuses, and a failed `cd X && ...` chain leaves the shell's tracked directory
  somewhere unexpected. Use absolute paths, and run `cd` as its own command.
- **Never bare `git stash` / `git stash pop`.** The stack is shared with every
  other worktree and session. Prefer a temporary WIP commit.
- **Do not merge, rebase, or delete any branch other than this one's.** Other
  worktrees are other sessions' live work.
- If the plan changes mid-flight and the work should land somewhere else, say so
  and stop — do not quietly retarget the branch.

## A simplification available later

Setting `worktree.baseRef` to `head` would make `EnterWorktree` branch from the
current HEAD instead of `origin/main`. Steps 2–3 would collapse into a single
`EnterWorktree` call with a `name`, and step 4 of Phase 5 could then use
`ExitWorktree` with `remove` — creation and teardown both tool-managed, and the
location correct by construction rather than by instruction. Until that setting
exists, follow the steps above as written.
