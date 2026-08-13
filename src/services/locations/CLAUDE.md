# Locations

Hierarchical geographic system mapping products and gedus to places, powering substitute
matching, and supporting international expansion. This directory holds the locations
service layer; the UI and the per-country config live in sibling modules noted below.

## The invariant

**One table is the source of truth, and every read of it is bounded by what is on
screen.**

There is no second copy of the geography anywhere — no shipped catalog, no per-country
asset, no client-side index. The `locations` table is fully seeded from GeoNames — one
source and one authority for every country — and everything reads it: foreign-key
integrity, ancestor
chains, substitute matching, and the picker a human browses. What makes that affordable
is not caching the table but never asking for more of it than a screen shows:

- **Browsing** fetches the children of the node the user opened, one page at a time. A
  country is depth 0 of the same tree, so opening the picker and opening a région are the
  same request against the same index.
- **Searching the hierarchy** is a ranked, capped, server-side query returning a top-N
  plus the true match count, over names, official codes and postal codes at once. Nothing
  that could match the whole table is filtered in the browser.
- **The bounded lists** a surface genuinely needs in full — one country's municipalities,
  one municipality's venues — are read whole and listed client-side. What makes such a
  list legitimate is that something *outside the geography* bounds it: a municipality club
  is funded by one Finnish kunta and by nothing else, and a venue list is the children of
  one confirmed row. Both stay in the hundreds however many countries are added. A list
  bounded by nothing but "this is all anyone has created so far" is the shape to be
  suspicious of — the venue picker was one, and is a tree dialog now.

  **Being bounded earns a list the right to be read whole; it does not make it the right
  way to *pick* from.** Both bounded lists above are read by pages that render the whole
  collection as their content — a directory, a venue list inside a confirmed place — and
  no picker fetches one any more. Finland's 308 kuntaa were the last that did, and the
  tree dialog reaches any of them in three keystrokes against an index that also covers
  the ~34,900 French communes it never held.

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
below), `search_blob` (generated, see below), `geonames_id`, `retired_at`, `depth` (see
below), `created_at`, `updated_at`.

**`country_code` on a `site` is derived from the parent row, server-side, and any value
the client sent is discarded.** The column exists to make country filtering
recursion-free, which means the parent's code is the only value that can be right; a
caller-supplied one is a second source of truth for a field with exactly one. The venue
dialog does send the right code, and that is beside the point — country-scoping the
dialog depends on the invariant holding for every row, not for every well-behaved client.

### The three columns the data supply runs on

`geonames_id`, `retired_at` and `depth` are the database's business rather than any
surface's. **No read selects one**, and the row alias the application uses excludes all
three, alongside `search_blob`.

- **`geonames_id`** is the upstream key for a sourced row, unique where present. It is
  what ingestion and sync dedupe on, because names are not a key and official codes are
  reused across levels. NULL on sites and on any row an upstream source does not model.
  It is **not** `external_code` and never holds an official code — the two are separate
  columns with separate contracts.
- **`retired_at`** is how a refresh removes a place without deleting a row, and the split
  it creates between reads is the point of it. `gedu_locations.location_id` is
  `ON DELETE CASCADE`, so deleting a superseded place silently erases a gedu's coverage;
  nothing on a refresh path may delete. **Reads that *offer* a place filter retired rows
  out** — browsing a level, the municipality directory, the postal lookup (on its
  `postal_codes` read, through the relation, so no application row selects the column),
  the search function (in its match
  set, so the reported total drops them too). What puts a read on this side is what it is
  *for*, never which table it starts from: a postal code is a way of reaching a
  municipality to pick, so it answers like every other way of reaching one.
  **Keyed reads deliberately do not**: a
  stored pick must keep resolving, and the three-state guard's "absent vs invalid"
  distinction depends on a retired row answering as a *valid* pick rather than as a
  deleted one. The ancestor walk climbs **through** retired rows as well, because a chain
  has to render whole — retirement hides a place from being *chosen*, never from being
  *named*. Nothing retires a `site`.
- **`depth`** is the row's distance from the root: 0 for a country, parent + 1 below,
  maintained by a `BEFORE INSERT/UPDATE` trigger and never written by hand. It is what
  lets search rank broadest-first for any hierarchy shape. Its one limit is written into
  the trigger's own comment: a row trigger cannot re-depth a row's *descendants*, so
  re-parenting a node that has any would leave them stale — nothing does that, since
  nothing above `site` is created or moved by the application and sites are leaves.

Hierarchy is flexible, not rigid — not every country uses every level (Finland skips
`district`). A `country` row has `parent_id IS NULL`, which is what makes "the countries"
a browse level rather than a special case. Per-country level naming (region =
maakunta/state/prefecture, etc.) is metadata, not separate types.

**Rule: `parent_id` uses `ON DELETE RESTRICT`** — never let a delete orphan child
locations.

## What is seeded

Every supported country is seeded complete, from **GeoNames**, by data-only migrations:

| | Finland | France | Sweden | United Kingdom |
|---|---|---|---|---|
| Levels | region, municipality | region, district, municipality | region, municipality | region, municipality |
| Rows | 19 maakuntaa + 308 kuntaa | 18 régions + 101 départements + ~34,900 communes | 21 län + 290 kommuner | 4 nations + 217 local authorities |

Plus one `country` row each. **Whether a seeded row carries an official code is a fact
about its country, not a universal one** — see below for the kinds that do not.

The UK is the country whose shape is worth reading before adding another, because it
breaks two things the first three share. Its local-authority level is assembled from
**two** of GeoNames' rungs — every ADM2 row outside Greater London, plus the 33 ADM3
London boroughs inside it, since upstream files London one rung deeper than the rest of
the country. Greater London's own row is deliberately not seeded (the boroughs are the
authorities a family deals with), so every UK authority sits at the same depth under its
nation whichever rung upstream put it on. And no UK row below the country carries an
`external_code` at all, because GeoNames' GB admin codes are its own invention. Both are
config, not code.

**Rule: GeoNames is the single source *and* the single authority for every country's
geography, with no country special-cased.** There is no dual regime where some countries
follow their national statistical classification and others follow GeoNames; Finland and
France were cut over to it precisely so that no such fork exists. What that buys is one
procedure for adding a country and one for keeping any country current. What it costs is
named rather than hidden: currency for every country is GeoNames' currency, which has run
six weeks behind a Finnish merger and five years behind an abolition, and a handful of
places are spelled the way upstream spells them rather than the way the national list
does. **A wrong name or a stale row is fixed in GeoNames, never with a local override** —
local overrides are the curated data this supply exists to stop owning, and they drift
silently the moment upstream corrects itself.

Consequences worth holding onto:

- **Nothing mints a place row on demand.** A commune a product or a gedu points at is
  already there, and the UI that pointed at it was looking at that very row. Nothing
  above `site` is ever inserted by the application.
- **A seed is idempotent and asserted.** Inserts are `NOT EXISTS`-guarded on
  `geonames_id` and the migration ends by asserting the exact row count, zero orphans and
  zero rows without an upstream key, so a half-applied seed fails loudly rather than
  shipping. It also asserts zero code-less rows **at the levels its config maps a code
  for** — a country that maps none emits no such check, because the claim would be
  vacuous there and an unconditional one would have to be either wrong or deleted.
- **35k reference rows are trivial for Postgres.** What is not trivial is fetching them,
  which is why the read layer below exists.

## Official codes (`external_code`)

`external_code` holds the row's code in its country's official statistical classification
— INSEE's Code officiel géographique for France, Statistics Finland's maakunta/kunta
classifications for Finland, SCB's kommun codes for Sweden. **The contract is the code;
the supplier is GeoNames**, whose admin-code columns carry those same national codes and
are what the seeds read them out of. That is the whole reason the upstream key lives in
its own `geonames_id` column: a join against official data (postal files, any national
dataset) keeps working exactly as before, and changing where our rows come from did not
change what this column means.

Two kinds of row carry NULL, which is why the column is nullable and its uniqueness
partial: `site` rows, which exist in no national classification, and a level whose config
declares no official code because upstream does not carry one for that country.

**The United Kingdom is the named case of the second kind, and it is a whole country
rather than one level.** GeoNames' GB admin codes (`A3`, `B9`, `GLA`, `Z5`…) are its own
invention and correspond to no ONS or GSS code, so the config maps none and every UK row
below the country carries NULL. What that costs is stated rather than hidden:
**official-data joins are forfeited for the UK** — postal data included, which is why its
postal ingestion will have to key on the postal file's own admin columns through
`geonames_id` instead of on this column. What it does not cost is identity or
reconciliation: `geonames_id` is what ingestion, sync and every dedupe run on, and every
UK row has one. The alternative — storing GeoNames' invented codes here — would put a
value in the column that satisfies its shape and breaks its contract, which is worse than
NULL because nothing downstream could tell.

**Rule: a claim about `external_code` is scoped by country and level, never made of the
table.** "Every seeded row carries its official code" was true when three countries were
seeded and is false now; the claim that generalizes is *uniformity* — a level either maps
a code for its country or it does not, so a level with some coded rows and some code-less
ones is a seed that went wrong. That is the shape the DB tests assert in.

It is the key seeds, reconciliations and the FI/FR cutover's re-point dedupe on, because
names are not one: France has homonymous communes, and each DROM has a région and a
département of the same name. `geonames_id` is what *ingestion* dedupes on instead —
official codes are reused across GeoNames' live/historic split, so they are not a key
there.

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

## The generator, and adding a country

One generator serves every country: `scripts/generate-geonames-seed.mjs <CC>`, over the
ingestion module in `scripts/lib/geonames/`. **Adding a country is a config entry plus a
run** — there is deliberately no country-specific executable code anywhere, and every
shape the dumps come in (a country that is several ISO files, a file whose columns shift,
a level upstream models nowhere, a level of ours assembled from two of theirs, a country
with no official codes at all) is absorbed by a field in
`scripts/lib/geonames/config.mjs` rather than by a branch in code. That module's header
documents each field and the verified failure it answers; read it before writing an entry.

Two things about an entry are irreducible human judgment and are checked empirically
rather than trusted: the **expected row count per level**, which must come from the
national statistical agency and never from the files being read — it is what turns a
forgotten ISO file into a failed run instead of a silent hole — and the **name-resolution
rule**, which is per country because the dump's `name` column is not any single language
(Finland's is Swedish for 17 municipalities; France's French *alternates* are the polluted
side instead). The generator prints both alternatives side by side so the choice stays
re-checkable in seconds.

Output is deterministic against the same downloaded snapshot: rows ordered by geonameid,
nothing run-dependent written, fixed chunking, explicit transaction. GeoNames publishes no
archive, so that is the honest extent of the guarantee — the committed migration is the
reviewable snapshot of record.

**Rule: never regenerate an applied seed migration.** It is history. Renames and merges
between dumps can invalidate live references (products, sites, gedu coverage), so
collapsing two rows or renaming one is a judgement call a human makes against the diff,
not something a generator decides — reconcile in a *new* migration.

### Keeping a country current — one procedure, no exceptions

Refreshing is deliberately unscheduled: run it before an expansion push, or when a place
we operate in changes. Stale names cost nothing until they do. The procedure is the same
for every country — Finland and France included, since the cutover; there is no annual
national-classification diff any more:

1. Run `scripts/diff-geonames.mjs <CC>`. It reads today's dumps and the live table
   (read-only — the only statement it sends is a SELECT) and emits a human-readable
   report plus a reconciliation migration.
2. Read the report. Anything ambiguous — a merge's coverage implications, a retirement
   something references, a rename that looks like vandalism — is a human decision made
   here, not by the tool.
3. **Renumber the migration and move it into `supabase/migrations/`.** The differ writes
   it to `supabase/reconciliations/` under a name with no version number at all, because
   it cannot know the next free one: an already-used version is silently treated as
   applied, so the number is picked against *remote* migration history at the moment of
   pushing rather than guessed at the moment of emitting.
4. Push it through the normal workflow.
5. **Bump the published version date for whichever dataset you re-sourced**, in the same
   change (see the rule below).

**Rule: a data refresh moves the version date on the public attributions page, in the
same change that lands the data.** Both licences behind this data oblige us to publish a
credit, and one of them obliges that credit to state the date of the version in use. That
date is a hardcoded literal per dataset on the public attributions page (under
`src/app/(public)/`), so nothing moves it but the person doing the refresh: set it to the
publication date printed on the file the new migration actually read — the geographic
dumps for a tree refresh, France's postal file for a postal rebuild. A refresh that lands
without it leaves the page stating a version we no longer ship, which is the one part of
the credit the licence spells out.

Three things about the differ that are decisions rather than implementation:

- **It is gated exactly like the seed generator, and a gate failure stops the run.** The
  upstream side comes from the same ingestion with the same `expected` counts, so
  upstream drift big enough to break a count halts sync instead of flowing into a
  migration. That is the human-judgment moment the design names: re-source the count,
  extend the named allowances, or extend `exclude` — in the config, deliberately.
- **A row that changed parent upstream is reported, never moved.** Re-parenting a
  non-leaf leaves its descendants' `depth` stale (the trigger is a row trigger), and an
  administrative re-levelling wants a human writing the migration.
- **A retired row that reappears upstream is reported, and un-retired only on request**
  (`--unretire`). A reappearance is more often upstream flapping than a place coming
  back, and putting a row back into every picker is a visible change to what people can
  choose. Seeing it costs nothing; taking it costs one flag.

**A country whose tree predates GeoNames cannot be diffed — it must be cut over first,**
and the differ refuses rather than trying. Its rows carry no `geonames_id`, so every
upstream row reads as new and every live row as retired at once; the "migration" that
would fall out is a country wiped and rebuilt under new ids with no capture bracket,
which is precisely the hazard the cutover exists to handle carefully.

**Rule: nothing on a refresh path may DELETE a location row.** The only states a
reconciliation can produce are inserted, renamed, code-corrected and **retired**
(`retired_at`). `gedu_locations.location_id` is ON DELETE CASCADE, so a delete would
erase a gedu's coverage silently — which is exactly the hazard `retired_at` exists to
avoid. The one sanctioned exception in the whole history of this table is the FI/FR
cutover migration, which wipes and reseeds inside a capture/re-point bracket that carries
every live reference across by official code and raises a `RAISE WARNING` naming anything
that could not be carried. Deleting a retired, unreferenced row remains a manual,
human-decided migration.

**Rule: upstream garbage is quarantined in the config's `exclude` list, never patched
locally.** GeoNames carries some abolished places as live rows for years (Finland needs
exactly two entries). Each entry is a recorded human decision, and the durable fix is
correcting GeoNames so the entry can be dropped.

## Postal codes

A separate table, `postal_codes`, holding one row per `(country_code,
postal_code, location_id)` fact — all three columns are the key. **A postal code
is an alternative *key* onto a municipality that already exists, never a level of
the hierarchy**: it carries no name, no parent, no depth and nothing anyone
browses, and it exists so a parent can type "00100" instead of walking Finland →
Uusimaa → Helsinki. Neither direction of the relationship is single-valued — a
municipality has many codes, and a French code routinely spans dozens of communes
— which is why `location_id` is part of the key rather than a unique column
beside it.

**Rule: this table may be rebuilt wholesale and `locations` may not, and the
difference is structural rather than a matter of taste.** Nothing references a
postal row: no product, no gedu coverage claim, no family location pick, no
foreign key anywhere points here. So a refresh is a plain delete-and-reinsert
migration for the country. Over on `locations`, `gedu_locations.location_id` is
`ON DELETE CASCADE`, which is the hazard that forces the retire-never-delete
discipline. That hazard is absent here, so the discipline is too — which is
exactly what lets postal data track upstream freely while the geography cannot.

### Where the rows come from

A second ingestion over the same config, with its own generator
(`scripts/generate-postal-seed.mjs <CC>`, over the postal module in
`scripts/lib/geonames/`), because the two sources move on different schedules and
under different rules.

**GeoNames' postal dumps by default; La Poste for France.** France's override is
forced rather than chosen: GeoNames' French postal file carries the
département+arrondissement code in its third admin column rather than the commune
INSEE code, so it joins **zero** of ~34,900 communes — a structural mismatch that
no amount of upstream healing repairs. La Poste's *Base officielle des codes
postaux* keys on `code_commune_insee`, which is exactly what `external_code`
holds. It is Licence Ouverte 2.0; the public attribution surface credits it
alongside GeoNames' CC BY 4.0, and states the publication date of the file in
use — which a rebuild has to move (see the refresh rule above).

Two shapes are absorbed by config rather than by code:

- **The municipality-code column moves between files of one country.** Mainland
  Finland's kunta code is in the postal dump's admin code 3 and Åland's is in
  admin code 2 — the same file-set-per-country trap the geography dumps have, one
  column over. Forgetting Åland's file is 16 kuntaa with no codes and nothing
  saying so, which is why the coverage gate below is what catches it.
- **The Paris/Lyon/Marseille rollup.** La Poste keys those three cities by
  *arrondissement* (75101–75120, 69381–69389, 13201–13216) where the COG has one
  commune each (75056, 69123, 13055). That is a fixed 45-code map, derivable from
  neither file, enumerated in the config and applied before the join. Nothing in
  executable code knows the three cities exist.

### The join, and the country it rules out

Every row lands by joining `(country_code, type = 'municipality',
external_code)`. That is the whole reason `external_code` kept its contract
through the GeoNames cutover — the column means "the official statistical code"
whoever supplies it, so an official-data join keeps working.

**The consequence is that a country mapping no official code cannot have postal
data at all, and the United Kingdom is that country.** Every UK row below the
country carries NULL there, because GeoNames' GB admin codes are its own
invention, so there is no key to join on; the ingestion refuses GB by name rather
than emitting an empty seed. Giving the UK postal data means giving it a key
first — either upstream starts carrying ONS/GSS codes, or the postal join learns
to key on `geonames_id` through the postal file's own admin columns.

### The gates, and the deliberate asymmetry between them

- **Coverage is a gate.** The fraction of a country's municipalities that got at
  least one code must clear the config's floor. Finland's is 1: all 308 kuntaa
  are covered, so anything less is a broken run. France's sits just below it, by
  exactly the width of a *named* gap — the four communes nouvelles GeoNames still
  files under a retired chef-lieu code, which no La Poste row keyed on the COG
  code can reach. The floor is set tight enough that a fifth loss fails rather
  than fits.
- **Unmatched upstream codes are reported and never failed on.** A postal file
  naming a municipality we do not carry is not a broken run: Finland's file still
  routes mail through two kuntaa abolished in 2020 and 2021, and a postal
  operator legitimately delivers to territories that are their own ISO countries
  and their own GeoNames files. Failing here would make postal ingestion hostage
  to the geography's currency, which heals on somebody else's schedule. Every
  such code is named in the emitted migration's header, so the list is reviewable
  rather than merely counted.

**Rule: the coverage gate is scoped to rows with a `geonames_id`.** The DB
fixtures in `supabase/seed.sql` include a small code-less Finnish tree that no
postal source has ever heard of, and an unscoped count would fail the migration
on any database that had loaded them. Both the generator's gate and the SQL
restatement of it carry that scope.

### Reading it

One service method resolves `(country, code)` to the municipalities it reaches,
**as a list** — a caller wanting one place has to decide what to do with several,
and that decision belongs to the surface. It is two reads, not an embed:
`postal_codes` answers *which places*, and the existing keyed read answers *what
they are*, which is the same call every other surface makes to turn a stored id
into a name and a path. Embedding the chain off the postal table would be a
second definition of that shape for the same answer.

**The first read drops retired municipalities and the second does not, and that
is the offer/keyed split rather than an inconsistency.** Typing a code is a way
of reaching a place to pick, so it is an offering read and answers like every
other one; by the time the keyed read runs, the ids are ones the first read
already vouched for. The filter therefore rides on the `postal_codes` query, as
an inner join over the relation — the database applies it and the only column
that crosses the wire is the id the caller wanted, so `retired_at` stays
unselected by anything in the app.

No route and no RPC for the direct lookup: the table is anon-readable public
reference data with a plain `USING (true)` policy and a `SELECT` grant to `anon`
and `authenticated`, so the caller's own client asks it directly, exactly as
browsing the tree does. `service_role` holds `SELECT` as well, for one reason
that is worth stating because it is the shape any future grant here must take:
the search RPC is `SECURITY INVOKER`, reads this table for its postal match arm
(below) and is executable by that role, so **a role holding EXECUTE on the
function has to hold the reads the function makes** — without it a privileged
caller gets `permission denied` on a path no anonymous test would exercise.

There is **no write grant for anybody, `service_role` included** — rows land
through data migrations, which run as the database owner and need no Data API
privilege, so a write grant here would widen the reachable surface for no caller.

**The picker reads the codes through search instead, not through this method.** Typing a
postal code into the picker's box is a search like any other — see the postal arm under
Search below — so no surface has to decide *which* of several municipalities a code meant
before the user has seen them. This direct lookup remains the shape for a caller that
starts from a code it already holds; "clubs near me" is still separate later work, and
coordinates and radius stay out of *coverage* semantics entirely whatever that UI ends up
doing.

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

**Rule: the fold exists once, in SQL, and nothing outside the database folds anything.**
The same expression computes the stored side and the needle, so both halves of a match
come out of one place and cannot drift apart. There was a second fold in TypeScript, for
sets narrowed in the browser, and it went with the last surface that narrowed one — which
is the shape to keep in mind if a client-side filter is ever proposed again: two
implementations of one rule agree only by habit, and the failure is silent and
asymmetric, one surface quietly ceasing to match "Nîmes" while the other still does. A
surface that wants to filter places asks the search index, which is a request against a
capped, ranked, indexed query rather than a second definition of what a match is.

What the SQL fold must produce is pinned by a table of **literal** input/output pairs the
DB suite asserts against — literals precisely because an expectation recomputed by a
second implementation of the same rule proves only that two pieces of code agree, where a
literal says what the fold *is*. The known boundary is Latin letters with no canonical
decomposition (`œ`, `ø`, `æ`, `ł`, `ß`): `unaccent` expands those by rule from a
dictionary nobody here authors, so the table leaves them out and says so rather than
pinning someone else's expansion list.

The fold is **stored, not an index expression**, and deliberately: needles shorter than
three characters yield no trigram, so those queries are a sequential scan, and re-folding
tens of thousands of jsonb documents on every such keystroke is a second or more. Against
a stored column the same scan is a plain text comparison.

**Rule: nothing outside the database reads the fold, and no read selects it.** It is the
longest value on a row and a browse page is hundreds of rows, so `select("*")` was paying
for it on every drill. Every read here names its columns instead, from one shared literal
in the contracts module, and the row alias the application uses excludes the column
outright — so a consumer cannot come to depend on it without first putting it back in
three places. The alias states the intent; it cannot enforce it, because `*` returns a
wider row and a wider row assigns to a narrower type without complaint, so the enforcement
is a unit test that sweeps every read and fails on a `*` or a mention of the fold.

### The postal arm — a second match source inside the same function

Postal codes are searchable in the same box, through the same call: typing `00100` finds
Helsinki, `75001` finds Paris, on every surface the picker serves. They are **not** in
`search_blob`, and cannot be.

**The fold is a generated column, and a generated column may only read its own row.** A
postal code lives in another table with a many-to-many relation to this one — a
municipality has dozens of codes, a French code spans dozens of communes — so putting
codes in the blob would mean trigger-maintained denormalization: a second copy of the
postal table kept in step by triggers on both sides, drifting silently the first time one
was forgotten. Rejected on that basis. What the search function grows instead is a
**second match arm**: `postal_codes` joined to the municipality each code reaches, merged
into the same match set before ranking.

**The fold-once rule survives intact, and that is why the arm lives here rather than
anywhere else.** It is SQL inside the same function, reading the same needle the name arm
reads. There is still exactly one fold, in the database, and nothing outside it matches
anything.

What the arm guarantees:

- **A postal hit is the municipality row, deduped.** A prefix can reach many codes of one
  place; one row comes out. A row matching by name *and* by code appears **once, at its
  better rank**, and the reported total counts that deduped union.
- **Ranked on the same scale as names**: the needle *is* a whole code → exact; the needle
  is a *prefix* of one → prefix. **No infix arm on codes**, deliberately — nobody searches
  the middle of a postcode, and an infix arm answers a four-digit needle with half a
  country.
- **Everything the name arm respects, the postal arm respects**: the level filter (applied
  to the joined row's real type, not assumed from what the seed produced), the country
  filter, `retired_at IS NULL`, the minimum needle length, and the folded needle.

**The stored code is compared raw, and that is a scoped decision rather than an
oversight.** Every seeded country's codes are fixed-width digits, on which the fold is the
identity. A country whose codes carry letters or separators has to make that decision
deliberately — as the `postal_code` column's own comment already says — and folding the
stored side by reflex would be that decision made by accident, at the price of an
expression no index can serve.

**The arm is not gated on the needle looking like a code, and that is measured rather than
assumed.** The tempting saving is to skip it unless the needle is digit-shaped. It costs
one GIN probe that finds nothing — a fifth of what the name arm spends on the very same
keystroke — and it would hardcode "postal codes are digits", which is a fact about Finland
and France rather than about postal codes, whose failure mode is silent. That is the same
country-shaped assumption the ranking rule below exists to keep out.

**The index is a trigram one, for a reason that is invisible in a plan you have not run.**
PostgreSQL rewrites `LIKE 'abc%'` into btree range bounds *at planning time*, and that
rewrite needs the pattern to be a plan-time constant. Here it is not: the needle arrives as
a subquery over the probe CTE, precisely so that one folded needle serves every arm — so a
btree on the code sits unused behind this query shape, and only explicit pattern-comparison
bounds would reach it, at the price of hand-rolled upper-bound arithmetic. A GIN trigram
index extracts its query keys at *execution* time instead, which is exactly why the index
over the stored fold already works against the same shape. Both arms are therefore one
kind of index answering one kind of question.

**The UK degrades silently and correctly.** It has no postal rows by construction — every
UK row below the country carries a NULL official code, so there is no key for the postal
join to run on — and the arm simply contributes nothing there. Nothing needs to know; a UK
needle answers from names exactly as it did before.

### Ranking

**Rule: rank the whole match set, then cap — never cap then sort.** At France's scale a
two-letter needle matches thousands of communes, and an alphabetically early *infix* match
sits ahead of the prefix match a user is obviously reaching for. Ordering by rank first
(exact, then term-prefix, then infix), then by breadth, then by name, is what puts
"Ille-sur-Têt" above "Abbeville" for the needle "ille". A query that filtered and ordered
by name alone would look correct on a small fixture and be useless on the real table.

**Rule: breadth is the stored `depth`, never the `location_type` enum's declaration order
and never a per-type CASE.** Both encode one country's shape: the enum sorts
`municipality` before `district`, which is backwards for France, where a département *is*
the district above the communes — a needle matching many communes buried all nine "haute"
départements past the page and made them unreachable by search entirely. Spelling the
order out per type fixed France and stayed wrong for a country nesting `district` *below*
`municipality`, which the hierarchy config already sketches. `depth` is true for every
shape and costs no per-country knowledge. **Sites are pushed below places by their own
ordering term, ahead of depth**, because depth cannot separate them: a Finnish venue and a
French commune both sit at depth 3, and a venue parked under a country row sits at 1.

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
and `postal_codes` then decides every row it can see, exactly as a direct select would, so
the function cannot answer with anything a plain read would not already return. The
corollary binds every future arm: a table the function reads has to be readable by every
role that may execute it. That is also what makes
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

**Whole-list reads** — one country's municipalities; one municipality's venues. Those two
and no others. A surface needs these in full because something outside the table bounds
them, and it lists whatever it gets. Both are read by pages that *render* the collection
rather than by pickers choosing from it: the public municipality directory, and the venue
list inside a confirmed municipality. The municipality read is server-side only — the
directory pages that need it are server components, and there is deliberately no browser
hook over it, because a read of a whole country is not something a client surface should
be able to reach for casually.

**Paged reads here follow the shared discipline documented in `src/lib/supabase/`** —
which reads must walk, the exact-count requirement (enforced by the primitive itself), the
total-order rule, and the accepted offset race. This directory is where that primitive
started, and it now serves every service whose list reads can outgrow the cap; use it
rather than hand-rolling a loop.

**What is locations-specific is *which* order is total here: `name` then `id`.** `name`
alone is not one — every French DROM has a région and a département of the same name, and
homonymous communes are common — so a read ordered by `name` alone shifts rows between
requests and both duplicates and drops them across a page boundary. This binds the
one-page-at-a-time browse reads exactly as hard as the walking ones: a page boundary under
a partial order silently drops rows a user was about to scroll to.

**Keyed reads** — rows by id. These chunk their keys into `in.(…)` batches sized well
under `max_rows` and so cannot be truncated by construction; that is *why* they do not
page. A key with no row is simply absent from the result — a lookup, not an assertion.

The postal lookup (see Postal codes above) is the one read that starts on another table,
and it is deliberately not a fourth shape: it resolves `(country, code)` to a set of ids
and then *is* the keyed read, so a place found by postal code and a place found by
browsing come back identical.

### Rows with their chains

The municipality list and the keyed reads embed the ancestor chain via the FK on `parent_id` (the per-municipality venue list needs no chain — its rows all share the parent the caller asked for) and flatten it
to a row plus `ancestors`, **nearest first**. Nearest-first is the point: `ancestors[0]` is
the level immediately above whatever the country, which France's extra `district` level
would otherwise make position-dependent. Reverse it for a root-first breadcrumb. The
search RPC returns the same shape, so a place found by searching and a place found by
browsing are one thing to every consumer.

Two embed depths exist because they answer different questions. The **keyed** read asks
for four levels, the deepest chain any supported country has (commune → département →
région → country), because a key set is whatever a caller stored and a stored pick can be
a site — the deepest row in the tree. The **municipality list** read asks for three, which
is all a municipality has. Each embedded level is an indexed lookup per row and that list
query runs over ~34,900 rows for France, so it asks for the depth it needs and no more. The
depths are spelled out as literal select strings rather than built at runtime — the client
infers the response shape from the literal, and a computed string collapses it to
`string`.

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
sites key, which is a grouping key with no query of its own sitting above the
per-municipality venue lists, so every one of them refreshes without the mutation having
to know which municipality the row landed in; it also invalidates the browse level it
landed in, and every cached search needle. A rename invalidates the row's detail key and
the lists that render it, and the search needles for the same reason. **Anything that
changes what search matches invalidates the search key, and creating a row is one of
those**: sites are in the index carrying their whole ancestor chain, and the needle most
likely to be cached is the one an admin typed just before deciding the venue did not
exist yet.

**What invalidating the search key guarantees is a refetch, not a fresh answer**, and the
difference is worth knowing before trusting it. The browse reads go to PostgREST and come
back from the database, so invalidating them is the whole fix. Search does not: it goes
through the search route, whose responses live URL-keyed in a shared cache for minutes and
are served stale for an hour behind a revalidation. A refetch triggered a second after the
write can therefore be answered with the same pre-creation response, and the new venue
stays missing from that one needle until the entry ages out. This is accepted rather than
worked around — the window is short, it closes without anyone doing anything, and the
alternative is a client writing ranked search results it did not compute.

## Picking a place (UI)

**One panel** (`src/components/locations/`), and every control that picks a place is a
configuration of it: a presentational panel plus a container that owns the browse
position, the debounced query and the two server reads.

The panel browses the hierarchy. It opens on the rows with no parent — the countries — and
drills down; typing searches everywhere from the first keystroke past the minimum length;
clearing the box drops back to where the user was browsing, so browse and search share one
panel with no mode switch. A pick is staged and then confirmed, because the panel is a
dialog opened to answer one question. Every picker uses it: both product-form fields, gedu
coverage, and the parent's own location.

**Rule: a picker browses the table; it never fetches a collection to choose from.** There
was a second configuration once — a bounded set the caller had already read whole, grouped
under the place above each row and narrowed in memory — and it is gone with its last
consumer. Both collections that ever had one lost the argument for different reasons, and
both are worth keeping in mind before anyone builds it again. The **venue** list was never
legitimately bounded: it was every `site` row, small only because of what had been created
so far, read as Finland-only by accident and with no answer at all for a country whose
venues nobody had opened yet. Finland's **municipalities** genuinely were bounded — the
*funding rule* is the bound, so "every option" is a few hundred rows that do not grow when
a country is added — and the mode still went, because being bounded is not the same as
being the right thing to pick from: three keystrokes against the search index reach any
kunta faster than a scroll through a grouped list of all of them, and the same index also
covers the ~34,900 communes the list could never hold. What the set scope cost while it
lived is the shape of the argument: a whole branch of the panel, a grouping module, a flat
read of every venue there was, and a second in-memory fold that had to be pinned to the
database's by a shared fixture. All of it is deleted — the fold included, so the database
is now the only thing in the system that knows how a place name folds.

**Rule: a collection can be worth reading whole and still not be worth a picker.** A
municipality's venues, and the public municipality directory, are both read in full and
rendered in full — that is a page showing its content, not a control choosing from it. If
a picker ever needs a set-shaped panel again, the way back is to build it against that
caller rather than to keep an unused one warm.

The panel is presentational and fixture-driven in the `/admin/ui-components` style guide:
it holds no business logic, so data and handlers are injected.

**Rule: there is no country to choose before browsing.** The country dropdown and the
"default country" concept existed only because the data was sharded one file per country;
with the tree served from one table they would be a step that answers nothing. A user
looking for Tampere types "Tampere".

**A caller that already knows the country may say so, and it means two things at once.**
It seeds the breadcrumb — the dialog opens *inside* that country, listing its regions
rather than the world's countries — and it bounds what is offered, browsing and searching
alike. **The breadcrumb says which of the two it is doing**: bound, it starts *at* the
country, with no root crumb above it, because the level such a crumb opens holds that one
country and nothing else. Rendered, it reads "All of Finland › Finland" — a step that goes
nowhere, named twice, which reads as a broken control rather than as a rule. Two properties
keep the seed honest. The seed row is read
from the browse level at the root of the tree, which is the same request the panel makes
when someone clicks back up to "all countries" — one cache entry serving both, so the seed
can never disagree with what browsing shows. And **nothing waits on it**: until it lands
there is no seed and the dialog simply opens at the root, which is why the seed is a
derived fallback rather than an effect that writes state. An effect could land *after* the
user had already navigated and drag them back out of the level they opened.

**Rule: a country restriction is applied to every row before the panel sees it, so the
answer is "not offered" rather than "refused afterwards".** Browsing is exact — every
level is read in full, so filtering a level cannot hide anything the user could otherwise
have reached.

**Rule: search takes the country as a parameter and the database applies it — a country
restriction is never a filter over what search returned.** The ranking and the cap are
applied to the match set, so anything downstream of the function is downstream of the
truncation: a needle matching many rows elsewhere pushes every wanted row off the page and
leaves the box empty on a needle that does match, and the "showing N of M" total counts
matches the picker would never offer. Both are one fault — the filter was in the wrong
place — and both are fixed by putting it where the matching happens. The panel's own row
filter stays as its guarantee, but it is no longer what makes the restriction true.

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
Stored as `profiles.home_location_id`, a nullable foreign key pointing straight at the
`locations` row the picker was showing when it was confirmed.

A real FK rather than a loose reference (a country code plus an official statistical code)
because the picker browses the table itself: a pick is already a row id at the moment it
is made, so there is nothing to resolve at save time, no way for a save to be refused
because the place has no record, and no ambiguity — where a bare official code is ambiguous
by construction in France, an id is not.

**Rule: the reference deletes to NULL, not RESTRICT — and that is a trade, not a
default.** Official classifications merge and retire places between annual releases, and
reconciling one is a hand-written migration. Profile data must never be the reason a
superseded reference row cannot be removed, because the person doing the reconciliation is
not the person who can decide where that family should now point. The cost is real and
accepted: a merge silently empties that parent's pick, with nothing telling them or us.
That is tolerable only because the field is optional, gates nothing, and is re-pickable in
two clicks — it would be the wrong answer for anything carrying an entitlement, and it is
the opposite of the tree's own `parent_id`, which stays RESTRICT because orphaning the
hierarchy corrupts every ancestor walk.

The level is a UI decision, not a constraint: nothing in the schema pins the referenced
row's type, because doing so needs a trigger on the profile write and there is no privilege
behind the column to justify one. The picker's `pickableTypes` is the gate.

**Rule: a control that picks a place is one control — the box showing the current value is
itself the trigger — and its label is the generic "location".** Splitting the value and a
"choose" button across two rows makes one control look like two and forces the button
caption to name the level being picked. Every such caption is wrong for somebody: a
viewer's *locale* says which language to render, not which country they live in or what
that country calls this level, so a Finnish-locale parent picking a French commune gets
told to pick a kunta. Country-specific vocabulary belongs inside the dialog, below the
country they chose — this is the locale-vs-spoken-language distinction in the root
`CLAUDE.md`, in a third dimension.

**Rule: the field distinguishes "nothing chosen" from "not read yet", and shows nothing
for the second.** Settings knows the saved id before it has the row behind it, and the
prompt inviting someone to add a location is a false claim to show to someone who already
has one — a clickable one, which opens the picker over a value about to appear. The keyed
read is one row by primary key, so the box simply stays silent at its final height and
fills in: no skeleton, no spinner, per the loading rule. The same distinction governs the
save: an unresolved value is omitted from the update rather than written as null, so a save
made before the read lands cannot wipe a location the user was never shown.

**Rule: writing it is a plain profile update, not sign-up metadata.** Registration persists
it with a second write after the account exists, on the same column grant and the same
self-scoped RLS policy the settings page uses. The alternative — passing the id through
sign-up metadata for the new-user trigger to read — would teach the one function that
assigns roles, running past RLS, to consume another caller-supplied value, and would need
it to resolve-not-assert so a stale id degraded to null instead of aborting account
creation. That is real surface on the most sensitive object in the schema to save one
request. The write depends on a session existing when sign-up returns, which is what
auto-confirm gives us and what the rest of that flow already assumes far harder (a new
parent is sent straight to an authenticated route); the session is therefore checked
explicitly rather than presumed.

**Rule: a failed location write never blocks the account.** It is logged and the
registration proceeds. The account exists by then, the field is optional, and settings can
set it later — stranding someone mid-signup over it would be strictly worse than losing it.

### The product picker

In-person products pick a **site**; online municipality clubs pick a **Finnish
municipality**. Two levels of one hierarchy, and **one control in two configurations** —
both fields are the tree dialog, the same one gedu coverage and a parent's own location
open, and both look identical until it is open: a compact affordance when empty, a card
with a "change" affordance when set. What differs is what the dialog will accept back and
where it starts. What lives in the product form itself and nowhere else is that card (with
its site notes, for a venue) and the clear-on-invalid guard below.

**The venue field** stops at no country — unless the *product type* is bound to
one: a municipality club exists only where a kunta funds it, so its venue field
opens inside Finland and offers no other country's rows, through the same
`countryBound` the type's config declares. Either way it offers two ways of
knowing where a venue is:

- **Searching reaches a site directly.** Sites are in the search index carrying their full
  ancestor chain, so an admin who knows the building's name types it and confirms the hit.
  One step, in every country, rather than only where a list had been built up.
- **Browsing walks down to a municipality and stops there.** Confirming one is not the
  answer but the *next question*: the dialog then lists the venues in that municipality
  and offers to name a new one.

**Rule: a site is confirmable but never browsable *to*, and the asymmetry is the design
rather than a gap in it.** The panel's rule is that a row of a pickable type is terminal,
so offering both levels makes a municipality terminal as well — which is exactly right
here, because confirming a municipality *means* "show me the venues here", and that
screen is the only one that can also carry the create affordance. Letting the tree drill
through a municipality to its sites would take creation off the only screen with anywhere
to put it, to reach rows search already reaches in one step.

Opening a venue somewhere new is therefore still two steps, because it still answers two
questions from two sources: *where in the world* from the seeded hierarchy, *which
building* from an admin naming a site under it. There is nothing between the two — the
confirmed pick is the row, so it is already the venue's parent — and nothing above a site
is ever created.

**The municipality field is the same dialog with the municipality level terminal and
nothing after it.** Confirming a municipality *is* the answer here, which is exactly the
half the venue flow does not have: there is no venue list, no create affordance, and
nothing to name, because everything above a site is seeded. It opens with Finland already
in the breadcrumb, so the first screen is the maakunnat rather than the world's countries,
and an admin who would rather type does — the search box is the same one, against the same
index.

**Rule: the online-muni municipality restriction is UI-enforced, in three places, and each
one covers what the next cannot.** The DB trigger still permits a country or a region for
online muni clubs (it predates the rule), so the picker is the gate. *Browsing* offers no
country but Finland, at the root as well as below it. The breadcrumb no longer offers a way
back up to the root under a bound, so that filter is not what keeps someone in — it is what
makes the one frame before the seed lands show Finland alone rather than the world. *Search*
is restricted in the
database, by the country parameter the picker passes through, so the ranking and the cap
are applied to Finnish rows only and a needle crowded out by foreign matches no longer
goes quiet. And the *clear-on-invalid guard* refuses a
stored id that is not a Finnish municipality, which is the only one of the three that can
say anything about a row saved before the other two existed — a legacy club anchored to a
region, or to the country itself. That last one is what makes the restriction binding
rather than advisory, and it is why the guard takes the country as well as the level.

**Rule: a picker that cannot tell "still loading" from "invalid" must not clear
anything.** Wiping a valid `location_id` while editing a product is worse than showing it
a moment late, and the two states are one frame apart: whatever the control checks the
value against arrives asynchronously, so a guard that answers before it is there treats
that frame as proof the value is bad, and the next save writes the loss. The distinction
is therefore explicit — *absent* is never an answer — and the decision is a named function
with its own test rather than a condition inline in an effect, because it is exactly the
kind of thing that reads fine in review. The same three-state shape governs the parent's
own location field, for the same reason. The everyday trigger is not exotic: toggling a
municipality club from online to in-person carries a municipality id into a field that now
accepts only venues.

**Corollary: both modes now ask the same question, of a keyed read — one named function,
and the shape of the answer is the reason it is that one.** Neither field holds a
collection to test membership of; both look the stored id up by key and ask what came
back. That makes a key with **no row** a *resolved* answer (the venue was deleted) rather
than the absent case, where absent means the *read* has not landed. The distinction is not
cosmetic and it is why a set-shaped guard cannot be substituted: read as a set, a missing
row is "not fetched" and a dangling id survives forever; read as a lookup, an empty set is
"deleted" and a valid pick is wiped. A set-shaped guard did live here while one field
listed a set, and went with it — leaving it behind would have left the wrong one within
reach of a call site that looked plausible.

**The two modes differ in what they accept, not in how they ask.** The venue field takes
one level — in any country by default, in the product type's one country when the type is
bound to one; the municipality field takes one level in one country always. The
constraint is a *business* one either way — a French commune is a perfectly well-formed
municipality row that the funding rule still refuses, and a French venue is a perfectly
good site the same rule refuses for a municipality club — so it rides as an optional
country alongside the accepted levels rather than as a second function.

### Loading

**Every read in this feature is a small indexed lookup, so none of them gets a loading
affordance.** One level of children by `parent_id`, a capped top-N from the search index,
one municipality's venues, one row by primary key, one country's municipalities for a
directory page — each lands in a frame or two. Every box has its final height from the
first frame and fills in: no skeleton, no spinner and no delay anywhere here. The chosen-
place card is the shape to copy: the stored id is known synchronously, so the card and its
"change" affordance are on screen and usable from the first frame while the name and the
path fill in — the card's own height never changes, which is the part that matters and the
extent of what it claims.

**Corollary: anything in that card whose *height* would otherwise depend on the read has
to be settled without it.** The name and the path are single lines with their heights
reserved, which is enough for them. A wrapping paragraph is not so easily reserved, so the
note explaining that a municipality club has no physical venue is written to depend on the
*mode* rather than on the row — it says nothing the mode does not already determine, and
in exchange it is on screen from the first frame at its final height. Interpolating the
municipality's name into it would have been nicer to read and would have made the card's
height a function of a network response, with the rest of the form underneath it.

The root `CLAUDE.md` states the general rule all of this is an instance of; a skeleton
reappearing in this directory means a read has changed shape, and that is the thing to
look at.

## Per-country labels & hierarchy config

`SUPPORTED_COUNTRIES`, `resolveLabels`, `getChildLevel`, and the `HierarchyLevel`/
`nameI18n` types live in `src/lib/constants/location-hierarchies.ts` (re-exported from
`src/lib/constants`). This config table drives level labels and the naming of the level
below a given row: it says what a country's levels are *called*, while the table says what
its divisions *are*.

Localized labels apply **only** to the country whose language matches the user's UI locale
(a Finnish admin sees "Maakunta"/"Kunta" for Finland but plain English "Local
Authority" for the UK). `resolveLabels(level, locale)` picks the localized pair or falls
back to the English default; country names localize via `nameI18n`.

**Rule: Adding a country whose language is a supported UI locale requires `i18n` entries
on each hierarchy level plus a `nameI18n` entry.** A country whose language isn't a
supported UI locale needs none — English is the default. **Nor does an
English-speaking country**: `en` is the default label language, so a UK entry with `i18n`
would be the same words written twice.

**A country's level labels are the words that country uses, not the words that make its
shape look like another country's.** The UK's speculative entry read Nation → City →
Borough until it was seeded, which is how the UK looks from outside and not how it is
governed: there is no administrative city level, and "borough" is one of several words
for the same rung (Scotland has council areas, Wales principal areas, Northern Ireland
districts, England a mixture of counties, unitaries and metropolitan boroughs). "Local
Authority" is the term that covers all four nations and the one a parent reads on a
council letter. The anchor tripwire is what forced the question — the entry anchored at
`district`, and every seeded country must anchor at `municipality`.

Adding a country end to end is now two things: hierarchy config, and an ingestion config
entry whose generated seed migration supplies its rows. It appears in the picker, in search and in coverage the moment its rows exist —
there is no asset to generate, no loader arm to add, and no bundle-size judgement call
about whether it is small enough to ship.

## Localized display names (`name_i18n`)

A location's `name` is the **canonical native-language name** — Finnish for FI rows,
French for FR rows, English for UK/US — resolved from GeoNames by the country's configured
name rule. `name_i18n` is a `jsonb` map of `locale → name` holding **only the rows that
differ**, e.g. `{ "sv": "Helsingfors" }`.

**The column holds GeoNames-sourced display alternates, not a curated list of legal
names.** A country's config declares which locales it ingests alternates for; the
generator resolves each with the same mechanical rule it resolves canonical names with,
and skips any value equal to the canonical name. Nothing here is authored by us. Finland
ingests `sv`, which is why a Swedish-speaking parent sees Helsingfors, Åbo and Nyland —
and now Tammerfors, Nystad and Torneå as well, which are customary exonyms rather than
legal names and which the old curated contract deliberately excluded.

Two things about that trade, both accepted with the numbers on the table. What was
*gained* is owning zero curated data: adding a locale to a country is one config field and
a regenerate, with no per-row work. What was *given up* is the legal-versus-customary
distinction itself, plus one region's precision — Kanta-Häme resolves to "Tavastland"
where its legal Swedish name is "Egentliga Tavastland". The route back to precision is
flagging the right alternate **in GeoNames**, not a local override.

**Rule: a locale goes into a country's `alternateLocales` only when its ingest diff shows
real payload.** This is empirical per country/locale pair, never assumed. Finland's `sv`
works because a co-official language got the administrative records richly annotated;
France's `fi` is thirteen mistagged orthographic variants and one German grape name, and
its `en` renders Nord as "North". The multilingual exonyms people expect live on
GeoNames' *populated-place* records, which are different records with different
geonameids from the administrative rows this tree ingests — and harvesting across the two
is exactly the fuzzy matching step this supply exists to avoid.

**Country rows are the exception and always ingest every supported UI locale.** They are
the one level where every locale has real payload, and resolving them mechanically
reproduces the hand-seeded country translations exactly (Suomi/Finland/Finlande,
Ranska/Frankrike).

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
name in `name`, alternates in `name_i18n`*. Ingestion enforces this mechanically by
dropping any alternate that resolves to the canonical name, so a row whose Swedish name
equals its Finnish one (Satakunta, Korsnäs, Åland's Swedish-named municipalities) simply
carries no `sv` key.

**Corollary: widening the alternate set widens the slug space, and that is the invariant
to re-check.** `/schools/<slug>` has no disambiguation suffix because Finland's
municipality names are 1:1 with their slugs, and slug resolution accepts every alternate
after the canonical ones — first match wins, so a collision introduced by an exonym would
be *silent*, one municipality's page answering for another's link. A DB test re-checks
uniqueness across canonical names plus every ingested alternate, and it is the check to
re-run whenever a locale is added to a country's `alternateLocales`.

**Search and slugs follow the same data.** Every alternate is folded into the search
index alongside the canonical name, so "Helsingfors" and "Helsinki" both find the row
wherever the search runs. The `/schools/<slug>` link is built from the **viewer-locale**
display name (a Swedish viewer links to `helsingfors`), and slug resolution accepts the
canonical *and* every alternate slug — canonical first, so an exonym can never shadow
another municipality's native slug.

Adding another locale (or another country's alternates) is a config field and a
reconciliation migration; no schema change, since the column is locale-agnostic jsonb
(this is why we chose it over per-locale `name_sv`/`name_xx` columns). The generated
search fold picks the new alternates up on write, with no reindexing step.

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
Defence in depth, and each layer stops something the next one cannot: the picker only ever
hands the form a `site`, because that is the only type its venue flow completes on; the
clear-on-invalid guard drops a stored id that resolves to anything else, which is what
catches a product whose delivery mode was toggled after it was saved; the form refuses to
submit while the field is empty, so a dropped pick cannot be saved as nothing; and the
CHECK plus the `BEFORE INSERT/UPDATE` trigger are the backstop that binds every writer,
including one that never touched the form.

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
