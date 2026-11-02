---
name: triage-feedback
description: Work through a feedback list or spec a colleague wrote with an AI's help — separate what they want from how their AI suggested doing it, check what Sogverse already does, then talk, decide and build one item at a time.
---

Everything after the command is the feedback: a path to a document or the pasted text,
and whatever the owner says about who wrote it. Read all of it before saying anything
about any item. When several pieces arrive together, read them as one round: they often
serve one goal and share its dates.

**Who writes these.** A colleague who is not an engineer, writing from the business side,
with an AI that sees what Sogverse exposes — the public site, the MCP tools, the vendor
accounts it syncs to — and none of what sits behind it. So the feedback can mix three
things, and telling them apart is the job:

- **Intent** — the behaviour or outcome the author wants. This is the requirement.
- **Prescription** — how the author's AI suggests building it. Where it reaches into
  Sogverse's internals, its specifics are guesses: names that don't match this repo's
  concepts, and mechanisms the repo may already have ruled out. Where it describes an
  interface the author owns or builds on — a vendor tool they run, their own editing
  setup on top of the MCP tools — its specifics carry the author's weight, because that
  layer is what the change has to serve.
- **Additions** — what the AI may have put in around the request, which the author never
  asked for: acceptance checklists, monitoring, safeguards, migration steps, and extra
  features the idea would supposedly need. Some feedback has none. An addition is not a
  requirement until the owner says it is.

The author's own priorities are not additions. A date tied to a real event, and the
author's own scoping ("a smaller wish", "can come later"), are theirs; carry them to the
owner. A timeline that reads as the AI's own planning is an addition.

## 1. Triage the whole round first

Before triaging, find what the owner has already ruled on this system: the colocated
`CLAUDE.md`, the docs, git history and past sessions. Feedback often reopens a decision.
When it does, put the conflict to the owner in those terms — "you ruled X; the author now
asks for Y" — rather than deciding it afresh.

Then, before discussing any item, give the owner one table across the whole round, one
row per item. Columns: the item, the **intent restated as behaviour** (one line, in the
author's business terms), **what Sogverse does today**, and a **recommendation**. The
recommendation is one of:

- **Already built**: verify it on the code or on live staging, and close it.
- **Cheap fit**: existing machinery covers the intent with a small change.
- **Real work**: the intent needs something new.
- **Ask the author**: the intent can't be worked out from the feedback.
- **Drop**: an addition that serves no intent you can name.
- **Nothing to do**: a confirmation or acknowledgement, not a request.

Under the table, list the questions the feedback asks of us. Answer the technical ones.
A question about timing or priority — an estimate, when something can fit in — goes to
the owner; say how big the work is, never when it will land. Then ask which item to start
on.

Rules for filling in the table:

- **Restate the intent as the question the business wants answered**, not as the
  mechanism. The question shows what is actually needed, which is often less than the
  prescription asked for.
- **Check what the code already does before believing the feedback.** That includes the
  feedback's description of what Sogverse already sends or shows: the author's AI saw it
  from the outside, so "missing" can mean built but not visible to it.
- **Check claims about another vendor's tool against that vendor's documentation.** What
  the tool can or can't do often decides how much work an item is.
- **Map the author's words to this repo's concepts.** A term in the feedback may mean
  something different here, or name something that doesn't exist here. Say which concept
  you mapped it to. When the mapping is a guess, put the item under Ask the author rather
  than building on the guess.
- **When the feedback refers to a document we don't have** — a plan, a cheat sheet, a
  colleague's flows — ask the owner for it rather than guessing what it says.
- **When several items share one design**, say so and decide the design once, then check
  that it fits each item. A pattern the author proposes for all of them may fit some
  items and not others.
- **A prescription that breaks a repo rule loses to the rule**, without needing the
  owner's ruling. Name the rule and propose the repo-native way to deliver the intent.
- **Legal, consent and privacy claims in the feedback are the author's AI's opinion.**
  Flag them and give the owner your reading. Don't treat them as settled, and don't
  settle them yourself.

## 2. One item at a time: talk, decide, build

Each item follows the same rhythm: talk it through, take the owner's decision, then send
the build to an agent. Don't batch decisions, and don't start building before the
decision.

- **Find the cheapest change that meets the intent.** Look for machinery in the repo that
  already does something similar, and reuse it before writing anything new. If meeting
  the intent needs real new logic, come back to the owner with what it costs before
  building. The answer may be a cheaper approach that still fits the intent, or deferring
  the item.
- **Deferring is a full outcome.** "Ask the author first" and "later" close an item for
  this round. Say what the open question is, and move on.
- **Each built item gets its own branch, through `/worktree-flow`** — or one branch for
  items that share a design. Nothing merges until the owner reviews the round and decides
  what is ready.
