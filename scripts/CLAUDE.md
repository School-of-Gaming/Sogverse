# scripts/

Operational scripts run by hand — reports, backfills, account lifecycles, live-event
monitors. They vary too much for one mechanism to govern, so this file is policy, applied
with judgement script by script rather than enforced by a check. Helpers shared between
scripts live in `scripts/lib/`.

## Output

**Rule: a script's working artifacts go under `scripts/output/<script-name>/` — never the
repo root, never the working directory.** `scripts/output/` is gitignored once, so output
cannot reach a commit and no script needs an ignore entry of its own.
`outputDir(import.meta.url)` from `scripts/lib/output.mjs` resolves and creates the
folder, anchored on the script's location so a run from any directory lands in the same
place.

Whether a file is output is a judgement call — decide by what the file *is*:

- **Output** — what a run produces for a person to read, keep or hand on: logs, reports,
  raw API dumps, handouts, plan files, pre-deletion snapshots. It records a moment and
  nobody reviews it in a diff.
- **Source** — a file generated for the repo to commit goes where that source lives: a
  seed migration in `supabase/migrations/`, a staged reconciliation in
  `supabase/reconciliations/`, docs rewritten in place.
- **Cache** — re-downloadable input goes under `node_modules/.cache/`, which a clean
  install clears.

A file that fits none of these, or plausibly two, is a question for the owner, not a
guess.

- **Output can carry secrets** — the Minecraft Education handout holds live passwords. To
  share one, move it out of the repo, never into a tracked path.
- **An explicit path flag may override the folder** (`--out`, `--log`); the default is
  always the output folder.
- **Nothing checks this**, so writing or editing a script that writes files is the moment
  to apply it.
