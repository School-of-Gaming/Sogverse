# Locations

Hierarchical geographic system mapping products and gedus to places, powering substitute
matching, and supporting international expansion. This directory holds the locations
service layer; the UI and the per-country config live in sibling modules noted below.

## The invariant

**One table is the source of truth, and every read of it is bounded by what is on
screen.**

There is no second copy of the geography anywhere — no shipped catalog, no per-country
asset, no client-side index. The `locations` table is fully seeded from the official
statistical classifications and everything reads it: foreign-key integrity, ancestor
chains, substitute matching, and the picker a human browses. What makes that affordable
is not caching the table but never asking for more of it than a screen shows:

- **Browsing** fetches the children of the node the user opened, one page at a time. A
  country is depth 0 of the same tree, so opening the picker and opening a région are the
  same request against the same index.
- **Search** is a ranked, capped, server-side query returning a top-N plus the true match
  count. Nothing is filtered in the browser.
- **The bounded lists** a surface genuinely needs in full — every venue, one country's
  municipalities — are read whole and grouped client-side, because they are hundreds of
  rows and grouping them by the place above them is a view the tree cannot give.

The payload is therefore O(what is rendered) and constant as countries are added.

**Rule: never ship the geography to the browser as an asset.** Bundling a country is
roughly 8 bytes per place — France alone is 286 KB gzipped — so it buys instant search at
a price that scales with the country rather than the screen, and a "bundle the small ones,
lazy-load the big ones" threshold makes every new country a judgement call. Every read
below is a consequence of not doing that.

## Data model

One self-referential `locations` table (adjacency list): each row has a nullable
`parent_id` pointing at another row. A `location_type` enum (`country`, `region`,
`municipality`, `district`, `site`) classifies each level. Arbitrary depth, shallow in
practice (3–5 levels).

Columns: `id`, `name`, `name_i18n` (jsonb, see below), `type`, `parent_id` (FK to
`locations`, `ON DELETE RESTRICT`), `country_code` (ISO 3166-1 alpha-2, **denormalized on
every row** so country filtering needs no recursion), `external_code` (nullable, see
below), `search_blob` (generated, see below), `created_at`, `updated_at`.

Hierarchy is flexible, not rigid — not every country uses every level (Finland skips
`district`). A `country` row has `parent_id IS NULL`, which is what makes "the countries"
a browse level rather than a special case. Per-country level naming (region =
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
  already there, and the UI that pointed at it was looking at that very row. Nothing
  above `site` is ever inserted by the application.
- **A seed is idempotent and asserted.** Inserts are `NOT EXISTS`-guarded on the code key
  and the migration ends by asserting the exact row count, zero orphans and zero
  code-less rows, so a half-applied seed fails loudly rather than shipping.
- **35k reference rows are trivial for Postgres.** What is not trivial is fetching them,
  which is why the read layer below exists.

## Official codes (`external_code`)

`external_code` holds the row's code in its country's official statistical classification
— INSEE's Code officiel géographique for France, Statistics Finland's maakunta/kunta
classifications for Finland. It is the key seeds and reconciliations dedupe on, because
names are not one: France has homonymous communes, and each DROM has a région and a
département of the same name. Sites carry NULL, which is why the column is nullable and
its uniqueness partial.

Uniqueness is `(country_code, type, external_code)`, not `(country_code, external_code)`.
France reuses the same code across levels — every one of the 18 région codes is also a
département code — and the two are unambiguous in the COG only because they ship as
separate files. `type` *is* that file, so the tuple expresses "the official code within
its own classification". Storing prefixed codes instead was rejected: the column would
stop holding the official code, breaking any join against upstream data.

**Rule: a lookup by official code always carries the level.** A code-only lookup is
ambiguous by construction in France, and the ambiguity is silent — it returns a plausible
row at the wrong level. Nothing at runtime does such a lookup (browsing and searching both
deal in rows), so this binds reconciliation queries and migrations; it is still the shape
any of them must take.

The code is **searchable**, which is the one place it reaches a user: an admin working
from a published list has the code in front of them rather than the spelling.

## The generator

`scripts/generate-france-communes-migration.mjs` emits the France commune seed migration,
over the download/parse/naming module in `scripts/lib/`. Its output is fully deterministic
— code-unit ordering, no timestamps, fixed chunking, explicit transaction — so a rerun
against the same release is byte-identical. Finland has no generator and never had one;
its rows were seeded by hand-written migrations, and its refresh is a hand-written
migration too.

**Rule: never regenerate an applied seed migration.** It is history. Renames and merges
between annual releases can invalidate live references (products, sites, gedu coverage),
so collapsing two rows or renaming one is a judgement call a human makes against the
diff, not something a generator decides — reconcile in a *new* migration. A row whose
name has drifted from the new release keeps working; only its display name is stale. A row
whose code is gone is the case that needs a decision.

Refreshing is deliberately unscheduled: the classifications are republished each January,
but stale official names cost nothing until a place we operate in is affected. The
procedure lives in the generator module's header.

## Search

### The stored fold

Every string a row should be findable by — its canonical name, each `name_i18n`
alternate, its official code — is folded (diacritics stripped, lowercased) and joined into
one generated column, each term wrapped in a control-character separator that cannot occur
in a place name. A GIN trigram index over that column serves the whole query, and the
separator is what turns ranking into arithmetic on one string:

| pattern contains | means |
|---|---|
| the needle | the row matches somewhere (infix) |
| separator + needle | some term starts with the needle (prefix) |
| separator + needle + separator | some term *is* the needle (exact) |

**Rule: diacritic folding applies to the needle and the stored side alike.** "nimes" must
find Nîmes *and* "Nîmes" must find it, and a user who types the accent correctly must
never get fewer results than one who does not. One-sided folding passes the obvious test
and fails the other direction silently.

**Rule: `unaccent()` is `STABLE`, not `IMMUTABLE`, so it cannot appear in an index
expression or a generated column.** Wrap it in an `IMMUTABLE` function that pins the
dictionary explicitly. The promise that wrapper makes is that the dictionary is installed
once and never redefined; if it ever is, every stored fold has to be recomputed and the
index rebuilt. This is the classic trap in this area and it fails at DDL time, not at
query time — which is the good outcome, but only if you recognise it.

**Rule: LIKE metacharacters in a needle are escaped, not stripped.** A user typing `%`
should find nothing, not everything.

The fold is **stored, not an index expression**, and deliberately: needles shorter than
three characters yield no trigram, so those queries are a sequential scan, and re-folding
tens of thousands of jsonb documents on every such keystroke is a second or more. Against
a stored column the same scan is a plain text comparison. The cost is that the column
rides along in `select(*)` responses; the rows that reach a browser are counted in
hundreds, so that is the cheaper side of the trade. Nothing outside the database reads it.

### Ranking

**Rule: rank the whole match set, then cap — never cap then sort.** At France's scale a
two-letter needle matches thousands of communes, and an alphabetically early *infix* match
sits ahead of the prefix match a user is obviously reaching for. Ordering by rank first
(exact, then term-prefix, then infix), then by level, then by name, is what puts
"Ille-sur-Têt" above "Abbeville" for the needle "ille". A query that filtered and ordered
by name alone would look correct on a small fixture and be useless on the real table.

**Rule: the cap is a rendering budget, and the true match count is reported alongside
it.** The panel says "showing N of M" off that gap; without it a capped list is
indistinguishable from a complete one.

### RPC, not PostgREST

Search is one `RETURNS jsonb` RPC rather than a filtered table read, for four reasons a
PostgREST query cannot cover: the fold has to be applied to the needle server-side, the
ranking is an expression PostgREST has no way to express, the answer is one document with
two parts (a page and a total, not a page whose total is a header), and each hit carries a
nested ancestor chain a client would otherwise fetch per row. Returning jsonb rather than
a table also keeps the total from being repeated on every row; the wire shape is parsed
through the feature's zod contract at both ends and by the db tests.

**Rule: the search function is `SECURITY INVOKER`.** The caller's own RLS on `locations`
then decides every row it can see, exactly as a direct select would, so the function
cannot answer with anything a plain read would not already return. That is also what makes
the route in front of it publicly cacheable — see below — and what lets it be classified
as self-scoping in the DB authorization spine rather than needing a role gate it could not
have.

### The abuse surface, and what bounds it

The educator registration page is **public and unauthenticated**, and it types into this
box before an account exists. A public catalogue page will do the same. Four bounds, at
three layers, and each one is load-bearing on its own:

- **A minimum needle length, enforced in the database as well as the client.** Under it
  the function returns an empty result without reading the table at all. The client stops
  sending and the database stops answering, so a caller that skips the UI still cannot ask
  for a one-character scan.
- **A hard server-side cap on the returned row count**, clamped rather than rejected, so
  the page-size parameter cannot be turned into a bulk export.
- **Debounce on the value, not the handler** — the input stays instant and only the query
  lags, so a typist spends one request per word rather than one per letter.
- **A cached API route rather than raw per-keystroke PostgREST.** The route reads no
  session at all: it builds an anonymous client on purpose, so its answer depends only on
  the URL and a shared cache can serve the popular needles without a database round trip.
  *"The answer does not depend on who asks" is the property that makes a public shared
  cache safe*, and it is why the route must not be "improved" by giving it the caller's
  session. It also applies the length floor and the page cap before anything reaches
  Postgres, and takes the level filter as one delimited parameter so the same question is
  always the same URL.

Worth being clear about what this does *not* defend: `locations` is anon-readable in full
through PostgREST already, so none of the above is protecting the data. It is protecting
the database's CPU from a keystroke-rate query, and the route is the cheapest place to say
no.

## Service-layer shape (this directory)

Standard service pattern: `LocationsService` takes an `AppSupabaseClient`, reads run on
the injected client, writes `fetch()` the admin API. `locations.queries.ts` exposes the
React Query hooks and the `locationKeys` factory; `locations.contracts.ts` holds the zod
schemas shared by route and service plus the search RPC's result shape; `index.ts`
re-exports.

Search is the **one read that goes through a route** rather than the injected client, for
the caching reason above; the injected client is deliberately unused by it, as it is by
the write methods.

The reads come in three shapes.

**Paged reads** — one level of the tree. One request, one screenful, plus the true total
so the caller knows whether to offer another page. Pages accumulate rather than replace,
so "load more" appends under rows the user is already reading.

**Whole-list reads** — one country's municipalities, every site. These a surface genuinely
needs in full, to group.

**Rule: any list read that could exceed PostgREST's `max_rows` pages through `.range()`
until a page comes back short, and asks for `count: "exact"` so the walk can check what it
collected against the server's total.** `max_rows` is enforced by *truncating* the
response, not by erroring, so an unbounded select is indistinguishable from a complete
one; and if the cap is ever lowered below the page size then every page is short and a
naive walk silently returns a fraction of the rows. The shared paging primitive in this
directory implements both halves — use it rather than hand-rolling a loop.

**Rule: a paged read must impose a *total* order.** `name` alone is not one — DROM name
collisions and homonymous communes are both real — so order by `name` then `id`, or rows
shift between requests and the walk both duplicates and drops them. This binds the
one-page-at-a-time reads exactly as hard as the walking ones: a page boundary under a
partial order silently drops rows a user was about to scroll to.

**Keyed reads** — rows by id. These chunk their keys into `in.(…)` batches sized well
under `max_rows` and so cannot be truncated by construction; that is *why* they do not
page. A key with no row is simply absent from the result — a lookup, not an assertion.

### Rows with their chains

The list and keyed reads embed the ancestor chain via the FK on `parent_id` and flatten it
to a row plus `ancestors`, **nearest first**. Nearest-first is the point: `ancestors[0]` is
the level immediately above whatever the country, which France's extra `district` level
would otherwise make position-dependent. Reverse it for a root-first breadcrumb. The
search RPC returns the same shape, so a place found by searching and a place found by
browsing are one thing to every consumer.

Two embed depths exist because they answer different questions: a site needs four levels
(commune → département → région → country), a municipality needs three. Each embedded
level is an indexed lookup per row and the municipality query runs over 34,875 rows for
France, so it asks for the depth it needs and no more. The depths are spelled out as
literal select strings rather than built at runtime — the client infers the response shape
from the literal, and a computed string collapses it to `string`.

**Rule: the parent embed is written in the `parent:parent_id(…)` column-name form.** The
`locations!parent_id` form looks equivalent and resolves to the *children* instead,
returning `[]` for every leaf — a wrong answer that never errors.

**Rule: browsing the tree filters on `parent_id` with `is.null` at the root, never `eq`.**
`eq` against NULL matches nothing, and the failure mode is an empty picker rather than an
error.

### Writes

Two admin routes, both `fetch()`ed from the service (the injected client is deliberately
unused by write methods):

- **create** — the only thing it is used for is a `site`. The route re-checks the admin
  role and writes on the caller's own server-side client, so the route's answer and the
  table's admin-manage policy both have to agree before a row lands.
- **update** — renames a row, same posture.

`authenticated` holds INSERT and UPDATE on `locations` but no DELETE, which is why there
is no delete route.

**Rule: nothing above `site` is ever created from the application.** Countries, regions,
districts and municipalities are seeded reference data. There is no "add a country"
dialog, no free-text creation of a commune, and no code path that inserts a missing
ancestor — a missing ancestor is a seeding problem and must surface as one. Typos and
duplicate spellings are therefore structurally impossible above site level.

**Rule: mutations invalidate via the key hierarchy** — a created site invalidates the
sites key (the parent of the per-municipality key, so both refresh) *and* the browse level
it landed in; a rename invalidates the row's detail key, the lists that render it, and
every cached search needle, since a rename changes what search matches.

## Picking a place (UI)

Two components, and the difference between them is what each is asked to show.

- **The tree picker** (`src/components/locations/`) browses and searches the hierarchy: a
  presentational panel plus a container that owns the browse position, the debounced
  query and the two server reads. It opens on the countries and drills down; typing
  searches everywhere from the first keystroke past the minimum length; clearing the box
  drops back to where the user was browsing, so browse and search share one panel with no
  mode switch.
- **The grouped list** (`src/components/admin/products/`) renders a bounded set the
  surface has already fetched in full, grouped under headers, searched client-side in one
  pass. It exists for the two views a tree cannot give: the venues that exist grouped by
  the municipality above them, and the Finnish municipalities an online club can be funded
  by.

Both are presentational and fixture-driven in the `/admin/ui-components` style guide: they
hold no business logic, so data and handlers are injected.

**Rule: there is no country to choose before browsing.** The country dropdown and the
"default country" concept existed only because the data was sharded one file per country;
with the tree served from one table they would be a step that answers nothing. A user
looking for Tampere types "Tampere".

The panel takes a **selection mode**:

- **single** confirms exactly one row, of one of the caller's `pickableTypes`. A row of a
  pickable type is *terminal* — clicking it selects rather than descends — so the level a
  caller asked for is where browsing stops. Confirming hands back the row itself plus its
  ancestors, which is everything needed both to write the foreign key and to render the
  place with its path, with nothing left to look up.
- **multi** puts a checkbox on every row at every level, and each tick is an independent
  claim (see Gedu coverage below).

**Rule: in multi mode, ticking and descending are never the same click.** The checkbox
makes the claim; a separate affordance opens the row. Someone looking for Helsinki clicks
"Uusimaa" expecting to see its municipalities, not to claim the whole region.

**Rule: a `site` row is a leaf.** Nothing is ever parented under one, so the panel treats
that structurally rather than asking.

**Rule: drilling into a row sets the breadcrumb to that row's ancestors, reversed, plus
the row — never appends to wherever the breadcrumb already was.** Appending is right only
while browsing, where the walk *is* the ancestry, and silently wrong from a search hit,
which was never walked to: it leaves the breadcrumb claiming a Helsinki school sits
directly beneath the root. Rebuilding is correct both ways and reduces to appending while
browsing, so there is no second code path and no flag saying which kind of row this was.

### The parent's own location

An optional single row on a parent's profile — asked for on the registration form, edited
from settings — picked at the **municipality** level, the one directly above a venue.

**Rule: a control that picks a place is one control — the box showing the current value is
itself the trigger — and its label is the generic "location".** Splitting the value and a
"choose" button across two rows makes one control look like two and forces the button
caption to name the level being picked. Every such caption is wrong for somebody: a
viewer's *locale* says which language to render, not which country they live in or what
that country calls this level, so a Finnish-locale parent picking a French commune gets
told to pick a kunta. Country-specific vocabulary belongs inside the dialog, below the
country they chose — this is the locale-vs-spoken-language distinction in the root
`CLAUDE.md`, in a third dimension.

### The product picker

In-person products pick a **site**; online municipality clubs pick a **Finnish
municipality**. Neither mode browses the tree — both render a bounded, already-fetched set
grouped by the place above it, because an admin picking a venue wants the venues, not a
path to them.

Opening a venue somewhere new is a two-step flow, because it answers two questions from
two sources: *where in the world* is answered by browsing or searching the hierarchy and
confirming one municipality, and *which building* by an admin naming a site under it.
There is nothing between the two steps: the confirmed pick is the row, so it is already
the venue's parent.

**Rule: the online-muni municipality restriction is UI-enforced.** The DB trigger still
permits a country or region for online muni clubs (it predates the rule), so the picker is
the gate — it offers only Finland's municipalities and clears a stored pick that is not
one, nudging a re-pick on legacy rows. A picker that cannot tell "still loading" from
"invalid" must not clear anything: wiping a valid `location_id` while editing a product is
worse than showing it a moment late.

### Loading

**Every read in this feature is a small indexed lookup, so none of them gets a loading
affordance.** One level of children by `parent_id`, a capped top-N from the search index,
one municipality's venues, a bounded list to group — each lands in a frame or two. Every
box has its final height from the first frame and fills in: no skeleton, no spinner and no
delay anywhere here. The root `CLAUDE.md` states the general rule this is an instance of;
a skeleton reappearing in this directory means a read has changed shape, and that is the
thing to look at.

## Per-country labels & hierarchy config

`SUPPORTED_COUNTRIES`, `resolveLabels`, `getChildLevel`, and the `HierarchyLevel`/
`nameI18n` types live in `src/lib/constants/location-hierarchies.ts` (re-exported from
`src/lib/constants`). This config table drives level labels and the naming of the level
below a given row: it says what a country's levels are *called*, while the table says what
its divisions *are*.

Localized labels apply **only** to the country whose language matches the user's UI locale
(a Finnish admin sees "Maakunta"/"Kunta" for Finland but plain English "Borough" for the
UK). `resolveLabels(level, locale)` picks the localized pair or falls back to the English
default; country names localize via `nameI18n`.

**Rule: Adding a country whose language is a supported UI locale requires `i18n` entries
on each hierarchy level plus a `nameI18n` entry.** A country whose language isn't a
supported UI locale needs none — English is the default.

Adding a country end to end is now two things: hierarchy config, and a seed migration for
its rows. It appears in the picker, in search and in coverage the moment its rows exist —
there is no asset to generate, no loader arm to add, and no bundle-size judgement call
about whether it is small enough to ship.

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
`{ name, name_i18n }`, so an embedded chain node, a search hit and a joined browse row all
work.

**Rule: `name` is never duplicated into `name_i18n`.** Finland's own `fi` names live in
`name`, not under a `"fi"` key — the resolver falls back to `name` for the native locale.
Don't "helpfully" backfill a `fi` (or `fr`, or `en` for UK) key; the convention is *native
name in `name`, alternates in `name_i18n`*. This is also why we don't store traditional
exonyms of monolingual towns (Tampere → "Tammerfors"): those aren't the municipality's
*legal* name, and the column is for legal/official alternates.

**Search and slugs follow the same data.** Every alternate is folded into the search
index alongside the canonical name, so "Helsingfors" and "Helsinki" both find the row
wherever the search runs. The `/schools/<slug>` link is built from the **viewer-locale**
display name (a Swedish viewer links to `helsingfors`), and slug resolution accepts the
canonical *and* every alternate slug — canonical first, so an exonym can never shadow
another municipality's native slug.

Adding another locale (or another country's alternates) is data-only: add `name_i18n`
entries; no schema change, since the column is locale-agnostic jsonb (this is why we chose
it over per-locale `name_sv`/`name_xx` columns). The generated search fold picks the new
alternates up on write, with no reindexing step.

## Products ↔ locations

**`is_remote` is the only field that says how a product is delivered.** `location_id` says
where it *belongs*, and which levels it may point at depends on the product type as well as
the delivery mode. Three CHECK constraints plus a `BEFORE INSERT/UPDATE` trigger on
`products` together permit exactly three shapes:

| Product | `is_remote` | `location_id` |
|---|---|---|
| In-person, any type | `false` | required, must be a `site` row |
| Online municipality club | `true` | required, must be a `country`, `region` or `municipality` row |
| Online, any other type | `true` | must be `NULL` |

The trigger also refuses a `location_id` referencing no row at all, raising a
foreign-key violation instead of letting the write through.

**Rule: an in-person product pins to a `site` (leaf) location — never to a municipality,
region or country.** This gives the ancestor-walk matcher a well-defined start point.
Defence in depth: the product form's zod rule disables submit until a leaf is chosen; the
CHECK + trigger are the DB backstop.

**Rule: `is_remote` and `spoken_language_code` on `products` are NOT NULL with no
DEFAULT — admins must explicitly pick both on every product.** No silent default at any
layer.

### A municipality club's location is a municipality reference, not a delivery mode

A municipality club is funded by one Finnish municipality, and its `location_id` is how
that ownership is recorded — **in both delivery modes, at whichever level the mode
requires**: an online club points at the municipality row itself, an in-person one at a
site inside it. A site is only ever created directly beneath the municipality an admin
confirmed, so the municipality sits at depth 0 or 1 either way. Both shapes assert the same
thing — this is the municipality paying for the club, and therefore the municipality whose
parents see it when they browse.

**Rule: never read `location_id` presence, or its value, as a delivery-mode proxy.** On a
consumer club the two happen to coincide (online means no location at all), so code written
for that type reads as though a location implied in-person. A municipality club always has
one, so on that type the inference is simply false — and the failure is silent: the surface
renders its online clubs and quietly omits every in-person one. Ask `is_remote`.

**Rule: a surface that groups, filters or scopes clubs by municipality resolves membership
— it never compares `location_id` against a municipality id.** Resolving means taking the
club's own location and stepping up to the nearest municipality, itself included, which
lands both shapes in the same bucket; an equality test keeps only the online half. One
resolver in `src/lib/locations/` implements this for every such surface — a per-surface
hand-rolled filter is how the two ends of one feature came to disagree, one listing a
municipality and the other 404ing it.

Membership is municipality-exact, with no cascade: a club anchored to a region or a country
— legacy data the trigger still permits for online muni clubs, per the UI-enforced
restriction above — resolves to *no* municipality rather than lighting up every
municipality beneath it.

Delivery mode stays an orthogonal axis on top of membership. A page scoped to one
municipality shows both modes by default and offers online/in-person as its own filter, so
the two dimensions never collapse into each other.

Product queries embed a product's location plus one level of parent, which is exactly the
depth those two shapes need. Surfaces that group clubs by municipality read that embed and
never touch the locations table.

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
- **There is no cascade.** A gedu ticks exactly what they cover, so nothing needs to
  enumerate descendants to express a gap ("Uusimaa except Helsinki" is just the other
  municipalities, ticked). Matching reads any one of the rows, so enumerating would only
  multiply rows that say the same thing.
- **An empty selection is valid** — the gedu is remote-only.
- **A tick is a row id, from the moment it is made to the moment it is written.** The
  picker browses the table, so a ticked node is already a row. There is nothing to resolve
  at save time, and therefore no class of claim the editor can display but not store: a
  venue, a country row and a place in a country nobody has built a UI for are all just
  rows, tickable and untickable alike. Any design that gives a tick an identity other than
  its row id reintroduces a resolution step, a way for a save to be refused because the
  place has no record, and a bucket of chips a gedu can remove but never re-add.

The editor is mounted on the gedu settings page, the admin user-detail page, and the
public `/register-gedu` form, which submits its ticks with the registration (`locations` is
anon-readable, so no account need exist yet). The tick semantics are pure helpers next to
the components, so they unit-test without mounting anything. The committing rule applies to
the save button.

## Chains and matching

- **Breadcrumb / full path** — read the ancestor chain the reads already return and
  reverse it. Nothing walks the table client-side to render a path.
- **Substitute matching** — collect the product's location ancestor chain (its
  `location_id` up to the root), then select the distinct gedus with a `gedu_locations` row
  for any link in that chain. A product at a site matches every gedu who claimed that
  site, its municipality, its region or its country — the "claim means subtree" semantics
  are what make an ancestor row sufficient. Language matching
  (`products.spoken_language_code ∈ profiles.spoken_languages`) layers on as an additional
  `AND`.
