# Product tags + promoting the card/detail redesign

## Problem

Two halves of one feature are designed, fixture-proven, and not yet real:

1. **Product tags.** Parents browsing the shop cannot tell who a product is designed
   for beyond an age range — a club for children who have never played, one for advanced
   builders, and one designed around neurodivergent kids all look identical on the grid.
   The tag vocabulary (`neuroinclusive` / `beginner` / `advanced`) exists in the code as
   a display-only type with localized labels and explanation copy, but there is no
   database column, no admin control to set a tag, and therefore no real product can
   carry one.
2. **The redesigned browse card and product detail page.** A full draft redesign —
   media-top card with corner chips, three-track detail page (facts rail / reading
   column / sticky signup rail), header band, flattened signup panel — was built and
   owner-approved in the preview scenes (`/preview/shop/redesign` and the tagged
   `/preview/products/*` scenarios), but the live `/shop`, `/schools/*` and
   `/shop/[id]` routes still render the old design. The draft is deliberately fenced
   off behind scene-only seams that must be removed by promotion, not shipped.

Until both land, the scene work is a fork waiting to rot: every change to the live
card or detail page has to be made twice, and the tag chips advertise data that cannot
exist.

## Scale

Every family-facing browse and purchase surface: the shop grid, the per-municipality
school pages, every product detail page, and the purchase confirmation page. The tag
column additionally touches the admin product create/edit flow and both product RPC
paths. This is the primary conversion path of the product — the pages a parent meets
between "heard about SOG" and "paid".

## The decision

- **One optional tag per product**, from a fixed Postgres enum of exactly three values:
  `neuroinclusive`, `beginner`, `advanced`. Nullable column on `products`; null means
  untagged and renders nothing (like the gamers-only audience renders no badge).
- **The draft bodies become the live bodies.** The draft browse card view replaces the
  live card view; the draft detail page body replaces the live one. Promotion is a
  rename-and-rewire, not a redesign — the scenes have already settled the design.
- **The flat, border-means-interactive signup panel becomes the only panel look.**
  Participant rows, the rules box and add-a-child keep borders because they are
  clickable; the pricing section has none because it is information. The opt-in `flat`
  prop is deleted, not defaulted.
- **Product images are 3:2 everywhere.** The stored image stays a single file; every
  surface crops it to its own display box with `object-cover`. The admin upload flow
  gains a 3:2 preview so the product team shoots for the frame the card actually shows.
- **Tag labels** (already in `messages/`): en "Neuroinclusive", fi "Neurokirjo",
  sv "Neuroinkluderande", fr "Neuro-inclusif", tlh in-character. The per-tag
  explanation copy under `productTagDetail.*` is a placeholder **replaced wholesale by
  the product owner's (Sonja's) source text** — marked as such in the module that owns
  the namespace.

## Rejected alternatives — do not rebuild these

- **Multiple tags per product / a join table.** Rejected by the owner for v1: the card
  has one chip slot, and "Beginner + Advanced" is incoherent. The single nullable enum
  column *is* the design, not a shortcut. If a second axis ever appears (skill level
  vs. support need — the fault line inside the current three), it arrives as a second
  column, not as N-tags.
- **"Neurodivergent-friendly" as the label.** Rejected by the product owner: the
  "-friendly" suffix implies every unlabeled club is unfriendly. "Neuroinclusive"
  states the design property without ranking the rest of the catalog. Finnish went
  through "nepsy" → "Neurokirjo" on the same reasoning; if the owner re-rules the fi
  label it is a one-string change in `messages/fi.json`, nothing structural.
- **The puzzle-piece icon for the neuroinclusive tag.** Never, under any circumstance —
  it is a contested symbol in the neurodivergent community. The icon map (Brain /
  Sprout / Rocket) carries a comment saying so; keep the comment.
- **A computed-tag mechanism** ("New", "Popular", "Filling fast"). Different lifecycle,
  different mechanism, and capacity information on browse cards is banned by an
  existing owner ruling (the muni seat bar is the sole exception). Out of scope
  permanently, not deferred.
- **Vertically centering the detail masthead text, and a full-width hero banner.** Both
  tried in the scenes and rejected (a title must be top-aligned; a 5xl-wide 3:2 banner
  stands ~680px tall and pushes the title below the fold). The three-track layout with
  the header band is the settled answer.
- **A per-viewport mobile/desktop fork of the card.** One DOM, responsive classes —
  the built draft already proves it.

## Constraints discovered while deciding

- **Chip-equals-tag identity:** a filter chip (when the filter ships) must match
  exactly the products wearing that tag, and untagged products answer only to an empty
  filter row. This is the audience row's established semantics; the audience module in
  `src/components/public/products/` documents the pattern and the tag filter copies it.
- **The card's corner exclusivity rule:** the top-right chip is the audience badge when
  there is one, otherwise the age range — never both. The detail hero shares the same
  resolution so card and page cannot show different halves of the pair.
- **Accessible-name rule:** the card is a single stretched link whose accessible name
  leads with the visible CTA word (WCAG 2.5.3). The shared shell/footer/link machinery
  enforces it structurally; promotion must keep card and any future variants on that
  shared machinery, never copies.
- **Schedule no-wrap tokens** in the overview card split on the `" · "` separator the
  shared schedule formatter writes. If the formatter's separator ever changes, the
  tokenization must change with it (the render site carries a comment).
- **`public/preview-art/` is world-readable** regardless of the preview scenes'
  admin gate — static assets bypass the proxy matcher. Nothing resembling family data
  may ever go in that directory.
- **Accepted layout tolerances**, already signed off: the reading column sits a
  constant 32px left of true center at ≥2xl (half the rails' width difference); the
  Finnish "Jo ilmoittautunut" label overruns the flattened participant row by ~4px at
  the narrowest rail and wraps the name group slightly; browse-grid rows grow with a
  wrapping long title (no reserved title height — reserved dead space was rejected).
- **Migration discipline** (see `supabase/CLAUDE.md`): push before regenerating types,
  never hand-edit `database.types.ts`, check remote migration history before numbering.
  Modified product RPCs must remain correctly classified in the DB test suite's
  authorization spine.

## Workstreams

Ordered; 1–2 are prerequisites for 3–4; 5 and 6 ride behind 4.

### 1. Database: the `product_tag` enum and column

- Migration: create enum type `product_tag` (`neuroinclusive`, `beginner`,
  `advanced`); add nullable `tag product_tag` column to `products`. No new grants (the
  column rides the table's existing ones); no RLS change; no backfill (every existing
  product is legitimately untagged).
- Extend both product-writing RPC paths (create and update — they live in
  `supabase/migrations/` as versioned function definitions) to accept and persist the
  optional tag. Re-verify their classification in the authorization spine.
- Push, regenerate `database.types.ts`, add a `ProductTag` alias in `src/types/index.ts`.
- Rewrite `src/components/public/products/product-tag.ts` to derive from the generated
  `Constants` enum instead of a hand-written union (its header comment already says
  this happens now). The label map keys become exhaustively checked against codegen.
- Contracts: the admin product body schemas in the relevant `*.contracts.ts` gain the
  optional tag, derived from `Constants` per the service-layer convention.
- DB tests run in CI only — push the branch to exercise them.

### 2. Copy finalization (parallel, non-blocking)

- Sonja's "what we do about this tag" source text replaces the placeholder
  `productTagDetail.*` strings wholesale, all five locales, best-effort translated.
  Remove the DRAFT markers when it lands.
- Confirm the fi label ("Neurokirjo" vs "neuroinklusiivinen") with the owner. One
  string either way.
- Code never blocks on this workstream; the placeholders are shippable.

### 3. Admin form: setting the tag

- The create-product form (and edit, which shares its build path in
  `src/components/admin/products/`) gains a tag picker: a four-option radio group —
  None (default) plus the three tags, labeled with the same `productTag.*` strings the
  shop renders, so the admin sees the words the parent will see. It belongs near the
  audience section — same "who is this for" neighborhood.
- Admin surfaces are desktop-default; no mobile-first treatment needed.
- The admin product detail/row views may show the tag as plain text; no chip styling
  required there (admin panel, not family surface).

### 4. Promotion: the draft bodies become live

The seam-removal checklist. Every item below exists in the code with a comment saying
promotion removes it — grep for "promotion" under `src/components/public/products/`
and `src/components/preview/` to find them all; the list here is the map:

- **Card:** the draft card view replaces the live browse card view (delete the old
  view; rename the draft files to drop the `-draft` suffix). The adapter reads `tag`
  from the row instead of a prop. The `imageSrc` override prop dies; the adapter
  resolves `image_path` (the truthiness check that treats `""` as no-image is already
  written in the draft adapter — keep it). Delete the `renderCard` seam from the
  browse-results grid and the draft-grid branch from the shop scene.
- **Detail:** the draft page body replaces the live one; the live body's `MainColumn`
  wrapper and old masthead go; the scene's draft/live switch goes (one body again).
  The signup panel's `flat` prop is deleted and the flat styling becomes the only
  styling, on live single-column pages too.
- **Chips:** the `Draft*` chip components lose the draft naming and get a proper
  module home (they are now the product chip vocabulary, used by card, hero, and tag
  note).
- **Scenes after promotion:** the `redesign` scenario dissolves — the default shop
  scenario now shows the (new) live card, and the tagged detail scenarios show the
  (new) live body. Fixture rows carry `tag` as a real row field, replacing the
  scene-side per-scenario tag map. For demo art, make the product-image URL resolver
  pass through root-relative paths (a path starting with `/` is already a servable
  URL, not a storage object) so fixture rows can point `image_path` at
  `/preview-art/*.svg` and the scenes need no image seam at all. (Alternative
  considered: keeping a scene-only image override prop on the adapter — rejected as a
  live-API wart serving only fixtures.)
- **Style guide:** the UI Components page's browse-card demos render the new view's
  props (tag, image) across its states — it is the reused-component home and must not
  go stale.
- **Tests:** the preview-scene sweeps and registry pins already cover the redesign
  grid; update them as the scenario names consolidate. The route posture registry is
  untouched (no new routes).

### 5. The 3:2 image sweep

- Purchase confirmation and any other family-facing surface showing a product image
  adopt the 3:2 crop treatment (`object-cover` against the stored image; the shared
  thumbnail component already has square/banner variants — banner where the new design
  language applies, square only where a small avatar-like thumb is genuinely right,
  e.g. dense admin rows).
- The admin image upload control previews the image inside a 3:2 frame at upload time,
  so what the admin approves is what the card crops to. Communicate the 3:2 guidance
  to the product team (owner handles).

### 6. Shop filter row for tags — GATED, build only on explicit owner go

Deliberately deferred: the product owner's call is that a filter row earns its place
only once the tagged catalog is wide enough to need narrowing. The design is settled
so it must not be relitigated when greenlit: a chip row following the audience row's
exact pattern — chip equals tag, OR semantics across selected chips, untagged products
match only an empty row, labels are the same `productTag.*` strings the cards wear,
and the row hides on surfaces that hide the audience row (municipality pages). Restore
the tag-list/guard exports to the tag module from the generated enum when this lands
(they were deliberately dropped while caller-less).

## Acceptance criteria

- An admin can tag a product at creation or edit; the tag appears as the primary-fill
  corner chip on the live shop card, on the detail hero, and as the explanation block
  under the short description — and none of those render for an untagged product.
- Live `/shop`, `/schools/[slug]`, `/shop/[id]` and the confirmation page render the
  new design with zero scene-only seams left (`grep -ri "promotion" src/components/public/products src/components/preview` finds no pending-removal comments).
- The preview scenes render the same bodies as the live routes (one body per surface),
  with demo art flowing through ordinary image resolution.
- All gates green: lint (zero warnings), type-check, unit+integration suites,
  check-translations, and CI's DB tests against the pushed migration.
- This plan file is deleted in the change that completes workstream 4 (or the last
  workstream built), per `docs/plans/` lifecycle.
