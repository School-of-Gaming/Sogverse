# Products v2 Architecture

The next-generation product system covering four product types — consumer clubs, municipality clubs, camps, events — as a single, unified shape. Currently admin-only (creation UI). Parent / customer / gamer surfaces ship in later phases.

For the design rationale, see `docs/products-redesign.md`. This doc covers what was built on the `feat/products-v2-mock-port` branch and where it's headed.

## Scope on this branch

- DB foundation: `products_v2`, `topics_v2`, `tags_v2`, translation child tables (`product_translations_v2`, `topic_translations_v2`, `tag_translations_v2`), holiday calendars, schedule slots, prices, groups, and the `site_details_v2` / `site_staff_details_v2` split for location extension data.
- Admin creation UI for all four product types at `/admin/{consumer-clubs,municipality-clubs,camps,events}/new`, sharing one form with type-specific config (`product-v2-type-config.ts`).
- Admin list pages for the same four types.
- Server-side `create_product_v2` RPC plus inline-create routes for tags, topics, locations, FX rates, and site notes.
- Effective-status derivation (TS + SQL twin) — `pending → running → completed` is computed at read time from stored facts, not driven by cron.

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

### `effective_status_v2` end-of-day uses UTC midnight, not the product's timezone

A Helsinki event with `end_date = today` flips to `completed` at 00:00 UTC = 02:00 / 03:00 Helsinki time — i.e. on the morning of the event itself. Same drift in the TS twin (`effective-status.ts`).

**Impact:** Fine while status is admin-only. Becomes user-visible the moment customer detail pages start displaying it (per `docs/products-redesign.md` §7.5, they will).

**Fix:** Use `date-fns-tz` with `p.timezone` (already on the row) on both sides. Apply matching fix in the SQL function so DB-side filters agree with client.

### Manage topic & tag translations admin UI

Inline-create writes a single translation in the admin's current UI locale (intentional simplification). Topics and tags are not subject to the en/fi rule. Until a "Manage topic & tag translations" admin page ships, parents on a locale that lacks a topic/tag translation see the resolver fallback.
