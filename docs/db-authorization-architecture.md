# Database Authorization Architecture

**Status:** target architecture + migration plan. The conventions in §2–§3 are how new
code is written today; the verification spine (§3.4) and the route sweep (§5 Phase 3)
are not yet built. This is the single source of truth for the refactor — when someone
says "let's do the DB authorization refactor," this is the doc to read and act on.

**Execution contract.** This doc is written so a fresh Claude Code session can execute
the refactor from it. Before acting on any phase:

1. **Re-verify current state.** Snapshots in this doc were verified against the live
   schema in 2026-06 and will drift. Current state lives in `supabase/schema.sql`
   (function bodies, grants, policies) and the DB access-control test's allowlists —
   never in migration history. Regenerate the route list with
   `git grep -l createAdminClient src/`.
2. **Follow the migration workflow in CLAUDE.md** (push migration → regenerate types →
   dump `schema.sql` → check type aliases → commit together).
3. **DB tests run in CI** against a local Supabase stack started by the workflow. Do
   not run them locally or against the remote DB — push the branch and let CI run them.
4. **One phase per PR batch**, in order. A phase's checks must be green before the
   next phase starts, because later phases lean on them.

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

## 2. Current state (verified 2026-06 — re-verify per the execution contract)

**Platform regime change (2026-06):** Supabase no longer auto-grants Data API privileges
(`anon`/`authenticated`/`service_role`) to new `public`-schema objects — on local stacks
since CLI v2.106.0, on hosted projects for objects created after 2026-10-30. Layer 1 now
fails closed by default: a new table or function is unreachable, even by `service_role`,
until a migration explicitly `GRANT`s it. The pre-existing surface was backfilled
verbatim from `schema.sql` (the explicit-grants migration); any phase of this refactor
that creates objects must write its own grants, and the §3.5 template's `REVOKE` line is
now redundant for new functions (kept in the template as harmless documentation of
intent). This is the platform converging on §3.3's posture — it strengthens the grant
layer but verifies nothing about function bodies or RLS, so it changes no phase of this
plan.

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

- **Role-gated RPCs** (a handful): plpgsql, first statement is
  `IF get_user_role() <> '<role>' THEN RAISE … ERRCODE '42501'`. Find them by
  grepping `schema.sql` for `42501`.
- **Self-scoping helpers** (the majority): every read/write keyed to `auth.uid()`;
  no raise block, by design. The `get_my_*` family, the PIN functions.
- **Boolean predicates consumed by RLS policies**: `is_admin()`,
  `can_read_product()`, `is_parent_of()` — `STABLE SECURITY DEFINER`, return a
  boolean, never raise. `can_read_product` is the only function granted to `anon`.
- **The participation state machine** (`join_waitlist`, `create_participation`,
  `cancel_participation`, `confirm_reservation`, …): granted to **service_role
  only** — not callable by `authenticated` at all. Routes invoke these via the
  admin client today; that indirection is what Phase 3 removes.

Several of these are `LANGUAGE sql`, where "first statement" has no meaning — all
current `sql`-language functions are predicates or self-scoping helpers, which is
why that's safe.

**The role accessor.** `get_user_role()` — `STABLE SECURITY DEFINER`, reads
`profiles.role` for `auth.uid()`. Policies invoke it as `(SELECT get_user_role())`:
that subquery form makes it an InitPlan evaluated once per statement. **The InitPlan
wrapping, not `STABLE` itself, is what makes it cheap** — `STABLE` permits
optimization but guarantees no caching. Keep the wrapped form in every policy; a bare
call in a policy predicate is a per-row function call.

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

**Column-level grants are already in use on `profiles`**: `authenticated` holds
`UPDATE` on exactly the safe columns (name, phone, spoken languages) — `role` is not
grantable — and the self-update policy's `WITH CHECK` additionally pins `role` to its
current value. The §3.4 column-grant audit asserts this state holds; it does not need
to construct it.

### Existing verification

What the DB test suite already covers (don't rebuild this — extend it):

- **Static** (the access-control test): function-grant allowlists for `authenticated`
  and `anon`; every public table has RLS; every `SECURITY DEFINER` function sets
  `search_path`; table-level write grants match an allowlist. Column-level grants are
  explicitly out of scope today.
- **Behavioral, handwritten per-target**: wrong-role 42501 tests for the admin- and
  gedu-gated RPCs; SELECT-side IDOR tests (customer A cannot read customer B's rows)
  for participations, payments, refunds, groups, and products; scope tests for the
  self-scoping `get_my_*` and PIN RPCs.
- **Substrate**: `tests/db/helpers.ts` signs in as any seeded role (admin, customer,
  second customer, gedu, gamer) with deterministic UUIDs; CI runs the suite against a
  local Supabase stack.

The spine (§3.4) systematizes this; it is not greenfield.

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
expression. `is_admin()` is the named admin predicate for policies (20+ policies use
it today) and the first member of the §3.2 predicate family. The thing to migrate away
from is the *other* policy idiom — the inline `(SELECT get_user_role()) = 'admin'`
comparison some policies carry — folded into Phase 4 opportunistically, not as a
big-bang rewrite.

### 3.2 Ownership predicates (for policies)

The "target half" of RLS — "is this caller allowed to reference *this specific
row*?" — expressed as a small set of reusable `STABLE` predicate functions rather than
re-derived as an inline `EXISTS` subquery inside each policy. The concrete duplication
today: the "caller has an active participation on this product/group" subquery appears
inline in at least three policies (customer- and gamer-side group visibility), each a
chance to get it half-right. Policies then *compose* from audited predicates:
`is_admin()`, parent-of-gamer, has-active-participation-on, and the like. The IDOR
class of bug exists precisely because the inline subquery is easy to write half-right.

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
   mode; check 5 is what polices it. Once 1+2+5 are in place they subsume the current
   grant-allowlist test — retire it then, not before.

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

### Phase 0 — ship-first standalone fix: atomic gamer creation

Independent of everything else and a confirmed production bug: the gamer-creation
route runs five-plus sequential admin-client writes after `auth.admin.createUser()`
(profile role promotion, customer-profile cleanup, gamer-profile insert, optional
external-account insert, parent link) with no transaction — a failure partway leaves
orphaned, inconsistent records. Move the post-auth DB writes into one `SECURITY
DEFINER` RPC running in a single transaction, with the route deleting the auth user if
the RPC fails. The auth-user creation itself stays route-side (Auth Admin API —
legitimately Model A). Don't wait for the spine to ship this.

### Phase 1 — guard primitives + ownership predicates

Add the §3.1 assertions and §3.2 predicates, and convert the existing role-gated RPC
bodies (the small `42501` set — regrep `schema.sql` to enumerate) to call them. No
policy rewrites in this phase, no new behavior — the matrix in Phase 2 will pin it.

### Phase 2 — the verification spine

Implement the five checks of §3.4 in the DB test suite. Build the matrix annotations
and the self-scoping allowlist (seed both from the current access-control allowlist
and its intent comments); write scope tests for any allowlisted function that lacks
one. Keep the current grant-allowlist test until checks 1+2+5 subsume it, then retire
it. After this phase, a forgotten guard, a vacuous annotation, or an unvetted exposure
fails CI.

### Phase 3 — the route sweep

**Selection criteria** (use these, not a frozen list — regenerate with
`git grep -l createAdminClient src/` and triage): a route is a conversion candidate if
it (a) uses the service-role client, (b) for reads/writes an authenticated user could
be authorized to perform, and (c) does *not* need service-role unavoidably — no
`auth.admin.*` call, no privileged-bucket storage write, no webhook/no-session
context.

The conversions come in three distinct shapes — triage each candidate into one:

1. **Grant-plus-guard** (cheapest; the RPC already exists but is service_role-only,
   and the route calls it via the admin client): add the guard primitive to the RPC
   body, grant it to `authenticated`, switch the route to the user-bound client,
   annotate it in the matrix. The waitlist-join, feedback-submission, and
   admin-participation-cancel routes are this shape today.
2. **New RPC** (the route does direct admin-client writes to a grant-locked table):
   write the Model C/D RPC per §3.5. The admin "comp-enroll a gamer onto a product"
   route is the natural worked example.
3. **Client swap to Model B** (the route touches only normal tables): switch to the
   user-bound client and verify RLS grants the role the operation, both actor and
   target halves. Candidates at time of writing: the admin outbound-WhatsApp write,
   the PIN-forgot read, the external-account (Minecraft) upsert, and the voice-token
   route's membership reads (which may instead justify a read predicate — investigate
   before converting). Two carry extra work: the locale-update route uses the admin
   client only to dodge a server-client *typing* issue — root-cause that rather than
   carrying the workaround into the conversion; and the locations CRUD needs grant
   changes too (`authenticated` currently lacks UPDATE on locations), not just a
   client swap.

**Verified non-candidates** (criterion (c), confirmed in triage — re-verify, don't
assume): the auth-admin routes (gedu creation, password reset, PIN reset token flow,
account switch, gamer metadata sync, gamer creation), the Stripe and WhatsApp
webhooks, storage-upload portions of product create/update (their data writes already
go through user-client RPCs), the Stripe-customer helper used by checkout and the
billing portal (checkout's data reads already use the user client — its earlier
"cross-user seat reads" concern turned out not to exist), and the family-list route
(a gamer legitimately reads siblings beyond their own RLS view; the route scopes the
admin client to the verified caller's family).

**Per-route checklist** before converting:
1. No storage writes, no Auth Admin API calls remain on the converted path.
2. An RPC exists (or is written) encoding the route's business rules + the guard —
   or, for Model B, RLS on every touched table authorizes both actor and target.
3. No cross-user reads beyond what the caller's RLS view permits.
4. An integration test covers unauthenticated, wrong-role, bad-input, and happy path.
5. The RPC is annotated in the matrix (check 5 will fail the build if forgotten).

Batch by shape: the grant-plus-guard set first (smallest diff, settles the pattern),
then Model B swaps, then new RPCs.

### Phase 4 — RLS completeness

Refactor existing write policies to compose from the §3.2 predicates so the write-IDOR
loop passes everywhere; migrate inline `(SELECT get_user_role()) = 'admin'` policy
comparisons to `is_admin()` opportunistically as policies are touched. Ship pending
features that add write policies (e.g. a parent updating their linked gamer's profile
fields) on the same predicates.

---

## 6. Explicitly out of scope

Adjacent but *different* refactors — folding them in would bloat this one:

- **Emailed-link / origin-trust hardening** — deriving emailed link origins from a
  trusted source rather than the request `Host`, scanner-resistant token flows, OTP
  expiry split. Auth-email security, not DB authz.
- **Data-validity constraints** — CHECK constraints on free-text columns, NOT NULL
  tightening. Same layer, different property (validity, not authorization).
- **Browser-level auth E2E** — Playwright against a local Supabase stack. Shares the
  role-switching substrate and would accelerate Phase 2, but the DB-test helpers
  already cover what the spine needs.
