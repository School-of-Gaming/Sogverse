# Locations on GeoNames

Rebuild the location system's data supply on GeoNames as the **single source and single
authority for every country — the two existing ones included**. Adding a country becomes
a config entry plus an ingestion run; keeping a country current becomes one uniform sync
procedure; the bespoke per-country lineage (the France generator, the hand-written
Finland seeds' refresh procedure, the January national-classification diff) is retired
outright. The read layer, the picker, coverage semantics and every invariant in
`src/services/locations/CLAUDE.md` stay as they are; what changes is where rows come
from and how they are kept current.

Everything in "What was verified" below was checked against **real downloaded data on
2026-08-06/07** — the dumps' own modification dates confirmed the daily refresh — plus a
read-only inspection of the production database on 2026-08-07. Re-verify anything
surprising, but do not re-derive it; the numbers are the evidence the decisions rest on,
including the exact, named cost of putting Finland and France under GeoNames authority
(Finland: zero visible name changes; France: inherits GeoNames' small, named lag) and
the verified-tiny set of live references the cutover must carry across.

## Problem

Adding a country today means hand-writing a seed migration against that country's
national statistical classification. Finland was hand-written (19 maakuntaa + 308 kuntaa
across several migrations); France needed a bespoke generator
(`scripts/generate-france-communes-migration.mjs`) plus a 34,875-row migration. Every new
country repeats that work — and every existing country's yearly refresh is a hand-diffed
reconciliation against its national classification, done by us, forever.

We are a small team about to expand into several new countries. Per-country data
engineering does not scale with our headcount or our expansion rate, and it makes us the
maintainer of geography we have no business maintaining. The decision-owner's explicit
call, made after seeing the accuracy trade quantified: **one authority for everything
beats a slightly more accurate dual system.** This plan is written to that call.

## Scale

- On `dev`, `locations` holds ~35,300 seeded rows (FI: 1 + 19 + 308; FR: 1 + 18 + 101 +
  34,875) plus admin-created `site` rows.
- **Five tables FK into `locations`**: `products.location_id` (RESTRICT),
  `profiles.home_location_id` (SET NULL), `gedu_locations.location_id` (**CASCADE** —
  the dangerous one), and `site_details`/`site_staff_details` (CASCADE, but they
  reference only `site` rows, which are ours and never externally sourced — no wipe or
  sync ever touches them).
- **Live references, verified against production on 2026-08-07** (prod trails `dev` from
  before `external_code`, search and `home_location_id` existed; its tree is old
  Finland only — 1 country + 19 regions + 308 municipalities + 1 site):
  - **2 products** carry a `location_id`, both via the single admin-created site, which
    is kept through any cutover — so `products` rows never need touching at all.
  - **702 `gedu_locations` rows across only 5 gedus** — two are full select-everything
    enumerations from the old cascade-style editor (one ticked the country + all 19
    regions + all 308 municipalities + the site, 329 rows; the other the same minus the
    country tick, 328), one has 28 ticks, one 16, one a single municipality. Five simple
    coverage sets. Ticks on seeded rows re-point by official code; ticks on the site
    survive the cutover untouched (sites are never wiped); the one country tick
    re-points by (country_code, type), because country rows carry no official code in
    any national classification.
  - **0 parent home locations** (the column does not exist on prod yet).
  - Staging's location data is fake and explicitly disposable (decision-owner's call,
    2026-08-07): the cutover re-points what maps by code and drops the rest with a
    warning.
- Candidate next countries already sketched in the hierarchy config: SE, ES, US, GB, JP.
  Sweden is the pilot here (clean shape, verified below, labels already configured).

## The decision

1. **GeoNames is the source and the authority for every country.** One country-agnostic
   generator reads the GeoNames country dumps plus a per-country config entry and emits
   a seed migration: deterministic, NOT EXISTS-guarded, ending in hard assertions.
   Adding a country = write the config entry, run the generator, push the migration.
   Keeping any country current = the same sync tooling, no country special-cased.
2. **Finland and France cut over: the old seeded tree is wiped and reseeded through the
   exact same generator path as any new country.** The live references — verified tiny
   against production, see Scale — are carried across *inside the cutover migration* by
   official code: sites (ours, never wiped) are re-parented to the new municipality rows
   by their old parent's code, gedu coverage ticks and any home-location picks are
   captured before the wipe and re-inserted against the new rows by the same code join.
   Anything that cannot map is dropped with a `RAISE WARNING` naming it (expected: zero
   on prod; possibly a few disposable staging rows), and hand psql is the fallback for
   whatever a warning surfaces. New UUIDs throughout the seeded tree are accepted —
   nothing durable outside the database holds a location UUID (caches are ephemeral;
   public links use slugs). From cutover on, Finland and France are indistinguishable
   from a country added yesterday: same config shape, same sync, no national-
   classification refresh procedure, and the France generator lineage is deleted.
3. **A country maps to a *set* of ISO-3166 alpha-2 files, declared in config.** This is
   the Åland/DROM trap made structural: FI = {FI, AX}, FR = {FR, GP, MQ, GF, RE, YT}.
   The completeness gate (below) is what catches a missing member.
4. **A new column `geonames_id` is the key; `external_code` keeps its existing
   contract.** GeoNames itself carries the official statistical codes in its admin-code
   columns for every country verified (that is what the cutover's re-point join runs
   on), so
   `external_code` stays populated — by GeoNames — wherever an official code exists, and
   official-data joins (La Poste postal, any future national dataset) keep working.
5. **Level semantics are declared by role in config**, and a stored `depth` column makes
   search ranking country-agnostic, retiring the hardcoded breadth CASE that migration
   `00141` documents as wrong for district-below-municipality countries.
6. **Sync never deletes: it inserts, renames, and *retires*.** A new nullable
   `retired_at` hides a row from pickers, browse and search while every existing FK,
   coverage claim and ancestor walk keeps working. This closes the `gedu_locations`
   ON DELETE CASCADE hazard structurally: no refresh path deletes location rows at all.
   Deleting a retired, unreferenced row remains a manual, human-decided migration.
   **Upstream garbage is handled by a small, reviewed, per-country exclusion list of
   geonameids in config** (Finland needs exactly two entries at cutover, below) — and
   by fixing GeoNames itself, which accepts corrections; with one authority, upstream is
   where corrections belong, not local overrides that drift.
7. **Canonical names come from GeoNames through a per-country resolution rule, and the
   rule is config, verified per country.** The dump's `name` column is not any single
   language, so config declares either `nameResolution: "dump"` (France — verified
   below: its French alternates are polluted and the dump name is the honest one) or
   `nameResolution: { language: "…" }` (Finland — verified below: resolving through the
   `fi` alternates reproduces our current Finnish canonical names **exactly, all 328
   rows, zero diffs**, where the raw dump name would have renamed 17 municipalities to
   Swedish). Choosing the rule is part of writing a country's config entry and is
   validated by the gates, not by trust.
8. **Postal codes arrive as a new, FK-free-to-rebuild `postal_codes` table**, sourced
   from GeoNames' postal dumps by default with a per-country override hook; France is
   the one country that needs the override (La Poste, with the Paris/Lyon/Marseille
   rollup), because GeoNames' French postal file structurally cannot join communes —
   verified below. The override is a data-source choice inside the new system, not a
   legacy remnant.
9. **`name_i18n` is sourced from GeoNames too — no curated list anywhere.** The config
   declares which locales a country ingests alternates for (`alternateLocales`, FI:
   `["sv"]`); the generator resolves each with the same mechanical rule as canonical
   names and skips values equal to the canonical name (the never-duplicate rule, now
   mechanical). Verified below: this reproduces **50 of the 51** curated legal Swedish
   names exactly and extends coverage with 83 established Swedish exonyms (Tammerfors,
   Nystad, Torneå…). The decision-owner's call, with the trade on the table: this
   *replaces* the "legal/official alternates only" contract on `name_i18n` — the column
   becomes "GeoNames-sourced display alternates" — in exchange for owning zero curated
   data. The implementing change rewrites that contract (and the no-exonyms rule) in
   `src/services/locations/CLAUDE.md`. The one known imperfection (Kanta-Häme resolves
   to "Tavastland" rather than the legal "Egentliga Tavastland") is fixed upstream in
   GeoNames if it bothers anyone — never with a local override.

## What was verified against real data (2026-08-06/07)

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
- **GeoNames carries two abolished municipalities as live rows**: `099` Honkajoki
  (geonameid 657480; abolished 2021, last modified 2022) and `911` Valtimo (geonameid
  632553; abolished 2020, last modified 2016) are still ADM3. `588` Pertunmaa — which
  the investigation brief listed as a third stale code — is now correctly ADM3H (moved
  2025-02-13, ~6 weeks after its merger took effect). Two lessons: GeoNames *does*
  eventually fix these, on no deadline; and the ADM3-vs-ADM3H flag alone cannot be
  trusted, so completeness gates must be exact counts against an externally sourced
  number. These two geonameids are Finland's config exclusion list at cutover.
- **9 ADM3H rows share an admin3 code with a live ADM3 row** (e.g. Ylistaro carries 743,
  Seinäjoki's code). An ingestion keying on official codes without strict feature-code
  filtering would collide; dedupe keys on geonameid.
- **The dump's `name` column is not Finnish**: 17 municipalities carry the Swedish form
  (Pargas, Korsholm, Jakobstad, Raseborg…) and several ADM1 names are anglicized
  ("Central Finland", "South Karelia Region", "Lapland").
- **Resolving names through the `fi` alternates instead reproduces our canonical names
  exactly — zero diffs across all 19 + 308 + 1 rows (2026-08-07 simulation).** Rule
  simulated: candidates = `fi` alternates excluding colloquial/historic; prefer the
  preferred-flagged one; else the shortest; else the dump name. This includes Åland via
  the AX alternates (Maarianhamina, Ahvenanmaa) and every anglicized maakunta. GeoNames'
  Finland, read in Finnish, *is* our Finland — which is what makes the cutover
  invisible there.
- **The legal-vs-exonym distinction does not exist in GeoNames** — 293 of 294 kuntaa
  carry a clean Swedish alternate, though only ~40 municipalities have a *legal*
  Swedish name — but a follow-up simulation (2026-08-07) showed the distinction doesn't
  need to exist for sourcing to work: resolving `sv` alternates with the same
  mechanical rule as canonical names **agrees with 50 of the 51 curated legal entries
  exactly** (regions included: Nyland, Birkaland, Kajanaland…), loses none, and adds
  sv entries on 83 further rows — established exonyms in real Finland-Swedish usage
  (Tammerfors, Nystad for Uusikaupunki, Nyslott for Savonlinna, Raumo, Torneå, Tusby).
  The single disagreement is Kanta-Häme ("Tavastland" vs legal "Egentliga
  Tavastland"), fixable upstream by flagging the preferred alternate. This is what
  makes a fully GeoNames-sourced `name_i18n` viable once the legal-only contract is
  dropped.

### France (FR.txt, 174,637 rows; GP/MQ/GF/RE/YT.txt)

- FR.txt: ADM1 13 (metropolitan régions, admin1 = official INSEE code), ADM2 96
  (metropolitan départements, admin2 = official code), ADM3 320 (arrondissements), ADM4
  34,742 (communes, **admin4 = official INSEE commune code**), plus ADM4H 1,816. All ADM4
  rows carry admin1/2/3.
- Join against our 34,875 communes: **34,738 matched in FR.txt + 129 in the five DROM
  files = 34,867 (99.977%)**. The 137 not in FR.txt are 129 DROM + 8 mainland.
- The 8 mainland misses are GeoNames lagging the COG 2026, and under the cutover they
  are simply what France *is* until upstream heals: 4 communes carry the pre-move
  chef-lieu INSEE code (Conques-en-Rouergue, Aurseulles, Orée d'Anjou, Porte des
  Pierres Dorées), and 4 communes restored by the 2026 COG when a commune nouvelle was
  dissolved (Celles, Chalinargues, Chavagnac, Sainte-Anastasie, all in Cantal) do not
  exist in GeoNames yet and so won't exist in our tree either — they arrive via sync
  when upstream adds them. Nothing references any of the 8. They are the reason
  France's `expected` count carries a named allowance rather than matching the COG's
  34,875 exactly.
- **Name resolution for France must be the dump name, not the French alternates
  (2026-08-07 simulation).** Resolving through `fr` alternates the way Finland resolves
  through `fi` produces **92** diffs, and the alternates are visibly polluted: a
  preferred-flagged "Département de Paris" over "Paris", "Région PACA" as shortest for
  Provence-Alpes-Côte d'Azur, and dozens of pre-merger names lingering as alternates on
  renamed rows. With `nameResolution: "dump"` the diff against our current COG names is
  **15 renames** — mostly GeoNames trailing recent COG renames, plus one upstream typo
  ("Waldighofen") worth correcting *in GeoNames* rather than locally. Under the cutover
  these are simply the names France ships with. DROM commune names: 0 diffs.
- **Alternate-locale payload is a per-pair empirical question, and France is the
  failing case (2026-08-07):** only 13 of its ~34,850 admin rows carry a `fi` alternate
  differing from the canonical name — none of them an exonym a Finnish speaker would
  recognize (no "Pariisi"), most mistagged orthographic variants and one outright wrong
  ("Chasselas→Gutedel", a German grape name). English fares little better as display
  ("Département du Nord→North", "Paris→Paris Department"). The structural reason: the
  famous multilingual exonyms live on GeoNames' populated-place (P) records, which are
  *different records with different geonameids* from the administrative (A) rows this
  tree ingests; Finland's `sv` worked because a co-official language got its admin
  records richly annotated, not because every pair is. So `alternateLocales` stays
  empty for a pair until its ingest diff shows real payload, and harvesting P-record
  alternates onto A rows is rejected — it would be a fuzzy cross-record matching step
  of exactly the kind this plan exists to avoid.
- **DROM**: GP/MQ/GF/RE each carry their région (ADM1), département (ADM2, admin2 =
  971/972/973/974) and all communes (ADM4, admin4 = INSEE code) — 32+34+22+24 = 112/112
  matched. **Mayotte (YT) is shaped differently: no ADM2/3/4 at all — its 17 communes are
  ADM1 rows with the full INSEE code in admin1** (97601…), 17/17 matched, and its
  région/département rows do not exist as A rows. Config must be able to declare, per
  file, which feature code is the municipality level and where the code lives, and to
  pin a file's subtree under an explicitly-declared parent (AX under maakunta 21; YT's
  communes under département 976).

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
  postal file cannot be used against communes without name matching, which we will not
  do. France uses La Poste's *Base officielle des codes postaux* (Licence Ouverte 2.0,
  pulled from datanova.laposte.fr — the data.gouv mirror is stale), which joins on
  `code_commune_insee` at 99.99%; the only misses are Paris/Lyon/Marseille, keyed there
  by arrondissement (75101–75120, 69381–69389, 13201–13216) where the COG has single
  communes (75056, 69123, 13055). That rollup is a fixed 45-code→3-commune mapping,
  encoded as data in the FR postal config. Note the La Poste join runs on
  `external_code`, which GeoNames keeps populated (decision 4) — so
  the cutover does not disturb it, except for the 4 chef-lieu communes whose codes
  GeoNames still has stale (their postal rows go unmatched and are reported until
  upstream heals).
- Finland's national source (Posti PCF: daily, exact, 100% of kuntaa, but under Posti's
  own terms rather than an open licence) is deliberately not used: GeoNames covers every
  kunta with zero per-country work, which is the trade this plan optimises for.

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
architecture requires them to be the same level). Two unit assertions, not one:
structurally, every config's anchor is the level immediately above `site` in its own
declared hierarchy; and every **seeded** country's anchor is `municipality`. The split
matters because the speculative US/GB/JP configs already declare `district` *below*
municipality — their anchor is honestly `district`; they just have no rows. The day one
of them is seeded is the day the pickers' hardcoded `municipality` pickable types must
generalize to anchor-driven, and the seeded-country assertion is the tripwire that
forces that work then. Until then the pickers keep their current types with no new
machinery.

Sketch (illustrative, not an API contract):

```js
FI: {
  isoFiles: ["FI", "AX"],
  nameResolution: { language: "fi" }, // verified: reproduces every current FI name exactly
  alternateLocales: ["sv"],           // name_i18n from GeoNames sv alternates — verified 50/51 vs the old legal set
  levels: {
    FI: { region: { fcode: "ADM1", codeField: "admin1" },
          municipality: { fcode: "ADM3", codeField: "admin3" } },
    AX: { municipality: { fcode: "ADM2", codeField: "admin2",
          parent: { type: "region", externalCode: "21" } } },
  },
  countryRow: { geonameid: 660013 },
  pins: [ { type: "region", externalCode: "21", geonameid: 661882 } ], // AX PCLD *is* maakunta 21
  exclude: [657480, 632553],           // Honkajoki, Valtimo — abolished, still live upstream
  expected: { region: 19, municipality: 308 },   // sourced from the national classification, never from the files
  postal: { source: "geonames", files: { FI: { muniCodeField: "adminCode3" },
                                         AX: { muniCodeField: "adminCode2" } } },
},
SE: {
  isoFiles: ["SE"],
  nameResolution: "dump",              // pick per country, validated at config-writing time
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
  doesn't model (AX, YT) — a handful of declarative lines, not bespoke code. A pin
  either attaches a geonameid to a row the level mappings already produce (AX's PCLD
  *is* maakunta 21) or declares a **synthetic row outright** — literal type, name,
  official code and parent, with `geonames_id` NULL: Mayotte's région 06 and
  département 976 exist in no GeoNames file as administrative rows, and `geonames_id`'s
  uniqueness means they couldn't both borrow YT's country record anyway. France's
  expected counts (18 régions, 101 départements) include them.
- `expected` is per level `{ count, allowMissing: [official codes…] }` — the count from
  the national classification, `allowMissing` naming exactly the rows GeoNames is known
  to lack (FR municipalities: the 8 codes above; empty everywhere else). The gate fails
  on any shortfall not named, on any surplus, **and on an `allowMissing` code that
  actually shows up** — a healed row is good news that must still be taken
  deliberately, by shrinking the list in config.
- `alternateLocales` governs the levels below country. **Country rows always ingest
  every supported UI locale** — verified 2026-08-07: the FI/AX/FR country records carry
  preferred-flagged alternates in all of them (Suomi/Finland/Finlande, Ranska/
  Frankrike, Ahvenanmaa/Åland), and resolving them reproduces the hand-seeded country
  translations of migration `00140` exactly. Countries are the one level where every
  locale has real payload, which is how `00140`'s rule ("countries are the one level
  that takes translations") survives the cutover mechanically instead of as curated
  data.
- `nameResolution` is the one per-country judgment about names, made once when the
  config entry is written and checked empirically (generate, diff, eyeball): the dump
  name where it is canonical (France, Sweden), a language-alternate resolution where the
  dump mixes languages (Finland). There is no per-row name curation anywhere.
- `exclude` is the reviewed escape hatch for upstream rows that are simply wrong
  (abolished places still live). It is expected to be tiny (Finland: two entries), every
  entry is a human decision recorded in the diff report, and the durable fix is
  correcting GeoNames upstream so the entry can be dropped.

### Schema changes (one groundwork migration)

- `locations.geonames_id bigint` NULL, `UNIQUE ... WHERE geonames_id IS NOT NULL`. The
  GeoNames key for sourced rows; sites and config-pinned synthetic rows stay NULL.
  **`external_code` is not touched and never holds a geonameid** — its contract
  (official code, unique per country+type) stays exactly as documented, with GeoNames'
  admin-code columns as the ongoing supplier of those codes.
- `locations.depth smallint NOT NULL DEFAULT 0` — 0 for countries, parent+1 below,
  maintained by a BEFORE INSERT/UPDATE trigger reading the parent row. The DEFAULT is
  load-bearing for the generated types: without it the column becomes a required field
  of the generated Insert type and the site-create route and its contract stop
  compiling, even though the trigger fills the value at runtime (the
  generated-nullability class `supabase/CLAUDE.md` warns about, erring safe). The
  trigger function gets no grants at all — the existing products-location trigger is
  the model, and trigger execution doesn't check the caller's EXECUTE — and seeds don't
  emit `depth` (the trigger would overwrite whatever they wrote; an emitted value would
  be decorative and misleading). Backfilled recursively for existing rows, asserted
  (every row's depth = ancestor-chain length). A row trigger cannot re-depth
  descendants on reparent; nothing reparents non-leaves (the cutover re-parents only
  sites), and the trigger's comment must say so. This is what lets search rank
  "broadest first" without a per-country CASE.
- `locations.retired_at timestamptz` NULL. Retired rows are excluded from browse reads,
  the search function and the municipality-directory read; **keyed reads still return
  them** (a stored pick must keep resolving — the three-state guard's "absent vs
  invalid" distinction depends on it, and a retired row is a *valid* pick, never
  cleared), the ancestor walk still includes them, and substitute matching still sees
  claims on them. Nothing retires a `site`.
- `locations.country_code` on `site` rows: the venue dialog already sends the parent's
  country code and the create route inserts it as supplied — so today the value is
  *client-supplied*, not absent (production's one site predates that dialog and does
  need the backfill). The change is to **derive it server-side from the confirmed
  parent row, ignoring any client value**, plus an assert-style backfill for rows
  created before the dialog stamped it. This keeps the denormalization invariant honest
  and unblocks country-scoping the venue dialog later.

### The generator and its gates

`scripts/generate-geonames-seed.mjs <CC>` (plus a shared parser module) downloads the
config's file set, filters to exact live feature codes (never the `H` variants), drops
excluded geonameids, resolves names per `nameResolution`, builds the tree from the
admin-code columns (not `hierarchy.txt`, which mixes non-administrative memberships),
and emits one seed migration: country row, then each level, NOT EXISTS-guarded on
`geonames_id`, every row carrying `geonames_id`, `country_code`, `depth`-consistent
parentage, and `external_code` where the config maps an official code. The migration
ends with the France-style assertion block, hardened by what the verification found:

- exact per-level counts against `expected` (catches Åland-shaped holes *and* GeoNames'
  stale-live rows — an unexcluded Honkajoki surfaces as a count surplus with its name in
  the error),
- zero orphans (LEFT JOIN shape), zero rows missing `geonames_id`, zero code-less rows
  at levels the config maps codes for, uniqueness of codes within (country, type),
- no control characters or empty names (the France generator's literal-safety checks,
  reused).

Determinism caveat, stated honestly: GeoNames publishes no archive of country files, so
"byte-identical rerun" only holds against the same downloaded snapshot. The generator
sorts by geonameid, writes nothing run-dependent, and stamps the dump's modification date
in the migration header; the committed migration itself is the reviewable snapshot of
record. A count mismatch at generation time is the human-judgment moment: identify the
surplus/missing rows by name against the national list (minutes, not row-curation), and
either fix the config, extend `exclude`, or fix GeoNames.

### Sync (`scripts/diff-geonames.mjs <CC>`) — one procedure, every country

Reads the config's current dumps and the live table (read-only), and emits (a) a
human-readable report and (b) a reconciliation migration containing only: INSERTs of
genuinely new rows (guarded, gated, excluded-filtered), UPDATEs renaming rows whose
resolved name or `name_i18n` alternates changed, `external_code` updates where upstream
corrected a code, and
`retired_at` stamps on rows GeoNames no longer carries live. **It never emits DELETE and
never reparents without a human widening the migration by hand.** A human reads the
report, decides anything ambiguous (a merge's coverage implications, a retirement that
something references, a rename that looks like vandalism), and pushes the migration
through the normal workflow. Renames are expected to be small and legitimate; the review
is the backstop, and upstream correction is the durable fix for anything wrong.

Sync stays deliberately unscheduled — run it before expansion pushes, or when a place we
operate in changes. **Finland and France are on exactly this procedure after cutover;
the January COG/Tilastokeskus diff is retired.** The accepted consequence, quantified:
GeoNames lagged a 2025 Finnish merger by six weeks but carried two other abolitions for
five years (both now in the exclusion list); currency for all countries is GeoNames'
currency, bought deliberately in exchange for one uniform system.

### Search

- `search_locations` gains a fourth parameter, which in Postgres means **DROP the
  three-argument function and CREATE the four-argument one in the same migration** — a
  bare CREATE OR REPLACE would leave both overloads live and every existing call
  ambiguous, a 42883 surfacing on the first anonymous keystroke rather than at DDL
  time. Re-issue the original search migration's full per-role grant block for the new
  signature and update the authorization spine's entry (and anon allowlist) to match.
  Body copied from `supabase/schema.sql` per the migration rules. The changes inside:
  ORDER BY switches from the hardcoded level CASE to `(type = 'site')` **then**
  `depth` — sites stay ranked below places, which depth alone would break now that a
  Finnish site and a French commune both sit at depth 3 — retiring `00141`'s documented
  wrongness for district-below-municipality countries before any such country ships.
  The `retired_at IS NULL` filter lands in the *match* CTE, so the reported total drops
  retired rows too; the recursive ancestor walk deliberately still climbs **through**
  retired ancestors, because a chain must render whole. The new optional country
  parameter (default NULL, backward-compatible) closes the documented gap where the
  server's cap starves a client-side country filter; the online-municipality picker and
  any country-restricted caller pass it through the search route, which folds it into
  the cache-key URL and into the query-key hierarchy. Accepted staleness: the route's
  shared cache may keep serving a just-retired row until its TTL expires.
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
(FI verified 308/308; FR ≥99.9%), and unmatched codes (e.g. rows pointing at GeoNames'
stale 099/911) are counted and reported, not failed on.

This plan ships the table and ingestion; the consuming UI (postal-code entry as a
shortcut in the parent's picker, "clubs near me") is deliberately separate later work —
and per the invariants, coordinates/radius stay out of *coverage* semantics entirely.

## Rejected alternatives

- **Dual authority: national classifications keep governing FI/FR, GeoNames governs new
  countries.** This was the investigation's original recommendation — our COG/
  Tilastokeskus rows are verifiably *ahead* of GeoNames, so keeping them under official
  authority was the accuracy-maximising choice at near-zero extra mechanism (one config
  flag suppressing renames). **Rejected by the decision-owner with the trade on the
  table**: two authorities means two refresh procedures, two mental models, and a
  permanent "which kind of country is this" fork; the accuracy delta it protects is 23
  named rows out of ~35,000, all of which heal as upstream catches up. If this plan is
  ever revisited, that is the alternative to weigh, and the numbers above are current as
  of 2026-08-07.
- **Identity-preserving adoption: keep FI/FR row UUIDs and attach GeoNames keys via
  UPDATE joins.** This was the plan's shape until the production scope check
  (2026-08-07). It exists to protect live references — and production turned out to
  have almost none: 2 products (via a site that survives the cutover untouched), 5
  gedus' coverage re-pointable mechanically by code, 0 home picks. Against that, it
  costs a dedicated adoption generator, a pinned 23-row exception regime for France,
  and a permanent asymmetry (two countries whose rows predate their source). The
  cutover produces the same end state through the same code path as every future
  country and deletes a whole tool from the plan. What remains absolutely forbidden is
  wiping *without* the capture/re-point bracket — a bare delete cascades away coverage
  silently, which is exactly the hazard `retired_at` exists to prevent in ongoing sync.
- **Naive language-alternate name resolution everywhere.** Verified harmful for France:
  92 diffs including a preferred-flagged "Département de Paris" and "Région PACA";
  alternates carry stale pre-merger names on renamed rows. Name resolution is therefore
  a per-country config choice validated empirically, not a universal rule.
- **Keeping `name_i18n` curated (legal/official alternates only), riding through
  reseeds as a per-country overlay file.** This was the plan's shape through two
  revisions: GeoNames marks Tampere's exonym "Tammerfors" exactly like Helsinki's legal
  "Helsingfors", so preserving the legal-only contract meant owning a curated list.
  **Rejected by the decision-owner: no curated data we must maintain, anywhere.** The
  verification that made dropping it safe: mechanical sv resolution agrees with 50/51
  legal entries, loses none, and the 83 additions are established Finland-Swedish
  exonyms, not junk. What was given up is the legal-vs-customary distinction itself and
  one region's precision ("Tavastland") — both retrievable only by fixing GeoNames
  upstream, which is the intended channel.
- **Overloading `external_code` with geonameids.** Breaks the column's stated contract
  and every future join against official data; a separate keyed column is one line of
  schema.
- **Adopting GeoNames' intermediate levels (FI seutukunnat, FR arrondissements) now.**
  Reshapes ancestor chains under live FKs, changes the embed depths, adds a level whose
  official standing in Finland is doubtful, and the actual pain ("Rhône except Lyon" =
  267 ticks) is a coverage-*editor* UX problem — bulk-tick affordances — not a
  tree-shape problem. The role-based config keeps the door open: a rung later is config
  + a data migration, and GeoNames demonstrably carries both candidates with official
  codes attached.
- **`hierarchy.txt` for parentage.** Unnecessary (admin-code columns were complete for
  every verified country: 0 missing on 34,742 FR ADM4 and 294 FI ADM3) and riskier — it
  mixes non-administrative memberships.
- **A standing scheduled sync that applies changes automatically.** With GeoNames as
  sole authority the temptation doubles, and so does the blast radius: an upstream
  vandalism or re-leveling would flow straight into production reference data. Every
  write stays a generated, human-reviewed migration. The differ may later *run* on a
  schedule as a report-only tripwire.
- **GeoNames postal for France / national postal everywhere.** The FR GeoNames postal
  file joins 0/34,875 communes (arrondissement codes, verified) — the override is
  forced. In the other direction, Posti's PCF is better than GeoNames' FI postal file
  but costs a bespoke licence review and parser for accuracy nothing currently needs;
  GeoNames covers 308/308 kuntaa. Default GeoNames, override only where the join is
  structurally broken.
- **Nominatim, Google Places, GADM, OSM** — ruled out before this investigation and
  re-stated so this plan stands alone: Nominatim forbids autocomplete and systematic
  extraction; Google forbids caching the names/hierarchy we join on and bills abandoned
  autocomplete sessions on public pages; GADM is non-commercial; OSM ids are explicitly
  impermanent and OSM/Google share the per-country admin-level-semantics problem anyway.

## Honest residuals — where "config + run" is not quite zero work

1. **Expected counts are irreducible per-country manual input** (one authoritative
   number per level, re-sourced on refresh). They are also the single most load-bearing
   quality gate — they catch both the Åland hole and the stale-live rows. Minutes of
   work, but genuinely manual, forever.
2. **The anchor-level choice and the name-resolution rule are per-country judgments**,
   made once when the config entry is written. No data source makes them for you; both
   are validated empirically by the gates and a generate-and-eyeball pass.
3. **Minority-language display names are now free but uncurated.** Any country can turn
   them on by listing a locale in `alternateLocales` — no per-row work — but what
   arrives is GeoNames' alternates: customary names and exonyms alongside legal ones,
   at whatever quality upstream has. Initial ingestion is reviewed as a diff (that is
   how the 50/51 figure was produced); afterwards changes arrive only through reviewed
   sync migrations.
4. **Currency for every country — Finland and France now included — is GeoNames'
   currency.** Quantified: sometimes six weeks behind a merger, sometimes years behind
   an abolition (caught by the exclusion list), occasionally behind a rename wave (the
   15 French renames the cutover ships with). This is the price of one authority, accepted
   explicitly by the decision-owner; the mitigations are the reviewed sync, the
   exclusion list, and contributing corrections upstream.

## Phasing and steps

Migration numbers below are deliberately unstated: pick the next free number at
implementation time, checked against remote migration history first (an already-used
version number is silently treated as applied).

### Phase 1 — schema groundwork (no user-visible change, no FK contact)

1. Groundwork migration: `geonames_id` + partial unique index; `retired_at`; `depth` +
   trigger + recursive backfill + assertions; site `country_code` backfill + assertion.
   Explicit grants unchanged (no new client-reachable functions; trigger function
   EXECUTE revoked). Push, regenerate types, add any aliases.
2. Recreate `search_locations` per the Search section (drop old signature + create the
   four-argument one, sites-then-depth ordering, retired filter in the match CTE,
   country parameter); re-state grants; update the spine entry and anon allowlist.
   Update the search route/contracts/service and the query-key factory for the country
   parameter (two differently-scoped searches must not share a cache entry), and the
   integration tests that pin the RPC argument object; the online-municipality picker
   passes FI.
3. Service reads: browse/directory/whole-list reads exclude retired rows; keyed reads
   deliberately do not. Named-columns literals gain nothing (no read selects the new
   columns except where a surface needs `retired_at` — none do yet).
4. DB tests: depth trigger cases, retired-row visibility per read shape, search ordering
   regression (the "haute" case from `00141`'s header), country-filter behaviour, spine
   completeness green. Push branch; CI runs them.

Independently verifiable: app behaves identically; all assertions and tests green.

### Phase 2 — pilot country: Sweden (proves the approach; still no FK contact)

5. Build `scripts/lib/geonames/` (parser, config schema, name resolution, exclusion,
   gates) and the SE config entry; add the `anchor` role to the hierarchy config with
   its two assertions (structural anchor-above-site for every config; anchor-is-
   municipality for seeded countries — US/GB/JP's district-below-municipality configs
   make the distinction load-bearing).
6. Run `generate-geonames-seed.mjs SE`; review the emitted migration; push to staging;
   verify by hand: picker browses Sweden, search finds "Umeå" with diacritic folding
   both ways, a coverage tick on a kommun saves, ranking puts län above kommuner. No
   products/gedus/parents reference SE rows, so this phase cannot touch a live FK by
   construction.

Independently verifiable: Sweden exists end to end with zero Sweden-specific code.

### Phase 3 — cut Finland and France over to the GeoNames tree

7. FI + FR config entries (file sets, level mappings incl. AX/YT shapes, pins,
   `nameResolution` per the verified rules, FI's two-entry `exclude`, FI's
   `alternateLocales: ["sv"]`).
8. The generator gains a country-agnostic **cutover wrapper**: it emits the same seed
   statements as for a brand-new country, bracketed by capture/re-point steps, as one
   transactional migration per country:
   - **Capture** into temp tables, scoped to the rows being wiped — the country's
     seeded `country`/`region`/`district`/`municipality` rows and nothing else: each
     site's parent municipality code; each gedu claim as (gedu_id, type, code); each
     home pick as (profile_id, type, code). A claim on the country row captures as
     (gedu_id, 'country') and re-points by (country_code, type), because country rows
     carry no official code in any national classification. Claims on `site` rows are
     deliberately *not* captured: sites survive the wipe, so those references never
     move — capturing them would double-count the assert. Anything else referencing a
     code-less or unmappable row is recorded for the warning report instead.
   - **Detach & wipe**: NULL the sites' `parent_id` (sites are ours and stay), then
     DELETE the country's seeded rows bottom-up (municipality → district → region →
     country) — `gedu_locations` CASCADE and `home_location_id` SET NULL fire, which is
     why the capture happens first; `products` reference only sites and are never
     touched.
   - **Reseed** through the standard generator path — GeoNames ids, resolved names,
     codes, depth, `name_i18n` filled from the config's `alternateLocales`, full gates
     (the generated search fold picks the alternates up on write, so "Helsingfors"
     keeps finding Helsinki with no extra step — and "Tammerfors" starts to).
   - **Re-point**: re-parent sites and re-insert gedu claims / home picks against the
     new rows via the (country, type, external_code) join — country-level claims via
     (country_code, type); `RAISE WARNING` with names for anything that didn't map
     (expected zero on prod; staging losses are accepted). A site whose captured parent
     has no counterpart in the new tree is re-parented to the **country row** with a
     warning — never left NULL (a NULL parent is the picker's root level, so the site
     would surface beside the countries) and never deleted (products may RESTRICT on
     it).
   - **Assert**: seed gates plus restored-reference counts equal captured counts minus
     the warned list; zero sites with a NULL parent (a NULL parent would surface the
     site at the picker's root); and the set of sites parented directly under a country
     row exactly equals the parked-with-warning set — normally empty, each instance
     named in the report.
   The migration is mechanical and identical in kind for both databases: by the time it
   runs anywhere, migration ordering guarantees `external_code` is populated (the
   backfill migrations precede it), so the code joins work on prod exactly as on
   staging and on CI's from-scratch build (where it wipes freshly seeded rows and
   reseeds — a one-time cost of some seconds per CI run, accepted).
9. Retire the bespoke lineage in the same change: delete
   `scripts/generate-france-communes-migration.mjs` and
   `scripts/lib/location-classifications.mjs` (their applied migrations remain
   history), and rewrite the seeding/refresh sections of
   `src/services/locations/CLAUDE.md` — one source, one sync, `external_code` now
   supplied by GeoNames' admin-code columns, and the `name_i18n` contract restated as
   GeoNames-sourced display alternates per `alternateLocales` (replacing the
   legal-only and no-exonyms rules; slug resolution already accepts every alternate,
   canonical first, so exonym slugs simply start working). In the same change, update
   the DB tests that hardcode pre-cutover facts: the scoped-reads suite's exact
   commune-count assertions become the config's count minus its named allowance; the
   name-i18n suite's claims that Tampere carries no Swedish override (it gains
   "Tammerfors") and that a Swedish name resolves to exactly one row are rewritten
   against the new contract; and re-run the municipality-slug collision check across
   canonical names **plus every ingested alternate** — the 83 exonyms add slug
   candidates the documented 308-name check never saw, and the alternate resolution
   pass is first-match-wins, so a collision there is silent.

Independently verifiable: on staging after push — the two products still show their
venue, the five real coverage sets survive re-pointing on prod later (staging's fake
ones as far as they map), search finds Parainen/Helsingfors/Umeå exactly as before, and
the warning report is empty or fully explained. Optional cleanup noted for prod, not
required: the two old select-everything coverage enumerations (328–329 rows each) could
be collapsed to a single country tick — semantically identical under
claim-means-subtree; harmless to leave.

### Phase 4 — sync tooling

10. `diff-geonames.mjs <CC>`: report + reconciliation migration per the Sync section
    (insert / rename / retire / code-correct; never delete). Document the run procedure
    in the scripts module header. Immediately exercise it: run against SE (expect an
    empty diff) and against FI and FR (expect an empty diff modulo anything upstream
    changed since cutover — the first real test of one-procedure-for-everyone).

Independently verifiable: the three empty-or-explained diffs.

### Phase 5 — postal codes (independent of Phases 2–4 after Phase 1)

11. `postal_codes` migration (table, RLS, SELECT grants, index) + access-control test
    sweep entries; types + aliases.
12. `generate-postal-seed.mjs <CC>` with GeoNames default + FR La Poste override and the
    PLM rollup; seed FI (+AX) and FR; gates as designed (per-municipality coverage
    threshold, unmatched-code report), scoped to rows with a `geonames_id` — the test
    fixtures in `supabase/seed.sql` include a small code-less FI tree that must not
    trip a coverage gate. Service-layer lookup: resolve (country, postal code) →
    municipality row id, then the existing keyed read; no new RPC, so no spine entry.
13. Add the GeoNames CC BY 4.0 attribution (plus La Poste Licence Ouverte credit) to the
    public legal/about surface — small, legally required by the licences, translated per
    the i18n rule.

Independently verifiable: Helsinki 00100 → kunta 091; a Mariehamn code → 478 via the
AX column shift; Paris 75101… → commune 75056 via the rollup; counts green.

## Acceptance criteria

- Adding Sweden introduced **zero Sweden-specific executable code** — a config entry, a
  generated migration, and config-driven gates only.
- Finland and France went through the cutover with every live reference carried across:
  both products still show their venue via the surviving site rows, all five prod
  coverage sets re-pointed whole, and the cutover's warning report is empty on
  production (staging losses individually named). Finland's canonical names are
  byte-identical before and after; its Swedish display keeps 50 of the 51 legal names
  (Kanta-Häme's "Tavastland" being the noted one) and gains the verified exonym set;
  France's canonical names differ only by GeoNames' named lag.
- **One refresh procedure exists for all countries**; the France generator lineage and
  the national-classification refresh instructions are deleted, and the docs describe
  only the GeoNames sync.
- `00141`'s hardcoded breadth CASE is gone; search ranks by stored depth and passes the
  documented "haute" regression at France scale.
- No code path — app or tooling — can delete a location row as part of refresh; the only
  states sync can produce are inserted, renamed, code-corrected, and retired.
- The DB authorization spine and access-control sweeps are green with the new objects
  classified; every new object carries explicit grants and RLS.
- Postal lookup resolves the three verified fixtures above; postal rows rebuild freely
  with no FK consequence.

## Risks and mitigations

- **Upstream regression or vandalism flowing into production reference data** — now a
  live risk for FI/FR too, by design. Every write path is a generated, human-reviewed,
  assertion-gated migration; nothing ingests unattended. Count gates catch bulk damage;
  review catches the rest; `exclude` quarantines what upstream won't fix quickly, and
  upstream contribution is the durable fix.
- **GeoNames re-levels a country's admin hierarchy** (it has historically) → dedupe key
  is geonameid, so row identity survives; the config's fcode mapping fails loudly on
  counts and gets a config edit, not code.
- **A future country where GeoNames lacks official municipality codes** → external_code
  stays NULL there, official-data joins are forfeited for that country, and postal
  ingestion needs the GeoNames postal file's own admin columns instead; the config
  expresses all of this, but the *quality* is honestly lower. Evaluate per country at
  config-writing time.
- **Retired rows accumulating** → they are reference rows costing bytes; a periodic
  human-decided cleanup migration may delete unreferenced ones. Never automatic.
- **France's 8 stale spots drifting silently** → carried as the named allowance in
  France's `expected` counts and re-surfaced by every sync report until upstream heals.
- **Licence exposure** → CC BY 4.0 requires attribution (step 13); La Poste's Licence
  Ouverte requires source credit; neither restricts commercial use. Posti's terms are
  why its PCF was *not* adopted.

## What NOT to do

- Do not regenerate or edit the applied FI/FR seed migrations — history, per the
  standing rule.
- Do not wipe seeded rows outside the one bracketed cutover migration — a bare delete
  cascades gedu coverage away silently. Ongoing refresh can only insert, rename,
  code-correct, or retire; the cutover is the single sanctioned exception and carries
  its capture/re-point bracket precisely because of that hazard.
- Do not hand-maintain local name overrides against the authority — a wrong GeoNames
  name gets fixed in GeoNames, or (for abolished-but-live rows) quarantined in the
  reviewed `exclude` list.
- Do not let anything outside the database fold search terms, ship geography to the
  browser, or reintroduce a per-country catalog asset.
- Do not use lat/lon for coverage semantics; coordinates are only a candidate input for
  a future "near me" *display* feature, evaluated separately.
- Do not put geonameids in `external_code` or GeoNames alternates in `name_i18n`.
- Do not add the intermediate hierarchy rungs, cascade semantics for coverage ticks, or
  a country dropdown to the picker — all previously rejected, reasons above and in
  `src/services/locations/CLAUDE.md`.
