-- Cuts Finland over to GeoNames: the country row plus 19 regions, 308 municipalities.
--
-- THIS IS A CUTOVER, NOT A FIRST SEED
--
-- Finland already had a location tree, seeded by hand or by a bespoke generator
-- from its national statistical classification. This migration REPLACES it: the
-- old country/region/municipality rows are wiped and the GeoNames tree
-- is seeded in their place, so that from here on Finland is indistinguishable
-- from a country added yesterday — same config shape, same sync procedure, no
-- national-classification refresh.
--
-- New row uuids throughout are accepted: nothing durable outside the database
-- holds a location uuid (caches are ephemeral, public links use slugs). What is
-- NOT accepted is losing a live reference, so the seed statements below sit
-- inside a five-section bracket — capture, wipe, reseed, re-point, assert —
-- that carries sites, gedu coverage ticks and family location picks across by
-- official code. Each section explains itself where it starts.
--
-- `site` rows are never wiped: they are ours, they are what products point at,
-- and they are simply re-parented. The one thing that can be lost is a
-- reference to a row the new tree has no counterpart for, and every such loss
-- raises a WARNING naming it.
--
-- SOURCE
--
-- GeoNames country dump FI.txt (published 2026-08-07),
-- AX.txt (published 2026-08-07), its matching alternate-names file, and
-- countryInfo.txt — CC BY 4.0, republished daily by download.geonames.org.
-- GeoNames is the single source and the single authority for every country's
-- geography here: adding a country is a config entry plus a generator run, and
-- keeping one current is one uniform sync procedure with no country special-
-- cased.
--
-- Rows are filtered on exact live feature codes — never the `H` variants,
-- which are GeoNames' abolished divisions and carry the same admin codes as the
-- live rows that replaced them — and deduped on geonameid, because official
-- codes are not unique across that split and names are not unique at all.
--
-- NAMES
--
-- `name` is the canonical native-language name, resolved by the country's
-- configured rule (the fi alternates).
-- `name_i18n` holds only the locales that differ from it — never a key equal to
-- `name`, which is the convention the display resolver depends on. The country
-- row takes an alternate for every supported UI locale, which is the one level
-- where every locale has real payload; the levels below take the locales the
-- config lists (sv).
--
-- CODES
--
-- `external_code` keeps its existing contract — the row's code in its
-- country's official statistical classification, unique per (country, type) —
-- and never holds a geonameid. GeoNames' admin-code columns are what supply it,
-- so joins against official data keep working.
--
-- 2 row(s) were dropped by the config's exclusion list —
-- places GeoNames still carries live after they were abolished. Every entry is a
-- recorded human decision, and the durable fix is correcting GeoNames upstream.
--
-- 1 row(s) are config-declared pins onto a GeoNames record the level
-- filters would not have picked up — a record standing for a level of our hierarchy
-- that upstream models somewhere else. They carry their real geonames_id.
--
-- DEPTH
--
-- No row carries `depth`: a trigger derives it from the parent row, so an
-- emitted value would be overwritten on the way in.
--
-- REGENERATING
--
--   node scripts/generate-geonames-seed.mjs FI --cutover
--
-- Deterministic against the same downloaded snapshot: rows are ordered by
-- geonameid, nothing run-dependent is written, and the 2000-row chunking is
-- fixed. GeoNames publishes no archive, so that is the honest extent of the
-- guarantee — this committed file is the reviewable snapshot of record.
--
-- Rerun it only to reproduce or review this snapshot. A newer dump is
-- reconciled by a NEW migration from the sync tooling, read by a human first —
-- never by rewriting this one, which is applied history.
--
-- IDEMPOTENT
--
-- Every insert is NOT EXISTS-guarded on `geonames_id`, so re-running inserts
-- nothing. Each row is joined to its parent by the parent's `geonames_id`, so
-- this migration depends on the levels above it having landed — which is
-- exactly what the assertion block at the end refuses to let pass silently.
--
-- The bracket around them is idempotent in the same sense and no further: a
-- second run captures the tree this one produced, wipes it, seeds it again and
-- re-points everything by the same codes, landing in the same state. It is not
-- a no-op, and nothing should ask it to be — a migration runs once.
--
-- Data-only migration: no schema change, no type/grant change. It does depend
-- on the groundwork migration that adds `locations.geonames_id` and the depth
-- trigger, which migration ordering guarantees has already run.
-- It also depends on `external_code` being populated on the old tree, which
-- the backfill migrations well before it guarantee — that is what makes the
-- re-point join work identically on production, on staging and on CI's
-- from-scratch build, where it wipes rows seeded minutes earlier and reseeds
-- them. That cost is seconds per CI run and is accepted.

BEGIN;
-- ---------------------------------------------------------------------------
-- 1. CAPTURE — what is about to be wiped, and everything pointing into it
-- ---------------------------------------------------------------------------
--
-- References are recorded as (type, official code), never as row ids: the ids
-- are what this migration throws away, and the code is the one key that means
-- the same thing before and after a change of source.

-- Exactly the rows the wipe removes. `site` rows are deliberately not here —
-- they are ours, they stay, and a reference to one never moves.
CREATE TEMP TABLE cutover_scope ON COMMIT DROP AS
  SELECT l.id, l.type, l.name, l.external_code
    FROM public.locations l
   WHERE l.country_code = 'FI'
     AND l.type IN ('country', 'region', 'municipality');

CREATE UNIQUE INDEX ON cutover_scope (id);

-- Each site's parent, as (type, official code). A country row's code is NULL —
-- see the module header for why one join still serves both shapes.
CREATE TEMP TABLE cutover_sites ON COMMIT DROP AS
  SELECT s.id           AS site_id,
         s.name         AS site_name,
         p.type         AS parent_type,
         p.external_code AS parent_code
    FROM public.locations s
    JOIN cutover_scope p ON p.id = s.parent_id
   WHERE s.type = 'site';

-- Every gedu coverage tick on a row being wiped. A tick on the country row
-- captures with a NULL code and re-points on (country_code, type).
--
-- DISTINCT because two scoped rows can share a (type, code) key only when both
-- carry NULL — two country rows, or two code-less rows a hand edit left behind.
-- Two claims that collapse to one key would re-insert as one row and violate
-- the join table's primary key; deduping here keeps the captured count equal to
-- the count section 5 asserts against.
CREATE TEMP TABLE cutover_gedu ON COMMIT DROP AS
  SELECT DISTINCT gl.gedu_id, s.type, s.external_code
    FROM public.gedu_locations gl
    JOIN cutover_scope s ON s.id = gl.location_id;

-- Every family whose own location is one of these rows. The column is ON DELETE
-- SET NULL, so without this the wipe would empty it with nothing to say so.
CREATE TEMP TABLE cutover_home ON COMMIT DROP AS
  SELECT p.id AS profile_id, s.type, s.external_code
    FROM public.profiles p
    JOIN cutover_scope s ON s.id = p.home_location_id;

-- A code-less row below country level can never be re-pointed, so anything
-- referencing one is lost before the wipe even runs. Named here rather than
-- only in section 4's report, because this is the point at which it is still
-- possible to stop and look.
--
-- The product check is the other half of that, and it is an EXCEPTION rather
-- than a warning. `products.location_id` is ON DELETE RESTRICT, and a product
-- may legitimately point above `site` — an online municipality club points at
-- the municipality that funds it — so such a row would abort the wipe several
-- statements from now as an opaque foreign-key violation. The cutover
-- deliberately does not move products (nothing here knows what a product's
-- location *means*, and the choice belongs to a human), so it says so here,
-- with the products named, while the database is still untouched.
DO $$
DECLARE
  v_names text;
  v_count integer;
BEGIN
  SELECT count(*), string_agg(format('%s %s', type, name), ', ' ORDER BY type, name)
    INTO v_count, v_names
    FROM cutover_scope
   WHERE type <> 'country' AND external_code IS NULL;

  IF v_count > 0 THEN
    RAISE WARNING
      'Finland cutover: % scoped row(s) carry no official code, so nothing pointing at them can be re-pointed: %',
      v_count, v_names;
  END IF;

  SELECT count(*), string_agg(format('product %s -> %s %s', p.id, s.type, s.name), ', ' ORDER BY p.id)
    INTO v_count, v_names
    FROM public.products p
    JOIN cutover_scope s ON s.id = p.location_id;

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'Finland cutover: % product(s) point above site level at a row this migration wipes, and products.location_id is ON DELETE RESTRICT: %. Re-point or clear them by hand first — a product''s location is a business decision, not one a data migration makes.',
      v_count, v_names;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. DETACH & WIPE
-- ---------------------------------------------------------------------------
--
-- Sites are ours and stay; only their parentage goes, and section 4 gives it
-- back. Everything else is deleted bottom-up because `parent_id` is ON DELETE
-- RESTRICT — a region cannot leave while its municipalities are still under it.
--
-- `gedu_locations` CASCADEs and `profiles.home_location_id` SETs NULL as
-- these statements run. That is precisely why section 1 ran first.
--
-- `products` reference only `site` rows, so no product is touched here at all.

UPDATE public.locations s
   SET parent_id = NULL
 WHERE s.type = 'site'
   AND s.parent_id IN (SELECT id FROM cutover_scope);

DELETE FROM public.locations l
  USING cutover_scope s
 WHERE l.id = s.id AND s.type = 'municipality';

DELETE FROM public.locations l
  USING cutover_scope s
 WHERE l.id = s.id AND s.type = 'region';

DELETE FROM public.locations l
  USING cutover_scope s
 WHERE l.id = s.id AND s.type = 'country';

DO $$
DECLARE
  v_left integer;
BEGIN
  SELECT count(*) INTO v_left
    FROM public.locations
   WHERE country_code = 'FI'
     AND type IN ('country', 'region', 'municipality');

  IF v_left > 0 THEN
    RAISE EXCEPTION
      'Finland cutover: % seeded FI row(s) survived the wipe — the reseed below would land on top of them',
      v_left;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. RESEED — the ordinary seed statements, unchanged
-- ---------------------------------------------------------------------------
--
-- Byte for byte what this generator emits for a brand-new country. That is the
-- point of the cutover: one code path produces every country's tree, so there
-- is no such thing as a country whose rows were made differently. The section
-- ends with the standard seed gates; section 5 adds the cutover's own.

-- The country row. Guarded on both keys: a second country row for FI would
-- surface twice at the picker's root level.
INSERT INTO public.locations (geonames_id, name, name_i18n, type, parent_id, country_code, external_code)
SELECT 660013::bigint, 'Suomi', '{"en":"Finland","fr":"Finlande","sv":"Finland"}'::jsonb, 'country', NULL, 'FI', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.locations l
   WHERE l.geonames_id = 660013::bigint
      OR (l.type = 'country' AND l.country_code = 'FI')
);

-- Regions (19).
INSERT INTO public.locations (geonames_id, name, name_i18n, type, parent_id, country_code, external_code)
SELECT v.geonames_id, v.name, v.name_i18n, 'region', p.id, 'FI', v.external_code
FROM (VALUES
    (661882::bigint, 'Ahvenanmaa', '{"sv":"Åland"}'::jsonb, '21', 660013::bigint, 'country', NULL::text),
    (830603::bigint, 'Lappi', '{"sv":"Lappland"}'::jsonb, '19', 660013::bigint, 'country', NULL::text),
    (830664::bigint, 'Kainuu', '{"sv":"Kajanaland"}'::jsonb, '18', 660013::bigint, 'country', NULL::text),
    (830667::bigint, 'Pohjois-Pohjanmaa', '{"sv":"Norra Österbotten"}'::jsonb, '17', 660013::bigint, 'country', NULL::text),
    (830675::bigint, 'Keski-Pohjanmaa', '{"sv":"Mellersta Österbotten"}'::jsonb, '16', 660013::bigint, 'country', NULL::text),
    (830676::bigint, 'Pohjanmaa', '{"sv":"Österbotten"}'::jsonb, '15', 660013::bigint, 'country', NULL::text),
    (830682::bigint, 'Etelä-Pohjanmaa', '{"sv":"Södra Österbotten"}'::jsonb, '14', 660013::bigint, 'country', NULL::text),
    (830685::bigint, 'Keski-Suomi', '{"sv":"Mellersta Finland"}'::jsonb, '13', 660013::bigint, 'country', NULL::text),
    (830686::bigint, 'Pohjois-Karjala', '{"sv":"Norra Karelen"}'::jsonb, '12', 660013::bigint, 'country', NULL::text),
    (830690::bigint, 'Pohjois-Savo', '{"sv":"Norra Savolax"}'::jsonb, '11', 660013::bigint, 'country', NULL::text),
    (830695::bigint, 'Etelä-Savo', '{"sv":"Södra Savolax"}'::jsonb, '10', 660013::bigint, 'country', NULL::text),
    (830699::bigint, 'Etelä-Karjala', '{"sv":"Södra Karelen"}'::jsonb, '09', 660013::bigint, 'country', NULL::text),
    (830703::bigint, 'Kymenlaakso', '{"sv":"Kymmenedalen"}'::jsonb, '08', 660013::bigint, 'country', NULL::text),
    (830704::bigint, 'Pirkanmaa', '{"sv":"Birkaland"}'::jsonb, '06', 660013::bigint, 'country', NULL::text),
    (830705::bigint, 'Kanta-Häme', '{"sv":"Tavastland"}'::jsonb, '05', 660013::bigint, 'country', NULL::text),
    (830708::bigint, 'Varsinais-Suomi', '{"sv":"Egentliga Finland"}'::jsonb, '02', 660013::bigint, 'country', NULL::text),
    (830709::bigint, 'Uusimaa', '{"sv":"Nyland"}'::jsonb, '01', 660013::bigint, 'country', NULL::text),
    (831040::bigint, 'Päijät-Häme', '{"sv":"Päijänne-Tavastland"}'::jsonb, '07', 660013::bigint, 'country', NULL::text),
    (831041::bigint, 'Satakunta', NULL::jsonb, '04', 660013::bigint, 'country', NULL::text)
) AS v(geonames_id, name, name_i18n, external_code, parent_geonames_id, parent_type, parent_external_code)
JOIN public.locations p
  ON p.country_code = 'FI'
 AND p.type = v.parent_type::public.location_type
 AND p.geonames_id = v.parent_geonames_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.locations l WHERE l.geonames_id = v.geonames_id
);

-- Municipalities (308).
INSERT INTO public.locations (geonames_id, name, name_i18n, type, parent_id, country_code, external_code)
SELECT v.geonames_id, v.name, v.name_i18n, 'municipality', p.id, 'FI', v.external_code
FROM (VALUES
    (630737::bigint, 'Ypäjä', NULL::jsonb, '981', 830705::bigint, 'region', '05'),
    (630753::bigint, 'Ylöjärvi', NULL::jsonb, '980', 830704::bigint, 'region', '06'),
    (630769::bigint, 'Ylivieska', NULL::jsonb, '977', 830667::bigint, 'region', '17'),
    (630780::bigint, 'Ylitornio', '{"sv":"Övertorneå"}'::jsonb, '976', 830603::bigint, 'region', '19'),
    (631377::bigint, 'Virrat', '{"sv":"Virdois"}'::jsonb, '936', 830704::bigint, 'region', '06'),
    (631390::bigint, 'Virolahti', '{"sv":"Vederlax"}'::jsonb, '935', 830703::bigint, 'region', '08'),
    (631449::bigint, 'Vimpeli', '{"sv":"Vindala"}'::jsonb, '934', 830682::bigint, 'region', '14'),
    (631566::bigint, 'Viitasaari', NULL::jsonb, '931', 830685::bigint, 'region', '13'),
    (631708::bigint, 'Vihti', '{"sv":"Vichtis"}'::jsonb, '927', 830709::bigint, 'region', '01'),
    (631780::bigint, 'Vieremä', NULL::jsonb, '925', 830690::bigint, 'region', '11'),
    (631827::bigint, 'Veteli', '{"sv":"Vetil"}'::jsonb, '924', 830675::bigint, 'region', '16'),
    (631857::bigint, 'Vesilahti', '{"sv":"Vesilax"}'::jsonb, '922', 830704::bigint, 'region', '06'),
    (631875::bigint, 'Vesanto', NULL::jsonb, '921', 830690::bigint, 'region', '11'),
    (632063::bigint, 'Vehmaa', NULL::jsonb, '918', 830708::bigint, 'region', '02'),
    (632371::bigint, 'Varkaus', NULL::jsonb, '915', 830690::bigint, 'region', '11'),
    (632425::bigint, 'Vårdö', NULL::jsonb, '941', 661882::bigint, 'region', '21'),
    (632674::bigint, 'Valkeakoski', NULL::jsonb, '908', 830704::bigint, 'region', '06'),
    (632979::bigint, 'Vaasa', '{"sv":"Vasa"}'::jsonb, '905', 830676::bigint, 'region', '15'),
    (633098::bigint, 'Vaala', NULL::jsonb, '785', 830664::bigint, 'region', '18'),
    (633222::bigint, 'Uusikaupunki', '{"sv":"Nystad"}'::jsonb, '895', 830708::bigint, 'region', '02'),
    (633244::bigint, 'Uurainen', '{"sv":"Urais"}'::jsonb, '892', 830685::bigint, 'region', '13'),
    (633269::bigint, 'Utsjoki', NULL::jsonb, '890', 830603::bigint, 'region', '19'),
    (633297::bigint, 'Utajärvi', NULL::jsonb, '889', 830667::bigint, 'region', '17'),
    (633333::bigint, 'Urjala', NULL::jsonb, '887', 830704::bigint, 'region', '06'),
    (633396::bigint, 'Ulvila', '{"sv":"Ulvsby"}'::jsonb, '886', 831041::bigint, 'region', '04'),
    (633542::bigint, 'Tyrnävä', NULL::jsonb, '859', 830667::bigint, 'region', '17'),
    (633592::bigint, 'Tuusula', '{"sv":"Tusby"}'::jsonb, '858', 830709::bigint, 'region', '01'),
    (633594::bigint, 'Tuusniemi', NULL::jsonb, '857', 830690::bigint, 'region', '11'),
    (633680::bigint, 'Turku', '{"sv":"Åbo"}'::jsonb, '853', 830708::bigint, 'region', '02'),
    (634096::bigint, 'Tornio', '{"sv":"Torneå"}'::jsonb, '851', 830603::bigint, 'region', '19'),
    (634298::bigint, 'Toivakka', NULL::jsonb, '850', 830685::bigint, 'region', '13'),
    (634325::bigint, 'Toholampi', NULL::jsonb, '849', 830675::bigint, 'region', '16'),
    (634333::bigint, 'Tohmajärvi', NULL::jsonb, '848', 830686::bigint, 'region', '12'),
    (634562::bigint, 'Teuva', '{"sv":"Östermark"}'::jsonb, '846', 830682::bigint, 'region', '14'),
    (634602::bigint, 'Tervola', NULL::jsonb, '845', 830603::bigint, 'region', '19'),
    (634612::bigint, 'Tervo', NULL::jsonb, '844', 830690::bigint, 'region', '11'),
    (634964::bigint, 'Tampere', '{"sv":"Tammerfors"}'::jsonb, '837', 830704::bigint, 'region', '06'),
    (634996::bigint, 'Tammela', NULL::jsonb, '834', 830705::bigint, 'region', '05'),
    (635133::bigint, 'Taivassalo', '{"sv":"Tövsala"}'::jsonb, '833', 830708::bigint, 'region', '02'),
    (635142::bigint, 'Taivalkoski', NULL::jsonb, '832', 830667::bigint, 'region', '17'),
    (635151::bigint, 'Taipalsaari', NULL::jsonb, '831', 830699::bigint, 'region', '09'),
    (635337::bigint, 'Sysmä', NULL::jsonb, '781', 831040::bigint, 'region', '07'),
    (635693::bigint, 'Suonenjoki', NULL::jsonb, '778', 830690::bigint, 'region', '11'),
    (635697::bigint, 'Suomussalmi', NULL::jsonb, '777', 830664::bigint, 'region', '18'),
    (635817::bigint, 'Sund', NULL::jsonb, '771', 661882::bigint, 'region', '21'),
    (635848::bigint, 'Sulkava', NULL::jsonb, '768', 830695::bigint, 'region', '10'),
    (636159::bigint, 'Sottunga', NULL::jsonb, '766', 661882::bigint, 'region', '21'),
    (636174::bigint, 'Sotkamo', NULL::jsonb, '765', 830664::bigint, 'region', '18'),
    (636305::bigint, 'Sonkajärvi', NULL::jsonb, '762', 830690::bigint, 'region', '11'),
    (636347::bigint, 'Somero', NULL::jsonb, '761', 830708::bigint, 'region', '02'),
    (636397::bigint, 'Soini', NULL::jsonb, '759', 830682::bigint, 'region', '14'),
    (636465::bigint, 'Sodankylä', NULL::jsonb, '758', 830603::bigint, 'region', '19'),
    (636609::bigint, 'Siuntio', '{"sv":"Sjundeå"}'::jsonb, '755', 830709::bigint, 'region', '01'),
    (636804::bigint, 'Simo', NULL::jsonb, '751', 830603::bigint, 'region', '19'),
    (636948::bigint, 'Siilinjärvi', NULL::jsonb, '749', 830690::bigint, 'region', '11'),
    (637003::bigint, 'Siikajoki', NULL::jsonb, '748', 830667::bigint, 'region', '17'),
    (637021::bigint, 'Siikainen', '{"sv":"Siikais"}'::jsonb, '747', 831041::bigint, 'region', '04'),
    (637036::bigint, 'Sievi', NULL::jsonb, '746', 830667::bigint, 'region', '17'),
    (637068::bigint, 'Sipoo', '{"sv":"Sibbo"}'::jsonb, '753', 830709::bigint, 'region', '01'),
    (637220::bigint, 'Seinäjoki', NULL::jsonb, '743', 830682::bigint, 'region', '14'),
    (637285::bigint, 'Savukoski', NULL::jsonb, '742', 830603::bigint, 'region', '19'),
    (637293::bigint, 'Savonlinna', '{"sv":"Nyslott"}'::jsonb, '740', 830695::bigint, 'region', '10'),
    (637314::bigint, 'Savitaipale', NULL::jsonb, '739', 830699::bigint, 'region', '09'),
    (637401::bigint, 'Sauvo', '{"sv":"Sagu"}'::jsonb, '738', 830708::bigint, 'region', '02'),
    (637880::bigint, 'Saltvik', NULL::jsonb, '736', 661882::bigint, 'region', '21'),
    (637959::bigint, 'Salo', NULL::jsonb, '734', 830708::bigint, 'region', '02'),
    (638075::bigint, 'Salla', NULL::jsonb, '732', 830603::bigint, 'region', '19'),
    (638105::bigint, 'Säkylä', NULL::jsonb, '783', 831041::bigint, 'region', '04'),
    (638390::bigint, 'Saarijärvi', NULL::jsonb, '729', 830685::bigint, 'region', '13'),
    (638671::bigint, 'Rusko', NULL::jsonb, '704', 830708::bigint, 'region', '02'),
    (638693::bigint, 'Ruovesi', NULL::jsonb, '702', 830704::bigint, 'region', '06'),
    (638804::bigint, 'Ruokolahti', '{"sv":"Ruokolax"}'::jsonb, '700', 830699::bigint, 'region', '09'),
    (638937::bigint, 'Rovaniemi', NULL::jsonb, '698', 830603::bigint, 'region', '19'),
    (639247::bigint, 'Ristijärvi', NULL::jsonb, '697', 830664::bigint, 'region', '18'),
    (639411::bigint, 'Riihimäki', NULL::jsonb, '694', 830705::bigint, 'region', '05'),
    (639578::bigint, 'Reisjärvi', NULL::jsonb, '691', 830667::bigint, 'region', '17'),
    (639672::bigint, 'Rautjärvi', NULL::jsonb, '689', 830699::bigint, 'region', '09'),
    (639701::bigint, 'Rautavaara', NULL::jsonb, '687', 830690::bigint, 'region', '11'),
    (639711::bigint, 'Rautalampi', NULL::jsonb, '686', 830690::bigint, 'region', '11'),
    (639735::bigint, 'Rauma', '{"sv":"Raumo"}'::jsonb, '684', 831041::bigint, 'region', '04'),
    (639890::bigint, 'Ranua', NULL::jsonb, '683', 830603::bigint, 'region', '19'),
    (639907::bigint, 'Rantasalmi', NULL::jsonb, '681', 830695::bigint, 'region', '10'),
    (640125::bigint, 'Raisio', '{"sv":"Reso"}'::jsonb, '680', 830708::bigint, 'region', '02'),
    (640272::bigint, 'Rääkkylä', NULL::jsonb, '707', 830686::bigint, 'region', '12'),
    (640277::bigint, 'Raahe', '{"sv":"Brahestad"}'::jsonb, '678', 830667::bigint, 'region', '17'),
    (640385::bigint, 'Pyhtää', '{"sv":"Pyttis"}'::jsonb, '624', 830703::bigint, 'region', '08'),
    (640406::bigint, 'Pyhäranta', NULL::jsonb, '631', 830708::bigint, 'region', '02'),
    (640410::bigint, 'Pyhäntä', NULL::jsonb, '630', 830667::bigint, 'region', '17'),
    (640439::bigint, 'Pyhäjoki', NULL::jsonb, '625', 830667::bigint, 'region', '17'),
    (640471::bigint, 'Pyhäjärvi', NULL::jsonb, '626', 830667::bigint, 'region', '17'),
    (640505::bigint, 'Puumala', NULL::jsonb, '623', 830695::bigint, 'region', '10'),
    (640660::bigint, 'Puolanka', NULL::jsonb, '620', 830664::bigint, 'region', '18'),
    (640690::bigint, 'Punkalaidun', NULL::jsonb, '619', 830704::bigint, 'region', '06'),
    (640753::bigint, 'Pukkila', '{"sv":"Buckila"}'::jsonb, '616', 830709::bigint, 'region', '01'),
    (640808::bigint, 'Pudasjärvi', NULL::jsonb, '615', 830667::bigint, 'region', '17'),
    (640829::bigint, 'Pöytyä', NULL::jsonb, '636', 830708::bigint, 'region', '02'),
    (640895::bigint, 'Posio', NULL::jsonb, '614', 830603::bigint, 'region', '19'),
    (640974::bigint, 'Pornainen', '{"sv":"Borgnäs"}'::jsonb, '611', 830709::bigint, 'region', '01'),
    (641000::bigint, 'Pori', '{"sv":"Björneborg"}'::jsonb, '609', 831041::bigint, 'region', '04'),
    (641045::bigint, 'Pomarkku', '{"sv":"Påmark"}'::jsonb, '608', 831041::bigint, 'region', '04'),
    (641061::bigint, 'Polvijärvi', NULL::jsonb, '607', 830686::bigint, 'region', '12'),
    (641491::bigint, 'Pirkkala', '{"sv":"Birkala"}'::jsonb, '604', 830704::bigint, 'region', '06'),
    (641661::bigint, 'Pihtipudas', NULL::jsonb, '601', 830685::bigint, 'region', '13'),
    (641863::bigint, 'Pielavesi', NULL::jsonb, '595', 830690::bigint, 'region', '11'),
    (641976::bigint, 'Petäjävesi', NULL::jsonb, '592', 830685::bigint, 'region', '13'),
    (642140::bigint, 'Perho', NULL::jsonb, '584', 830675::bigint, 'region', '16'),
    (642368::bigint, 'Pello', NULL::jsonb, '854', 830603::bigint, 'region', '19'),
    (642378::bigint, 'Pelkosenniemi', NULL::jsonb, '583', 830603::bigint, 'region', '19'),
    (642456::bigint, 'Pedersören kunta', '{"sv":"Pedersöre"}'::jsonb, '599', 830676::bigint, 'region', '15'),
    (642658::bigint, 'Parkano', NULL::jsonb, '581', 830704::bigint, 'region', '06'),
    (642667::bigint, 'Parikkala', NULL::jsonb, '580', 830699::bigint, 'region', '09'),
    (642675::bigint, 'Parainen', '{"sv":"Pargas"}'::jsonb, '445', 830708::bigint, 'region', '02'),
    (642751::bigint, 'Paltamo', '{"sv":"Paldamo"}'::jsonb, '578', 830664::bigint, 'region', '18'),
    (642977::bigint, 'Pälkäne', NULL::jsonb, '635', 830704::bigint, 'region', '06'),
    (643154::bigint, 'Paimio', '{"sv":"Pemar"}'::jsonb, '577', 830708::bigint, 'region', '02'),
    (643261::bigint, 'Padasjoki', NULL::jsonb, '576', 831040::bigint, 'region', '07'),
    (643493::bigint, 'Oulu', '{"sv":"Uleåborg"}'::jsonb, '564', 830667::bigint, 'region', '17'),
    (643498::bigint, 'Oulainen', '{"sv":"Oulais"}'::jsonb, '563', 830667::bigint, 'region', '17'),
    (643631::bigint, 'Orivesi', NULL::jsonb, '562', 830704::bigint, 'region', '06'),
    (643641::bigint, 'Oripää', NULL::jsonb, '561', 830708::bigint, 'region', '02'),
    (643645::bigint, 'Orimattila', NULL::jsonb, '560', 831040::bigint, 'region', '07'),
    (644101::bigint, 'Uusikaarlepyy', '{"sv":"Nykarleby"}'::jsonb, '893', 830676::bigint, 'region', '15'),
    (644175::bigint, 'Nurmijärvi', NULL::jsonb, '543', 830709::bigint, 'region', '01'),
    (644188::bigint, 'Nurmes', NULL::jsonb, '541', 830686::bigint, 'region', '12'),
    (644328::bigint, 'Nousiainen', '{"sv":"Nousis"}'::jsonb, '538', 830708::bigint, 'region', '02'),
    (644451::bigint, 'Nokia', NULL::jsonb, '536', 830704::bigint, 'region', '06'),
    (644509::bigint, 'Nivala', NULL::jsonb, '535', 830667::bigint, 'region', '17'),
    (645082::bigint, 'Närpiö', '{"sv":"Närpes"}'::jsonb, '545', 830676::bigint, 'region', '15'),
    (645150::bigint, 'Nakkila', NULL::jsonb, '531', 831041::bigint, 'region', '04'),
    (645212::bigint, 'Naantali', '{"sv":"Nådendal"}'::jsonb, '529', 830708::bigint, 'region', '02'),
    (645234::bigint, 'Myrskylä', '{"sv":"Mörskom"}'::jsonb, '504', 830709::bigint, 'region', '01'),
    (645244::bigint, 'Mynämäki', NULL::jsonb, '503', 830708::bigint, 'region', '02'),
    (645386::bigint, 'Muurame', NULL::jsonb, '500', 830685::bigint, 'region', '13'),
    (645673::bigint, 'Muonio', NULL::jsonb, '498', 830603::bigint, 'region', '19'),
    (645711::bigint, 'Multia', '{"sv":"Muldia"}'::jsonb, '495', 830685::bigint, 'region', '13'),
    (645767::bigint, 'Muhos', NULL::jsonb, '494', 830667::bigint, 'region', '17'),
    (646006::bigint, 'Mikkeli', '{"sv":"S:t Michel"}'::jsonb, '491', 830695::bigint, 'region', '10'),
    (646080::bigint, 'Miehikkälä', NULL::jsonb, '489', 830703::bigint, 'region', '08'),
    (646193::bigint, 'Merikarvia', '{"sv":"Sastmola"}'::jsonb, '484', 831041::bigint, 'region', '04'),
    (646198::bigint, 'Merijärvi', NULL::jsonb, '483', 830667::bigint, 'region', '17'),
    (646487::bigint, 'Masku', NULL::jsonb, '481', 830708::bigint, 'region', '02'),
    (646519::bigint, 'Marttila', NULL::jsonb, '480', 830708::bigint, 'region', '02'),
    (646701::bigint, 'Mäntyharju', NULL::jsonb, '507', 830695::bigint, 'region', '10'),
    (646709::bigint, 'Mäntsälä', NULL::jsonb, '505', 830709::bigint, 'region', '01'),
    (646876::bigint, 'Maalahti', '{"sv":"Malax"}'::jsonb, '475', 830676::bigint, 'region', '15'),
    (647289::bigint, 'Luumäki', NULL::jsonb, '441', 830699::bigint, 'region', '09'),
    (647457::bigint, 'Lumparland', NULL::jsonb, '438', 661882::bigint, 'region', '21'),
    (647472::bigint, 'Lumijoki', NULL::jsonb, '436', 830667::bigint, 'region', '17'),
    (647523::bigint, 'Luhanka', '{"sv":"Luhango"}'::jsonb, '435', 830685::bigint, 'region', '13'),
    (647572::bigint, 'Loviisa', '{"sv":"Lovisa"}'::jsonb, '434', 830709::bigint, 'region', '01'),
    (647662::bigint, 'Loppi', NULL::jsonb, '433', 830705::bigint, 'region', '05'),
    (647732::bigint, 'Loimaa', NULL::jsonb, '430', 830708::bigint, 'region', '02'),
    (647752::bigint, 'Lohja', '{"sv":"Lojo"}'::jsonb, '444', 830709::bigint, 'region', '01'),
    (647852::bigint, 'Liperi', '{"sv":"Libelits"}'::jsonb, '426', 830686::bigint, 'region', '12'),
    (647931::bigint, 'Liminka', '{"sv":"Limingo"}'::jsonb, '425', 830667::bigint, 'region', '17'),
    (648057::bigint, 'Lieto', '{"sv":"Lundo"}'::jsonb, '423', 830708::bigint, 'region', '02'),
    (648091::bigint, 'Lieksa', NULL::jsonb, '422', 830686::bigint, 'region', '12'),
    (648180::bigint, 'Lestijärvi', NULL::jsonb, '421', 830675::bigint, 'region', '16'),
    (648228::bigint, 'Leppävirta', NULL::jsonb, '420', 830690::bigint, 'region', '11'),
    (648369::bigint, 'Lempäälä', NULL::jsonb, '418', 830704::bigint, 'region', '06'),
    (648384::bigint, 'Lemland', NULL::jsonb, '417', 661882::bigint, 'region', '21'),
    (648388::bigint, 'Lemi', NULL::jsonb, '416', 830699::bigint, 'region', '09'),
    (648739::bigint, 'Laukaa', '{"sv":"Laukas"}'::jsonb, '410', 830685::bigint, 'region', '13'),
    (648849::bigint, 'Luoto', '{"sv":"Larsmo"}'::jsonb, '440', 830676::bigint, 'region', '15'),
    (648856::bigint, 'Lapua', '{"sv":"Lappo"}'::jsonb, '408', 830682::bigint, 'region', '14'),
    (648901::bigint, 'Lappeenranta', '{"sv":"Villmanstrand"}'::jsonb, '405', 830699::bigint, 'region', '09'),
    (648923::bigint, 'Lappajärvi', NULL::jsonb, '403', 830682::bigint, 'region', '14'),
    (648957::bigint, 'Lapinlahti', '{"sv":"Lapinlax"}'::jsonb, '402', 830690::bigint, 'region', '11'),
    (648976::bigint, 'Lapinjärvi', '{"sv":"Lappträsk"}'::jsonb, '407', 830709::bigint, 'region', '01'),
    (649307::bigint, 'Laitila', NULL::jsonb, '400', 830708::bigint, 'region', '02'),
    (649351::bigint, 'Laihia', '{"sv":"Laihela"}'::jsonb, '399', 830676::bigint, 'region', '15'),
    (649374::bigint, 'Lahti', '{"sv":"Lahtis"}'::jsonb, '398', 831040::bigint, 'region', '07'),
    (649584::bigint, 'Kyyjärvi', NULL::jsonb, '312', 830685::bigint, 'region', '13'),
    (649631::bigint, 'Kirkkonummi', '{"sv":"Kyrkslätt"}'::jsonb, '257', 830709::bigint, 'region', '01'),
    (649925::bigint, 'Kuusamo', NULL::jsonb, '305', 830667::bigint, 'region', '17'),
    (650000::bigint, 'Kustavi', '{"sv":"Gustavs"}'::jsonb, '304', 830708::bigint, 'region', '02'),
    (650098::bigint, 'Kurikka', NULL::jsonb, '301', 830682::bigint, 'region', '14'),
    (650167::bigint, 'Kuortane', NULL::jsonb, '300', 830682::bigint, 'region', '14'),
    (650225::bigint, 'Kuopio', NULL::jsonb, '297', 830690::bigint, 'region', '11'),
    (650397::bigint, 'Kumlinge', NULL::jsonb, '295', 661882::bigint, 'region', '21'),
    (650704::bigint, 'Kuhmoinen', '{"sv":"Kuhmois"}'::jsonb, '291', 830704::bigint, 'region', '06'),
    (650706::bigint, 'Kuhmo', NULL::jsonb, '290', 830664::bigint, 'region', '18'),
    (650755::bigint, 'Kruunupyy', '{"sv":"Kronoby"}'::jsonb, '288', 830676::bigint, 'region', '15'),
    (650770::bigint, 'Kristiinankaupunki', '{"sv":"Kristinestad"}'::jsonb, '287', 830676::bigint, 'region', '15'),
    (650861::bigint, 'Kouvola', NULL::jsonb, '286', 830703::bigint, 'region', '08'),
    (650950::bigint, 'Kotka', NULL::jsonb, '285', 830703::bigint, 'region', '08'),
    (651091::bigint, 'Koski Tl', NULL::jsonb, '284', 830708::bigint, 'region', '02'),
    (651297::bigint, 'Korsnäs', NULL::jsonb, '280', 830676::bigint, 'region', '15'),
    (651301::bigint, 'Mustasaari', '{"sv":"Korsholm"}'::jsonb, '499', 830676::bigint, 'region', '15'),
    (651660::bigint, 'Kontiolahti', '{"sv":"Kontiolax"}'::jsonb, '276', 830686::bigint, 'region', '12'),
    (651698::bigint, 'Konnevesi', NULL::jsonb, '275', 830685::bigint, 'region', '13'),
    (651892::bigint, 'Kolari', NULL::jsonb, '273', 830603::bigint, 'region', '19'),
    (651951::bigint, 'Kokkola', '{"sv":"Karleby"}'::jsonb, '272', 830675::bigint, 'region', '16'),
    (651981::bigint, 'Kokemäki', '{"sv":"Kumo"}'::jsonb, '271', 831041::bigint, 'region', '04'),
    (651989::bigint, 'Kökar', NULL::jsonb, '318', 661882::bigint, 'region', '21'),
    (652498::bigint, 'Kivijärvi', NULL::jsonb, '265', 830685::bigint, 'region', '13'),
    (652561::bigint, 'Kiuruvesi', NULL::jsonb, '263', 830690::bigint, 'region', '11'),
    (652594::bigint, 'Kittilä', NULL::jsonb, '261', 830603::bigint, 'region', '19'),
    (652616::bigint, 'Kitee', '{"sv":"Kides"}'::jsonb, '260', 830686::bigint, 'region', '12'),
    (652746::bigint, 'Kinnula', NULL::jsonb, '256', 830685::bigint, 'region', '13'),
    (652897::bigint, 'Kihniö', NULL::jsonb, '250', 830704::bigint, 'region', '06'),
    (652978::bigint, 'Keuruu', NULL::jsonb, '249', 830685::bigint, 'region', '13'),
    (653186::bigint, 'Kerava', '{"sv":"Kervo"}'::jsonb, '245', 830709::bigint, 'region', '01'),
    (653253::bigint, 'Kempele', NULL::jsonb, '244', 830667::bigint, 'region', '17'),
    (653257::bigint, 'Keminmaa', NULL::jsonb, '241', 830603::bigint, 'region', '19'),
    (653274::bigint, 'Kemijärvi', NULL::jsonb, '320', 830603::bigint, 'region', '19'),
    (653282::bigint, 'Kemi', NULL::jsonb, '240', 830603::bigint, 'region', '19'),
    (653389::bigint, 'Keitele', NULL::jsonb, '239', 830690::bigint, 'region', '11'),
    (653484::bigint, 'Kaustinen', '{"sv":"Kaustby"}'::jsonb, '236', 830675::bigint, 'region', '16'),
    (653560::bigint, 'Kauniainen', '{"sv":"Grankulla"}'::jsonb, '235', 830709::bigint, 'region', '01'),
    (653617::bigint, 'Kauhava', NULL::jsonb, '233', 830682::bigint, 'region', '14'),
    (653628::bigint, 'Kauhajoki', NULL::jsonb, '232', 830682::bigint, 'region', '14'),
    (653760::bigint, 'Kaskinen', '{"sv":"Kaskö"}'::jsonb, '231', 830676::bigint, 'region', '15'),
    (653814::bigint, 'Karvia', NULL::jsonb, '230', 831041::bigint, 'region', '04'),
    (653853::bigint, 'Karstula', NULL::jsonb, '226', 830685::bigint, 'region', '13'),
    (653883::bigint, 'Kärsämäki', NULL::jsonb, '317', 830667::bigint, 'region', '17'),
    (653953::bigint, 'Kärkölä', NULL::jsonb, '316', 831040::bigint, 'region', '07'),
    (653961::bigint, 'Karkkila', '{"sv":"Högfors"}'::jsonb, '224', 830709::bigint, 'region', '01'),
    (654076::bigint, 'Karijoki', '{"sv":"Bötom"}'::jsonb, '218', 830682::bigint, 'region', '14'),
    (654315::bigint, 'Kannus', NULL::jsonb, '217', 830675::bigint, 'region', '16'),
    (654319::bigint, 'Kannonkoski', NULL::jsonb, '216', 830685::bigint, 'region', '13'),
    (654377::bigint, 'Kankaanpää', NULL::jsonb, '214', 831041::bigint, 'region', '04'),
    (654408::bigint, 'Kangasniemi', NULL::jsonb, '213', 830695::bigint, 'region', '10'),
    (654441::bigint, 'Kangasala', NULL::jsonb, '211', 830704::bigint, 'region', '06'),
    (654838::bigint, 'Kalajoki', NULL::jsonb, '208', 830667::bigint, 'region', '17'),
    (654901::bigint, 'Kajaani', '{"sv":"Kajana"}'::jsonb, '205', 830664::bigint, 'region', '18'),
    (655070::bigint, 'Kaavi', NULL::jsonb, '204', 830690::bigint, 'region', '11'),
    (655131::bigint, 'Kaarina', '{"sv":"S:t Karins"}'::jsonb, '202', 830708::bigint, 'region', '02'),
    (655195::bigint, 'Jyväskylä', NULL::jsonb, '179', 830685::bigint, 'region', '13'),
    (655257::bigint, 'Juva', NULL::jsonb, '178', 830695::bigint, 'region', '10'),
    (655308::bigint, 'Juupajoki', NULL::jsonb, '177', 830704::bigint, 'region', '06'),
    (655313::bigint, 'Juuka', '{"sv":"Juga"}'::jsonb, '176', 830686::bigint, 'region', '12'),
    (655582::bigint, 'Joutsa', NULL::jsonb, '172', 830685::bigint, 'region', '13'),
    (655627::bigint, 'Joroinen', '{"sv":"Jorois"}'::jsonb, '171', 830690::bigint, 'region', '11'),
    (655693::bigint, 'Jokioinen', '{"sv":"Jockis"}'::jsonb, '169', 830705::bigint, 'region', '05'),
    (655823::bigint, 'Joensuu', NULL::jsonb, '167', 830686::bigint, 'region', '12'),
    (655977::bigint, 'Järvenpää', '{"sv":"Träskända"}'::jsonb, '186', 830709::bigint, 'region', '01'),
    (656074::bigint, 'Janakkala', NULL::jsonb, '165', 830705::bigint, 'region', '05'),
    (656084::bigint, 'Jämsä', NULL::jsonb, '182', 830685::bigint, 'region', '13'),
    (656092::bigint, 'Jämijärvi', NULL::jsonb, '181', 831041::bigint, 'region', '04'),
    (656131::bigint, 'Pietarsaari', '{"sv":"Jakobstad"}'::jsonb, '598', 830676::bigint, 'region', '15'),
    (656457::bigint, 'Isokyrö', '{"sv":"Storkyro"}'::jsonb, '152', 830682::bigint, 'region', '14'),
    (656518::bigint, 'Isojoki', '{"sv":"Storå"}'::jsonb, '151', 830682::bigint, 'region', '14'),
    (656653::bigint, 'Inkoo', '{"sv":"Ingå"}'::jsonb, '149', 830709::bigint, 'region', '01'),
    (656659::bigint, 'Inari', '{"sv":"Enare"}'::jsonb, '148', 830603::bigint, 'region', '19'),
    (656689::bigint, 'Imatra', NULL::jsonb, '153', 830699::bigint, 'region', '09'),
    (656711::bigint, 'Ilomantsi', '{"sv":"Ilomants"}'::jsonb, '146', 830686::bigint, 'region', '12'),
    (656740::bigint, 'Ilmajoki', '{"sv":"Ilmola"}'::jsonb, '145', 830682::bigint, 'region', '14'),
    (656790::bigint, 'Ikaalinen', '{"sv":"Ikalis"}'::jsonb, '143', 830704::bigint, 'region', '06'),
    (656808::bigint, 'Iitti', '{"sv":"Itis"}'::jsonb, '142', 831040::bigint, 'region', '07'),
    (656821::bigint, 'Iisalmi', '{"sv":"Idensalmi"}'::jsonb, '140', 830690::bigint, 'region', '11'),
    (656852::bigint, 'Ii', NULL::jsonb, '139', 830667::bigint, 'region', '17'),
    (656914::bigint, 'Hyvinkää', '{"sv":"Hyvinge"}'::jsonb, '106', 830709::bigint, 'region', '01'),
    (656951::bigint, 'Hyrynsalmi', NULL::jsonb, '105', 830664::bigint, 'region', '18'),
    (657113::bigint, 'Humppila', NULL::jsonb, '103', 830705::bigint, 'region', '05'),
    (657181::bigint, 'Huittinen', '{"sv":"Vittis"}'::jsonb, '102', 831041::bigint, 'region', '04'),
    (657731::bigint, 'Hirvensalmi', NULL::jsonb, '097', 830695::bigint, 'region', '10'),
    (658226::bigint, 'Helsinki', '{"sv":"Helsingfors"}'::jsonb, '091', 830709::bigint, 'region', '01'),
    (658292::bigint, 'Heinola', NULL::jsonb, '111', 831040::bigint, 'region', '07'),
    (658319::bigint, 'Heinävesi', NULL::jsonb, '090', 830686::bigint, 'region', '12'),
    (658582::bigint, 'Hausjärvi', NULL::jsonb, '086', 830705::bigint, 'region', '05'),
    (658691::bigint, 'Hattula', NULL::jsonb, '082', 830705::bigint, 'region', '05'),
    (658759::bigint, 'Hartola', '{"sv":"Gustav Adolfs"}'::jsonb, '081', 831040::bigint, 'region', '07'),
    (658922::bigint, 'Harjavalta', NULL::jsonb, '079', 831041::bigint, 'region', '04'),
    (659025::bigint, 'Hankasalmi', NULL::jsonb, '077', 830685::bigint, 'region', '13'),
    (659102::bigint, 'Hanko', '{"sv":"Hangö"}'::jsonb, '078', 830709::bigint, 'region', '01'),
    (659171::bigint, 'Hamina', '{"sv":"Fredrikshamn"}'::jsonb, '075', 830703::bigint, 'region', '08'),
    (659181::bigint, 'Hämeenlinna', '{"sv":"Tavastehus"}'::jsonb, '109', 830705::bigint, 'region', '05'),
    (659185::bigint, 'Hämeenkyrö', '{"sv":"Tavastkyro"}'::jsonb, '108', 830704::bigint, 'region', '06'),
    (659232::bigint, 'Halsua', '{"sv":"Halso"}'::jsonb, '074', 830675::bigint, 'region', '16'),
    (659433::bigint, 'Hailuoto', '{"sv":"Karlö"}'::jsonb, '072', 830667::bigint, 'region', '17'),
    (659557::bigint, 'Haapavesi', NULL::jsonb, '071', 830667::bigint, 'region', '17'),
    (659701::bigint, 'Haapajärvi', NULL::jsonb, '069', 830667::bigint, 'region', '17'),
    (659936::bigint, 'Forssa', '{"sv":"Forsa"}'::jsonb, '061', 830705::bigint, 'region', '05'),
    (659951::bigint, 'Föglö', NULL::jsonb, '062', 661882::bigint, 'region', '21'),
    (660067::bigint, 'Evijärvi', NULL::jsonb, '052', 830682::bigint, 'region', '14'),
    (660074::bigint, 'Eurajoki', '{"sv":"Euraåminne"}'::jsonb, '051', 831041::bigint, 'region', '04'),
    (660080::bigint, 'Eura', NULL::jsonb, '050', 831041::bigint, 'region', '04'),
    (660129::bigint, 'Espoo', '{"sv":"Esbo"}'::jsonb, '049', 830709::bigint, 'region', '01'),
    (660230::bigint, 'Enontekiö', '{"sv":"Enontekis"}'::jsonb, '047', 830603::bigint, 'region', '19'),
    (660236::bigint, 'Enonkoski', NULL::jsonb, '046', 830695::bigint, 'region', '10'),
    (660528::bigint, 'Brändö', NULL::jsonb, '035', 661882::bigint, 'region', '21'),
    (660562::bigint, 'Porvoo', '{"sv":"Borgå"}'::jsonb, '638', 830709::bigint, 'region', '01'),
    (660874::bigint, 'Aura', NULL::jsonb, '019', 830708::bigint, 'region', '02'),
    (660932::bigint, 'Askola', NULL::jsonb, '018', 830709::bigint, 'region', '01'),
    (660951::bigint, 'Asikkala', NULL::jsonb, '016', 831040::bigint, 'region', '07'),
    (661353::bigint, 'Alavus', NULL::jsonb, '010', 830682::bigint, 'region', '14'),
    (661364::bigint, 'Alavieska', NULL::jsonb, '009', 830667::bigint, 'region', '17'),
    (661594::bigint, 'Alajärvi', NULL::jsonb, '005', 830682::bigint, 'region', '14'),
    (661897::bigint, 'Ähtäri', '{"sv":"Etseri"}'::jsonb, '989', 830682::bigint, 'region', '14'),
    (662096::bigint, 'Äänekoski', NULL::jsonb, '992', 830685::bigint, 'region', '13'),
    (830147::bigint, 'Hollola', NULL::jsonb, '098', 831040::bigint, 'region', '07'),
    (830153::bigint, 'Vantaa', '{"sv":"Vanda"}'::jsonb, '092', 830709::bigint, 'region', '01'),
    (830266::bigint, 'Outokumpu', NULL::jsonb, '309', 830686::bigint, 'region', '12'),
    (830268::bigint, 'Pieksämäki', NULL::jsonb, '593', 830695::bigint, 'region', '10'),
    (3041733::bigint, 'Maarianhamina', '{"sv":"Mariehamn"}'::jsonb, '478', 661882::bigint, 'region', '21'),
    (3041761::bigint, 'Jomala', NULL::jsonb, '170', 661882::bigint, 'region', '21'),
    (3041777::bigint, 'Hammarland', NULL::jsonb, '076', 661882::bigint, 'region', '21'),
    (3041793::bigint, 'Geta', NULL::jsonb, '065', 661882::bigint, 'region', '21'),
    (3041799::bigint, 'Finström', NULL::jsonb, '060', 661882::bigint, 'region', '21'),
    (3041809::bigint, 'Eckerö', NULL::jsonb, '043', 661882::bigint, 'region', '21'),
    (8128754::bigint, 'Raasepori', '{"sv":"Raseborg"}'::jsonb, '710', 830709::bigint, 'region', '01'),
    (8128755::bigint, 'Sastamala', NULL::jsonb, '790', 830704::bigint, 'region', '06'),
    (8128756::bigint, 'Siikalatva', NULL::jsonb, '791', 830667::bigint, 'region', '17'),
    (8128757::bigint, 'Akaa', '{"sv":"Ackas"}'::jsonb, '020', 830704::bigint, 'region', '06'),
    (8128758::bigint, 'Kemiönsaari', '{"sv":"Kimitoön"}'::jsonb, '322', 830708::bigint, 'region', '02'),
    (8128759::bigint, 'Vöyri', '{"sv":"Vörå"}'::jsonb, '946', 830676::bigint, 'region', '15'),
    (8128761::bigint, 'Mänttä-Vilppula', '{"sv":"Mänttä-Filppula"}'::jsonb, '508', 830704::bigint, 'region', '06')
) AS v(geonames_id, name, name_i18n, external_code, parent_geonames_id, parent_type, parent_external_code)
JOIN public.locations p
  ON p.country_code = 'FI'
 AND p.type = v.parent_type::public.location_type
 AND p.geonames_id = v.parent_geonames_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.locations l WHERE l.geonames_id = v.geonames_id
);

-- Fail the migration if the seed did not land whole.
--
-- A partial seed is worse than none: it is a hole in the tree an admin browses
-- and a gedu claims coverage over — places that simply are not there, with
-- nothing pointing at the cause. Every count is exact rather than "at least",
-- because a surplus means rows exist that this seed does not explain, and that
-- wants a human rather than a pass.
--
-- The counts here are the national statistical agency's, carried through the
-- generator's own gate; they are restated in SQL because this file can be
-- applied by hand long after that gate ran.
DO $$
DECLARE
  n_country integer;
  n_region integer;
  n_municipality integer;
  n_codeless integer;
  n_keyless integer;
  n_dupes integer;
  orphans integer;
BEGIN
  SELECT count(*) INTO n_country
    FROM public.locations
   WHERE country_code = 'FI' AND type = 'country';

  IF n_country <> 1 THEN
    RAISE EXCEPTION 'Finland GeoNames seed: expected exactly 1 FI country row, found %', n_country;
  END IF;

  SELECT count(*) INTO n_region
    FROM public.locations
   WHERE country_code = 'FI' AND type = 'region';

  IF n_region <> 19 THEN
    RAISE EXCEPTION
      'Finland GeoNames seed: expected 19 region rows for FI, found %. A shortfall means a level above did not land; a surplus means rows exist this seed does not explain.',
      n_region;
  END IF;

  -- Orphans, LEFT JOIN shape: a NULL or dangling parent_id has to be visible,
  -- which an inner join would silently drop.
  SELECT count(*) INTO orphans
    FROM public.locations c
    LEFT JOIN public.locations p ON p.id = c.parent_id
   WHERE c.country_code = 'FI' AND c.type = 'region'
     AND (p.id IS NULL OR p.country_code <> 'FI' OR p.type <> 'country');

  IF orphans > 0 THEN
    RAISE EXCEPTION 'Finland GeoNames seed: % region rows are not parented to a country row in FI', orphans;
  END IF;

  SELECT count(*) INTO n_municipality
    FROM public.locations
   WHERE country_code = 'FI' AND type = 'municipality';

  IF n_municipality <> 308 THEN
    RAISE EXCEPTION
      'Finland GeoNames seed: expected 308 municipality rows for FI, found %. A shortfall means a level above did not land; a surplus means rows exist this seed does not explain.',
      n_municipality;
  END IF;

  -- Orphans, LEFT JOIN shape: a NULL or dangling parent_id has to be visible,
  -- which an inner join would silently drop.
  SELECT count(*) INTO orphans
    FROM public.locations c
    LEFT JOIN public.locations p ON p.id = c.parent_id
   WHERE c.country_code = 'FI' AND c.type = 'municipality'
     AND (p.id IS NULL OR p.country_code <> 'FI' OR p.type <> 'region');

  IF orphans > 0 THEN
    RAISE EXCEPTION 'Finland GeoNames seed: % municipality rows are not parented to a region row in FI', orphans;
  END IF;

  -- Every seeded row is a GeoNames row.
  SELECT count(*) INTO n_keyless
    FROM public.locations
   WHERE country_code = 'FI' AND type IN ('country', 'region', 'municipality')
     AND geonames_id IS NULL;

  IF n_keyless <> 0 THEN
    RAISE EXCEPTION
      'Finland GeoNames seed: % seeded FI rows carry no geonames_id, expected 0',
      n_keyless;
  END IF;

  -- Every row at a level the config maps a code for carries one. A code-less
  -- row cannot be re-pointed by a reconciliation or joined by postal data.
  SELECT count(*) INTO n_codeless
    FROM public.locations
   WHERE country_code = 'FI' AND type IN ('region', 'municipality')
     AND external_code IS NULL;

  IF n_codeless > 0 THEN
    RAISE EXCEPTION
      'Finland GeoNames seed: % FI rows carry no external_code at a level that must have one',
      n_codeless;
  END IF;

  -- Codes are unique within (country, type) — the key every reconciliation and
  -- official-data join runs on.
  SELECT count(*) INTO n_dupes
    FROM (
      SELECT type, external_code
        FROM public.locations
       WHERE country_code = 'FI' AND external_code IS NOT NULL
       GROUP BY type, external_code
      HAVING count(*) > 1
    ) d;

  IF n_dupes > 0 THEN
    RAISE EXCEPTION 'Finland GeoNames seed: % (type, external_code) pairs are duplicated for FI', n_dupes;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. RE-POINT — every captured reference, against the rows that replaced them
-- ---------------------------------------------------------------------------
--
-- One join throughout: (country_code, type, external_code), with
-- `IS NOT DISTINCT FROM` so a country-level reference — whose code is NULL,
-- because no national classification gives country rows one — matches on the
-- type alone.

-- Resolved first, into a table, because the same resolution answers three
-- questions: where each site goes, which sites had nowhere to go, and whether
-- the join was a function rather than a fan-out (asserted in section 5).
CREATE TEMP TABLE cutover_site_targets ON COMMIT DROP AS
  SELECT c.site_id, c.site_name, c.parent_type, c.parent_code, n.id AS new_parent_id
    FROM cutover_sites c
    LEFT JOIN public.locations n
      ON n.country_code = 'FI'
     AND n.type = c.parent_type
     AND n.external_code IS NOT DISTINCT FROM c.parent_code;

UPDATE public.locations s
   SET parent_id = t.new_parent_id
  FROM cutover_site_targets t
 WHERE s.id = t.site_id
   AND t.new_parent_id IS NOT NULL;

-- A site whose old parent has no counterpart is parked under the country row.
-- Never NULL: a NULL parent is the picker's root level, so the venue would
-- surface beside the countries. Never deleted: a product may RESTRICT on it.
UPDATE public.locations s
   SET parent_id = c.id
  FROM cutover_site_targets t,
       public.locations c
 WHERE s.id = t.site_id
   AND t.new_parent_id IS NULL
   AND c.country_code = 'FI'
   AND c.type = 'country';

INSERT INTO public.gedu_locations (gedu_id, location_id)
SELECT c.gedu_id, n.id
  FROM cutover_gedu c
  JOIN public.locations n
    ON n.country_code = 'FI'
   AND n.type = c.type
   AND n.external_code IS NOT DISTINCT FROM c.external_code;

UPDATE public.profiles p
   SET home_location_id = n.id
  FROM cutover_home c
  JOIN public.locations n
    ON n.country_code = 'FI'
   AND n.type = c.type
   AND n.external_code IS NOT DISTINCT FROM c.external_code
 WHERE p.id = c.profile_id;

-- The warning report. Empty is the expected outcome in production; staging's
-- location data is fake and explicitly disposable, so losses there are named
-- and accepted rather than fixed.
DO $$
DECLARE
  v_count integer;
  v_names text;
BEGIN
  SELECT count(*), string_agg(format('%s (was under %s %s)', site_name, parent_type, coalesce(parent_code, '-')), ', ' ORDER BY site_name)
    INTO v_count, v_names
    FROM cutover_site_targets
   WHERE new_parent_id IS NULL;

  IF v_count > 0 THEN
    RAISE WARNING
      'Finland cutover: % site(s) had no counterpart for their old parent and are parked under the FI country row: %',
      v_count, v_names;
  END IF;

  SELECT count(*), string_agg(format('gedu %s -> %s %s', c.gedu_id, c.type, coalesce(c.external_code, '-')), ', ' ORDER BY c.gedu_id, c.type)
    INTO v_count, v_names
    FROM cutover_gedu c
   WHERE NOT EXISTS (
     SELECT 1 FROM public.locations n
      WHERE n.country_code = 'FI'
        AND n.type = c.type
        AND n.external_code IS NOT DISTINCT FROM c.external_code
   );

  IF v_count > 0 THEN
    RAISE WARNING
      'Finland cutover: % gedu coverage tick(s) had no counterpart and are gone: %',
      v_count, v_names;
  END IF;

  SELECT count(*), string_agg(format('profile %s -> %s %s', c.profile_id, c.type, coalesce(c.external_code, '-')), ', ' ORDER BY c.profile_id)
    INTO v_count, v_names
    FROM cutover_home c
   WHERE NOT EXISTS (
     SELECT 1 FROM public.locations n
      WHERE n.country_code = 'FI'
        AND n.type = c.type
        AND n.external_code IS NOT DISTINCT FROM c.external_code
   );

  IF v_count > 0 THEN
    RAISE WARNING
      'Finland cutover: % family location pick(s) had no counterpart and are now empty: %',
      v_count, v_names;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. ASSERT — nothing crossed silently
-- ---------------------------------------------------------------------------
--
-- The seed gates above already refused a tree that did not land whole. What is
-- left to prove is that every reference into the old tree either landed in the
-- new one or was named in a warning, and that no site was left somewhere a user
-- would meet it as a country.
DO $$
DECLARE
  v_sites          integer;
  v_targets        integer;
  v_captured       integer;
  v_lost           integer;
  v_restored       integer;
  v_expected       integer;
BEGIN
  -- The code join has to be a function, not a fan-out: one target row per
  -- captured site, or the UPDATE above picked an arbitrary parent.
  SELECT count(*) INTO v_sites   FROM cutover_sites;
  SELECT count(*) INTO v_targets FROM cutover_site_targets;

  IF v_targets <> v_sites THEN
    RAISE EXCEPTION
      'Finland cutover: % captured site(s) resolved to % target row(s) — the (type, external_code) join is not unique',
      v_sites, v_targets;
  END IF;

  -- Gedu coverage: restored = captured - warned. The wipe cascaded every old
  -- row away, so what is there now is exactly what section 4 re-inserted.
  SELECT count(*) INTO v_captured FROM cutover_gedu;
  SELECT count(*) INTO v_lost
    FROM cutover_gedu c
   WHERE NOT EXISTS (
     SELECT 1 FROM public.locations n
      WHERE n.country_code = 'FI' AND n.type = c.type
        AND n.external_code IS NOT DISTINCT FROM c.external_code
   );
  SELECT count(*) INTO v_restored
    FROM public.gedu_locations gl
    JOIN public.locations n ON n.id = gl.location_id
   WHERE n.country_code = 'FI' AND n.type IN ('country', 'region', 'municipality');

  IF v_restored <> v_captured - v_lost THEN
    RAISE EXCEPTION
      'Finland cutover: captured % gedu coverage tick(s), warned about %, but % came back',
      v_captured, v_lost, v_restored;
  END IF;

  -- Family location picks, the same way.
  SELECT count(*) INTO v_captured FROM cutover_home;
  SELECT count(*) INTO v_lost
    FROM cutover_home c
   WHERE NOT EXISTS (
     SELECT 1 FROM public.locations n
      WHERE n.country_code = 'FI' AND n.type = c.type
        AND n.external_code IS NOT DISTINCT FROM c.external_code
   );
  SELECT count(*) INTO v_restored
    FROM public.profiles p
    JOIN public.locations n ON n.id = p.home_location_id
   WHERE n.country_code = 'FI' AND n.type IN ('country', 'region', 'municipality');

  IF v_restored <> v_captured - v_lost THEN
    RAISE EXCEPTION
      'Finland cutover: captured % family location pick(s), warned about %, but % came back',
      v_captured, v_lost, v_restored;
  END IF;

  -- No site left at the picker's root.
  SELECT count(*) INTO v_restored
    FROM public.locations
   WHERE type = 'site' AND country_code = 'FI' AND parent_id IS NULL;

  IF v_restored > 0 THEN
    RAISE EXCEPTION
      'Finland cutover: % FI site(s) have no parent and would surface beside the countries',
      v_restored;
  END IF;

  -- The sites sitting directly under the country row are exactly the ones that
  -- had nowhere else to go, plus any that were already there before this ran —
  -- a site parked by an earlier reconciliation stays parked, and re-points to
  -- the new country row rather than counting as a fresh loss.
  SELECT count(*) INTO v_expected
    FROM cutover_site_targets
   WHERE new_parent_id IS NULL OR parent_type = 'country';
  SELECT count(*) INTO v_restored
    FROM public.locations s
    JOIN public.locations p ON p.id = s.parent_id
   WHERE s.type = 'site' AND s.country_code = 'FI'
     AND p.type = 'country' AND p.country_code = 'FI';

  IF v_restored <> v_expected THEN
    RAISE EXCEPTION
      'Finland cutover: % FI site(s) sit directly under the country row, expected % (the warned set)',
      v_restored, v_expected;
  END IF;
END;
$$;

COMMIT;
