# HTTP Route Boundary Architecture

**Status: built.** Both phases of §5 have landed — the primitive, the posture registry
and its four spine checks, then the sweep. §2–§3 describe the system that exists, not a
target: every handler on the surface carries one machine-readable classification, every
handler that authenticates its caller does so through shared code, every JSON body is
validated against a schema, every handler has an integration test, and the spine fails
the build when any of that stops being true. This is the second instance of the
hindsight-refactor loop (`docs/refactor-playbook.md`); the first was
`docs/db-authorization-architecture.md`, whose §1 problem statement this doc repeats one
layer up. This doc stays the source of truth for how the HTTP boundary is enforced.

**Execution contract.** Written so a fresh session can act on it:

1. **Re-verify current state.** The §2 snapshot was verified 2026-07-27 and will drift.
   Regenerate the surface with a glob over `src/app/api/**/route.ts`; regenerate the
   admin-client import list with `git grep -l createAdminClient src/`. The registry
   itself is the live classification and is checked against the filesystem on every CI
   run, so it cannot silently disagree with the surface the way a doc snapshot can.
2. **No database involvement.** This work is app-layer only: no migrations, no staging
   side effects, no deploy-window hazards. The spine tests are plain jsdom integration
   tests and run locally (`npx vitest run <file>`) and in CI.
3. **No authorization semantics change silently.** Every posture in §2 was recorded as
   it *was*, warts included, before anything moved. A wart fixed during the sweep was a
   deliberate, recorded change in its PR description — never a side effect of mechanical
   conversion. The same rule applies to any future change here.

---

## 1. The problem

*Stated as it stood before the work, and kept in that tense: it is the record of why
the machinery in §3 exists, and the thing to re-read if anyone proposes removing a
piece of it.*

The route layer's conventions — `requireRole` gating, contract-schema body parsing,
error-code→HTTP mapping, the `{ error: string }` wire shape — are enforced by
convention, not mechanically. Of 41 exported handlers: 27 are gated by `requireRole`,
one hand-rolls the same session check inline, and the rest are public, webhook-verified,
API-keyed, token-authorized, or optional-auth — and **nothing distinguishes a
deliberately public route from a route whose author forgot the gate.** A new route that
skips auth, parses its body by hand, and echoes raw error messages passes CI today.

The same fragmentation holds for the other two boundary duties:

- **Input:** 12 handlers parse through the shared helpers with a schema; 14 parse ad hoc
  (half with a local zod schema, half with hand-rolled `typeof` checks or none); dynamic
  params are trusted unvalidated in every route that has them; query strings are
  hand-validated in the handful of GETs that read them.
- **Errors:** the PostgREST-code→HTTP map is re-implemented per route with real
  divergence (the same code mapping to 403 in five routes and falling through to 500 in
  another; unique-violation → 409 in five, swallowed in one), and eight handlers forward
  raw error messages to the client — three deliberately, five incidentally.
- **Tests:** eight route files (plus one handler in a ninth) have no integration test at
  all, and nothing notices when a new route ships untested.

This is precisely the pre-refactor state of the DB layer: the right way exists and is
mostly followed, deviations are invisible, and the class of bug — *a privileged
operation reachable without its guard* — stays alive because only instances ever get
fixed. The DB spine now stands as the second and third layer behind every route; this
refactor builds the mechanical first layer in front of it.

---

## 2. The surface (snapshot 2026-08-14 — re-verify per the execution contract)

*The posture taxonomy and the per-posture counts below still describe the surface: the
sweep changed no route's posture, by design. What the sweep did change is recorded at
the end of §5 — how bodies are parsed, how errors map, and what is tested.*

### The surface

47 `route.ts` files, 50 handlers (three files export two methods). Auth postures found in
the wild — this taxonomy is exhaustive over today's surface, and §3.1 adopts it:

| Posture | Handlers | Notes |
|---|---|---|
| `role-gated` (`requireRole`) | 32 | Variants that must be captured: `allowUnverified` (6 — the PIN-locked-customer routes), `requireCertifiedGedu` (2), all-four-roles-as-any-authenticated (2) |
| `any-authenticated` | 2 | The locale route and the Roblox avatar proxy: every role is equally entitled, so the gate exists for the caller's identity rather than their role. Both go through the primitive — this posture stopped meaning "hand-rolled" when the sweep converted the locale route |
| `public` | 7 | Mojang and Roblox username lookups, instant-room existence check, location search (the educator registration form asks before an account exists), gedu self-registration (unauthenticated account creation — the highest-value public route), parent self-registration (unauthenticated account creation, with a distinct 409 for an existing address — see the registry entry for the accepted enumeration trade), forgot-password (always-200 enumeration defense) |
| `session-mutating public` | 2 | OAuth callback (redirect-only, `resolveInternalPath` on `next`), signout (POST-only as the CSRF control, 303) |
| `signed-token` | 1 | PIN reset: a signed token *is* the authorization; session-agnostic; deliberately admin-client |
| `optional-auth` | 1 | Instant-room token: public, but silently elevates admin/certified-gedu to room owner; fails closed to guest. A `role-gated \| public` binary cannot express this route |
| `webhook` | 4 | Three verifier strategies (Stripe signature, Meta HMAC + timing-safe compare, Discord Ed25519) plus Meta's GET challenge (a plain `===` compare until the sweep made it timing-safe like every other secret comparison here). All POST verifiers consume the **raw text body** before any JSON parse. Divergent error contracts: Stripe wants 5xx for retry; Meta must never 5xx or the endpoint is disabled |
| `api-key` | 1 | Minecraft join-check: Bearer + timing-safe compare, server-to-server. Its gating is unbuilt, so it authenticates, validates, and fails closed 501 — it reaches no data at all |

### Existing primitives (the wrapper composes these; it replaces none of them)

- **`requireRole(roles, options?)`** (`src/lib/auth.ts`) — verifies claims locally, loads
  the profile, narrows the role at type level, and enforces two extra gates: the parent
  PIN gate (skipped via `allowUnverified`) and the certified-gedu gate (opt-in via
  `requireCertifiedGedu`). Returns `{ user, profile, supabase }` (user-bound client) or a
  ready `NextResponse` (401/403 with stable `code`s). Every gated route uses the
  `instanceof NextResponse` early-return convention.
- **`parseJsonBody` / `parseBodyValue`** (`src/lib/api/json-body.server.ts`) — JSON →
  schema → 400 with first-issue message, same early-return convention. `parseBodyValue`
  also serves the two multipart routes (JSON `data` field beside a `File`).
- **`ApiError`** (`src/lib/api/api-error.ts`) — status + optional stable machine `code` +
  log-only message. Thrown by routes and by services alike. The `code` slot is carried
  but unused on both ends today: no route passes one, so the wrapper's forwarding of it
  is unreachable, and the codes clients *do* see are attached to hand-built responses by
  the role gate and the PIN route instead.
- Boundary utilities the postures depend on: `getOrigin` (trusted-host origins),
  `resolveInternalPath` (redirect targets), the instant-room moderator resolver
  (optional-auth elevation, fails closed), timing-safe secret compares.

### The Model-A registry seed

The db-auth refactor's Phase 3 triage CSV (`docs/db-authorization-architecture.md` §5,
"The triage, machine-readably") classifies every module that used the service-role
client, with one-clause justifications: 14 route modules justified as Model A, one
partial (feedback: user-client write, admin-client notification fan-out), 3 non-route
modules, plus the factory. Verified 2026-08-01: its route set exactly matches today's
`createAdminClient` importers — **no drift**. It seeds §3.3 check 3. (The CSV keeps a
row per module that used the client *at triage time*, so a module that has since
dropped it stays listed with its new model rather than being deleted; the Model-A
count is the subset still importing it.)

### Verification precedent (copy this shape, don't reinvent it)

The proxy integration test already does surface-enumeration correctly: a recursive walk
of a fixed in-repo directory, route-group stripping, a carve-out array where every entry
carries a mandatory `reason` string, an **anti-vacuity guard** (a test that fails if the
glob finds nothing), and `it.each` over the discovered surface. The route spine is that
pattern pointed at `src/app/api/`.

### Test conventions

Integration tests mock `requireRole` per `tests/CLAUDE.md` and exercise imported
handlers directly. Coverage today: 26 of 39 route files. Untested: signout, family
list, billing portal, instant-room exists, site notes, Discord interactions, gedu
registration, product update — plus the waitlist-transition PATCH handler in an
otherwise-tested file. The per-route bar (from the db-auth doc's Phase 3 checklist):
unauthenticated, wrong-role, bad-input, happy path.

---

## 3. The solution

Make the route boundary a declared, verified surface: **every handler carries a
machine-readable posture, a completeness test proves nothing escapes classification, and
a single primitive makes the conforming route the shortest one to write.**

### 3.1 The posture registry

One registry (colocated with the spine test that consumes it) mapping every route file →
its classification:

- **Posture** — the §2 taxonomy as a tagged union: `role-gated` (roles +
  `allowUnverified`/`requireCertifiedGedu` flags), `any-authenticated`, `public`,
  `session-mutating-public`, `signed-token`, `optional-auth`, `webhook` (which
  verifier), `api-key`. Every non-`role-gated` entry carries a mandatory `reason`
  string — the carve-out-with-reason shape the proxy test already uses.
- **Body discipline** — `json` (names its schema), `multipart`, `raw` (webhook text
  verification), `none`.
- **Test** — the integration test file that exercises the route. The spine verifies it
  exists on disk and imports the route. An entry may carry `test: null` only during
  Phase 1 (seeding reality); Phase 2 ends with none left.

This mirrors the DB spine's two-classification design: role-gated RPCs vs. self-scoping
allowlist becomes gated routes vs. reasoned carve-outs. Registry growth without reasons
is this design's failure mode; the completeness check polices it.

### 3.2 The primitive: `defineRoute`

A wrapper in `src/lib/api/` that a new route uses by default, composing the existing
primitives — not replacing them:

1. **Auth** from the posture declaration: runs `requireRole` (or the session check for
   `any-authenticated`) and hands the handler the narrowed `{ user, profile, supabase }`.
2. **Parsing slots** for body (schema), query (schema), and params (schema) — closing
   the currently-unvalidated params/query axes. The wrapper must **never pre-consume the
   body for `raw` postures**: webhook verifiers need the untouched text.
3. **A default PostgREST-code→HTTP table** (permission-denied → 403,
   unique-violation → 409, no-data-found → 404, FK/check violations → 400,
   assert-failure class → 500 + log) with per-route overrides, replacing the per-route
   re-implementations.
4. **One message-disclosure point.** The wrapper's outer catch returns a generic
   `{ error }` and logs the real one; forwarding a raw DB/RPC message to the client is a
   per-route opt-in with a comment, preserving the three routes that do it deliberately
   and ending the five that do it by accident.
5. **Optional response schema** — `safeParse` the outgoing payload (500 + log on
   mismatch), unifying the eight routes that already validate RPC results by hand.
6. **Non-JSON escape hatch** — redirects, 204, and raw-text responses pass through
   untouched; the wrapper constrains only what it wraps.

Not every route must use the wrapper — redirect flows and webhook verifiers may stay
hand-written where wrapping obscures more than it helps. **Classification is mandatory;
the wrapper is the default.** The spine's static check keeps the honest boundary: a
route off the wrapper must be a reasoned carve-out in the registry.

### 3.3 The verification spine (route edition)

Plain integration-suite tests — no DB, fast, run locally:

1. **Completeness.** Glob the route files (anti-vacuity guard included); every handler
   appears in the registry exactly once; every registry entry corresponds to a file on
   disk (no stale entries). A new unclassified route fails CI.
2. **Static conformance.** Read each route file's source: a `role-gated` /
   `any-authenticated` entry must contain the primitive call (`defineRoute`, or
   `requireRole` for not-yet-converted files); a file containing neither must be a
   reasoned carve-out. The hand-rolled session check counts as nonconforming from day
   one (it is the recorded exception until Phase 2 converts it).
3. **Admin-client pinning.** The set of files importing the service-role client equals
   the justified registry (seeded from the triage CSV). A new import site without a
   registry entry + reason fails CI — the same move that pinned `anon` grants at zero.
4. **Test linkage.** Every registry entry names its integration test; the spine asserts
   the file exists and references the route. (Test *quality* stays a review concern; the
   spine only guarantees a test exists to review.)

### 3.4 The route shape under this architecture

For reference when writing a new route: declare the posture and schemas in
`defineRoute`, receive `{ user, profile, supabase, body, query, params }` already
narrowed and validated, do the work through the user-bound client or a guarded RPC, and
return data — the wrapper owns status mapping and the error wire shape. A route that
needs something the wrapper can't express is a signal to either extend the wrapper (if
the need generalizes) or write a reasoned carve-out (if it doesn't) — never to
hand-roll silently.

---

## 4. Justification

- **Tests the property, not a proxy.** "This route file declares no gate and no reason"
  is a property check on the actual surface; code review is an intention check. Only the
  former catches the forgotten-gate class — the route-layer twin of the DB audit's
  recurring bug.
- **Defense in depth, both directions.** The DB spine guarantees a handler bug is not a
  DB-level capability; this spine guarantees the handler layer itself is uniformly
  gated, so the DB guards are the *second* check, not the only one.
- **The registry can't rot silently.** Carve-outs demand reasons, stale entries fail,
  admin-client creep fails, untested routes fail. Allowlist growth is the failure mode;
  the completeness check is the police.
- **Low risk by construction.** No schema changes, no shared-environment effects; every
  conversion is one route, independently verified by its integration test, wrong
  conversions caught by the existing suite.

---

## 5. Implementation plan

### Phase 1 — registry + spine + primitive — **LANDED**

`defineRoute` lives in `src/lib/api/`; the posture registry and the four spine checks
live together in the route-registry integration test, mirroring the DB spine's
in-test annotations. The registry seeds reality as-is: all 39 route files and 41
handlers classified, warts recorded as warts. From this phase on, a new route cannot
ship unclassified — an unregistered route file, an undeclared handler method, an
unjustified service-role import and a stale test link each fail CI.

**Registry seed.** 27 role-gated handlers (6 skipping the PIN gate, 2 requiring a
verified educator, 1 naming all four roles), 1 any-authenticated, 4 public, 2
session-mutating-public, 1 signed-token, 1 optional-auth, 4 webhook across four
verifier strategies, 1 api-key. Body discipline: 17 JSON with a schema (7 through a
feature contract, 10 through a schema declared inline in the route), 7 JSON with no
schema at all, 2 multipart, 3 raw, 12 with no body. 16 route files justify a
service-role import; 4 non-route modules are pinned separately. 9 handlers carry no
test.

**The primitive's shape, as built.** It covers the three postures that authenticate
through shared code — role-gated, any-authenticated and public — and deliberately
covers none of the others: a webhook, an api-key or a signed-token route stays
hand-written, and the spine's static check is what keeps it honest. Two properties
worth knowing before writing against it:

- **The body is read only when a body schema is declared.** That is the structural
  guarantee that a raw-body verifier can coexist with the wrapper rather than being
  quietly broken by it, and it is pinned by a test that asserts an unconsumed stream.
- **A declared response schema is an allowlist, not just a check.** The payload sent
  is the schema's parse output, so an undeclared field is dropped rather than
  delivered; only a genuine shape mismatch becomes a logged 500.

**Exemplars.** One role-gated JSON route moved onto `defineRoute` — its 13 existing
integration tests pass unchanged, which is the evidence that the wrapper preserves
behaviour. The public and webhook exemplars are classifications, not conversions:
they demonstrate the reasoned carve-out shape, which is the other half of the design.

### What Phase 1 handed the sweep

Findings and judgment calls from Phase 1, kept because they are the reasoning behind
choices the sweep then applied surface-wide — the "why" the Phase 2 record below
assumes:

- **Two error-mapping divergences resolved deliberately in the exemplar**, and the
  same two questions recur in every conversion. First, an unrecognized database code
  now becomes a 500 rather than being folded into a 400 — an error nobody anticipated
  is a server error, and pretending otherwise hides it. Second, a route whose
  underlying messages are genuinely the user-facing explanation must opt into
  disclosure explicitly, and the opt-in carries its reason as its value.
- **Per-route overrides are how a deliberate divergence survives conversion.** The
  exemplar keeps one code on a non-default status because the client treats that
  failure as bad input rather than a missing resource. Prefer an override with a
  written reason over silently normalizing a route's observable behaviour.
- **`no-data-found` is the code most likely to need a per-route decision** — some
  routes mean "you asked for something that isn't there" (404), others mean "your
  input names something that doesn't exist" (400). Decide it per route, not globally.
- **The taxonomy needed no new posture**, but two entries needed a note rather than a
  category: the all-four-roles route is recorded as role-gated rather than
  any-authenticated because that is what the code does (it loads the profile and
  applies the PIN gate along the way), and the two webhook handlers in one file carry
  different verifier strategies, which is why verifier is a per-handler field.
- **Body discipline needed a "declared but unschema'd" state.** Seven handlers parse
  JSON with hand-rolled checks or none; recording them as JSON-with-no-schema keeps
  them countable, and zero of them is a Phase 2 exit condition alongside zero
  untested handlers.
- **The recorded off-primitive exception expires by itself.** The spine fails if a
  file carrying that exception later gains the shared gate, so converting the
  hand-rolled session route forces the exception's removal in the same change.
- **The architecture had no permanent home yet.** Phase 1 put the tripwire in the
  root and the registry conventions with the test suite, and deliberately left the
  route shape here rather than duplicating a mid-flight design into a colocated doc.
  The sweep's answer is at the end of this section.

**Snapshot corrections found while re-verifying §2.** The surface, the posture counts
and the service-role import set were all exact. Coverage was not: "26 of 39 route
files" counts the integration *test files*, not the routes they cover. The real
figures are 31 of 39 files covered, with 8 files plus one handler in a ninth
untested — which is what §2's untested list already named, so only the ratio was
wrong. The WhatsApp webhook is covered by a test that imports it dynamically, so any
linkage check has to match both the static and the dynamic import form.

### Phase 2 — the sweep — **LANDED**

Converted route-by-route in batches — simple role-gated JSON routes, then the rest of
the gated surface, then multipart and the public routes — with the spine green between
batches. Thirty-one of the thirty-nine route files now go through the primitive. The
eight that do not are the postures it deliberately does not cover: the two
session-mutating redirect flows, the signed-token PIN reset, the api-key server-to-server
check, the optional-auth room token, and the three webhook verifiers. Each is a reasoned
carve-out in the registry rather than an omission, which is the honest boundary the
design was aiming for.

**The three counters are at zero and stay there.** No handler is unclassified, no JSON
body is unschema'd, no handler is untested, no route stands off the primitive without a
written reason. Two of those are now assertions against an empty list rather than
assertions that were deleted once they emptied — kept deliberately as ratchets, so a
regression fails CI immediately instead of quietly starting a fresh backlog.

**What the sweep changed, and what it deliberately did not.** No route's posture moved.
The one apparent exception is not one: the route that hand-rolled its session check now
declares the any-authenticated posture, which is what its code always did. Everything
else that changed is input handling, error mapping and message disclosure.

**Error-mapping decisions worth carrying forward.** Three patterns recurred:

- An unrecognized database code is a logged 500 everywhere now, not a 400 reported to
  the caller as their mistake. Several routes had a catch-all `else 400` that turned
  every unanticipated failure into a client error and hid it.
- `no_data_found` really did need deciding per route, exactly as Phase 1 predicted. The
  split turned out to be clean: a route whose subject is named in the URL path answers
  404, because a missing one is a missing resource; a route whose subject arrives in the
  body answers 400, because the caller's input names something that does not exist. Both
  answers appear on the surface, each with the reason written beside it.
- A status the shared table has no default for stays an explicit response with its
  reason recorded — an upstream payment failure as 502, an exhausted retry loop as 503,
  a broken money-path invariant as 500 through a per-route override.

**Message disclosure is now a decision rather than an accident.** Every route that
forwards an underlying message opts in by name and says why; the rest answer a generic
message for the status and log the real one. The routes that kept the opt-in are the
ones whose underlying messages are genuinely the user-facing explanation — a refused
signup, a refused waitlist join, a refused batch of group changes, a refused product
write — and on those the handler is written so nothing raw can escape past it. Everywhere
else the forwarding was incidental and is closed. Curated copy survived only where it
tells the caller something the status alone does not; where it merely restated the
status, the shared generic replaced it.

**Where schemas live.** Feature contract files gained the shapes that were floating in
routes, and two features that had none now have one. Body schemas belong there because
both ends of an internal call then import the same shape; a schema declared inline in
the route is fine when nothing else consumes it, and the registry records which is which.

**One shape the primitive does not express, recorded rather than worked around.** A
route whose payload is an RPC's `Json` result cannot use the response-schema slot
directly: the generated type is `Json`, the slot's type is the contract shape, and
nothing bridges them without a cast. Those routes narrow the result in the handler
instead — the shape the Phase 1 exemplar already used — and the response slot is used
where the route assembles the payload itself. Worth revisiting only if a wrapper change
can remove the cast without weakening the handler's return type everywhere else.

**The deliberate fixes.** The hand-rolled session check moved onto the primitive, and
the spine's recorded exception expired by itself as designed — the check fails a file
that carries the excuse while using the gate, so deleting the annotation was forced by
the same change rather than left to be remembered. The webhook challenge that compared
its verify token with a plain equality check now uses the same constant-time compare its
sibling handler always used for the HMAC, and the registry's verifier name changed with
it so the annotation cannot outlive the fix.

**Where this doc should live.** Phase 1 deferred the question; the recommendation is to
leave it here in `docs/` rather than colocate it. The reasoning is the one the deferral
anticipated: this system has three homes in the tree — the primitive, the routes, and
the registry that classifies them — and no single directory a route author works in
would auto-load a doc covering all three. What belongs colocated is the *operating
rule*, and that already is: the testing conventions carry how to add a route to the
registry and what a reason has to say, which is what someone adding a route needs at the
moment they need it. This doc is the design record behind that rule — why the boundary
is mechanically verified at all — and it is read deliberately, not incidentally. Moving
it would trade a doc a human opens on purpose for one that auto-loads in one of three
places and is wrong about the other two.

---

## 6. Explicitly out of scope

- **Rate limiting / bot protection** on the public routes — already tracked in
  `TODO.md`; a different property (abuse, not authorization).
- **The RSC sibling problem** — two server helpers (family resolution, PIN-reset token)
  are shared by routes and pages, so their authorization can't be encoded purely at the
  route boundary. Recorded, not solved here.
- **Response localization** and any change to the `{ error, code }` wire contract.
- **Changing what any route actually authorizes.** Posture changes were findings for a
  human decision, not sweep work — and none were made. The one posture question the
  sweep surfaced and left alone: the feedback route names all four roles, which is the
  shared gate's way of spelling "any authenticated caller", and it stays role-gated
  because that is what the code does. It loads the profile the notification email needs
  and applies the parent-PIN gate on the way, neither of which the any-authenticated
  posture does. Reclassifying it would be a behaviour change wearing a tidy-up's
  clothes.
