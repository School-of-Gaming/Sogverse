# Product tags + promoting the card/detail redesign

## Prerequisite — where the draft code lives

Everything this plan promotes (the `*-draft` components, the tag module and
messages, the preview-art files, the `redesign` scenario, the `flat` and
`renderCard` seams) was built on the scene branch this plan file itself rides
on. **This plan is executable only after that branch has merged to `dev`.**
Execute it on a fresh `feat/` branch cut from the latest `dev` per the standing
branching rule; if the files named here are absent from your base, the scene
branch has not landed yet — stop and say so rather than rebuilding them.

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

Ordered; 1 is the prerequisite for 3–4; 2 blocks nothing (its own rule); 5 and 6
ride behind 4.

### 1. Database: the `product_tag` enum and column

- Migration: create enum type `product_tag` (`neuroinclusive`, `beginner`,
  `advanced`); add nullable `tag product_tag` column to `products`. No new grants (the
  column rides the table's existing ones); no RLS change; no backfill (every existing
  product is legitimately untagged).
- Extend both product-writing RPC paths (create and update — they live in
  `supabase/migrations/` as versioned function definitions) to accept and persist the
  tag, **following the audience-params precedent migration's mechanics** (the one
  that added `p_for_gamers`/`p_for_parents`) — but not its non-defaulted choice:
  - **`p_tag product_tag DEFAULT NULL`, defaulted deliberately.** Codegen types a
    non-defaulted argument as required and non-nullable, so "pass `null` explicitly"
    is not expressible in this codebase — the established pattern is `?? undefined`
    against a `DEFAULT NULL` parameter, and omission is how a null reaches the
    column. The audience flags could afford non-defaulted because a CHECK backstops
    an omitted age; `tag` has no analogous CHECK (null is a legal value), so the
    silent-clear risk is closed at the wire instead: the **update body schema makes
    the field required-nullable**, so the one write path cannot omit it by accident,
    and the route maps `null → undefined → DEFAULT NULL → cleared`, which is the
    intended meaning of null.
  - Adding a parameter changes the function signature, so `CREATE OR REPLACE` would
    create a second overload and break PostgREST's candidate resolution: the migration
    must `DROP FUNCTION` with the full old signature, `CREATE` the new one,
    re-issue the `REVOKE`/`GRANT` pair for both roles, re-`COMMENT`, and keep the
    executable assertion block that precedent migration ends with.
  - Contracts: the tag field joins the shared product-data base schema as
    **required-nullable on both create and update** — structurally where the
    audience booleans live, no create/update asymmetry.
  - Re-verify both functions' classification in the authorization spine (adding a
    parameter does not change the admin-only classification).
- CI db tests: add a tag round-trip case to the update-product suite (the per-session
  fees case is the template), plus a case pinning that an **omitted parameter clears**
  (that is `DEFAULT NULL` doing its job) and that create-then-read preserves the
  value. Fair warning on the create half: **no db test currently calls the create
  RPC at all** (fixtures insert directly through the shared product helper), so
  that case is a new describe with its own UUID sub-range in the helper's registry
  and a full explicit-arguments RPC call — budget it as such, not as "add a case".
- The `docs/products-architecture.md` tags section is written in THIS workstream —
  the column and its rules land here, and the doc must not wait on a later
  workstream that might be deferred.
- Push, regenerate `database.types.ts`, add a `ProductTag` alias in `src/types/index.ts`.
- Rewrite `src/components/public/products/product-tag.ts` to derive from the generated
  `Constants` enum instead of a hand-written union (its header comment already says
  this happens now). The label map keys become exhaustively checked against codegen.
- The zod field derives from `Constants` per the service-layer convention (its shape
  — required-nullable in the shared base — is decided above).
- DB tests run in CI only — push the branch to exercise them.

### 2. Copy finalization (parallel, non-blocking)

- Sonja's "what we do about this tag" source text replaces the placeholder
  `productTagDetail.*` strings wholesale, all five locales, best-effort translated.
  Remove the DRAFT markers when it lands.
- Confirm the fi label ("Neurokirjo" vs "neuroinklusiivinen") with the owner. One
  string either way.
- Code never blocks on this workstream — but **the placeholder explanations are a
  soft gate on promotion going live**: swap in Sonja's text if it has landed by
  workstream 4; shipping the placeholder `productTagDetail.*` copy to real families
  requires the owner's explicit okay in that moment, not this plan's. (The tag
  *labels* are owner-approved and carry no such gate.)

### 3. Admin form: setting the tag

- The create-product form (and edit, which shares its build path in
  `src/components/admin/products/`) gains a tag picker: a four-option radio group —
  None (default) plus the three tags, labeled with the same `productTag.*` strings the
  shop renders, so the admin sees the words the parent will see. The form enumerates
  the three options from `Constants.public.Enums.product_tag` directly — the tag
  module deliberately owns no ordered value list until the filter row lands, and
  the generated enum is the source both will eventually share. It belongs near the
  audience section — same "who is this for" neighborhood; whether it sits inside that
  section or as its own small section after it is the implementer's call.
- New admin copy in all five locales: the field's label, a one-line hint, and the
  "None" option's word (the option labels themselves reuse `productTag.*`).
- The edit form preloads the existing tag from the row like every other field; the
  picker does not participate in the form-lock machinery (a tag is freely editable
  for the product's whole life).
- The tag module's canonical type is the `ProductTag` alias in `src/types/index.ts`
  once codegen produces it; the module under `src/components/public/products/`
  re-exports that alias so existing imports keep working, and one of the two is
  named canonical in its doc (the alias). At this stage the module exports only the
  type, the label-key map and its exhaustiveness check — the value list and guard
  return with the filter row (workstream 6), derived from `Constants`.
- Admin surfaces are desktop-default; no mobile-first treatment needed.
- The admin product detail/row views may show the tag as plain text; no chip styling
  required there (admin panel, not family surface).

### 4. Promotion: the draft bodies become live

The seam-removal checklist. Every item below exists in the code with a comment saying
promotion removes it — grep for the stem **"promot"** (not the full word — three
files say "promoted") under `src/components/public/products/` and
`src/components/preview/` to find them, plus two the grep cannot see: the tag
module's whole "display-side only, no column, no admin field" header (stale the
moment workstreams 1 and 3 land) and the fixtures module's claim that the redesign
scenario "goes when the draft body is promoted" (superseded by the renamed-not-
deleted ruling above — rewrite it, don't obey it). The list here is the map:

- **Card:** the draft card view replaces the live browse card view (delete the old
  view's body; rename the draft files to drop the `-draft` suffix). **The old view
  file is not only the old body** — it owns the shared shell/footer/stretched-link
  machinery, `PriceBlock`, and the view-props/seat-bar/location types that the draft
  imports and every future body needs. Promotion moves that shared machinery into its
  own module (the file's own comments call for exactly this) before the old body is
  deleted; the view-props interface travels with the machinery. The chip components
  (`TagGlyph`, the media-chips treatment, the two filled chips) likewise get a
  non-draft module of their own — they are the product chip vocabulary, used by card,
  hero and tag note. Carry the load-bearing comments (corner exclusivity, the
  never-a-puzzle-piece rule, the accessible-name rule) into the new homes.
  The adapter reads `tag` from the row instead of a prop. The `imageSrc` override
  prop dies; the adapter resolves `image_path` (the truthiness check that treats `""`
  as no-image is already written in the draft adapter — keep it). Delete the
  `renderCard` seam from the browse-results grid and the draft-grid branch from the
  shop scene.
- **Detail-page loading skeleton:** the route's current skeleton mirrors the old
  single-column layout AND carries a comment arguing a skeleton need not mirror the
  final grid — the promotion must engage both, not silently contradict them. Decide
  the loading state from the house three-category model against the gate the page
  *actually* holds: it waits on four queries (product, auth, and two
  customer-scoped reads), not one indexed row, and nothing in the header band is
  route-static on `/shop/[id]` (back link, eyebrow and h1 all derive from the
  product row; only the municipality route has a static back link). So
  "containers at final size" is achievable and "band chrome early" mostly is not.
  Whatever the implementer concludes, the old skeleton and its comment are replaced
  together so the code never argues with itself.
- **Tag null-handling:** the row field is `ProductTag | null`; a `null` must render
  neither chip nor note (an unhandled null must not render an empty note block). The
  precise prop shapes are in the "Tag shapes, decided precisely" item below.
- **The view-props rename, named:** the shared view-props interface's
  `imagePath: string | null` becomes `imageSrc: string | null` (an already-resolved
  URL) — the draft's prop docs already say so; this is where it happens.
- **Vestigial props:** `railFrom2xl` on the overview card **stays a prop** — the card
  has two callers that survive promotion at full width (the purchase-confirmation
  view and the admin product page), so only the detail body passes it; update its
  "no live caller passes it" doc rather than inlining it. `BackLink` stays a shared
  export (its comment currently promises it "goes back to being private", which
  promotion makes false — fix the comment).
- **Tag shapes, decided precisely:** adapter-level inputs (the card adapter's and the
  detail body's `tag`) normalize to `ProductTag | null`; the *views* keep the
  resolved `{ value, label }` shape (renamed off its Draft prefix), preserving the
  adapter-translates rule — the view renders no message keys, and a label cannot be
  paired with the wrong tag's icon. The detail body's `tag`/`imageSrc` props **die**
  at promotion like the card's: the body reads `product.tag` and resolves
  `product.image_path` itself, exactly as its own prop docs predict.
- **The mobile jump-to-signup rides along free** (it is part of the draft body): no
  work, but the scene-description rewrite must cover it, and that description is
  separately stale about the header band (it still says the eyebrow is
  baseline-aligned at the far right; the band is per-column now).
- **Detail:** the draft page body replaces the live one; the live body's `MainColumn`
  wrapper and old masthead go; the scene's draft/live switch goes (one body again).
  The signup panel's `flat` prop is deleted and the flat styling becomes the only
  styling, on live single-column pages too — note the prop threads through three
  files (the panel view, the pricing view, and the preview wrapper), not one.
- **Chips:** the `Draft*` chip components lose the draft naming and get a proper
  module home (they are now the product chip vocabulary, used by card, hero, and tag
  note).
- **Scenes after promotion:** all three shop scenarios render the one (new) card, and
  every detail scenario renders the one (new) body — the scene-side draft/live
  switches go. The `redesign` scenario is **renamed and re-described, not deleted**:
  its grid is the only one carrying tags, demo art, realistic varied names, the long
  Finnish title and the un-imaged-but-tagged card, and the tests pinning those review
  cases survive with it (it becomes the "tagged catalog" showcase). `SHOP_SCENE_DEFAULT`
  stays the gamers-only regression grid and `SHOP_SCENE_AUDIENCES` the audience
  comparison, both with their ` · label` name suffixes and pinned invariants intact.
  The per-scenario tag map folds into the fixture rows (`tag` becomes a real row
  field on the builder); the art map folds into the builder as per-scenario
  `image_path` values. **Accepted side effect, and it covers tags as much as art:**
  the three shop grids share scenarios, so after the fold the default and audience
  grids inherit tags and art too, and every scene fed by the shared builder
  (purchase confirmation, family/gedu product pages, style-guide cards — which
  build from the same fixtures and so inherit their scenarios' tags) shows them as
  well. That is more honest, not less: post-launch, the realistic storefront is a
  mixed grid, and "the ordinary storefront" regression scenario is re-described to
  mean exactly that rather than "no tags anywhere". The test pinning "tags and
  art only on the redesign grid" is a draft-period invariant and **retires at the
  fold** — replace it with one pinning that the untagged case and the wordmark
  fallback each remain represented somewhere on the showcase grid.
  For demo art, make the product-image URL resolver pass through root-relative paths
  (a path starting with `/` is already a servable URL, not a storage object) so
  fixture rows can point `image_path` at `/preview-art/*.svg` and the scenes need no
  image seam at all. Document the pass-through in the resolver itself, and check the
  admin image-picker path (which feeds `next/image`) tolerates it; a real product's
  `image_path` never starts with `/` today and admins are trusted not to hand-craft
  one, so no guard beyond the doc is required. (Alternative considered: keeping a
  scene-only image override prop on the adapter — rejected as a live-API wart serving
  only fixtures.)
- **Style guide:** the UI Components page's browse-card demos render the new view's
  props across its states — it is the reused-component home and must not go stale.
  Note the demos hand-build view props and today pass a raw `imagePath`; the promoted
  view takes a resolved image URL, so the demos resolve it themselves (through the
  same resolver, which the pass-through above makes work for demo art). The demos
  read each scenario's tag **from the fixture row** — the fold has already decided
  it, the demo page iterates every scenario, and a hand-picked tag would let a demo
  card disagree with that scenario's own detail scene, which is exactly what the
  one-map-feeds-both-surfaces rule exists to prevent. All three tags and the
  untagged case appear automatically.
- **Tests:** the preview-scene sweeps and registry pins already cover the redesign
  grid; update them as the scenario names consolidate. The route posture registry is
  untouched (no new routes).

### 5. The 3:2 image sweep

- The sweep is small and enumerable: grepping the thumbnail component's call sites
  finds the purchase-confirmation view (family-facing — **in scope**, adopts the 3:2
  crop), the old detail masthead (dies with promotion), the two browse-card views
  (already 3:2 after promotion), and two admin product surfaces (**stay square** —
  dense admin rows want a small thumb, and admin is not the design language's
  audience). The confirmation page's exact geometry (today a 64px square inline
  beside the summary text; a 3:2 crop reshapes that row) is not pre-decided here:
  judge it in the existing `/preview/confirmation/*` scenes before landing, the
  same way every other layout call on this feature was made.
- **The banner/cover treatment must be built, not selected**: the shared thumbnail
  component is square-only and letterboxes (`object-contain`-style fitting, no crop);
  only its wordmark fallback has a banner variant. Give it (or a sibling) a 3:2
  `object-cover` presentation and use that on the in-scope surface — the card and
  hero already carry their own markup for it. The no-image branch must plumb the
  banner-variant fallback too: the confirmation page passes an empty path when a
  product has no picture, and today the component hardcodes the square wordmark
  there.
- The admin image upload control previews the image inside a 3:2 `object-cover` frame
  at upload time — the crop, not the whole file letterboxed — so what the admin
  approves is what the card shows. Keeping a secondary full-image view beside it is
  the implementer's call. Communicate the 3:2 guidance to the product team (owner
  handles).

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
  new design with zero scene-only seams left: grep for "promotion" under
  `src/components/public/products` and `src/components/preview` and confirm by eye
  that every remaining match is a standing architectural rule (the scene registry's
  one-body-two-shells doc keeps the word permanently) rather than a pending-removal
  marker. A tagged product on `/schools/[slug]/[id]` shows the chip and the tag note
  like any other detail page — the note is content, not a filter, so the
  municipality-page filter-row exemption does not apply to it.
- The preview scenes render the same bodies as the live routes (one body per surface),
  with demo art flowing through ordinary image resolution.
- All gates green: lint (zero warnings), type-check, unit+integration suites,
  check-translations, and CI's DB tests against the pushed migration.
- The settled rules this plan records (chip-equals-tag identity, corner exclusivity,
  never-the-puzzle-piece, border-means-interactive, the 3:2 single-crop model) survive
  the plan's deletion: carried as comments into the renamed modules, plus a short
  tags section in `docs/products-architecture.md` written during workstream 1 (the
  contradiction some earlier drafts had — "during workstream 4" — is resolved in
  favor of 1, which carries the reason: the doc must not wait on a workstream that
  might be deferred). That doc section also receives **workstream 6's settled
  filter-row design** under its deferred-work conventions, so deleting this plan
  file does not delete the one place that design is recorded.
- This plan file is deleted in the change that completes workstream 4 (or the last
  workstream built), per `docs/plans/` lifecycle.
