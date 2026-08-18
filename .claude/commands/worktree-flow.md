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

**When the work starts with aligning on a design — demos, mocks, UI Previews
scenarios, UI Components entries the user wants to compare before deciding —
that alignment work is part of this flow, not a prelude to it.** Phase 1 runs
first, so the demos are built in the worktree on the same branch the real work
will land on — never as uncommitted edits in the main checkout, whose dev server
is serving `dev` and whose working tree is not this branch's scratch space. The
demo build is delegated to an Opus agent like any other implementation, and the
trivial carve-out does not apply to it: demo variants are diff-heavy by nature
(fixture plumbing, prop threading, registry entries), which makes them expensive
to *hold* however easy they are to write. Preview them through Phase 3, take the
user's ruling — and then **strip the demo code on this same branch before (or
as the first commit of) building the chosen design**. Temp scenarios and
variant switches exist to be compared once; none of it merges.

**Build by delegating, not by typing.** The session's role in this phase is
orchestration: write the implementation prompt, launch an agent into this
worktree (model `opus` — the Models section below governs the whole flow, not
just parallel work), judge what comes back, and iterate. Doing the
implementation directly in the session is the default failure mode precisely
because it never feels like a decision — nobody chooses the session's model,
they just start editing.

**The thing being protected is the orchestrator's context window, so "trivial"
means cheap in context — not easy.** The two come apart constantly, and the
distinction is the whole rule. A sprawling but mechanical job — a locale sweep
across five files, a fixture regeneration, a rename with forty call sites —
is *easy* and is not *trivial*: it fills the window with diffs the session will
never need again, and every one of those tokens is one the session no longer
has for the big picture. Conversely a genuinely intricate two-line fix in a
file already open is trivial in the only sense that matters here. Judge by what
the work will cost to *hold*, never by what it will cost to *solve*.

So the question at every piece of work is "will doing this myself clutter my
context?", and if the answer is yes it goes to an agent however simple it looks.
Only the small interactive kind stays — a review-round fix, a two-file tweak, an
edit you are already mid-way through.

The unit of feedback is completed work, not elapsed time: run to done, report,
take the rulings, fix, repeat. Block mid-build only on a question the work cannot
proceed without; a judgment call with a buildable, reversible answer gets decided,
flagged, and carried to the report instead.

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

## Phase 4 — Review (skip only for a change that could not be wrong)

**Whether to review is a question about risk; how to review is not a question
at all.** Phase 2's "trivial" is about what work costs the orchestrator to
hold, and it has no bearing here — a one-line change can be context-free and
still be the line that leaks data. Skip this phase only when the change could
not plausibly be wrong (a typo fix, a comment). Everything else is reviewed,
and everything reviewed is reviewed by an agent.

**Review cadence is a judgment call the session must make out loud.** One
branch-level review after the build completes is the default, and it is usually
right when builder agents run concurrently (a mid-flight review reads other
agents' half-done edits) or when pieces interlock (an early piece that a later
piece rewrites gets reviewed twice, once for nothing). Per-piece reviews as each
implementation lands are right when the pieces are independent and long-lived
enough that a defect would ride along expensively. Either way, **say which
cadence was chosen and why at the moment the first build agent launches** — a
silent deviation from "review each piece" is indistinguishable from forgetting
to review at all, and the user can only veto a decision they can see.

Run `/code-review` against the branch — but check first whether `dev` has moved
since Phase 1. It usually has, on a session long enough to need this command,
and a diff against moved `dev` pollutes the review with other work inverted.
Diff from the merge-base (`git merge-base dev HEAD`) instead; the review is of
this branch's commits, not of the gap between two moving points.

**The review always runs in a subagent — every time, with no threshold and no
exception, and for a different reason than Phase 2's delegation.** That rule is
about context economy and admits a "trivial" carve-out. This one is about
*validity*, and admits nothing: a session that just built the code cannot review
it. It knows what every line was meant to do, so it reads intent instead of
text, and the defects it is least able to see are precisely the ones its own
reasoning produced. A fresh agent meets the diff as the diff. Reviewing in the
session does not produce a weaker review — it produces the same mind marking its
own work, which is not a review at all, however long the output is.

**Launch that agent from inside this worktree** — an agent inherits the
session's worktree as its write root and cannot be redirected into another one,
even by calling `EnterWorktree` first. Tell it explicitly that it is already in
the right directory, and that it must not edit, stage or commit anything.

Give it the branch's context and the decisions already settled with the user, so
it spends its attention on defects rather than re-litigating choices — but state
those as decisions it may still challenge on the merits, never as findings it is
forbidden to make. Independence is the entire point of running it out of
process; a prompt that fences off the contentious parts hands that back.

Then **assess the findings before relaying them**. Say which you accept, which
you think are wrong and why, and which are judgement calls for the user. A review
relayed without an opinion has moved the work no further forward.

**Findings accepted with no meaningful judgment call left open — mechanical
correctness fixes, guard/assertion strengthening, test pinning, doc corrections,
housekeeping merges — are applied immediately and reported as applied.** (This
flow's rule, not `/code-review`'s ad-hoc default of waiting for the user to
pick.) Surface, and wait on, only findings that create a real fork: anything
touching product behavior, money/auth semantics, schema shape, user-facing copy,
or the plan's step boundaries. The test is fork-ness, not confidence — if the
justification has to weigh two defensible options, it is the user's call
however strongly the session prefers one of them. The triage is always shown
either way (applied findings in the past tense), and the Phase 5 merge gate
remains the user's backstop: nothing reaches `dev` without their explicit
instruction.

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

**Two agents in one worktree** is the everyday parallelism, and it has exactly
two rules. Each agent gets an explicit list of the files it owns, disjoint from
every other agent's, written into its prompt — "don't touch X, another agent is
working there" is cheap to say and expensive to skip. And when the next piece's
files would overlap an agent still running, sequence it behind that agent
rather than launching into a collision; waiting is cheaper than untangling two
authors of one file.

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

## Models and delegation

The session orchestrates — decomposes, writes the agent prompts, judges
findings, lands the result — and delegates the work itself. This is the
arrangement for the whole command, single worktree or several. **Invoking this
command is the user asking for agents**: a standing instruction elsewhere
against unprompted agent use does not override it, and a session that quietly
collapses into single-threaded work because of one has misread the request
rather than made a judgment call.

**Two rules, two different reasons, and they are not interchangeable.**
Conflating them is how both get weakened — the review rule inherits an escape
hatch it must not have, and the build rule inherits a rigidity it does not need.

- **Implementation is delegated unless it is trivial, where trivial means
  cheap in *context*, not easy.** What is being protected is the orchestrator's
  window, which has to stay clear enough to hold the big picture. A mechanical
  sweep is easy and expensive to hold; an intricate fix in an open file is hard
  and nearly free. Judge by what the work costs to *hold*, not to *solve*, and
  see Phase 2 for the full statement.
- **The review is always delegated. No threshold, no exception.** This one is
  not about context at all — it is about whether the review means anything. The
  session that wrote the code knows what each line was for and reads intent
  instead of text, so the defects it is least equipped to find are exactly the
  ones its own reasoning introduced. Freshness is the property being bought, and
  a review run in the authoring context has not bought it.

Delegated work runs on **Opus**: pass `model` explicitly on every agent launch,
because an agent silently inherits the session's model when none is passed, and
on a stronger session tier that is the most expensive arrangement available,
invisible unless you look.

- **Implementation and review agents: `opus`.** Review findings still pass
  through the session's own judgment before being relayed or applied — that
  second tier comes free with orchestration, and is why an independent reviewer
  costs nothing in accuracy.
- **Below Opus only for a specific task you are very confident does not need
  it** — a mechanical sweep (locale keys, fixture regeneration, rename
  plumbing) can run `sonnet` at low effort; the gates catch what it fumbles.
  Confidence is the bar: when unsure, Opus. This applies to *implementation*
  only — a review is never run below Opus.

## Guardrails

- **Never `cd` to the main checkout from inside a worktree.** The isolation guard
  refuses, and a failed `cd X && ...` chain leaves the shell's tracked directory
  somewhere unexpected. Use absolute paths, and run `cd` as its own command.
- **Inside a worktree, keep shell commands plain.** The isolation guard refuses
  anything it cannot statically verify stays inside — heredocs, scripts piped to
  an interpreter, compound chains with redirects. That refusal is almost always a
  sign the dedicated file tools were the right instrument anyway; reach for those
  first, and keep Bash for git, npm, and single-purpose commands. Two habits that
  trip it: tacking `2>&1 | tail` onto an otherwise-plain command to trim output
  (run the plain command; the harness truncates long output itself), and inlining
  a credential with `$(grep … .env.local)` (parse it into an env var and run the
  tool in the same single PowerShell call — `$env:SUPABASE_DB_PASSWORD = …;
  npx supabase …` — since shell state does not persist between calls).
- **The session owns the git index; agents never commit and never stage.** Say
  so in every agent prompt. An agent that runs `git rm` or `git add` leaves
  state in the index that the session's next commit silently sweeps in — a
  commit then contains work it does not describe, and nothing flags it. The
  cheap tripwire on the session's side: before every commit, check the stat
  line (or `git diff --cached --stat`) for files you did not put there, and
  unstage rather than absorb them.
- **Never bare `git stash` / `git stash pop`.** The stack is shared with every
  other worktree and session. Prefer a temporary WIP commit.
- **Do not merge, rebase, or delete any branch other than this one's.** Other
  worktrees are other sessions' live work.
- If the plan changes mid-flight and the work should land somewhere else, say so
  and stop — do not quietly retarget the branch.
