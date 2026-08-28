# Gedu profiles, self-registration, certification, the contract & the record check

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
  certifying admin never silently de-certifies a working gedu), plus the criminal record
  check's own trio in the same shape (`criminal_record_check_passed` / `_at` / `_by`).
  RLS: admin reads all, a gedu reads its own; **no table-level write grant** — writes go
  only through the RPCs below so the audit columns can't be forged.
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

## The criminal record check

Finnish law (504/2002) requires a person working with children to present a
**criminal record extract** — a *rikostaustaote* — and two of its properties
decide the whole design:

- **The educator obtains it themselves**, from the Legal Register Centre. We
  never request it, receive it, or hold it.
- **We may not keep it.** The law permits recording only that an acceptable
  extract was presented, and when.

**Rule: the document is never stored, and there is nowhere to store it.** No
file, no reference number, no issue date, no offence data — the schema is a
boolean plus an audit pair, and that is the entire fact the platform is allowed
to hold. A field that would carry anything out of the extract is not a feature
to add later; it is the thing the statute forbids.

**Rule: the check gates nothing.** Exactly like contract acceptance, a missing
or withdrawn check does not narrow a gedu's access, hide a surface or fail a
call anywhere. Certification stays the platform's only blocking lever over an
educator, for the same reason it is the contract's: independent gates on one
person are how an account ends up in a state nobody can explain. What the check
buys is *visibility* — the admin certification queue reports it so the decision
is better informed, not pre-empted.

**Rule: `set_gedu_criminal_record_check(gedu_id, passed)` is the only way in.**
Admin-only (guard-first `assert_admin()`), refuses a target that is not a gedu,
and stamps the moment and the acting admin server-side; withdrawing the check
nulls both. Granted to `authenticated` alone — an admin calls it with their own
session, and there is no backend caller because nothing server-side can look at
a document. The extension table carries no write grant, so the audit pair cannot
be written by the person it is about.

The stamp is non-null **exactly when** the flag is true, which is why the admin
dashboard's queue ships only the moment: a second field beside it would be
derivable from the first and could only ever contradict it. The acting admin is
audit-only — nothing renders it — and its FK is `ON DELETE SET NULL`, so a
departed admin leaves the check recorded without the name.

## The gedu contract

A gedu is an independent contractor, and the terms they work under
(*Pelikasvattajan sopimusehdot* / *Game Educator Terms*) are read and accepted **on
the platform**. What is stored is the whole of what a lawyer asked for and nothing
else: which version was accepted — in which language — when, and who signed: the
facts that decide a dispute.

**Rule: acceptance gates nothing.** Certification remains the platform's only
blocking lever over an educator, and keeping it the only one is deliberate — two
independent gates on the same person is how an account ends up in a state nobody
can explain. An unsigned educator keeps every permission a signed one has, and is
still certifiable. What acceptance buys is *visibility*: the admin certification
queue reports each candidate's standing so the decision is better informed, not
pre-empted. If a gate is ever wanted, it is a separate decision to make
deliberately, not a consequence to discover.

### Version-keyed, and what "current" means

Acceptance is keyed to a **version**, not to a person. Versions live in a
whitelist table that only migrations write to, each with the moment it was added,
and **the current version is the row with the greatest added-at moment** — a
derivation rather than a stored flag, so there is no second place that can
disagree about which terms are in force. A gedu whose accepted version is not the
current one is re-prompted, and the previous acceptance is left standing: it is
the record of what they agreed to at the time, and a new version does not make it
untrue.

That derivation is also why "accepted an older version" and "never accepted
anything" read identically in the admin queue. The question an admin is deciding
against is standing under the terms in force *today*, and both answers to that
are "not yet".

### One version, two texts, and the version string that carries both

A version of the contract exists in **more than one language, and the languages of
one version are equally binding** — one agreement published twice, not a source
text and a courtesy translation of it. Which text a gedu actually read is
therefore part of the record, so the language is encoded into the version string
itself: `<base>/<language>`, e.g. `2026-2027/fi` and `2026-2027/en`. The whitelist
holds one row per language, both sharing the base label and the added-at moment
that decides which version is current, and an acceptance stores the whole encoded
string.

Encoding it into the existing value rather than adding a column is what keeps
everything downstream unchanged: the acceptance is still one text field and one
foreign key, still the whole of what was signed in one value, and every surface
that displays a signature shows that value **verbatim** rather than reassembling
it from parts.

**What it costs is one rule, and it is the rule to remember: "is this gedu
current" is a question about the base.** Both languages *are* the current version,
so a gedu who signed one of them must never be re-prompted because a second was
published or because they switched the app's language. That comparison is made in
two places and both compare bases: the app's own checks (the contract page, the
settings card, the dashboard's unsigned band, the admin certification card), and
the admin dashboard RPC that reports each certification candidate's standing.
Both halves also answer a double signature the same way: a gedu may have signed
both texts — two signatures on one agreement, where the first is when they
agreed — so the RPC reads the *earliest* of the base-matching acceptances, and
the app's matching helper picks the same row, so every surface names one date.

**Which text is shown follows the reader's locale, and there is no toggle.** A
Finnish app shows the Finnish text; every other locale shows the English one. Two
languages published as equals leave no "original" to offer beside a translation,
and a picker would only invite somebody to sign words they cannot read. What is
recorded is the document that was on screen, encoded from that document rather
than from a constant — so the record cannot claim a text the reader never saw.

One language is designated the **fallback**: the one every version is guaranteed
to have been transcribed into, which a lookup falls back to when the pair asked
for does not exist (a locale whose language has no text of its own, or an older
version transcribed only once). That is Finnish today, because that is the
language a version is drafted in first. It is a guarantee about availability and
nothing more — it does not make that text the binding one, and copy must not say
it does.

The current version the *app* asks for is a base-version constant in the contract
document's own directory (`../../components/gedu/contract/`), alongside the
document registry, the fallback-language constant, and the small helpers that
encode a document's stored version, take the base out of a stored one, and pick a
language from a locale. The version is a property of the document being shown, so
it lives with the documents. The service layer never picks one — it forwards
whatever it is handed and lets the database refuse a version it does not know.

### The write posture: one RPC, no table grant

An acceptance row is an audit record, so **every field a forger would want is
derived server-side**: the signer is the calling session's own user, the moment is
the server's clock, and the name is read from the profile at that instant. The
only caller-supplied value is the version, which is checked against the whitelist
before anything is written. Neither table carries an insert, update or delete
grant for any browser-reachable role — the same arrangement the certification RPC
has one table over, and for the same reason.

Two consequences worth stating plainly:

- **The write is idempotent per encoded version, and the first signature is the
  one that stands.** Accepting a version already accepted returns the original
  moment and writes nothing, including when a duplicate arrives concurrently. A
  reload, a retry or a double-submit is therefore harmless rather than a second
  signature, and no reader ever sees a record silently re-stamped. Signing the
  *other* language of the same version does write a second row, and that is
  correct: it is a second signature on one agreement rather than a re-acceptance,
  and either row alone already made the gedu current.
- **The stored name is a snapshot, never a join.** A profile name is editable by
  its owner, so resolving it at read time would answer "what is this person called
  today" when the question is "who signed this". The snapshot is the identity half
  of the legal record and must not drift.

Reads need no wrapper: row-level security already says who may see an acceptance —
an admin sees anyone's, a gedu sees their own — so a plain select is safe, and a
gedu's acceptances are a bounded set (at most one row per version ever published)
read by primary-key prefix, so it is a near-instant call that wants no loading
affordance beyond a container already at its final size.

### Cache keys

Contract acceptance has a **query-key root of its own**, separate from the
gedu-profiles root that certification uses. The two answer different questions
about the same person and are written by different actors — certification is an
admin's verdict on an educator, acceptance is the educator's own act — so sharing
a root would make every certify refetch signatures and every signature refetch the
certification list, invalidations describing a relationship the data does not have.

The key factory lives outside the hooks file for the same reason the admin
dashboard's and family feed's do: the hooks file is a client module, so a server
component importing from it would get a client reference rather than the object,
and a surface that hydrates this cache entry server-side has to name the very key
the hook reads.

**Three surfaces seed `geduContractKeys.acceptances(geduId)` server-side, and
they do not all answer a failed read the same way.** The contract page and the
admin user-detail page seed it *optionally*: a read that throws answers `null`,
no `initialData` is passed, the browser fetches on mount, and the panel or the
standing line shows nothing until it does — the page around it is worth
rendering without them. The settings page seeds it *mandatorily*: there is no
`null`, a failed read throws and the route errors, which is an owner-ruled
deviation for a low-traffic page that already hard-depends on a server identity
read — and what it buys is a card with exactly two states in code rather than a
third that only a rare error ever renders. That seed also carries the moment it
was read as `initialDataUpdatedAt`, so a payload replayed out of the router
cache is aged rather than stamped fresh for the whole 60-second `staleTime`.

**The admin dashboard's key is deliberately not invalidated by the acceptance
mutation.** That entry only ever exists in an *admin's* browser — a gedu's session
cannot call the dashboard read at all — so an invalidation from a gedu-side write
would be provably dead. The admin's queue picks a new acceptance up on its own
next read. This is the same line the dashboard key's own factory draws: admin
writes invalidate it, writes from any other role reach it through their next read.

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
