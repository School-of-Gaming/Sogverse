# Gedu session-report photos

**Status: decided, ready to build.** Owner-interviewed 2026-08-30; challenge-reviewed the
same day, verdict "build with these cuts" — the cuts are folded in below and the rejected
ones recorded. Every decision labelled *(owner)* was made explicitly in the interview and
is not up for relitigation.

## Problem

Session reports are text-only. Gedus want to put pictures in a report — mostly in-game
screenshots, sometimes a photo of something a gamer made — and the report is the main
thing a family gets back between payments. Many parents read the report **only in the
email**, so photos have to appear inline there, not behind a login.

This is also the first upload surface owned by a non-admin role. Admin product images
were predictable (trusted uploader, known formats); gedu uploads are not — a
good-faith gedu will hand over an 8 MB 4K screenshot or an iPhone HEIC. The feature
therefore has to *manufacture* the predictability the admin trust boundary used to
provide: everything stored is normalized on the way in, and the bucket can only ever
contain conforming images.

## Scale

Every gedu, every session. A weekly club is ~52 sessions/year/group; at the 5-photo cap
and ~200–400 KB per normalized image, storage grows a few GB/year at worst — napkin
arithmetic, no monitoring needed.

Delivery *(the half the owner actually raised)*: in-app thumbnails go through the Next
image optimizer (decided below), so a feed card costs a handful of small variant
fetches, not 5 × 300 KB masters. The email fetches masters full-size — worst case
~1.5 MB of images per mail open, paid by Supabase egress once per proxy cache
(Gmail/Outlook cache aggressively), which is acceptable at our audience size.

## The decision

### Data model

- **New table `group_session_images`**: `id uuid PK default gen_random_uuid()`,
  `session_id` → `group_sessions(id) ON DELETE CASCADE`, `width int`, `height int`
  (CHECK: positive, ≤ a sanity ceiling of 4096 — deliberately looser than the client's
  ~2048 edge cap; the CHECK is a sanity bound, not a derived value, and the two do not
  share a source), `created_by uuid`, `created_at timestamptz`. Display order is
  `(created_at, id)` — stamp with `clock_timestamp()` per the supabase rules, since
  the insert runs while holding the session-row lock, and the id breaks a sub-tick
  tie. RLS enabled, **zero policies, no grants to `authenticated`** — the same
  posture as `group_sessions` itself (`service_role` grant plus SECURITY DEFINER
  RPCs), which the access-control sweep already accepts.
  - There is **no `path` column**: the object name is derived from the id
    (`<id>.jpg`) by one URL/name helper beside the existing product-image URL helper
    in `src/lib/images/` (an existing module, not a new one). A stored path would be a
    restatement of the primary key. Feed documents carry `{id, width, height}` — the
    id is needed anyway for React keys and the delete affordance.
  - `created_by` is **audit-only, for safeguarding**: these are photos concerning
    children, and "who uploaded this" must be answerable. It gates nothing (deletion
    rights are role-based, below) and appears on no feed — mirror the session row's
    `report_emailed_by` in every respect, including its reference target and its
    behaviour on account deletion.
- **New storage bucket `session-images`, `public: true`**, created by migration exactly
  as the product-images bucket was (`INSERT INTO storage.buckets … ON CONFLICT DO
  NOTHING`). **No public-read `storage.objects` policy** — the repo's own precedent is
  migration `00028_drop_product_images_public_read_policy.sql`: the public CDN endpoint
  bypasses RLS, so the policy only enabled `.list()` enumeration, which is precisely
  what must stay impossible here (see Security model). No bucket-level size/mime limits
  (this repo enforces those in app code). Remember: buckets and storage policies never
  appear in `schema.sql` — the documented exception.
- **The object is named by the row's random UUID**, not by a content hash. The
  unguessable name *is* the security mechanism, and per-upload identity (not
  per-content) means deleting one report's photo can never collide with another report
  that attached identical bytes. Dedup is a non-goal here.
- **The normalized image is the master — no original is stored.** *(owner)* Nobody
  needs a 12 MP original of a session photo, and storing fewer pixels of children is a
  safeguarding feature, not a compromise.

### Security model — "unlisted", not private

*(owner)* Photos are served from the public bucket, and the **same URL** feeds the app
and the email. Possession of the URL is the credential: ~122 random bits, never linked
from any crawlable page, no enumeration path. Scrapers find content by following links
and guessing predictable paths, not by brute-forcing UUIDs. The residual exposure
equals the email's own: whoever a parent forwards the mail to sees the photos — which
is coherent, because the report text is in the same mail.

- **Deleting the photo deletes the object, and that is the kill switch** for every
  emailed copy of the URL. (Gmail/Outlook proxy-cache images, so revocation is not
  instant for already-opened mail — accepted, and nobody promises "deleted means gone
  from inboxes". The in-app optimizer may likewise serve a deleted photo's cached
  variants up to its TTL, but nothing renders them once the row is gone.)
- Consent context *(owner)*: photos are mostly in-game screenshots; where a child
  appears, parental consent already exists as a precondition of the programme.

### Retention & lifecycle *(owner)*

**A photo lives as long as its report does.** No timer, no reaper, no cron (the
project's zero-scheduled-jobs stance holds). A photo dies in exactly two ways:

1. A gedu/admin removes it → the row goes via RPC, then the route deletes the object
   through the **Storage API** (never SQL — a SQL delete of `storage.objects` orphans
   the file; this is a verified Supabase behaviour).
2. The session row is deleted (group/product teardown) → rows CASCADE, and the objects
   are orphaned. Accepted: this path is rare and admin-driven; reconciliation is a join
   of derived object names against `storage.objects.name`, same as the product
   catalogue's. Do not build machinery for it.

### Who can do what *(owner)*

- **Upload / remove: any gedu assigned to the group, and admins** — matching how the
  report itself is edited (the last-editor model). No per-photo ownership.
- Guard shape: the same as every session write — SECURITY DEFINER RPC, guard-first
  (`assert_role`, then `is_admin() OR gedu_teaches_group(p_group_id)`), classified
  role-gated in the DB authorization spine.
- The admin product page reuses the gedu session components (a standing rule), so the
  UI comes free — but per the group-workspace rule each shell binds its own
  mutations, so the admin container binds product-keyed photo mutations of its own
  (refreshing the product document) just as it does for saves. The read side really
  is free: the admin surface consumes the same gedu feed document.

### The cap *(owner)*

**5 photos per report at launch, held in ONE named constant** in the contracts module
— the single point of control; raising it is a one-line change. The UI is a wrapping
grid that holds any count. Enforcement: the insert RPC takes the cap as a parameter
(passed from the constant by the route) and refuses beyond it while holding a lock on
the session row, so concurrent tabs cannot overshoot; SQL itself holds only a hard
sanity ceiling (e.g. 24) so a buggy caller cannot pass something absurd.

### Ingestion pipeline — normalize at the edge of trust

**Client-side normalization is the workhorse of the whole feature** (a new browser
module under the existing `src/lib/images/`): decode (`createImageBitmap` with
`imageOrientation: "from-image"`), downscale to a capped longest edge (~2048 px),
re-encode to **JPEG** q≈0.8 via canvas. One pass solves everything at once:

- the 4K screenshot becomes a few hundred KB;
- any input format becomes JPEG;
- **EXIF/GPS is stripped for free** — canvas re-encode drops metadata, and stripping
  is safeguarding, not tidiness (a phone photo of a session carries coordinates and a
  capture time; a report about a child is the last place to forward them);
- the upload fits far under the ~4.5 MB Vercel function-body limit, so **no
  direct-to-storage upload is needed**;
- every image is re-encoded, even ones already small — uniformity is the point, and
  it is what guarantees the EXIF strip.

**Why JPEG and not WebP:** Outlook's desktop client (Word rendering engine) does not
render WebP, and the email is a primary reading surface. One format, one object,
renders everywhere.

**HEIC:** iPhones hand over HEIC, which browsers cannot decode — but **iOS Safari
transcodes HEIC→JPEG automatically** when a photo-library pick goes through a file
input whose `accept` list names only web formats. So the input is
`accept="image/jpeg,image/png,image/webp"`, the mainline iPhone path works with zero
code, and raw HEIC (Files-app picks, macOS drag-drop) is refused by server
verification with copy the gedu can act on ("convert to JPEG and try again"). No
decode shim in v1. *(owner: "clean solution" confirmed)*

**Server-side verification is the guarantee — the route verifies, it never rescues:**
magic-bytes sniff (JPEG SOI) and a generous byte cap (e.g. 3 MB — normalized output
should be well under 1 MB). Anything non-conforming is refused with a stable error
code the UI translates. The client-claimed width/height are **trusted after a
plausibility check against the DB's sanity CHECK** — the uploader is an assigned
staff member, the dimensions feed only layout arithmetic, and the worst a lie or a
client bug produces is a mis-sized box in that group's own mail (see Rejected
alternatives for the byte-level parser this replaces). This is
correctness-by-mechanism applied to a bucket: the route is the only writer and it
enforces the invariant, so the bucket cannot contain a non-JPEG or oversized object.

### Upload flow (the write path)

`POST /api/gedu/sessions/images` (multipart carrying the group id, the session date,
the claimed dimensions and the file — sessions are addressed `(group_id,
session_date)` on every existing write path, and this one is no different; the
form-data reading follows the product-image upload route's shape, and the registry
entry expresses its body-taking the same way that route's does). Posture
`role-gated`, roles `["gedu","admin"]`; the registry entry gets **its own written
reason**, not a copy of the email-report route's: the real authorization boundary is
the RPC's assignment guard, and the route-level role gate is the coarse filter in
front of it.

1. Verify the bytes (above). Client-side failures (a corrupt file the decoder
   refuses, a canvas encode failure) surface through the **same translated error-code
   union** as the server refusals — one vocabulary of refusals, wherever they arise.
2. Call the insert RPC on the **user's own client** — the guard is the authorization,
   exactly like `set_group_session_notes`; it takes `(p_group_id, p_session_date,
   …)`, ensures the session row exists (`ensure_group_session` shape), locks it,
   counts, inserts, returns the id.
3. Upload the object with the **admin client** (`contentType: image/jpeg`, immutable
   cache-control, `upsert: false`).
4. If the object upload fails, delete the row via the delete RPC (compensation) and
   return the error. A row whose object never landed must not survive — note this
   deliberately **inverts** the product-images order (object first, orphan tolerated):
   there the object is content-addressed and an orphan is harmless; here an
   object-less row is a broken image in the feed and in every mail sent afterwards.
   If the compensation itself also fails, log loudly and stop: the surviving row
   renders as a broken thumbnail on the staff card, and the ordinary remove control
   is its repair — no further machinery.

Photos attach to **record-editor sessions only (past and live)** — they document what
happened, so the future-session plan editor gets no photo strip. *(Default chosen by
the author; flagged to the owner — wanting future-session photos is a scope change.)*

Multi-select is allowed on the file input; the client trims a selection to the
remaining slots below the cap *before* uploading anything, so a too-large batch is
one visible trim, not a run of server refusals. Upload progress is an indeterminate
pending state over the local-blob thumbnail — a real percentage would require XHR and
buys nothing at these file sizes.

`DELETE /api/gedu/sessions/images/[id]`: delete RPC on the user client (same guard,
resolves the group via the session row), then the route deletes the object with the
admin client via the Storage API. If the object delete fails, log it — the row is
gone, the URL is dead to the app, the emailed image 404s, and the orphan join above
covers the bytes.

Both routes get posture-registry entries; both RPCs get authorization-spine
classification and DB tests (guard refusal for an unassigned gedu, cap refusal,
delete-by-other-assigned-gedu allowed).

### Reads — and the release-compatibility constraint

Both feed documents grow a per-session `images: [{id, width, height}]` array, ordered
by `created_at`.

**The family feed RPC cannot simply be widened.** Its contracts schema is `.strict()`
on every nested object — deliberately — so the still-deployed old app would *fail to
parse* a widened result during the deploy window, which is exactly the breakage the
"Landing in stages" rule says needs a compatibility step. The step is
**expand-contract on the RPC**: the migration adds a *new* RPC (a versioned name)
returning the widened document, the new app calls it, and the old RPC stays in place
untouched through the window; a follow-up cleanup migration **drops the old RPC and
nothing more** — the versioned name stays permanently, because renaming it back to
the canonical name would need a deploy window of its own, which is the exact cost
this step exists to avoid. One release, no staging, and the old app never sees a
shape it cannot parse. The gedu feed contracts are not strict, so that half widens in
place — and the admin group surface reads the same gedu feed document, so there is no
third document to widen.

Both extended RPC schemas get DB-test parse coverage (the standing rule for RPC-result
schemas). Public URLs are derived from the id by the one helper.

**In-app images go through the Next image optimizer — decided, not optional.** The
capped ~2048 px JPEG master is exactly the input that makes optimizer encodes cheap,
and serving 300 KB masters into 200 px thumbnails five-per-card over an unpaged feed
is the real delivery cost the owner asked about. This requires a second
`images.remotePatterns` entry in `next.config.ts` for the new bucket path (the
existing one is scoped to `product-images/**`) — it is in the steps.

### Gedu editor UI *(owner-shaped)*

Two pieces, not one: the shared **gallery** renders a session's photos in the card's
read state (both feeds, editor open or closed — photos are content, like the report);
the **manage strip** (add/remove) appears with the record editor. The strip is a
**self-managing block on the session card, visually distinct from
the draft/Save scope** — the card's text fields and attendance marks stay
draft-until-Save; photos deliberately do not, and the UI must make that legible
*without text instructions*, by idiom: it is an attachment strip. Pick → thumbnail
appears immediately from the local blob with an upload progress state → settles;
remove is a per-thumbnail control that acts instantly. The add affordance disappears
at the cap (a slot that can never fill is dead space — the layout rule's own
corollary). Uploads follow the committing-button rule (disabled through the whole
operation). The block's empty state carries inviting copy ("Add a photo from the
session") — that is the whole of the *(owner)* "encourage at least one photo"
requirement: an invitation, never a gate, never a nag.

Consequence, accepted *(owner)*: a photo attaches the moment it uploads, so a family
could briefly see photos before the write-up text is saved. Photos do **not** count
toward the owed/complete derivation *(owner)* — a session with photos and no write-up
still owes its report, and the dual TS+SQL derivation is untouched by this feature.

**Attribution-chip interaction:** a signed card reserves bottom padding for the chip
(a session-feed rule), and the chip hangs into the card's bottom-right. The gallery
and the photo strip land *above* that reserved zone; if the strip becomes the card's
last block, the padding derivation is revisited in the same change, per the rule.

### Family rendering *(owner-shaped)*

Photos arrive as mixed ratios — 16:9 screenshots mostly, but 1:1 and portrait happen;
no extreme ratios need designing for. The gallery must show them **uncropped**, in a
layout that works at both the family mobile-first breakpoint and desktop:

- **A wrapping row of fixed-height thumbnails with natural (aspect-derived) widths**,
  rendered by a shared gallery component in `src/components/session-feed/` (both
  renderers use it; family code cannot import gedu code, so shared is the only home).
  All geometry is **arithmetic from the stored dimensions** — never measured — so
  server HTML and first client paint agree and nothing reflows as images decode.
  **A past session with photos and no write-up renders as a card** — the family feed's
  quiet-line shape is for sessions with nothing to show, and photos are something to
  show; the attribution chip keeps its own unchanged rule (write-up required).
  The gallery takes a resolved `src` (or the new name helper carries the same
  leading-slash passthrough the product-image helper has) so preview-scene fixtures
  can point at local assets; mixed-ratio preview art gets committed for the scenes
  and the style-guide section.
- **Tap/click opens a fullscreen viewer** — built on the existing `Dialog` primitive
  (the repo's only full-viewport overlay: it already owns the overlay, stacking and
  Escape): dark ground, image contained, close on tap-out/Escape. **No prev/next** —
  at a cap of five, every thumbnail is visible in one row and close-and-tap-the-next
  is the same number of gestures. The viewer is an overlay, so its demo home is the
  admin style guide; the gallery is reused by two surfaces, so it earns a style-guide
  section too (one section, states side by side).

### Email *(owner-shaped)*

The report email gains a photos section below the report markdown, built from the
template system's existing block style:

- **All photos appear** — the email *is* the report for many parents.
- **Every image's rendered box is derived from the stored dimensions under a HEIGHT
  budget, not from the column width.** A full-column-width portrait photo would
  reserve ~750 px of placeholder when blocked — the exact failure the owner's
  requirement forbids. Cap the rendered height (the same fixed-height idiom the app
  gallery uses) and derive the width from it.
- Layout: photos in 50/50 paired cells (the template system's fixed-table idiom, as
  the button rows already use), with **a width media query in the shared layout
  `<style>` block stacking them full-width on mobile** — the owner asked for
  stacked-on-mobile explicitly, the shared style block is demonstrably honoured by
  Gmail (existing rules in it work today), and where a client strips it the mail
  degrades to the 50/50 pairs, which remain acceptable. The exact arrangement within
  this shape is implementer latitude — the owner asked for "a pretty layout" that
  makes the most of desktop space.
- **Explicit width/height attributes from the stored dimensions, a background tone
  from the email palette, and `alt=""`** so a blocked, deleted, or slow image leaves
  the layout intact — the mail must look good and work with no images loading at all
  *(owner, verbatim requirement)*. The placeholder tone must satisfy the email
  house-style test (palette membership, backgrounds declared twice).
- **The email is a snapshot** *(owner)*: photos added after the send do not retrigger
  anything; a photo removed after the send simply stops loading in old mail
  (gracefully, per the previous point). No edit-image operation exists in v1, so
  "replace" is remove+add and follows those two rules.
- The send route already reads the session with the admin client at send time; it now
  also reads the images and passes them to the template. The staff copy carries the
  photos exactly as the family copy does — it is the same mail behind a banner.
- `src/lib/email-templates/CLAUDE.md` currently states the layout is the only file
  emitting an `<img>`, and reasons from images being decorative. A mail whose content
  is partly images is a new case — **the doc is updated in the same change**, like
  code.

### Copy & i18n

All new strings (photo block labels, error copy for the refusal codes, email section)
translated in all five locales; `tlh` gets its fun take; no emoji in messages; error
slots typed as key unions resolved with `t()` at the render site — never a rendered
`err.message` (the standing localization defect class; do not add to it).

## Rejected alternatives

- **Private bucket + signed URLs.** An email client fetches images with a bare GET —
  no cookies, no place to type a code — so the URL must work unauthenticated. A
  long-expiry signed URL is exactly as public as an unguessable public URL, plus an
  expiry clock that breaks old emails, minus nothing that matters.
- **A tokenized serving route** (`/api/report-images/{token}`) — buys revocation
  without deletion, logging, noindex headers. Judged over-engineering for v1 *(owner:
  "is a link with a unique ID not enough?" — it is)*: deleting the object is a real
  kill switch, nothing crawlable links these URLs, and the route can be retrofitted
  later (it just cannot rescue URLs already emailed — true of every design).
- **Content-addressed (sha256) object names**, the catalogue's pattern — deterministic
  and computable by anyone holding the bytes, and dedup ties one report's delete to
  another report's identical upload. Random per-upload UUIDs are the right identity
  here.
- **A `jsonb` photo array on `group_sessions` instead of a child table** — genuinely
  smaller (no table, no RLS entry, cap check is one guarded UPDATE), and it was
  seriously considered in review. The table wins on being the idiomatic shape here:
  per-field CHECKs instead of one jsonb shape constraint, no hand-written `Json`
  schema, and plain SQL instead of fiddly jsonb manipulation. Close to a wash;
  recorded so it is not re-derived as a discovery.
- **A stored `path` column** (the catalogue has one) — there it holds the sha256, a
  genuinely different value from the key; here it would restate the primary key.
  Derived by helper instead.
- **A JPEG SOF dimension parser verifying client-claimed width/height** — cut in
  review. It defended a cosmetic outcome (a mis-sized box) against an already-assigned
  staff member, with ~30 lines of hand-rolled binary parsing and no precedent in the
  repo (product images validate by extension alone). The magic-bytes sniff, byte cap
  and DB sanity CHECK stay; they are what make the bucket-invariant claim true.
- **Storing originals alongside renditions** (the product-catalogue shape) — nobody
  will ever want the original of a session photo, and keeping fewer pixels of children
  is a feature. The normalized image is the master.
- **WebP output** — Outlook desktop cannot render it, and email is a primary surface.
- **A HEIC decode shim in v1** — iOS's automatic transcode covers the mainline path
  free; ship the refusal for the rare raw-HEIC side doors and add a shim only if that
  refusal proves common.
- **Server-side re-encode (sharp)** — verification is cheaper than rescue, the failure
  mode (an immediate, actionable refusal at upload time, only when the client module
  malfunctioned) is acceptable, and sharp's Vercel prebuilds lack HEIC decode anyway,
  so a server transcode path could not cover the one format that matters.
- **Photos satisfying the "report written" check** — a wordless report could then be
  sent; the owed derivation exists twice (TS + SQL) and stays untouched. *(owner)*
- **Captions** — cut from v1. *(owner)*
- **Lightbox prev/next** — redundant at a five-photo cap with all thumbnails visible;
  cut in review.
- **Stage-photos-until-Save** — a failed save or closed tab loses a phone upload, and
  staging needs its own orphan cleanup. Immediate attach with an unmistakable
  attachment idiom instead. *(owner)*
- **Locking photos after the report email is sent** — blocks fixing a wrong upload;
  the snapshot semantics above are the answer. *(owner)*
- **A pg_cron cleanup job** — the project has zero scheduled jobs on purpose, and the
  chosen lifecycle (row-tied, route-deleted) needs none.

## Constraints discovered while deciding

- Vercel function bodies cap at ~4.5 MB — normalization makes uploads fit; no
  direct-to-storage machinery needed.
- iOS Safari auto-transcodes HEIC→JPEG for photo-library picks when `accept` excludes
  HEIC; raw HEIC still arrives via Files-app picks and macOS drag-drop.
- Outlook desktop (Word engine) renders no WebP.
- Email image fetches are bare GETs; Gmail/Outlook proxy-fetch and cache, which blinds
  access logs and delays revocation for opened mail.
- Deleting `storage.objects` rows in SQL orphans the backing files — object deletion
  must go through the Storage API.
- `storage.buckets` rows and `storage.objects` policies never appear in `schema.sql`.
- `group_sessions` grants nothing to `authenticated`; all session writes are SECURITY
  DEFINER RPCs guarded by `assert_role` + `gedu_teaches_group`. The photos table
  follows that posture.
- **The family-feed contracts schema is deliberately `.strict()` at every level**, so
  widening its RPC's output in place breaks the still-deployed app during the deploy
  window — hence the expand-contract RPC step above. The gedu contracts are tolerant.
- The Next image optimizer's `remotePatterns` is scoped per bucket path, and its long
  `minimumCacheTTL` means a deleted image's variants can outlive the object — harmless
  in-app (nothing renders them), but the reason the "URL 404s" acceptance criterion is
  stated against the raw bucket URL.
- The email template system's shared `<style>` block is honoured by Gmail (existing
  rules in it demonstrably work); a width media query there degrades gracefully where
  stripped.
- The report email is claimed server-side before sending (`report_emailed_at` on the
  session row); at most one send exists. Photos ride that existing machinery
  unchanged.

## Steps

1. **Migration**: bucket insert; `group_session_images` table (CHECKs, RLS enabled,
   `service_role` grant only); insert RPC (guard-first, session lock, cap parameter
   with SQL sanity ceiling) and delete RPC (guard-first); the **new versioned
   family-feed RPC** returning the widened document (old RPC untouched); grants per
   role; push, regenerate types, add aliases in `src/types/index.ts`.
2. **Contracts** (beside the gedu-sessions service): the cap constant, accept list,
   max-bytes, edge cap; zod schemas for route bodies/responses and RPC results; the
   widened family-feed schema (new RPC) and the widened gedu-feed schema (in place).
3. **Client normalization module** (new file under `src/lib/images/`): decode/orient/
   downscale/re-encode, plus the id→URL/object-name helper; pure parts unit-tested.
4. **Routes**: `POST /api/gedu/sessions/images`, `DELETE
   /api/gedu/sessions/images/[id]`, with verification, the RPC-then-storage sequence,
   compensation, stable error codes; posture-registry entries with their own written
   reasons.
5. **Service + queries**: service methods, React Query hooks; the photo mutations
   invalidate the **gedu feed keys** (and the admin container binds its product-keyed
   equivalents) — the family feed lives in *other users'* caches, so there is nothing
   of it to invalidate from the uploader's session; point the family feed service at
   the new RPC.
6. **Shared UI**: gallery (arithmetic thumbnail row) + Dialog-based fullscreen viewer
   in `src/components/session-feed/`; style-guide demo section.
7. **Gedu editor**: the photo block on the session card (attach-on-pick idiom, cap
   handling, committing states), wired to the mutations; attribution-chip padding
   interaction checked.
8. **Family feed**: render the gallery under the report; viewer interaction; verify
   at 360 px and desktop. **Add photo fixtures to the three existing preview scenes**
   (family product page — parent, — gamer, and the gedu product page): the scenes must
   keep mocking the whole page as the role meets it, and they are where mixed-ratio
   rendering is actually judged.
9. **Email**: photos section in the session-report template (height-budgeted boxes,
   50/50 pairs, mobile stacking via the shared style block); send route reads images;
   update `src/lib/email-templates/CLAUDE.md`; keep the house-style test green;
   verify the no-images and blocked-images degradation.
10. **Config**: second `images.remotePatterns` entry for the new bucket path.
11. **i18n**: all keys × 5 locales.
12. **Tests**: DB tests (RPC guards, cap, delete, spine classification, RPC-schema
    parses for both widened documents), integration tests (both routes in the registry
    with named tests), unit tests (normalization pure parts, name/URL helper). Push
    the branch for DB tests — CI only.
13. **Docs/TODO**: remove the `TODO.md` "Gedu session-report photos" section (this
    plan supersedes it — note it asserted content-addressed masters, a derived feed
    rendition and direct-to-storage upload, all three rejected here with reasons) and
    fix the neighbouring renditions item's "next item" cross-reference; schedule the
    follow-up cleanup migration that drops the old family-feed RPC after release.

One branch, one merge, one release. The expand-contract RPC is what makes the
migration genuinely additive for the still-deployed app; nothing else forces staging.

## Acceptance criteria

- An iPhone photo-library pick uploads successfully (arrives as JPEG via iOS
  transcode), lands normalized (≤ edge cap, JPEG, no EXIF/GPS — verify by downloading
  the stored object), and appears on both feeds and in the next report email.
- A raw `.heic` file (Files-app style) is refused with actionable, translated copy.
- A 5th photo hides the add affordance; a concurrent-tab race cannot exceed the cap.
- An unassigned gedu's upload/delete is refused by the RPC guard (DB test).
- Removing a photo makes its **raw bucket URL** 404 (object gone), and an already-sent
  email still lays out correctly with that image missing.
- The report email renders well with all images blocked (height-budgeted boxes
  reserved, layout intact) — checked in at least Gmail and Outlook desktop, including
  a portrait photo.
- The family gallery shows mixed ratios uncropped at 360 px and desktop; the viewer
  works with touch and keyboard; nothing reflows as images decode.
- The three preview scenes render sessions with photos (mixed ratios) without layout
  faults.
- Deploy-window compatibility holds structurally: the old family-feed RPC and its
  strict schema are untouched by this change, and the existing DB parse test for
  that schema keeps running (and passing) until the cleanup migration retires both.
  No simulated-window harness is built — leaving the old pair alone *is* the
  guarantee.
- Owed/complete derivation unchanged: photos-only sessions still count as owing a
  report (existing DB tests still pass untouched).
- Lint, type-check, unit+integration suites green locally; DB tests green in CI;
  posture-registry and authorization-spine completeness checks pass.

## Deviations recorded during implementation

- **There was a third document to widen after all.** `get_admin_product_sessions`
  composes its own session objects yet parses through the shared gedu session schema, so
  requiring `images` there broke the admin group page. Migration 00223 widened it in
  place — its reader is tolerant, so no versioned name was needed (reasoned in the
  migration header).
- **Raw HEIC is refused client-side, not by the server sniff.** `createImageBitmap`
  cannot decode it, so the refusal surfaces as the decode-failure code with the
  actionable "convert to JPEG" copy; the server magic-byte check stands behind it as
  defense-in-depth rather than the mainline HEIC path.
- **The photo strip is withheld from pre-epoch `no_record` rows** — a strip would crowd
  a deliberately quiet row and mutate it into a card mid-edit on first upload; writing a
  line first makes it an ordinary past entry with the strip.
- **Photos are staged until Save — *(owner, reversing the plan)*.** "Stage-photos-until-
  Save" under *Rejected alternatives* is overruled, and with it the "Gedu editor UI"
  section's attach-on-pick idiom and the accepted consequence that a family could briefly
  see photos before the write-up. The owner's words: *"Why not have the entire edit in
  memory. We only touch the backend on save."* So a picked or dropped file is normalized
  immediately — every client-side refusal still surfaces at pick time, because learning at
  Save that a file was never usable is the worst moment to be told — and then held as a
  local blob drawn at its final box size; the ✕ on a stored photo crosses it out without
  deleting anything; the ✕ on a staged one drops it and revokes its object URL. The card's
  Save runs deletions, then uploads, then the existing notes-and-marks save. Deletions
  first so a swap at the cap is not refused by the insert's own count; photos before the
  written record so the last thing to run is the save whose partial-failure classification
  the editor's two error lines describe. Each operation leaves the staged set as it lands,
  so a refusal keeps the editor open on exactly what is left and a second Save retries only
  that, printing the refusal in the photo block's own translated vocabulary. The staged
  state lives in the feed rather than in the strip, because only what awaits the save knows
  which half of it survived. Discard follows the text draft exactly: closing the editor
  throws the staged photos away, bytes included. Families now see a photo only once the
  card has been saved. The attach-on-pick machinery — pending tiles, per-tile busy states,
  the landed-handover filter and the ghost-tile fix — went with it.
- **The strip greys with the rest of the editor while it commits — *(owner, reversing an
  earlier deviation)*.** The previous entry here said the opposite: the strip stayed
  enabled during a save, as the strongest wordless statement that photos were not draft
  scope. They are draft scope now, so the block locks with the register and the two written
  fields; a block still taking files while the write it belongs to is in flight would be
  inviting work that Save cannot carry.
- **`/admin/testing` gained a photo-count select** — the Gmail/Outlook blocked-images
  acceptance check needs a sendable variant, and the testing directory's standing rule
  is that a variant nobody can send themselves is a variant nobody checks.
- **The insert RPC returns a bare uuid** (the id is the only thing the caller lacks);
  cap-reached got its own SQLSTATE `P0023`; delete refusals are oracle-free.
- **The viewer pages after all — *(owner, reversing the plan)*.** "No prev/next" and
  "Lightbox prev/next" under *Rejected alternatives* are both overruled: the overlay is
  handed the whole set plus a position and cycles with two side arrows and the
  left/right arrow keys. **The ends wrap**, so neither control is ever present-and-dead,
  and the arrows are hidden outright for a set of one. The controls stop their click, so
  the close-on-any-tap behaviour the plan describes survives beside them.
- **The viewer is near-fullscreen — *(owner, reversing the plan)*.** The `wide` dialog
  size only grew the picture a little; the primitive gained a `fullscreen` size (no width
  cap, full wrapper height) and the overlay paints a dark ground and contains the picture
  in nearly the whole viewport. Extending the primitive rather than forking it is what
  keeps the plan's "one overlay, one Escape register" reasoning intact.
- **Gallery rows are centred *(owner)*** — one class on the shared row, so family, gedu
  and admin move together. Boxes and wrap points are unchanged; only the last line's
  slack moves.
- **The photo strip is a drop target *(owner)***, mirroring the admin image picker's
  idiom (dragover tint, `dataTransfer` files, accept-list filtering). A dropped file
  joins the *picker's* pipeline unchanged; the drop path owns only what a file dialog
  gives for free — filtering by the accept list, and saying out loud what the hidden Add
  button says by absence at the cap. A standing one-line hint is the only visible copy,
  since drag-and-drop otherwise leaves no trace on the page.
- **A refused removal is surfaced and retryable.** The delete route leaves the row intact
  and answers `removeFailed` when the object delete fails; under the staged shape above
  that means the crossing-out stays staged, the editor stays open, and the code prints
  through the same total error map — which is what forced the new copy in all five locales.
  The tile is *not* restored: the strip draws the edit as the gedu left it, exactly as a
  refused write-up save leaves the typed text on screen.

- **A mail never carries an `<img>` that will predictably fail** *(owner)*: a send
  composed against a loopback origin omits the photos section entirely (brand-mark
  parity — compose-time omission is the graceful fallback), and `/admin/testing`
  gained an in-browser preview iframe rendering the same template client-side, where
  localhost art resolves — that is the surface for judging the photo layout locally.
- **The expand-contract family-feed RPC was unwound** *(owner)*: the canonical RPC is
  widened in place and the versioned twin dropped — a strict schema briefly failing
  to parse inside the sub-minute deploy window is accepted (the severity paragraph in
  docs/plans/CLAUDE.md's "Landing in stages" records the general ruling).
- **A failed photo delete is visible and retryable** *(owner)*: the DELETE path is
  object-first behind a check-only guard RPC, so a storage failure leaves the row —
  and the tile — in place with translated copy, and remove works again.

## Follow-ups (live and die with this plan; owner names any keepers at completion)

- The cleanup migration dropping the old family-feed RPC — the one follow-up that is
  part of finishing, not optional. It cannot ride the same release (the window needs
  the old RPC live), so it lands in the next routine release; if none is imminent
  when the plan is deleted, this is the follow-up proposed to the owner for
  `TODO.md` by name.
- Captions per photo.
- A replace operation with URL indirection so old emails track edits.
- Adopting the normalization module for admin product images (the TODO's rendition
  item — it stays its own piece of work; this plan decides the pipeline shape it
  inherits).
- A HEIC decode shim, if raw-HEIC refusals prove common.
- Photo reordering.
- A tokenized serving route (revocation without deletion, logging).
- Gamer-facing upload surfaces (voice chat) — a different trust tier, its own feature.
