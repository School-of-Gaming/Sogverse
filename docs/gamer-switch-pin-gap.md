# Investigation: the PIN gap in account switching out of a gamer session

**Status: investigation, not a committed feature.** This documents a security gap,
how the current PIN system actually works around it (facts verified against the
code in August 2026), and a candidate design that survived one adversarial design
review. Whether to build it has deliberately **not** been decided — if it is ever
picked up, it graduates to a `docs/plans/` plan and gets that directory's full
scrutiny (cold-read included) first.

## The gap

Switching accounts from a signed-in gamer session is ungated in one direction and
half-gated in the other:

- **gamer → sibling gamer needs nothing.** Any child holding one signed-in gamer
  account can hop into a sibling's account in two clicks — session feeds,
  reports, voice rooms, game-account links, all of it — with no check anywhere.
- **gamer → parent** succeeds ungated at the switch itself; the protection is
  only that the landing (`/parent`) is proxy-locked behind the unlock page.

The switch route's own header comment records the parent half as known and
deferred. The owner's framing when this was investigated: a 4-digit PIN "within a
family unit acts as friction to someone motivated to get access rather than a
hard block"; the goal, if built, is one simple unified system, because "with
reduced complexity we can ensure higher security".

## How the current system works (verified facts)

These are the constraints any design here has to live with:

- The PIN gate is enforced server-side at two chokepoints — the proxy for
  `/parent` pages, and the API route layer for customer-gated routes — keyed on
  a single condition: the session is a customer without a valid unlock cookie.
  `/gamer` routes are never PIN-gated, so a sibling switch cannot be gated "at
  the landing" the way a parent switch effectively is.
- The unlock cookie is an HMAC over `userId:sessionId` (helpers in
  `src/lib/pin-session.ts`, not in `src/services/pin/`). Because it binds to a
  session id, and a switch's new session id exists only inside
  `POST /api/auth/switch-account` after its `verifyOtp`, **the switch route is
  the only possible place to verify a PIN for a switch or to mint an unlock
  cookie for the new session**. "Mint the cookie first, then switch" is
  structurally impossible.
- The existing PIN RPCs (`verify_my_pin`, `set_my_pin`, `pin_is_set`) are
  `auth.uid()`-scoped. From a gamer session `pin_is_set()` returns `false`
  **silently** (no customer_profiles row), not an error — so any client-side
  "does the family have a PIN" read from a gamer session is a trap.
- A service-role `set_pin_for_user` exists but overwrites unconditionally; the
  PIN *reset* flow depends on that, so it cannot be narrowed to only-if-unset.
- PIN hashes are compared in Postgres (`crypt()`); the app has no bcrypt/argon
  dependency, so verification can only happen in the database — a gamer-session
  check needs a new service-role-only function.
- There are **three** gamer-reachable switch call sites, all posting through the
  family service's shared commit path: the header account menu (the `SEAM:`
  comment marks where a PIN dialog would mount), the `/select-profile` grid,
  and the switch-confirm dialog used by the Add Gamer flow (gamer → parent with
  a redirect target). A gate landing on fewer than all three either leaves the
  hole open or silently breaks Add Gamer.
- The switch route already resolves the calling gamer's linked parents with the
  admin client for transition validation, so "find whose PIN to check" costs no
  new query shape.
- There is no rate limiting on PIN verification (a documented deferred item in
  `src/services/pin/CLAUDE.md`). Notably, gating the switch would *improve* the
  grinding position: today a gamer can switch into the parent ungated and grind
  the customer-gated PIN-verify route from that session; gated, they can't
  reach that session at all.

## The candidate design — the two-gate model

One sentence: **a PIN stands between you and anything except a gamer surface you
are already on.**

- **Gate A (exists today, untouched):** a parent session cannot use `/parent`
  surfaces without a valid unlock cookie. Covers fresh parent sign-in, direct
  navigation, browser restart, expiry.
- **Gate B (new):** any switch initiated from a gamer session — to the parent or
  to a sibling — requires a linked parent's PIN, verified server-side inside the
  switch route before anything else happens. The client dialog is UX; the route
  is the trust anchor.

The gates would connect in exactly one place: a PIN-verified gamer → parent
switch mints the unlock cookie for the freshly created parent session, so it
lands on `/parent` already unlocked instead of asking the same PIN twice in ten
seconds. Sibling switches keep deleting the cookie.

Shape decisions that survived the design review:

- **Ordering is load-bearing:** the PIN check completes and fails *before* the
  route signs the gamer out. A wrong PIN must leave the child exactly where they
  were — a gate that logs them out on a typo is worse than no gate.
- **Two new SECURITY DEFINER functions, granted to service_role only:** a verify
  taking a uuid *array* + attempt, answering "matches any of these users' PINs"
  in one round trip (expresses "any linked parent's PIN authorizes" directly);
  and a guarded create setting a PIN **only where none exists** — the
  only-if-unset clause inside the function body, because "a child must never
  overwrite a PIN they don't know" is the strongest invariant in the feature.
  Service-role-only functions do not go in the DB-test authorization spine
  (that classifies functions exposed to `authenticated`/`anon`); they get
  explicit grants plus a negative db case each (authenticated client refused).
- **No verify-vs-create mode on the wire.** The body gains one optional `pin`
  field; the server derives intent from stored state (PIN exists → verify; none
  → guarded create). This fails closed on the one interesting race (a parent
  sets a PIN on another device mid-dialog: the child's "created" value is
  treated as a guess against the real PIN and rejected).
- **No client-side is-PIN-set read, ever** (see the `pin_is_set()` trap above).
  The dialog opens in enter mode; a no-PIN family is discovered by the first
  attempt returning a distinct `PIN_NOT_SET` code, which flips the dialog to
  create-and-confirm. Distinct codes: `PIN_REQUIRED`, `PIN_INVALID`,
  `PIN_NOT_SET`.
- **The create branch refuses unless the family has exactly one linked parent**
  — "any parent's PIN" is well-defined for verify but not for create; today one
  parent per family is a UI-blocked invariant, so this closes the edge in one
  line.
- **One dialog component**, reusing the unlock gate's pad pieces (enter +
  create-and-confirm) — not the unlock page's flow component, which drives
  customer-gated routes a gamer session cannot call. Wired into all three call
  sites via the shared commit function; parent-initiated switches (parent →
  gamer, "continue as me") stay PIN-free and one-click.
- **No "Forgot your PIN?" link in the dialog, deliberately** — the forgot route
  is customer-gated. The escape hatch is Cancel → sign out → sign in as the
  parent → the unlock gate's forgot link.

## Knock-ons the design creates

- The Add Gamer dialog carries an inline unlock flow because its gamer → parent
  switch lands *locked* today. With the cookie minted at switch time that path
  lands unlocked and the inline gate goes dead **for that path only** — but it
  stays live for a parent who signed in fresh and reached `/select-profile`
  (PIN-exempt) directly, so it must not be deleted.
- Two rules in `src/services/pin/CLAUDE.md` would be **reversed**, not
  extended: "only escalation into a parent account is gated; gamer↔gamer
  switching is free", and "every PIN check is behind a single
  `role === "customer"` condition" (Gate B's check keys on the gamer role).
  Both rules would need rewriting in the same change — a doc still saying
  "sibling switching is free" next to code that gates it is how the gate gets
  deleted as dead weight later.

## Rejected while investigating

- **Gate siblings at the landing page:** impossible without PIN-locking
  `/gamer`, which must stay free — only the transition is sensitive.
- **Client-side-only PIN prompt:** a UI check over an ungated route is theater.
- **Keep gamer → parent on the unlock page, dialog only for siblings:** two PIN
  surfaces for two flavors of one action; the owner asked for one system.
- **Double PIN entry for gamer → parent:** the route just verified it and holds
  the new session; minting the cookie is security-equivalent, strictly better UX.
- **Fold in rate limiting:** separate deferred item; this change strictly
  improves the grinding position on its own.

## Open questions (why this is not yet a plan)

- **Whether to build it at all.** The owner is explicitly not committed: the
  PIN is friction within a household, and the sibling gate adds a real step to
  a switch children may do often (shared devices). The UX cost is unmeasured.
- Whether the no-PIN create-in-dialog branch is wanted, versus simply blocking
  until the parent sets a PIN from their own session (fewer moving parts, but
  strands legacy no-PIN families mid-flow).
- Where the dialog's copy and pacing land for children (it is a child-facing
  surface asking for a parent's secret).
