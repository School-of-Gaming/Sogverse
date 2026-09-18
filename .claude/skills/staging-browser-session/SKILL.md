---
name: staging-browser-session
description: Sign in to staging from a script that drives a browser (Playwright) — as an admin, or as a parent with gamers, including the parent PIN unlock and switching into a gamer's session.
---

# Signing in to staging from a browser script

`.env.local` carries two staging accounts (staging is what local dev points at) for any
script that has to sign in and drive a browser:

```
STAGING_ADMIN_EMAIL=...      STAGING_ADMIN_PASSWORD=...
STAGING_PARENT_EMAIL=...     STAGING_PARENT_PASSWORD=...     STAGING_PARENT_PIN=...
```

- **Not in `.env.local.example`, by the owner's ruling (2026-09-10).** They are a local
  convenience for driving a browser, not something anyone needs to run the project. A
  worktree gets a copy of `.env.local`; lines added inside one are copied back to the main
  checkout's file before it is removed. Never print the values.
- **Sign in through the real login form**: email input `#identifier`, password `#password`.
  `scripts/preview-export/` does this for the admin account.
- **The parent is PIN-locked after login.** The proxy bounces every page, the shop
  included, to `/parent/unlock` until `POST /api/auth/pin/verify` with `{ pin }` succeeds —
  so a script unlocks before navigating anywhere.
- **The parent has at least one gamer whose sign-in is the parent-switch kind.** Enter the
  gamer's session with `POST /api/auth/switch-account` `{ userId }`, taking the id from
  `GET /api/family/list` → `family[]`.

**Verification:** after unlocking, a navigation to a parent page lands on that page rather
than `/parent/unlock`; after switching, `/api/family/list` or the page header reflects the
gamer.
