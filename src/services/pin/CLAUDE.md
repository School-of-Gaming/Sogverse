# Parent PIN

A 4-digit PIN gates entry into a parent (`customer`) account. On a shared family
device the parent's password is usually saved/autofilled, so it's not an
effective secret there. The PIN — which lives only in the parent's head — is the
real boundary protecting payment/management actions from children.

## The model: a locked session

A `customer` session is **locked** until the parent enters their PIN once. While
locked, the session may not act as the parent **anywhere** — the boundary is the
session's state, not any particular route. Once unlocked it stays unlocked for
the life of that session: until the user **switches to a gamer** or **signs
out**. There is no inactivity/TTL expiry (a deferred improvement).

Scope: only escalation into a parent account is gated. Gamer↔gamer (sibling)
switching is free, and admin/gedu/gamer roles are never affected.

**Rule: Every PIN check is behind a single `role === "customer"` condition.** Do
not gate other roles, and do not gate per-route — gate the session state.

## Enforcement: two chokepoints

1. **Pages — the proxy (`src/proxy.ts`).** A locked customer is redirected to
   the unlock gate (`/parent/unlock`) from every route, including public pages
   like `/shop`, except an explicit exempt set (the unlock gate,
   `/select-profile`, the reset landing page, auth routes, `/api/*`). The role
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

## The unlock cookie

`sog_pin_verified` holds an HMAC (`PIN_COOKIE_SECRET`) over `(userId,
session_id)` — see `src/lib/pin-session.ts`. It is unforgeable, bound to the
user (a stale cookie can't unlock another account), and bound to the auth
`session_id` — stable across token refreshes (so the unlock holds for the
session's life) but changing on re-login / account switch, so switching
auto re-locks with **no server state**. It is also explicitly cleared on
sign-out and `switch-account`.

**It's a session cookie** — no `maxAge`/`expires`. It survives closing a *tab*
but is dropped when the *browser* quits (verified in Chromium), so quitting and
relaunching re-prompts. This is best-effort, not a hard control — session-restore
browsers can carry it across a restart. Treat re-lock-on-quit as a little free
security, not a guarantee.

## Storage & RPCs

`customer_profiles.pin_hash` (bcrypt via `pgcrypto`), one PIN per parent account.

- `set_my_pin(pin)` / `verify_my_pin(pin)` / `pin_is_set()` — `auth.uid()`-scoped,
  granted to `authenticated`, touch only the caller's own row.
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

Routing into the gate needs no special-casing in `select-profile`: switching into
a parent (or "Continue as me") clears the unlock cookie / lands on `/parent`,
which the proxy redirects to `/parent/unlock`.

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
