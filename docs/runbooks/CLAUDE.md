# docs/runbooks

Procedures a person executes against live systems: third-party dashboards, account
settings, operational checks, bulk maintenance.

- **Kept current, never point-in-time.** A runbook is trusted at execution time, so a
  stale step is worse than no step. Update it in the same change that alters the
  procedure.
- **State the why beside each step.** Most runbook shape exists to work around platform
  behaviour that is documented nowhere else; a step whose reason isn't stated gets
  "simplified" away by the next editor.
- **Where a script automates the procedure, the script is the how and the runbook is the
  why** — keep both, and keep them agreeing.
- **Include verification: how to tell the procedure worked.**
- **Date a claim about another system's state** — a setting in a third-party dashboard, a
  condition of a live account — with the date and result of the last check against it.
  Nothing in the repo shows when such a claim stops being true, so the date is the only
  signal of how far to trust it. A procedure that verifies itself on every run is not such
  a claim and keeps no run log: its own verification and git history already cover it.
