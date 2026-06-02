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
`session_id`, which is stable across token refreshes (the unlock survives a
browser close) but changes on re-login / account switch — so switching auto
re-locks with no server state. The cookie is also explicitly cleared on
sign-out and `switch-account` for hygiene. Persistent (no `maxAge`).

## Storage & RPCs

`customer_profiles.pin_hash` (bcrypt via `pgcrypto`), one PIN per parent
account. Migrations `00075` / `00076`.

- `set_my_pin(pin)` / `verify_my_pin(pin)` / `pin_is_set()` — `auth.uid()`-scoped,
  granted to `authenticated`, touch only the caller's own row.
- `set_pin_for_user(user_id, pin)` — admin-only (REVOKE'd), used solely by the
  email-reset route via the service-role client.

There is no rate-limiting and no PIN-strength validation beyond "exactly 4
digits" (a parent who picks `0000` has made their own trust call).

## Routes

- `POST /api/auth/pin/verify` — verify PIN, set the unlock cookie.
- `POST /api/auth/pin` — create (no PIN set) or change (requires `currentPin`).
  It will **not** overwrite an existing PIN without the current one — this is the
  guard that stops a locked child at the gate from blind-overwriting the PIN.
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

## Status

Logic layer implemented and tested. UI (the `/parent/unlock` gate page, the
`/reset-pin` landing page, the settings "Change PIN" block, and the
`select-profile` parent-tile routing) is intentionally not yet built.
