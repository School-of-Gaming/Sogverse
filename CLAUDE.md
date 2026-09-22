# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Start dev server
npm run dev:stripe       # Start dev server + Stripe webhook listener
npm run build            # Production build
npm run lint             # ESLint
npm run type-check       # TypeScript check (tsc --noEmit)
npm run gates            # All landing gates: lint + type-check + translations + tests (runs all, reports every failure)
npm run test             # Vitest unit tests
npm run test:ui          # Vitest with UI
npm run test:smoke       # Build + smoke check (serves a production build, asserts headers/CSP)
```

**When served output disagrees with the source, the `.next` cache is stale — delete it.**
It shows as type-check errors in routes that no longer exist, CSS or JS lagging a branch
switch, or a Turbopack panic on every page ("creating new process … 0xc0000142") after a dev
server died mid-write. Restarting the server does not clear it, and a stale and a fresh
build can serve the same chunk URL, so compare chunk contents against the source, never the
URL. To prove the source innocent first, compile `src/app/globals.css` standalone through
`postcss` with `@tailwindcss/postcss` from the repo root. After deleting, hard-reload the
browser.

## Where the rules live

Rules live next to the code they govern, in nested `CLAUDE.md` files that load when that
code is opened — the Documentation section lists every one of them. Two are broad enough
to be worth naming up front. This file, the root, is the monorepo: commands, branching,
environment, the database tripwires, testing, code style and the documentation rules.

**`src/CLAUDE.md` — Sogverse the web app.** It auto-loads whenever a file under `src/` is
read or edited, and it holds everything about the app itself: the roles and their
dashboards, key conventions, the service layer pattern, the Supabase clients, auth,
redirects and origin safety, CSP, layout and scrolling, loading and disabled state, button
order, date and time, the brand and vocabulary rules, partner brands, safety copy, locale
versus spoken language, styling, authored rich text, the UI component reference and the
preview scenes. A nested file loads lazily, so the four app rules that fire *before* any
file is opened are carried here as one-line reminders, with the full rule in the app file:

- **A new API route** lives under `src/app/api/` and is classified in the integration
  suite's route posture registry — the Testing section below says how.
- **Admins are trusted**, including trusted to act only through the admin UI: "an admin
  could reach an invalid state via the raw API" is not a defect worth building for, and a
  state the UI cannot produce fails loudly at the schema rather than corrupting silently.
- **Caller-supplied redirect targets** go through `resolveInternalPath()`, and any absolute
  URL built from an incoming request derives its origin from `getOrigin(request)` — never
  from `new URL(request.url).origin` or the raw `Host` header.
- **Any auth state change** — sign-in, sign-out, account switch — ends in a full-page
  navigation that unloads the document; `router.push()` is not enough.

**`packages/sog-ui/CLAUDE.md` — SOG-UI, the UI language package.** Every UI opinion belongs
to it, and it is the app's brand authority. Read it before any UI work: it does not
auto-load when working under `src/`. Sogverse follows it one construct at a time
(`packages/sog-ui/docs/adoption.md`); a construct not yet adopted is still governed by the
rule written in `src/CLAUDE.md`, and that rule leaves the app file with the adoption that
retires it.

## Branching

**Rule: branch off the latest `dev`, unless told otherwise.** `dev` is the
integration branch; `main` is the release branch and trails it by hundreds of
commits, so anything cut from `main` — or from a `dev` that hasn't been fetched —
starts life missing work it will later collide with. Fetch and fast-forward
first, then branch. This holds however the branch is created, including tooling
that offers to pick a base for you: the default is usually `origin/<default
branch>`, which is `main` here and is the wrong answer.

Branches are named `feat/<kebab-summary>`; feature work merges back into `dev`
with a real merge commit (`--no-ff`) whose subject reads `Merge the <thing> into
dev`. Releases go `dev` → `main` through the `/pr-dev-to-main` command.

**Rule: `dev` is always safe to push, including commits on it that are not
yours.** A commit on `dev` means the work is ready for staging — that is what
committing there says. An unpushed commit on local `dev` is a push delayed for
convenience, because more was known to be arriving soon, never one held back for
safety. So a session landing its own work does not stop to ask about somebody
else's unpushed commit: when local `dev` and `origin/dev` have diverged, rebase
the local commits onto `origin/dev`, merge, and push the lot.

For work that wants its own worktree — the usual shape when several things are in
flight at once — `/worktree-flow` runs the whole lifecycle, from cutting the
branch to tearing the worktree down after the merge.

## Documentation

System architecture lives in **colocated `CLAUDE.md` files** next to the code they describe. They auto-load when you (or a future session) work in that directory — no pointer needed here — and are owned like code: update them in the same change that touches their system. Current homes:

| System | Location |
|---|---|
| Sogverse the web app — cross-cutting app rules | `src/` |
| Layout & scrolling | `src/components/layout/` |
| Cookie consent and the Meta Pixel | `src/components/consent/` |
| Game accounts (Minecraft, Roblox) | `src/components/game-account/` |
| Partner brand assets (Roblox, Lynx marks) | `src/assets/partners/` |
| Billing portal | `src/services/billing/` |
| Parent PIN | `src/services/pin/` |
| Gedu profiles, certification and the record check | `src/services/gedu/` |
| Session substitutions — absences, offers and the sub an admin seats | `src/services/session-substitution/` |
| i18n | `src/i18n/` |
| Email templates | `src/lib/email-templates/` |
| Calendar invitations (the mailed `.ics`) | `src/lib/calendar-invitations/` |
| Supabase clients & paged list reads | `src/lib/supabase/` |
| Locations | `src/services/locations/` |
| Product image catalogue | `src/services/product-images/` |
| WhatsApp | `src/services/whatsapp/` |
| Session feeds — shared gedu/family machinery | `src/components/session-feed/` |
| Group workspace — shared gedu/admin group page body | `src/components/group-workspace/` |
| Municipality invoicing — the CFO's monthly invoice page and its Finvoice export | `src/components/admin/municipality-invoicing/` |
| Invoice customers — the Fennoa buyers a municipality club is invoiced to | `src/components/admin/invoice-customers/` |
| Family product page (a family's club/camp/event page) | `src/components/family/product-page/` |
| Topic prep — the "Before the first session" guide | `src/components/topic-prep/` |
| Chat components | `src/components/chat/` |
| Voice — scheduled group rooms | `src/components/voice/` |
| Voice — instant rooms | `src/components/voice/instant/` |
| Discord bot | `src/app/api/discord/` |
| Partner API (Lynx Educate) | `src/app/api/partner/` |
| SOG-UI — the UI language package and its demo | `packages/sog-ui/` |
| Database / migrations | `supabase/` |
| Testing conventions | `tests/` |
| Operational scripts — policy and the output folder | `scripts/` |

- `docs/` holds the docs a human deliberately maintains and that don't map to one directory, organized by doc *type* — each subdirectory owns its rules in its own `CLAUDE.md`: `architecture/` (living cross-cutting systems and repo-wide topics), `investigations/` (researched, nothing decided), `plans/` (decided and ready to build; **deleted** when the work lands), `records/` (frozen stories behind how something got the way it is), `feedback/` (outside input — things to consider, not to do). `docs/CLAUDE.md` carries the category map and house style; a doc fitting no category sits at `docs/` top level. When a topic is in neither a colocated `CLAUDE.md` nor `docs/`, treat the code as the source of truth.
- `TODO.md` is the running list of cross-cutting work we know we want to come back to. Distinct from `docs/`. **When an item is fully done with nothing left to discuss, delete it — don't check it off (`[x]`).** `TODO.md` tracks open work, not a changelog; the record of what was done lives in git history and in the docs/code the work produced. Leave `[ ]`/`[x]` only for partially-done items where the checked sub-points still give context for the open ones. **Additions need the owner's explicit approval**: TODO.md is the owner's backlog — a statement of where the project's attention goes — so on finding something worth tracking, propose it with its justification and write it in only once approved. A mention in a work summary is not approval. (Items an approved plan or the owner's own instruction already names are fine.) **The approval is not written into the item** — no "owner-approved" stamp, no date: an item's presence in the file is the approval, and a stamp saying so is space spent on nothing the reader can act on.

**Rule: Docs state their rules self-containedly — never cite a specific code symbol as an illustration.** A pointer like "see `getParticipationsForGamers` in `participations.service.ts`" rots silently: the function gets renamed, moved, or deleted, and the doc goes on citing something that no longer exists or no longer makes the point. Describe the *shape* of the code instead, so the rule stands on its own. Two things stay fair game: naming an API the rule mandates (a rule like "resolve redirect targets through `resolveInternalPath()`" *is* that name — it cannot be stated without it), and directory or module references used for navigation, which are stable.

**Rule: A doc states only what a reader would otherwise get wrong — omit what Claude does by default.** Every line of a `CLAUDE.md` is in context whenever its directory is, so a rule guarding against a direction nobody would take costs every session and plants the idea it guards against. Before writing a line, ask whether Claude would get it wrong without it. Don't announce a new direction, a retired concept, or a migration from an old one — a future reader never knew the old way — and don't point at what is already in context, such as a skill, whose description loads in every session.

**Rule: Knowledge about this repo goes in a `CLAUDE.md` (or a doc or skill), never in local memory.** Local memory is not version-controlled and is lost between machines. It holds only three things: preferences that belong to the owner alone, quirks of the machine the session runs on, and personal data about real people, which never enters the repo.

## Environment Variables

All env vars are in `.env.local`. Keys for Supabase, Stripe, and Daily.co — including `SUPABASE_DB_PASSWORD` and `SUPABASE_PROJECT_REF`, which the Supabase CLI commands in `supabase/CLAUDE.md` read from there.

## Database

Migrations in `supabase/migrations/`. The migration workflow, the same in a worktree as
on `dev` directly, lives in **`supabase/CLAUDE.md`**, together with `schema.sql`'s
CI-maintained status (never dumped or edited by hand), the "read current state from
`schema.sql`/`database.types.ts`, not migrations" rule, the generated-nullability fix
patterns, and the access-control rules; that file auto-loads when you work under
`supabase/`. The always-on tripwires:

- **Agents never write to staging or prod on their own initiative** — a write a piece of
  work needs goes to a seed file or to a local database. The rule and what authorizes a
  write are in `supabase/CLAUDE.md`.
- **`database.types.ts` is purely auto-generated — never hand-edit it.** Convenience
  aliases (`Profile`, `UserRole`, …) live in `src/types/index.ts`; after regenerating, add
  aliases for any new tables/enums.
- **A migration that adds/modifies functions or tables regenerates `database.types.ts`
  before committing, by the workflow in `supabase/CLAUDE.md`** — DB tests and type-check
  depend on the generated file matching the schema.
- **Every new object (table, view, sequence, function) needs an explicit `GRANT`** — no
  Data API access by default, not even for `service_role`. Grant per role. A function
  exposed to `authenticated`/`anon` additionally has to be **classified in the DB test
  suite's authorization spine** — role-gated (guard-first body + its permitted roles) or
  self-scoping (named to a scope test) — and a table that gains a write grant needs a
  write-IDOR case. The spine's completeness checks fail the build otherwise.
- **All new tables must enable RLS**, and **RLS INSERT/UPDATE policies must authorize
  both the actor AND the target** (checking only `column = auth.uid()` is an IDOR hole).
- **The many database functions are the design, not drift.** The browser reads the
  database directly, so a function is where a read crosses an access boundary and hands
  back a narrowed slice. When something is a function, what it returns, and why moving the
  logic into TypeScript was measured and turned down, are in `supabase/CLAUDE.md`
  ("Logic lives in database functions on purpose").

## Testing

Tests are in `tests/`, split into `unit/`, `integration/`, `db/`, and `smoke/`. The
classification rules and the per-category conventions (DB test helpers, integration-test
route-handler mocking, unit setup) live in **`tests/CLAUDE.md`** (auto-loads when you
work under `tests/`). Two things worth knowing from anywhere:

- **`npm run test` runs `unit/` + `integration/`** (node by default, jsdom for `.tsx`
  component tests — see `tests/CLAUDE.md`). DB tests need a real Postgres
  and run in **CI only** — we have no local stack — so exercise them by pushing your
  branch, not locally.
- **Shared mock factories live in `tests/mocks/`** — add new mocks there rather than
  duplicating across files.
- **`smoke/` is the only CI job that builds the app**, and it asserts security headers
  and the per-request CSP against a served production build over plain HTTP. No browser
  is launched there; a test that needs one does not belong in that directory.
- **There are no flaky tests. A test that fails intermittently is a broken test and MUST
  be fixed.** Passing on a re-run or in isolation proves nothing about the ordering that
  failed; the intermittence is a real non-determinism (an effect racing an assertion, a
  mock shared across cases, a timer leaking from a neighbour) and the fix is its root
  cause, in the test or in the component — never a retry, a longer timeout, a skip, or a
  note that it is "unrelated to this branch". It is fixed on the branch that saw it fail,
  before that branch lands, and proven by repeated runs under load plus the full suite.
- **A new API route has to be classified in the integration suite's route posture
  registry** — its auth posture (with a written reason for anything that is not
  role-gated), how it takes its body, and the test that exercises it. The registry's
  completeness checks fail the build otherwise, and they also fail on an undeclared
  handler method, an unjustified service-role import, and a named test that does not
  exist or does not reference the route.

## Code Style

### Site copy is UK English; code and database identifiers are American English

**Rule: what a reader sees is spelled the British way, and what a developer types is
spelled the American way.** Strings in `messages/`, emails and every other user-facing
sentence take `-ise`, `-our` and `-re`; identifiers — tables, columns, enum values,
functions, types, variables, files, message *keys* — take the American spelling, because
that is what the surrounding language, libraries and tooling already speak. The two
halves may therefore name one thing with two different words, and that is the design
rather than a slip to tidy up: a rename that "fixes" a spelling has to say which half it
is changing, and changing one half never obliges the other.

### Lint must be clean — treat warnings as design signals

**Rule: `npm run lint` must produce zero errors and zero warnings.** Our lint config is strict on purpose. When lint flags a line, resist the urge to silence it with a one-line patch (a cast, a disable comment, a throwaway rename). Stop and ask: *why* is the linter unhappy? The flagged line is usually a symptom — the real problem is often a design issue one or two levels up (wrong type at the boundary, a function doing two things, state living in the wrong place, a missing abstraction). Fix the underlying cause so the warning goes away naturally.

**Rule: Suppressing a lint rule (`eslint-disable`, `// @ts-expect-error`, etc.) requires strong justification and an inline `--` description explaining it.** Suppression is a last resort, not a shortcut. Only suppress when you've concluded the rule genuinely does not apply to this specific case — and write *why* directly next to the disable comment in the form `// eslint-disable-next-line some-rule -- reason here`. "Lint was noisy" is not a justification. This is mechanically enforced by `@eslint-community/eslint-comments/require-description` — an undescribed disable will fail lint.

### Convert recurring bug classes to correctness-by-mechanism

**Rule: when the same class of bug keeps recurring on a surface — or a single instance would be expensive (money, auth, children's data) — and the rules for doing it right exist only as convention (docs, comments, review culture), the fix is the *class*, not the instance: convert the surface to correctness-by-mechanism.** Four steps, in order:

1. **Enumerate the surface as a regeneration command** (a grep, a glob, a catalog query) — never a frozen list; snapshots drift, commands don't.
2. **Classify every element by intent, machine-readably** — annotations a test can consume. The classification answers one question: *what would a missing guard mean here — a bug, or the design?* An element that can't be classified is the first finding.
3. **Build the CI completeness check**: every element carries exactly one classification, and every classification names its verifier. This is the load-bearing step — allowlist growth is the failure mode of every allowlist design, and the completeness check is what polices it.
4. **Ship the primitive that makes conforming the cheapest path** — a guard function, a wrapper, a canonical template, giving step 3 a single greppable call site to require.

The first two without the last two is an audit, not a fix: prose decays, a failing test doesn't, and fixing instances leaves the class alive. Keep the scope to one surface and one bug class per pass. Three standing instances show the shape: DB grants + RLS presence (the access-control DB test), DB function bodies (the authorization spine — `docs/architecture/db-authorization.md`), and the HTTP route layer (the posture registry — `docs/architecture/route-boundary.md`).
