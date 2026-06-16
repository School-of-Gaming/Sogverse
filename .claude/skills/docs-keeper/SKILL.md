---
name: docs-keeper
description: Reminds when to update Sogverse docs and the house style they should follow. Trigger when finishing work that introduces a cross-cutting rule, changes a subsystem's architecture, fixes a tricky bug worth remembering, or surfaces a follow-up worth tracking. Skip for trivial changes.
---

# docs-keeper

Nudges when docs need updating and keeps them in the project's house style. There are two homes for docs — picking the right one is half the job.

## Where a doc belongs

- **Colocated `CLAUDE.md`** (in the directory the system lives in) — living architecture for one subsystem that maps to a single directory. It auto-loads when Claude works there, and is owned like code: updated in the same change that touches the system. **This is the default for system/feature docs.** Current homes: layout (`src/components/layout/`), PIN (`src/services/pin/`), i18n (`src/i18n/`), email (`src/lib/email-templates/`), locations (`src/services/locations/`), whatsapp (`src/services/whatsapp/`), voice (`src/components/voice/` and `.../instant/`), discord (`src/app/api/discord/`).
- **`docs/`** — docs a human deliberately maintains and that don't map to one directory: cross-cutting architecture spanning many systems (products, db-authorization, performance), point-in-time records (security audit, bug/fix write-ups, gap analyses), ops runbooks (slack, admin quota, stripe testing).
- **Root `CLAUDE.md`** — project-wide rules that apply everywhere, `**Rule:**`-prefixed.
- **`TODO.md`** — cross-cutting follow-ups not tied to one system.

Decision: does it describe **one subsystem that lives in one directory**? → colocated `CLAUDE.md` (create one if the system has a clear home and none exists). Does it **span the codebase, record a moment in time, or document ops**? → `docs/`. Is it a **rule that applies everywhere**? → root `CLAUDE.md`. If it genuinely fits nowhere, ask before creating a new top-level doc.

## When to update

After wrapping up non-trivial work, ask *"is a doc now stale or missing?"* when:

- A subsystem's architecture shifted, or a new one shipped → its colocated `CLAUDE.md`
- A new cross-cutting rule emerged → root `CLAUDE.md`
- A tricky bug got a fix worth remembering → the actionable rule goes into the relevant colocated `CLAUDE.md` (or root `CLAUDE.md`); the deep investigation, if worth keeping, into a `docs/*-bug.md` record
- A migration changed data shape, added an RPC, or shifted access patterns → the matching architecture doc
- A follow-up surfaced to remember later → the system's "Known follow-ups" section, or `TODO.md` if unattached
- A `TODO.md` item was completed or de-scoped → remove it

Skip for: renames, typos, CSS tweaks, dep bumps, straightforward CRUD, isolated refactors with no behavior change.

The bar: *would another developer — or a future session — get it wrong without this written down?*

## How docs should read

- **Audience-appropriate.** A colocated `CLAUDE.md` is read by future Claude sessions — terse, factual, actionable, no throat-clearing.
- **Definitive, not historical.** Describe the current system. No "we used to" / "this was changed to".
- **Concise.** Bullets and code over prose. Every line is a maintenance liability.
- **Self-contained rules.** State each rule so it stands on its own, with a one-line *why* (the constraint or incident behind it). Avoid brittle pointers to specific symbols or `file:line` that rot — describe the pattern/shape instead; stable directory/module references for navigation are fine.
- **Surgical updates.** Don't rewrite still-accurate sections.
