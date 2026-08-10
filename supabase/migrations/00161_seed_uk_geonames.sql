-- Seeds the United Kingdom's location tree from GeoNames: the country row plus 4 regions, 217 municipalities.
--
-- SOURCE
--
-- GeoNames country dump GB.txt (published 2026-08-07), its matching alternate-names file, and
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
-- configured rule (the dump's own name column).
-- `name_i18n` holds only the locales that differ from it — never a key equal to
-- `name`, which is the convention the display resolver depends on. The country
-- row takes an alternate for every supported UI locale, which is the one level
-- where every locale has real payload; the levels below take the locales the
-- config lists (none for this country).
--
-- CODES
--
-- `external_code` is NULL on every row below the country here, and that is a
-- decision rather than a gap. GeoNames' admin codes for this country are its
-- own invention and match no national classification, and the column's contract
-- is the *official* code — putting a made-up value in it would break every join
-- it exists for. What is forfeited is named: joins against this country's
-- official datasets, postal data included, cannot run on this column. What is
-- not affected is identity — `geonames_id` is what ingestion, sync and every
-- dedupe run on, and every row below carries one.
--
-- The municipality count is the national classification's 218, minus the
-- 2 it names that GeoNames does not carry and plus the 1 GeoNames
-- carries that the classification does not. This level maps no official code, so
-- each row is named by the key it does have:
--   missing: "Cumberland", "Westmorland and Furness"
--   extra:   geonameid 2651712
-- Both lists are named in the config and are re-surfaced by every sync report
-- until upstream heals.
--
-- DEPTH
--
-- No row carries `depth`: a trigger derives it from the parent row, so an
-- emitted value would be overwritten on the way in.
--
-- REGENERATING
--
--   node scripts/generate-geonames-seed.mjs GB
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
-- Data-only migration: no schema change, no type/grant change. It does depend
-- on the groundwork migration that adds `locations.geonames_id` and the depth
-- trigger, which migration ordering guarantees has already run.

BEGIN;
-- The country row. Guarded on both keys: a second country row for GB would
-- surface twice at the picker's root level.
INSERT INTO public.locations (geonames_id, name, name_i18n, type, parent_id, country_code, external_code)
SELECT 2635167::bigint, 'United Kingdom', '{"fi":"Britannia","fr":"Royaume-Uni","sv":"Storbritannien"}'::jsonb, 'country', NULL, 'GB', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.locations l
   WHERE l.geonames_id = 2635167::bigint
      OR (l.type = 'country' AND l.country_code = 'GB')
);

-- Regions (4).
INSERT INTO public.locations (geonames_id, name, name_i18n, type, parent_id, country_code, external_code)
SELECT v.geonames_id, v.name, v.name_i18n, 'region', p.id, 'GB', v.external_code
FROM (VALUES
    (2634895::bigint, 'Wales', NULL::jsonb, NULL::text, 2635167::bigint, 'country', NULL::text),
    (2638360::bigint, 'Scotland', NULL::jsonb, NULL::text, 2635167::bigint, 'country', NULL::text),
    (2641364::bigint, 'Northern Ireland', NULL::jsonb, NULL::text, 2635167::bigint, 'country', NULL::text),
    (6269131::bigint, 'England', NULL::jsonb, NULL::text, 2635167::bigint, 'country', NULL::text)
) AS v(geonames_id, name, name_i18n, external_code, parent_geonames_id, parent_type, parent_external_code)
JOIN public.locations p
  ON p.country_code = 'GB'
 AND p.type = v.parent_type::public.location_type
 AND p.geonames_id = v.parent_geonames_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.locations l WHERE l.geonames_id = v.geonames_id
);

-- Municipalities (217).
INSERT INTO public.locations (geonames_id, name, name_i18n, type, parent_id, country_code, external_code)
SELECT v.geonames_id, v.name, v.name_i18n, 'municipality', p.id, 'GB', v.external_code
FROM (VALUES
    (2633351::bigint, 'City of York', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2633484::bigint, 'Wrexham', NULL::jsonb, NULL::text, 2634895::bigint, 'region', NULL::text),
    (2633560::bigint, 'Worcestershire', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2633840::bigint, 'Royal Borough of Windsor and Maidenhead', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2633868::bigint, 'Wiltshire', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2634258::bigint, 'West Sussex', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2634354::bigint, 'West Lothian', NULL::jsonb, NULL::text, 2638360::bigint, 'region', NULL::text),
    (2634428::bigint, 'Eilean Siar', NULL::jsonb, NULL::text, 2638360::bigint, 'region', NULL::text),
    (2634723::bigint, 'Warwickshire', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2635028::bigint, 'Vale of Glamorgan', NULL::jsonb, NULL::text, 2634895::bigint, 'region', NULL::text),
    (2635594::bigint, 'Tower Hamlets', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2635885::bigint, 'Borough of Thurrock', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2636512::bigint, 'Surrey', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2636561::bigint, 'Suffolk', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2636909::bigint, 'Stirling', NULL::jsonb, NULL::text, 2638360::bigint, 'region', NULL::text),
    (2637141::bigint, 'Staffordshire', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2637532::bigint, 'Somerset', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2638010::bigint, 'Shetland Islands', NULL::jsonb, NULL::text, 2638360::bigint, 'region', NULL::text),
    (2638384::bigint, 'Isles of Scilly', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2638655::bigint, 'Shropshire', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2638918::bigint, 'District of Rutland', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2639494::bigint, 'Renfrewshire', NULL::jsonb, NULL::text, 2638360::bigint, 'region', NULL::text),
    (2639944::bigint, 'Sir Powys', NULL::jsonb, NULL::text, 2634895::bigint, 'region', NULL::text),
    (2640500::bigint, 'Pembrokeshire', NULL::jsonb, NULL::text, 2634895::bigint, 'region', NULL::text),
    (2640726::bigint, 'Oxfordshire', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2640923::bigint, 'Orkney Islands', NULL::jsonb, NULL::text, 2638360::bigint, 'region', NULL::text),
    (2641169::bigint, 'Nottinghamshire', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2641209::bigint, 'North Yorkshire', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2641235::bigint, 'Northumberland', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2641238::bigint, 'North Tyneside', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2641455::bigint, 'Norfolk', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2641639::bigint, 'Newham', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2642240::bigint, 'Moray', NULL::jsonb, NULL::text, 2638360::bigint, 'region', NULL::text),
    (2642559::bigint, 'Midlothian', NULL::jsonb, NULL::text, 2638360::bigint, 'region', NULL::text),
    (2643744::bigint, 'City of London', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2644486::bigint, 'Lincolnshire', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2644667::bigint, 'Leicestershire', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2644974::bigint, 'Lancashire', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2646007::bigint, 'Isle of Wight', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2646127::bigint, 'Inverclyde', NULL::jsonb, NULL::text, 2638360::bigint, 'region', NULL::text),
    (2646944::bigint, 'Highland', NULL::jsonb, NULL::text, 2638360::bigint, 'region', NULL::text),
    (2647043::bigint, 'Hertfordshire', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2647071::bigint, 'Herefordshire', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2647554::bigint, 'Hampshire', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2647601::bigint, 'Borough of Halton', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2647716::bigint, 'Gwynedd', NULL::jsonb, NULL::text, 2634895::bigint, 'region', NULL::text),
    (2648402::bigint, 'Gloucestershire', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2648772::bigint, 'Gateshead', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2649298::bigint, 'County of Flintshire', NULL::jsonb, NULL::text, 2634895::bigint, 'region', NULL::text),
    (2649469::bigint, 'Fife', NULL::jsonb, NULL::text, 2638360::bigint, 'region', NULL::text),
    (2649889::bigint, 'Essex', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2650328::bigint, 'East Sussex', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2650345::bigint, 'East Riding of Yorkshire', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2650386::bigint, 'East Lothian', NULL::jsonb, NULL::text, 2638360::bigint, 'region', NULL::text),
    (2650629::bigint, 'County Durham', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2650797::bigint, 'Dumfries and Galloway', NULL::jsonb, NULL::text, 2638360::bigint, 'region', NULL::text),
    (2651079::bigint, 'Dorset', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2651292::bigint, 'Devon', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2651346::bigint, 'Derbyshire', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2651385::bigint, 'Denbighshire', NULL::jsonb, NULL::text, 2634895::bigint, 'region', NULL::text),
    (2651712::bigint, 'Cumbria', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2652355::bigint, 'Cornwall', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2652975::bigint, 'Clackmannanshire', NULL::jsonb, NULL::text, 2638360::bigint, 'region', NULL::text),
    (2653753::bigint, 'Carmarthenshire', NULL::jsonb, NULL::text, 2634895::bigint, 'region', NULL::text),
    (2653814::bigint, 'County of Ceredigion', NULL::jsonb, NULL::text, 2634895::bigint, 'region', NULL::text),
    (2653940::bigint, 'Cambridgeshire', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2654408::bigint, 'Buckinghamshire', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (2655192::bigint, 'The Scottish Borders', NULL::jsonb, NULL::text, 2638360::bigint, 'region', NULL::text),
    (2657306::bigint, 'Angus', NULL::jsonb, NULL::text, 2638360::bigint, 'region', NULL::text),
    (2657311::bigint, 'Anglesey', NULL::jsonb, NULL::text, 2634895::bigint, 'region', NULL::text),
    (2657830::bigint, 'Aberdeenshire', NULL::jsonb, NULL::text, 2638360::bigint, 'region', NULL::text),
    (3333120::bigint, 'Barking and Dagenham', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333121::bigint, 'Barnet', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333122::bigint, 'Barnsley', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333123::bigint, 'Bath and North East Somerset', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333124::bigint, 'Bexley', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333125::bigint, 'City and Borough of Birmingham', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333126::bigint, 'Blackburn with Darwen', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333127::bigint, 'Blackpool', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333128::bigint, 'Borough of Bolton', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333130::bigint, 'Bracknell Forest', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333131::bigint, 'Bradford', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333132::bigint, 'Brent', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333133::bigint, 'Brighton and Hove', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333134::bigint, 'City of Bristol', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333135::bigint, 'Bromley', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333136::bigint, 'Borough of Bury', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333137::bigint, 'Calderdale', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333138::bigint, 'Camden', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333139::bigint, 'Coventry', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333140::bigint, 'Croydon', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333141::bigint, 'Darlington', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333142::bigint, 'Derby', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333143::bigint, 'Doncaster', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333144::bigint, 'Dudley', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333145::bigint, 'Ealing', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333146::bigint, 'Enfield', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333147::bigint, 'Greenwich', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333148::bigint, 'Hackney', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333149::bigint, 'Hammersmith and Fulham', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333150::bigint, 'Haringey', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333151::bigint, 'Harrow', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333152::bigint, 'Hartlepool', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333153::bigint, 'Havering', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333154::bigint, 'Hillingdon', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333155::bigint, 'Hounslow', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333156::bigint, 'Islington', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333157::bigint, 'Royal Kensington and Chelsea', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333158::bigint, 'Kent', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333159::bigint, 'City of Kingston upon Hull', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333160::bigint, 'Royal Kingston upon Thames', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333161::bigint, 'Kirklees', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333162::bigint, 'Knowsley', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333163::bigint, 'Lambeth', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333164::bigint, 'City and Borough of Leeds', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333165::bigint, 'City of Leicester', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333166::bigint, 'Lewisham', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333167::bigint, 'Liverpool', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333168::bigint, 'Luton', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333169::bigint, 'Manchester', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333170::bigint, 'Medway', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333171::bigint, 'Merton', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333172::bigint, 'Middlesbrough', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333173::bigint, 'Milton Keynes', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333174::bigint, 'Newcastle upon Tyne', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333175::bigint, 'North East Lincolnshire', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333176::bigint, 'North Lincolnshire', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333177::bigint, 'North Somerset', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333178::bigint, 'Nottingham', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333179::bigint, 'Borough of Oldham', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333180::bigint, 'Peterborough', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333181::bigint, 'Plymouth', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333183::bigint, 'Portsmouth', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333184::bigint, 'Reading', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333185::bigint, 'Redbridge', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333186::bigint, 'Redcar and Cleveland', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333187::bigint, 'Richmond upon Thames', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333188::bigint, 'Borough of Rochdale', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333189::bigint, 'Rotherham', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333190::bigint, 'City and Borough of Salford', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333191::bigint, 'Sandwell', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333192::bigint, 'Sefton', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333193::bigint, 'Sheffield', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333194::bigint, 'Slough', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333195::bigint, 'Solihull', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333196::bigint, 'Southampton', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333197::bigint, 'Southend-on-Sea', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333198::bigint, 'South Gloucestershire', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333199::bigint, 'South Tyneside', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333200::bigint, 'Southwark', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333201::bigint, 'St. Helens', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333202::bigint, 'Borough of Stockport', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333203::bigint, 'Stockton-on-Tees', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333204::bigint, 'Stoke-on-Trent', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333205::bigint, 'Sunderland', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333206::bigint, 'Sutton', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333207::bigint, 'Borough of Swindon', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333208::bigint, 'Borough of Tameside', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333209::bigint, 'Telford and Wrekin', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333210::bigint, 'Borough of Torbay', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333211::bigint, 'Trafford', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333212::bigint, 'City and Borough of Wakefield', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333213::bigint, 'Walsall', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333214::bigint, 'Waltham Forest', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333215::bigint, 'Wandsworth', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333216::bigint, 'Warrington', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333217::bigint, 'West Berkshire', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333218::bigint, 'City of Westminster', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333219::bigint, 'Borough of Wigan', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333220::bigint, 'Metropolitan Borough of Wirral', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333221::bigint, 'Wokingham', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333222::bigint, 'Wolverhampton', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (3333223::bigint, 'City of Belfast', NULL::jsonb, NULL::text, 2641364::bigint, 'region', NULL::text),
    (3333224::bigint, 'Aberdeen City', NULL::jsonb, NULL::text, 2638360::bigint, 'region', NULL::text),
    (3333225::bigint, 'Dundee City', NULL::jsonb, NULL::text, 2638360::bigint, 'region', NULL::text),
    (3333226::bigint, 'East Ayrshire', NULL::jsonb, NULL::text, 2638360::bigint, 'region', NULL::text),
    (3333227::bigint, 'East Dunbartonshire', NULL::jsonb, NULL::text, 2638360::bigint, 'region', NULL::text),
    (3333228::bigint, 'East Renfrewshire', NULL::jsonb, NULL::text, 2638360::bigint, 'region', NULL::text),
    (3333229::bigint, 'City of Edinburgh', NULL::jsonb, NULL::text, 2638360::bigint, 'region', NULL::text),
    (3333230::bigint, 'Falkirk', NULL::jsonb, NULL::text, 2638360::bigint, 'region', NULL::text),
    (3333231::bigint, 'Glasgow City', NULL::jsonb, NULL::text, 2638360::bigint, 'region', NULL::text),
    (3333232::bigint, 'North Ayrshire', NULL::jsonb, NULL::text, 2638360::bigint, 'region', NULL::text),
    (3333233::bigint, 'North Lanarkshire', NULL::jsonb, NULL::text, 2638360::bigint, 'region', NULL::text),
    (3333234::bigint, 'Perth and Kinross', NULL::jsonb, NULL::text, 2638360::bigint, 'region', NULL::text),
    (3333235::bigint, 'South Ayrshire', NULL::jsonb, NULL::text, 2638360::bigint, 'region', NULL::text),
    (3333236::bigint, 'South Lanarkshire', NULL::jsonb, NULL::text, 2638360::bigint, 'region', NULL::text),
    (3333237::bigint, 'West Dunbartonshire', NULL::jsonb, NULL::text, 2638360::bigint, 'region', NULL::text),
    (3333238::bigint, 'Blaenau Gwent', NULL::jsonb, NULL::text, 2634895::bigint, 'region', NULL::text),
    (3333239::bigint, 'Bridgend county borough', NULL::jsonb, NULL::text, 2634895::bigint, 'region', NULL::text),
    (3333240::bigint, 'Caerphilly County Borough', NULL::jsonb, NULL::text, 2634895::bigint, 'region', NULL::text),
    (3333241::bigint, 'Cardiff', NULL::jsonb, NULL::text, 2634895::bigint, 'region', NULL::text),
    (3333242::bigint, 'Conwy', NULL::jsonb, NULL::text, 2634895::bigint, 'region', NULL::text),
    (3333243::bigint, 'Merthyr Tydfil County Borough', NULL::jsonb, NULL::text, 2634895::bigint, 'region', NULL::text),
    (3333244::bigint, 'Monmouthshire', NULL::jsonb, NULL::text, 2634895::bigint, 'region', NULL::text),
    (3333245::bigint, 'Neath Port Talbot', NULL::jsonb, NULL::text, 2634895::bigint, 'region', NULL::text),
    (3333246::bigint, 'Newport', NULL::jsonb, NULL::text, 2634895::bigint, 'region', NULL::text),
    (3333247::bigint, 'Rhondda Cynon Taf', NULL::jsonb, NULL::text, 2634895::bigint, 'region', NULL::text),
    (3333248::bigint, 'City and County of Swansea', NULL::jsonb, NULL::text, 2634895::bigint, 'region', NULL::text),
    (3333249::bigint, 'Torfaen County Borough', NULL::jsonb, NULL::text, 2634895::bigint, 'region', NULL::text),
    (6457407::bigint, 'Argyll and Bute', NULL::jsonb, NULL::text, 2638360::bigint, 'region', NULL::text),
    (7290534::bigint, 'Bedford', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (7290535::bigint, 'Central Bedfordshire', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (7290536::bigint, 'Cheshire East', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (7290537::bigint, 'Cheshire West and Chester', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (11353068::bigint, 'Mid Ulster', NULL::jsonb, NULL::text, 2641364::bigint, 'region', NULL::text),
    (11353069::bigint, 'Antrim and Newtownabbey', NULL::jsonb, NULL::text, 2641364::bigint, 'region', NULL::text),
    (11353070::bigint, 'Causeway Coast and Glens', NULL::jsonb, NULL::text, 2641364::bigint, 'region', NULL::text),
    (11353071::bigint, 'Fermanagh and Omagh', NULL::jsonb, NULL::text, 2641364::bigint, 'region', NULL::text),
    (11353072::bigint, 'Lisburn and Castlereagh', NULL::jsonb, NULL::text, 2641364::bigint, 'region', NULL::text),
    (11353073::bigint, 'Derry City and Strabane', NULL::jsonb, NULL::text, 2641364::bigint, 'region', NULL::text),
    (11353074::bigint, 'Ards and North Down', NULL::jsonb, NULL::text, 2641364::bigint, 'region', NULL::text),
    (11353076::bigint, 'Armagh City Banbridge and Craigavon', NULL::jsonb, NULL::text, 2641364::bigint, 'region', NULL::text),
    (11353077::bigint, 'Newry Mourne and Down', NULL::jsonb, NULL::text, 2641364::bigint, 'region', NULL::text),
    (11353078::bigint, 'Mid and East Antrim', NULL::jsonb, NULL::text, 2641364::bigint, 'region', NULL::text),
    (12165737::bigint, 'Bournemouth, Christchurch and Poole Council', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (13192427::bigint, 'West Northamptonshire', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text),
    (13192429::bigint, 'North Northamptonshire', NULL::jsonb, NULL::text, 6269131::bigint, 'region', NULL::text)
) AS v(geonames_id, name, name_i18n, external_code, parent_geonames_id, parent_type, parent_external_code)
JOIN public.locations p
  ON p.country_code = 'GB'
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
  n_keyless integer;
  n_dupes integer;
  orphans integer;
BEGIN
  SELECT count(*) INTO n_country
    FROM public.locations
   WHERE country_code = 'GB' AND type = 'country';

  IF n_country <> 1 THEN
    RAISE EXCEPTION 'the United Kingdom GeoNames seed: expected exactly 1 GB country row, found %', n_country;
  END IF;

  SELECT count(*) INTO n_region
    FROM public.locations
   WHERE country_code = 'GB' AND type = 'region';

  IF n_region <> 4 THEN
    RAISE EXCEPTION
      'the United Kingdom GeoNames seed: expected 4 region rows for GB, found %. A shortfall means a level above did not land; a surplus means rows exist this seed does not explain.',
      n_region;
  END IF;

  -- Orphans, LEFT JOIN shape: a NULL or dangling parent_id has to be visible,
  -- which an inner join would silently drop.
  SELECT count(*) INTO orphans
    FROM public.locations c
    LEFT JOIN public.locations p ON p.id = c.parent_id
   WHERE c.country_code = 'GB' AND c.type = 'region'
     AND (p.id IS NULL OR p.country_code <> 'GB' OR p.type <> 'country');

  IF orphans > 0 THEN
    RAISE EXCEPTION 'the United Kingdom GeoNames seed: % region rows are not parented to a country row in GB', orphans;
  END IF;

  SELECT count(*) INTO n_municipality
    FROM public.locations
   WHERE country_code = 'GB' AND type = 'municipality';

  IF n_municipality <> 217 THEN
    RAISE EXCEPTION
      'the United Kingdom GeoNames seed: expected 217 municipality rows for GB, found %. A shortfall means a level above did not land; a surplus means rows exist this seed does not explain.',
      n_municipality;
  END IF;

  -- Orphans, LEFT JOIN shape: a NULL or dangling parent_id has to be visible,
  -- which an inner join would silently drop.
  SELECT count(*) INTO orphans
    FROM public.locations c
    LEFT JOIN public.locations p ON p.id = c.parent_id
   WHERE c.country_code = 'GB' AND c.type = 'municipality'
     AND (p.id IS NULL OR p.country_code <> 'GB' OR p.type <> 'region');

  IF orphans > 0 THEN
    RAISE EXCEPTION 'the United Kingdom GeoNames seed: % municipality rows are not parented to a region row in GB', orphans;
  END IF;

  -- Every seeded row is a GeoNames row.
  SELECT count(*) INTO n_keyless
    FROM public.locations
   WHERE country_code = 'GB' AND type IN ('country', 'region', 'municipality')
     AND geonames_id IS NULL;

  IF n_keyless <> 0 THEN
    RAISE EXCEPTION
      'the United Kingdom GeoNames seed: % seeded GB rows carry no geonames_id, expected 0',
      n_keyless;
  END IF;

  -- No code-less check: this country's config maps no official code below the
  -- country row, because GeoNames' admin codes for it are its own invention
  -- rather than the national classification's. Every row is still keyed by
  -- geonames_id, which is what ingestion, sync and the dedupe below run on;
  -- what is forfeited is joins against official data, named in the config.

  -- Codes are unique within (country, type) — the key every reconciliation and
  -- official-data join runs on.
  SELECT count(*) INTO n_dupes
    FROM (
      SELECT type, external_code
        FROM public.locations
       WHERE country_code = 'GB' AND external_code IS NOT NULL
       GROUP BY type, external_code
      HAVING count(*) > 1
    ) d;

  IF n_dupes > 0 THEN
    RAISE EXCEPTION 'the United Kingdom GeoNames seed: % (type, external_code) pairs are duplicated for GB', n_dupes;
  END IF;
END;
$$;

COMMIT;
