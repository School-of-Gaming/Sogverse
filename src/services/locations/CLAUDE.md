# Locations

Hierarchical geographic system mapping products and gedus to regions, powering substitute matching, and supporting international expansion. This directory holds the locations service layer; UI and constants live in sibling modules noted below.

## Data model

One self-referential `locations` table (adjacency list): each row has a nullable `parent_id` pointing at another row. A `location_type` enum (`country`, `region`, `municipality`, `district`, `site`) classifies each level. Arbitrary depth, shallow in practice (3-5 levels), so `WITH RECURSIVE` CTEs handle ancestor/descendant walks fine.

Columns: `id`, `name`, `name_i18n` (jsonb, see below), `type`, `parent_id` (FK to `locations`, `ON DELETE RESTRICT`), `country_code` (ISO 3166-1 alpha-2, **denormalized on every row** so country filtering needs no recursion), `created_at`, `updated_at`.

Hierarchy is flexible, not rigid — not every country uses every level (Finland skips `district`). A `country` row has `parent_id IS NULL`. Per-country level naming (region = maakunta/state/prefecture, etc.) is metadata, not separate types.

**Rule: `parent_id` uses `ON DELETE RESTRICT`** — never let a delete orphan child locations.

## Service-layer shape (this directory)

Standard service pattern. `LocationsService` takes an `AppSupabaseClient`:
- **Reads** (`getAllLocations`, `getLocation`) use the injected client directly against `locations`.
- **Writes** (`createLocation`, `updateLocation`) `fetch()` the admin API (`/api/admin/locations/...`). The `locations` table's DML grants are revoked from `authenticated`, so browser writes must go through the admin client server-side. The injected client is intentionally unused by write methods.

`locations.queries.ts` exposes React Query hooks plus the `locationKeys` factory. `locations.contracts.ts` holds the zod schemas (`createLocationBody`, `updateLocationBody`, `locationRow`) shared by route and service; enum values derive from `Constants.public.Enums.location_type`. Re-exports in `index.ts`.

**Rule: Mutations invalidate via the key hierarchy** — create invalidates `locationKeys.lists()`; update invalidates both `detail(id)` and `lists()`.

## Per-country labels & hierarchy config

`SUPPORTED_COUNTRIES`, `resolveLabels`, `getChildLevel`, and the `HierarchyLevel`/`nameI18n` types live in `src/lib/constants/location-hierarchies.ts` (re-exported from `src/lib/constants`). This config table drives the cascading dropdown chain and label localization — adding a country there makes the picker work with no code changes.

Localized labels apply **only** to the country whose language matches the user's UI locale (a Finnish admin sees "Maakunta"/"Kunta" for Finland but plain English "Borough" for the UK). `resolveLabels(level, locale)` picks the localized pair or falls back to the English default; country names localize via `nameI18n`.

**Rule: Adding a country whose language is a supported UI locale requires `i18n` entries on each hierarchy level plus a `nameI18n` entry.** A country whose language isn't a supported UI locale needs none — English is the default.

## Localized display names (`name_i18n`)

A location's `name` is the **canonical native-language name** — Finnish for FI rows, English for UK/US, etc. `name_i18n` is a `jsonb` map of `locale → name` overrides holding **only the rows that differ**, e.g. `{ "sv": "Helsingfors" }`. Seeded for Finland by migration `00110` (the companion to `00109`'s location seed): the official Swedish names of the 18 regions and 33 municipalities that have one, sourced from Kotus (Institute for the Languages of Finland) and Government Decree 1385/2022. Rows whose Swedish name equals the Finnish (Satakunta; Korsnäs; Åland's 15 Swedish-only municipalities, already stored Swedish) get no entry, and most municipalities are monolingual Finnish with no legal Swedish name at all.

**Rule: render location names through `localizedLocationName(loc, locale)` (`src/lib/locations/localized-name.ts`), never raw `loc.name`.** It resolves `name_i18n[locale] ?? name`, so every untranslated row, every admin-created site, and every viewer whose locale has no override falls back to `name`. The viewer locale comes from `useLocale()` (client) / `getLocale()` (server); the resolver takes a structural `{ name, name_i18n }`, so the joined browse-row location shape works too. All render sites use it: the /schools list (`buildMunicipalityEntries`), product cards (`formatProductLocation`), the shared `LocationTree` (display + search), the product location picker breadcrumb, and the gedu coverage chips.

**Rule: `name` is never duplicated into `name_i18n`.** Finland's own `fi` names live in `name`, not under a `"fi"` key — the resolver falls back to `name` for the native locale. Don't "helpfully" backfill a `fi` (or `en` for UK) key; the convention is *native name in `name`, alternates in `name_i18n`*. This is also why we don't store traditional exonyms of monolingual towns (Tampere → "Tammerfors"): those aren't the municipality's *legal* name, and the column is for legal/official alternates.

**Search & slugs follow the same data.** The /schools search indexes the canonical slug **plus** every alternate (`searchSlugs`), so "Helsingfors" and "Helsinki" both find the row; the `LocationTree` filter likewise matches alternates. The `/schools/<slug>` link is built from the **viewer-locale** display name (a Swedish viewer links to `helsingfors`), and `findMunicipalityBySlug` resolves the canonical *and* every alternate slug to the same row — canonical first, so a Swedish exonym can never shadow another municipality's native slug.

Adding another locale (or another country's alternates) is data-only: add `name_i18n` entries; no schema change, since the column is locale-agnostic jsonb (this is why we chose it over per-locale `name_sv`/`name_xx` columns).

## Products ↔ locations

Every product is **either** remote (`is_remote = true`, `location_id IS NULL`) **or** in-person (`is_remote = false`, `location_id` set) — enforced by a CHECK constraint (`location_id` is xor'd with `is_remote`). A `BEFORE INSERT/UPDATE` trigger additionally requires any non-null `location_id` to reference a `type = 'site'` row.

**Rule: Products pin only to `site` (leaf) locations — never to a region/city.** This gives the ancestor-walk matcher a well-defined start point. Defence in depth: the product form's zod rule disables submit until a leaf is chosen; the CHECK + trigger are the DB backstop.

**Rule: `is_remote` and `spoken_language_code` on `products` are NOT NULL with no DEFAULT — admins must explicitly pick both on every product.** No silent default at any layer.

## Gedu coverage

`gedu_locations` join table: `(gedu_id, location_id)` PK, both FKs `ON DELETE CASCADE`. Gedus may tick rows at **any** level (region, city, or site). A tick means "I cover this whole subtree."

RLS: a gedu reads/writes only their own rows and only if their role is `gedu` (actor + target both checked); admins manage any row (for the user-detail view).

**Cascade-tick semantics** (implemented in the coverage editor, not the DB):
- Ticking a parent auto-ticks every descendant in the set.
- Unticking any descendant removes that descendant **and** every selected ancestor up its chain (the ancestor's "I cover my whole subtree" is no longer true). Sibling branches unaffected. Net effect: "I cover Uusimaa except Helsinki."
- An empty selection is valid — the gedu is remote-only.

UI: one shared, presentational tree — `src/components/locations/location-tree.tsx` (`LocationTree`). It takes a flat `locations` list (builds the tree + owns search internally) and a `selection` discriminated union: `single` (value/onSelect + `pickableTypes`) or `multi` (selectedIds/onToggle). Data and the create handler are injected as props — the component holds no business logic, so it is fixture-driven in the `/admin/ui-components` style guide. Optional inline create (`create.allowedChildTypes`, gated to `site` in practice) opens `src/components/admin/location-form-dialog.tsx`.

Two consumers wrap it:
- **Product picker** (`src/components/admin/products/location-picker.tsx`) — single-select. `pickable="site"` (in-person: only sites pickable, "+" creates a site under a municipality) or `pickable="municipality"` (online municipality clubs: only **Finnish municipalities** pickable — the tree is filtered to `country_code = 'FI'` and sites/countries/regions are not selectable; no creation). The municipality rule is **UI-enforced**: the `validate_products_location` DB trigger still permits country/region for online muni clubs (it predates the rule), so the picker is the gate — it also clears any existing pick that isn't a FI municipality on load, nudging a re-pick on legacy/staging rows. Adds the product-specific selected-state card with breadcrumb + member/staff `SiteNotesEditor`. This is the **only** surface that creates locations, and only sites — regions/municipalities/countries are seeded reference data (see migration `00109_seed_finland_locations.sql`).
- **Gedu coverage editor** (`src/components/gedu/gedu-coverage-editor.tsx`) — multi-select, mounted at the gedu self-edit settings page and the admin user-detail page. The cascade-tick semantics (tick a parent → tick its subtree; untick a descendant → untick selected ancestors) live in the consumer (`coverage-cascade.ts`), not the component — the tree just reports each tick via `onToggle`.

There is no standalone admin locations CRUD page; it was removed in favour of this shared component. (`useUpdateLocation` + the `PATCH /api/admin/locations/[id]` route are consequently unused — see `TODO.md`.)

## Recursive queries

- **Breadcrumb / full path** — recurse `id → parent_id` from the selected row up to the root; order by depth descending to get `Country > Region > City`.
- **Substitute matching** — collect the product's location ancestor chain (`product_location_id` up to root), then `SELECT DISTINCT gedu_id FROM gedu_locations WHERE location_id IN (chain)`. A product at a site matches every gedu who ticked that site, its city, region, or country — the cascade-tick semantics make any ancestor row mean "covers everything underneath." Language matching (`products.spoken_language_code ∈ profiles.spoken_languages`) layers on as an additional `AND`.

Client-side, `buildAncestorChain(location, all)` walks the same chain in JS (cycle-guarded against malformed `parent_id`); `filterLocationTree` keeps matching nodes plus their ancestors and full subtree.
