# Products v2 Architecture

The next-generation product system covering four product types — consumer clubs, municipality clubs, camps, events — as a single, unified shape. Admin creation/list UI and parent-facing browse pages have shipped; customer enrollment and gamer surfaces ship in later phases.

For the design rationale, see `docs/products-redesign.md`. This doc covers what's built today and where it's headed.

## What ships today

**Admin (created on `feat/products-v2-mock-port`):**

- DB foundation: `products_v2`, `topics_v2`, `tags_v2`, translation child tables (`product_translations_v2`, `topic_translations_v2`, `tag_translations_v2`), holiday calendars, schedule slots, prices, groups, and the `site_details_v2` / `site_staff_details_v2` split for location extension data.
- Admin creation UI for all four product types at `/admin/{consumer-clubs,municipality-clubs,camps,events}/new`, sharing one form with type-specific config (`product-v2-type-config.ts`).
- Admin list pages for the same four types.
- Server-side `create_product_v2` RPC plus inline-create routes for tags, topics, locations, FX rates, and site notes.
- Effective-status derivation (TS + SQL twin) — `pending → running → completed` is computed at read time from stored facts, not driven by cron.

**Parent browse (created on `feat/products-v2-browse-pages`):**

- Public browse pages at `/clubs`, `/camps`, `/events` (consolidates consumer + municipality enrollment under `/clubs`; muni gets no browse landing per redesign §7.3).
- Filter chips by topic and tag (URL-driven via `useBrowseFilters` so deep-links work).
- Browse + purchased card pair, each split into a presentational **View** and a thin data **adapter** so every card state can be rendered by hand on `/admin/ui-components` without forging a full DB row.
- Parent-voice **registration pill** that only surfaces when there's something actionable to say ("Only 2 spots left", "Need 3 more to start", "Full — waitlist open", "Opens 15 May", "Already started", "Ended"). Default-open carries no pill.
- `deriveRegistrationState` — pure function that maps a product to a discriminated state union, with 16 unit tests covering the decision tree and the today-vs-future degradation when `participations_v2` ships.
- "Your enrolled" mock section gated behind `?mock=1` for design review of the unified-management surface; deleted when real participation rows land.

## Component map

```
Pages (admin only)
├── /admin/{consumer-clubs,municipality-clubs,camps,events}        → ProductV2ListPage (productType discriminator)
└── /admin/{consumer-clubs,municipality-clubs,camps,events}/new    → NewProductV2Page

Form (src/components/admin/products-v2/)
├── product-v2-form.tsx              — Shell: section wrappers, submit, mutation, navigation
├── product-v2-form-state.ts         — Form state shape, defaults, reducers
├── product-v2-build.ts              — Form state → RPC payload (the transformation pipeline)
├── product-v2-type-config.ts        — Per-type field availability, scheduling shape, pricing shape
├── effective-status.ts              — Derived status helper (TS twin of SQL effective_status_v2())
└── sections/
    ├── identity-section.tsx         — Name/description per locale, topic, image, tags
    ├── audience-section.tsx         — Age range, spoken languages, group seat count
    ├── when-section.tsx             — Start/end date, schedule slots, holiday calendars
    ├── where-section.tsx            — Location picker (site or jurisdiction depending on type)
    ├── billing-section.tsx          — Pricing block, FX auto-fill, refund policy
    ├── registration-section.tsx     — Registration opens at (immediate vs scheduled)
    ├── groups-section.tsx           — Inline group + gedu setup
    └── visibility-section.tsx       — Status, is_visible toggle

Shared building blocks
├── form-primitives.tsx              — Section, Field, etc.
├── pricing-block.tsx + pricing-block-fx.ts — Currency tabs, FX auto-fill logic
├── price-previews.tsx               — Per-currency rendered price summary
├── location-picker-v2.tsx           — Country-aware hierarchy + inline create
├── gedu-picker-sheet-v2.tsx         — Searchable Sheet for gedu assignment
├── image-picker-v2.tsx              — Upload + preview
├── holiday-calendar-option.tsx      — Calendar checkbox row
├── schedule-slots-editor.tsx        — Weekday + time-range editor
├── site-notes-editor.tsx            — Member-visible vs staff-only notes
├── product-type-info-card.tsx       — Type-specific helper card on list pages
└── group-card.tsx                   — Group preview within form

API routes (admin-only)
├── /api/admin/products-v2/create    — Calls create_product_v2 RPC, then updates image_path
├── /api/admin/locations/create      — Inline create from location picker
├── /api/admin/locations/[id]        — PATCH name only
├── /api/admin/topics-v2/create      — Inline create + single-locale translation
├── /api/admin/tags-v2/create        — Inline create + single-locale translation
├── /api/admin/site-notes-v2         — Upsert site_details_v2 / site_staff_details_v2
└── /api/admin/fx-rates              — Proxies frankfurter.dev (cached 6h via fetch data cache)

Services (src/services/products-v2/)
├── products-v2.service.ts           — Read methods (listByType); write goes through API routes
├── products-v2.queries.ts           — useProductsV2ByType, useCreateProductV2
├── reference-data.queries.ts        — useTopicsV2, useTagsV2, useHolidayCalendarsV2, etc.
└── fx.queries.ts                    — useFxRates (calls /api/admin/fx-rates)

i18n
└── src/lib/i18n/resolve-translation.ts — user_locale → en → fi → first available
```

## Translation rules

Per-locale child tables hold user-visible text. The parent rows hold only structural data.

- **Resolver fallback chain:** `user locale → en → fi → first available` (`src/lib/i18n/resolve-translation.ts`).
- **Products must keep ≥1 of (en, fi)** at all times. Enforced by `create_product_v2` payload validation and a `BEFORE DELETE` trigger on `product_translations_v2`. **Gap today:** an `UPDATE OF locale` (e.g. flipping `'en'` → `'sv'`) is not guarded — see Future improvements below.
- **Topics and tags are not subject to the en/fi rule** — they're shared reference data and may exist in only one locale at first. Inline-create from the product form writes a single translation in the admin's current UI locale.
- **Sending all available translations to the client is intentional** — payloads stay small (max 4 locales × 2 short fields), and a future "view this product in another language" UI is trivial.

## Status vs. visibility

These are **two orthogonal concepts** even though they look related at a glance.

- **`is_visible`** — should parents see this product on browse pages? Pure UX gate. Toggleable at any time.
- **`status`** — what lifecycle state is the product in? `draft`, `pending`, `cancelled`, or the `running` override (with `completed` and `expired` derived from dates).

A product can be in any combination **except one**: a `draft` product must always be hidden. Published-to-parents and incomplete are mutually exclusive — if it's visible, it's no longer a draft. Enforced at the DB by `chk_products_v2_draft_implies_hidden` (migration 00036). The other combinations are all valid: `pending + visible` (the normal published state), `pending + hidden` (complete but the admin is staging), `cancelled + visible` (still listed with an "Ended" treatment), and so on.

### What `draft` means

`draft` means *the product's mandatory fields are not yet filled in*. Not "hidden", not "unpublished" — **incomplete**. The schema honors this by giving `draft` rows escape hatches on the constraints that require `end_date`, `registration_opens_at`, etc., so an admin can save a half-finished sketch and come back to it.

**`draft` is reserved, not active today.** The current admin create form runs full `validate()` before submitting, so it only ever produces fully-populated rows. It emits `status: "pending"` unconditionally — visibility is the sole knob it exposes. No row created via the UI today should land in `draft`. The state stays in the schema for a future "Save as draft" admin action that deliberately bypasses validation.

The list page reflects this contract: when the future flow lands, a `draft` row will be implicitly hidden (you wouldn't expose an incomplete product to parents), and the list UI suppresses the redundant "Hidden" pill on rows whose status is `draft`. So a draft row reads as "Draft" only; a non-draft hidden row reads as "Hidden" only.

History: prior to migration `00035_decouple_draft_from_hidden.sql`, the form tied `is_visible = false` to `status = 'draft'`. That conflation made every hidden product look like an incomplete draft in the admin list. The form was changed to always emit `pending`, existing rows were re-aligned, and the dual semantics were preserved for the future flow.

## Effective status

`status` stores admin-driven facts only — `draft`, `pending`, `cancelled`, and the `running` override. `pending → running → completed` are derived at read time from stored facts plus `now()`:

- `pending` → `running` when `start_date` has been reached AND any `signup_threshold` is met.
- `running` (stored or derived) → `completed` once `end_date` has passed.

The TS helper (`effective-status.ts`) and the SQL function `effective_status_v2(product_id)` share the same rule. The SQL form is what RLS / list queries call when filtering by effective state.

## Site location split

Site-specific fields live in two extension tables, not on `locations` itself:

- `site_details_v2` — public, member-visible (address, parking, wifi, opening hours).
- `site_staff_details_v2` — admin + Gedu only (gate codes, back-entrance directions, ops notes).

Splitting by visibility tier keeps RLS clean (row-level, not column-level).

The `locations` table itself (just the name + type + parent chain) is anon-readable as of migration `00037_locations_anon_read.sql` so the parent-facing browse and detail pages can render "Tapiolan koulu, Espoo" before sign-in. `site_details_v2` and `site_staff_details_v2` keep their own (existing) policies; making the bare hierarchy public doesn't expose addresses or staff notes.

### Schema invariants enforced by `validate_products_v2_location`

| Variant | `location_id` | Required `locations.type` |
|---|---|---|
| In-person (any product type) | required | `site` |
| Online + `municipality_club` | required | `country` / `region` / `municipality` (NOT `site`) |
| Online + non-muni | must be NULL | — |

The browse list / detail queries join `locations(id, name, type, parent:locations!parent_id(id, name, type))` — exactly one parent level. The detail page renders `"{site}, {parent}"` for in-person and `"{muni}"` for online muni clubs. The browse card shows `{site}` only (no parent — saves the row width) and a generic "Online" label for the online non-muni case so every card carries the same meta line. The parallel structure keeps card heights stable across formats.

## Parent browse surfaces

### Routes

- `/clubs` — consumer + municipality enrollment surface. Browse grid is consumer-club only; an enrolled muni club shows up in the "your enrolled" section above the grid (see `?mock=1` below) so a parent who registered through their city sees one unified list.
- `/camps` — single-type browse + enrolled section.
- `/events` — single-type browse + enrolled section.

### Component map

```
src/components/public/products-v2/
├── product-browse-page.tsx           — Page orchestrator: heading, filters, "your enrolled" section, browse grid, empty states
├── product-browse-filters.tsx        — Topic / tag / format chips + clear-all
├── product-browse-card.tsx           — Browse-card adapter: ProductV2BrowseRow → display props
├── product-browse-card-view.tsx      — Browse-card View: pure-presentational
├── product-purchased-card.tsx        — Purchased-card adapter
├── product-purchased-card-view.tsx   — Purchased-card View
├── registration-pill.tsx             — RegistrationPill (outline chip) + useRegistrationCta hook
├── derive-registration-state.ts      — Pure state-machine: product + now + participation count → RegistrationState
├── format-product-schedule.ts        — Pure schedule formatter (every weekday / range / single)
├── format-product-price.ts           — Pure price formatter (free / external / bundle_or_sub / upfront)
├── format-product-location.ts        — Pure location formatter (site+parent / muni / null)
├── filter-products.ts                — Pure topic / tag / format filter
├── use-browse-filters.ts             — URL-backed filter state (deep-linkable)
└── mock-purchased.ts                 — Hand-curated rows for the ?mock=1 section
```

### View + adapter split

Each card is two files. The **View** takes already-resolved display props (strings, numbers, the registration state) and is pure presentational. The **adapter** of the same name resolves a `ProductV2BrowseRow` (or future participation row) into those props — locale, currency, schedule, price, registration state, tag labels.

Why: the UI Components style guide at `/admin/ui-components` renders every card state by hand for design review. With a single combined component, you'd need to forge a full `ProductV2BrowseRow` (joined topic translations, tag translations, prices array, schedule slots) for each variant. The split lets the demo pass a half-dozen plain strings instead.

### Registration pill (parent voice, only when notable)

`RegistrationPill` only renders when there's something **actionable or urgency-creating** to say. Default-open (plenty of seats, sign-ups open) returns `null` — the Sign-up button alone already says everything a parent needs.

| State (from `deriveRegistrationState`) | Renders | Pill copy |
|---|---|---|
| `open` with `seatsLeft` ≤ 3 | yes | "Only N spots left" |
| `open` with more headroom | **no** | (Sign-up button does the talking) |
| `pending_thr` | yes | "Need N more to start" |
| `full_waitlist` | yes | "Full — waitlist open" |
| `full_closed` | yes | "Full" |
| `closed_pre` | yes | "Opens 15 May" |
| `running_late` | yes | "Already started" |
| `ended` | yes | "Ended" |

Visual treatment is a small rounded outline chip with a tinted state icon. The dot/filled treatments were prototyped on `/admin/ui-components` for design review and removed once the outline was chosen.

`useRegistrationCta(state)` returns matching `{ kind, labelText }` for the card's CTA — primary "Sign up" for actionable states, secondary "Join waitlist" for `full_waitlist`, disabled "Full" / "Opens 15 May", or `null` to hide the CTA entirely (`running_late`, `ended`).

### `deriveRegistrationState` decision tree

Top-down, first match wins. Lives in `derive-registration-state.ts` alongside the format helpers — same shape as `formatProductSchedule` / `formatProductPrice`.

```
ended         ← effectiveStatus in { completed, expired, cancelled }
closed_pre    ← registration_opens_at > now
running_late  ← effectiveStatus = running AND product_type in { camp, event }
pending_thr   ← raw status = pending AND signup_threshold IS NOT NULL
                  AND participations_count < signup_threshold
full_waitlist ← seat_count IS NOT NULL
                  AND participations_count >= seat_count
                  AND waitlist_enabled
full_closed   ← seat_count IS NOT NULL
                  AND participations_count >= seat_count
                  AND NOT waitlist_enabled
open          ← otherwise (carries seatCount + seatsLeft + waitlistEnabled)
```

Muni clubs are intentionally not modelled — they don't get a browse page and their purchased card uses the verb badge + hidden "Manage payment" button to convey "registered through your city". No status pill.

### Today-vs-future degradation

`participations_v2` hasn't shipped. Every adapter passes `participationsCount: 0` to the deriver today. Consequences:

- `pending_thr` shows "Need N more to start" with N == threshold (no progress). Once participations are live, it'll show the real remaining count.
- `full_*` never selected (count is always 0).
- `open` reports `seatsLeft = seat_count` (no real consumption yet), so the urgency pill ("Only 2 spots left") is currently driven by admin-set caps, not real signups.

The same pill component covers both eras — when the real count goes live, the richer states light up automatically.

### RLS / effectiveStatus interplay

RLS only returns `pending` and `running` rows to anon/customer. `completed` is hidden at the DB. The browse card still renders the "Ended" pill because `effectiveStatus()` catches `running` rows whose `end_date` has passed (cron lag between the wall clock crossing midnight and a `running → completed` flip). Do **not** add `completed` to the service filter — see the comment in `products-v2.service.ts:listVisibleByType`.

## Parent detail page

### Routes

- `/clubs/[id]` — both consumer-club and municipality-club rows render here. Consumer clubs reach this from `/clubs`; muni clubs reach it via the future `/registration` location-first entry point (out of scope for this PR but the body is reusable as-is).
- `/camps/[id]` — camp detail.
- `/events/[id]` — event detail.

### Component map

```
src/components/public/products-v2/  (detail-page additions)
├── product-detail-page.tsx          — Route adapter: fetches, resolves auth, derives state
├── product-detail-page-body.tsx     — Page body: hero, layout, calendar card, signup-panel slot
├── signup-panel.tsx                 — Adapter: form state (gamer / agreed / pricing)
├── signup-panel-view.tsx            — View: per-state panel + auth overlays
├── pricing-panel-view.tsx           — Two-track stacked list (Subscribe / Pay-as-you-go)
├── pricing-options.ts               — Pure builder for pricing tracks + options
├── countdown-clock.tsx              — Live ticking clock + useCountdownDone()
└── mock-detail-fixtures.ts          — buildDetailFixture(type, state) for the preview route

src/components/calendar/             (new shared primitive)
├── compute-product-sessions.ts      — Pure: walks the term, marks holidays as skips
├── session-calendar-view.tsx        — Pure: stacked mini-month grids
└── product-session-calendar.tsx     — Adapter: project → SessionCalendarView

src/app/(public)/preview/products-v2/[type]/[state]/
├── page.tsx                         — Public sandbox route, fixture-only, robots: noindex
└── preview-client.tsx               — Client child rendering the body with the fixture
```

### Layout

Hero is a 1:1 product image (reuses `ProductThumbnail`) plus the type label, name, and tagline. The two-column body stacks below: the left column carries description, when-and-where, the session calendar, and the topics/tags card; the right column is a 380px sticky signup panel on desktop that drops below the main column on mobile. **No gedu surface on the parent detail page** — gedu / group identity is a SOG-internal concern and abstracted away from parents.

### Pricing — two-track stacked list

Consumer clubs render six rows: three subscriptions (monthly / quarterly / yearly with the `SUBSCRIPTION_DISCOUNTS` ladder) and three bundles (1 / 4 / 10 sessions with the `BUNDLE_DISCOUNTS` ladder). The default selection is **quarterly** — middle of the commitment ladder, a clear improvement over monthly without asking for a 12-month commitment. Selecting a row updates the CTA label so the action and the price live in the same eyeline.

Camps, events, and the rare paid muni rows show a single price line (upfront total). Free / external_contract products show a single non-clickable hint row.

Family-discount UI is intentionally **not** shipped here — there's nothing to wire up yet. When the family-subscription Stripe coupon work lands, surface "Save another 10% with 2+ kids" as a small note below the picker.

### Signup-panel registration states

The same `deriveRegistrationState` that powers browse cards drives the panel:

| State | Panel shape | CTA |
|---|---|---|
| `closed_pre` | Live countdown clock + the form pre-fillable | Disabled "{verb} — not yet open"; flips to active at zero without remounting the form |
| `open` | Optional almost-full warning banner when `seatsLeft ≤ 3`; seat-counter bar | Active "{verb} now → · €X" with the chosen price |
| `pending_thr` | Threshold progress bar + reserve-a-spot copy | "Reserve a spot" |
| `full_waitlist` | "How the waitlist works" explainer | Secondary "Join the waitlist" |
| `full_closed` | Pricing visible but disabled | Disabled "Fully booked" |
| `running_late` | "Already underway" muted note, no form | — |
| `ended` | "This one wrapped" muted note, no form | — |

Auth overlays sit on top: unauthenticated visitors see the panel info but the form area shows a "Sign in to register" / "Create account" pair (with `?redirect=...` back to this page). Customers with no gamers see "Add a child first" linking to `/parent/gamers`. Non-customer roles see an explainer note instead of the form.

### Preview / mock route

`/preview/products-v2/[type]/[state]` renders the body with a `buildDetailFixture(type, state)` payload. Public route inside `(public)` so it picks up the parent-eye chrome (header + footer) instead of the admin sidebar; never indexed (`metadata.robots = { index: false, follow: false }`); reachable only via `/admin/ui-components` "Preview full page →" links. Designers can poke at all 32 (type × state) cells without seeding any data.

### Click target — UI-only phase

The active CTA is a no-op for now. When Stripe Checkout wires up, the same handler will redirect to a Checkout Session created with the parent's selected pricing key + selected gamer.

### Future improvements (detail-page surfaces)

- **Admin-cancel-session UI.** `session_overrides_v2` is designed but not shipped. When it lands, extend `computeProductSessions` to merge those rows into `skips` — the calendar View needs no change.
- **Show family discount.** Surface a "Save another 10% with 2+ kids" note below the pricing picker once the family-subscription Stripe coupon ships.
- **Image hero + lightbox.** Today the image renders as a 1:1 thumbnail in the hero. A future "tap to enlarge" wouldn't break the layout.
- **Real participation counts.** The panel reads `participationsCount: 0` until `participations_v2` ships. The deriver auto-promotes to richer states (`pending_thr` with real progress, `full_*`, urgent-low-seats) the moment that wires up.

### `?mock=1` purchased section

The "your enrolled" surface above the browse grid is gated behind `?mock=1` until participation rows are live. Mock data lives in `mock-purchased.ts` — five hand-curated rows with stable identicon seeds. Real visitors never see it; design review hits e.g. `/clubs?mock=1` to inspect the unified-management surface alongside the live browse grid. Delete `mock-purchased.ts` and replace its consumers with a real `useMyParticipations` hook when participations land.

### Filter UX

Filter chips are URL-driven via `useBrowseFilters` — deep-links like `/clubs?topic=minecraft&tag=creative&format=in_person` reproduce a filter state. `filterProducts` is a pure function over `(rows, { topics, tags, format })`. Empty state distinguishes "nothing matches your filters" from "no products in this category yet".

- **Topic / tag** — multi-select, slug-based, OR-within-row + AND-across-rows.
- **Format** — single-select, `online` / `in_person`, maps directly to `products_v2.is_remote`. Toggling the active chip clears the filter.

The result count was removed from the meta row: the visible card grid already conveys it at a glance, and pairing the count with the conditional Clear button caused the row's height to jump when the button appeared. Clear is now always rendered (`invisible` when there's nothing to clear) so the row's box height is constant.

### Style guide / design review surface

Every browse + purchased card state is rendered on `/admin/ui-components` under "Products v2 — Browse & Purchased Cards". The page imports the `*View` components directly so every state is exercised without faking DB rows. CLAUDE.md's "Reference this page before creating new UI patterns" rule applies — when adding a new state, also add it to the demo so design review can see it.

### Non-obvious gotchas

- **`useTranslations` types don't cross function boundaries.** Helper functions that take `ReturnType<typeof useTranslations<"productBrowse.card">>` as a parameter trip TS2589 ("excessively deep") on this path. The pattern: closure-bind `t` inside the component and write small literal-key dispatcher helpers (see `headingFor` in `product-browse-page.tsx`, `decorationFor` in `registration-pill.tsx`).
- **Lucide icons must not be aliased to a local variable in render.** `react-hooks/static-components` flags `const Icon = iconFor(state)` as dynamic component creation. Wrap the switch in a tiny component (`<StateIcon state={state} className=... />`) instead — the className flows through as a JSX attribute, which the i18n literal-string rule allows-lists.
- **The View shouldn't depend on the currency provider.** Currency lookup happens in the adapter; the View receives an already-formatted `ProductPriceLine`. Same rule for locale-aware date formatting on `closed_pre.opensAt` — the Pill formats it with `useFormatter` since the pill itself is locale-aware, but anything else handed to the View should be pre-formatted.

## Future improvements

These are known gaps tracked here so they aren't lost. None are blocking the current admin-only flow.

### Extend `site_details_v2` read policy to purchasing customers

Migration `00038_site_details_restrict_to_staff.sql` tightened `site_details_v2` to admin + gedu only. The original handoff intent was admin + gedu + **customers who have purchased a product at that site**, but there's no v2 enrollment / participation table yet to write that predicate against (legacy `group_enrollments` references `products`, not `products_v2`). Until that lands, post-purchase address visibility has to go through an out-of-band channel (admin-rendered confirmation page, transactional email).

**Fix when v2 enrollments ship:** add a third policy on `site_details_v2`:

```sql
CREATE POLICY "purchasing_customer_read_site_details_v2"
  ON site_details_v2 FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM <v2_enrollment_table> e
    JOIN products_v2 p ON p.id = e.product_id
    WHERE p.location_id = site_details_v2.location_id
      AND e.customer_id = auth.uid()  -- or via parent_gamer chain
      AND e.status = 'active'
  ));
```

Extend `tests/db/site-details-rls.test.ts` in the same migration with two cases:
- positive: customer with an active enrollment at this site **can** read the address.
- negative: customer **without** an enrollment at this site still **cannot** read it (the existing negative covers this today; keep it once the positive is added).

The same logic applies to `site_staff_details_v2` only if customers ever need to see staff-only fields (gate codes, back-entrance directions) — which they shouldn't. Leave that table admin + gedu only.

### Inline topic / tag create can leave orphan parent rows on transient failure

`POST /api/admin/topics-v2/create` and `POST /api/admin/tags-v2/create` insert the parent row in `topics_v2` / `tags_v2`, then insert the translation row in `topic_translations_v2` / `tag_translations_v2`, then on translation failure issue a JS-level rollback delete of the parent.

If the request is interrupted between the two awaits (network drop, lambda timeout, browser cancel), the parent row persists with no translation row. The rollback delete also doesn't inspect its own error result, so a delete failure (e.g. transient RLS hiccup) silently strands the orphan.

**Impact:** Low likelihood, but irreversible when it does fire — orphan slugs occupy the UNIQUE constraint forever, and parent surfaces have no name to render (resolver returns the first-available row, or nothing if none exists).

**Fix:** Move both inserts into a single SQL function (`create_topic_v2`, `create_tag_v2`) that takes the parent + translation fields and writes both atomically. Matches the pattern set by `create_product_v2`. Removes the JS rollback path entirely.

### Translation `UPDATE OF locale` can violate the en/fi-keep rule

The `BEFORE DELETE` trigger on `product_translations_v2` enforces ≥1 of (en, fi) on deletes. It does **not** guard `UPDATE OF locale` — a direct `UPDATE product_translations_v2 SET locale = 'sv' WHERE locale = 'en'` succeeds even when no `fi` row exists, leaving the product without any en/fi translation.

**Impact:** Latent today (no edit-translations UI exists). Will become live the moment such a UI ships, unless the UI exclusively does DELETE+INSERT. If violated, English and Finnish parents see content in whatever locale the resolver falls back to (typically the first available row) — real text, but in a language they may not read.

**Fix:** Add a `BEFORE UPDATE OF locale` trigger that runs the same en/fi check, or forbid `UPDATE OF locale` entirely and require admins to delete + insert.

### `effective_status_v2` SQL twin to mirror the TS helper

The TS helper (`effective-status.ts`) uses `date-fns-tz` to compare `start_date` / `end_date` against `now` in the product's timezone, and it derives an `expired` state for pending products whose end_date passed without ever satisfying the start conditions. The matching SQL function `effective_status_v2(product_id)` doesn't exist yet (the design doc anticipates it). When DB-side filters need to match the client (e.g. "show me running products"), build the SQL function with the same rule: project `now()` into `products_v2.timezone`, compare to date-only fields, and emit the same `expired` derived state.

### Manage topic & tag translations admin UI

Inline-create writes a single translation in the admin's current UI locale (intentional simplification). Topics and tags are not subject to the en/fi rule. Until a "Manage topic & tag translations" admin page ships, parents on a locale that lacks a topic/tag translation see the resolver fallback.

### Browse page gates entire surface on three queries

`ProductBrowsePage` (`src/components/public/products-v2/product-browse-page.tsx`) waits on `useVisibleProductsV2ByType`, `useTopicsV2`, and `useTagsV2` together before rendering anything below the heading. Topics and tags are platform-wide, almost always cached, and not needed to render the product grid — gating on them blocks the cold-cache visitor on the slowest of three independent queries for no reason.

**Impact:** Low — the topics/tags queries are very fast and the catalog is small. Visible only on the first cold load. Filed here so we don't forget to peel apart if the surface ever feels sluggish.

**Fix:** Scope the spinner to `productsLoading` only. Render the purchased rail (mock or real) immediately, render `<ProductBrowseFilters>` with empty chip rows while topics/tags are loading, and let the chips fill in as their queries return — the row position is already reserved so no layout shift.

### Use Stripe `capture_method: "manual"` to handle the seat-race at registration drops

Popular drops (the "Taylor Swift ticket" model — countdown to a specific instant when registration opens) create a fairness problem under the chosen first-paid-wins seat-allocation rule. Two parents can both tap Enroll within the same second; one finishes Stripe Checkout before the other; the slower parent's payment lands against an already-full seat count. The naive options are both bad:

- **Charge then refund** — parent sees a charge appear and disappear on their statement; looks like a billing bug.
- **Force into waitlist after charging** — parent paid for a seat and got the waitlist instead. Double-disappointment.

**Use Stripe's manual capture instead.** When creating the Stripe Checkout Session, pass `payment_intent_data: { capture_method: "manual" }`. The card is **authorized** at Checkout completion (held against the customer's available credit, not charged). Our webhook then decides what to do based on real-time seat state at the moment authorization completes:

- **Seat available** → `stripe.paymentIntents.capture(pi.id)` finalizes the charge, allocate the seat. ✓
- **Seat already taken** → `stripe.paymentIntents.cancel(pi.id)` voids the auth. The hold drops off the parent's available credit within a few days; no charge ever appears on their statement. We then offer the waitlist as an opt-in, not a forced re-route.

Trade-offs to bake into the implementation when we wire payment:
- Stripe holds an auth for ~7 days; we must capture or cancel within that window.
- Manual capture is supported on Stripe Checkout via `payment_intent_data.capture_method` for one-time payments. It is **not** supported for subscriptions (recurring charges always auto-capture). For consumer clubs on a subscription tier, the seat-race is naturally less acute (subscriptions are an open-ended commitment, not a single-seat scarcity event) — first-paid-wins is fine. The manual-capture pattern applies primarily to camps + events sold upfront, and to one-shot bundle purchases against a capped club seat.
- 3DS challenges complete *before* authorization, so manual capture composes correctly with SCA.

This is the deferred-but-decided answer to "what happens to the parent who paid 0.5s later and the seat went?" — we never charge their card.

### Events should remain purchasable on their start day until the actual start time

Today, `deriveRegistrationState` (`src/components/public/products-v2/derive-registration-state.ts`) returns `running_late` for any camp or event whose `effectiveStatus` is `running` — and `effectiveStatus` flips to `running` at 00:00 local on the `start_date`, since `start_date` is a date-only column. The card then hides the CTA for the rest of the day.

For camps this is fine — a 5-day Roblox camp starting Tuesday shouldn't take a new sign-up Tuesday morning, the cohort already started together. CPO has confirmed: keep camps locked at the start-of-day boundary.

For events it's wrong. A Friday 18:00 Fortnite party becomes `running_late` at Friday 00:00 — 18 hours before it actually starts — and a parent browsing Friday morning can't sign their kid up for tonight. The lockout boundary should be the event's actual start time, not midnight.

**Fix sketch:**
- Project the event's start moment in its timezone: combine `start_date` with the first `schedule_slots_v2.start_time` (events have a single slot per redesign §5.1) to get an instant.
- For `event` only, the deriver returns `running_late` once `now >= startInstant` — not when `effectiveStatus` flips to `running`.
- Camps keep the current "running ⇒ running_late" behaviour (`LATE_JOIN_LOCKED.camp = true`, no time component needed).
- Worth a small unit test: an event at `start_date=2026-04-12` / `start_time=18:00:00` / timezone `Europe/Helsinki` is `open` at 17:59 local but `running_late` at 18:00 local.

**Side note:** the `running_late` card today still renders the price block but no CTA, so the parent sees an orphaned price. When this fix lands, also clean up the bottom block — show a soft "this one's already underway" line for `running_late`, parallel to the `ended` treatment, instead of a price floating with no action.

### CTA stays active when a price row is missing for the viewer's currency

The admin create form validates that every paid product has a row in EUR, GBP, and USD before submit (`product-v2-build.ts:163`), but the database does not enforce it — `product_prices_v2` is just a `(product_id, currency)` PK with no count constraint, and the `create_product_v2` RPC inserts whatever the form sends. The "currencies always complete" invariant is form-side only.

When a product *does* end up with a missing currency (manual SQL insert, future migration that adds a 4th currency before backfilling existing rows, a relaxed form), the surfaces handle it like this:

- **Browse card** (`product-browse-card-view.tsx`, `PriceBlock` `case "unavailable"`) renders "Not in {currency}" in the price slot.
- **Detail page panel** (`pricing-panel-view.tsx`, `SingleRow` `case "unavailable"`) renders "Not available in {currency}" in the pricing block.

In both places the **CTA button stays active**. On the card the CTA is derived from `useRegistrationCta(state)` — purely registration state, blind to price availability. On the detail panel, `priceForCta` (`signup-panel-view.tsx`) returns `null` for `kind: "unavailable"`, which only drops the price suffix from the label; the button itself isn't disabled.

**Impact:** Today's checkout is UI-only, so the click is a no-op and the issue is invisible. Once Stripe Checkout is wired, a parent could click "Sign up" on a product they literally cannot purchase in their currency, hit a server-side price-validation failure, and get a generic error — a confusing dead end. Likelihood is low because the admin form is the only mutation path and it enforces all three currencies.

**Fix sketch:**
- Plumb price availability into the CTA decision. The pricing-options builder already returns `defaultKey: "unavailable"` and `single: { kind: "unavailable" }` in this case — the View can read that and render a disabled button (or hide it entirely) with a one-line "Switch to {available currency} to sign up" hint.
- Same hook on the browse card: when `formatProductPrice` returns `kind: "unavailable"`, render the price-block fallback as today but skip the CTA, parallel to the `ended` treatment.
- Optional follow-on: a more aggressive variant filters the product out of the browse list entirely for that currency, on the theory that "exists but unbuyable" is worse than "doesn't appear." Decide based on whether we expect partial-currency products to be a real ops scenario or strictly a defensive fallback.
