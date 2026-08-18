# Gedu profiles, self-registration & certification

Game educators ("gedu") self-register like parents and are **certified by an admin**
before they can be assigned to work. This directory owns the gedu extension table
service + the registration contract; the flow spans a public page, an API route, and
three DB objects.

**The word is "certified", and it is not the same thing as email verification.** These
columns and identifiers were called `verified*` until 00187; the rename freed "verified"
for `profiles.email_verified_at`, which is about an address rather than a person. The two
can be true independently and neither implies the other, so a surface showing both gives
them different marks — a shield for the certified educator, a green check for the
confirmed address — in a fixed order, and never one glyph standing for both.

## Data model

- **`gedu_profiles`** — the 1:1 extension table for gedus (the gedu analogue of
  `customer_profiles`/`gamer_profiles`): `user_id` PK, `certified` (bool, default false),
  `certified_at`, `certified_by` (FK → profiles, `ON DELETE SET NULL` so losing the
  certifying admin never silently de-certifies a working gedu). RLS: admin reads all, a
  gedu reads its own; **no table-level write grant** — writes go only through the RPC
  below so the audit columns can't be forged.
- Other gedu data (name, phone, `spoken_languages`, `locale`) lives on `profiles`;
  coverage lives in `gedu_locations` (see `../locations/`).

## Self-registration (atomic)

Public, unauthenticated `/register-gedu` page → `POST /api/gedu/register`:

1. Resolve the optional Minecraft username (Mojang HTTP) **before** creating the auth
   user, because `createUser` is irreversible and the ordering is what keeps a failure
   cheap. Nothing about the name can refuse the registration — we do not judge what a
   game handle may look like, and even the platform's answer only decides whether an
   account key is stored: a name Mojang doesn't know is kept with a null uuid, and one
   another account already holds is allowed (accounts may be shared).
2. `admin.auth.admin.createUser` (`email_confirm: true` — email confirmation is disabled
   platform-wide). The new-user trigger seeds a `customer`-role profile.
3. `register_gedu` RPC — one transaction: promote `customer`→`gedu`, swap
   `customer_profiles` for a `gedu_profiles` row (uncertified), write profile fields,
   coverage, and Minecraft account.
4. On RPC failure, delete the auth user (rollback) — no half-promoted debris. The only
   gap is process death between steps 2 and 3 (gotrue is HTTP, not SQL).
5. Send the welcome mail, carrying a verification link. **Its failure is swallowed** —
   the account is what the educator asked for and it already exists, and a fresh
   verification link is one button away in settings. The token is bound to the address
   *gotrue stored*, not the one that was typed, because gotrue normalises on the way in
   and a token minted against the typed string would never verify.

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

## Certification

A new gedu starts **uncertified but with broad platform access** — certification gates two
things: **group assignment** and **instant-voice-room moderation**. Everything else is
open to an uncertified gedu.

- **`set_gedu_certified(gedu_id, certified)` RPC** — admin-only (guard-first `assert_admin()`),
  stamps `certified_at = now()` / `certified_by = auth.uid()` server-side. Granted to
  `authenticated`; called from the admin user-detail page via the admin's own session.
- **Assignment gate (UI-only, sufficient)**: the gedu picker disables uncertified gedus and
  badges them. **This is a UI-only gate by design.** Assignment runs
  through `apply_group_changes`, which does *not* re-check `certified`; the invariant holds
  because admins are always trusted and assignment is an admin-only action driven entirely
  by this picker. If a non-admin assignment path is ever added, move the `certified` check
  into `apply_group_changes` — until then a DB-level check would be redundant.
- **Instant-voice-room gate (server-side, required)**: unlike assignment, spinning up,
  ending, or moderating an instant voice room is *gedu-initiated*, so a UI gate is not
  enough. An uncertified gedu is treated as a non-moderator across all three of that
  feature's surfaces: room create and end 403, and the public join-token endpoint demotes
  them to a guest (no owner power) — same as a parent/gamer. The shared check is
  `isGeduCertified` in `gedu-profiles.service.ts`; the create/end routes opt in via
  `requireRole(..., { requireCertifiedGedu: true })`, the public token route calls it
  directly and fails closed to guest on any lookup error. See
  `../../components/voice/instant/CLAUDE.md`.
- **Surfaces**: a positive-only certification mark on the admin users list — a shield on a
  gedu who is certified, and nothing at all otherwise, so an uncertified educator is
  simply unmarked rather than badged; a certify/de-certify card on the admin user-detail
  page.
- **Backfill**: every gedu that existed before this feature was marked certified
  (`certified_by` NULL) — they were all admin-invited and already trusted.

Certification state is read via `useGeduProfiles` / `useGeduCertificationMap`
(lists/picker) and `useGeduProfile` (detail, seeded with a server fetch).
`useSetGeduCertified` invalidates the whole `gedu-profiles` key on success.

## Coverage field reuse

The register form and the settings/admin coverage editor render the same coverage field
(`../../components/gedu/`) — a fixed-height box of claim chips plus the shared location
picker, with identical positive-selection semantics (one tick is one independent "I cover
this subtree" claim; ticking a parent never touches its descendants). The editor wraps it
with a Save button (immediate `gedu_locations` mutation); the register form collects the
selection into the atomic `register_gedu` call instead.

Both hold ticks as `locations` row ids, because the picker browses that table and a
ticked node is already a row. Nothing is resolved at commit, and there is no claim the
field can display but cannot store — which is why the register form can collect coverage
before an account exists at all (the table is anon-readable reference data).
