# docs/

The docs a human deliberately maintains and that don't map to one code directory. A doc
that *does* map to one directory belongs in that directory's colocated `CLAUDE.md`;
app-wide rules belong in `src/CLAUDE.md` and repo-wide ones in the root `CLAUDE.md`; open
cross-cutting work belongs in `TODO.md`. When a topic is in none of these, the code is the
source of truth.

## Categories

Each subdirectory is a doc *type* with its own `CLAUDE.md` defining how its docs work —
read that file before adding or editing a doc there. Pick the category by what the doc
**is**, not by what it mentions:

| The doc is… | Home |
|---|---|
| A living description of a cross-cutting system or repo-wide topic, definitive and current | `architecture/` |
| An open exploration — researched, nothing decided | `investigations/` |
| A decided, ready-to-build piece of work | `plans/` |
| The working context of a multi-session project still being shaped — decisions, ideas and tasks; deleted when it is done | `projects/` |
| A frozen story behind how something got the way it is | `records/` |
| Input from outside the repo — things to consider, not things to do | `feedback/` |

A doc that genuinely fits no category sits at this top level — an escape hatch, not a
default. If top-level files start clustering into a recognizable type, that is a new
category: give it a directory and a `CLAUDE.md` in the same change.

## When to write or update one

After non-trivial work, ask *"is a doc now stale or missing?"* The bar: would another
developer — or a future session — get it wrong without this written down? Skip for
renames, typos, and isolated refactors with no behavior change. The categories above
name the trigger: an architecture shift updates its architecture doc in the same change;
a messy bug that left a lesson earns a record; research without a decision lands as an
investigation.

## House style

- **Definitive, not historical.** Describe the current system; no "we used to".
  (`records/` is the deliberate exception — history is its content.)
- **Concise.** Every line is a maintenance liability.
- **Self-contained rules, each with a one-line why.** Never cite a code symbol as an
  illustration — describe the shape instead (the root `CLAUDE.md` Documentation rule).
  Directory and module references for navigation are fine.
- **Edit or remove before adding.** Fold a refinement into the rule that owns its
  territory, and delete a superseded rule in the same change — two rules sharing one
  territory can each be followed while their joint intent is violated.
- **Status headers on anything time-bound.** An investigation, record, or other
  point-in-time doc opens with a bolded status line and a date, so a reader knows what
  to re-verify before trusting it.
- **A measured number carries the date it was taken, how to re-pull it, and the decision
  it is evidence for.** Before writing one, ask whether a future session reading it would
  be helped or confused — a bare magnitude reads as current however old it is, so it gets
  quoted into a plan long after it stopped being true. Annotate a figure that has gone
  stale rather than deleting it: a dated number a reader can calibrate against beats a
  re-pull instruction they may never run. This is the rule above applied *inside* a living
  doc, which has no status header to date its contents.
- **Filenames are kebab-case, named for the subject**; point-in-time docs carry their
  date (`security-audit-2026-03.md`).
