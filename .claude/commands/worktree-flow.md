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
   several minutes and a gigabyte.

   Three things make the nested location safe, and only the first two are
   visible from here: it is gitignored; lint and tests target explicit
   directories that never reach into `.claude/`; and the root `tsconfig.json`
   lists `".claude"` in its `exclude` — without that, the parent checkout
   type-checks worktree files against its *own* branch's `@/*` resolution and
   reports phantom errors at `.claude/worktrees/...` paths. If such errors
   ever appear on a clean parent branch, that exclude has been dropped —
   restore it rather than debugging the worktree.

   **The one exception: a branch that changes dependencies.** Upward resolution
   hands the worktree the *main checkout's* install, so a branch that edits
   `package.json` / `package-lock.json` runs against the wrong dependency tree,
   and the failures that follow do not look like this. If the work will change
   deps, run `npm install` in the worktree after the change — and only then.

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
- `npm run type-check` — clean. Use the script, not a bare `npx tsc --noEmit`:
  the script also checks the workspace packages, which a bare `tsc` silently
  skips.
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

1. **Confirm clean:** `npm run lint`, `npm run type-check`, and the full
   `npm run test` all pass — plus `npm run check-translations` if the branch
   touched `messages/` — and everything is committed. Phase 2's per-file test
   runs were for iteration; landing gets the whole suite.

2. **Stop the dev server first, if Phase 3 started one.** Stopping the background
   task kills only the wrapper — the Next child survives and keeps holding the
   port, which then blocks worktree removal and looks like a git error. Verify:
   `Get-NetTCPConnection -State Listen -LocalPort <port>`. If it is still
   listening, kill the owning PID — but confirm first that the PID owns only that
   port — the user may well have servers of their own running. Afterwards re-check
   that their ports are still up.

3. **Leave the worktree** — `ExitWorktree` with `keep`, which returns the session
   to the main checkout. `remove` will refuse here, because the worktree was
   created by hand rather than by `EnterWorktree`.

4. **Merge and push**, from the main checkout on `dev`:

   ```
   git branch --show-current        # must say dev — check out dev if not
   git fetch origin dev             # dev moves while worktree work runs
   git merge --ff-only origin/dev   # fast-forward local dev to the tip
   git merge --no-ff feat/<branch>
   git push origin dev
   ```

   The main checkout's home branch is `dev` — start there, end there, and
   deviate only when the user explicitly says to. Subject line:
   `Merge the <thing> into dev` — matching the house style, not git's default
   text. If `dev` gained commits since Phase 1, the push publishes a union CI
   has not seen — that is accepted; CI on `dev` judges it (step 7).

5. **Remove the worktree:** `git worktree remove <absolute-path>`. If it refuses
   because `node_modules` or `.next` are present, `rm -rf` the directory and then
   `git worktree prune`.

6. **Delete the branch** — local, and the remote too if it was ever pushed for
   CI. Do it now rather than leaving it for `cleanup-branches`; the merge just
   proved it is safe to delete, and that certainty decays.

7. **Report** what landed, confirm the worktree, branch and server are all
   actually gone, and confirm the main checkout is back on `dev`. **Do not
   watch the CI run the push triggers** — the user watches `dev` CI themselves
   and will flag a failure; a session that sits polling it is spending the
   user's time on a job they have kept.

---

## Working in parallel

One worktree holds one piece of work — but nothing says only one worktree.
When the work decomposes into independent pieces, run them in parallel where
reasonable rather than queuing them: one worktree and one `feat/` branch per
piece under `.claude/worktrees/`, each built by a delegated background agent
while this session coordinates. Judge "independent" by files — pieces that
would edit the same files belong in one worktree, sequenced, because parallel
edits to one file are a merge conflict manufactured on purpose.

- The shared upward `node_modules` is what makes parallel worktrees cheap:
  no per-worktree install (same dependency-change exception as Phase 1).
- Give each agent its **absolute** worktree path and tell it to work only
  there. An agent cannot be redirected from one worktree into another — if a
  piece has to move, relaunch a fresh agent rather than re-aiming a running
  one.
- Each piece still lands through Phase 5 on its own gate, one at a time, in
  whatever order they become ready. Merging one piece re-bases the world for
  the rest only at their own Phase 5 — no cross-worktree rebasing mid-flight.
- A preview server per piece follows Phase 3 unchanged: one port each,
  verified free.

## Models

The session orchestrates — decomposes, writes the agent prompts, judges
findings, lands the result — and delegates the work itself. Delegated work
runs on **Opus** by default: pass `model` explicitly on every agent launch,
because an agent silently inherits the session's model when none is passed,
and on a stronger session tier that is the most expensive arrangement
available, invisible unless you look.

- **Implementation and review agents: `opus`.** Review findings still pass
  through the session's own judgment before being relayed or applied — that
  second tier comes free with orchestration.
- **Below Opus only for a specific task you are very confident does not need
  it** — a mechanical sweep (locale keys, fixture regeneration, rename
  plumbing) can run `sonnet` at low effort; the gates catch what it fumbles.
  Confidence is the bar: when unsure, Opus.
- **Small interactive work is not delegated at all.** An agent costs a
  setup, a transcript and a report; a two-file edit is cheaper done directly
  in the session, whatever it runs on.

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
