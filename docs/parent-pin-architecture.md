# Parent PIN Architecture

A 4-digit PIN gates entry into a parent (`customer`) account. On a shared family
device the parent's password is typically saved/autofilled, so the password is
**not** an effective secret there — the PIN, which lives only in the parent's
head, is the real boundary protecting payment/management actions from children.

## The model: a locked session

A `customer` session is **locked** until the parent enters their PIN once. While
locked, the session may not act as the parent **anywhere** — the boundary is the
session's state, not any particular route. Once unlocked it stays unlocked for
the life of that session: until the user **switches to a gamer** or **signs
out**. There is no inactivity/TTL expiry in v1 (a deferred future improvement).

Scope: only escalation into a parent account is gated. Gamer↔gamer (sibling)
switching is free, and admin/gedu/gamer roles are never affected — every check
is behind a single `role === "customer"` condition.

## Enforcement: two chokepoints

1. **Pages — `src/proxy.ts`.** A locked customer is redirected to the unlock
   gate (`/parent/unlock`) from every route, including public pages like
   `/shop`, except an explicit exempt set (the unlock gate, `/select-profile`,
   the reset landing page, auth routes, and `/api/*`). The role lookup is
   skipped when a valid unlock cookie is already present, so logged-out and
   already-unlocked traffic on public pages pays no extra query.
2. **API — `requireRole()` in `src/lib/auth.ts`.** This is where the gate bites
   for actions (checkout, subscription changes, gamer management). When the
   resolved role is `customer` and the session is locked, it returns
   `403 { code: "PIN_REQUIRED" }`. Routes a locked customer must still reach pass
   `{ allowUnverified: true }`: the PIN routes, `switch-account` (drop to a
   gamer), and `family/list` (profile-chooser data).

Because `/api/*` bypasses the proxy, the API chokepoint — not the page gate — is
the real boundary for capabilities. A new parent-only route inherits the gate
automatically by calling `requireRole("customer")`; opening a hole requires the
explicit `allowUnverified` flag, which is greppable and reviewable.

## The unlock cookie

`sog_pin_verified` holds an HMAC (`PIN_COOKIE_SECRET`) over `(userId,
session_id)` — see `src/lib/pin-session.ts`. It is unforgeable, bound to the
user (a stale cookie can't unlock another account), and bound to the auth
`session_id`, which is stable across token refreshes (so the unlock holds across
the session's lifetime) but changes on re-login / account switch — so switching
auto re-locks with no server state. The cookie is also explicitly cleared on
sign-out and `switch-account` for hygiene.

**It's a session cookie** — no `maxAge`/`expires`. Verified empirically
(Chromium): it survives closing a *tab* (the browser session is still alive) but
is dropped when the whole *browser* is quit, so quitting and relaunching
re-prompts for the PIN. This is best-effort, not a hard control — a browser with
session-restore ("continue where you left off") can carry a session cookie
across a restart. We treat that re-lock-on-quit as a little extra security for
free, not a guarantee. An explicit inactivity TTL is a deferred improvement.

## Storage & RPCs

`customer_profiles.pin_hash` (bcrypt via `pgcrypto`), one PIN per parent
account. Migrations `00075` / `00076`.

- `set_my_pin(pin)` / `verify_my_pin(pin)` / `pin_is_set()` — `auth.uid()`-scoped,
  granted to `authenticated`, touch only the caller's own row.
- `set_pin_for_user(user_id, pin)` — admin-only (REVOKE'd), used solely by the
  email-reset route via the service-role client.

There is no rate-limiting and no PIN-strength validation beyond "exactly 4
digits" (a parent who picks `0000` has made their own trust call).

**Why no rate-limiting (a deliberate decision, not an oversight).** `verify_my_pin`
has no lockout, so the 10,000-combination space is in principle brute-forceable
by scripting `POST /api/auth/pin/verify`. We accept this: the PIN's threat model
is a *child on a shared device*, and a child who would script a brute-force
against the API is, by that same token, old enough and capable enough that
they'd be handling the payment/management actions the PIN guards anyway — the
PIN was never meant to be a hard security boundary against that person, only a
speed-bump against casual access. Treat this as the conscious "no." If the threat
model ever widens beyond the on-device child (e.g. credential-stuffing from
off-device), revisit it — a per-account failed-attempt counter with a short
cooldown closes most of the gap cheaply. The `forgot`-email path is likewise
un-throttled, matching the existing password-reset email (`forgot-password`).

## Routes

- `POST /api/auth/pin/verify` — verify PIN, set the unlock cookie.
- `POST /api/auth/pin` — create (no PIN set) or change. Creating runs while
  locked (nothing to protect yet); **overwriting** an existing PIN requires an
  already-**unlocked** session — the same bar as changing a password requires
  being logged in. That's the guard that stops a locked child at the gate from
  overwriting the PIN; a forgotten PIN is reset via email, never here.
- `POST /api/auth/pin/forgot` — email the parent a reset link (authenticated;
  the link goes only to the account email).
- `POST /api/auth/pin/reset` — public, token-authorized; sets the PIN via
  `set_pin_for_user`. No session required.

## Reset by email — and why not Supabase recovery

A forgotten PIN is reset via a link emailed to the parent's inbox — the only
channel a child on a shared device can't reach. The link carries a standalone
signed token (`createPinResetToken` / `verifyPinResetToken`), **not** a Supabase
recovery link. Reusing Supabase recovery was rejected because, once clicked, it
yields a normal session that is indistinguishable at the reset endpoint from the
locked child's own session — so "any authenticated customer may set a new PIN"
would let the child overwrite it. A standalone token is verifiable at the
endpoint without a session, so it keeps the child out.

The token has a single expiry (`RESET_TOKEN_TTL_MS`, 24h) — unrelated to
Supabase's `otp_expiry` (which governs the separate password-reset email).
`/api/auth/pin/reset` is session-agnostic and does not log anyone in: the parent
typically resets on their phone, then enters the new PIN at the gate on the
locked device. (UI note: when reset happens in the same browser as a locked
session, the page can chain a `verify` call to unlock and land on `/parent`.)

**Single-use, by binding to the PIN hash.** The token's HMAC signs the account's
*current* `pin_hash` along with `(userId, expiresAtMs)` — the hash goes into the
signed payload, never into the token string. Completing a reset rotates
`pin_hash` (bcrypt re-salts even for the same four digits), so the same link
stops validating the instant it's used, and any link minted before a later PIN
change dies too. This matters because the reset link lands in the *shared
device's* browser history: without single-use, a child could replay it within
the 24h window to set a PIN they know. `forgot` reads the current hash to mint
the token; `reset` reads it (admin client, bypassing RLS — the hash never leaves
the server) for the `userId` carried in the token, via `parseResetTokenUserId`,
then verifies against it. (The token still rides in a `?token=` query param,
which can appear in server logs; single-use is what neutralizes that, not the
transport.)

## UI

All PIN screens share one touchpad (`src/components/pin/`): a 10-key pad with
filled dots, no confirm button — the 4th digit submits immediately. It accepts
touch, click, and physical keyboard (0-9 + Backspace) at once. A wrong PIN
shakes and clears for an instant retry (no error text). Creating or resetting a
PIN requires entering it twice (`PinSet`); entering a known PIN is single-shot
(`PinEntry`). Both hold the disabled state through the success transition so a
fast double-tap can't fire twice (the loading-state rule).

- **`/parent/unlock`** (`UnlockGate`) — the gate. Branches on `pin_is_set`
  (resolved server-side and seeded into the client so there's no loading
  skeleton): create-and-confirm, or enter-to-unlock with a "Forgot your PIN?"
  link that emails the reset. Success is a full-page nav to the original
  `?redirect=` target so the proxy re-runs against the fresh unlock cookie.
  (No on-screen "switch profile" escape — the header avatar and browser back
  already cover that.)
- **`/reset-pin`** (`ResetPinForm`) — public landing for the email link. Sets
  the new PIN from the URL token, then attempts a seamless unlock (verifies the
  new PIN if the same browser is signed in as this parent) and otherwise shows
  a success card pointing to sign-in.
- **Settings → "Change PIN"** (`/parent/change-pin`, `ChangePinFlow`) — shown
  only to customers, mirrors the "Change Password" button. Just enter + confirm
  a new PIN — no current-PIN step, since reaching this page already required an
  unlocked session (just as changing a password doesn't re-ask for it). No
  forgot link; forgotten PINs reset only at the gate.

Routing into the gate needs no special-casing in `select-profile`: switching
into a parent (or "Continue as me") clears the unlock cookie / lands on
`/parent`, which the proxy redirects to `/parent/unlock` automatically.

There is no client-side handling of an API `403 PIN_REQUIRED`: within a live
tab an unlocked session can't silently re-lock (the cookie lives for the
session's lifetime and `session_id` is stable across refreshes), and every
navigation is already gated by the proxy, so the 403 is unreachable in normal
flow — it stays purely as the server-side defense-in-depth boundary.

## Future improvements

- **Attempt throttling on `verify_my_pin`.** See "Why no rate-limiting" above —
  a per-account failed-attempt counter with a short cooldown would close most of
  the brute-force gap cheaply if the threat model ever widens past the on-device
  child.
- **Explicit unlock TTL.** Today re-lock is driven by `session_id` change and
  browser-quit (session cookie); an inactivity timeout would re-lock a session
  left open and idle on a shared device.
- **Preserve the query string on the unlock redirect.** The proxy redirects a
  locked customer with `?redirect=<pathname>`, dropping any query string on the
  original target (the URL hash is never server-visible, so it's inherently
  unpreservable). No `/parent` route reads query params today, so this is
  currently moot; revisit if one starts to.

## Status

Logic and UI implemented and tested.
