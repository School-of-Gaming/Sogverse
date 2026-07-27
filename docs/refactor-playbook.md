# The Hindsight Refactor Playbook

**Status:** living template. Use it when a backend surface has accumulated
correctness-by-convention and needs converting to correctness-by-mechanism. Extracted
from two instances of the same arc: the 2026-03 security remediation
(`docs/SECURITY_REPORT.md`) and the DB authorization refactor
(`docs/db-authorization-architecture.md`). Each future instance gets its own doc
following `db-authorization-architecture.md`'s shape (problem → current state →
solution → justification → phased plan → out-of-scope); this doc only holds the
template those docs instantiate.

## When a surface qualifies

All three must hold:

1. The rules for doing it right exist — but only as convention (docs, comments,
   review culture, copy-paste of a known-good example).
2. A deviation fails no automated check; it sits exposed until someone goes looking.
3. The same class of bug has recurred, or the surface is one where a single instance
   is expensive (money, auth, children's data).

## The loop

Four steps, in order. The refactor is not done until all four exist — the first two
without the last two is an audit, not a fix.

1. **Enumerate the surface exhaustively.** Every element of one kind: every function
   granted to `authenticated`, every route handler, every table. Express the
   enumeration as a regeneration command (a grep, a glob, a catalog query), never a
   frozen list — snapshots drift, commands don't.
2. **Classify every element by intent, machine-readably.** Annotations a test can
   consume, not comments. The classification answers one question: *what would a
   missing guard mean here — a bug, or the design?* An element that can't be
   classified is the first finding.
3. **Build the completeness check.** A CI test asserting that every element of the
   surface carries exactly one classification, and that every classification names
   its verifier. This is the load-bearing step: allowlist growth is the failure mode
   of every allowlist design, and the completeness check is what polices it. Without
   it the classification rots into a rubber stamp within months.
4. **Ship the primitive that makes conformance the cheapest path.** A guard function,
   a wrapper, a canonical template — new work conforms by default because conforming
   is less code than deviating. The primitive also gives step 3's static checks a
   single greppable call site to require.

## Why the loop works (and reactive fixing doesn't)

- **It tests the property, not a proxy.** "Sign in as the wrong role and confirm
  refusal" verifies authorization; "confirm someone meant to expose this" verifies an
  intention. Only the former catches the recurring bug class.
- **It names the class, not the instances.** The 2026-03 audit's findings were each
  the same bug — a privileged operation missing its guard — fixed one migration at a
  time. Fixing instances leaves the class alive; the class dies when a new instance
  fails CI before it ships.
- **Prose decays; a failing test doesn't.** What ended the audit's bug class was the
  access-control test, not the report. Rules written down but not enforced are
  convention again within a quarter.
- **Scope discipline is why the prior instances finished.** One surface, one bug
  class, one spine per refactor. Every instance doc carries an explicit out-of-scope
  section; adjacent surfaces get their own instance later.

## Instances

| Surface | Status | Where |
|---|---|---|
| DB grants + RLS presence | Done (2026-03) | `docs/SECURITY_REPORT.md`; enforced by the DB access-control test |
| DB function bodies + RLS behavior | In flight | `docs/db-authorization-architecture.md` |
| HTTP route layer | Next — stub below | — |
| Data validity (constraints) | Future | Deferred by the db-auth doc's out-of-scope list; instances accumulate in `TODO.md` |

## Next instance stub: the HTTP route layer

Not yet a plan — the seed for one. Whoever picks this up writes the full instance doc
first.

- **Surface:** route handlers under `src/app/api/` (enumerate by glob over `route.ts`
  files).
- **Classifications:** two independent axes per route — *auth posture* (role-gated /
  any-authenticated / deliberately public) and *body discipline* (parsed through a
  contracts schema / no body by design).
- **Completeness check:** a test enumerates the route files and fails on any route
  carrying no posture declaration, plus a check that the service-role client's import
  sites match a justification-carrying registry (the same move that pinned `anon`
  write grants at zero).
- **Primitive:** a route-definition wrapper bundling the role gate, the contract body
  parse, and error-code→HTTP mapping, so a new route gets all three from one call.
- **Sequencing input:** the db-auth refactor's Phase 3 sweep already triages every
  admin-client route into a write model. Capture that triage machine-readably as it
  happens — it is this instance's step 2, half done. Do not run this instance's sweep
  before that one lands, or every route gets triaged twice.
