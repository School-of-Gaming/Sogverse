# Gamer creations

Per-gamer, per-group links to things a gamer made — a published Roblox game, a
Scratch project — entered by staff, shown to the gamer's own family. On
products contractually required to produce one per gamer (the Roblox
Programme), missing creations surface to Gedus as owed work.

## Problem

The Roblox/Lynx contract requires that on Roblox-sponsored products, **every
gamer still in the product at its end date has a published Roblox game URL**
(to be delivered to Roblox via an API later — that export is out of scope; for
now the data must exist, be maintainable, and be hard for a Gedu to forget).
Nothing in the product can store "a thing this gamer made in this group".
Rather than a Roblox special case, this is a general Sogverse feature: many
products have a creative element (Roblox Studio, Creator Studio, programming),
and a creation link is meaningful for any of them — optional almost
everywhere, required where a contract says so.

## Scale

Most gamers will have zero creations — the feature must cost those groups no
screen space and no Gedu attention. On products with a creative element, most
gamers will have exactly one creation; very few will ever have more than one.
Written by the group's Gedu (or an admin), read by that gamer and their parent.

## The decision

**Rule: one authoring surface — the requirement flag adds visibility, never a
parallel UI.** Adding a creation is the same gesture on every product: open
the per-gamer dialog from the roster row, type title + URL, save. The flag
below changes only *signals* (an owed marker, counts), and every signal routes
to that same dialog. A Gedu who learned creations on an optional product knows
everything there is to know on a required one.

**Scope and ownership.** A creation is scoped per gamer per group, exactly
like the existing private gamer note. Staff (Gedu/admin) write; the gamer and
their parent read. Gamers never write.

**Shape.** One creation = a URL plus a short title, both staff-authored plain
text, both required (trimmed non-blank, length-capped). The URL is *expected*
to be a URL but is stored as raw text with **no validation** — Gedus and
admins are trusted, and we revisit only if it becomes a problem. A gamer's
creations within a group are an ordered list; order is whatever order staff
arranged them in (array order — no reorder affordance; staff retype to
rearrange).

**Data.** One row per (group, gamer), structurally mirroring
`gamer_group_notes`: `group_id` (FK, ON DELETE CASCADE), `participant_id`
(FK → profiles, ON DELETE CASCADE), PK on the pair, and a `creations` jsonb
array of `{title, url}` objects. Array order is the display order — no
position column. A CHECK enforces the shape loudly at the schema (an array, a
modest element cap, every element an object with exactly non-blank
length-capped `title` and `url` strings — jsonb-path/`jsonb_array_length`
machinery; exact caps are implementer's judgment). The row also carries
`created_at`, `updated_at` and `updated_by` (SET NULL): provenance is stored —
separate from the note's — but **no v1 surface displays it**, so no reader
joins profiles for it. RLS enabled with no policies, no Data API grants; every
read rides an existing document RPC and every write goes through a new
SECURITY DEFINER RPC. Creations cascade away with their group — accepted;
group deletion is rare admin cleanup.

**The requirement flag.** A new `products` boolean, admin-set, NOT NULL
DEFAULT false (working name `requires_gamer_creations`). Set in the admin
product form as a bordered checkbox row (the visibility-section /
`CheckboxRow` precedent; which form section is implementer's judgment). It
rides the existing product write path: a new *defaulted* argument on both the
`create_product` and `update_product` RPCs (drop/recreate, per those
functions' own arg conventions), `formStateFromProduct` hydration, and the
build/validate module. Staff-facing effects only — a family sees nothing
different on a flagged product. Not derivable from `products.topic`: not
every `roblox_studio` product is Roblox-sponsored, so a contract obligation
is an explicit admin decision. No epoch gating is needed (unlike session
recording): the flag defaults false, so flagging a product *is* the opt-in.

**Owed semantics — creations are part of the final session's work.** The
owner's framing, and the design's spine: *"if this is the final session of
this group, and this group needs gamer creations, then my last session work
isn't complete until the gamer creations are supplied."* On a flagged
product, the **final session's completeness** gains a fourth condition
beside attendance, the report and the report email: every current roster
member has at least one creation.

- **The final session** is the last computed occurrence of the product's
  run (occurrences come from the schedule; there is no explicit
  final-session flag, so "last occurrence on or before `end_date`" is the
  definition). For a single-session event that is the event itself.
  Programme formats span one hour to nine weeks (the landing page's own
  copy), and this definition needs no per-format tuning — no date window,
  no lead-time constant.
- **When it flips:** exactly like the other three obligations — at the
  final session's end instant. Before that the entry is future/live and
  never flagged; after it, an unmet condition stays needs-attention
  indefinitely, as owed sessions already do.
- **Who owes:** every current member of the group (owner: "any gamer who
  was in the product by the end date"). Leaving clears the debt; joining
  after the final session reopens its completeness — both because the
  tally runs over the *current* roster, exactly as attendance completeness
  already behaves. Adult seat-holders owe like anyone else — one rule, no
  special case.
- **Open-ended products** (a consumer club with `end_date` NULL) can be
  flagged, but have no final session, so nothing ever becomes owed.
  Documented behavior, not an error.
- An empty roster owes nothing (the completeness derivation already never
  flags an empty roster).

**Where owed work shows: every surface the session pattern already has,
plus a per-member pointer.** Because the condition joins the one
client-side completeness derivation, the existing surfaces light up with
no new machinery: the final session's card shows the amber
needs-attention line, its timeline marker takes the warning tone, and the
gedu dashboard's assignment badge counts it — the badge's unit stays
"sessions needing attention"; the final session simply has one more way
to need it. The assignment-summaries RPC and its TypeScript rollup twin
gain the condition in lockstep (both sides carry comments demanding
exactly that).

What the session card cannot say is *which* members are missing
creations — that is per-member data, so the roster answers it: while the
final session is owed creations, each owing member's roster row carries a
needs-attention marker (both workspace shells), decorating the row and
routing to the same per-gamer dialog; exact rendering (a tone on the
existing button vs. a small adjacent marker à la the adult-seat badge) is
implementer's judgment under the one-authoring-surface rule. This is the
scope mismatch resolved: the *fact* ("this group's final session is not
done") is session-scoped and rides the session pattern; the *itemization*
("these members") is member-scoped and rides the roster.

**Write path.** One replace-the-list RPC (`set`-shaped, a near-copy of the
note's): list in, row upserted, empty list deletes the row. Guard-first, two
checks, both `42501`-shaped like the note's: the **actor** gate (admin, or a
Gedu assigned to the product) and the **target** check (the participant must
hold a participation in that group). The target check is the write-IDOR
guard — the table carries no client write grant, so it is deliberately
outside the write-IDOR registry loop, and the target check stands in, per
the notes precedent. Classified in the DB authorization spine as role-gated.
EXECUTE to `authenticated` only.

**Staff read path.** Creations ride the note-carrying documents as one more
emitted key beside the note — the same one-line join shape, which is why the
JSONB row was chosen. Widened: the **gedu group feed** (the flair source both
workspace shells render from), the **gedu assigned-product document** (its
roster schema documents deliberate parity with the group feed's and they
share a row type — widened to hold that parity rather than split the type),
and the **voice staff overlay** (owner decision: creations edit in-session
too). The admin product-groups document (the three-arm one) is **not**
widened — verified to feed no note button. The flag and the schedule already
reach the workspace via the product; creations arrive as a fourth sparse
flair map (absence-is-none — the documented extension pattern), and
owed-ness is *derived client-side* from them (the completeness derivation
for the session card, the same gate for the roster marker), so no document
carries an "owed" field; only the summaries RPC computes it server-side for
the dashboard count, with the TS twin kept in lockstep.

**Family read path.** The document that feeds the family product page body
gains a creations array for the page's own participation, as a **top-level
array** — not a map keyed by participant, so another child's data has
nowhere to live, by type. A family sees **only their own gamer's creations**
— not other group members', not siblings'. (This deliberately drops the
"gamer B clicks gamer A's creation" story; see Rejected alternatives.) The
family contracts file is `.strict()` and its doc-comment requires a written
justification for any staff-authored family-visible field — the safeguarding
argument below gets written into that doc-comment, since this plan is
deleted on completion. The requirement flag and owed state never reach
family surfaces.

**Gedu UI.** The existing per-gamer note dialog grows into *the* per-gamer
dialog, identical in every mount — the gedu product page, the admin group
details page, and the voice room. Private note on top, creations list below,
with two-audience labeling *in the pattern of* the group/site standing-notes
panel (the note labeled staff-only, creations labeled visible to the family)
— implemented locally, **not** by importing the gedu-tree note blocks into
the dialog's component home: the dialog mounts in the voice room where gamer
rows render, and gedu-tree components must not enter a child's bundle. The
creations half is a list of title+URL row pairs with add and remove. A fully
blank row is dropped client-side on save (the note's trimmed-empty-means-
absent rule); a half-filled row blocks save with an inline message, so the
schema CHECK stays a loud backstop, not a routine error path. The roster-row
button's filled/dimmed state becomes "has a note **or** any creation", and
its accessible label covers both, in all mounts.

**Family UI.** A "Creations" card on the family product page, rendered only
when non-empty — zero space in the common case, matching the standing-notes
card's suppression. It rides the same page document as the rest of the body,
so it renders with the page and never pops in late (Layout & Scrolling
rule). Each entry renders as its title; when the stored URL parses as
http(s) it is an external link (new tab, `noopener`, an external-link lucide
icon beside the text); when it does not parse, the title renders as plain
text with no anchor — degrade-to-label, the same fallback shape the markdown
renderer uses. This parse-or-degrade is the security half of the
no-validation decision: raw text must never reach an `href` unchecked (a
`javascript:` value on a parent's browser is stored XSS), and the required
title guarantees a human-readable label on the degrade path. The gamer sees
the card too (same body, `audience` prop), which is how a gamer revisits
their own work.

**Safeguarding note.** Staff-authored family-facing content is deliberately
link-free elsewhere (session reports); creations are the deliberate,
owner-approved exception — the link *is* the content. The trust boundary:
only staff write, only the gamer's own family reads, and an unparseable
value degrades to text rather than to an anchor.

**i18n.** New strings in all five locales (tlh in character; no emoji in
messages — glyphs are lucide icons in components).

## Rejected alternatives

- **A Roblox special case** — a general creations feature serves the same
  requirement and every other creative product; rejected by the owner up
  front. No `kind`/`platform` marker either: a later API export can find the
  Roblox link by host.
- **No flag — uniform prominence everywhere** — the original v1 decision,
  overturned by the owner on reading the contract: sponsored products carry
  a hard per-gamer requirement, which demands a per-product admin decision
  and an owed signal. Unflagged products keep the original uniform-organic
  design unchanged.
- **Session-scoped creations** (to match where attendance/reports are owed)
  — the artifact is a fact about the gamer's whole run, not about session 7;
  what the contract adds is a completeness *state*, and that state lives at
  the scope the data does. The owed signal renders on the roster, which sits
  on the same workspace page as the session feed.
- **Owed from day one, and a calendar window before the end date** — two
  earlier iterations, both rejected. A standing all-term nag devalues the
  signal; and any fixed or clamped lead-time constant fires at the wrong
  times across formats spanning one hour to nine weeks, while inventing a
  second owed mechanic beside the session one. The owner's final framing —
  creations are final-session work — needs no timing parameter at all.
- **A group-level owing count in the rail card** — unnecessary once the
  signal rides session completeness: the feed card and timeline show the
  state, the dashboard badge aggregates it, and the roster itemizes it.
- **Blocking enforcement** (e.g. holding the final session report until
  creations exist) — wrong-scoped, hostile to Gedus; the owed posture
  everywhere else is visible-but-blocks-nothing, and creations follow it.
- **Whole-group visibility on the family page** (the original gamer-A/B
  story) — the family product page is per-group *per-child* and has never
  shown another child's name or work to a family; crossing that privacy line
  is not worth it for v1.
- **URL validation / a domain allowlist** — trust staff fully, store raw
  text. Owner decision: not a problem until it is one. Render-side
  parse-or-degrade keeps a malformed value from becoming a dangerous anchor.
- **Creations surviving group deletion** — cascade like notes; accepted.
- **A separate roster affordance for creations** — one per-gamer dialog: no
  new chrome, discovery rides the note button Gedus already use.
- **One relational row per creation** (with a `position` column) — nothing
  ever reads, updates or references a single creation row, so the relational
  shape pays its full price (a correlated subquery per widened reader, a
  position column, per-row RPC bookkeeping) for zero relational use, and the
  owner's scale answer (almost always 0 or 1 entries) removes any residual
  case. Cost accepted in trade: uglier jsonb CHECK machinery.
- **Keeping the voice room's dialog note-only** — rejected by the owner:
  in-session access is valuable, and the JSONB shape makes the overlay
  widening the same one-line join as everywhere else. One identical dialog
  is also simpler than a prop-driven fork.
- **Dropping `updated_by`/`updated_at`** — softened by the owner: provenance
  is kept (stored on the creations row, separate from the note's), but
  nothing displays it in v1, so it costs no reader joins.
- **Per-row add/update/delete RPCs** — replace-the-list is one RPC to
  write, classify and test, and matches a small list edited in a dialog.

## Steps

1. **Migration**: `gamer_group_creations` table (JSONB shape, CHECKs, RLS
   on, no grants); the replace-the-list RPC (actor gate + target check;
   EXECUTE to `authenticated`); the `requires_gamer_creations` column plus
   defaulted args on `create_product`/`update_product`; widen the three
   justified readers (gedu group feed, gedu assigned-product, voice staff
   overlay) and the family product page document (top-level array) with the
   one-line join + emitted key beside the note; widen the gedu
   assignment-summaries RPC's `attention_count` with the final-session
   creations condition (flag on, the run's last occurrence finished, some
   current member with no creations row/empty array, roster non-empty). Write a hand-rolled
   end-state `DO` assertion block covering every widened function's new
   emission (the 00203/00204-style precedent — it is per-migration and
   hand-written, not a standing mechanism). Push, regenerate types, add
   aliases.

   *Landed as `00227_a_gamer_shows_what_they_made.sql`. Names: table
   `gamer_group_creations`; RPC `set_gamer_group_creations(p_group_id uuid,
   p_participant_id uuid, p_creations jsonb) RETURNS jsonb`; column
   `products.requires_gamer_creations`; new defaulted arg
   `p_requires_gamer_creations boolean DEFAULT false` appended to both product
   RPCs. Caps: ≤20 entries, title ≤200 chars, url ≤2000 chars. Emitted key is
   `creations`, always an array (`[]` when there is no row), never null.*

   *Two deviations, both additive. (1) The plan says "the flag and the schedule
   already reach the workspace via the product" — the flag did not, being a new
   column, so the product shells of the gedu group feed AND the gedu
   assigned-product document also emit `requires_gamer_creations`. Step 7's
   client-side derivation has no other route to it. (2) Fixtures constructing a
   full `products` row gained `requires_gamer_creations: false` (the public
   product-detail mock and three unit-test fixtures), which the NOT NULL column
   forces at compile time.*
2. **Contracts**: zod schemas for the RPC body and every widened document
   shape, in the owning services' contracts files; the safeguarding
   justification written into the family contracts doc-comment per its own
   rule.

   *The **creation entry** schema (and its three caps) lives in the member-flair
   contracts — the service that owns the write — and is imported by the gedu
   feed, the assigned-product document and the family feed rather than restated
   in each. That is a deliberate reading of the family file's own
   duplicated-on-purpose rule: what it forbids sharing is a **document shape**,
   and what it shares already is a **vocabulary** whose members must match one
   CHECK constraint. A creation entry is the second kind — exactly the keys
   `title` and `url`, non-blank, 200/2000, at most twenty, all of it one CHECK —
   so a second copy beside the family document would be a second source of truth
   for one fact. What stays that file's own decision is the shape of the KEY, a
   flat array for one participation and never a map, which is the half that
   carries the privacy. The justification is written into the family file's
   header, beside its `.strict()` paragraph.*

   *The `requires_gamer_creations` flag also reaches the hand-written
   `GeduAssignedProductShell` interface in `src/types/index.ts`, and `creations`
   reaches `GeduAssignedProductRosterEntry` beside it — that interface is the
   shared roster row type the workspace's rows consume, so widening the two zod
   schemas without it would have left the data unreachable from the components.
   The admin group-details shell fills the flag from the **group feed's** copy
   rather than the admin product row's, so the flag and the roster's creations
   come from one document.*

   *Compile-forced fills, all inert: `creations: []` and
   `requires_gamer_creations: false` in the workspace preview fixtures and in
   two component wiring tests, and `creations: []` in the voice flair test's
   member factory. Step 9 owns turning any of them into a real state.*
3. **DB tests**: classify the new RPC in the spine (role-gated,
   guard-first); parse real RPC output through the new schemas (widened
   documents, write path, widened summaries); negative cases for both
   guards (unassigned Gedu, parent, gamer; assigned Gedu targeting a
   profile with no participation in the group). No write-IDOR registry
   entry — no client write grant; the target check stands in.

   *Landed as a new file, `tests/db/gamer-creations.test.ts` (fixture range
   6b0–6b6, registered in `product-helpers.ts`), rather than as additions to
   `member-flair.test.ts`: the summaries condition needs a FLAGGED product whose
   run has already ENDED and whose other three conditions are satisfied, and
   doing that to a shared fixture would move the counts every other block
   asserts on. The spine entry is `set_gamer_group_creations`, role-gated,
   permitting gedu and admin, carrying the same all-NULL-args note the write
   beside it carries. While registering the range, `session-images.test.ts`'s
   previously unlisted 6a0–6a3/6a9 was added to the registry too.*
4. **Service + queries**: write method and mutation hook, invalidating the
   staff document keys the note write already invalidates (family keys are
   *not* invalidated — the writer is always staff and never holds a family
   cache entry). Reads arrive through existing hooks as documents widen.

   *The service's private refusal-mapping symbols were renamed from note-shaped
   to flair-shaped and are now shared by both writes: the two sit in one dialog,
   are refused by the same two SQLSTATEs, and hand the same dialog the same
   message-less error. The four invalidated keys likewise moved into one shared
   helper, so the two writes cannot drift into invalidating different sets.*
5. **Product form**: the flag's checkbox row, form-state field, build/
   hydrate wiring through the existing create/update path.
6. **Gedu dialog**: grow the per-gamer dialog (two-audience labeling
   implemented locally; creations list editor with the blank-row rules);
   wire the roster button's state and label to note-or-creations; carry
   creations through the voice flair derivation so the voice mount behaves
   identically.
7. **Owed signal**: the fourth completeness condition in the client-side
   entry-completeness derivation (final session of a flagged product +
   creations tally over the current roster), with creations arriving as a
   fourth roster-flair map; the roster-row marker gated on the same
   condition; the TS rollup twin updated in lockstep with the summaries
   RPC.
8. **Family card**: the Creations card in the family product page body,
   non-empty-only, parse-or-degrade, all three audiences.
9. **Fixtures & demos**: the note dialog's style-guide demo, the two
   preview scenes that mount it, the voice/workspace fixtures, and the
   family product page scene's kitchen-sink scenario — all gain creations
   states (no new scenario; the card coexists with existing states).
10. **i18n**: all five locales.
11. **Verify**: lint, type-check, unit/integration locally; push for DB
    tests (CI-only).

Single branch, single release — the migration is purely additive and the
widened documents are within the accepted read-side skew window (the
established precedent: the family document is widened in place, no
versioned twin).

## Acceptance criteria

- A Gedu assigned to a group can add, edit and remove titled creation links
  for a gamer in that group from the per-gamer dialog — from the workspace
  and from inside a voice session; an admin can do the same from the admin
  group page. The dialog is identical on flagged and unflagged products.
- The write RPC refuses an unassigned Gedu, a parent, a gamer — and an
  assigned Gedu targeting a profile with no participation in the group (DB
  tests).
- An admin can flag a product as requiring creations in the product form;
  the flag round-trips through create and edit.
- On a flagged product whose final session has ended with members missing
  creations, that session's card reads needs-attention and its timeline
  marker takes the warning tone (both workspace shells), the gedu
  dashboard's assignment badge counts it, and each owing member's roster
  row carries the marker; supplying the creations completes the session
  and clears all of it (given attendance, report and email are done). An
  unflagged product and an open-ended flagged product show none of it.
- The parent and the gamer see that gamer's creations on their family
  product page as external links; no creations → no card, no reserved
  space; no other child's creations can appear there; nothing family-facing
  changes with the flag.
- A stored value that does not parse as http(s) renders as its title in
  plain text, not a link.
- The roster button reads filled for a gamer with creations and no note, in
  every mount.
- Lint, type-check, unit/integration and CI DB tests green; new RPC
  classified in the spine; no route changes (no posture-registry entry
  needed).

## Constraints discovered while deciding

- The gamer-notes pattern this mirrors: no policies + no grants + SECURITY
  DEFINER RPC writes + reads riding roster documents is the established
  access shape for per-gamer-per-group staff data. Its RPC's *target* check
  doubles as the write-IDOR guard; the spine requires the new RPC
  classified.
- The owed-work pattern: completeness is derived in one client-side module
  (per-session), owed state flips at a session's *end*, an empty roster is
  never flagged, and the dashboard count comes from a summaries RPC whose
  SQL deliberately mirrors the TS derivation — both sides carry lockstep
  comments, and this plan adds a second thing they must agree on.
- The owed-count badge component already has an unused `inline` variant;
  the rail card has a trailing slot; the roster-flair derivation module is
  the documented home for a new per-member sparse map.
- Product dates: `end_date` is nullable only for consumer clubs
  (open-ended); events mirror `start_date` into `end_date` so "is it over"
  reads one column; dates are bare, entity-local in `products.timezone` —
  window arithmetic uses the date-only path in that zone, never the
  viewer's. Programme products span one hour to nine weeks (the landing
  page's stated formats), which is why owed-ness attaches to the final
  session rather than to any lead-time window. There is no stored
  final-session notion: occurrences are computed from the schedule (the
  feed already walks them client-side, and the summaries RPC already
  enumerates finished occurrences server-side, so both can identify the
  last one); session rows materialize lazily and only when they have
  content to hold.
- Product writes go through `create_product`/`update_product` RPCs (not
  table writes); new args are conventionally defaulted; both functions are
  drop/recreated with bodies copied from the current schema.
- Note-carrying documents number four (group feed, assigned-product, admin
  product-groups — three arms — and the voice overlay); the group feed and
  assigned-product rosters are in documented parity and share a row type,
  so they widen together; the admin document feeds no note button and stays
  unwidened. Migration assertion blocks are per-migration and hand-written.
- The group workspace is staff-only by lint rule; the family Creations card
  is a family component. The per-gamer dialog's home is *not* in that zone
  and mounts where gamers render — no gedu-tree imports into it.
- The family product page is one body serving parent/self/gamer via an
  `audience` prop; its contracts are `.strict()` with a doc-comment
  requiring written justification for any new family-visible staff-authored
  field; the page renders from one document, so the card must ride it.
- The per-gamer note is plain text on purpose; creations title/URL likewise
  — no rich-text machinery.

## Left to the implementer (deliberately free)

- Table/RPC/type names; element cap and length caps; the CHECK's exact
  jsonb machinery (including forbidding extra keys).
- Save semantics of the two-write dialog (one save committing changed
  halves vs. per-half), under two constraints: both writes are idempotent
  replaces (retry-safe on partial failure), and the `committing` flag rule
  binds as everywhere.
- Exact roster-row owed marker rendering; the flag's form section; card
  placement/heading/icon on the family page; message namespaces and whether
  the dialog/button components are renamed.
- Draft semantics of the creations editor (mirror the note's seed-on-open,
  never re-seed, cancel-discards rule).
- Accepted, not a gap: a Gedu gets no editor-side signal that an
  unparseable URL will render as plain text on the family side — the direct
  consequence of the no-validation decision.

## Follow-ups (cut from v1 — die with this plan unless the owner keeps one)

- **Portfolio**: an all-groups creations view for gamer and parent ("build
  your portfolio" is already promised in the Roblox landing copy). Would
  reopen the cascade-on-group-delete decision.
- **Roblox API export**: delivering Programme gamers' published-game URLs
  to Roblox, including whatever completeness reporting the contract's API
  wants.
- **URL validation or a domain allowlist**, if trust-the-staff proves
  insufficient.
- **A shared in-group surface** (gamer A sees gamer B's creation), the
  dropped half of the original ask.
- **Displaying creation provenance** (who added it, when) — stored from
  day one, shown nowhere yet.
- **An admin compliance view** (completeness across sponsored products) —
  the dashboard/workspace signals serve the Gedu; if admins need to answer
  to Roblox proactively, that is its own surface.
