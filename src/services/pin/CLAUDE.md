# Parent PIN

A 4-digit PIN gates entry into a parent (`customer`) account. On a shared family
device the parent's password is usually saved/autofilled, so it's not an
effective secret there. The PIN — which lives only in the parent's head — is the
real boundary protecting payment/management actions from children.

## Two gates, and they answer different questions

The PIN is spent in two places, and conflating them is the mistake this section
exists to prevent.

**Gate A — a locked parent session.** A `customer` session is **locked** until
the parent enters their PIN once. While locked, the session may not act as the
parent **anywhere** — the boundary is the session's state, not any particular
route. Once unlocked it stays unlocked for the life of that session: until the
user **switches to a gamer** or **signs out**. There is no inactivity/TTL expiry
(a deferred improvement). Everything under "Enforcement", "The unlock cookie" and
the UI section below is Gate A.

**Gate B — leaving a gamer session.** A child switching *out* of their own
account into anyone else's meets one of two answers, and which one depends on how
their session was created (`src/lib/session-provenance.ts`, resolved server-side
by `readSessionProvenance()` in `src/lib/auth.ts` and carried on the guard's
`user.session`):

- a **family session** — the switch route created it, and said so by minting a
  signed marker cookie against the new session's id — costs **a linked parent's
  PIN**. This is the household case: the child is on the family's device and the
  parent is nearby, so the PIN is accepted friction. Any of the child's parents'
  PINs opens it, because a child may be linked to more than one.
- an **own session** — anything else, including a session opened by typing a
  username or an email of the child's own — **cannot switch at all**. The route
  refuses it with 403 `SIGN_OUT_REQUIRED`, and the way to the other person's
  account is to sign out and sign in as them.

**Why an own session is refused rather than priced.** The threat this gate is
about is a child signing in on a school computer and walking away from it, and a
four-digit PIN with no rate limit is not what should stand between that machine
and the parent's account. The obvious stronger price — the *target's* own
password, typed here — was the previous design and it was worse than no switch at
all: it makes this platform a password oracle, an endpoint that answers "is this
the right password for that family member?" to whoever is sitting at the machine.
The login page answers the same question, but it is the place built to answer it,
with GoTrue's own protections behind it. So a credential login on a device outside
the home is a session into exactly one account, and the only way to another one is
to authenticate to it directly.

**Rule: `family` is a marker the switch route minted, never an inference from
the token — and `own` is the default.** The obvious signal is the JWT's `amr`: a
switch-created session records `otp` and a typed sign-in records `password`, so
"no password method" looks like it means "switched in". It does not. A
password-**recovery** session records `otp` too, so a child in email mode who
requests their own reset link, opens it and abandons the form would hold a
session classified as switched-in — a PIN-only path into the parent's account,
opened by a link the child can ask for themselves. Nothing in the token
separates the two; only the mint site does. So an unclassifiable session is
charged the *stronger* gate, and `amr` survives only as a redundant second
condition (a token saying a password was typed is `own` whatever cookie it
carries).

**Rule: parent → gamer stays one click and is never gated.** Handing the device
to a child is the gesture the switcher exists for, and a *locked* parent must be
able to make it — which is what `allowUnverified` on the switch route is for.

**Rule: Gate A is keyed on `role === "customer"`; Gate B is keyed on a gamer
caller and their session's provenance.** Neither may grow a per-route condition:
Gate A gates the session state, and Gate B gates the one route that can change
which account a session belongs to.

## Enforcement: two chokepoints

1. **Pages — the proxy (`src/proxy.ts`).** A locked customer is redirected to
   the unlock gate (`/parent/unlock`) from every route, including public pages
   like `/shop`, except an explicit exempt set (the unlock gate,
   `/select-profile`, the emailed-link landing pages — `/reset-pin`,
   `/verify-email`, `/reset-password`, `/forgot-password` — auth routes,
   `/api/*`). The role
   lookup is skipped when a valid unlock cookie is already present, so
   logged-out and already-unlocked traffic pays no extra query.
2. **API — `requireRole()` in `src/lib/auth.ts`.** Where the gate bites for
   actions (checkout, subscription changes, gamer management). When the resolved
   role is `customer` and the session is locked, it returns
   `403 { code: "PIN_REQUIRED" }`. Routes a locked customer must still reach pass
   `{ allowUnverified: true }`: the PIN routes, `switch-account` (drop to a
   gamer), and `family/list` (profile-chooser data).

Because `/api/*` bypasses the proxy, the **API chokepoint is the real boundary
for capabilities** — the page gate is UX.

**Rule: A new parent-only route inherits the gate automatically by calling
`requireRole("customer")`. Opening a hole requires the explicit, greppable
`allowUnverified` flag — never bypass the gate any other way.**

## Gate B lives entirely in the account-switch route, and can live nowhere else

**Rule: `POST /api/auth/switch-account` is the only place a switch PIN is
verified, the only place outside the PIN routes that mints the unlock cookie,
and the only place the family-session marker is minted at all.** All three
follow from one fact: the check happens while the caller is still the child, and
the cookies have to be bound to a session that does not exist yet. Nothing
before the route has the caller's session to read the provenance from, and
nothing after it exists early enough to see the new session's id.

What the route does, in order: resolve the target, run the family-membership
matrix, *then* charge the gate. Membership first is load-bearing — otherwise the
route would test PINs against families the caller is not in, and it would tell an
own session that some arbitrary account id is one it would have to sign out to
reach.

- **Own session.** Refused 403 `SIGN_OUT_REQUIRED` immediately after the
  membership matrix, before anything else runs. A `pin` in the body changes
  nothing — the PIN is not an alternative price here, so the route does not even
  ask whether it would have matched — and nothing destructive has happened by
  then, so the child is left holding the session they arrived with.
- **Family session.** The PIN is checked with `verify_pin_for_any` over every
  parent this child is linked to, through the service-role client. That function
  compares none of its arguments against `auth.uid()`, so it is service-role only
  and what establishes the caller may ask about *these* parents is the membership
  matrix that ran first. Three outcomes, and they are answered differently:
  `valid` proceeds, `invalid` is a 403 `PIN_INVALID`, and `not_set` is a 403
  `PIN_NOT_SET` — a fact about the family, which no amount of careful typing
  fixes, so the family is sent to set a PIN rather than told a child got theirs
  wrong. A missing PIN in the body is 403 `PIN_REQUIRED`.

**Rule: a failed gate must leave the caller's session untouched.** Verify before
anything destructive: both refusals land before the sign-out, so a refused caller
still holds the session they arrived with and no cookie has been written.

**Rule: the unlock cookie is minted on exactly one path — a family session
switching to a parent.** The PIN was just checked one step earlier, and asking
for the same four digits twice in one gesture is friction with nothing behind it.
Switching into a *gamer* always clears the cookie, and a session that is not
allowed to switch never reaches either branch.

**Rule: the family marker is minted on EVERY session the route creates, with no
per-target condition.** A gamer target, a parent target, a parent dropping to a
child — all of them. The rule is kept that simple deliberately: the only
alternative is a condition, and a condition is a thing that can be got wrong in
the one place where getting it wrong hands out the cheaper gate. On a parent
target it is inert anyway (only a gamer caller is ever charged for leaving), so
narrowing it would buy nothing. When the new session carries no `session_id`
there is nothing to bind either cookie to, so neither is minted and the marker
is deleted — the session then reads as `own`, which is the stronger answer: that
family signs in again rather than switching.

**Rule: the window between redeeming the OTP and minting the marker must not
throw and must not touch the network.** Redeeming has already written the
target's cookies into the mutable store, so by that point the switch has
happened: a throw in the window returns a 500 on a successful but unmarked
switch, and a network call that fails transiently silently classifies a
switched-in child as `own`. So the new session's id is read out of the access
token the redemption itself returned — decoded, not verified, because we minted
that token and it is the one this response is about to set — rather than by
asking the client for its claims, which verifies against the project's JWKS. An
unreadable token lands in the same branch as a missing `session_id`. The one
thing the window may refuse on is a token naming an account other than the
resolved target: both cookies bind that target, so a mismatch means the id and
the account came from different sessions, and it is asserted rather than
resolved by binding whatever the token said.

**Rule: a family may not acquire a gamer before it has a PIN.** `create_gamer`
refuses a parent with no PIN as its first statement (SQLSTATE `P0025`), and the
creation route turns that one refusal into a 403 `PIN_REQUIRED` the parent can
act on. Gate B is the reason: a family holding a gamer account and no PIN would
leave that gate with nothing behind it.

**Trap: `pin_is_set()` answers about the caller, so it is useless from a gamer
session.** It is `auth.uid()`-scoped, and a child is not their parent — a child
asking it gets the answer for their own account, which has no `customer_profiles`
row at all. Anything that needs to know whether a *family* holds a PIN asks
`verify_pin_for_any`, which takes the parents explicitly.

## Two signed cookies, and they answer different questions

`src/lib/pin-session.ts` holds both, as HMACs over `PIN_COOKIE_SECRET` bound to
the same `(userId, session_id)` pair. `sog_pin_verified` says **this parent has
entered their PIN**; `sog_family_session` says **the switch route created this
session**. They are kept apart by their signed payload prefixes (the inventory
lives in `src/lib/email-verification.ts`), so neither can ever be presented as
the other.

The marker's expiry runs the opposite way to the unlock cookie's, and
deliberately. Dropping the unlock cookie on a browser quit re-locks the parent,
which is free security; dropping the marker would re-classify a switched-in child
as self-authenticated and refuse them the switch back to their parent, so a
browser restart at home would strand the family in the child's account with no
way out but a login. It therefore carries a long `maxAge`, and the `session_id`
binding is what actually expires it.

### The unlock cookie

`sog_pin_verified` holds an HMAC (`PIN_COOKIE_SECRET`) over `(userId,
session_id)` — see `src/lib/pin-session.ts`. It is unforgeable, bound to the
user (a stale cookie can't unlock another account), and bound to the auth
`session_id` — stable across token refreshes (so the unlock holds for the
session's life) but changing on re-login / account switch, so switching
auto re-locks with **no server state**. It is also explicitly cleared on
sign-out and on every switch but the one Gate B mints it for.

**It's a session cookie** — no `maxAge`/`expires`. It survives closing a *tab*
but is dropped when the *browser* quits (verified in Chromium), so quitting and
relaunching re-prompts. This is best-effort, not a hard control — session-restore
browsers can carry it across a restart. Treat re-lock-on-quit as a little free
security, not a guarantee.

## Storage & RPCs

`customer_profiles.pin_hash` (bcrypt via `pgcrypto`), one PIN per parent account.

- `set_my_pin(pin)` / `verify_my_pin(pin)` / `pin_is_set()` — `auth.uid()`-scoped,
  granted to `authenticated`, touch only the caller's own row.
- `verify_pin_for_any(user_ids, pin)` — does this PIN match ANY of these users?
  Answers `valid` / `invalid` / `not_set`, never NULL and never a raise, because
  it sits on a credential path where a mistyped digit must not become a 500.
  Admin-only (REVOKE'd from `authenticated`): it checks no argument against
  `auth.uid()`, so exposed to a session it would be a PIN oracle pointable at any
  family. Called by the switch route alone, after the membership matrix has
  established the caller may ask about those parents.
- `set_pin_for_user(user_id, pin)` — admin-only (REVOKE'd from `authenticated`),
  used solely by the email-reset route via the service-role client. That route
  resolves its user from a signed token rather than a session, so it genuinely
  has no caller to act as; the *forgot* route, which reads the caller's own hash
  to bind the token, uses the caller's client and its own-row read policy.

There is no rate-limiting and no PIN-strength validation beyond "exactly 4
digits". Both are **deliberate**, not oversights:

**Rule: Do not add brute-force throttling or PIN-strength rules without
revisiting the threat model.** The PIN guards against a *child on a shared
device*. A child capable of scripting a brute-force against
`POST /api/auth/pin/verify` is old enough to be handling the actions the PIN
guards anyway. If the model ever widens past the on-device child (e.g.
off-device credential-stuffing), a per-account failed-attempt counter with a
short cooldown is the cheap fix. The `forgot` email path is likewise
un-throttled, matching the existing password-reset email.

## Routes (`src/app/api/auth/pin/`)

- `POST /verify` — verify PIN, set the unlock cookie. A wrong PIN is a **200 with
  `{ verified: false }`** (not an error); only a genuine request failure throws.
- `POST /` (`/api/auth/pin`) — create (no PIN set) or change. Creating runs while
  locked (nothing to protect yet). **Overwriting** an existing PIN requires an
  already-**unlocked** session — same bar as changing a password requires being
  logged in. This stops a locked child from overwriting the PIN; a forgotten PIN
  is reset via email, never here.
- `POST /forgot` — email the parent a reset link (authenticated; the link goes
  only to the account email). Always resolves (no info leak).
- `POST /reset` — public, token-authorized; sets the PIN via `set_pin_for_user`.
  No session required.
- `GET /status` — returns `{ isSet, unlocked }`. The `unlocked` bit lives in the
  HttpOnly cookie, so it can only be read server-side via this route.

## Reset by email — and why not Supabase recovery

A forgotten PIN is reset via a link emailed to the parent's inbox — the only
channel a child on a shared device can't reach. The link carries a **standalone
signed token** (`createPinResetToken` / `verifyPinResetToken`), **not** a
Supabase recovery link.

**Rule: Do not reuse Supabase recovery for PIN reset.** A clicked recovery link
yields a normal session, indistinguishable at the reset endpoint from the locked
child's own session — so the child could overwrite the PIN. A standalone token
is verifiable without a session, which keeps the child out.

The token has a single 24h expiry (`RESET_TOKEN_TTL_MS`) — unrelated to
Supabase's `otp_expiry` (which governs the password-reset email).
`/api/auth/pin/reset` is session-agnostic and logs no one in: the parent
typically resets on their phone, then enters the new PIN at the gate on the
locked device. (When reset happens in the same browser as a locked session, the
page chains a `verify` call to unlock and land on the dashboard.)

**Single-use, by binding to the PIN hash.** The token's HMAC signs the account's
*current* `pin_hash` along with `(userId, expiresAtMs)` — the hash goes into the
signed payload, never the token string. Completing a reset rotates `pin_hash`
(bcrypt re-salts even for the same four digits), so the link stops validating the
instant it's used, and any link minted before a later PIN change dies too. This
matters because the reset link lands in the *shared device's* browser history —
without single-use, a child could replay it within 24h. The token rides in a
`?token=` query param (which can appear in server logs); single-use is what
neutralizes that, not the transport.

## Service layer (this directory)

Follows the project two/three-file pattern (see root `CLAUDE.md` § Service Layer):

- `pin.service.ts` — `PinService(supabase)`. The one read (`isSet`) uses the
  injected client (`pin_is_set` is granted to `authenticated`, own-row scoped).
  All writes (`verify`, `setPin`, `forgot`, `reset`) and the unlock-aware
  `status` read go through the API routes — they set/clear the HMAC cookie, or
  need the PIN hash server-side to bind a reset token, neither of which the
  browser may do. The injected client is unused by those methods, intentionally.
- `pin.contracts.ts` — zod schemas for the route responses (`pinStatusResponse`,
  `pinVerifyResponse`), parsed via `parseJsonResponse`.
- `pin.queries.ts` — React Query hooks + `pinKeys`.

**Rule: `usePinIsSet` and `usePinStatus` are two queries on purpose — keep them
separate.** `usePinIsSet` answers "does a PIN exist?" and is SSR-seedable
(`initialData`) so the unlock gate paints its final shape with zero fetch.
`usePinStatus` answers "...and is THIS session unlocked?", which depends on the
HttpOnly cookie and can only be a server round-trip — never SSR-seeded. The
duplicated `isSet` bit is safe from drift only because the two never share a page
lifetime (`usePinIsSet` on `/parent/unlock`, `usePinStatus` in the Add Gamer
dialog on `/select-profile`), and you can't move between them without a full-page
nav that wipes the cache. If a future change mounts both on one page, seed and
invalidate both keys together.

**Rule: PIN writes are not exposed as mutation hooks — call the service
directly.** Every write changes session-lock state living in a proxy-read cookie,
so success must be a full-page navigation (or an in-place view swap in the Add
Gamer dialog). There is no in-page cache to invalidate. On a successful in-place
unlock, the caller seeds `pinKeys.status()` so reopening doesn't re-prompt.

## UI (`src/components/pin/`)

All PIN screens share one touchpad: a 10-key pad with filled dots, no confirm
button — the 4th digit submits immediately. Accepts touch, click, and physical
keyboard (0-9 + Backspace) at once. A wrong PIN shakes and clears for instant
retry (no error text). `PinEntry` is single-shot (enter a known PIN); `PinSet`
requires entering twice (create/reset). `PinUnlockFlow` composes the
create/enter/forgot UI shared by the gate and the Add Gamer dialog.

**Rule: PIN pads hold their disabled state through the success transition** (the
loading-state rule) — a fast double-tap must not fire twice across the nav or
view swap that success triggers.

**Gate B's prompt is not a PIN screen and does not live here.** It sits with the
switcher (`src/components/family/`), because what it asks for is a fact about the
caller's session rather than about PINs: a family session is prompted for a
parent's PIN, and an own session is not prompted at all — it is told that the
switch needs a sign-out, and offered the sign-out form. It composes the pad from
the pieces above rather than taking `PinUnlockFlow` whole: that flow drives
customer-gated routes (verify, create, forgot), and none of the three is
reachable from a gamer session. Two things follow, and both are the model showing
through. **A wrong PIN is answered in the pad's own language** — flash, shake,
clear, no error text — because the child can simply try again, while
`PIN_NOT_SET` replaces the prompt with a message, since no amount of careful
typing fixes a family that holds no PIN. And **there is no "forgot PIN" link on
it**: that route is customer-gated, so a child could never complete it, and the
way out is to sign out and sign in as the parent.

**Rule: the client decides what to ask for through one shared helper
(`switchGateFor`), and that helper is a restatement of what the route enforces.**
It exists so a surface can ask for the right thing up front — or say plainly that
a switch is not available — instead of firing one in order to be told; the route
stays the boundary. Because it is a restatement it can drift, so a change to the
route's split is unfinished until the helper matches — and the helper answers
`unknown` while the session's provenance has not landed, which every call site
must render as *wait* rather than as *no gate*.

Screens:

- **`/parent/unlock`** (`UnlockGate`) — the gate. Branches on `pin_is_set`
  (resolved server-side, seeded so there's no skeleton): create-and-confirm, or
  enter-to-unlock with a "Forgot your PIN?" link. Success is a full-page nav to
  the resolved `?redirect=` target so the proxy re-runs against the fresh cookie.
- **`/reset-pin`** (`ResetPinForm`) — public landing for the email link. Sets the
  new PIN from the URL token, then attempts a seamless unlock (verifies the new
  PIN if the same browser is signed in as this parent); otherwise shows a success
  card pointing to sign-in. `tokenValid` is resolved server-side; a dead token
  shows the "link expired" notice rather than prompting for a PIN.
- **`/parent/change-pin`** (`ChangePinFlow`) — Settings "Change PIN", customers
  only, mirrors "Change Password". Just enter + confirm a new PIN — no
  current-PIN step, since reaching this page already required an unlocked session.
  No forgot link; forgotten PINs reset only at the gate.

**Rule: Any `?redirect=` target on the unlock gate must go through
`resolveInternalPath()` before navigating** (root `CLAUDE.md` § Redirects) — and
the gate itself is dropped as a target so success can't loop back.

Routing into the gate needs no special-casing in `select-profile` for a parent
signing in or continuing as themselves: they land on `/parent`, which the proxy
redirects to `/parent/unlock`. The one case that skips the gate is the switch
route minting the cookie for a family session that just paid a PIN to get there —
see Gate B above; the gate is not bypassed, it is already satisfied.

There is no client-side handling of an API `403 PIN_REQUIRED`: within a live tab
an unlocked session can't silently re-lock, and every navigation is already
proxy-gated, so the 403 is unreachable in normal flow — it stays purely as
server-side defense-in-depth.

## Deferred improvements

- Attempt throttling on `verify_my_pin` (see the no-rate-limiting rule above).
- Explicit unlock TTL (today re-lock is driven by `session_id` change and
  browser-quit only).
- Preserve the query string on the unlock redirect — the proxy redirects with
  `?redirect=<pathname>` and drops the original query string. Currently moot (no
  `/parent` route reads query params); revisit if one starts to.
