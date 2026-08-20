# docs/plans

Self-contained implementation plans. Each file is a decided, concrete piece of work that a
fresh Claude session can pick up and execute **with no prior conversation context**.

## Lifecycle

Write → implement → **delete the plan file**.

A plan sitting here means the work is still open. An empty directory means nothing is pending.
Never tick a plan off, mark it "done", or keep it around as a record — git history and the
code/docs the work produced are the record. Deleting is the completion step.

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
becomes a named follow-up in `TODO.md`, written down so it is not lost and not built so it
does not cost anything yet. A plan should be able to list its follow-ups; a plan with none
has probably absorbed them.

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
