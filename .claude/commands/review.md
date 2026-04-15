---
name: review
description: Focused code review of the current branch against local dev.
---

Perform a focused code review of the current branch against local `dev`.

**This is a static review only.** Do not run type-check, lint, or tests — CI handles those. Do not apply any fixes. Produce the review, then wait for the user to pick what to address.

## Step 1 — Gather the diff

Run `git diff dev...HEAD` against **local `dev`** (do not fetch, do not use `origin/dev`). Identify every changed file.

## Step 2 — Decide how to read and whether to split

**Reading files:** Start with the diff. Only read a full file when context genuinely matters — understanding callers, verifying a type change, checking surrounding logic a hunk depends on. Skip full reads for message/locale files, generated types (`database.types.ts`), snapshots, and anything where the diff is self-contained. Burning tokens on huge files with no logic is a waste.

**Subagents:** Decide based on the *nature* of the change, not file count. A mechanical rename across 50 files is one agent. A single gnarly file with subtle concurrency is one agent. Genuinely multi-domain changes (e.g. migration + RPC + API route + client + webhook) may benefit from splitting by domain. Use judgment — most reviews should be single-pass.

## Step 3 — Review

Read the code with these concerns in mind. Do not produce a section per concern — the output is one ranked list informed by all of them.

- **Architecture & design.** Does the change make sense? Follow existing patterns when they're good — but if the existing pattern is wrong, say so rather than doubling down on it.
- **Bugs & logic errors.** Off-by-one, wrong comparisons, inverted conditions, stale closures, missing query invalidations after mutations, incorrect dependency arrays.
- **Complexity.** If something is done in a complex way, is there strong justification? Could a simpler approach work?
- **Duplication.** Logic, types, or UI patterns that already exist elsewhere. Aim for single point of control — but don't go crazy with premature abstraction.
- **Race conditions & timing.** Any `setTimeout` / `setInterval` used to paper over network timing is a bug waiting to happen — flag it. Watch for read-then-write without locking, async ordering assumptions, and `useEffect` used to sync state that should be derived.
- **Tests.** High-value tests only — ones that assert real behavior and could catch bugs or regressions. Do not flag missing tests unless the code is genuinely high-risk (auth, payments, RLS, SECURITY DEFINER RPCs, financial logic). Flag low-value tests (coverage-for-coverage) that should be removed or rewritten.
- **Security.** Adopt an adversarial mindset. Admins are always trusted. For every other role, ask: "If I were an attacker, how could I see or do something I shouldn't?" This app manages child data — privacy matters. Watch for IDOR, missing auth checks, RLS gaps, and payment/financial manipulation.
- **Performance.** Flag *obvious* issues (N+1 queries, waterfall fetches, expensive work in hot paths). Do not flag speculative optimizations.

**Error-handling restraint:** Do *not* flag missing try/catch, missing null checks, or missing logging unless the absence would break a user flow or create bad UX. Errors caught and logged "for safety" are noise, not a fix. Only surface error-handling gaps that have a concrete user-visible consequence.

## Step 4 — Output

Produce one ranked list, most important to least important. Each finding includes:

- `file:line` (or line range)
- What the issue is
- Why it matters
- A suggested direction

Only include findings that are **actionable** and represent a **real improvement**. No praise, no "consider refactoring" fluff, no nitpicks that don't matter. If there's nothing to flag in a category you considered, don't mention it.

After the list, stop. Wait for the user to choose what to address. If they pick an item whose tradeoffs are non-obvious, walk through the options before making changes.
