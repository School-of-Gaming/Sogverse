# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Start dev server
npm run dev:stripe       # Start dev server + Stripe webhook listener
npm run build            # Production build
npm run lint             # ESLint
npm run type-check       # TypeScript check (tsc --noEmit)
npm run test             # Vitest unit tests
npm run test:ui          # Vitest with UI
npm run test:smoke       # Build + smoke check (serves a production build, asserts headers/CSP)
```

## Where the rules live

Two nested `CLAUDE.md` files own most of what this repo does. This file is the monorepo:
commands, branching, environment, the database tripwires, testing, code style and the
documentation rules.

**`src/CLAUDE.md` — Sogverse the web app.** It auto-loads whenever a file under `src/` is
read or edited, and it holds everything about the app itself: the roles and their
dashboards, key conventions, the service layer pattern, the Supabase clients, auth,
redirects and origin safety, CSP, layout and scrolling, loading and disabled state, button
order, date and time, the brand and vocabulary rules, partner brands, safety copy, locale
versus spoken language, styling, authored rich text, the UI component reference and the
preview scenes. A nested file loads lazily, so the four app rules that fire *before* any
file is opened are carried here as one-line reminders, with the full rule in the app file:

- **A new API route** lives under `src/app/api/` and must be classified in the integration
  suite's route posture registry — auth posture, how it takes its body, and the test that
  exercises it — or the completeness checks fail the build.
- **Admins are trusted**, including trusted to act only through the admin UI: "an admin
  could reach an invalid state via the raw API" is not a defect worth building for.
- **Caller-supplied redirect targets** go through `resolveInternalPath()`, and any absolute
  URL built from an incoming request derives its origin from `getOrigin(request)` — never
  from the raw `Host` header.
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

For work that wants its own worktree — the usual shape when several things are in
flight at once — `/worktree-flow` runs the whole lifecycle, from cutting the
branch to tearing the worktree down after the merge.

## Documentation

System architecture lives in **colocated `CLAUDE.md` files** next to the code they describe. They auto-load when you (or a future session) work in that directory — no pointer needed here — and are owned like code: update them in the same change that touches their system. Current homes:

| System | Location |
|---|---|
| Sogverse the web app — cross-cutting app rules | `src/` |
| Layout & scrolling | `src/components/layout/` |
| Game accounts (Minecraft, Roblox) | `src/components/game-account/` |
| Partner brand assets (Roblox, Lynx marks) | `src/assets/partners/` |
| Billing portal | `src/services/billing/` |
| Parent PIN | `src/services/pin/` |
| i18n | `src/i18n/` |
| Email templates | `src/lib/email-templates/` |
| Calendar invitations (the mailed `.ics`) | `src/lib/calendar-invitations/` |
| Supabase clients & paged list reads | `src/lib/supabase/` |
| Locations | `src/services/locations/` |
| Product image catalogue | `src/services/product-images/` |
| WhatsApp | `src/services/whatsapp/` |
| Session feeds — shared gedu/family machinery | `src/components/session-feed/` |
| Group workspace — shared gedu/admin group page body | `src/components/group-workspace/` |
| Family product page (a family's club/camp/event page) | `src/components/family/product-page/` |
| Chat components | `src/components/chat/` |
| Voice — scheduled group rooms | `src/components/voice/` |
| Voice — instant rooms | `src/components/voice/instant/` |
| Discord bot | `src/app/api/discord/` |
| SOG-UI — the UI language package and its demo | `packages/sog-ui/` |
| Database / migrations | `supabase/` |
| Testing conventions | `tests/` |

- `docs/` holds the docs a human deliberately maintains and that don't map to one directory, organized by doc *type* — each subdirectory owns its rules in its own `CLAUDE.md`: `architecture/` (living cross-cutting systems and repo-wide topics), `investigations/` (researched, nothing decided), `plans/` (decided and ready to build; **deleted** when the work lands), `runbooks/` (procedures run against live systems), `records/` (frozen stories behind how something got the way it is), `feedback/` (outside input — things to consider, not to do). `docs/CLAUDE.md` carries the category map and house style; a doc fitting no category sits at `docs/` top level. When a topic is in neither a colocated `CLAUDE.md` nor `docs/`, treat the code as the source of truth.
- `TODO.md` is the running list of cross-cutting work we know we want to come back to. Distinct from `docs/`. **When an item is fully done with nothing left to discuss, delete it — don't check it off (`[x]`).** `TODO.md` tracks open work, not a changelog; the record of what was done lives in git history and in the docs/code the work produced. Leave `[ ]`/`[x]` only for partially-done items where the checked sub-points still give context for the open ones. **Additions need the owner's explicit approval**: TODO.md is the owner's backlog — a statement of where the project's attention goes — so on finding something worth tracking, propose it with its justification and write it in only once approved. A mention in a work summary is not approval. (Items an approved plan or the owner's own instruction already names are fine.)

**Rule: Docs state their rules self-containedly — never cite a specific code symbol as an illustration.** A pointer like "see `getParticipationsForGamers` in `participations.service.ts`" rots silently: the function gets renamed, moved, or deleted, and the doc goes on citing something that no longer exists or no longer makes the point. Describe the *shape* of the code instead, so the rule stands on its own. Two things stay fair game: naming an API the rule mandates (a rule like "resolve redirect targets through `resolveInternalPath()`" *is* that name — it cannot be stated without it), and directory or module references used for navigation, which are stable.

## Environment Variables

All env vars are in `.env.local`. Keys for Supabase, Stripe, and Daily.co — including `SUPABASE_DB_PASSWORD` and `SUPABASE_PROJECT_REF` used by CLI commands below.

## Database

Migrations in `supabase/migrations/`. The migration workflow (push → regenerate types —
`schema.sql` is CI-maintained and must not be dumped or edited by hand), the "read
current state from `schema.sql`/`database.types.ts`, not migrations" rule, the
generated-nullability fix patterns, and the access-control rules
all live in **`supabase/CLAUDE.md`** (auto-loads when you work under `supabase/`). The
always-on tripwires:

- **`database.types.ts` is purely auto-generated — never hand-edit it.** Push the
  migration first, then regenerate. Convenience aliases (`Profile`, `UserRole`, …) live
  in `src/types/index.ts`; after regenerating, add aliases for any new tables/enums.
- **A migration that adds/modifies functions or tables must be pushed and types
  regenerated before committing** — DB tests and type-check depend on
  `database.types.ts` matching the schema.
- **Every new object (table, view, sequence, function) needs an explicit `GRANT`** — no
  Data API access by default, not even for `service_role`. Grant per role. A function
  exposed to `authenticated`/`anon` additionally has to be **classified in the DB test
  suite's authorization spine** — role-gated (guard-first body + its permitted roles) or
  self-scoping (named to a scope test) — and a table that gains a write grant needs a
  write-IDOR case. The spine's completeness checks fail the build otherwise.
- **All new tables must enable RLS**, and **RLS INSERT/UPDATE policies must authorize
  both the actor AND the target** (checking only `column = auth.uid()` is an IDOR hole).

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
- **A new API route has to be classified in the integration suite's route posture
  registry** — its auth posture (with a written reason for anything that is not
  role-gated), how it takes its body, and the test that exercises it. The registry's
  completeness checks fail the build otherwise, and they also fail on an undeclared
  handler method, an unjustified service-role import, and a named test that does not
  exist or does not reference the route.

## Code Style

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
