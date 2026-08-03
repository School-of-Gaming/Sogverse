# Database Authorization Architecture

**Status: built.** All four phases of §5 have landed — the guard primitives and ownership
predicates, the §3.4 verification spine, the route sweep, and RLS completeness. §2–§3
describe the system that exists, not a target: every privileged function body opens with a
guard primitive or is classified self-scoping with a named scope test, every policy
expresses its admin half as one named predicate, and the spine fails the build when
anything escapes that. What remains is the post-deploy cleanup listed at the end of §5 and
the feature work in §7 — no structural work. This doc stays the single source of truth for
how authorization is enforced in the database.

**Execution contract.** This doc is written so a fresh Claude Code session can act on it.
Before touching anything it describes:

1. **Re-verify current state.** Snapshots in this doc were verified against the live
   schema in 2026-07 and will drift. Current state lives in `supabase/schema.sql`
   (function bodies, grants, policies) and the DB test suite's classifications — never
   in migration history. Regenerate the route list with
   `git grep -l createAdminClient src/`. Note the corollary, which **inverted** in
   2026-07: `schema.sql` used to be a dump of a *hosted* database, so anything created
   outside a migration landed in it. It is now built from `migrations/` by CI, so it
   cannot record an object no migration creates — but the exposure runs the other way
   instead. A hosted database can drift *away* from `schema.sql`, and nothing standing
   watches for that; a `pg_dump` of the database you care about, diffed against
   `schema.sql`, is how to check.
2. **Follow the migration workflow in CLAUDE.md** (push migration → regenerate types →
   check type aliases → commit together). `schema.sql` is not part of it — CI
   regenerates and commits that on `dev`.
3. **DB tests run in CI** against a local Supabase stack started by the workflow. Do
   not run them locally or against the remote DB — push the branch and let CI run them.
4. **A migration reaches the shared database the moment it is pushed; the code running
   against that database does not change until the PR merges and deploys.** So any
   change to a policy, a grant, or a guard has to be behaviour-equivalent for the
   *currently deployed* code, or it breaks the shared environment for the whole window.
   The reliable shapes are: add a new object beside the old one, or rewrite a policy so
   it can only ever admit more than before, never less. A rewrite that cannot be argued
   to one of those does not ship — it gets recorded and sequenced behind a deploy.

---

## 1. The problem

Authorization is enforced in several places at once — PostgreSQL grants, RLS policies,
role checks inside `SECURITY DEFINER` functions, and `requireRole` in route handlers.
That layering is correct and deliberate (defense in depth). The problem is not the
design — it's that **the design is enforced by convention, not mechanically**, and the
automated checks we have are incomplete in specific, known ways:

1. **The automated gate is grant-level only.** The DB access-control test confirms
   that every function callable by `authenticated`/`anon` is intentionally exposed
   (someone meant to `GRANT` it) and that every table has RLS. It does **not** verify
   that an exposed function's *body* enforces the access its grant implies. An
   admin-only RPC granted to `authenticated` with a forgotten role check passes every
   static test.

2. **The boundary between "role-gated" and "self-scoping" lives only in comments.**
   Most functions exposed to `authenticated` are *self-scoping by design* — every read
   and write is keyed to `auth.uid()`, so any authenticated caller getting an answer
   is the intent. A minority are role-gated and carry a guard-first raise block. The
   classification of each function — and therefore whether a missing guard is a bug —
   exists only as comments in the test allowlist. Nothing mechanical distinguishes a
   vetted self-scoping helper from a role-gated RPC whose author forgot the guard.

3. **Behavioral coverage exists but is handwritten and incomplete.** Wrong-role
   refusal tests exist for the admin- and gedu-gated RPCs, and cross-user (IDOR) RLS
   tests exist for the financial and grouping tables — but each was written by hand
   for one function or table, coverage is mostly SELECT-side, and nothing guarantees a
   *new* RPC or write policy gets the same treatment. There is no systematic
   write-path IDOR loop and no completeness check tying the exposed surface to a test.

The history makes the stakes concrete. The 2026-03 security audit
(`docs/SECURITY_REPORT.md`) found, among others: a trigger that trusted user-supplied
metadata to assign roles (privilege escalation to admin), an RLS policy that let any
customer link themselves to any child (IDOR), and a financial RPC granted to every
authenticated user with no internal role check (unlimited token minting). These were
fixed **reactively**, one migration per finding. Each was the *same class of bug* — a
privileged DB operation missing its body-level guard — and each sat exposed until
someone went looking. The structural defenses added during that audit are the
**grant-level** half of the answer. This refactor builds the **body-level** half, so
the next instance of that class fails a test before it ships.

---

## 2. Current state (verified 2026-07 — re-verify per the execution contract)

**Platform regime change (2026-06):** Supabase no longer auto-grants Data API privileges
(`anon`/`authenticated`/`service_role`) to new `public`-schema objects — on local stacks
since CLI v2.106.0, and on our hosted DBs since `00099` proactively revoked the legacy
`FOR ROLE postgres` default privileges (ahead of Supabase's own 2026-10-30 platform
flip; the transition asymmetry had already produced one CI-invisible exposure, repaired
in `00098`). Layer 1 now fails closed identically everywhere: a new table or function is
unreachable, even by `service_role`, until a migration explicitly `GRANT`s it. The
pre-existing surface was backfilled verbatim from `schema.sql` (the explicit-grants
migration); any phase of this refactor that creates objects must write its own grants,
and the §3.5 template's `REVOKE` line is now redundant for new functions (kept in the
template as harmless documentation of intent). This is the platform converging on
§3.3's posture — it strengthens the grant layer but verifies nothing about function
bodies or RLS, so it changes no phase of this plan.

### The three layers PostgreSQL applies, in order

1. **Grants.** `GRANT … ON <table> TO <role>`. Without the grant, PostgreSQL rejects
   the operation with `permission denied` *before* it ever consults RLS.
2. **RLS policies.** `USING` filters rows on read; `WITH CHECK` gates writes. Only
   runs after grants permit the operation at all.
3. **Application code.** The route's `requireRole`, handler logic, business rules.

The service-role client bypasses layers 1 and 2 entirely. A `SECURITY DEFINER`
function bypasses layer 1 by running as its owner — which is exactly why its body must
re-impose authorization itself.

### The four write models

How a server-side write reaches the database. Picking among them is a security
decision, not a stylistic one.

- **Model A — service-role client.** Bypasses grants and RLS. Trust boundary is the
  route handler alone. Justified only when the operation genuinely cannot be done as
  an authenticated user: webhooks (no session), the Auth Admin API, storage writes to
  privileged buckets, cron/system tasks.
- **Model B — user-bound client + RLS.** Trust boundary is `requireRole` ∪ the RLS
  policies — two independent layers. The default for routes that read or write
  *normal* tables on behalf of an authenticated user.
- **Model C — user-bound client → `SECURITY DEFINER` RPC.** The function runs as its
  owner and does *exactly* what its body codes. Trust boundary is the RPC body, which
  re-checks the role internally and is bounded by its parameter signature.
- **Model D — Model C + grant lockdown.** The target table has writes revoked from
  `authenticated`, so the *only* write path is a `SECURITY DEFINER` RPC or the
  service-role client. RLS remains as a third layer for SELECT. Reserve for tables
  where a stray write is expensive — money, seats, enrollment state.

Decision order: storage/auth-admin/webhook work → A. Otherwise, writes a sensitive
table → C or D. Otherwise → B. A is the exception, not the rule.

### The exposed-function landscape

Functions granted to `authenticated` (~40; the authoritative list is the DB
access-control test's allowlist) fall into four kinds. The taxonomy matters because
the verification spine treats each kind differently:

- **Role-gated RPCs** (a handful): plpgsql, first statement is a §3.1 guard
  assertion, which raises `ERRCODE '42501'`. Find them by grepping `schema.sql`
  for `42501` (which also finds the assertions themselves).
- **Self-scoping helpers** (the majority): every read/write keyed to `auth.uid()`;
  no raise block, by design. The `get_my_*` family, the PIN functions.
- **Boolean predicates consumed by RLS policies**: the admin predicate, the product-read
  predicate, parent-of-gamer, the two party-to-a-participation predicates, and the two
  voice-room ones — `STABLE SECURITY DEFINER`, return a boolean, never raise. Each is
  granted to `authenticated` because a policy expression is evaluated as the *querying*
  role, so a predicate a policy composes from must be executable by that role. The
  product-read predicate is the only function granted to `anon`. **A predicate returns a
  total boolean** — never NULL. A `USING` clause treats NULL as deny, so a NULL-capable
  predicate is not a hole *there*, but it is a trap for any consumer that is not a policy;
  wrap a disjunction whose first term can be NULL in `COALESCE(…, false)`.
- **The participation state machine** (the waitlist-join, participation-create,
  participation-cancel and paid-confirmation functions): granted to **service_role
  only** — not callable by `authenticated` at all. Phase 3 put guarded,
  `authenticated`-facing entry points in front of the ones a signed-in user may
  legitimately drive, and left the engines themselves service_role-only. The ones
  that remain reachable *only* by service_role are the ones whose callers genuinely
  have no session: the Stripe webhook's cancel and confirm paths, and the checkout
  route's pre-payment validation. The confirmation function is the sharpest of
  these — its arguments are trusted precisely because we wrote them into the
  Checkout Session ourselves, so an `authenticated` grant would be handing a caller
  a free seat.

Several of these are `LANGUAGE sql`, where "first statement" has no meaning — all
current `sql`-language functions are predicates or self-scoping helpers, which is
why that's safe.

**The role accessor.** `get_user_role()` — `STABLE SECURITY DEFINER`, reads
`profiles.role` for `auth.uid()`. Policies invoke it as `(SELECT get_user_role())`:
that subquery form makes it an InitPlan evaluated once per statement. **The InitPlan
wrapping, not `STABLE` itself, is what makes it cheap** — `STABLE` permits
optimization but guarantees no caching. Keep the wrapped form in every policy; a bare
call in a policy predicate is a per-row function call.

**The wrapping rule applies to argument-free predicates.** A predicate that takes the
row's own column as an argument cannot be an InitPlan — it depends on the row, so
`(SELECT p(col))` is a correlated subplan re-executed per row, exactly like the bare
call. Wrap it anyway for one shape across every policy, but do not expect the InitPlan
payoff there, and be aware of the trade the wrapping rule cannot hide: replacing an
uncorrelated `col IN (SELECT …)` — which PostgreSQL evaluates once and hashes — with a
per-row predicate call buys auditability at the cost of a function call per row. That is
the right trade on the small tables the party-to predicates guard; it would not be on a
large one.

### Sensitive tables (grant-locked today)

Writes revoked from `authenticated`, `SELECT` granted only: participations, payments,
refunds, family subscriptions, feedback submissions, gedu group assignments, product
groups, per-product seat counts. The subscription-price catalog has no `authenticated`
grant at all. When adding a table that holds money, seats, or enrollment state,
grant-lock it by default.

**`anon` holds zero table write grants, everywhere** (since `00097`). The 2026-03
audit's lockdown revoked writes from `authenticated` only, leaving `anon`'s
auto-expose-era write grants standing on 27 tables — inert (no anon write policy
exists, default-deny blocked everything) but one unscoped `CREATE POLICY` (no `TO`
clause → applies to `PUBLIC`, which includes `anon`) away from an unauthenticated
write path. The access-control test now audits `anon` grants alongside
`authenticated` and pins the write surface at zero; `anon` keeps `SELECT` for the
public catalog policies.

**Column-level grants are in use on `profiles`**, and it is the only table where they
are: `authenticated` holds `UPDATE` on exactly the safe columns (name, phone, spoken
languages, locale) — `role` is not grantable — and the self-update policy's `WITH CHECK`
additionally pins `role` to its current value. The §3.4 column-grant audit asserts this
state holds, and asserts that `profiles` is still the only member; it does not need to
construct either.

### Existing verification

What the DB test suite covers (don't rebuild this — extend it):

- **The spine** (§3.4, landed in Phase 2): static conformance, the behavioral role × RPC
  matrix, the write-path IDOR loop, the column-grant audit, and the completeness check
  that ties the exposed surface to one of two classifications. Adding an exposed
  function, a write grant, or a column grant without its annotation and test now fails
  CI.
- **Static, grant-level** (the access-control test): every public table has RLS; every
  `SECURITY DEFINER` function sets `search_path`; table-level write grants match a
  bidirectional allowlist; `anon` holds no table write grant. The *function*-grant
  allowlists it used to carry were retired when the spine subsumed them.
- **Behavioral, handwritten per-target**: SELECT-side IDOR tests (customer A cannot read
  customer B's rows) for participations, payments, refunds, groups, and products; the
  per-RPC happy-path and business-rule tests. These are the fixture-bearing coverage the
  fixture-free matrix cannot replace.
- **Substrate**: `tests/db/helpers.ts` signs in as any seeded role (admin, customer,
  second customer, gedu, gamer) with deterministic UUIDs, hands out an `anon` client and
  a raw access token, and can post an RPC call straight to PostgREST (which is how the
  matrix passes `null` for every argument without fighting the generated arg types); CI
  runs the suite against a local Supabase stack.

The spine systematized this; it was not greenfield.

---

## 3. The solution

**Make authorization a single, *enforced* layer: one set of guard primitives that
every privileged path is required to use, and a verification spine that mechanically
proves it.** Make the right thing the only easy thing and the wrong thing fail a test.

### 3.1 Canonical guard primitives (for function bodies)

A small set of authorization assertions that raise the canonical forbidden error
(ERRCODE `42501`, matching the existing role-gated RPCs), used by every role-gated
function body:

- A role assertion — "the caller holds role X, or this raises forbidden."
- An admin assertion — the common special case.
- A self/ownership assertion — "the caller is the referenced user, or this raises."

These *replace* the hand-written `IF … RAISE` block currently copy-pasted into each
role-gated function. The win: one canonical error code; a single greppable call site
that the static check (§3.4) can require; and a guard that, as the function's first
statement, fires before any parameter is read.

**The guard reads the caller's role live from `profiles` via `get_user_role()`, never
from a JWT claim.** This is a correctness invariant: revocation — killing a
compromised, deleted, or demoted account mid-session — works *because* the database
re-reads the live row on every privileged call. A role baked into the access token
would be honored until the token expires. Caching role in the JWT is legitimate for
app-layer chrome (which dashboard to show), but must never reach a guard or an RLS
predicate. The guard calls `get_user_role()` once per RPC call — one indexed row read;
no further optimization needed in function bodies. (The InitPlan-wrapping rule in §2
is for *policies*, which evaluate per row.)

**Keep `is_admin()`.** Assertions and predicates are two primitives for two contexts,
not duplicates: function bodies need a raising assertion; RLS policies need a boolean
expression. `is_admin()` is the named admin predicate for policies and the first member
of the §3.2 predicate family. **It is now the only way a policy asks "is the caller an
admin"** — the inline `(SELECT get_user_role()) = 'admin'` comparison and the
hand-rolled `EXISTS` over `profiles` are both gone from every policy in the database
(Phase 4). A new policy that reintroduces either is doing by hand what a named,
audited, single-definition predicate already does.

### 3.2 Ownership predicates (for policies)

The "target half" of RLS — "is this caller allowed to reference *this specific
row*?" — expressed as a small set of reusable `STABLE` predicate functions rather than
re-derived as an inline `EXISTS` subquery inside each policy. Policies *compose* from
audited predicates: `is_admin()`, parent-of-gamer, has-active-participation-on, and the
like. The IDOR class of bug exists precisely because the inline subquery is easy to
write half-right, and the duplication that motivated this — the same "caller has an
active participation on this product/group" subquery written out in three separate
policies — is gone as of Phase 4.

**A predicate asks about the caller's *relationship* to a row, not about their role.**
The party-to predicates deliberately treat the purchasing parent and the enrolled gamer
as one question ("am I a party to this participation") rather than one predicate per
column. That unification is what makes a predicate reusable across the customer-side
and gamer-side policies; the role gate, where a policy still wants one, stays in the
policy where it is visible.

### 3.3 Grant lockdown as the default for sensitive tables

Unchanged from current practice, stated for completeness: any table holding money,
seats, or enrollment state has writes revoked from `authenticated`, so a stray
`.insert()` fails closed and forces a proper RPC. The lockdown is load-bearing — never
`GRANT INSERT` to work around it.

### 3.4 The verification spine

Five mechanical checks in the DB test suite. Checks 1, 2, and 5 work together: 1
forces a guard to exist, 2 verifies the guard's behavior matches its annotation, 5
guarantees nothing escapes both.

1. **Static conformance.** Every plpgsql `SECURITY DEFINER` function reachable by
   `authenticated` either calls a guard primitive as an early statement, or is on the
   self-scoping allowlist. `LANGUAGE sql` functions have no statement order and are
   allowlisted by construction — acceptable because they must then satisfy check 5's
   scope-test requirement. No function is reachable by `anon` unless explicitly
   allowlisted. Also assert **no exposed function is declared `STRICT`** — a `STRICT`
   function returns NULL on NULL input *without executing its body*, which would
   silently invalidate check 2's calling convention. (None are today.)

2. **Behavioral role × RPC matrix — for role-gated RPCs.** Each role-gated RPC is
   annotated with the role(s) its body permits. For every (role, RPC) pair where the
   role is not permitted, sign in as that role, call the RPC with **all-NULL
   arguments**, and assert the canonical forbidden error. Because guards run first
   (3.1), the call reaches the guard with no per-RPC argument fixtures. This payoff is
   real but scoped: it covers the role-gated minority. The self-scoping majority has a
   different failure mode — *scope leakage*, returning someone else's row — which
   inherently needs fixtures and is covered by check 5's per-function scope tests.

3. **Write-path IDOR loop.** For each table an authenticated user can write, seed a
   row owned by user B, then as user A attempt UPDATE/DELETE through the user-bound
   client and assert RLS blocks it. Extends the existing SELECT-side IDOR coverage to
   the write half — the half that mutates state.

4. **Column-grant audit.** A denylist of privilege-bearing columns (a user's own
   `role`, balances, and similar) asserting no UPDATE grant reaches them — so a broad
   table grant can never make a privilege column writable. The `profiles` column
   grants already implement the pattern; this check pins it.

5. **Completeness check.** Every function granted to `authenticated` appears in
   exactly one of: the matrix annotations (check 2) or the self-scoping allowlist —
   and every allowlist entry names its scope test. This closes the two silent holes:
   an RPC annotated permissively passes check 2 vacuously, and an allowlisted function
   with no scope test is vetted by nothing. Allowlist growth is this design's failure
   mode; check 5 is what polices it. 1+2+5 subsume the old grant-allowlist test, which
   was retired with them (§5 Phase 2).

**What "self-scoping" admits, precisely.** The common case is a function keyed to
`auth.uid()` on every read and write. The category is slightly wider than that, and the
widening is deliberate rather than accidental: what it actually requires is that the
*caller's own identity, not an argument, determines the answer's scope*. A `SECURITY
INVOKER` function reading only tables the caller's RLS already governs qualifies — it
cannot return a row a direct select would not, so there is no scope for an argument to
aim it at someone else. Two members are of this second kind: the product read predicate
the RLS policies evaluate, and the location search behind the public picker. Both are
also `anon`-reachable, which is a separate allowlist and a separate decision.

There is a third and widest kind, and it is worth naming so it is not mistaken for an
oversight: **a function that reads no table at all.** The location search's fold
primitives — strip diacritics, return the term separator, join a row's searchable strings
— are pure functions of their arguments, holding no privilege and returning nothing the
caller did not pass in. There is no scope for an argument to aim because there is no data
behind them. They are granted rather than hidden because both paths that reach them are
checked as the *caller*: a `SECURITY INVOKER` function calling them, and a generated
column whose expression Postgres evaluates under the privileges of whoever writes the row.
Revoking them hides nothing — it only makes the feature fail closed. The
requirement that each entry name a scope test is what keeps the widening honest — a
function classified this way has to be *shown* answering identically regardless of who
asks.

### 3.5 The RPC shape under this architecture

A well-formed privileged write RPC, for reference when writing one:

```sql
CREATE OR REPLACE FUNCTION <verb>_<noun>(p_<param> <type>, …)
RETURNS <type>                       -- usually the new row's id, or void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''                 -- canonical form: empty, with every reference
                                     -- schema-qualified (public.…, extensions.…)
AS $$
BEGIN
  -- 1. Authorization — the guard primitive, first, every time.
  --    Runs before any parameter is read.

  -- 2. Validate inputs / business rules, raising specific codes the route maps.
  --    Let the table's own CHECK / UNIQUE / FK constraints be the source of
  --    truth — don't re-implement them here.

  -- 3. Lock any read-then-write on financial or seat-count math (SELECT … FOR UPDATE).

  -- 4. Do the write.
END;
$$;

REVOKE EXECUTE ON FUNCTION <verb>_<noun>(<types>) FROM public, anon;
GRANT  EXECUTE ON FUNCTION <verb>_<noun>(<types>) TO authenticated;
```

`SET search_path = ''` + schema-qualified references is the canonical form (it's what
the newest functions use, and it's immune to search-path attacks by construction).
Existing functions that set `'public'` or `'public', 'extensions'` are fine until next
touched; when writing new code that needs extension functions, qualify them
(`extensions.crypt(…)`) rather than widening the path. Never declare an exposed
function `STRICT` (see §3.4 check 1). Map error *codes* to HTTP status in the route;
never return raw DB error messages (they leak constraint and column names).

---

## 4. Justification

### The threat model, in descending damage

1. **Service-role key compromise** (leaked in logs, committed, exposed via SSRF).
   Primary mitigation is key hygiene and rotation — the key is one env var visible to
   the whole runtime, so converting routes doesn't shrink *runtime* exposure. What the
   sweep does buy here: fewer code paths handling the key means fewer chances to log
   or mishandle it, and a small, justified Model A set is auditable at a glance.
2. **Auth-check bypass.** A bug or refactor lets a request reach a write path without
   correct gating. **This is the threat the route sweep actually defends**: with Model
   C/D, a handler bug is no longer a DB-level capability, because the RPC guard and
   the grant lockdown stand behind it.
3. **RLS misconfiguration.** A typo'd predicate, an over-permissive `WITH CHECK`, an
   actor-but-not-target policy. Mitigation: grant lockdown on sensitive tables (so
   PostgreSQL rejects the write even when RLS is wrong) and the write-IDOR loop.
4. **Application bugs** writing wrong data. Mitigation: invariants in RPC bodies,
   auditable in one place, adjacent to the constraints they coexist with.
5. **SQL injection.** Low likelihood under a parameterizing client, bounded by
   connection privilege.

### Why this specific solution

- **It tests the property, not a proxy.** "Sign in as the wrong role and confirm
  refusal" verifies authorization; "confirm someone meant to GRANT this" verifies an
  intention. Only the former catches the audit's recurring bug class.
- **Guard-first makes the role matrix fixture-free** — for the functions it applies
  to. The honest accounting: the matrix covers the role-gated minority cheaply; the
  self-scoping majority is covered by named scope tests, enforced by the completeness
  check. Regularizing enforcement is still what makes verification tractable — it
  just takes two complementary checks, not one.
- **Three independent layers for sensitive writes** (route check + RPC guard + grant
  lockdown). Any single layer failing is caught by another.
- **It is low-risk because it extends what exists.** The substrate (role-switching
  helpers, 42501 tests, IDOR tests, column grants on `profiles`) is already in the
  repo; the role-gated RPCs already guard first. The spine systematizes and closes
  gaps rather than introducing a new regime.

---

## 5. Implementation plan

Sequenced; each phase is a PR batch. The spine comes **before** the route sweep so
every later change is "make the edit and let the test tell you if you broke the
boundary."

### Phase 1 — guard primitives + ownership predicates — **landed**

Added the §3.1 assertions and §3.2 predicates, and converted the existing role-gated RPC
bodies (the small `42501` set — regrep `schema.sql` to enumerate) to call them. No
policy rewrites in this phase — the predicates exist but no policy composes from them
until Phase 4, so they carry no `authenticated` grant yet.

Both items it deferred were closed in Phase 2: the role assertion's NULL-role
pass-through (`<>` → `IS DISTINCT FROM`) and the unconverted `set_gedu_verified`.

### Phase 2 — the verification spine — **landed**

The five checks of §3.4 live in the DB test suite. The two classifications — role-gated
RPCs with their permitted roles, and self-scoping helpers with the scope test that vets
each one — are the spine's data; everything else is derived from the PostgreSQL catalogs
at test time, so the surface cannot drift out from under them. The grant-level function
allowlists were retired once checks 1+2+5 were green, as planned.

Three judgment calls worth carrying forward:

- **Check 1 is applied to every plpgsql function exposed to `authenticated`, not only
  the `SECURITY DEFINER` ones.** `create_product`/`update_product` are `SECURITY
  INVOKER` and would have escaped the narrower reading, which is why the guard
  primitives carry an `authenticated` grant in the first place. The partition is
  "role-gated or self-scoping", and it is the same partition check 5 enforces.
- **The matrix asserts both directions.** For a disallowed (role, RPC) pair the call
  must come back `42501`; for a permitted one it must come back *anything but* `42501`.
  Without the second half, annotating every role as permitted would pass vacuously —
  which §3.4 names as the check's own failure mode. One RPC opts out of the positive
  half (`get_gedu_assigned_product` raises a second `42501` for a gedu with no
  assignment, which is its ownership gate, not its role gate); the opt-out carries its
  reason inline.
- **INSERT is out of scope for the write-IDOR loop.** A blocked INSERT and a constraint
  violation are both "an error", so the check would risk passing for the wrong reason
  unless every case carried a fully valid payload. UPDATE/DELETE need no payload: RLS
  simply filters the row out and the statement affects zero rows. INSERT `WITH CHECK`
  stays with the per-feature RLS tests, which do supply valid payloads.

What Phase 3 inherits:

- **Every new RPC needs a matrix annotation or an allowlist entry with a scope test**,
  and every new write grant needs an IDOR case — the completeness checks fail the build
  otherwise. That is the intended cost, and it is what the per-route checklist below
  already anticipates.
- **A dead grant worth folding into a later phase**: `authenticated` held `UPDATE` on
  `whatsapp_messages` with no UPDATE policy behind it, so it authorized nothing. Phase 3
  revoked it while converting that route, and retired its IDOR case with it — the grant
  layer now refuses those writes outright, which is the stronger guarantee.
- **`can_read_product` answers `NULL`, not `false`, for a caller with no profiles row.**
  Its first disjunct compares `get_user_role()` to `'admin'`, which is NULL for `anon`,
  and `NULL OR false` is NULL. Harmless where it is used — a policy's `USING` clause
  treats NULL as deny — and the scope test pins both the NULL and the deny. Worth a
  `COALESCE(…, false)` when Phase 4 next touches that predicate, so the boolean is total.
- **The Phase 1 grant asymmetry stands**: `assert_self` and the two §3.2 participation
  predicates remain `service_role`-only, because nothing composes from them yet. The
  phase that puts them in a policy or a `SECURITY INVOKER` body grants them then — and
  check 5 will require the classification at that point.

### Phase 3 — the route sweep — **landed**

**Selection criteria** (use these, not a frozen list — regenerate with
`git grep -l createAdminClient src/` and triage): a route is a conversion candidate if
it (a) uses the service-role client, (b) for reads/writes an authenticated user could
be authorized to perform, and (c) does *not* need service-role unavoidably — no
`auth.admin.*` call, no privileged-bucket storage write, no webhook/no-session
context.

The conversions come in three distinct shapes — triage each candidate into one:

1. **Grant-plus-guard** (cheapest; the RPC already exists but is service_role-only,
   and the route calls it via the admin client): guard the RPC, expose it to
   `authenticated`, switch the route to the user-bound client, annotate it in the
   matrix.
2. **New RPC** (the route does direct admin-client writes to a grant-locked table):
   write the Model C/D RPC per §3.5.
3. **Client swap to Model B** (the route touches only normal tables): switch to the
   user-bound client and verify RLS grants the role the operation, both actor and
   target halves.

**Per-route checklist** before converting:
1. No storage writes, no Auth Admin API calls remain on the converted path.
2. An RPC exists (or is written) encoding the route's business rules + the guard —
   or, for Model B, RLS on every touched table authorizes both actor and target.
3. No cross-user reads beyond what the caller's RLS view permits.
4. An integration test covers unauthenticated, wrong-role, bad-input, and happy path.
5. The RPC is annotated in the matrix (check 5 will fail the build if forgotten).

Batch by shape: the grant-plus-guard set first (smallest diff, settles the pattern),
then Model B swaps, then new RPCs.

#### The triage, machine-readably

Every module that used the service-role client at triage time, with the write model it
landed on. The route-layer refactor instance in `docs/refactor-playbook.md` consumes
this as its own step-2 classification, so keep the shape stable and re-derive rather
than edit when the surface changes. `shape` is the conversion shape above (`1`
grant-plus-guard, `2` new RPC, `3` Model B swap) or `-` for a module that stayed Model
A, `none` for a module that reaches no database at all. Derive the tallies from the
`model` column rather than trusting this sentence — it has drifted before. As of
2026-08-01: of the twenty-nine rows, **ten** dropped the service-role client entirely
(`B`, `C`, `none`), **one** kept it for a narrowed purpose (`C+A`), **seventeen** are
still Model A, and one is the factory itself (`-`). The eighteen still importing it —
seventeen `A` plus the `C+A` partial — are exactly today's `createAdminClient` importers:
fourteen routes, the feedback partial, and three non-route modules.

```csv
module,model,shape,justification
src/app/api/participations/waitlist/route.ts,C,1,customer waitlist-join now runs on the user client against a customer-guarded RPC that reads the actor from the session
src/app/api/feedback/route.ts,C+A,1,the submission write moved to a self-scoping RPC on the user client; the admin client survives only for the notification fan-out (every admin's email; a gamer's parent's) which is not in the submitter's RLS view and must not be returnable from an RPC
src/app/api/admin/whatsapp/send/route.ts,B,3,contacts upsert + message insert run under the pre-existing admin-only policies; the message policy also pins direction to outbound
src/app/api/auth/pin/forgot/route.ts,B,3,reads the caller's own PIN hash, already inside their RLS view
src/app/api/minecraft/account/route.ts,B,3,self-write policies added; the row key comes from the session and never from the request
src/app/api/user/locale/route.ts,B,3,column-level UPDATE grant on the locale column added; the pre-existing self-update policy scopes it
src/app/api/admin/locations/create/route.ts,B,3,INSERT grant added so the pre-existing admin-only write policy is reachable
src/app/api/admin/locations/[id]/route.ts,B,3,as above for UPDATE
src/app/api/admin/products/[id]/participations/route.ts,C,2,participations is grant-locked; admin comp-enroll became an admin-guarded RPC carrying the product-type gate and parent resolution
src/app/api/admin/products/[id]/participations/[participationId]/route.ts,C,2,same table; admin un-enroll became an admin-guarded RPC carrying the product-membership pair check and the live-subscription refusal
src/app/api/admin/products/create/route.ts,A,-,admin client is used ONLY for a privileged-bucket storage upload; the data writes already run on the user client
src/app/api/admin/products/[id]/update/route.ts,A,-,as above, plus storage deletes of superseded images
src/app/api/auth/forgot-password/route.ts,A,-,Auth Admin API (recovery link generation)
src/app/api/auth/pin/reset/route.ts,A,-,resolves its user from a signed token rather than a session, so there is no caller to act as
src/app/api/auth/switch-account/route.ts,A,-,Auth Admin API (user lookup + magic-link generation)
src/app/api/gamers/create/route.ts,A,-,Auth Admin API (user creation, with delete-on-failure compensation)
src/app/api/gamers/[id]/route.ts,A,-,Auth Admin API (metadata + password updates) interleaved with writes to a LINKED user's rows; the parent-writes-gamer policy is Phase 4 work
src/app/api/gedu/register/route.ts,A,-,Auth Admin API (self-registration creates the auth user before any session exists)
src/app/api/webhooks/stripe/products/route.ts,A,-,webhook; no session by construction
src/app/api/webhooks/whatsapp/route.ts,A,-,webhook; no session by construction
src/app/api/minecraft/join-check/route.ts,none,-,dropped the client along with the session gating it served; the route authenticates a shared API key, validates the uuid, and answers 501 without reaching any data
src/app/api/checkout/products/create/route.ts,A,-,caches a Stripe customer id onto the grant-locked billing table; an authenticated write path there would let a user point their billing row at someone else's Stripe customer
src/app/api/parent/billing-portal/route.ts,A,-,same Stripe-customer helper as checkout
src/app/api/family/list/route.ts,A,-,a gamer legitimately reads siblings beyond their own RLS view; the resolver is scoped to the verified caller's family
src/app/select-profile/page.tsx,A,-,same family resolver as the family-list route
src/services/family/family.server.ts,A,-,the shared family resolver itself
src/lib/pin-session-server.ts,A,-,resolves a PIN-reset token to a user id with no session in hand; shared by the reset page and the reset route
src/app/api/voice/token/route.ts,A,-,see the judgment call below — the self-healing occupancy prune is a cross-user system write no participant is authorized to make
src/lib/supabase/admin.ts,-,-,the client factory itself
```

#### Judgment calls

- **The deployment window forced additive conversions rather than in-place guards.**
  A migration reaches the shared staging database the moment it is pushed, but the code
  running against that database only changes when the PR stack merges. Guarding an RPC
  that the currently-deployed routes call through the service-role client would refuse
  those calls — the caller has no `auth.uid()`, hence no role — and break staging for
  the whole window. The rejected alternative was an `auth.uid() IS NULL` escape hatch
  inside the guard: that reopens exactly the roleless-caller hole Phase 2 closed, in the
  one place every guarded function shares, and "transitional" allowances in shared
  primitives have a way of becoming permanent. So the grant-plus-guard shape landed as
  *new* guarded entry points beside the untouched service_role-only engines. Nothing was
  weakened for even one request, and no allowance needs remembering to remove — only two
  now-redundant signatures need retiring (see the inherited items).
- **The admin cancel route was not the shape the plan expected.** It was sketched as
  grant-plus-guard; re-verification found the underlying cancel RPC is also called by
  the Stripe webhook, which has no session by definition and must keep calling it as
  service_role *permanently*. A role guard on that body would break the webhook for
  good, not just through the deployment window. It stays a service_role-only engine and
  the admin-facing entry point wraps it — which is also what lets the wrapper hold
  admin-specific preconditions the webhook must not have.
- **Moving route logic into an RPC closed a real race, not just a layer.** The
  admin un-enroll path refuses to delete a participation that still has a live Stripe
  subscription, because the CASCADE would orphan a subscription that keeps billing with
  no DB row behind it. In the route that check and the delete were separate statements;
  in the RPC they share a transaction and the product lock.
- **The locale route's admin client was not a typing problem.** It carried a comment
  blaming a `@supabase/ssr` version whose bug made `.update()` resolve as `never`. That
  dependency has since moved two majors and the workaround was obsolete; the real reason
  the write could not run as the user was a missing column grant. Root-caused and
  removed rather than carried forward.
- **The voice-token route stays Model A, deliberately.** Its membership reads would
  convert cleanly, but the same handler performs a self-healing prune of stale
  private-zone occupancy from *previous* session windows — a cross-user maintenance
  DELETE that no individual participant is authorized to make (the delete policy is
  moderator-only, and most joiners are not moderators). Converting only the reads would
  leave the handler holding the service-role client anyway, so the trust boundary would
  not move; it would only add a way for an RLS subtlety to lock a gamer out of a live
  voice session. A member-scoped prune RPC is the obvious way to finish this and is
  recorded as a Phase 4 candidate rather than forced here. (Phase 4 designed it and did
  not ship it either — for a sharper reason than this one; see its design note.)
- **The feedback route is a partial conversion and is recorded as such.** Its write is
  Model C; its notification fan-out stays Model A. Folding the recipient lookup into the
  RPC would make every admin's email address readable by any authenticated caller who
  invoked that RPC directly, which is worse than the thing it would fix.

Phase 4 cleared the backlog Phase 3 left: the two participation predicates went into
policies, the product-read predicate became total, and the redundant engine signatures
were sequenced behind the deploy (see the post-deploy list at the end of §5).

### Phase 4 — RLS completeness — **landed**

Every policy in the database now expresses its admin half as one named predicate, and no
policy re-derives an ownership question a predicate already answers.

- **The admin idiom is now singular.** Twenty-eight policies migrated to the named admin
  predicate, InitPlan-wrapped. They had been written three different ways — an inline
  comparison against the role accessor, a bare call to the predicate, and a hand-rolled
  `EXISTS` over the profiles table — and the three were scattered across tables with no
  pattern to which table got which. Each swap is a rename of an identical expression,
  including the NULL answer for a caller with no profiles row, which a `USING` /
  `WITH CHECK` clause denies either way. Three of them carried a bare call and were
  paying a function call per row; the wrapper fixed that as a side effect.
- **The three party-to policies compose from the §3.2 predicates**, which took their
  `authenticated` grant at that point (a policy expression is evaluated as the querying
  role) and their spine classification with fixture-bearing scope tests. The equivalence
  argument is below — it is the interesting part of this phase.
- **The product-read predicate became a total boolean.** Its admin disjunct is NULL for a
  caller with no profiles row and `NULL OR false` is NULL, so it answered SQL NULL. The
  deny was never in doubt; the fix is about not handing the next consumer a
  three-valued answer. Wrapped in `COALESCE(…, false)`, and moved to the canonical empty
  search_path while it was open.
- **`ALTER POLICY`, not `DROP` + `CREATE`.** No statement ever observes a table without
  its policy, and the change is one catalog update rather than a window.

#### Judgment calls

- **The party-to swap was argued from its *direction*, not from a data snapshot.** The
  predicates unify the two participation columns into one question; the policies they
  replaced each keyed on one column under a role gate. So the rewrite can only ever
  *admit* a row the old form refused, never refuse one it admitted — which is what makes
  it safe to apply to a shared database whose deployed code has not changed yet. A
  snapshot showing zero affected rows would have been weaker: it says nothing about the
  next row inserted.
- **The row it could additionally admit is the policies' own intent.** That row is a
  caller holding one party's role who occupies the *other* party's column — a
  customer-role account that is the gamer on an active participation, or the reverse.
  It does not exist on the shared database (checked in both directions before writing
  the migration) and is unreachable through the application's own creation paths:
  participation parties are resolved from parent/gamer links, gamer accounts are created
  with the gamer role by the atomic creation RPC, which refuses to promote an existing
  account, and the role column carries no write grant for `authenticated` at all, so only
  an admin could ever produce one. And if one existed, the effect would be to show a
  party to a participation the group or assignment row they are themselves party to —
  the thing these policies exist to do. Making it *structurally* impossible would mean a
  cross-table role invariant enforced by triggers on both tables, which buys nothing here
  and would refuse an admin's legitimate role correction.
- **A drift between the hosted databases and migration history surfaced here and was
  repaired.** Two admin full-access policies — on the tables holding the parent PIN hash
  and a child's date of birth — existed on the hosted databases but had never been
  written into a migration, so a database built from migrations alone did not have them.
  CI builds exactly such a database, which means the DB suite had been verifying a
  different RLS surface from the one that runs in production on those two tables. The
  migration creates them when absent and alters them when present. Worth remembering as
  a class: **a policy created outside a migration is invisible to every check we have**,
  because every check runs against a database built from migrations.
- **The voice-token route stays Model A, and this is now a decision rather than a
  deferral** — see the design note below.

#### The voice-occupancy prune: designed, not shipped

Phase 3 recorded a member-scoped prune RPC as the obvious way to finish the voice-token
route's conversion. Designing it surfaced two blockers, and the first is a genuine
privacy hole rather than an inconvenience:

1. **No caller may supply the cutoff.** The prune deletes private-zone occupancy rows
   from *previous* session windows, so it needs to know where the current window starts.
   If that boundary is a parameter, any group member can pass a value that sweeps the
   *current* window's rows — and those rows are the privacy ledger the SFU permission
   projection is rebuilt from, so deleting them un-blocks the very people they confine.
   A confined participant could free themselves, which is precisely the guarantee the
   write-IDOR loop pins for that table. Bounding the parameter to the past does not help:
   the current window opened in the past too.
2. **A gedu's cross-group voice mobility has no matching read policy.** The voice model
   treats a gedu as a member and moderator of every group of a product they are assigned
   to, and the token route's membership gate follows that. But the policy letting a gedu
   *read a group row* is assignment-scoped, not product-scoped — so converting the
   route's group read to the user client would lock a gedu out of a sibling group's room
   that they are entitled to join. Widening that policy would fix it, but widening is not
   behaviour-equivalent, which the deployment-window rule forbids in the same change.

The three ways out of the first blocker, for whoever picks this up:

- **Compute the window in the database.** Correct and parameterless, but it means a
  second implementation of the session-window arithmetic — weekday, product timezone,
  duration, and the open/close grace margins — in SQL, where it would silently drift from
  the application's copy. The margins are application constants, not schema.
- **Prune on a fixed retention** (delete occupancy older than a day) rather than on the
  window boundary. Parameterless, safe by construction because a current window's start
  is always within hours of now, and it still serves every purpose the prune has: freeing
  the uniqueness constraint for re-occupancy, reaping a participant who never left, and
  bounding growth. It is not equivalent — rows survive longer — but nothing reads them:
  every consumer filters occupancy to an exact window already.
- **Restrict the prune to moderators**, who are authorized to delete occupancy anyway.
  Simplest, but it stops being self-healing on a session no moderator joins.

The second blocker wants the route to stop reading the group row directly at all: a
single self-scoping RPC that answers "may I join this room, and what are its schedule and
timezone", bounded by the existing voice-membership predicate — which already encodes
exactly the route's three-way membership gate. That collapses two of the route's gates
and its group read into one call, and leaves only the prune, the occupancy read and the
caller's own Minecraft row, all of which convert cleanly. Until both parts land, the
route holds the service-role client, so converting its reads piecemeal would move no
trust boundary — the same reasoning Phase 3 applied.

#### Post-deploy cleanup

The only work this refactor leaves. Both items were blocked on the deploy of this stack,
not on design. **Both are done — the stack deployed to production on 2026-07-28 and the
revoke landed the same day.** The second item found drift; what it found, and the one
piece of work it left, is written up under it.

- **Revoke `service_role` EXECUTE from the two participation engines** — the three-argument
  waitlist-join and the two-argument feedback-submission functions, which take the
  caller's identity as a parameter. Phase 3 put guarded entry points in front of them and
  no application code calls them directly any more, but staging's *deployed* code still
  does until this stack ships. Note they cannot be dropped, as Phase 3's note assumed:
  the guarded entry points call them. Revoking the grant is the stronger outcome anyway —
  it makes the engines reachable only through their guarded wrappers, which is the §2
  grant-lockdown posture applied to a function instead of a table:

  ```sql
  REVOKE EXECUTE ON FUNCTION public.join_waitlist(uuid, uuid, uuid) FROM service_role;
  REVOKE EXECUTE ON FUNCTION public.submit_feedback(uuid, text) FROM service_role;
  ```

  Verify first that nothing outside the wrappers still calls them, then push the revoke
  as a normal migration; the wrappers are `SECURITY DEFINER` and reach the engines through
  ownership, not through a role grant.
- **Confirm the two repaired admin policies exist on production.** The drift repair above
  is conditional, and the reasoning recorded here was that production would take the ALTER
  branch and be unaffected. **The post-release diff proved that wrong, in both directions.**

  The out-of-band edit is on **staging**, not production. Migration history names the six
  profile-table policies in snake_case; production still matches it exactly, while staging
  had them renamed by hand to quoted human-readable names at some point. The repair block
  keys its `IF EXISTS` on the quoted admin name — so staging matched and took ALTER, and
  **production did not match and took CREATE**. Production therefore ends up with *two*
  admin policies per profile table: the original, with a bare role-predicate call, and the
  new one the repair created, with the InitPlan-wrapped call.

  Nothing is exposed by this — both policies are permissive over the same admin predicate,
  so effective access is identical. The costs are narrower: the "every admin policy is one
  shape" property fails on those two tables, the un-wrapped duplicate re-evaluates its
  predicate per row, and the committed snapshot describes neither database completely.

  **Repaired in `00127`**, which converges both catalogs onto the migration-history names.
  Because the two databases genuinely differ, it cannot assert either starting state: it
  walks the six (legacy name, canonical name) pairs and drops the legacy policy when both
  exist, renames it when only the legacy one does, and does nothing when already converged.
  That leaves the canonical name present everywhere, which is what lets it then restate the
  admin predicates unconditionally, and it ends by asserting the exact expected policy set
  per table — naming them rather than counting, since the wrong policies in the right
  number is the very state being repaired — so a database
  that fails to converge fails the migration rather than the next dump diff. Re-running is a
  no-op.

  The general lesson is the one the drift was evidence for in the first place: a
  conditional repair keyed on a *name* encodes an assumption about which database you are
  looking at. Keying it on the thing being repaired — or asserting the end state
  unconditionally, as the repair for this one does — would have converged both.

The self-assertion primitive remains `service_role`-only: nothing composes from it yet,
because no `SECURITY INVOKER` body or policy has needed a raising self-check. That is the
Phase 1 asymmetry working as designed, not an omission — the phase that needs it grants
it, and the spine will require its classification at that point.

---

## 6. Explicitly out of scope

Adjacent but *different* refactors — folding either into this one would have bloated it,
and both are still open:

- **Data-validity constraints** — CHECK constraints on free-text columns, NOT NULL
  tightening. Same layer, different property (validity, not authorization).
- **Browser-level auth E2E** — Playwright against a local Supabase stack. It shares the
  role-switching substrate, but the DB-test helpers cover what the spine needs, so this
  buys coverage of the *browser* half of an auth flow rather than more of the database
  half.

---

## 7. Feature work this refactor makes cheap

Not part of the refactor, and not blocking anything. Recorded here because the refactor
is what put the pieces in place, and because each one is a *product* decision wearing an
authorization costume — none should be slipped in as a cleanup.

- **A parent writing their linked gamer's profile fields.** The predicate for it exists
  and has since Phase 1, so the policy itself is a few lines. What makes it a product
  decision is what it costs: the write-IDOR loop currently pins the opposite guarantee —
  a parent may *read* their child's profile row and may not write it — with the linked
  parent deliberately chosen as the sharpest attacker for that table. Landing the feature
  means rewriting that case to a narrower one (which columns, and which are still the
  child's alone), and that column list is the actual decision. The payoff is that the
  gamer-update route's data writes leave the service-role client; its Auth Admin calls
  keep it Model A regardless, so the win is a smaller Model A surface, not one fewer
  Model A route.
- **Finishing the voice-token conversion**, per the design note in §5 Phase 4. Both parts
  of it change behaviour — one changes when stale occupancy is reaped, the other widens
  what a gedu may read — so both want a deploy boundary of their own.
