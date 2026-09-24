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

**Where this command ends:** at teardown, not at a working build. Phases 3–5
come hours after setup, when the work itself already feels done, and they are the
half most easily dropped. A worktree still sitting on disk a day later is this
command having failed.

---

## Phase 1 — Set up

Run from the **main checkout** — the repository root, not a worktree. If the
session is already inside a worktree, stop and say so: a worktree-isolated
session cannot create or modify another worktree, and the guard will refuse.

1. **Create the worktree** — one call, from the PowerShell tool:

   ```
   .claude\scripts\worktree-setup.ps1 -Name <short-name>
   ```

   It verifies the base, creates the worktree at `.claude/worktrees/<short-name>`
   on branch `feat/<short-name>`, junctions any nested install, and copies
   `.env.local` in. **Do not run `npm install`** — the worktree resolves
   `node_modules` upward from the parent checkout, so an install costs several
   minutes and a gigabyte for nothing. The script's header carries the reasoning
   for all of it, including the one case it cannot cover: a branch that *will*
   change dependencies needs `npm install` inside the worktree after that change
   lands, and only then.

   **The base is the latest `dev` unless the user has said otherwise for this
   piece of work.** That is a standing repo rule (the Branching section of the
   root `CLAUDE.md`), and this is the step that enforces it, because no setting
   fetches. Pass `-Base` for anything else and say back which base was used, so a
   deliberate choice and a mistake never look alike in the transcript. Never
   `main` — it trails `dev` by hundreds of commits.

   If type-check ever reports phantom errors at `.claude/worktrees/...` paths on
   a clean parent branch, the root `tsconfig.json` has lost `".claude"` from its
   `exclude` — restore it rather than debugging the worktree.

2. **Enter it** — `EnterWorktree` with `path` set to the absolute path the script
   printed. Do not use `name`: that branches from `worktree.baseRef`, which is
   unset and defaults to `origin/main`.
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

**One bounded deliverable per agent, then a fresh agent for the next piece.** An
agent pays to re-read its whole accumulated context on every turn it takes, so its
cost grows with roughly the square of its length — the Models section below has the
measured shape. Size each piece so an agent can finish it and hand back; tell it to
stop and report when the work turns out larger than its brief rather than expanding
to fill it; and when the next piece is ready **launch a new agent rather than
sending the finished one back to work**, because continuing keeps its context and
keeps paying for it where a new one starts clean. Split on deliverable boundaries
only — an agent stopped mid-refactor costs its successor more to pick up than the
split saved.

**Write the reading list into the prompt, not just the ownership list.** Reading is
the largest single thing agents consume, and one left to find its own way in opens
far more than the work needs, then carries all of it for the rest of its life. Name
the files to start from, with line ranges where the relevant part is small. When
several agents need the same background — a plan's section, a schema excerpt, a
convention — paste the passage into each prompt rather than pointing at the file:
pointed at one, every agent opens the whole of it. And say not to re-read a file it
has just edited; the edit result already confirms the write.

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
- DB tests, when the change touches the database, with `npm run test:db:local`
  against this worktree's own stack built by `npm run db -- up --no-rich-seed`
  (`tests/CLAUDE.md`). It refuses a rich stack, so a stack Phase 3 brought up
  for previewing cannot serve it. CI runs the suite on every push and remains
  the authority.

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

**A branch that also adds migrations previews against its own database.** `git diff
--name-only --diff-filter=A origin/dev...HEAD -- supabase/migrations/` — non-empty
output means `npm run db -- up` (about 50s) runs *before* the server, and it runs
without asking: a stack is free, owner-less and per-checkout, exactly like this dev
server. It repoints this worktree's `.env.local` at the stack — the three values the
app reads, nothing else — so the server has to start after it, and a server already
running has to be restarted to see it. A schema change with nothing to look at gets
no stack: `npm run db -- generate` is all that kind of branch needs.

- **Sign in as the rich seed's accounts.** `up` builds the stack on
  `supabase/rich-seed.sql` alone — `seed.sql` is the DB tests' fixture set and never
  runs on a rich stack — and that file's header lists the educators, parents and
  children it creates. Sign in as `admin@example.com`, `parent@example.com` (PIN 1111)
  or `gedu@example.com`, password `password`; every other seeded account is on
  `testpassword123`. A trimmed stack runs no mail catcher, so nothing emailed — a magic
  link, a reset — can be read on it; the seed's accounts are the only way in.
- `npm run db -- list` shows every stack on the machine with its memory (a settled
  one holds about 660 MB). Two beside the user's own work are comfortable, three
  tight.
- **Added a migration** with the stack up: `npm run db -- migrate` (a second).
  **Edited one:** `npm run db -- reset` (about 45s) — the CLI only ever runs a version
  once, so an edited file reaches a running stack no other way.

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

**Launch the `code-reviewer` agent**, from inside this worktree, passing model
`opus`. Naming the agent type is what makes the review brief arrive: it loads
with the agent, in full, every time. A hand-written reviewer prompt carries only
what the session happened to remember, which is how a review quietly loses its
diff base or its security pass.

So the brief already covers *how* to review — the merge-base diff, the
twin-commit check, what to look for, and the `mechanical`/`fork` marking. The
prompt carries only what the agent cannot know:

- that it is already in the right directory, and must not `cd` or re-enter a
  worktree — an agent inherits the session's worktree as its write root and
  cannot be redirected into another one, even by calling `EnterWorktree` first;
- what the change is for, and the decisions already settled with the user —
  stated as decisions it may still challenge on the merits, never as findings it
  is forbidden to make. Independence is the entire point of running it out of
  process, and a prompt that fences off the contentious parts hands that back;
- its reading list: the changed files, and any plan or convention passages
  quoted inline rather than pointed at.

**A branch that is the last stage of a plan landed in stages is reviewed
together with the stages before it.** The plan records each landed stage's
commits (`docs/plans/CLAUDE.md`, "Landing in stages"); hand the reviewer this
branch's diff *and* those commits as one change, named explicitly so a finding
against an already-released stage is read as a follow-up rather than as this
branch's defect. The merge-base is still the diff base — an earlier base drags
in unrelated work that landed on `dev` between the stages. Without this, a
staged feature is only ever read one piece at a time and nobody reviews it
whole; the staging was forced by a release constraint and must not also cost
the feature its one end-to-end read. Every stage's reviewer, first or last,
gets the plan itself as context.

**The review always runs in a subagent — every time, with no threshold and no
exception, and for a different reason than Phase 2's delegation.** That rule is
about context economy and admits a "trivial" carve-out. This one is about
*validity*, and admits nothing: a session that just built the code cannot review
it. It knows what every line was meant to do, so it reads intent instead of
text, and the defects it is least able to see are precisely the ones its own
reasoning produced. A fresh agent meets the diff as the diff. Reviewing in the
session does not produce a weaker review — it produces the same mind marking its
own work, which is not a review at all, however long the output is.
Then **assess the findings before relaying them**. Say which you accept, which
you think are wrong and why, and which are judgement calls for the user. A review
relayed without an opinion has moved the work no further forward.

**Findings accepted with no meaningful judgment call left open — mechanical
correctness fixes, guard/assertion strengthening, test pinning, doc corrections,
housekeeping merges — are applied immediately and reported as applied.**
Surface, and wait on, only findings that create a real fork: anything touching
product behavior, money/auth semantics, schema shape, user-facing copy, or the
plan's step boundaries. The test is fork-ness, not confidence — if the
justification has to weigh two defensible options, it is the user's call
however strongly the session prefers one of them.

The reviewer marks each finding `mechanical` or `fork` on this same test, having
just read the code. Take the marking as a starting sort, not a verdict: promoting
one to a fork is cheap and always allowed, and a finding the reviewer called
mechanical that turns out to foreclose a product decision is exactly what the
session's own judgment is for. Demote sparingly, and never to avoid an
interruption. The triage is always shown
either way (applied findings in the past tense), and the Phase 5 merge gate
remains the user's backstop: nothing reaches `dev` without their explicit
instruction.

---

## Phase 5 — Land

**Only on the user's explicit instruction to merge.** Not when the work looks done,
not when review comes back clean.

**And never a branch whose plan says "merge to `dev` but do not release."** `dev`
is released whole, so a merged stage that must not ship freezes it for every
other piece of work. An operator step that has to run before the code goes live
belongs *before* the merge, run against the branch's preview deployment
(`docs/plans/CLAUDE.md`, "Landing in stages"). If the plan sequences it
afterwards, stop and say so rather than landing the freeze.

Order matters — several of these steps block the next one if skipped.

**These are the most expensive turns of the run.** Landing happens last, when the
session's context is at its largest, so a command here costs several times what the
same command cost in Phase 1. Batch what can be batched — independent commands
belong in one call — and prefer the script wherever one exists.

1. **Confirm clean:** `npm run gates` — lint, type-check, translations and the
   full suite, in one call. It runs every gate whatever the earlier ones did,
   so one invocation returns the complete picture instead of one failure per
   cycle, and prints nothing for a gate that passes. Phase 2's per-file test
   runs were for iteration; landing gets the whole suite. Everything must be
   committed too.

   A run is current as long as HEAD hasn't moved: when the gates already
   passed on the exact commit being merged, say so and skip the re-run — the
   gate exists to catch changes, not to ritualise. Any commit since, however
   small, voids it.

2. **A branch carrying migrations lands synced.** `git fetch origin dev`, then
   `git diff --name-only --diff-filter=A origin/dev...HEAD --
   supabase/migrations/` — empty output means land exactly as today, so skip the
   rest of this step. Otherwise, in the worktree, on the branch:

   1. `git merge origin/dev` — resolve conflicts as usual, except in
      `database.types.ts` and under `supabase/schema/`, which are never
      hand-edited: regenerate and inspect (`supabase/CLAUDE.md`, "CI compares
      the committed generated files against `migrations/`"). If this worktree's
      stack is up, `npm run db -- reset` it after the merge — never `migrate`,
      which would put the merged migrations on top of the branch's own.
   2. `node scripts/restamp-migrations.mjs` — renames this branch's own
      migrations to fresh timestamps, relative order kept, so they sort above
      everything `dev` holds. Landing is serialised through one human, so the
      stamp taken here is the queue position and two branches can never claim
      one version. `--dry-run` shows the renames without making them.
   3. `npm run db -- generate` — about a minute.
   4. `git status` must show the renames and, at most, regenerated files
      (`database.types.ts`, `supabase/schema/`) whose every hunk you can account
      for. A difference in an object both sides touched is the conflict case
      again: read both sides' changes and confirm each survives in the
      regenerated output; where one is missing, write the migration that
      combines them and regenerate.
   5. Commit, and re-run the gates if the merge brought more than the renames.
      **Do not push the branch again** — the regenerate-and-compare you just ran
      is the gate, and `dev`'s own CI run follows the merge. The one exception is
      the no-local-database path: push the synced branch, because CI is then the
      generator, and commit both its artifacts —
      `database-types-from-migrations` as `src/types/database.types.ts`, and
      `schema-from-migrations` in place of `supabase/schema/`.

3. **Stop the dev server first, if Phase 3 started one — by port, with a tree
   kill. Every time; this is the procedure, not a recovery.** On Windows,
   stopping the background task kills only the wrapper shell and the Next child
   *always* survives it holding the port (deterministic, not a race) — left
   there, it blocks worktree removal in a way that looks like a git error. So:

   1. Stop the background task (retires the wrapper; nothing more).
   2. Find the real server: `Get-NetTCPConnection -State Listen -LocalPort
      <port>` → the owning PID.
   3. Confirm that PID listens on **only** that port — the user runs servers of
      their own, and the paranoia is aimed at never killing theirs.
   4. `taskkill /F /T /PID <pid>` — `/T` is the load-bearing flag: it takes the
      whole process tree (route workers included), where `Stop-Process` has no
      tree mode and can leave grandchildren behind.
   5. Re-check the port is free, and that the user's own ports are still up.
   6. `npm run db -- park` if Phase 3 brought a stack up — **a stack is parked
      whenever its dev server is not running.** It keeps the data and frees the
      memory, `.env.local` goes on pointing at it, and `up` brings it back in
      about 30s, so a branch can wait for review at no cost. Step 6's teardown
      script runs `npm run db -- down` for you, which is what removes it.

   A server whose wrapper died but whose child survived serves broken pages
   ("Jest worker encountered 2 child process exceptions, exceeding retry
   limit"). That is the wounded server, not an app bug: kill it and start
   clean rather than debugging the page.

4. **Leave the worktree** — `ExitWorktree` with `keep`, which returns the session
   to the main checkout. `remove` will refuse here, because the worktree was
   created by hand rather than by `EnterWorktree`.

5. **Merge and push**, from the main checkout — one call:

   ```
   [ "$(git branch --show-current)" = dev ] &&
     git fetch origin dev &&
     git merge --ff-only origin/dev &&
     git merge --no-ff feat/<branch> -m "Merge the <thing> into dev" &&
     git push origin dev
   ```

   The branch test gates everything after it: off `dev`, the chain is a no-op
   rather than a merge into the wrong place. The fetch and `--ff-only` catch
   local `dev` up, since it moves while worktree work runs. `-m` is required —
   without it the merge opens an editor and the run hangs.

   The main checkout's home branch is `dev` — start there, end there, and
   deviate only when the user explicitly says to. The subject is house style,
   not git's default text. If `dev` gained commits since Phase 1, the push publishes a union CI
   has not seen — that is accepted; CI on `dev` judges it (step 7).

6. **Tear the worktree down and delete the branch** — one call, from the
   PowerShell tool, in the main checkout:

   ```
   .claude\scripts\worktree-teardown.ps1 -Worktree <short-name> -DeleteRemote
   ```

   It removes the worktree's local Supabase stack if it has one (a no-op when it
   does not), unlinks any nested-install junction Phase 1 created, refuses to run
   anything recursive while one is still standing, removes the worktree —
   falling back to a recursive delete and a prune when git objects to
   `node_modules` or `.next` — and deletes the branch. Pass `-DeleteRemote`
   whenever the branch was pushed for CI: delete it now rather than leaving it
   to `cleanup-branches`, because the merge has just proved it safe to delete
   and that certainty decays.

   It stops rather than proceed when the worktree has uncommitted changes, or
   when its `.env.local` holds keys the main checkout's does not — copy those
   across first, since they die with the worktree otherwise. `-DryRun` reports
   the whole teardown without touching anything.

   **Do not hand-roll this sequence when the script is in the way.** The
   junction order is what it exists to enforce: a junction is a link into the
   main checkout's real `node_modules`, `rm -rf` follows it and empties the
   folder behind it, and that has cost this repo its `node_modules` once. If
   the script refuses, read what it refused about — that is the guard working.

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
  no per-worktree install (same dependency-change exception as Phase 1, and
  the same nested-install junctions, one set per worktree). Because it is
  shared, never install or repair it while another npm or node process is
  working the same tree — two concurrent `npm ci` runs kill each other with
  EPERM unlinks. Check running node processes' command lines and wait.
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

**What this command costs, and where it goes.** Measured across twelve runs of it
(September 2026): the orchestrator was 48% of the spend and the agents 52%, and in
both tiers 98% of every token was context being re-read rather than anything new
arriving. Two consequences run underneath the rules below.

A context's cost is its size multiplied by the number of turns it survives, so
what there is to manage is *length*, not volume — an agent's cost grows with
roughly the square of its turn count, and in these runs a turn inside a
250-message agent cost more than twice the same turn inside a 50-message one. The
longest single agent cost more than two entire orchestrator sessions.

And the session's own turns are the dearest in the flow, because its context is
the largest and it holds for hours — yet 35% of them went on shell commands and
edits. That is the orchestrator paying the top rate in the flow to run `git` and
`npm`. Its context is large *because* it is carrying the whole piece of work,
which is exactly why cheap mechanical turns do not belong in it. Phase 5's gates
and merge are the session's own and stay; anything else that is a command rather
than a decision goes to the agent that wanted it, or to a script.

**Two rules, two different reasons, and they are not interchangeable.**
Conflating them is how both get weakened — the review rule inherits an escape
hatch it must not have, and the build rule inherits a rigidity it does not need.

- **Implementation is delegated unless it is trivial, where trivial means
  cheap in *context*, not easy.** What is being protected is the orchestrator's
  window, which has to stay clear enough to hold the big picture. A mechanical
  sweep is easy and expensive to hold; an intricate fix in an open file is hard
  and nearly free. Judge by what the work costs to *hold*, not to *solve*, and
  see Phase 2 for the full statement.
- **The review is always delegated. No threshold, no exception.** Not for
  context economy but for validity — Phase 4 carries the argument, and the two
  rules are stated apart precisely because they are not interchangeable.

Delegated work runs on **Opus**: pass `model` explicitly on every agent launch,
because an agent silently inherits the session's model when none is passed, and
on a stronger session tier that is the most expensive arrangement available,
invisible unless you look.

- **Implementation and review agents: `opus`.** Review findings still pass
  through the session's own judgment before being relayed or applied — that
  second tier comes free with orchestration, and is why an independent reviewer
  costs nothing in accuracy.
- **Below Opus only where a mechanical gate will catch the failure.** That is
  the test, and unlike confidence it is decidable: lint, type-check, the test
  suite and the schema either read every line this piece of work touches, or
  they don't. A locale sweep, a fixture regeneration, rename plumbing — the gate
  covers all of it, so `sonnet` is safe there. Where the failure would be silent
  — a review that misses a defect, a decomposition that splits the work wrong, a
  judgment about what lands — nothing downstream catches it and there is no
  floor beneath Opus. This applies to *implementation* only: a review is never
  run below Opus, whatever the gates cover.

**Effort is a session setting, not a per-launch one.** An agent launch takes a
model and no effort, so `model` is the only dial this command turns per agent.
The session's own level governs the context that has to hold the piece of work
for hours, and lower effort buys its saving partly by consolidating tool calls —
a good trade inside a short agent, a poor one in the orchestrator, which is the
context least able to afford a thinner judgment.

## Guardrails

- **Never `cd` to the main checkout from inside a worktree.** The isolation guard
  refuses, and a failed `cd X && ...` chain leaves the shell's tracked directory
  somewhere unexpected. Use absolute paths, and run `cd` as its own command.
  The guard checks where a command *starts*, not where it ends — so a chain
  that begins inside the worktree and `cd`s out mid-way is allowed to run, and
  from then on every command (Bash and PowerShell both, including a bare `cd`
  back) is refused for starting in the shared checkout. **Recovery:** call
  `EnterWorktree` with `path` set to the same worktree you are already in;
  re-entering resets the tracked directory and both shells work again.
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
