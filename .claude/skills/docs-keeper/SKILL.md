---
name: docs-keeper
description: Reminds when to update Sogverse docs and the house style they should follow. Trigger when finishing work that introduces a cross-cutting rule, changes a subsystem's architecture, fixes a tricky bug worth remembering, or surfaces a follow-up worth tracking. Skip for trivial changes.
---

# docs-keeper

Nudges contributors when it's time to update docs and keeps them reading in the project's house style.

## Moments to suggest updating docs

After wrapping up work, ask *"should a doc be updated?"* if any of these are true:

- A new cross-cutting rule emerged → `CLAUDE.md`
- A subsystem's architecture shifted, or a new one shipped → `docs/*-architecture.md`
- A tricky bug got a fix worth remembering → matching architecture doc, a `**Rule:**` in `CLAUDE.md`, or a dedicated `docs/*-fix.md`
- A migration changed data shape, added an RPC, or shifted access patterns → matching architecture doc
- A follow-up surfaced that needs to be remembered later:
  - Tied to a specific feature → that feature's `## Future improvements` section in its architecture doc
  - Cross-cutting or unattached → `TODO.md`
- A `TODO.md` item was completed or de-scoped → remove it

Skip for: renames, typos, CSS tweaks, dep bumps, straightforward CRUD, isolated refactors with no behavior change.

The bar: *would another developer be confused or get it wrong without this written down?*

## Doc layout

- **`CLAUDE.md`** — project-wide rules, `**Rule:**`-prefixed, grouped by section, with a one-line *why*.
- **`docs/*-architecture.md`** — one per subsystem (groups, voice-chat, sorg-token, etc.). Cross-cutting concerns (i18n, email, layout, locations) live as siblings. Each can carry a `## Future improvements` section for feature-specific follow-ups.
- **`docs/*-bug.md` / `*-fix.md` / `*-audit-findings.md` / `SECURITY_REPORT.md`** — point-in-time records when context outlives the fix.
- **`TODO.md`** — things to come back to that aren't tied to a single feature doc. Items are grouped by section and carry enough context (symptom, why, suggested approach, risk) to pick up cold.

If a doc doesn't fit anywhere obvious, ask before creating a new one.

## How docs should read

- **Definitive, not historical.** Describe the current system. No "we used to" or "this was changed to".
- **Concise.** Bullets and code over prose. Every line is a maintenance liability.
- **Surgical updates.** Don't rewrite still-accurate sections.
- **Context with the rule.** When stating a rule, include a one-line *why* — the constraint or incident behind it.
- **Anchor with file paths.** `src/...` references so readers can navigate to the code.
