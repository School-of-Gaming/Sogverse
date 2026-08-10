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

## Cold-read review before a plan is done

A plan is written by a session soaked in the conversation that produced it, which is exactly
the context the eventual implementer won't have — the author is the person least able to see
what the document silently assumes. So before a plan counts as ready: **hand it to a fresh
agent with no conversation context** (use a strong model — the review is judgment work) and
ask one question: *"If you were tasked with implementing this plan, what questions would you
have? What still needs clarification?"* The agent may read the repo — the implementer will
have the repo too; what it must not have is the discussion.

Triage what comes back into three piles:

- **Settled in the authoring conversation but missing from the plan** — the common case, and
  the leak the review exists to catch. Write the answer into the plan.
- **Genuinely open** — a decision nobody made. Take it to the owner; don't invent an answer
  just to make the question go away.
- **Implementer's-judgment calls** — details the plan deliberately leaves free. Leave them
  free; a plan that pre-decides everything is brittle in the other direction.

Re-run after non-trivial revisions until a cold reader has no blocking questions.

## Naming

One file per plan, kebab-case, named for the outcome (`billing-portal-multi-customer.md`).
