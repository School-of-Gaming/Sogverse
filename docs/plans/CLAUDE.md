# docs/plans

Self-contained implementation plans. Each file is a decided, concrete piece of work that a
fresh Claude session can pick up and execute **with no prior conversation context**.

## Lifecycle

Write → implement → **delete the plan file**.

A plan sitting here means the work is still open. An empty directory means nothing is pending.
Never tick a plan off, mark it "done", or keep it around as a record — git history and the
code/docs the work produced are the record. Deleting is the completion step — and the plan's
follow-ups are deleted with it unless the owner names one to keep (see "Scope" below).

## Not TODO.md

`TODO.md` holds ideas to explore and loosely-scoped tasks; items there may sit for months or
never be actioned, and they often still need a decision.

A plan here is **already decided and ready to build**. Plans are standalone — do not cross-link
them from `TODO.md`, and do not leave a `TODO.md` stub pointing at one. If work starts as a
`TODO.md` item and later gets designed into a plan, remove the `TODO.md` item when the plan
lands, so there is exactly one home for it.

## Scope: a v1 foundation, from what we know now

**A plan contains only what the feature needs.** Not extra features, not pre-optimisations,
not machinery for a later feature whose requirements are still a guess. It is better to get a
v1 committed and working and refine it in follow-ups than to tack everything on at once. The
question to ask of every piece is: *are we building a foundation that can be built upon,
based only on what we know our intentions to be right now?* If a piece answers a requirement
nobody has stated yet, it comes out.

How this goes wrong, so it is recognisable: a real requirement ("images must never get
lost") gets answered with a mechanism (a two-phase lifecycle, a state column, a triage UI)
when the simple shape already met it; a performance win that is *independent* of the feature
rides along because "we're in there anyway"; a future feature's imagined needs (a phone upload
pipeline, a second rendition size) get built before that feature exists to say what it
actually needs; an unrelated fix gets folded in because this is the moment someone noticed it.
Each of these is individually defensible and together they turned one plan into a second
system. The design-challenge review below exists to catch this — but the author should be
asking the question before the reviewer does.

What earns a place: a stated intent, a constraint that is true today, a rule in a `CLAUDE.md`
file, or a fact discovered in the code that the simple shape collides with. Everything else
is cut, and listed in the plan's own **Follow-ups** section — so the challenge review can see
the cut was a decision and the implementer does not rebuild it. A plan should be able to
list its follow-ups; a plan with none has probably absorbed them.

**A cut is not a backlog item.** `TODO.md` is the owner's list of where the project's
attention goes, and an idea cut from a plan has, by construction, been asked for by nobody
— it was in the plan because it was adjacent to the work, not because anyone wanted it.
So a plan's follow-ups live and die with the plan file: when the plan is deleted at
completion, they are **proposed to the owner by headline, and only the ones the owner
names are written into `TODO.md`**; the default for the rest is that they go with the
plan. Writing them into `TODO.md` wholesale "so they are not lost" was tried once and
produced a seventeen-item backlog the owner deleted on sight.

## What a plan must contain

Assume the reader has none of the discussion that produced it.

- **Problem** — what's broken or missing, and the concrete failure it causes.
- **Scale** — who/how many are affected, with real numbers where known. Distinguishes a
  must-fix from a nice-to-have.
- **The decision** — what shape was agreed, stated definitively.
- **Rejected alternatives, with the reason** — the most valuable part. Without it a session
  re-derives and relitigates settled trade-offs, and may "helpfully" build the thing that was
  deliberately turned down.
- **Steps** — ordered, concrete, each independently verifiable.
- **Acceptance criteria** — how to know it's done.
- **Constraints discovered while deciding** — external API limits, data-model facts, rules
  that must hold. These are why the plan looks the way it does.

Describe shapes and behaviour rather than citing symbols or line numbers that rot before the
plan is implemented; directory and route paths are stable enough to name.

## A plan is a starting point, not a spec

A plan records what was decided and why, so the implementer does not relitigate it. It does
not try to foresee everything: some details are only learned by implementing, and a plan that
pretends otherwise is long, brittle and still wrong. **The implementer makes judgment calls as
they learn**, and when the code disagrees with the plan they change the code and note the
deviation in the plan file as they go — so the next reader sees a decision, not a drift to be
"helpfully" reverted. What the implementer escalates to the owner is a short fixed list:
anything the plan marks as an owner decision, and anything touching money, auth, safeguarding
or the deletion of data. Everything else is theirs.

## Landing in stages

**The default is one branch, one merge, one review, one release.** A plan splits its work
into stages that land on `dev` separately only when a constraint forces it, and the plan
names that constraint. The one that recurs here: the CI migrations job and the Vercel
promotion race, so a migration and the code that depends on it are never in one release —
a schema change the app needs goes first, alone. Two things follow, and both are rules
because each was nearly got wrong the first time:

- **Only what the constraint forces goes early; everything else stays on the feature
  branch.** Releasing a stage releases all of `dev` — `/pr-dev-to-main` ships the branch
  whole — so every early stage is a release of whatever else happens to be there. The plan
  owns that cost by keeping the early stage to the minimum the constraint demands (the
  migration and its tests, not the migration and the service that was convenient to write
  beside it). When `dev` carries work that genuinely cannot ship, `/hotfix-to-main`
  cherry-picks the stage alone; that is the escape hatch, not the routine.
- **No stage is ever "merge to `dev` but do not release."** A merged, unreleasable stage
  freezes `dev` for every other piece of work until it is cleared. When an operator step
  (a data backfill, a link pass) must run before the new code goes live, it needs the live
  schema and the *old* app — not the new code on `dev` — so sequence it *before* the
  feature merges, and inspect it through the branch's preview deployment. The feature then
  merges and releases like any other work.

**Staging must not cost the feature its one whole-feature review.** A plan reviewed in
stages is reviewed by people who each see one piece, and nobody reads it end to end unless
the plan arranges for it. Two arrangements, both required:

- **Every stage's reviewer gets the plan**, so the piece is judged against the routes, the
  UI and the operations it will serve rather than in isolation. The design itself was
  already reviewed whole, by the challenge and the cold-read above — a stage's reviewer is
  checking a piece against a settled whole, not inventing the whole.
- **The last stage's review covers the earlier stages too.** When a stage lands, the plan
  records its commits (a line in **Steps**: "landed: `<hashes>`"). The final stage's
  reviewer is handed its own diff *and* those commits as one change under review, so one
  fresh reader sees migration, code and UI together. The branch's own merge-base stays the
  diff base — reaching further back would drag in unrelated work that landed on `dev` in
  between — and the earlier commits are named to the reviewer explicitly, so a finding
  against one is read as a follow-up (the stage is already live) rather than as a defect of
  the branch under review. That asymmetry is the real cost of staging: a defect found late
  in a released schema is a second migration, not an edit. It is inherent in the constraint
  that forced the split, which is exactly why the early stage gets the plan-stage reviews
  and a plan-aware reviewer of its own.

## Review: proportional to blast radius, and capped

Agent review is expensive, and its value falls off fast after the first pass. Size it:

- **No schema change, one surface** → no agent review. The author reads the plan back cold
  and builds.
- **A migration, several surfaces, or a release-ordering question** → **one challenge, then
  one cold-read**, one round each. Then build. Do not loop "until clean" — what a second
  round finds, the implementation's first hour finds too, and cheaper.

Two different reviews, and the order is not negotiable: **challenge the plan first, then
check it can be built.** An implementability review hardens whatever shape it is handed —
that is its job — so running it first polishes a design nobody has yet asked whether to
build. Both reviews go to fresh agents with no conversation context; both may read the repo.

**Which model:** the session's driver is the most expensive tier and is not what reviews run
on. The working shape is **the driver authors and triages; the strong-but-cheaper tier
(Opus today) reviews** — both the challenge and the cold-read. That is also the better
shape, not only the cheaper one: blind spots are model-shaped as well as context-shaped, so a
reviewer that is not the author is a second kind of independence on top of "no conversation
context". Even capped, reviews are extra agents, so escalating them to the driver's tier
multiplies the most expensive line item; do not. Name the
tier when you spawn the agent, and expect this paragraph's product name to need updating
when the tiers move.

### 1. Challenge the plan (once, at the first complete draft)

Hand the draft to **one** agent **with the owner's stated intent and constraints, verbatim**
— that is the one input a design reviewer needs and the implementer does not — and ask one
question: *"Given this intent, is this only what v1 needs, and is it the right plan? What
here is more machinery than the intent requires, what is a materially simpler design that
still meets every stated constraint, and which decisions are load-bearing versus merely
defensible?"* Only a plan whose blast radius is unusually large (a new subsystem, a data
migration of live records) earns a second agent with an opposed lens — cost and failure
modes, or the end user's experience — run in parallel.

- **Tell the agent to concede where a piece is justified.** An agent told only to argue
  against will manufacture objections; the instruction to say "this part is right" is what
  makes the rest credible.
- **Ask for a verdict**: build as planned / build with these cuts / rethink.
- **Triage goes to the owner, not the author.** Accepted cuts reshape the plan. Rejected
  challenges go into *Rejected alternatives* with the reason — that section is exactly where
  "the simpler thing was considered, and here is why not" belongs, and it is what stops the
  next session relitigating it.
- **One round.** A material redesign after the challenge (a new table, a new release shape)
  may justify one more pass; a clarification round never does.

Do not fold this into the implementability review below. "Is this right?" wants the decision
reopened; "can I build this?" wants it held still. An agent asked both will answer the
second, because it is the concrete one.

### 2. Cold-read for implementability (one round)

A plan is written by a session soaked in the conversation that produced it, which is exactly
the context the eventual implementer won't have — the author is the person least able to see
what the document silently assumes. So before a plan counts as ready: **hand it to a fresh
agent with no conversation context** and ask one question: *"If you were tasked with
implementing this plan, what questions would you have? What still needs clarification?"* The
agent may read the repo — the implementer will have the repo too; what it must not have is
the discussion.

Triage what comes back into three piles:

- **Settled in the authoring conversation but missing from the plan** — the common case, and
  the leak the review exists to catch. Write the answer into the plan.
- **Genuinely open** — a decision nobody made. Take it to the owner; don't invent an answer
  just to make the question go away.
- **Implementer's-judgment calls** — details the plan deliberately leaves free. Leave them
  free; a plan that pre-decides everything is brittle in the other direction.

One round. Write the answers in, take the open decisions to the owner, and build; what a
second cold-read would find, the implementer will find with the code in front of them.

## Naming

One file per plan, kebab-case, named for the outcome (`billing-portal-multi-customer.md`).
