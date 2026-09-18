# .claude/skills

Project skills, one directory each with a `SKILL.md`. Most are **procedures run against
live systems** — third-party dashboards, account settings, operational checks, bulk
maintenance, investigations of prod — and this repo keeps no runbooks beside them: a
procedure is written as a skill, never as a doc.

**Why a skill and not a doc:** every skill's name and description is in context in every
session, so the procedure is found when the request arrives, without a pointer anywhere
else to keep alive. A doc is found only if something points at it, and nobody runs a
procedure by hand here — a person asks, and the agent carries it out.

## The description is the trigger

- **Write it as the request that should reach the skill**, in the words a person would use
  ("erase an account", "correct a user's email", "the site was broken"), and name the
  environment it touches. The body loads only once the description has matched.
- **One sentence or two, no more.** Every description costs context in every session.
- **One skill per task a person would ask for.** A skill that bundles unrelated tasks gets a
  description that matches none of them well.
- **Point to other skills by name** (`the remote-supabase skill`), and to repo files by
  repo-root path — a path relative to a skill's own directory means nothing to its reader.

## The body

- **Kept current, never point-in-time.** A skill is trusted at execution time, so a stale
  step is worse than no step. Update it in the same change that alters the procedure.
- **State the why beside each step.** Most procedure shape exists to work around platform
  behaviour that is documented nowhere else; a step whose reason isn't stated gets
  "simplified" away by the next editor.
- **Where a script automates the procedure, the script is the how and the skill is the
  why** — keep both, and keep them agreeing.
- **Include verification: how to tell the procedure worked.**
- **Date a claim about another system's state** — a setting in a third-party dashboard, a
  condition of a live account — with the date and result of the last check against it.
  Nothing in the repo shows when such a claim stops being true, so the date is the only
  signal of how far to trust it. A procedure that verifies itself on every run is not such
  a claim and keeps no run log: its own verification and git history already cover it.
- **A procedure that deletes or writes irreversibly gates on the owner's confirmation in
  its own steps.** It stays model-invocable — hiding it from the model would hide it from
  the very request it exists for — so the gate lives in the body, where the work happens.

## What does not belong here

A rule that governs **code** — what a handler may do, which env var name the app reads, why
a flow is shaped the way it is — belongs in the colocated `CLAUDE.md` or the
`docs/architecture/` doc for that system, where it loads while the code is being written.
A skill about operating that system points there rather than restating it.
