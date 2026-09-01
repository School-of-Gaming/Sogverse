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
- **Include verification**: how to tell the procedure worked, and — for invariants that
  live in someone else's dashboard — the date and result of the last check against the
  live system.
