# Locations

Hierarchical geographic system mapping products and gedus to places, powering substitute
matching, and supporting international expansion. This directory holds the locations
service layer; the static catalogs, the UI and the per-country config live in sibling
modules noted below.

## The invariant

**Human eyes read the catalog; the query engine reads the rows; nothing ever ships the
`locations` table to a client.**

- The generated static catalogs (`src/lib/locations/catalog/`) are the only thing UI
  browsing, search and drill-down ever use — exhaustive, code-split, cached, and
  readable with no session.
- The `locations` table is **fully seeded** from the same official releases and serves
  server-side query logic only: foreign-key integrity, ancestor chains, substitute
  matching, RLS-scoped coverage reads. Every read of it is scoped — a country's
  municipalities, the venues, a set of keys — never the whole table.
- The one exception to "catalog-only UI" is **sites**: venues an admin names by hand.
  They exist in no classification, so the only place they can be browsed is the database.

Both halves matter. Dropping the catalog means shipping 35k rows to a browser; dropping
the seed means row existence becomes a function of who clicked what, which is a poor
thing for referential integrity to rest on.

## Data model

One self-referential `locations` table (adjacency list): each row has a nullable
`parent_id` pointing at another row. A `location_type` enum (`country`, `region`,
`municipality`, `district`, `site`) classifies each level. Arbitrary depth, shallow in
practice (3–5 levels).

Columns: `id`, `name`, `name_i18n` (jsonb, see below), `type`, `parent_id` (FK to
`locations`, `ON DELETE RESTRICT`), `country_code` (ISO 3166-1 alpha-2, **denormalized on
every row** so country filtering needs no recursion), `external_code` (nullable, see
below), `created_at`, `updated_at`.

Hierarchy is flexible, not rigid — not every country uses every level (Finland skips
`district`). A `country` row has `parent_id IS NULL`. Per-country level naming (region =
maakunta/state/prefecture, etc.) is metadata, not separate types.

**Rule: `parent_id` uses `ON DELETE RESTRICT`** — never let a delete orphan child
locations.

## What is seeded

Both supported countries are seeded complete, from the official statistical
classifications, by data-only migrations:

| | Finland | France |
|---|---|---|
| Levels | region, municipality | region, district, municipality |
| Rows | 19 maakuntaa + 308 kuntaa | 18 régions + 101 départements + 34,875 communes |
| Source | Statistics Finland classifications | INSEE Code officiel géographique |

Plus one `country` row each. **Every seeded row carries its official code.** The only
rows that do not are `site` rows, which are also the only rows anyone creates by hand.

Consequences worth holding onto:

- **Nothing mints a place row on demand.** A commune a product or a gedu points at is
  already there; the write path resolves a code to the existing row and never inserts
  above `site`. A code with no row means the environment is missing its seed — which is a
  visible refusal, not a reason to invent a row with an unofficial parent under it.
- **A seed is idempotent and asserted.** Inserts are `NOT EXISTS`-guarded on the code key
  and the migration ends by asserting the exact row count, zero orphans and zero
  code-less rows, so a half-applied seed fails loudly rather than shipping.
- **35k reference rows are trivial for Postgres.** What is not trivial is fetching them,
  which is why the read layer below exists.

## Official codes (`external_code`)

`external_code` holds the row's code in its country's official statistical classification
— INSEE's Code officiel géographique for France, Statistics Finland's maakunta/kunta
classifications for Finland. It is the key seeds and lookups dedupe on, because names are
not one: France has homonymous communes, and each DROM has a région and a département of
the same name. Sites carry NULL, which is why the column is nullable and its uniqueness
partial.

Uniqueness is `(country_code, type, external_code)`, not `(country_code, external_code)`.
France reuses the same code across levels — every one of the 18 région codes is also a
département code — and the two are unambiguous in the COG only because they ship as
separate files. `type` *is* that file, so the tuple expresses "the official code within
its own classification". Storing prefixed codes instead was rejected: the column would
stop holding the official code, breaking any join against upstream data.

**Rule: a lookup by official code always carries the level.** A code-only lookup is
ambiguous by construction in France, and the ambiguity is silent — it returns a
plausible row at the wrong level.

## Catalogs and generators

The exhaustive per-country lists ship as generated static assets in
`src/lib/locations/catalog/` — one JSON file per country, plus the shape contract and the
module that loads and reads them. Nodes are positional tuples `[code, name, children?]`
rather than objects: France's file is ~890 KB as tuples and roughly triple that with
repeated keys, paid 34,875 times.

The module's surface is small and deliberately pure: which countries ship a catalog, one
`import()`-per-country loader, and readers for tick identity and search. Two things about
it are load-bearing:

- **Rule: a catalog is loaded through a dynamic `import()`, never a static one.** France's
  JSON must never land in the main bundle; it is fetched as its own chunk the first time a
  user opens a picker, and everything after that is client-side.
- **A catalog node's identity is `(country, level, official code)`** — the same triple the
  table is unique on. That is what lets a UI which has only ever seen catalog entries hand
  a set of ticks to the row resolver without having read a row.

Two generators write from one shared module (`scripts/lib/location-classifications.mjs`),
which owns the downloads, the CSV/API parse, the level filtering and the canonical-name
rules:

- the catalog generator, which emits the JSON a human browses;
- the France commune seed generator, which emits the migration the query engine reads.

**Rule: a catalog name and the `locations.name` of the same place are built from one
parse.** They cannot be allowed to disagree — the same commune under two spellings reads
as two places — and sharing the parse makes that true by construction rather than by
review. Generator output is deterministic (code-unit ordering, no timestamps, fixed
chunking) so a regenerated file is diffable and a rerun is a no-op.

### Annual refresh

Both classifications are republished each January. The refresh procedure lives in the
shared module's header (release ids, expected counts, the exact steps). Its shape:

1. Bump the release identifiers and the asserted expected counts — a refresh that
   silently loses half a file fails at generation instead of shipping.
2. Rerun the catalog generator and commit the diff. Communes merge and rename, so expect
   churn; the diff *is* the review.
3. **Reconcile the database in a NEW migration, by hand.** Never regenerate an applied
   seed migration — it is history. Renames and merges can invalidate live references
   (products, sites, gedu coverage), so collapsing two rows or renaming one is a judgement
   call a human makes against the diff, not something a generator decides.

A row whose name has drifted from the new release keeps working; only its display name is
stale. A row whose code is gone is the case that needs a decision.

## Service-layer shape (this directory)

Standard service pattern: `LocationsService` takes an `AppSupabaseClient`, reads run on
the injected client, writes `fetch()` the admin API. `locations.queries.ts` exposes the
React Query hooks and the `locationKeys` factory; `locations.contracts.ts` holds the zod
schemas shared by route and service; `index.ts` re-exports.

The reads are all scoped, in two shapes:

**List reads** — one country's municipalities, every site, the sites under one parent.

**Rule: any list read that could exceed PostgREST's `max_rows` pages through `.range()`
until a page comes back short, and asks for `count: "exact"` so the walk can check what it
collected against the server's total.** `max_rows` is enforced by *truncating* the
response, not by erroring, so an unbounded select is indistinguishable from a complete
one; and if the cap is ever lowered below the page size then every page is short and a
naive walk silently returns a fraction of the rows. The shared `walkPages` primitive in
this directory implements both halves — use it rather than hand-rolling a loop.

**Rule: a paged read must impose a *total* order.** `name` alone is not one — DROM name
collisions and homonymous communes are both real — so order by `name` then `id`, or rows
shift between requests and the walk both duplicates and drops them.

**Keyed reads** — rows by id, rows by `(type, official code)`. These chunk their keys into
`in.(…)` batches sized well under `max_rows` and so cannot be truncated by construction;
that is *why* they do not page. A code lookup issues one request per level, because the
key includes the level. Both are lookups, not assertions: a key with no row is simply
absent from the result, and the caller decides whether that is a stale reference or a
refusal to surface.

### Rows with their chains

The list reads embed the ancestor chain via the FK on `parent_id` and flatten it to
`LocationWithChain` — the row plus `ancestors`, **nearest first**. Nearest-first is the
point: `ancestors[0]` is the level immediately above whatever the country, which France's
extra `district` level would otherwise make position-dependent. Reverse it for a
root-first breadcrumb.

Two embed depths exist because they answer different questions: a site needs four levels
(commune → département → région → country), a municipality needs three. Each embedded
level is an indexed lookup per row and the municipality query runs over 34,875 rows for
France, so it asks for the depth it needs and no more. The depths are spelled out as
literal select strings rather than built at runtime — the client infers the response shape
from the literal, and a computed string collapses it to `string`.

**Rule: the parent embed is written in the `parent:parent_id(…)` column-name form.** The
`locations!parent_id` form looks equivalent and resolves to the *children* instead,
returning `[]` for every leaf — a wrong answer that never errors.

### Writes

Two admin routes, both `fetch()`ed from the service (the injected client is deliberately
unused by write methods):

- **create** — the only thing it is used for is a `site`. The route re-checks the admin
  role and writes on the caller's own server-side client, so the route's answer and the
  table's `admin_manage_locations` policy both have to agree before a row lands.
- **update** — renames a row, same posture.

`authenticated` holds INSERT and UPDATE on `locations` but no DELETE, which is why there
is no delete route.

**Rule: nothing above `site` is ever created from the application.** Countries, regions,
districts and municipalities are seeded reference data. There is no "add a country"
dialog, no free-text creation of a commune, and no code path that inserts a missing
ancestor — a missing ancestor is a seeding problem and must surface as one. Typos and
duplicate spellings are therefore structurally impossible above site level.

**Rule: mutations invalidate via the key hierarchy** — a created site invalidates the
sites key (which is the parent of the per-municipality key, so both refresh); a rename
invalidates the row's detail key plus the lists that render it.

## Picking a place (UI)

Two components, two different sources, and the difference is the whole architecture.

- **`LocationList`** (`src/components/admin/products/`) browses **database rows**: a
  searchable, grouped, single-select list. It is used for the sets no catalog contains or
  orders — the venues that exist, and the Finnish municipalities an online club can be
  funded by. Both are small enough to search client-side in one pass.
- **`CatalogPicker`** (`src/components/locations/`) browses the **static catalog**: drill
  down by level or search the whole country instantly, with a shared dialog shell that
  picks the country, loads its chunk, and holds one fixed height across loading, failure
  and loaded. Search runs over a pre-normalized index built once per catalog,
  diacritic-insensitive in both directions and matching official codes too, capped at a
  rendered-result budget with the true match count still reported. An empty query falls
  back to drill-down, so browse and search share one panel with no mode switch.

Both are presentational and fixture-driven in the `/admin/ui-components` style guide: they
hold no business logic, so data and handlers are injected.

The catalog panel takes a **selection mode**:

- **single** confirms one leaf. Confirming writes nothing — the leaf is already a row, so
  the caller resolves the code and carries on.
- **multi** puts a checkbox on every level and additionally indexes the levels above the
  leaves, so a search finds a département and not only the communes spelled like it.

### The product picker

In-person products pick a **site**; online municipality clubs pick a **Finnish
municipality**. Neither mode reads the table as a tree.

- *Site mode* lists the venues that exist, grouped by the municipality above them with the
  rest of the chain as context. Opening a venue somewhere new is a two-step flow, because
  it answers two questions from two sources: *where in the world* comes from the catalog
  (browse or search, confirm one commune — spelling and code right by construction), and
  *which building* comes from an admin naming a site under it. Between them sits a plain
  resolution of the confirmed code to its seeded row: **resolve, never create**, and a
  code with no row is refused with the place named.
- *Municipality mode* is a scoped list of Finland's 308.

**Rule: the online-muni municipality restriction is UI-enforced.** The DB trigger still
permits a country or region for online muni clubs (it predates the rule), so the picker is
the gate — it offers only Finland's municipalities and clears a stored pick that is not
one, nudging a re-pick on legacy rows. A picker that cannot tell "still loading" from
"invalid" must not clear anything: wiping a valid `location_id` while editing a product is
worse than showing it a moment late.

## Per-country labels & hierarchy config

`SUPPORTED_COUNTRIES`, `resolveLabels`, `getChildLevel`, and the `HierarchyLevel`/
`nameI18n` types live in `src/lib/constants/location-hierarchies.ts` (re-exported from
`src/lib/constants`). This config table drives level labels and the naming of the level
below a given row. It is separate from the catalog list: the hierarchy config says what a
country's levels are *called*, the catalog says what its divisions *are*, and a country
can have the first without the second.

Localized labels apply **only** to the country whose language matches the user's UI locale
(a Finnish admin sees "Maakunta"/"Kunta" for Finland but plain English "Borough" for the
UK). `resolveLabels(level, locale)` picks the localized pair or falls back to the English
default; country names localize via `nameI18n`.

**Rule: Adding a country whose language is a supported UI locale requires `i18n` entries
on each hierarchy level plus a `nameI18n` entry.** A country whose language isn't a
supported UI locale needs none — English is the default.

Adding a country end to end is: hierarchy config, a generated catalog plus its arm in the
catalog loader, and a seed migration for its rows.

## Localized display names (`name_i18n`)

A location's `name` is the **canonical native-language name** — Finnish for FI rows,
French for FR rows, English for UK/US. `name_i18n` is a `jsonb` map of `locale → name`
overrides holding **only the rows that differ**, e.g. `{ "sv": "Helsingfors" }`. Seeded for
Finland: the official Swedish names of the regions and municipalities that have one,
sourced from Kotus (Institute for the Languages of Finland) and Government Decree
1385/2022. Rows whose Swedish name equals the Finnish (Satakunta; Korsnäs; Åland's
Swedish-only municipalities, already stored Swedish) get no entry, and most municipalities
are monolingual Finnish with no legal Swedish name at all.

**Rule: render location names through `localizedLocationName(loc, locale)`
(`src/lib/locations/localized-name.ts`), never raw `loc.name`.** It resolves
`name_i18n[locale] ?? name`, so every untranslated row, every admin-created site, and
every viewer whose locale has no override falls back to `name`. The viewer locale comes
from `useLocale()` (client) / `getLocale()` (server); the resolver takes a structural
`{ name, name_i18n }`, so an embedded chain node and a joined browse row work too.

**Rule: `name` is never duplicated into `name_i18n`.** Finland's own `fi` names live in
`name`, not under a `"fi"` key — the resolver falls back to `name` for the native locale.
Don't "helpfully" backfill a `fi` (or `fr`, or `en` for UK) key; the convention is *native
name in `name`, alternates in `name_i18n`*. This is also why we don't store traditional
exonyms of monolingual towns (Tampere → "Tammerfors"): those aren't the municipality's
*legal* name, and the column is for legal/official alternates.

**Search and slugs follow the same data.** Any list search over rows matches the canonical
name **plus** every alternate, so "Helsingfors" and "Helsinki" both find the row. The
`/schools/<slug>` link is built from the **viewer-locale** display name (a Swedish viewer
links to `helsingfors`), and slug resolution accepts the canonical *and* every alternate
slug — canonical first, so an exonym can never shadow another municipality's native slug.

Adding another locale (or another country's alternates) is data-only: add `name_i18n`
entries; no schema change, since the column is locale-agnostic jsonb (this is why we chose
it over per-locale `name_sv`/`name_xx` columns).

## Products ↔ locations

Every product is **either** remote (`is_remote = true`, `location_id IS NULL`) **or**
in-person (`is_remote = false`, `location_id` set) — enforced by a CHECK constraint. A
`BEFORE INSERT/UPDATE` trigger additionally requires any non-null `location_id` to
reference a `type = 'site'` row.

**Rule: Products pin only to `site` (leaf) locations — never to a region/city.** This
gives the ancestor-walk matcher a well-defined start point. Defence in depth: the product
form's zod rule disables submit until a leaf is chosen; the CHECK + trigger are the DB
backstop.

**Rule: `is_remote` and `spoken_language_code` on `products` are NOT NULL with no
DEFAULT — admins must explicitly pick both on every product.** No silent default at any
layer.

Product queries embed a product's location plus one level of parent, which is exactly
enough to derive the municipality it sits in: the schema allows only two shapes for a
municipality club — the municipality itself (online) or a site directly under it
(in-person). Surfaces that group clubs by municipality read that embed and never touch the
locations table.

## Gedu coverage

`gedu_locations` join table: `(gedu_id, location_id)` PK, both FKs `ON DELETE CASCADE`.
Gedus may claim rows at **any** level. A claim means "I cover this whole subtree."

RLS: a gedu reads/writes only their own rows and only if their role is `gedu` (actor +
target both checked); admins manage any row, for the user-detail view.

**Positive selection** — the semantics of the editor, not of the database:

- **One tick is one independent claim and one row.** Ticking a parent does **not** tick,
  pre-tick or half-tick its descendants, and unticking a descendant does not disturb any
  ancestor tick. A descendant showing as ticked would make the UI say something the saved
  rows do not. Drilling into a ticked région shows its départements unticked, which is
  correct: they are covered by the ancestor's row, not by rows of their own.
- **There is no cascade.** With an exhaustive catalog a gedu ticks exactly what they
  cover, so nothing needs to enumerate descendants to express a gap ("Uusimaa except
  Helsinki" is just the other municipalities, ticked). Matching reads any one of the rows,
  so enumerating would only multiply rows that say the same thing.
- **An empty selection is valid** — the gedu is remote-only.
- **A tick is identified by `(country, level, official code)`**, so the editor holds
  catalog identities and resolves them to row ids at save. Resolution is a lookup, not an
  assertion: a code with no row must be **refused with the place named**, never silently
  dropped — a coverage set quietly missing a claim the gedu just made is worse than a
  failed save.
- **Rows the catalog cannot show** — sites (no official code), country rows, and anything
  in a country that ships no catalog — stay valid for matching and render as read-only
  chips the gedu can remove but not re-add.

The editor is mounted on the gedu settings page, the admin user-detail page, and the
public `/register-gedu` form, which resolves its ticks at submit (`locations` is
anon-readable, so no account need exist yet). The tick semantics, the row→tick split and
the resolution pairing are pure helpers next to the components, so they unit-test without
mounting anything. The committing rule applies to the save button.

## Chains and matching

- **Breadcrumb / full path** — read the embedded ancestor chain the scoped queries already
  return and reverse it. Nothing walks the table client-side to render a path.
- **Substitute matching** — collect the product's location ancestor chain (its
  `location_id` up to the root), then select the distinct gedus with a `gedu_locations` row
  for any link in that chain. A product at a site matches every gedu who claimed that
  site, its municipality, its region or its country — the "claim means subtree" semantics
  are what make an ancestor row sufficient. Language matching
  (`products.spoken_language_code ∈ profiles.spoken_languages`) layers on as an additional
  `AND`.
