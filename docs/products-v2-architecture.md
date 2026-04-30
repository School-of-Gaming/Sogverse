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

## Parent browse surfaces

### Routes

- `/clubs` — consumer + municipality enrollment surface. Browse grid is consumer-club only; an enrolled muni club shows up in the "your enrolled" section above the grid (see `?mock=1` below) so a parent who registered through their city sees one unified list.
- `/camps` — single-type browse + enrolled section.
- `/events` — single-type browse + enrolled section.

### Component map

```
src/components/public/products-v2/
├── product-browse-page.tsx           — Page orchestrator: heading, filters, "your enrolled" section, browse grid, empty states
├── product-browse-filters.tsx        — Topic / tag chips, result count, clear-all
├── product-browse-card.tsx           — Browse-card adapter: ProductV2BrowseRow → display props
├── product-browse-card-view.tsx      — Browse-card View: pure-presentational
├── product-purchased-card.tsx        — Purchased-card adapter
├── product-purchased-card-view.tsx   — Purchased-card View
├── registration-pill.tsx             — RegistrationPill (outline chip) + useRegistrationCta hook
├── derive-registration-state.ts      — Pure state-machine: product + now + participation count → RegistrationState
├── format-product-schedule.ts        — Pure schedule formatter (every weekday / range / single)
├── format-product-price.ts           — Pure price formatter (free / external / bundle_or_sub / upfront)
├── filter-products.ts                — Pure topic / tag filter
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

### `?mock=1` purchased section

The "your enrolled" surface above the browse grid is gated behind `?mock=1` until participation rows are live. Mock data lives in `mock-purchased.ts` — five hand-curated rows with stable identicon seeds. Real visitors never see it; design review hits e.g. `/clubs?mock=1` to inspect the unified-management surface alongside the live browse grid. Delete `mock-purchased.ts` and replace its consumers with a real `useMyParticipations` hook when participations land.

### Filter UX

Filter chips are URL-driven via `useBrowseFilters` — deep-links like `/clubs?topic=minecraft&tag=creative` reproduce a filter state. `filterProducts` is a pure function over `(rows, { topics, tags })`. Result count is rendered next to the filters and the empty state distinguishes "nothing matches your filters" from "no products in this category yet".

### Style guide / design review surface

Every browse + purchased card state is rendered on `/admin/ui-components` under "Products v2 — Browse & Purchased Cards". The page imports the `*View` components directly so every state is exercised without faking DB rows. CLAUDE.md's "Reference this page before creating new UI patterns" rule applies — when adding a new state, also add it to the demo so design review can see it.

### Non-obvious gotchas

- **`useTranslations` types don't cross function boundaries.** Helper functions that take `ReturnType<typeof useTranslations<"productBrowse.card">>` as a parameter trip TS2589 ("excessively deep") on this path. The pattern: closure-bind `t` inside the component and write small literal-key dispatcher helpers (see `headingFor` in `product-browse-page.tsx`, `decorationFor` in `registration-pill.tsx`).
- **Lucide icons must not be aliased to a local variable in render.** `react-hooks/static-components` flags `const Icon = iconFor(state)` as dynamic component creation. Wrap the switch in a tiny component (`<StateIcon state={state} className=... />`) instead — the className flows through as a JSX attribute, which the i18n literal-string rule allows-lists.
- **The View shouldn't depend on the currency provider.** Currency lookup happens in the adapter; the View receives an already-formatted `ProductPriceLine`. Same rule for locale-aware date formatting on `closed_pre.opensAt` — the Pill formats it with `useFormatter` since the pill itself is locale-aware, but anything else handed to the View should be pre-formatted.

## Future improvements

These are known gaps tracked here so they aren't lost. None are blocking the current admin-only flow.

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
