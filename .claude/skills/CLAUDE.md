# .claude/skills

- **Kept current, never point-in-time.** A procedure skill is trusted at execution time, so
  a stale step is worse than no step. Update it in the same change that alters the
  procedure.
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
- **A procedure that deletes or writes irreversibly stays model-invocable and gates on the
  owner's confirmation in its own steps** — hiding it from the model would hide it from the
  very request it exists for.
- **A rule that governs code belongs where the code is**, in the colocated `CLAUDE.md` or
  the `docs/architecture/` doc for that system; a skill about operating the system points
  there rather than restating it.
