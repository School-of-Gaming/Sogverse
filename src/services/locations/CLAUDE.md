# Locations

Hierarchical geographic system mapping products and gedus to regions, powering substitute matching, and supporting international expansion. This directory holds the locations service layer; UI and constants live in sibling modules noted below.

## Data model

One self-referential `locations` table (adjacency list): each row has a nullable `parent_id` pointing at another row. A `location_type` enum (`country`, `region`, `municipality`, `district`, `site`) classifies each level. Arbitrary depth, shallow in practice (3-5 levels), so `WITH RECURSIVE` CTEs handle ancestor/descendant walks fine.

Columns: `id`, `name`, `name_i18n` (jsonb, see below), `type`, `parent_id` (FK to `locations`, `ON DELETE RESTRICT`), `country_code` (ISO 3166-1 alpha-2, **denormalized on every row** so country filtering needs no recursion), `external_code` (nullable, see below), `created_at`, `updated_at`.

## Official codes (`external_code`)

`external_code` holds the row's code in its country's official statistical classification — INSEE's Code officiel géographique for France, Statistics Finland's maakunta/kunta classifications for Finland. It is the key seeded and generated rows are deduped on, because names are not one: France has homonymous communes, and each DROM has a région and a département of the same name. Sites an admin creates by hand exist in no national classification and keep it NULL — which is why the column is nullable and its uniqueness partial.

Uniqueness is `(country_code, type, external_code)`, not `(country_code, external_code)`. France reuses the same code across levels — every one of the 18 région codes is also a département code — and the two are unambiguous in the COG only because they ship as separate files. `type` *is* that file, so the tuple expresses "the official code within its own classification". Storing prefixed codes instead was rejected: the column would stop holding the official code, breaking any join against upstream data.

Hierarchy is flexible, not rigid — not every country uses every level (Finland skips `district`). A `country` row has `parent_id IS NULL`. Per-country level naming (region = maakunta/state/prefecture, etc.) is metadata, not separate types.

**Rule: `parent_id` uses `ON DELETE RESTRICT`** — never let a delete orphan child locations.

## Catalogs and materialization

The exhaustive per-country lists are **not** in the database. They ship as generated static catalogs in `src/lib/locations/catalog/` — one JSON file per country, plus the shape contract in `types.ts` and the module that loads and reads them. `scripts/generate-location-catalogs.mjs` rebuilds them from the official releases (INSEE's Code officiel géographique, Statistics Finland's classifications); its header documents the source URLs and the refresh procedure.

The split is the whole design:

- **The catalog is the exhaustive list.** France has 34,875 communes. Seeding them would put ~35k reference rows nobody points at into every read of the tree.
- **The table holds only rows something references.** A catalog entry becomes a row the first time an admin picks it — *materialization*. France seeds the country, its 18 régions and its 101 départements, because those are the parents every materialized commune needs; Finland's regions and municipalities were already seeded and carry codes now.
- **Admins never type a place name.** They browse or search the catalog and confirm; the server writes the official name. The only level anyone names by hand is a `site`, which exists in no national classification. Typos and duplicate spellings are structurally impossible above that level.

**Rule: `allowedChildTypes` on the tree's inline-create config is `["site"]`, everywhere.** Locations enter the database by seed or by materialization, and by nothing else. There is deliberately no "add a country" dialog and no free-text creation of a region, département or municipality.

### The materialization route

`POST /api/admin/locations/materialize` takes only the pair that identifies a catalog entry — country code plus the official leaf code — and returns the municipality row. It is admin role-gated with the same posture as the create route, and writes on the caller's own server-side client so the route's role check and the table's policy both have to agree.

What it does, and why each part is load-bearing:

- **Validates against the server-side catalog.** The request carries no names, so nothing a caller sends can end up in a row. A code the catalog does not contain is a 400.
- **Matches only at leaf depth.** France reuses every région code as a département code, so a depth-agnostic lookup would be ambiguous; commune/kunta codes are unique within their own classification.
- **Get-or-creates top-down**, deduping every level on `(country_code, type, external_code)` — the same key the unique index enforces. Picking an already-materialized commune is therefore a plain read.
- **Creates a missing ancestor rather than failing.** Régions and départements are expected from seeds, but the catalog is authoritative and an admin's pick must not fail because reference data is incomplete.
- **Resolves a lost race to the winner's row.** Two admins materializing the same commune at once means one insert comes back `23505`; that path re-reads on the unique key instead of surfacing a conflict for a row that now exists.

### Annual refresh

Both classifications are republished each January. Rerunning the generator against the new release updates the catalogs, and the emitted diff is the review. **Reconciling already-materialized database rows against that diff is manual and deliberate.** Communes merge and rename between releases; a rename means a materialized row's `name` no longer matches the catalog, and a merge means its code is gone. Neither is automated, because both can invalidate live products and gedu coverage, so both want a human deciding. A stale materialized row keeps working — it is only its display name that drifts.

Gedu coverage needs no commune rows at all: a tick means "this whole subtree", so département-level coverage automatically covers every commune materialized under it later.

## Service-layer shape (this directory)

Standard service pattern. `LocationsService` takes an `AppSupabaseClient`:
- **Reads** (`getAllLocations`, `getLocation`) use the injected client directly against `locations`.

**Rule: a read that can return the whole table pages through `.range()` until a page comes back short.** PostgREST enforces `max_rows` (1000) by truncating the response, not by erroring, so an unbounded select is indistinguishable from a complete one — it silently drops rows the moment the tree outgrows the cap, and every country shares that one budget. Paging also requires a **total** order: `name` alone is not one (see the DROM name collisions above), so order by `name` then `id` or rows shift between requests and the walk both duplicates and drops them.
- **Writes** (`createLocation`, `materializeLocation`, `updateLocation`) `fetch()` the admin API (`/api/admin/locations/...`). The route re-checks the role and performs the write on the caller's own server-side client, so the admin-only write policy on `locations` is the second layer behind it; `authenticated` holds INSERT and UPDATE but no DELETE, which is why there is no delete route. The injected client is intentionally unused by write methods.

`locations.queries.ts` exposes React Query hooks plus the `locationKeys` factory. `locations.contracts.ts` holds the zod schemas (`createLocationBody`, `materializeLocationBody`, `updateLocationBody`, `locationRow`) shared by route and service; enum values derive from `Constants.public.Enums.location_type` and from the catalog-country tuple, so a country that ships no catalog is refused by the schema rather than by a lookup. Re-exports in `index.ts`.

**Rule: Mutations invalidate via the key hierarchy** — create and materialize invalidate `locationKeys.lists()`; update invalidates both `detail(id)` and `lists()`. Materialize invalidates even when it only read an existing row: the caller cannot tell a get from a create, and the tree has to show the row either way.

## Per-country labels & hierarchy config

`SUPPORTED_COUNTRIES`, `resolveLabels`, `getChildLevel`, and the `HierarchyLevel`/`nameI18n` types live in `src/lib/constants/location-hierarchies.ts` (re-exported from `src/lib/constants`). This config table drives the level labels and the "+" affordance's naming — adding a country there makes the tree read correctly with no code changes. It is separate from the catalog list: the hierarchy config says what a country's levels are *called*, the catalog says what its divisions *are*, and a country can have the first without the second (it just cannot then be materialized into).

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

UI lives in `src/components/locations/`, and both components there are presentational and fixture-driven in the `/admin/ui-components` style guide — they hold no business logic, so data and handlers are injected as props.

- **`location-tree.tsx` (`LocationTree`)** — the one shared tree. It takes a flat `locations` list (builds the tree + owns search internally) and a `selection` discriminated union: `single` (value/onSelect + `pickableTypes`) or `multi` (selectedIds/onToggle). Optional inline create (`create.allowedChildTypes`, always `["site"]`) opens `src/components/admin/location-form-dialog.tsx`. An optional `focusId` reveals one row — ancestors expanded, row highlighted, actions shown without hovering, scrolled into view — which is how a freshly materialized municipality is handed back to the admin.
- **`catalog-picker.tsx`** — the catalog browse/search panel plus the dialog that wraps it. The panel is handed a catalog and an `onConfirm`; the dialog picks the country, loads that catalog behind a **dynamic `import()`** (code-split — France's is ~890 KB, so it must never be in the main bundle) and runs the materialization mutation. Search is instant and client-side over a pre-normalized index built once per catalog, diacritic-insensitive in both directions, capped at a rendered-result budget with the true match count still reported. An empty search box falls back to hierarchical drill-down, so browse and search share one panel with no mode switch.

Two consumers wrap the tree:
- **Product picker** (`src/components/admin/products/location-picker.tsx`) — single-select. `pickable="site"` (in-person: only sites pickable, "+" creates a site under a municipality, and an "add from the official catalog" affordance opens the catalog picker; on success the tree focuses the new municipality so the next click adds a site under it) or `pickable="municipality"` (online municipality clubs: only **Finnish municipalities** pickable — the tree is filtered to `country_code = 'FI'` and sites/countries/regions are not selectable; no creation, no catalog affordance). The municipality rule is **UI-enforced**: the `validate_products_location` DB trigger still permits country/region for online muni clubs (it predates the rule), so the picker is the gate — it also clears any existing pick that isn't a FI municipality on load, nudging a re-pick on legacy/staging rows. Adds the product-specific selected-state card with breadcrumb + member/staff `SiteNotesEditor`. This is the **only** surface that writes locations: sites by hand, everything else by materialization.
- **Gedu coverage editor** (`src/components/gedu/gedu-coverage-editor.tsx`) — multi-select, mounted at the gedu self-edit settings page and the admin user-detail page. The cascade-tick semantics (tick a parent → tick its subtree; untick a descendant → untick selected ancestors) live in the consumer (`coverage-cascade.ts`), not the component — the tree just reports each tick via `onToggle`.

There is no standalone admin locations CRUD page; it was removed in favour of this shared component. (`useUpdateLocation` + the `PATCH /api/admin/locations/[id]` route are consequently unused — see `TODO.md`.)

## Recursive queries

- **Breadcrumb / full path** — recurse `id → parent_id` from the selected row up to the root; order by depth descending to get `Country > Region > City`.
- **Substitute matching** — collect the product's location ancestor chain (`product_location_id` up to root), then `SELECT DISTINCT gedu_id FROM gedu_locations WHERE location_id IN (chain)`. A product at a site matches every gedu who ticked that site, its city, region, or country — the cascade-tick semantics make any ancestor row mean "covers everything underneath." Language matching (`products.spoken_language_code ∈ profiles.spoken_languages`) layers on as an additional `AND`.

Client-side, `buildAncestorChain(location, all)` walks the same chain in JS (cycle-guarded against malformed `parent_id`); `filterLocationTree` keeps matching nodes plus their ancestors and full subtree.
