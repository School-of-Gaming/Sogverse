# Locations

Hierarchical geographic system mapping products and gedus to regions, powering substitute matching, and supporting international expansion. This directory holds the locations service layer; UI and constants live in sibling modules noted below.

## Data model

One self-referential `locations` table (adjacency list): each row has a nullable `parent_id` pointing at another row. A `location_type` enum (`country`, `region`, `municipality`, `district`, `site`) classifies each level. Arbitrary depth, shallow in practice (3-5 levels), so `WITH RECURSIVE` CTEs handle ancestor/descendant walks fine.

Columns: `id`, `name`, `type`, `parent_id` (FK to `locations`, `ON DELETE RESTRICT`), `country_code` (ISO 3166-1 alpha-2, **denormalized on every row** so country filtering needs no recursion), `created_at`, `updated_at`.

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
