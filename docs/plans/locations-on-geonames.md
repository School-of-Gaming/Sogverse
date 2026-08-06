# Locations on GeoNames

Rebuild the location system's *data supply* on GeoNames so that adding a country is a
config entry plus an ingestion run — no bespoke per-country code, no hand-curated row
lists, no per-country generator. The read layer, the picker, coverage semantics and every
invariant in `src/services/locations/CLAUDE.md` stay as they are; what changes is where
rows come from and how they are kept current.

Everything in "What was verified" below was checked against **real downloaded data on
2026-08-06** — the dumps' own modification dates were 2026-08-06, confirming the daily
refresh. Re-verify anything surprising, but do not re-derive it; the numbers are the
evidence the decisions rest on.

## Problem

Adding a country today means hand-writing a seed migration against that country's
national statistical classification. Finland was hand-written (19 maakuntaa + 308 kuntaa
across several migrations); France needed a bespoke generator
(`scripts/generate-france-communes-migration.mjs`) plus a 34,875-row migration. Every new
country repeats that work: find the national classification, learn its file format, write
or extend a generator, curate names, and then *own the accuracy* of the result forever —
the refresh procedure is a hand-diffed reconciliation migration per country per year.

We are a small team about to expand into several new countries. Per-country data
engineering does not scale with our headcount or our expansion rate, and it makes us the
maintainer of geography we have no business maintaining.

## Scale

- `locations` currently holds ~35,300 seeded rows (FI: 1 + 19 + 308; FR: 1 + 18 + 101 +
  34,875) plus admin-created `site` rows.
- **Five tables FK into `locations`** (the investigation brief said three; it is five):
  `products.location_id` (RESTRICT), `profiles.home_location_id` (SET NULL),
  `gedu_locations.location_id` (**CASCADE** — the dangerous one), and
  `site_details`/`site_staff_details` (CASCADE, but they reference only `site` rows,
  which are ours and never externally sourced — sync can never touch them).
- Candidate next countries already sketched in the hierarchy config: SE, ES, US, GB, JP.
  Sweden is the pilot here (clean shape, verified below, labels already configured).

## The decision

1. **GeoNames becomes the source for every new country.** One country-agnostic generator
   reads the GeoNames country dumps plus a per-country config entry and emits a seed
   migration in the same style as the existing France one: deterministic, NOT
   EXISTS-guarded, ending in hard assertions. Adding a country = write the config entry,
   run the generator, push the migration.
2. **Finland and France are not re-seeded.** Their rows keep their official codes, their
   official names, and their existing ids; a backfill migration attaches `geonames_id` to
   them via the official-code joins verified below. No FK is disturbed; no row is deleted
   or recreated. GeoNames does not become their name/code authority — the national
   classifications remain it (config: `nameSource: "official"`), and their January
   refresh procedure is unchanged.
3. **A country maps to a *set* of ISO-3166 alpha-2 files, declared in config.** This is
   the Åland/DROM trap made structural: FI = {FI, AX}, FR = {FR, GP, MQ, GF, RE, YT}. The
   completeness gate (below) is what catches a missing member.
4. **A new column `geonames_id` is the GeoNames key; `external_code` keeps its existing
   contract** (official statistical code, or NULL where none is genuinely official).
5. **Level semantics are declared by role in config**, and a stored `depth` column makes
   search ranking country-agnostic, retiring the hardcoded breadth CASE that migration
   `00141` documents as wrong for district-below-municipality countries.
6. **Sync never deletes: it inserts, renames (only where GeoNames is the name authority),
   and *retires*.** A new nullable `retired_at` hides a row from pickers, browse and
   search while every existing FK, coverage claim and ancestor walk keeps working. This
   closes the `gedu_locations` ON DELETE CASCADE hazard structurally: no refresh path
   deletes location rows at all. Deleting a retired, unreferenced row remains a manual,
   human-decided migration.
7. **Postal codes arrive as a new, FK-free-to-rebuild `postal_codes` table**, sourced
   from GeoNames' postal dumps by default (zero per-country work) with a per-country
   override hook; France is the one country that needs the override (La Poste, with the
   Paris/Lyon/Marseille rollup), because GeoNames' French postal file structurally cannot
   join our communes — verified below.
8. **`name_i18n` is never sourced from GeoNames.** Verified below: GeoNames cannot
   distinguish a legal minority-language name from an exonym, and our column's contract
   is legal/official alternates only. New countries ship with native names and official
   codes only; minority-language alternates remain optional hand curation (Finland's
   Swedish set already exists and is untouched).

## What was verified against real data (2026-08-06)

Downloaded from `download.geonames.org` (`/export/dump/`, `/export/dump/alternatenames/`,
`/export/zip/`), CC BY 4.0 per the dump readme, which also documents daily
`modifications-<date>.txt` / `deletes-<date>.txt` delta files. Country dump columns used:
geonameid(0), name(1), feature class(6), feature code(7), country(8), admin1(10),
admin2(11), admin3(12), admin4(13). Joins below are against the codes extracted from our
own seed migrations.

### Finland (FI.txt, 552,800 rows; AX.txt)

- Feature-class A rows in FI.txt: ADM1 18, ADM2 66 (seutukunnat), ADM3 294 kuntaa, plus
  historical rows (ADM1H 8, ADM3H 47) and 84 ADMD. P rows: 29,235. **Filter hard on exact
  feature codes; never treat the `H` variants as live.**
- **ADM1 admin1 codes are the official maakunta codes** (01–19). Ours-not-GeoNames: only
  `21` (Ahvenanmaa — it is country AX in GeoNames). GeoNames-not-ours: none.
- **ADM3 admin3 codes are the official kunta codes.** All 292 mainland kuntaa of our 308
  matched; the missing 16 are exactly Åland's, which live in AX.txt. Every ADM3 row
  carries admin1 and admin2, so the parent chain is derivable from the row itself —
  `hierarchy.txt` is not needed.
- **AX.txt shifts the columns**: the 16 Åland kuntaa are **ADM2** rows with the kunta
  code in **admin2** (in FI.txt kuntaa are ADM3 with the code in admin3). AX's ADM1 level
  is the three Åland sub-regions (211/212/213); there is no maakunta row — the AX country
  row itself (PCLD, geonameid 661882) stands for our maakunta 21. 16/16 matched by code.
- **GeoNames carries abolished municipalities as live rows**: `099` Honkajoki (abolished
  2021, last modified 2022) and `911` Valtimo (abolished 2020, last modified 2016) are
  still ADM3. `588` Pertunmaa — which the investigation brief listed as a third stale
  code — is now correctly ADM3H (moved 2025-02-13, ~6 weeks after its merger took
  effect). Two lessons: GeoNames *does* eventually fix these, on no deadline; and the
  ADM3-vs-ADM3H flag alone cannot be trusted, so completeness gates must be exact counts
  against an externally sourced number.
- **9 ADM3H rows share an admin3 code with a live ADM3 row** (e.g. Ylistaro carries 743,
  Seinäjoki's code). An ingestion that keyed on official codes without strict
  feature-code filtering would collide; dedupe keys on geonameid.
- **GeoNames' canonical `name` disagrees with our convention on 17 municipalities**: for
  Swedish-majority municipalities GeoNames' name is the Swedish form (Pargas, Korsholm,
  Jakobstad, Raseborg…) where our convention stores the Finnish form (Parainen,
  Mustasaari, Pietarsaari, Raasepori). Several ADM1 names are anglicized ("Central
  Finland", "South Karelia Region", "Lapland"). **All 17 + all 18 are recoverable from
  the per-country alternate-names file by selecting the `fi` alternate** (preferred flag
  where present). Name resolution must therefore go through alternate-names language
  selection — the dump's `name` column is not any single language.
- **The legal-vs-exonym distinction does not exist in GeoNames**: 293 of 294 kuntaa carry
  a Swedish alternate that is neither colloquial nor historic — including monolingual
  Finnish towns whose Swedish exonym is not a legal name (Tampere → "Tammerfors",
  unflagged; Virrat → "Virdois"; Ylitornio → "Övertorneå"). Helsinki's sv "Helsingfors"
  and fi "Helsinki" are both marked preferred. Roughly forty-ish municipalities have a
  *legal* Swedish name; GeoNames offers ~293. This is why `name_i18n` cannot be sourced
  from GeoNames.

### France (FR.txt, 174,637 rows; GP/MQ/GF/RE/YT.txt)

- FR.txt: ADM1 13 (metropolitan régions, admin1 = official INSEE code), ADM2 96
  (metropolitan départements, admin2 = official code), ADM3 320 (arrondissements), ADM4
  34,742 (communes, **admin4 = official INSEE commune code**), plus ADM4H 1,816. All ADM4
  rows carry admin1/2/3.
- Join against our 34,875 communes: **34,738 matched in FR.txt + 129 in the five DROM
  files = 34,867 (99.977%)**. The 137 not in FR.txt are 129 DROM + 8 mainland.
- The 8 mainland misses are GeoNames lagging the COG 2026: 4 communes whose INSEE code
  changed when their chef-lieu moved (GeoNames still carries the old code — Conques-en-
  Rouergue, Aurseulles, Orée d'Anjou, Porte des Pierres Dorées), and 4 communes restored
  in the 2026 COG when a commune nouvelle was dissolved (Celles, Chalinargues, Chavagnac,
  Sainte-Anastasie, all in Cantal — GeoNames still shows the merged state, and renames
  15141 accordingly). 15 name diffs total on matched rows, some GeoNames-stale, one a
  GeoNames typo ("Waldighofen"). **Conclusion: our COG-sourced rows are *more current*
  than GeoNames — re-seeding France from GeoNames would be a downgrade, and sync must
  treat GeoNames-vs-official name diffs as report-only for official-source countries.**
- **DROM**: GP/MQ/GF/RE each carry their région (ADM1), département (ADM2, admin2 =
  971/972/973/974) and all communes (ADM4, admin4 = INSEE code) — 32+34+22+24 = 112/112
  matched. **Mayotte (YT) is shaped differently: no ADM2/3/4 at all — its 17 communes are
  ADM1 rows with the full INSEE code in admin1** (97601…), 17/17 matched, and its
  région/département rows do not exist as A rows. Config must be able to declare, per
  file, which feature code is the municipality level and where the code lives, and to pin
  a file's subtree under an explicitly-declared parent (AX under maakunta 21; YT's
  communes under département 976, which our seed already has).

### Sweden and Spain (pilot-shape checks)

- SE.txt: ADM1 21 län — but **admin1 codes are GeoNames' own, NOT the official län
  codes** (Norrbotten is `14` in GeoNames, `25` officially). ADM2 290 kommuner with
  **admin2 = the official 4-digit SCB kommun code** (Umeå 2480, Piteå 2581), whose first
  two digits are the official län code. So: municipalities join officially; regions
  either derive their official code from the kommun-code prefix (declared in config) or
  carry NULL `external_code` and key on geonameid alone.
- ES.txt: ADM1 19 (17 comunidades + Ceuta/Melilla; GeoNames' own codes), ADM2 52
  provinces (letter codes, not INE numbers), ADM3 8,124 municipalities with **admin3 =
  the official 5-digit INE code**.
- Pattern across all four countries: **the municipality level reliably carries the
  official national code somewhere in the admin-code columns; the upper levels only
  sometimes do.** The design anchors official-code joins at municipality level and treats
  upper-level official codes as config-optional.

### Postal files (`/export/zip/`)

Columns: country(0), postal code(1), place name(2), admin name/code 1 (3/4), 2 (5/6),
3 (7/8), lat/lon/accuracy.

- **FI**: 3,576 rows, one per postal code. The kunta code is **admin code3 (column 8)**;
  292/292 of our mainland kuntaa are covered. The two stale municipalities (099/911)
  appear too and simply won't resolve — report, don't fail. Some corporate codes are
  present (00102 Eduskunta); harmless for code→municipality lookup.
- **AX** is a separate postal file (37 rows) and the kunta code shifts to **admin code2
  (column 6)**; 16/16 kuntaa covered. Same file-set-per-country trap as the dumps.
- **FR**: 51,611 rows, but **admin code3 is the three-digit département+arrondissement
  code (751, 772…), not the commune INSEE code — 0 of 34,875 join.** GeoNames' French
  postal file cannot be used against our communes without name matching, which we will
  not do. France uses La Poste's *Base officielle des codes postaux* (Licence Ouverte
  2.0, pulled from datanova.laposte.fr — the data.gouv mirror is stale), which joins on
  `code_commune_insee` at 99.99%; the only misses are Paris/Lyon/Marseille, keyed there
  by arrondissement (75101–75120, 69381–69389, 13201–13216) where the COG (and our seed)
  has single communes (75056, 69123, 13055). That rollup is a fixed 45-code→3-commune
  mapping, encoded as data in the FR postal config.
- Finland's national source (Posti PCF: daily, exact, 100% of kuntaa, but under Posti's
  own terms rather than an open licence, fixed-width with a type code at offset 110) is
  the documented *upgrade path*, deliberately not taken now: GeoNames covers every kunta
  with zero per-country work, which is the trade this plan optimises for.

### Country reference

`countryInfo.txt` supplies each country/territory's geonameid for the country rows: FI
660013, AX 661882, FR 3017382, GP 3579143, MQ 3570311, GF 3381670, RE 935317, YT 1024031,
SE 2661886, ES 2510769.

## Design

### Per-country ingestion config (scripts-side, never shipped to the browser)

A new module under `scripts/lib/geonames/` holds one config entry per country. The
existing UI hierarchy config (`src/lib/constants/location-hierarchies.ts`) stays the
authority on labels/i18n; it gains one field: which level is the country's **anchor** —
the level a parent identifies with and a site is parented under (one role, because the
architecture requires them to be the same level). A unit test asserts every configured
country's anchor is `municipality` until a country genuinely diverges; the pickers keep
their current `municipality`/`site` pickable types and need no new machinery until then.

Sketch (illustrative, not an API contract):

```js
FI: {
  isoFiles: ["FI", "AX"],
  nameSource: "official",          // GeoNames never rewrites FI names or codes
  canonicalLanguage: "fi",
  levels: {
    FI: { region: { fcode: "ADM1", codeField: "admin1" },
          municipality: { fcode: "ADM3", codeField: "admin3" } },
    AX: { municipality: { fcode: "ADM2", codeField: "admin2",
          parent: { type: "region", externalCode: "21" } } },
  },
  countryRow: { geonameid: 660013 },
  pins: [ { type: "region", externalCode: "21", geonameid: 661882 } ], // AX PCLD *is* maakunta 21
  expected: { region: 19, municipality: 308 },   // sourced from the national classification, never from the files
  postal: { source: "geonames", files: { FI: { muniCodeField: "adminCode3" },
                                         AX: { muniCodeField: "adminCode2" } } },
},
SE: {
  isoFiles: ["SE"],
  nameSource: "geonames",          // alternate-name resolution in `sv`, preferred-flag first
  canonicalLanguage: "sv",
  levels: { SE: { region: { fcode: "ADM1", officialCode: { fromMunicipalityPrefix: 2 } },
                  municipality: { fcode: "ADM2", codeField: "admin2" } } },
  countryRow: { geonameid: 2661886 },
  expected: { region: 21, municipality: 290 },
  postal: { source: "geonames" },
},
```

Key properties, each answering a verified failure shape:

- `isoFiles` is a set; the completeness gate uses `expected` counts **for the whole
  country, sourced from the national statistical agency (or an equivalent authoritative
  statement), never derived from the files being read.** A forgotten AX/YT-style file
  then fails the count instead of shipping a hole a gedu's "France" tick silently
  doesn't cover.
- Per-file level mappings absorb the AX column shift, Mayotte's ADM1 communes, and any
  future oddity, without code.
- `pins` and per-file `parent` declarations handle subtrees whose upper levels GeoNames
  doesn't model (AX, YT) — a handful of declarative lines, not bespoke code.
- `nameSource: "official"` (FI, FR) means sync never rewrites names or codes from
  GeoNames and only *reports* drift; `"geonames"` (new countries) means renames apply on
  sync. Canonical names for GeoNames-sourced countries resolve through the per-country
  alternate-names file by `canonicalLanguage` (preferred flag first, then any alternate
  in that language, then the dump's name column) — verified necessary by Finland's
  Swedish/anglicized dump names.

### Schema changes (one groundwork migration)

- `locations.geonames_id bigint` NULL, `UNIQUE ... WHERE geonames_id IS NOT NULL`. The
  GeoNames key for sourced/mapped rows; sites and synthetic/pinned rows without a
  GeoNames identity stay NULL. **`external_code` is not touched and never holds a
  geonameid** — its contract (official code, unique per country+type) stays exactly as
  documented.
- `locations.depth smallint NOT NULL` — 0 for countries, parent+1 below, maintained by a
  BEFORE INSERT/UPDATE trigger reading the parent row (EXECUTE revoked from client roles
  like the existing products-location trigger; trigger functions don't need caller
  EXECUTE). Backfilled recursively for existing rows, asserted (every row's depth =
  ancestor-chain length). This is what lets search rank "broadest first" without a
  per-country CASE.
- `locations.retired_at timestamptz` NULL. Retired rows are excluded from browse reads,
  the search function and the municipality-directory read; **keyed reads still return
  them** (a stored pick must keep resolving — the three-state guard's "absent vs
  invalid" distinction depends on it), the ancestor walk still includes them, and
  substitute matching still sees claims on them. Nothing retires a `site`.
- `locations.country_code` backfilled on the existing `site` rows from their parents
  (verified today the create route never sets it), and the site-create route starts
  stamping it from the confirmed parent row. This unblocks country-scoping the venue
  dialog later and keeps the denormalization invariant honest.

### The generator and its gates

`scripts/generate-geonames-seed.mjs <CC>` (plus a shared parser module) downloads the
config's file set, filters to exact live feature codes (never the `H` variants), resolves
names per `canonicalLanguage`, builds the tree from the admin-code columns (not
`hierarchy.txt`, which mixes non-administrative memberships), and emits one seed
migration: country row, then each level, NOT EXISTS-guarded on `geonames_id`, every row
carrying `geonames_id`, `country_code`, `depth`-consistent parentage, and
`external_code` where the config maps an official code. The migration ends with the
France-style assertion block, hardened by what today's verification found:

- exact per-level counts against `expected` (catches Åland-shaped holes *and* GeoNames'
  stale-live rows — Honkajoki/Valtimo would surface as a count surplus with their names
  in the error),
- zero orphans (LEFT JOIN shape), zero rows missing `geonames_id`, zero code-less rows
  at levels the config maps codes for, uniqueness of codes within (country, type),
- no control characters or empty names (the France generator's literal-safety checks,
  reused).

Determinism caveat, stated honestly: GeoNames publishes no archive of country files, so
"byte-identical rerun" only holds against the same downloaded snapshot. The generator
sorts by geonameid, writes nothing run-dependent, and stamps the dump's modification date
in the migration header; the committed migration itself is the reviewable snapshot of
record. A count mismatch at generation time is the human-judgment moment: identify the
surplus/missing rows by name against the national list (minutes, not row-curation).

### Sync (`scripts/diff-geonames.mjs <CC>`)

Reads the config's current dumps and the live table (read-only), and emits (a) a
human-readable report and (b) a reconciliation migration containing only: INSERTs of
genuinely new rows (guarded, gated as above), UPDATEs renaming rows *only when
`nameSource` is `geonames`*, and `retired_at` stamps on rows GeoNames no longer carries
live. **It never emits DELETE, never reparents, and never touches codes on
official-source countries.** A human reads the report, decides anything ambiguous (a
merge's coverage implications, a retirement that something references), and pushes the
migration through the normal workflow. Sync stays deliberately unscheduled — run it
before expansion pushes, or when a place we operate in changes; the existing January
official-classification procedure for FI/FR is unchanged and remains those countries'
real refresh mechanism (verified: GeoNames lagged a 2025 Finnish merger by six weeks but
carries two other abolitions five years on — it is a tripwire for FI/FR, not a source).

### Search

- `search_locations` is recreated (body copied from `supabase/schema.sql` per the
  migration rules, grants re-stated, spine re-verified): ORDER BY switches from the
  hardcoded level CASE to `depth` — retiring `00141`'s documented wrongness for
  district-below-municipality countries before any such country ships — plus a
  `retired_at IS NULL` filter and a new optional country parameter (default NULL,
  backward-compatible). The country parameter closes the documented gap where the
  server's cap starves a client-side country filter; the online-municipality picker and
  any country-restricted caller pass it through the search route (which folds it into
  the cache key URL).
- The fold, the trigram index, the ≥2-char floor (Finland's kunta **Ii** is two letters
  — the floor cannot rise), the cap, and the cached anonymous route are all untouched.
  New countries add rows to the same generated column with no reindexing step; total
  admin-row volume for the sketched expansion (~50–80k rows) is well inside what the
  stored-fold design already handles at 35k.

### Postal codes

New table `postal_codes (country_code text, postal_code text, location_id uuid REFERENCES
locations ON DELETE CASCADE, PRIMARY KEY (country_code, postal_code, location_id))` — a
code can span municipalities and a municipality has many codes. RLS enabled with a
read-for-everyone policy, SELECT granted to anon + authenticated (the parent registration
page is public), no client write grants; rows land via generated data migrations that
join codes to municipalities on `(country_code, type='municipality', external_code)`.
Nothing references postal rows, so a refresh is a plain delete-and-reinsert migration —
this is the seed-versus-sync split the FK hazard forces on `locations`, *not* forced
here, and why postal data can track upstream freely.

Source: GeoNames postal by default (config: file set + per-file municipality-code
column); France overrides to La Poste's BOCP with the 45-code Paris/Lyon/Marseille
rollup as config data. Gates: every non-retired municipality of the country has ≥1 code
(FI verified 308/308 today; FR ≥99.9%), and unmatched codes (e.g. rows pointing at
GeoNames' stale 099/911) are counted and reported, not failed on.

This plan ships the table and ingestion; the consuming UI (postal-code entry as a
shortcut in the parent's picker, "clubs near me") is deliberately separate later work —
and per the invariants, coordinates/radius stay out of *coverage* semantics entirely.

## Rejected alternatives

- **Re-seed FI/FR from GeoNames.** Loses to reality on every axis: deleting rows
  cascades away gedu coverage and nulls parent picks; and GeoNames is *behind* our
  COG/Tilastokeskus rows (8 stale communes, 2 stale kuntaa, 17+15 name divergences,
  verified). Mapping in place costs one backfill migration and zero churn.
- **GeoNames as the name authority for FI/FR.** Would rename Parainen→Pargas,
  Mustasaari→Korsholm, and adopt a French typo — user-visible downgrades in our biggest
  market, violating the stated canonical-name convention.
- **Sourcing `name_i18n` from alternateNames.** GeoNames marks Tampere's "Tammerfors"
  exactly like Helsinki's legal "Helsingfors" (verified: 293/294 kuntaa have clean sv
  alternates; only ~40 have legal Swedish names). The column's contract is legal
  alternates only. A separate *search-only* aliases column fed by GeoNames alternates is
  a plausible future enhancement (find-by-exonym without displaying it), but it is out of
  scope and must not touch `name_i18n`.
- **Overloading `external_code` with geonameids.** Breaks the column's stated contract
  and every future join against official data; a separate keyed column is one line of
  schema.
- **Adopting GeoNames' intermediate levels (FI seutukunnat, FR arrondissements) now.**
  The brief invited considering seutukunnat as the missing rung for coverage
  expressiveness. Recommendation: no. It reshapes ancestor chains under live FKs,
  changes the embed depths, adds a level whose official standing in Finland is doubtful
  (verify before ever adopting — Tilastokeskus's maintenance of it has lapsed), and the
  actual pain ("Rhône except Lyon" = 267 ticks) is a coverage-*editor* UX problem —
  bulk-tick affordances — not a tree-shape problem. The role-based config keeps the door
  open: if a country ever needs a rung, it is config + a data migration, and GeoNames
  demonstrably carries both candidates (66 seutukunnat, 320 arrondissements, official
  codes attached).
- **`hierarchy.txt` for parentage.** Unnecessary (admin-code columns were complete for
  every verified country: 0 missing on 34,742 FR ADM4 and 294 FI ADM3) and riskier — it
  mixes non-administrative memberships.
- **A standing scheduled sync that applies changes automatically.** A refresh that can
  retire rows is a judgment call by the existing rules; automation would only remove the
  human from exactly the step that needs one. The differ can *run* on a schedule as a
  report-only tripwire later if wanted.
- **GeoNames postal for France / national postal everywhere.** The FR GeoNames postal
  file joins 0/34,875 communes (arrondissement codes, verified) — the override is
  forced. In the other direction, Posti's PCF is better than GeoNames' FI postal file
  but costs a bespoke licence review and parser for accuracy nothing currently needs;
  GeoNames covers 308/308 kuntaa today. Default GeoNames, override only where the join
  is structurally broken.
- **Nominatim, Google Places, GADM, OSM** — ruled out before this investigation and
  re-stated so this plan stands alone: Nominatim forbids autocomplete and systematic
  extraction; Google forbids caching the names/hierarchy we join on and bills abandoned
  autocomplete sessions on public pages; GADM is non-commercial; OSM ids are explicitly
  impermanent and OSM/Google share the per-country admin-level-semantics problem anyway.

## Honest residuals — where "config + run" is not quite zero work

Flagging these per the brief's request to be told where its goal statement bends:

1. **Expected counts are irreducible per-country manual input** (one authoritative
   number per level, re-sourced on refresh). They are also the single most load-bearing
   quality gate — they are what catches both the Åland hole and the stale-live rows.
   Minutes of work, but genuinely manual, forever.
2. **The anchor-level choice is a product decision per country** (which level parents
   identify with and venues parent to). No data source makes it for you.
3. **New countries ship without minority-language legal alternates** (the accuracy side
   of the stated trade, taken deliberately). Finland's curated Swedish set stays; a
   future country that wants the equivalent pays for curation then.
4. **GeoNames' lag is real and unbounded per-row** (six weeks for one Finnish merger,
   five years and counting for two others). For GeoNames-sourced countries this is the
   accepted accuracy floor — and it is still current-or-better versus a seed nobody
   refreshes. For FI/FR it is why GeoNames is a tripwire, not a source.

## Phasing and steps

Migration numbers below are deliberately unstated: pick the next free number at
implementation time, checked against remote migration history first (an already-used
version number is silently treated as applied).

### Phase 1 — schema groundwork (no user-visible change, no FK contact)

1. Groundwork migration: `geonames_id` + partial unique index; `retired_at`; `depth` +
   trigger + recursive backfill + assertions; site `country_code` backfill + assertion.
   Explicit grants unchanged (no new client-reachable functions; trigger function
   EXECUTE revoked). Push, regenerate types, add any aliases.
2. Recreate `search_locations` (depth ordering, retired filter, country parameter);
   re-state grants; spine re-verification. Update the search route/contracts/service for
   the optional country parameter; the online-municipality picker passes FI.
3. Service reads: browse/directory/whole-list reads exclude retired rows; keyed reads
   deliberately do not. Named-columns literals gain nothing (no read selects the new
   columns except where a surface needs `retired_at` — none do yet).
4. DB tests: depth trigger cases, retired-row visibility per read shape, search ordering
   regression (the "haute" case from `00141`'s header), country-filter behaviour, spine
   completeness green. Push branch; CI runs them.

Independently verifiable: app behaves identically; all assertions and tests green.

### Phase 2 — pilot country: Sweden (proves the approach; still no FK contact)

5. Build `scripts/lib/geonames/` (parser, config schema, name resolution, gates) and the
   SE config entry; add the `anchor` role to the hierarchy config with its everything-
   is-municipality assertion test.
6. Run `generate-geonames-seed.mjs SE`; review the emitted migration; push to staging;
   verify by hand from fixtures/staging: picker browses Sweden, search finds "Umeå" with
   diacritic folding both ways, a coverage tick on a kommun saves, ranking puts län
   above kommuner. No products/gedus/parents reference SE rows, so this phase cannot
   touch a live FK by construction.

Independently verifiable: Sweden exists end to end with zero Sweden-specific code.

### Phase 3 — adopt Finland and France (map, don't move)

7. FI + FR config entries (file sets, level mappings incl. AX/YT shapes, pins,
   `nameSource: "official"`).
8. `generate-geonames-adopt.mjs <CC>` emits a backfill migration: UPDATE … FROM (VALUES
   (external_code, geonameid) …) per level, joined on the country+type+code key (the
   lookup carries the level, per the code-lookup rule), plus the country rows and the
   pinned AX/YT mappings. Assertions: FI fully mapped (19 + 308 + 1 rows, zero
   unmatched); FR mapped except a literally-listed known-stale set (the 8 communes
   above) — the assertion pins the *exact* exception list so an unexpected miss fails.
   Rerunning sync later heals the 8 as GeoNames catches up.

Independently verifiable: row counts and ids unchanged before/after (assert in the
migration); every FK table's rows still resolve; the 8 exceptions enumerated.

### Phase 4 — sync tooling

9. `diff-geonames.mjs <CC>`: report + reconciliation migration per the Sync section
   (insert/rename-if-geonames-sourced/retire; never delete). Document the run procedure
   in the scripts module header and update `src/services/locations/CLAUDE.md`'s seeding
   and refresh sections (same change that alters the system, per the docs rule).

Independently verifiable: run against SE immediately after Phase 2 → empty diff; dry-run
against FI → report names exactly the known GeoNames staleness, migration contains no
destructive statement.

### Phase 5 — postal codes (independent of Phases 2–4 after Phase 1)

10. `postal_codes` migration (table, RLS, SELECT grants, index) + access-control test
    sweep entries; types + aliases.
11. `generate-postal-seed.mjs <CC>` with GeoNames default + FR La Poste override and the
    PLM rollup; seed FI (+AX) and FR; gates as designed (per-municipality coverage
    threshold, unmatched-code report). Service-layer lookup: resolve (country, postal
    code) → municipality row id, then the existing keyed read; no new RPC, so no spine
    entry.
12. Add the GeoNames CC BY 4.0 attribution (plus La Poste Licence Ouverte credit) to the
    public legal/about surface — small, legally required by the licences, translated per
    the i18n rule.

Independently verifiable: Helsinki 00100 → kunta 091; a Mariehamn code → 478 via the
AX column shift; Paris 75101… → commune 75056 via the rollup; counts green.

## Acceptance criteria

- Adding Sweden introduced **zero Sweden-specific executable code** — a config entry, a
  generated migration, and config-driven gates only.
- Finland and France: identical row ids and row counts before/after adoption; every
  `products` / `profiles` / `gedu_locations` reference resolves unchanged; official
  codes and names untouched.
- `00141`'s hardcoded breadth CASE is gone; search ranks by stored depth and passes the
  documented "haute" regression at France scale.
- No code path — app or tooling — can delete a location row as part of refresh; the only
  states sync can produce are inserted, renamed (geonames-sourced countries only), and
  retired.
- The DB authorization spine and access-control sweeps are green with the new objects
  classified; every new object carries explicit grants and RLS.
- Postal lookup resolves the three verified fixtures above; postal rows rebuild freely
  with no FK consequence.
- All documentation whose systems changed (`src/services/locations/CLAUDE.md`, script
  headers) updated in the same changes.

## Risks and mitigations

- **GeoNames quality regression or vandalism arriving via a daily dump** → every write
  path is a generated, human-reviewed, assertion-gated migration; nothing ingests
  unattended. Count gates catch bulk damage; review catches the rest.
- **GeoNames re-levels a country's admin hierarchy** (it has historically) → dedupe key
  is geonameid, so row identity survives; the config's fcode mapping fails loudly on
  counts and gets a config edit, not code.
- **A future country where GeoNames lacks official municipality codes** → external_code
  stays NULL there, joins-to-official-data are forfeited for that country until someone
  wires its classification, and postal ingestion needs the GeoNames postal file's own
  admin columns instead; the config expresses all of this, but the *quality* is honestly
  lower. Evaluate per country at config-writing time.
- **Retired rows accumulating** → they are reference rows costing bytes; a periodic
  human-decided cleanup migration may delete unreferenced ones. Never automatic.
- **The 8 France stale mappings drifting silently** → pinned as an exact exception list
  in the adoption migration and re-surfaced by every sync report until they heal.
- **Licence exposure** → CC BY 4.0 requires attribution (step 12); La Poste's Licence
  Ouverte requires source credit; neither restricts commercial use. Posti's terms are
  why its PCF was *not* adopted.

## What NOT to do

- Do not regenerate or edit the applied FI/FR seed migrations — history, per the
  standing rule.
- Do not let anything outside the database fold search terms, ship geography to the
  browser, or reintroduce a per-country catalog asset.
- Do not use lat/lon for coverage semantics; coordinates are only a candidate input for
  a future "near me" *display* feature, evaluated separately.
- Do not put geonameids in `external_code`, GeoNames names on official-source countries,
  or GeoNames alternates in `name_i18n`.
- Do not add the intermediate hierarchy rungs, cascade semantics for coverage ticks, or
  a country dropdown to the picker — all previously rejected, reasons above and in
  `src/services/locations/CLAUDE.md`.
