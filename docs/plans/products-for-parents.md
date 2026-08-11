# Products for parents

## Problem

Every product (club, camp, event) is structurally gamer-only: a parent buys a seat and
must pick one of their linked child accounts to fill it. There is no way to run parent- or
family-facing programming — a parents' event, a family Pokémon GO outing, a club a parent
attends alongside their child. The blocker is baked in at every layer: the
`participations` table forbids the payer being the participant
(`CHECK (gamer_id <> customer_id)`), every enrollment write path proves a `parent_gamer`
link exists, the purchase UI only offers children, and the group voice room token route
refuses the `customer` role outright.

## Scale

Admin-facing capability with family-facing surfaces. Expected primary use is the **event**
type (parent evenings, family events), but the capability is deliberately available on all
four product types so architecture never limits programming choices. No data migration of
existing enrollments — every existing product and participation stays gamers-only by
backfill.

## The decision

### Audience flags on `products`

- Two booleans: `for_gamers` (default `true`) and `for_parents` (default `false`),
  mutually inclusive, with a CHECK that at least one is true. Backfill existing rows to
  gamers-only. Available on **all four product types**.
- They thread through the product create/update RPCs, the product zod contracts, and the
  admin form's payload builder **in the same change** — the update RPC assigns every
  editable column on every call, so a column it doesn't know about is silently nulled on
  the next admin edit (the known trap documented in `docs/products-architecture.md`).
  Add the two flags as **non-defaulted parameters** on both RPCs: they are being dropped
  and recreated anyway (a defaulted parameter would create an overload PostgREST cannot
  disambiguate), and a non-defaulted parameter makes an omitting caller fail loudly
  instead of silently resetting the audience.
- The admin form's **existing** Audience section (today: min/max age + delivered-in
  languages) gains the two checkboxes. `products` is anon-SELECT-readable; the booleans
  are public data by design.

### Seat model: participant-keyed participations

- The participant column holds **whichever profile occupies the seat**. A parent's own
  enrollment is a row where participant id = customer id. Drop the
  `chk_participations_no_self_signup` CHECK.
- Enrollment gates are audience-aware in both directions, and they live **only on the
  pre-money paths** — `create_participation`, the waitlist-join pair, and the admin
  enroll RPC:
  - participant = customer (self seat) → allowed only when the product has
    `for_parents`;
  - participant ≠ customer → requires the `parent_gamer` link (unchanged) **and** the
    product must have `for_gamers` (a parents-only product refuses child seats);
  - a parent can never enroll another adult.
  Precision on "self": `create_participation` and `confirm_paid_participation` are
  service-role-only and have no `auth.uid()` — the expressible invariant is
  **participant = `p_customer_id`**, with the calling route pinning `p_customer_id` to
  the session user, exactly as today.
- **`confirm_paid_participation` gets no audience gate — deliberately.** It is the
  after-money recorder: service-role-only, reachable only via the signature-verified
  Stripe webhook, fed metadata our own server wrote *after* validation passed. Re-checking
  there defends against no attacker (anyone who could feed it an unvalidated tuple
  already holds the webhook secret or the server) and creates a real failure mode with
  money in it: an admin unticking an audience flag between checkout and webhook would
  make the webhook refuse forever — charge stands, no seat, refunds are manual. Accepted
  trade: in that same race, the seat is created on a product whose audience changed
  seconds earlier — a stale-but-visible enrollment an admin handles like any roster
  question. Validate before money; trust and record after.
- Everything else is indifferent to who the participant is and stays untouched: the
  `(product_id, participant)` uniqueness, seat counting (**a parent seat consumes a seat
  like any other**), waitlist ordering, the Stripe checkout-session idempotency column,
  free/external immediate-insert paths, and `session_attendance` (a gedu marks a parent
  present exactly like a gamer).
- Waitlists: self-waitlisting allowed under the same audience gate. The existing "a
  parent may leave a waitlist" rule already covers leaving their own spot
  (`leave_my_waitlist_spot` is customer-scoped on `customer_id` and needs no change).

### The rename: `gamer_id` → `participant_id`

Decided: do the rename, isolated in **its own commit** (see Steps). It is behavior-free
but **not small** — state the true scope so nobody budgets it as a sed:

- The `participations.gamer_id` and `session_attendance.gamer_id` columns, plus their
  FK/index/constraint names.
- **~19 database functions read those columns and must have their bodies rewritten by
  hand** (a column rename does not rewrite plpgsql/sql bodies — they fail at call time,
  and neither lint, type-check, nor the jsdom test suites would notice). **7 of them
  take a `p_gamer_id` parameter, and Postgres refuses to rename an input parameter**, so
  each of those needs `DROP FUNCTION` + `CREATE` + **re-issued GRANTs** (a recreated
  function loses its ACL; the access-control catalog test fails on a missed grant). The
  retire-padlet migration is the worked precedent for the drop/recreate/re-grant cycle.
- **The migration ends with an end-state assertion**: scan every function definition in
  `pg_proc` for the old column token and `RAISE` if any survives — the same
  self-checking-migration pattern the padlet retirement used. This is the only guard
  that catches a stale function body before call time.
- Regenerated `database.types.ts`; the HTTP wire field (`gamerId` → `participantId`) in
  the enrollment contracts and their routes/services; and the PostgREST embed hints that
  name the old FK constraint — **exactly five occurrences, all on
  `participations_gamer_id_fkey`** (four in the participations service, one in the
  billing server helper); the attendance-side constraint appears in no query string.

**Out of the mechanical commit, renamed opportunistically** when the roster step touches
those shapes: RPC **result JSON keys** literally named `'gamer_id'`/`gamer_*` (emitted by
`get_gedu_group_feed`, `get_gedu_assigned_product`, `get_product_groups_with_details`,
and the attendance and minecraft-set RPCs, parsed by the roster contracts), and
**function names** containing "gamer" (`admin_enroll_gamer`, the
`gamer_count` result column) — renaming a function also means updating its entry in the
DB test suite's authorization spine, so it rides with the step that rewrites its body
anyway.

One async boundary cannot be renamed atomically: **Stripe checkout session metadata**.
Sessions created before the deploy carry the old `gamerId` key and can complete after
it. New sessions write `participantId`; the webhook accepts both — and the fallback is
**resolved once, at the metadata destructure/guard**, not per use site: the guard
currently returns 200 (no retry) when a key is missing, so a half-applied fallback would
silently drop a legacy in-flight session — charge, no seat, no error. The
`payments.metadata` ledger echo **keeps** the historical `gamerId` key (renaming it
would fork the stored shape for no reader); comment it. The webhook fallback can be
deleted after pre-deploy sessions age out (checkout sessions expire within 24h).

### Ages: a property of the gamer audience, never of adults

- `min_age`/`max_age` become nullable, with a CHECK tying presence to audience:
  `for_gamers = true` → both required (behavior identical to today); `for_gamers = false`
  → both null. The existing range-sanity CHECKs adjust to tolerate nulls.
- The admin form hides the age fields when For Gamers is unchecked (clearing them), and
  requires them when it is checked. Three compiler-invisible edits in the form's payload
  path make this real (the form is `useState` + a pure validate function — no zod, no
  react-hook-form): the payload builder stringifies ages (`String(null)` → `"null"` →
  `NaN` on the round-trip), the shared-fields builder sends `Number("")` = `0` instead
  of null (which would violate the new CHECK), and today's validator accepts a blank age
  for the same reason — the required-when-For-Gamers rule needs a real emptiness check.
  Form state must emit `null` for empty ages and validate presence conditionally.
- **No "18+" anywhere.** A parents-only product communicates its audience through
  audience labels ("For parents"), never through an adult age range. Product cards and
  detail pages render the age line only when a range exists.
- The shop **age-band filter means "shopping for a child of age X"**: it matches products
  with a gamer age range that overlaps the band. Parents-only products (no range) drop
  out of band-filtered results by construction. The new audience filter is the tool for
  "shopping for me."
- Age remains advisory (it blocks nothing), but the door to future enforcement stays
  open and gets *cleaner*: any later age check runs on gamer seats only, against the
  gamer's date of birth — parent seats are structurally exempt, not special-cased.

### Purchase UI (product detail page signup panel)

Three cases by audience:

1. **Gamers-only** — unchanged.
2. **Parents-only** — no child list; the parent themselves rendered as the single,
   preselected participant (their identicon + first name), so the "who is this seat for"
   step stays explicit before paying.
3. **Both** — the child rows as today plus a parent row; one selection, one seat, one
   checkout. Per-participant already-enrolled lockout applies to the parent row **for
   free**: the participation-counts read is keyed by the participant column filtered on
   the customer, so a self seat lands under the parent's own id with no service change —
   inject the parent as a row where the route adapter assembles the child rows (the
   signup-fields hook and panel view are id-agnostic and need no change for lockout).
   The injected row must be excluded from the max-children-per-parent count that gates
   the add-a-child affordance, or a parent row hides the add button one child early.

One seat per checkout everywhere — the family multi-select idea is **deferred**
(see Rejected alternatives). Buying for yourself and two children is three flows, same
as three children today.

### Voice rooms

- The group-room token route admits the `customer` role. Its membership gate is the same
  query the gamer path uses — an active participation on the group where participant =
  caller — which a parent's self seat satisfies naturally. Session-window and
  remoteness gates unchanged. The route's entry in the integration suite's route posture
  registry changes with it (the roles list is part of the registry entry).
- **The ownership flip is the security-critical line and must land in the same change
  that admits customers**: the route currently computes `is_owner = role !== "gamer"`
  (negative gating, safe only while customers are excluded). It becomes positive gating —
  owner iff gedu or admin. Note the flag is **doubled at the token mint**: the Daily
  helper sets both `is_owner` and `enable_screenshare` from the same option — the
  positive flip must govern both, or parents get screen-share.
- The page-level "customers get redirected to their dashboard" guard on the group voice
  room route is removed; the token route's membership gate is the real boundary, exactly
  as it is for gamers.
- The `user_name` role slot carries `customer`; the voice role union already includes
  every DB role, and all moderator gating in the room UI is positive gedu/admin checks,
  so guest-equivalent treatment of parents falls out with no UI changes.
- The voice-zones RLS membership predicate needs **no change after the rename** — its
  "participant of this group" arm matches the parent's self row by construction. Verify,
  don't re-derive.
- Scope: a parent joins only rooms where **they** hold the seat. Their children's rooms
  are unchanged — still the switch-to-gamer flow. On the parent's own enrollment cards,
  Join Voice navigates directly (no switch-profile dialog).

### Family, gedu, and admin surfaces

- **The parent dashboard and family product page were redesigned and merged recently**
  (dashboard bodies under `src/components/parent/`, product page under
  `src/components/family/product-page/`, with preview scenes). The first implementation
  step is a fresh survey of those surfaces — earlier exploration predates the merge.
- **The family enrollment rollup silently drops a self seat today**: it buckets
  participation rows by participant id, then iterates only family members with role
  `gamer` — a parent's own bucket matches no member and vanishes. This is the central
  surface fix (and the reason for the step ordering below): until it lands, a parent
  seat would be paid for and appear **nowhere**. The fix lands in the family rollup
  helper, and its public vocabulary — the per-member entry types and their gamer-named
  id field — is part of the same change: decide the renamed shape there, not ad hoc at
  call sites.
- Parent dashboard: gamer sections first, then a section for the parent's own
  enrollments titled with the **parent's first name** (not "You"), rendered only when
  they have any; the section list gains the parent section between the gamer sections
  and billing. The section-jump pill's cap is a **fixed count of three named entries,
  deliberately arithmetic rather than measured** (the server renders the pill's final
  shape on first paint), collapsing all-or-nothing to a single "Gamers" chip aimed at
  the first child's section; each named entry is separately width-capped and
  ellipsised. Working default (refine in UI Previews): the parent chip counts against
  the same count — at >2 children with a parent section present, the child entries
  collapse as today and the parent chip stays named; one cap, not two. The existing
  widest-case preview scenario (exactly three children) gets revised for the new
  widest case rather than a new one added. Two states need deciding while in there:
  what the collapsed "Gamers" chip targets when a parent section reorders things, and
  the **childless parent with own enrollments** — today zero children renders a
  no-children empty state that would swallow the parent's section; working default:
  render the parent section and demote the add-a-child prompt to a section rather
  than the whole page.
- The parent-side enrollment card's props are a **discriminated union whose parent arm
  requires a gamer first name** (consumed only by the leave-waitlist confirm — kept,
  since self-waitlisting exists) — the self-seat case needs a new union member. The
  discriminant doubles as the message-key selector in the card's copy ternaries, so a
  third member widens each of those choices; the strings needing self variants in all
  five locales are the name-interpolating leave-waitlist confirm plus the third-person
  "awaiting a Gedu" sentence. **Direct join is achieved by omission**: the card
  already falls back to a plain link when no join-click handler is passed, so the
  self-seat card simply doesn't get the dashboard shell's handler (which opens the
  switch-profile dialog with the role hardcoded to gamer and a title interpolating
  the child's name). The dashboard's per-enrollment action shape carries a doc-comment
  assertion that its person is always a gamer — that shape gains the self case too.
- Family product page: **routing and authorization already work** — the six route shells
  key on participation id with the audience fixed by the role root, and the feed RPC's
  access predicate ("participant is me, or I am their parent") admits a self seat by
  construction post-rename. The work is attribution only: the `'gamer'` JSON key, the
  RPC `COMMENT`, the "gamer-scoped" doc blocks (the colocated CLAUDE.md **and** the
  page's types module carry the same assertion), the page body's gamer-named prop, and
  the three name-interpolating strings (`familyProduct.forGamer`,
  `familyProduct.paymentProblemNotice`, `familyProduct.cancellationNotice`).
- Gedu group feed and admin group-management rosters: an **adult participant variant** of
  the roster row — a parent/adult badge, their own email as contact (there is no linked
  parent), and the age/gender/Minecraft fields rendered deliberately empty rather than
  as broken data. The two surfaces differ and the variant lands differently on each:
  the gedu rail roster shows a click-to-copy parent-email cell (an adult substitutes
  their own email) and has a **bulk copy-all-emails affordance that must include the
  adult's own email**; the admin group chip shows parent first+last name and **no email
  of any kind today** — its adult variant adds an email where the child variant shows a
  parent name. **The contact email is an RPC change, not just a contract relaxation**:
  no roster RPC emits the participant's own email today (they emit the linked parent's,
  via the parent-link lateral join, which is NULL for an adult) — `get_gedu_group_feed`,
  `get_gedu_assigned_product` and `get_product_groups_with_details` each gain the
  field, in the behavioral migration (step 3) so the roster step only consumes it.
  (The assigned-product roster is only ever rendered via the feed's fresher copy — its
  copy of the field is for shape parity; comment it so nobody deletes it as unused.)
  The contract relaxation is smaller than it sounds: only the gedu-feed roster contract
  still declares the parent email required (with a "deliberate tightening" comment to
  unwind); the assignments and groups contracts are already nullable where it matters
  and only gain the new field. Refine the row visually in UI Components; judge the
  panel in UI Previews.
- Admin comp-enrollment: the picker (today parent-first, children nested) gains the
  ability to select the parent themselves; the admin enroll RPC's "resolve the customer
  via the parent link, raise if none" logic gains the self case (customer = participant),
  under the same audience gate. The picker currently **drops parents with zero linked
  children entirely** — on a for-parents product a childless parent must be listed and
  selectable.
- Shop browse: a new audience filter chip row (For gamers / For parents, multi-select OR
  like topic/language) in the client-side filter predicate, plus audience labels on
  cards. The chips may briefly ship before any for-parents product exists (the admin
  form lands last — see Steps); a filter with an empty result set for a few days is
  accepted.
- Billing portal labels and the Stripe subscription description derive from the
  participant's name; every child-assuming string (signup heading, confirmation page,
  emails) gets audience-aware variants in **all five locales** — plus the checkout
  route's hardcoded English `"your child"` fallback for the Stripe subscription
  description, which lives outside `messages/` and won't be caught by a locale sweep.
  Two more child-assuming strings to name explicitly: the purchase-confirmation view's
  translated "Your child" fallback (in `messages/`, but needs an audience-aware
  variant, not just translation), and the municipality-club consent checkbox ("my
  child's seat") — a consent-bearing string a self-enrolling parent must tick.

### Deferred (recorded, not built)

- **Family multi-select checkout** (checkbox several family members, one flow): goes to
  `TODO.md`. The open design question to record with it: seat shortfall — with 1 seat
  left and 2 selected, all-or-nothing with a clear error vs. place-one-waitlist-one.
  Nothing in this plan's schema resists adding an atomic multi-insert RPC later.
- **Game-account linking for parents** (a parent in a remote Minecraft club can't be
  whitelisted without one): out of scope; adult roster rows show the slot as unlinked.
- The family session feed's deeper machinery beyond the attribution generalization
  above.

## Rejected alternatives

- **A separate table or an audience/role column on `participations`** to mark parent
  seats: one schema noun for "a seat on a product" is the architecture's core
  simplification; who sits in the seat is derivable (participant id = customer id, or
  join to profiles.role). A second noun would fork every predicate, roster, and counter.
- **Faking a self `parent_gamer` link** so the existing gates pass: the table's trigger
  enforces parent=customer/child=gamer roles, and the hack would poison every "my
  children" query.
- **Keeping the `gamer_id` name**: rejected — the semantic shift is permanent, the
  codebase values honest naming, and the rename is isolatable. Decided with eyes open
  about the true scope (~19 function bodies, 7 drop/recreate/re-grant cycles, five embed
  hints, wire fields).
- **An audience gate on `confirm_paid_participation`**: rejected after explicit security
  review — the after-money path is not attacker-reachable with an unvalidated tuple
  (signature-verified transport, server-authored metadata written only after
  validation, service-role-only function, idempotent by unique keys), so a gate there
  adds no security and creates the charged-without-seat failure. The gates live
  pre-money only.
- **Sentinel age ranges for adult products** ("18+", 0–99): rejected. Age is the wrong
  vocabulary for "this is for parents" — it misreads as "any adult gamer welcome" and
  pollutes the age data. Audience flags carry the meaning; null age is tied to the
  absence of a gamer audience by CHECK.
- **Age-band filter matching products with no age range**: rejected — a band expresses
  a child's age; surfacing parents-only products under it is noise. The audience chip
  covers the parent-shopping path.
- **Keeping `is_owner = role !== "gamer"` and just excluding customers elsewhere**:
  rejected — negative gating is exactly what would silently mint parent-moderators the
  first time a future change admits another role. Flip to positive gedu/admin gating
  while touching the route (covering the doubled screen-share flag).
- **Audience-segregated product groups**: rejected — groups are hand-assigned by admins
  with no automation; mixed groups need zero new machinery, segregation needs plenty.
  Group composition stays the admin's judgment.
- **"You" as the parent's dashboard section label**: rejected in favor of the parent's
  first name, consistent with sections being named for people.
- **Family multi-select checkout in v1** — deferred, twice narrowed and still not tight:
  even the money-free variant (free events, external-contract muni clubs, where an
  atomic multi-insert avoids Stripe entirely) forces the seat-shortfall product decision
  above. Kept out to hold scope; the free-path shape is the natural follow-up.

## Steps

Each stage lands independently on `dev` (own branch or `/worktree-flow`). Migration
workflow per `supabase/CLAUDE.md`: psql-check remote history before numbering, push the
migration and regenerate types **before** committing, add type aliases for new
enums/columns as needed. DB tests run in CI only — push the branch to exercise them.

**Ordering constraint (deliberate): the admin form's audience checkboxes land last.**
They are the only way a for-parents product can come to exist, so every surface a parent
seat touches (rollup, dashboard, voice, rosters, purchase paths) must already handle it
before the switch is flippable. Do not reorder step 8 earlier.

1. **Survey the merged family surfaces.** Read the current parent dashboard bodies,
   family product page, their preview scenes, and the session-feed machinery as merged;
   reconcile this plan's surface work (steps 4, 7) against what actually shipped. Adjust
   the plan file in place if the shapes moved.
2. **The rename commit (behavior-free, not small — see The decision for true scope).**
   Migration renaming the two columns (+ FK/index/constraint names), hand-rewriting the
   ~19 function bodies, drop/recreate/re-grant for the 7 with renamed parameters, and
   the end-state assertion scanning `pg_proc` for the old token. Function bodies are
   read from the CI-maintained `supabase/schema.sql`, which is current for everything
   merged to `dev`. Then: regenerate
   types; update the five embed hints, the enrollment wire contracts
   (`gamerId` → `participantId`) and their routes/services; webhook writes the new
   Stripe metadata key with the legacy fallback resolved once at the destructure guard.
   Green build, zero behavior delta. Verify the voice-zones membership predicate
   behaves unchanged.
3. **Schema stage: audience, ages, gates.** One migration adding `for_gamers` /
   `for_parents` (+ at-least-one CHECK, backfill), relaxing `min_age`/`max_age` to
   nullable with the audience-tied CHECK, dropping the no-self-signup CHECK, updating
   the **pre-money** enrollment RPCs (create, waitlist join, admin enroll) to the
   audience-aware gates — `confirm_paid_participation` untouched — and adding the
   participant-email field to the three roster RPCs. Thread the new columns through the
   product create/update RPCs (non-defaulted params) and contracts in the same change
   (the nulling trap). DB tests: re-classify every touched RPC in the authorization
   spine; add cases — self-enroll on a for-parents product succeeds, self-enroll on a
   gamers-only product is refused, child-enroll on a parents-only product is refused,
   enrolling an unlinked adult is refused, parent self-waitlist works, confirm-paid
   still records a seat with no audience check, age CHECK enforces
   null-iff-no-gamer-audience.
4. **Family surfaces.** Preview scenes first — the surfaces are the parent dashboard
   scene and the parent/gamer club-page pair (one shared body, split by audience): the
   parent's own-enrollments section (gamers first, parent's first name, conditional
   presence), the single-count section pill (revise the existing widest-case scenario;
   add the childless-parent-with-enrollments state), the self-seat enrollment card
   variant (new union member: own name, direct voice join by omitting the
   switch-dialog handler), and the participant-scoped product-page attribution. Sign
   off from fixtures, then wire: **fix the enrollment rollup** so self-seat buckets
   survive (the silent-drop bug — including its gamer-named entry vocabulary), and
   land the card and product-page changes with their locale strings.
5. **Shop and signup panel.** Audience filter chips + card audience labels + conditional
   age line; the three signup-panel cases (parent injected as a selectable row in the
   route adapter, excluded from the max-children count; lockout is free via the
   customer-filtered participant-keyed read); checkout and waitlist routes accept the
   parent as participant (validation is the RPC's job); subscription description and
   confirmation copy become participant-aware, including the out-of-messages "your
   child" fallback in the checkout route, the confirmation view's translated fallback,
   and the municipality consent checkbox. Update the route posture registry entries.
   All five locales.
6. **Voice.** Token route: admit `customer`, participant-keyed membership check, flip
   ownership to positive gedu/admin gating covering **both** `is_owner` and the
   screen-share flag it feeds — one change, plus its integration tests (a customer with
   a seat gets a non-owner token; a customer without one gets 403; a gedu/admin still
   gets owner; the minted token carries no screen-share for customers). Update the
   posture registry roles. Remove the page-level customer redirect. Update the voice
   CLAUDE.md access-control table (customer column: join own group's room in window; no
   moderator capabilities).
7. **Gedu/admin rosters.** Adult row variant (badge, own email from the new RPC field,
   deliberately-empty child fields) in the gedu group feed and admin groups panel —
   including the gedu bulk copy-all-emails affordance and the admin chip's new email
   line; relax the gedu-feed roster contract's required parent email; comp-enroll
   picker gains adults (including childless parents, which it drops today);
   opportunistic renames ride here — the `gamer_*` result JSON keys on the shapes
   being touched and the `admin_enroll_gamer` function name (with its
   authorization-spine entry). Style-guide demo for the adult roster row.
8. **Admin product form — the enabling switch, deliberately last.** Audience checkboxes
   in the existing Audience section; age fields required with For Gamers, hidden and
   cleared without it; the three payload-path fixes so empty ages emit `null` (not
   `"null"`/`0`) and presence is validated conditionally. Per-type config untouched
   (all four types get the checkboxes).
9. **Docs and follow-ups.** `docs/products-architecture.md`: participant noun, audience
   flags, age semantics, "one subscription per (participant, club)", the pre-money-only
   audience gates and the confirm-paid trust rationale. Root CLAUDE.md's RBAC section if
   wording about parents warrants it. `TODO.md`: the family multi-select follow-up with
   the seat-shortfall question. Delete this plan file when everything above has landed.

## Acceptance criteria

- Admin can author a product in any of the three audience shapes; audience flags and
  null ages survive an unrelated admin edit (the nulling trap is closed).
- Shop: audience chips filter correctly; a parents-only product shows no age line and
  drops out of age-band-filtered results; a mixed product shows both.
- A parent can buy/waitlist a seat for themselves on a for-parents product (paid club
  subscription, paid single-payment, and free paths all work); is refused on a
  gamers-only product; child enrollment on a parents-only product is refused; existing
  child flows are byte-for-byte unchanged in the gamers-only case.
- Stripe: a checkout session created pre-deploy (legacy metadata key) still confirms
  correctly post-deploy — including through the missing-metadata guard, not just the
  RPC call.
- **A parent's self seat appears exactly once on the parent dashboard** (the rollup
  includes it; the duplicate-render direction is structurally impossible — the RLS
  select policies are role-partitioned, so no session matches both) and its card joins
  voice directly.
- Voice: a parent with a self seat joins their group's room in-window with gamer-level
  permissions (no moderator controls, no screen-share, server-verified `is_owner`
  false); a parent without a seat is refused; gedu/admin ownership unchanged;
  children's rooms still require the switch-to-gamer flow.
- Gedu feed and admin groups render adult participants with the badge/own-email/empty
  variant; attendance can be recorded for them.
- The rename migration's end-state assertion passes (no function body references the
  old column token).
- `npm run lint`, `npm run type-check`, `npm run test` clean; CI db tests green with the
  new spine classifications and IDOR cases; route posture registry checks pass.

## Constraints discovered while deciding

- **`CHECK (gamer_id <> customer_id)`** is the single structural blocker for self seats;
  its *protective* intent (a payer can't casually occupy a child seat) survives as the
  RPC audience gates.
- The participation FKs already point at generic `profiles(id)`. Six of the "party to
  this participation" DB predicates are already two-sided (customer OR participant); the
  voice membership predicate is participant-only (fixed by the rename+self-seat model
  with no predicate edit) and the waitlist-leave RPC is customer-only (already correct
  for self seats).
- **The update-product RPC nulls any editable column the form doesn't send** — new
  product columns must reach both RPCs, the contracts, and the form payload builder in
  one change, as non-defaulted parameters.
- **A column rename does not rewrite function bodies, and nothing local catches a stale
  one** — they fail at call time; lint/type-check/jsdom tests stay green and DB tests
  are CI-only. Hence the drop/recreate/re-grant inventory and the end-state assertion.
- **`supabase/schema.sql` regenerates on every push to `dev`** and is current for
  everything merged there; only this plan's own unlanded work is missing from it. Do
  not trust any point-in-time staleness claim about it (an earlier one in this plan
  went stale itself, and following it would have reverted two later migrations) —
  read function bodies from `schema.sql` as it stands when each step starts.
- **Renaming a column renames its FK constraint, which breaks PostgREST embed hints**
  (`table!constraint_name` strings in supabase-js queries) — five occurrences, all on
  the participations constraint, none on attendance.
- **Stripe metadata is an async boundary**: in-flight checkout sessions carry the old
  key across a deploy; the webhook needs the legacy-key fallback until they age out,
  resolved once at the destructure guard (which otherwise 200s-without-retry on missing
  keys — the silent charge-without-seat shape). The payments ledger echo keeps the
  historical key.
- The voice route's `is_owner = role !== "gamer"` is safe today only because customers
  can't reach it; admitting them without the positive-gating flip silently creates
  parent moderators — and the flag also feeds screen-share at the token mint. These
  edits are one change, never two.
- **The silent-drop direction, not double-render, is the family-surface hazard**: RLS
  select policies on participations are role-partitioned (a customer session can never
  match the gamer-side policy), so a seat can't render twice — but the enrollment
  rollup's role-filtered iteration makes a self seat render **zero** times until fixed.
  This is why the admin form lands last.
- The gedu roster contract documents parent contact as "non-null in practice" — adult
  rows break that in the letter; the contract relaxation is deliberate, the contact
  becomes the participant's own email (a new RPC-emitted field), and the UI renders the
  absence deliberately.
- Age bands and constants live in gamer-named modules; that naming stays truthful under
  this plan (bands only ever apply to gamer audiences).
- The parent dashboard/product-page redesign merged very recently — surface work in this
  plan must be reconciled against the merged code first (step 1), not against
  pre-merge exploration.
