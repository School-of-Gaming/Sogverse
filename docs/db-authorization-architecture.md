# Database Authorization Architecture

**Status:** target architecture + migration plan. Parts are already in place (the
threat model and the SECURITY DEFINER conventions are how we write new code today);
the verification spine and the route sweep are not yet built. This is the single
source of truth for the refactor — when someone says "let's do the DB authorization
refactor," this is the doc to read and act on.

---

## 1. The problem

Authorization in this app is enforced in several places at once — PostgreSQL grants,
RLS policies, role checks inside `SECURITY DEFINER` functions, and `requireRole` in
route handlers. That layering is correct and deliberate (defense in depth). The
problem is not the design — it's that **the design is enforced by convention, not
mechanically**, and the one automated check we have verifies the wrong half.

Three concrete gaps:

1. **The automated gate is grant-level only.** Our DB test confirms that every
   function callable by `authenticated`/`anon` is intentionally exposed (someone
   meant to `GRANT` it) and that every table has RLS. It does **not** verify that an
   exposed function's *body* enforces the access its grant implies. An admin-only RPC
   granted to `authenticated` with a forgotten role check passes every test — it
   looks identical, to the gate, to a function that is genuinely open to everyone.

2. **The "guard first, re-check the role inside" rule is written but unenforced.**
   Our convention says every privileged function must re-check the caller's role as
   its first action and raise a canonical forbidden error. Every function follows it
   today — by copy-paste discipline, with the raise block hand-written each time.
   Nothing stops the next function from forgetting it, and nothing would catch it.

3. **The actor/target asymmetry in RLS is only half-tested.** Our rule is that an
   INSERT/UPDATE policy must authorize both the *actor* (the caller is who they say)
   and the *target* (the caller is allowed to reference this specific row). In
   practice only the actor half is mechanically verified. The target half — the half
   that prevents IDOR — is checked by reading the policy, not by a test.

The history makes the stakes concrete. The 2026-03 security audit
(`docs/SECURITY_REPORT.md`) found, among others: a trigger that trusted user-supplied
metadata to assign roles (privilege escalation to admin), an RLS policy that let any
customer link themselves to any child (IDOR), and a financial RPC granted to every
authenticated user with no internal role check (unlimited token minting). These were
fixed **reactively**, one migration per finding. Each was the *same class of bug* —
a privileged DB operation missing its body-level guard — and each sat exposed until
someone went looking. The structural defenses added during that audit (the catalog
test, the private-by-default convention, the CLAUDE.md rules) are the **grant-level**
half of the answer. This refactor builds the **body-level** half, so the next
instance of that class fails a test before it ships rather than after two weeks in
production.

---

## 2. Current state (reference)

You need this to act on the plan, so it lives here rather than in a separate doc.

### The three layers PostgreSQL applies, in order

1. **Grants.** `GRANT … ON <table> TO <role>`. Without the grant, PostgreSQL rejects
   the operation with `permission denied for table` *before* it ever consults RLS.
   The `authenticated` role has exactly the grants migrations bestow.
2. **RLS policies.** `USING` filters rows on read; `WITH CHECK` gates writes. Only
   runs after grants permit the operation at all.
3. **Application code.** The route's `requireRole`, handler logic, business rules.

The service-role client bypasses layers 1 and 2 entirely. A `SECURITY DEFINER`
function bypasses layer 1 by running as its owner — which is exactly why its body
must re-impose authorization itself.

### The four write models

How a server-side write reaches the database. Picking among them is a security
decision, not a stylistic one.

- **Model A — service-role client.** Bypasses grants and RLS. Trust boundary is the
  route handler alone — a single layer. Justified only when the operation genuinely
  cannot be done as an authenticated user: webhooks (no session), the Auth Admin API,
  storage writes to privileged buckets, cron/system tasks.

- **Model B — user-bound client + RLS.** Subject to grants and RLS. Trust boundary is
  `requireRole` ∪ the RLS policies — two independent layers. The default for routes
  that read or write *normal* tables on behalf of an authenticated user.

- **Model C — user-bound client → `SECURITY DEFINER` RPC.** The function runs as its
  owner and does *exactly* what its body codes — no more. Trust boundary is the RPC
  body, which re-checks the role internally and is bounded by its parameter signature.
  Use when a route would otherwise need the service-role client for a specific,
  nameable operation.

- **Model D — Model C + grant lockdown.** The target table has writes revoked from
  `authenticated` at the grant level (`REVOKE ALL`, then `GRANT SELECT` only), so the
  *only* path data lands in it is a `SECURITY DEFINER` RPC or the service-role client.
  RLS becomes a third layer, for SELECT. The strongest model; reserve it for tables
  where a stray write is expensive — money, seats, enrollment state.

Decision order: storage/auth-admin/webhook work → A. Otherwise, writes a sensitive
table → C or D. Otherwise, normal tables only → B. A is the exception, not the rule.

### Sensitive tables (grant-locked today)

These have writes revoked from `authenticated` and `SELECT` granted only — writes go
through a `SECURITY DEFINER` RPC or the service-role client: participations, payments,
refunds, family subscriptions and their items, the subscription-price catalog
(no SELECT either — admin-only), session cancellations, credit deductions, and
per-product seat counts. Token balances are analogous, with a dedicated
balance-adjustment RPC as their sole write path. When adding a table that holds money,
seats, enrollments, or similar state, grant-lock it by default.

### Where we are

New code already follows the target conventions: privileged RPCs re-check the role
first and lock down their grants; sensitive tables are grant-locked. The two things
that *don't* exist yet are (a) the verification spine that proves those conventions
hold, and (b) full conversion of the older routes that still use the service-role
client (Model A) for sensitive-table writes that a Model C/D RPC should own.

---

## 3. The solution

**Make authorization a single, *enforced* layer: one set of guard primitives that
every privileged path is required to use, and a verification spine that mechanically
proves it.** The principle is to make the right thing the only easy thing and the
wrong thing fail a test — not to add more rules for humans to remember.

Four pieces.

### 3.1 Canonical guard primitives

A small set of authorization assertions that raise a single, canonical "forbidden"
error, used by every privileged function body:

- A role assertion — "the caller holds role X, or this raises forbidden."
- An admin assertion — the common special case of the above.
- A self/ownership assertion — "the caller is the referenced user, or this raises."

These *replace* the hand-written `IF <role check> THEN RAISE EXCEPTION … USING
ERRCODE = …` block that is currently copy-pasted into every privileged function. The
win is threefold: one canonical error code instead of per-author repetition; a single
greppable call site that a static test can require; and a guard that, because it is
the function's first statement, fires before any parameter is even read.

**The guard reads the caller's role live from `profiles` (the existing `STABLE`
role accessor), never from a JWT claim.** This is a correctness invariant, not an
optimization choice. Revocation — killing a compromised, deleted, or demoted account
mid-session — works *because* the database re-reads the live row on every privileged
call; a role baked into the access token would be honored until the token expires,
silently reopening that hole at the one layer that must stay live. Caching role in the
JWT is a legitimate speed-up for *app-layer* chrome (which dashboard to show), where a
stale value only ever means wrong chrome over data that RLS denies anyway — but it must
never reach a `SECURITY DEFINER` guard or an RLS predicate. Reuse the shared role
accessor rather than hand-rolling a `SELECT` in each guard, so the `STABLE` per-
statement caching keeps it cheap.

This also retires the redundant boolean `is_admin()` helper. That helper returns a
*value* to test; the admin assertion *enforces* and raises. Standardizing on the
raising guard for enforcement (and on the inline role comparison for the rare places
that genuinely need a boolean) removes the duplicate primitive and gives the cleanup a
destination.

### 3.2 Ownership predicates

The "target half" of RLS — "is this caller allowed to reference *this specific
row*?" — expressed as a small set of reusable, `STABLE` predicate functions
(parent-of-gamer, owns-this-row, and the like) rather than re-derived as an inline
`EXISTS` subquery inside each policy. Policies then *compose* from audited predicates.
The IDOR class of bug exists precisely because that subquery is easy to write
half-right; a named, tested predicate written once and reused removes the opportunity.

### 3.3 Grant lockdown as the default for sensitive tables

Unchanged from current practice, stated here so the architecture is complete: any
table holding money, seats, or enrollment state has writes revoked from
`authenticated`, so a stray `.insert()` fails closed and forces the author to add a
proper RPC. The lockdown is load-bearing — never `GRANT INSERT` to work around it.

### 3.4 The verification spine

The part that does not exist yet, and the reason everything else becomes safe to
change quickly. Four mechanical checks, all in the DB test suite:

1. **Static conformance.** Every `SECURITY DEFINER` function reachable by
   `authenticated` either calls a guard primitive as an early statement, or is on a
   vetted allowlist of self-scoping helpers (functions where every authenticated
   caller getting a response *is* the intent). No `SECURITY DEFINER` function is
   reachable by `anon` unless explicitly allowlisted. This catches a *forgotten guard*
   statically, before the function ever runs.

2. **Behavioral role × RPC matrix.** Each callable RPC is annotated with the role(s)
   its body permits. For every (role, RPC) pair where the role is *not* permitted,
   sign in as that role, call the RPC, and assert it raises the canonical forbidden
   error. Because guards run first (3.1), the call can pass **all-NULL arguments** and
   still reach the guard — so this loop needs *no per-RPC argument fixtures*. That is
   the direct payoff of the guard-first convention: the test is generic.

3. **IDOR loop.** For each table an authenticated user can write, seed a row owned by
   user B, then as user A attempt to UPDATE/DELETE it through the user-bound client and
   assert RLS blocks it. This is the mechanical check for the target half of every
   write policy.

4. **Column-grant audit.** An explicit denylist of sensitive columns (a user's own
   role, token balances, and similar) asserting that no UPDATE grant reaches them — so
   a privilege-bearing column can never be made writable by a broad table grant.

### 3.5 The RPC shape under this architecture

A well-formed privileged write RPC, for reference when writing one:

```sql
CREATE OR REPLACE FUNCTION <verb>_<noun>(p_<param> <type>, …)
RETURNS <type>                       -- usually the new row's id, or void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp    -- defend against search-path attacks
AS $$
BEGIN
  -- 1. Authorization — the guard primitive, first, every time.
  --    Runs before any parameter is read, so a forbidden caller never
  --    reaches the logic below.

  -- 2. Validate inputs / business rules, raising specific codes the route maps
  --    (not-found, bad-state, etc.). Let the table's own CHECK / UNIQUE / FK
  --    constraints be the source of truth — don't re-implement them here.

  -- 3. Lock any read-then-write on financial or seat-count math (SELECT … FOR UPDATE).

  -- 4. Do the write.
END;
$$;

-- Private by default; granted to authenticated only because the guard makes it safe.
REVOKE EXECUTE ON FUNCTION <verb>_<noun>(<types>) FROM public, anon;
GRANT  EXECUTE ON FUNCTION <verb>_<noun>(<types>) TO authenticated;
```

Rules that hold regardless: always `SET search_path` (a `SECURITY DEFINER` function
without it inherits the caller's, a known escalation vector); always re-assert the
role inside, never trusting that the route did it; map error *codes* to HTTP status in
the route, never returning raw DB error messages (they leak constraint and column
names).

---

## 4. Justification

### The threat model this defends, in descending damage

1. **Service-role key compromise** (leaked in logs, committed, exposed via SSRF). Any
   route holding the key is a full-DB compromise vector. Mitigation: keep the set of
   service-role routes small, visible, and justified — which is what converting Model A
   routes to C/D accomplishes.
2. **Auth-check bypass.** A bug or refactor lets a request reach a write path without
   correct gating. Mitigation: make the DB a second line — grant lockdown, RLS, or an
   RPC-internal guard — so a handler bug isn't a DB-level capability.
3. **RLS misconfiguration.** A typo in a predicate, an over-permissive `WITH CHECK`, an
   actor-but-not-target policy. Mitigation: pair sensitive tables with grant lockdown
   so PostgreSQL rejects the write even when RLS is wrong; and test the target half
   directly (the IDOR loop).
4. **Application bugs** writing wrong data. Mitigation: encode invariants in RPC
   bodies, auditable in one place, adjacent to the constraints they coexist with.
5. **SQL injection.** Low likelihood under a parameterizing client, and bounded by what
   the connection can do — smaller connection privilege, smaller blast radius.

### Why this specific solution

- **It tests the property, not a proxy for it.** "Sign in as the wrong role and
  confirm you're refused" verifies authorization. "Confirm someone meant to GRANT
  this" verifies an intention. Only the former catches the audit's recurring bug.

- **The guard-first convention is what makes the test cheap.** Because the role guard
  runs before any argument is read, the behavioral matrix calls every RPC with NULL
  arguments and still exercises the guard — no per-RPC fixture map to build and
  maintain. The cost that would otherwise sink a behavioral test disappears entirely,
  *because* enforcement was made uniform first. This is the core of the approach:
  regularize enforcement so verification gets simpler, rather than compensating for
  irregular enforcement with an ever-richer test.

- **Three independent layers for sensitive writes** (route check + RPC guard + grant
  lockdown) instead of one. Any single layer failing — a handler bug, a missing guard,
  a wrong RLS predicate — is caught by another.

- **It is low-risk, because the target is already our documented convention.** New
  code already guards-first and grant-locks. This refactor mostly *enforces a rule we
  already follow* and finishes a conversion already underway — not a redesign.

---

## 5. Implementation plan

A sequenced program, not one PR. The ordering matters: the verification spine comes
**before** the route sweep, because once the spine exists, every later change is
"make the edit and let the test tell you if you broke the boundary" instead of a
careful manual migration.

### Phase 0 — primitives + this doc's conventions land

Add the guard primitives (3.1) and ownership predicates (3.2). No caller uses them
yet; this phase only introduces them and records the conventions. Retire the redundant
boolean admin helper in the same phase, repointing its call sites at the inline role
comparison.

### Phase 1 — build the verification spine (do this first)

Implement the four checks in 3.4 in the DB test suite, and convert existing privileged
functions to call the guard primitives so static conformance passes. Keep the current
grant-level allowlist test until the matrix subsumes it, then retire it. After this
phase, a forgotten guard or an exposed actor-but-not-target policy fails CI.

### Phase 2 — the route sweep (Model A → C/D)

Convert routes that currently use the service-role client for sensitive-table writes
into `SECURITY DEFINER` RPCs called via the user-bound client. Each new RPC uses the
guard primitive and is therefore covered by the matrix automatically.

**Selection criteria** (use these, not a frozen list — the list rots, the criteria
don't): a route is a conversion candidate if it (a) uses the service-role client, (b)
writes a sensitive/grant-locked table, and (c) does *not* require the service-role
client for an unavoidable reason — no `auth.admin.*` call, no privileged-bucket storage
write, no webhook/no-session context. Regenerate the candidate set with
`git grep -l createAdminClient src/` and triage each against (a)–(c).

**Per-route checklist** before converting:
1. The route does no storage writes and no Auth Admin API calls.
2. An RPC exists (or is written) encoding the route's business rules + the guard.
3. For normal-table writes instead: RLS on every touched table grants the role the
   operation, and authorizes both actor and target.
4. No cross-user reads beyond what the caller's RLS view permits.
5. An integration test covers unauthenticated, wrong-role, bad-input, and happy path.
6. The new RPC is annotated in the behavioral matrix.

**Snapshot of the triage at time of writing** (verify before acting — see criteria
above): sensitive-table writes to convert include the admin "comp-enroll a gamer onto
a product" route (the natural worked example), the customer waitlist-join route, and
the checkout-initiation route (confirm first whether its cross-user seat-count reads
truly need service-role). A cluster of routes write only *normal* tables and need just
Model B + correct RLS, no RPC: admin locations CRUD, admin game creation, a user's own
locale update, a gamer/gedu's own external-account record, and the admin outbound
WhatsApp write. A third group needs investigation for legitimate cross-user reads
before a decision: the feedback route, the family-list route, and the voice-token
route. Routes that legitimately stay service-role (Auth Admin API, storage, webhooks)
are out of scope by criterion (c).

Fold the **atomic gamer-creation RPC** into this phase: the gamer-creation route today
runs several admin-client writes in sequence with no transaction, and a failure partway
leaves orphaned records (confirmed in production). Moving the DB writes into one
`SECURITY DEFINER` RPC in a single transaction — with the route deleting the auth user
on RPC failure — both fits this architecture and closes that bug.

Sequence the sweep in batches (e.g. the mechanical normal-table routes first, then the
sensitive-table RPCs once a couple of RPCs have settled the pattern), not piecemeal
across unrelated PRs.

### Phase 3 — RLS completeness

Refactor existing write policies to compose from the ownership predicates so the IDOR
loop passes everywhere, and ship any pending features that add write policies (e.g.
letting a parent update their linked gamer's profile fields) on the same predicates.

---

## 6. Explicitly out of scope

These are adjacent but are *different* refactors — folding them in would bloat this one
and they have their own coherent shape:

- **Emailed-link / origin-trust hardening** — deriving emailed link origins from a
  trusted source rather than the request `Host`, scanner-resistant token flows, OTP
  expiry split. This is auth-email security, touching routes and email, not DB authz.
- **Data-validity constraints** — CHECK constraints on free-text columns, NOT NULL
  tightening. Same layer (the DB), different property (validity, not authorization).
- **Browser-level auth E2E** — Playwright tests against a local Supabase stack. Shares
  the role-switching test substrate and would *accelerate* Phase 1, but is optional:
  the DB-test role-switching helpers already cover what the spine needs.
