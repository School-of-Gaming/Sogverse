# Gedu profiles, self-registration & verification

Game educators ("gedu") self-register like parents and are **verified by an admin**
before they can be assigned to work. This directory owns the gedu extension table
service + the registration contract; the flow spans a public page, an API route, and
three DB objects.

## Data model

- **`gedu_profiles`** — the 1:1 extension table for gedus (the gedu analogue of
  `customer_profiles`/`gamer_profiles`): `user_id` PK, `verified` (bool, default false),
  `verified_at`, `verified_by` (FK → profiles, `ON DELETE SET NULL` so losing the
  verifying admin never silently un-verifies a working gedu). RLS: admin reads all, a
  gedu reads its own; **no table-level write grant** — writes go only through the RPC
  below so the audit columns can't be forged.
- Other gedu data (name, phone, `spoken_languages`, `locale`) lives on `profiles`;
  coverage lives in `gedu_locations` (see `../locations/`).

## Self-registration (atomic)

Public, unauthenticated `/register-gedu` page → `POST /api/gedu/register`:

1. Resolve the optional Minecraft username (Mojang HTTP) **before** creating the auth
   user — the `minecraft_uuid` UNIQUE can reject it, and `createUser` is irreversible.
2. `admin.auth.admin.createUser` (`email_confirm: true` — email confirmation is disabled
   platform-wide). The new-user trigger seeds a `customer`-role profile.
3. `register_gedu` RPC — one transaction: promote `customer`→`gedu`, swap
   `customer_profiles` for a `gedu_profiles` row (unverified), write profile fields,
   coverage, and Minecraft account.
4. On RPC failure, delete the auth user (rollback) — no half-promoted debris. The only
   gap is process death between steps 2 and 3 (gotrue is HTTP, not SQL).

Then the **client** signs in with the password and does a full-page nav to `/gedu`
(`admin.createUser` doesn't sign the browser in; full-page nav is required after any auth
change — see root CLAUDE.md).

**Rule: `register_gedu` is `service_role` only.** It grants the gedu role, so it must
never be reachable by `authenticated`/`anon`. The API route (admin client) is the only
caller. It guards that the target is a freshly-created `customer` profile so it can't
mutate an established account.

**Rule: callers pass `''`/`[]` for absent optional fields, not null.** The generated RPC
arg types are non-null; the RPC `NULLIF`s empty text (so an empty phone stays NULL
instead of tripping the `profiles.phone` CHECK).

## Verification

A new gedu starts **unverified but with broad platform access** — verification gates two
things: **group assignment** and **instant-voice-room moderation**. Everything else is
open to an unverified gedu.

- **`set_gedu_verified(gedu_id, verified)` RPC** — admin-only (`is_admin()` self-gate),
  stamps `verified_at = now()` / `verified_by = auth.uid()` server-side. Granted to
  `authenticated`; called from the admin user-detail page via the admin's own session.
- **Assignment gate (UI-only, sufficient)**: the gedu picker disables unverified gedus and
  shows a "Not verified" badge. **This is a UI-only gate by design.** Assignment runs
  through `apply_group_changes`, which does *not* re-check `verified`; the invariant holds
  because admins are always trusted and assignment is an admin-only action driven entirely
  by this picker. If a non-admin assignment path is ever added, move the `verified` check
  into `apply_group_changes` — until then a DB-level check would be redundant.
- **Instant-voice-room gate (server-side, required)**: unlike assignment, spinning up,
  ending, or moderating an instant voice room is *gedu-initiated*, so a UI gate is not
  enough. An unverified gedu is treated as a non-moderator across all three of that
  feature's surfaces: room create and end 403, and the public join-token endpoint demotes
  them to a guest (no owner power) — same as a parent/gamer. The shared check is
  `isGeduVerified` in `gedu-profiles.service.ts`; the create/end routes opt in via
  `requireRole(..., { requireVerifiedGedu: true })`, the public token route calls it
  directly and fails closed to guest on any lookup error. See
  `../../components/voice/instant/CLAUDE.md`.
- **Surfaces**: an "Unverified" badge on the admin users list; a verify/un-verify card on
  the admin user-detail page.
- **Backfill**: every gedu that existed before this feature was marked verified
  (`verified_by` NULL) — they were all admin-invited and already trusted.

Verification state is read via `useGeduProfiles` / `useGeduVerificationMap` (lists/picker)
and `useGeduProfile` (detail, seeded with a server fetch). `useSetGeduVerified` invalidates
the whole `gedu-profiles` key on success.

## Coverage picker reuse

The register form and the settings/admin coverage editor render the same presentational
`CoveragePicker` (`../../components/gedu/coverage-picker.tsx`) — identical tree + cascade
semantics. The editor wraps it with a Save button (immediate `gedu_locations` mutation);
the register form collects the selection into the atomic `register_gedu` call instead.
