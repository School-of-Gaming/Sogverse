-- Seeds Sweden's location tree from GeoNames: the country row plus 21 regions, 290 municipalities.
--
-- SOURCE
--
-- GeoNames country dump SE.txt (published 2026-08-07), its matching alternate-names file, and
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
-- `external_code` keeps its existing contract — the row's code in its
-- country's official statistical classification, unique per (country, type) —
-- and never holds a geonameid. GeoNames' admin-code columns are what supply it,
-- so joins against official data keep working.
--
-- DEPTH
--
-- No row carries `depth`: a trigger derives it from the parent row, so an
-- emitted value would be overwritten on the way in.
--
-- REGENERATING
--
--   node scripts/generate-geonames-seed.mjs SE
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
-- The country row. Guarded on both keys: a second country row for SE would
-- surface twice at the picker's root level.
INSERT INTO public.locations (geonames_id, name, name_i18n, type, parent_id, country_code, external_code)
SELECT 2661886::bigint, 'Sverige', '{"en":"Sweden","fi":"Ruotsi","fr":"Suède"}'::jsonb, 'country', NULL, 'SE', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.locations l
   WHERE l.geonames_id = 2661886::bigint
      OR (l.type = 'country' AND l.country_code = 'SE')
);

-- Regions (21).
INSERT INTO public.locations (geonames_id, name, name_i18n, type, parent_id, country_code, external_code)
SELECT v.geonames_id, v.name, v.name_i18n, 'region', p.id, 'SE', v.external_code
FROM (VALUES
    (604010::bigint, 'Norrbotten County', NULL::jsonb, '25', 2661886::bigint, 'country', NULL::text),
    (2664179::bigint, 'Västmanland County', NULL::jsonb, '19', 2661886::bigint, 'country', NULL::text),
    (2664292::bigint, 'Västernorrland County', NULL::jsonb, '22', 2661886::bigint, 'country', NULL::text),
    (2664415::bigint, 'Västerbotten County', NULL::jsonb, '24', 2661886::bigint, 'country', NULL::text),
    (2664870::bigint, 'Värmland County', NULL::jsonb, '17', 2661886::bigint, 'country', NULL::text),
    (2666218::bigint, 'Uppsala County', NULL::jsonb, '03', 2661886::bigint, 'country', NULL::text),
    (2673722::bigint, 'Stockholm County', NULL::jsonb, '01', 2661886::bigint, 'country', NULL::text),
    (2676207::bigint, 'Södermanland County', NULL::jsonb, '04', 2661886::bigint, 'country', NULL::text),
    (2685867::bigint, 'Östergötland County', NULL::jsonb, '05', 2661886::bigint, 'country', NULL::text),
    (2686655::bigint, 'Örebro County', NULL::jsonb, '18', 2661886::bigint, 'country', NULL::text),
    (2699050::bigint, 'Kronoberg County', NULL::jsonb, '07', 2661886::bigint, 'country', NULL::text),
    (2699767::bigint, 'Dalarna County', NULL::jsonb, '20', 2661886::bigint, 'country', NULL::text),
    (2702259::bigint, 'Kalmar County', NULL::jsonb, '08', 2661886::bigint, 'country', NULL::text),
    (2702976::bigint, 'Jönköping County', NULL::jsonb, '06', 2661886::bigint, 'country', NULL::text),
    (2703330::bigint, 'Jämtland County', NULL::jsonb, '23', 2661886::bigint, 'country', NULL::text),
    (2708794::bigint, 'Halland County', NULL::jsonb, '13', 2661886::bigint, 'country', NULL::text),
    (2711508::bigint, 'Gotland County', NULL::jsonb, '09', 2661886::bigint, 'country', NULL::text),
    (2712411::bigint, 'Gävleborg County', NULL::jsonb, '21', 2661886::bigint, 'country', NULL::text),
    (2721357::bigint, 'Blekinge County', NULL::jsonb, '10', 2661886::bigint, 'country', NULL::text),
    (3337385::bigint, 'Skåne County', NULL::jsonb, '12', 2661886::bigint, 'country', NULL::text),
    (3337386::bigint, 'Västra Götaland County', NULL::jsonb, '14', 2661886::bigint, 'country', NULL::text)
) AS v(geonames_id, name, name_i18n, external_code, parent_geonames_id, parent_type, parent_external_code)
JOIN public.locations p
  ON p.country_code = 'SE'
 AND p.type = v.parent_type::public.location_type
 AND p.geonames_id = v.parent_geonames_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.locations l WHERE l.geonames_id = v.geonames_id
);

-- Municipalities (290).
INSERT INTO public.locations (geonames_id, name, name_i18n, type, parent_id, country_code, external_code)
SELECT v.geonames_id, v.name, v.name_i18n, 'municipality', p.id, 'SE', v.external_code
FROM (VALUES
    (602149::bigint, 'Umeå Kommun', NULL::jsonb, '2480', 2664415::bigint, 'region', '24'),
    (602912::bigint, 'Skellefteå Kommun', NULL::jsonb, '2482', 2664415::bigint, 'region', '24'),
    (603302::bigint, 'Robertsfors Kommun', NULL::jsonb, '2409', 2664415::bigint, 'region', '24'),
    (603569::bigint, 'Piteå Kommun', NULL::jsonb, '2581', 604010::bigint, 'region', '25'),
    (603760::bigint, 'Pajala Kommun', NULL::jsonb, '2521', 604010::bigint, 'region', '25'),
    (603813::bigint, 'Övertorneå Kommun', NULL::jsonb, '2518', 604010::bigint, 'region', '25'),
    (603822::bigint, 'Överkalix Kommun', NULL::jsonb, '2513', 604010::bigint, 'region', '25'),
    (604488::bigint, 'Luleå kommun', NULL::jsonb, '2580', 604010::bigint, 'region', '25'),
    (605387::bigint, 'Kalix Kommun', NULL::jsonb, '2514', 604010::bigint, 'region', '25'),
    (605857::bigint, 'Haparanda Kommun', NULL::jsonb, '2583', 604010::bigint, 'region', '25'),
    (606084::bigint, 'Gällivare kommun', NULL::jsonb, '2523', 604010::bigint, 'region', '25'),
    (606530::bigint, 'Bodens Kommun', NULL::jsonb, '2582', 604010::bigint, 'region', '25'),
    (606833::bigint, 'Älvsbyns Kommun', NULL::jsonb, '2560', 604010::bigint, 'region', '25'),
    (2662148::bigint, 'Ystads Kommun', NULL::jsonb, '1286', 3337385::bigint, 'region', '12'),
    (2662215::bigint, 'Ydre Kommun', NULL::jsonb, '0512', 2685867::bigint, 'region', '05'),
    (2662828::bigint, 'Vingåkers Kommun', NULL::jsonb, '0428', 2676207::bigint, 'region', '04'),
    (2662850::bigint, 'Vindelns Kommun', NULL::jsonb, '2404', 2664415::bigint, 'region', '24'),
    (2662880::bigint, 'Vimmerby Kommun', NULL::jsonb, '0884', 2702259::bigint, 'region', '08'),
    (2662934::bigint, 'Vilhelmina Kommun', NULL::jsonb, '2462', 2664415::bigint, 'region', '24'),
    (2663292::bigint, 'Vetlanda kommun', NULL::jsonb, '0685', 2702976::bigint, 'region', '06'),
    (2663398::bigint, 'Vellinge Kommun', NULL::jsonb, '1233', 3337385::bigint, 'region', '12'),
    (2663535::bigint, 'Växjö Kommun', NULL::jsonb, '0780', 2699050::bigint, 'region', '07'),
    (2663537::bigint, 'Vaxholms Kommun', NULL::jsonb, '0187', 2673722::bigint, 'region', '01'),
    (2664201::bigint, 'Västerviks Kommun', NULL::jsonb, '0883', 2702259::bigint, 'region', '08'),
    (2664441::bigint, 'Västerås', NULL::jsonb, '1980', 2664179::bigint, 'region', '19'),
    (2664852::bigint, 'Värnamo Kommun', NULL::jsonb, '0683', 2702976::bigint, 'region', '06'),
    (2664880::bigint, 'Värmdö Kommun', NULL::jsonb, '0120', 2673722::bigint, 'region', '01'),
    (2664938::bigint, 'Vårgårda Kommun', NULL::jsonb, '1442', 3337386::bigint, 'region', '14'),
    (2664994::bigint, 'Varbergs Kommun', NULL::jsonb, '1383', 2708794::bigint, 'region', '13'),
    (2665011::bigint, 'Vara Kommun', NULL::jsonb, '1470', 3337386::bigint, 'region', '14'),
    (2665061::bigint, 'Vansbro Kommun', NULL::jsonb, '2021', 2699767::bigint, 'region', '20'),
    (2665089::bigint, 'Vännäs Kommun', NULL::jsonb, '2460', 2664415::bigint, 'region', '24'),
    (2665170::bigint, 'Vänersborgs Kommun', NULL::jsonb, '1487', 3337386::bigint, 'region', '14'),
    (2665451::bigint, 'Vallentuna Kommun', NULL::jsonb, '0115', 2673722::bigint, 'region', '01'),
    (2665672::bigint, 'Valdemarsviks Kommun', NULL::jsonb, '0563', 2685867::bigint, 'region', '05'),
    (2665856::bigint, 'Vaggeryds Kommun', NULL::jsonb, '0665', 2702976::bigint, 'region', '06'),
    (2665901::bigint, 'Vadstena Kommun', NULL::jsonb, '0584', 2685867::bigint, 'region', '05'),
    (2666201::bigint, 'Uppvidinge Kommun', NULL::jsonb, '0760', 2699050::bigint, 'region', '07'),
    (2666219::bigint, 'Uppsala Kommun', NULL::jsonb, '0380', 2666218::bigint, 'region', '03'),
    (2666237::bigint, 'Upplands Väsby kommun', NULL::jsonb, '0114', 2673722::bigint, 'region', '01'),
    (2666240::bigint, 'Upplands-Bro Kommun', NULL::jsonb, '0139', 2673722::bigint, 'region', '01'),
    (2666492::bigint, 'Ulricehamns Kommun', NULL::jsonb, '1491', 3337386::bigint, 'region', '14'),
    (2666669::bigint, 'Uddevalla Kommun', NULL::jsonb, '1485', 3337386::bigint, 'region', '14'),
    (2666778::bigint, 'Tyresö Kommun', NULL::jsonb, '0138', 2673722::bigint, 'region', '01'),
    (2667302::bigint, 'Trollhättan', NULL::jsonb, '1488', 3337386::bigint, 'region', '14'),
    (2667401::bigint, 'Trelleborgs Kommun', NULL::jsonb, '1287', 3337385::bigint, 'region', '12'),
    (2667598::bigint, 'Tranemo Kommun', NULL::jsonb, '1452', 3337386::bigint, 'region', '14'),
    (2667625::bigint, 'Tranås Kommun', NULL::jsonb, '0687', 2702976::bigint, 'region', '06'),
    (2667872::bigint, 'Torsby Kommun', NULL::jsonb, '1737', 2664870::bigint, 'region', '17'),
    (2667902::bigint, 'Torsås Kommun', NULL::jsonb, '0834', 2702259::bigint, 'region', '08'),
    (2668246::bigint, 'Töreboda Kommun', NULL::jsonb, '1473', 3337386::bigint, 'region', '14'),
    (2668364::bigint, 'Tomelilla Kommun', NULL::jsonb, '1270', 3337385::bigint, 'region', '12'),
    (2668674::bigint, 'Tjörns Kommun', NULL::jsonb, '1419', 3337386::bigint, 'region', '14'),
    (2669018::bigint, 'Tingsryds Kommun', NULL::jsonb, '0763', 2699050::bigint, 'region', '07'),
    (2669046::bigint, 'Timrå Kommun', NULL::jsonb, '2262', 2664292::bigint, 'region', '22'),
    (2669097::bigint, 'Tierps kommun', NULL::jsonb, '0360', 2666218::bigint, 'region', '03'),
    (2669112::bigint, 'Tidaholms kommun', NULL::jsonb, '1498', 3337386::bigint, 'region', '14'),
    (2669117::bigint, 'Tibro Kommun', NULL::jsonb, '1472', 3337386::bigint, 'region', '14'),
    (2669414::bigint, 'Tanums Kommun', NULL::jsonb, '1435', 3337386::bigint, 'region', '14'),
    (2669768::bigint, 'Täby Kommun', NULL::jsonb, '0160', 2673722::bigint, 'region', '01'),
    (2670043::bigint, 'Svenljunga Kommun', NULL::jsonb, '1465', 3337386::bigint, 'region', '14'),
    (2670127::bigint, 'Svedala Kommun', NULL::jsonb, '1263', 3337385::bigint, 'region', '12'),
    (2670540::bigint, 'Svalövs Kommun', NULL::jsonb, '1214', 3337385::bigint, 'region', '12'),
    (2670612::bigint, 'Surahammars Kommun', NULL::jsonb, '1907', 2664179::bigint, 'region', '19'),
    (2670703::bigint, 'Sunne Kommun', NULL::jsonb, '1766', 2664870::bigint, 'region', '17'),
    (2670776::bigint, 'Sundsvalls Kommun', NULL::jsonb, '2281', 2664292::bigint, 'region', '22'),
    (2670878::bigint, 'Sundbybergs Kommun', NULL::jsonb, '0183', 2673722::bigint, 'region', '01'),
    (2671219::bigint, 'Strömsunds kommun', NULL::jsonb, '2313', 2703330::bigint, 'region', '23'),
    (2671222::bigint, 'Strömstads Kommun', NULL::jsonb, '1486', 3337386::bigint, 'region', '14'),
    (2671389::bigint, 'Strängnäs Kommun', NULL::jsonb, '0486', 2676207::bigint, 'region', '04'),
    (2671529::bigint, 'Storumans kommun', NULL::jsonb, '2421', 2664415::bigint, 'region', '24'),
    (2672047::bigint, 'Storfors Kommun', NULL::jsonb, '1760', 2664870::bigint, 'region', '17'),
    (2673723::bigint, 'Stockholms Kommun', NULL::jsonb, '0180', 2673722::bigint, 'region', '01'),
    (2673874::bigint, 'Stenungsunds Kommun', NULL::jsonb, '1415', 3337386::bigint, 'region', '14'),
    (2674647::bigint, 'Staffanstorps Kommun', NULL::jsonb, '1230', 3337385::bigint, 'region', '12'),
    (2674968::bigint, 'Sotenäs Kommun', NULL::jsonb, '1427', 3337386::bigint, 'region', '14'),
    (2675078::bigint, 'Sorsele kommun', NULL::jsonb, '2422', 2664415::bigint, 'region', '24'),
    (2675364::bigint, 'Sölvesborgs kommun', NULL::jsonb, '1083', 2721357::bigint, 'region', '10'),
    (2675396::bigint, 'Solna Kommun', NULL::jsonb, '0184', 2673722::bigint, 'region', '01'),
    (2675406::bigint, 'Sollentuna Kommun', NULL::jsonb, '0163', 2673722::bigint, 'region', '01'),
    (2675415::bigint, 'Sollefteå Kommun', NULL::jsonb, '2283', 2664292::bigint, 'region', '22'),
    (2676174::bigint, 'Södertälje Kommun', NULL::jsonb, '0181', 2673722::bigint, 'region', '01'),
    (2676214::bigint, 'Söderköpings Kommun', NULL::jsonb, '0582', 2685867::bigint, 'region', '05'),
    (2676222::bigint, 'Söderhamns Kommun', NULL::jsonb, '2182', 2712411::bigint, 'region', '21'),
    (2676585::bigint, 'Smedjebackens Kommun', NULL::jsonb, '2061', 2699767::bigint, 'region', '20'),
    (2677024::bigint, 'Skurups Kommun', NULL::jsonb, '1264', 3337385::bigint, 'region', '12'),
    (2677233::bigint, 'Skövde Kommun', NULL::jsonb, '1496', 3337386::bigint, 'region', '14'),
    (2677592::bigint, 'Skinnskattebergs Kommun', NULL::jsonb, '1904', 2664179::bigint, 'region', '19'),
    (2678205::bigint, 'Skara Kommun', NULL::jsonb, '1495', 3337386::bigint, 'region', '14'),
    (2678902::bigint, 'Sjöbo Kommun', NULL::jsonb, '1265', 3337385::bigint, 'region', '12'),
    (2679106::bigint, 'Simrishamns kommun', NULL::jsonb, '1291', 3337385::bigint, 'region', '12'),
    (2679300::bigint, 'Sigtuna Kommun', NULL::jsonb, '0191', 2673722::bigint, 'region', '01'),
    (2679696::bigint, 'Sävsjö Kommun', NULL::jsonb, '0684', 2702976::bigint, 'region', '06'),
    (2679832::bigint, 'Säters Kommun', NULL::jsonb, '2082', 2699767::bigint, 'region', '20'),
    (2680068::bigint, 'Sandvikens Kommun', NULL::jsonb, '2181', 2712411::bigint, 'region', '21'),
    (2680623::bigint, 'Salems Kommun', NULL::jsonb, '0128', 2673722::bigint, 'region', '01'),
    (2680657::bigint, 'Sala kommun', NULL::jsonb, '1981', 2664179::bigint, 'region', '19'),
    (2680762::bigint, 'Säffle Kommun', NULL::jsonb, '1785', 2664870::bigint, 'region', '17'),
    (2681821::bigint, 'Ronneby Kommun', NULL::jsonb, '1081', 2721357::bigint, 'region', '10'),
    (2682993::bigint, 'Rättviks Kommun', NULL::jsonb, '2031', 2699767::bigint, 'region', '20'),
    (2683605::bigint, 'Ragunda Kommun', NULL::jsonb, '2303', 2703330::bigint, 'region', '23'),
    (2684202::bigint, 'Perstorps Kommun', NULL::jsonb, '1275', 3337385::bigint, 'region', '12'),
    (2684394::bigint, 'Partille Kommun', NULL::jsonb, '1402', 3337386::bigint, 'region', '14'),
    (2684652::bigint, 'Oxelösunds Kommun', NULL::jsonb, '0481', 2676207::bigint, 'region', '04'),
    (2685092::bigint, 'Ovanåkers Kommun', NULL::jsonb, '2121', 2712411::bigint, 'region', '21'),
    (2685543::bigint, 'Östra Göinge Kommun', NULL::jsonb, '1256', 3337385::bigint, 'region', '12'),
    (2685697::bigint, 'Östhammars Kommun', NULL::jsonb, '0382', 2666218::bigint, 'region', '03'),
    (2685747::bigint, 'Östersunds Kommun', NULL::jsonb, '2380', 2703330::bigint, 'region', '23'),
    (2685981::bigint, 'Österåkers Kommun', NULL::jsonb, '0117', 2673722::bigint, 'region', '01'),
    (2686161::bigint, 'Oskarshamns Kommun', NULL::jsonb, '0882', 2702259::bigint, 'region', '08'),
    (2686197::bigint, 'Osby kommun', NULL::jsonb, '1273', 3337385::bigint, 'region', '12'),
    (2686246::bigint, 'Orust', NULL::jsonb, '1421', 3337386::bigint, 'region', '14'),
    (2686378::bigint, 'Orsa Kommun', NULL::jsonb, '2034', 2699767::bigint, 'region', '20'),
    (2686466::bigint, 'Örnsköldsviks Kommun', NULL::jsonb, '2284', 2664292::bigint, 'region', '22'),
    (2686595::bigint, 'Örkelljunga Kommun', NULL::jsonb, '1257', 3337385::bigint, 'region', '12'),
    (2686656::bigint, 'Örebro Kommun', NULL::jsonb, '1880', 2686655::bigint, 'region', '18'),
    (2687061::bigint, 'Olofströms Kommun', NULL::jsonb, '1060', 2721357::bigint, 'region', '10'),
    (2687419::bigint, 'Ödeshögs Kommun', NULL::jsonb, '0509', 2685867::bigint, 'region', '05'),
    (2687508::bigint, 'Öckerö Kommun', NULL::jsonb, '1407', 3337386::bigint, 'region', '14'),
    (2687516::bigint, 'Ockelbo Kommun', NULL::jsonb, '2101', 2712411::bigint, 'region', '21'),
    (2687635::bigint, 'Nynäshamns kommun', NULL::jsonb, '0192', 2673722::bigint, 'region', '01'),
    (2687698::bigint, 'Nyköpings Kommun', NULL::jsonb, '0480', 2676207::bigint, 'region', '04'),
    (2687897::bigint, 'Nybro Kommun', NULL::jsonb, '0881', 2702259::bigint, 'region', '08'),
    (2688170::bigint, 'Norsjö Kommun', NULL::jsonb, '2417', 2664415::bigint, 'region', '24'),
    (2688248::bigint, 'Norrtälje Kommun', NULL::jsonb, '0188', 2673722::bigint, 'region', '01'),
    (2688367::bigint, 'Norrköpings Kommun', NULL::jsonb, '0581', 2685867::bigint, 'region', '05'),
    (2689334::bigint, 'Nordmalings Kommun', NULL::jsonb, '2401', 2664415::bigint, 'region', '24'),
    (2689383::bigint, 'Nordanstigs kommun', NULL::jsonb, '2132', 2712411::bigint, 'region', '21'),
    (2689450::bigint, 'Norbergs Kommun', NULL::jsonb, '1962', 2664179::bigint, 'region', '19'),
    (2689465::bigint, 'Nora Kommun', NULL::jsonb, '1884', 2686655::bigint, 'region', '18'),
    (2690167::bigint, 'Nässjö Kommun', NULL::jsonb, '0682', 2702976::bigint, 'region', '06'),
    (2690578::bigint, 'Nacka Kommun', NULL::jsonb, '0182', 2673722::bigint, 'region', '01'),
    (2690828::bigint, 'Munkfors Kommun', NULL::jsonb, '1762', 2664870::bigint, 'region', '17'),
    (2690840::bigint, 'Munkedals Kommun', NULL::jsonb, '1430', 3337386::bigint, 'region', '14'),
    (2690899::bigint, 'Mullsjö kommun', NULL::jsonb, '0642', 2702976::bigint, 'region', '06'),
    (2690959::bigint, 'Motala Kommun', NULL::jsonb, '0583', 2685867::bigint, 'region', '05'),
    (2691347::bigint, 'Mörbylånga Kommun', NULL::jsonb, '0840', 2702259::bigint, 'region', '08'),
    (2691395::bigint, 'Mora Kommun', NULL::jsonb, '2062', 2699767::bigint, 'region', '20'),
    (2691406::bigint, 'Mönsterås Kommun', NULL::jsonb, '0861', 2702259::bigint, 'region', '08'),
    (2691457::bigint, 'Mölndals kommun', NULL::jsonb, '1481', 3337386::bigint, 'region', '14'),
    (2691742::bigint, 'Mjölby Kommun', NULL::jsonb, '0586', 2685867::bigint, 'region', '05'),
    (2692047::bigint, 'Melleruds Kommun', NULL::jsonb, '1461', 3337386::bigint, 'region', '14'),
    (2692570::bigint, 'Marks Kommun', NULL::jsonb, '1463', 3337386::bigint, 'region', '14'),
    (2692595::bigint, 'Markaryds Kommun', NULL::jsonb, '0767', 2699050::bigint, 'region', '07'),
    (2692611::bigint, 'Mariestads Kommun', NULL::jsonb, '1493', 3337386::bigint, 'region', '14'),
    (2692868::bigint, 'Malung-Sälens kommun', NULL::jsonb, '2023', 2699767::bigint, 'region', '20'),
    (2692965::bigint, 'Malmö', NULL::jsonb, '1280', 3337385::bigint, 'region', '12'),
    (2693147::bigint, 'Malå Kommun', NULL::jsonb, '2418', 2664415::bigint, 'region', '24'),
    (2693300::bigint, 'Lysekils Kommun', NULL::jsonb, '1484', 3337386::bigint, 'region', '14'),
    (2693346::bigint, 'Lycksele kommun', NULL::jsonb, '2481', 2664415::bigint, 'region', '24'),
    (2693555::bigint, 'Lunds Kommun', NULL::jsonb, '1281', 3337385::bigint, 'region', '12'),
    (2693757::bigint, 'Ludvika Kommun', NULL::jsonb, '2085', 2699767::bigint, 'region', '20'),
    (2694260::bigint, 'Lomma Kommun', NULL::jsonb, '1262', 3337385::bigint, 'region', '12'),
    (2694483::bigint, 'Ljusnarsbergs Kommun', NULL::jsonb, '1864', 2686655::bigint, 'region', '18'),
    (2694502::bigint, 'Ljusdals Kommun', NULL::jsonb, '2161', 2712411::bigint, 'region', '21'),
    (2694551::bigint, 'Ljungby Kommun', NULL::jsonb, '0781', 2699050::bigint, 'region', '07'),
    (2694759::bigint, 'Linköpings Kommun', NULL::jsonb, '0580', 2685867::bigint, 'region', '05'),
    (2694892::bigint, 'Lindesbergs Kommun', NULL::jsonb, '1885', 2686655::bigint, 'region', '18'),
    (2696058::bigint, 'Lilla Edets Kommun', NULL::jsonb, '1462', 3337386::bigint, 'region', '14'),
    (2696328::bigint, 'Lidköpings Kommun', NULL::jsonb, '1494', 3337386::bigint, 'region', '14'),
    (2696332::bigint, 'Lidingö', NULL::jsonb, '0186', 2673722::bigint, 'region', '01'),
    (2696471::bigint, 'Lessebo Kommun', NULL::jsonb, '0761', 2699050::bigint, 'region', '07'),
    (2696500::bigint, 'Lerums Kommun', NULL::jsonb, '1441', 3337386::bigint, 'region', '14'),
    (2696649::bigint, 'Leksands kommun', NULL::jsonb, '2029', 2699767::bigint, 'region', '20'),
    (2696803::bigint, 'Laxå Kommun', NULL::jsonb, '1860', 2686655::bigint, 'region', '18'),
    (2697719::bigint, 'Landskrona', NULL::jsonb, '1282', 3337385::bigint, 'region', '12'),
    (2697859::bigint, 'Laholms Kommun', NULL::jsonb, '1381', 2708794::bigint, 'region', '13'),
    (2698680::bigint, 'Kungsörs kommun', NULL::jsonb, '1960', 2664179::bigint, 'region', '19'),
    (2698726::bigint, 'Kungsbacka Kommun', NULL::jsonb, '1384', 2708794::bigint, 'region', '13'),
    (2698738::bigint, 'Kungälvs Kommun', NULL::jsonb, '1482', 3337386::bigint, 'region', '14'),
    (2698753::bigint, 'Kumla Kommun', NULL::jsonb, '1881', 2686655::bigint, 'region', '18'),
    (2699175::bigint, 'Krokoms Kommun', NULL::jsonb, '2309', 2703330::bigint, 'region', '23'),
    (2699281::bigint, 'Kristinehamns Kommun', NULL::jsonb, '1781', 2664870::bigint, 'region', '17'),
    (2699308::bigint, 'Kristianstads kommun', NULL::jsonb, '1290', 3337385::bigint, 'region', '12'),
    (2699393::bigint, 'Kramfors Kommun', NULL::jsonb, '2282', 2664292::bigint, 'region', '22'),
    (2699780::bigint, 'Köpings Kommun', NULL::jsonb, '1983', 2664179::bigint, 'region', '19'),
    (2700483::bigint, 'Klippans Kommun', NULL::jsonb, '1276', 3337385::bigint, 'region', '12'),
    (2700801::bigint, 'Kiruna Kommun', NULL::jsonb, '2584', 604010::bigint, 'region', '25'),
    (2700854::bigint, 'Kinda Kommun', NULL::jsonb, '0513', 2685867::bigint, 'region', '05'),
    (2700878::bigint, 'Kils Kommun', NULL::jsonb, '1715', 2664870::bigint, 'region', '17'),
    (2701094::bigint, 'Kävlinge Kommun', NULL::jsonb, '1261', 3337385::bigint, 'region', '12'),
    (2701221::bigint, 'Katrineholms Kommun', NULL::jsonb, '0483', 2676207::bigint, 'region', '04'),
    (2701679::bigint, 'Karlstads Kommun', NULL::jsonb, '1780', 2664870::bigint, 'region', '17'),
    (2701712::bigint, 'Karlskrona Kommun', NULL::jsonb, '1080', 2721357::bigint, 'region', '10'),
    (2701714::bigint, 'Karlskoga Kommun', NULL::jsonb, '1883', 2686655::bigint, 'region', '18'),
    (2701725::bigint, 'Karlshamns kommun', NULL::jsonb, '1082', 2721357::bigint, 'region', '10'),
    (2701754::bigint, 'Karlsborgs Kommun', NULL::jsonb, '1446', 3337386::bigint, 'region', '14'),
    (2702260::bigint, 'Kalmar Kommun', NULL::jsonb, '0880', 2702259::bigint, 'region', '08'),
    (2702977::bigint, 'Jönköpings Kommun', NULL::jsonb, '0680', 2702976::bigint, 'region', '06'),
    (2702996::bigint, 'Jokkmokks Kommun', NULL::jsonb, '2510', 604010::bigint, 'region', '25'),
    (2703292::bigint, 'Järfälla kommun', NULL::jsonb, '0123', 2673722::bigint, 'region', '01'),
    (2704007::bigint, 'Hylte Kommun', NULL::jsonb, '1315', 2708794::bigint, 'region', '13'),
    (2704397::bigint, 'Hultsfreds Kommun', NULL::jsonb, '0860', 2702259::bigint, 'region', '08'),
    (2704611::bigint, 'Hudiksvalls Kommun', NULL::jsonb, '2184', 2712411::bigint, 'region', '21'),
    (2704619::bigint, 'Huddinge Kommun', NULL::jsonb, '0126', 2673722::bigint, 'region', '01'),
    (2705046::bigint, 'Hörby Kommun', NULL::jsonb, '1266', 3337385::bigint, 'region', '12'),
    (2705054::bigint, 'Höörs Kommun', NULL::jsonb, '1267', 3337385::bigint, 'region', '12'),
    (2705716::bigint, 'Högsby Kommun', NULL::jsonb, '0821', 2702259::bigint, 'region', '08'),
    (2706001::bigint, 'Höganäs Kommun', NULL::jsonb, '1284', 3337385::bigint, 'region', '12'),
    (2706055::bigint, 'Hofors Kommun', NULL::jsonb, '2104', 2712411::bigint, 'region', '21'),
    (2706183::bigint, 'Hjo Kommun', NULL::jsonb, '1497', 3337386::bigint, 'region', '14'),
    (2706522::bigint, 'Herrljunga Kommun', NULL::jsonb, '1466', 3337386::bigint, 'region', '14'),
    (2706766::bigint, 'Helsingborg', NULL::jsonb, '1283', 3337385::bigint, 'region', '12'),
    (2706981::bigint, 'Hedemora Kommun', NULL::jsonb, '2083', 2699767::bigint, 'region', '20'),
    (2707055::bigint, 'Heby kommun', NULL::jsonb, '0331', 2666218::bigint, 'region', '03'),
    (2707396::bigint, 'Hässleholms Kommun', NULL::jsonb, '1293', 3337385::bigint, 'region', '12'),
    (2707608::bigint, 'Härryda Kommun', NULL::jsonb, '1401', 3337386::bigint, 'region', '14'),
    (2707682::bigint, 'Härnösands Kommun', NULL::jsonb, '2280', 2664292::bigint, 'region', '22'),
    (2707737::bigint, 'Härjedalens kommun', NULL::jsonb, '2361', 2703330::bigint, 'region', '23'),
    (2707952::bigint, 'Haninge Kommun', NULL::jsonb, '0136', 2673722::bigint, 'region', '01'),
    (2708180::bigint, 'Hammarö Kommun', NULL::jsonb, '1761', 2664870::bigint, 'region', '17'),
    (2708363::bigint, 'Halmstads Kommun', NULL::jsonb, '1380', 2708794::bigint, 'region', '13'),
    (2708428::bigint, 'Hallstahammars Kommun', NULL::jsonb, '1961', 2664179::bigint, 'region', '19'),
    (2708508::bigint, 'Hallsbergs Kommun', NULL::jsonb, '1861', 2686655::bigint, 'region', '18'),
    (2708664::bigint, 'Hällefors Kommun', NULL::jsonb, '1863', 2686655::bigint, 'region', '18'),
    (2709213::bigint, 'Hagfors Kommun', NULL::jsonb, '1783', 2664870::bigint, 'region', '17'),
    (2709491::bigint, 'Håbo kommun', NULL::jsonb, '0305', 2666218::bigint, 'region', '03'),
    (2709492::bigint, 'Habo Kommun', NULL::jsonb, '0643', 2702976::bigint, 'region', '06'),
    (2709910::bigint, 'Gullspångs Kommun', NULL::jsonb, '1447', 3337386::bigint, 'region', '14'),
    (2710341::bigint, 'Grums Kommun', NULL::jsonb, '1764', 2664870::bigint, 'region', '17'),
    (2710884::bigint, 'Grästorps Kommun', NULL::jsonb, '1444', 3337386::bigint, 'region', '14'),
    (2711509::bigint, 'Gotland', NULL::jsonb, '0980', 2711508::bigint, 'region', '09'),
    (2711525::bigint, 'Götene Kommun', NULL::jsonb, '1471', 3337386::bigint, 'region', '14'),
    (2711533::bigint, 'Göteborgs stad', NULL::jsonb, '1480', 3337386::bigint, 'region', '14'),
    (2711789::bigint, 'Gnosjö Kommun', NULL::jsonb, '0617', 2702976::bigint, 'region', '06'),
    (2712044::bigint, 'Gislaveds Kommun', NULL::jsonb, '0662', 2702976::bigint, 'region', '06'),
    (2712409::bigint, 'Gävle Kommun', NULL::jsonb, '2180', 2712411::bigint, 'region', '21'),
    (2713217::bigint, 'Gagnefs Kommun', NULL::jsonb, '2026', 2699767::bigint, 'region', '20'),
    (2713969::bigint, 'Forshaga Kommun', NULL::jsonb, '1763', 2664870::bigint, 'region', '17'),
    (2714388::bigint, 'Flens Kommun', NULL::jsonb, '0482', 2676207::bigint, 'region', '04'),
    (2714901::bigint, 'Finspångs Kommun', NULL::jsonb, '0562', 2685867::bigint, 'region', '05'),
    (2715080::bigint, 'Filipstads Kommun', NULL::jsonb, '1782', 2664870::bigint, 'region', '17'),
    (2715350::bigint, 'Färgelanda Kommun', NULL::jsonb, '1439', 3337386::bigint, 'region', '14'),
    (2715458::bigint, 'Falu kommun', NULL::jsonb, '2080', 2699767::bigint, 'region', '20'),
    (2715566::bigint, 'Falköpings Kommun', NULL::jsonb, '1499', 3337386::bigint, 'region', '14'),
    (2715572::bigint, 'Falkenbergs Kommun', NULL::jsonb, '1382', 2708794::bigint, 'region', '13'),
    (2715650::bigint, 'Fagersta Kommun', NULL::jsonb, '1982', 2664179::bigint, 'region', '19'),
    (2715929::bigint, 'Essunga Kommun', NULL::jsonb, '1445', 3337386::bigint, 'region', '14'),
    (2715945::bigint, 'Eslövs Kommun', NULL::jsonb, '1285', 3337385::bigint, 'region', '12'),
    (2715951::bigint, 'Eskilstuna Kommun', NULL::jsonb, '0484', 2676207::bigint, 'region', '04'),
    (2716165::bigint, 'Enköpings Kommun', NULL::jsonb, '0381', 2666218::bigint, 'region', '03'),
    (2716280::bigint, 'Emmaboda Kommun', NULL::jsonb, '0862', 2702259::bigint, 'region', '08'),
    (2716433::bigint, 'Eksjö Kommun', NULL::jsonb, '0686', 2702976::bigint, 'region', '06'),
    (2716579::bigint, 'Ekerö Kommun', NULL::jsonb, '0125', 2673722::bigint, 'region', '01'),
    (2716958::bigint, 'Eda kommun', NULL::jsonb, '1730', 2664870::bigint, 'region', '17'),
    (2717400::bigint, 'Dorotea Kommun', NULL::jsonb, '2425', 2664415::bigint, 'region', '24'),
    (2717881::bigint, 'Degerfors Kommun', NULL::jsonb, '1862', 2686655::bigint, 'region', '18'),
    (2717999::bigint, 'Danderyds Kommun', NULL::jsonb, '0162', 2673722::bigint, 'region', '01'),
    (2718152::bigint, 'Dals-Ed Kommun', NULL::jsonb, '1438', 3337386::bigint, 'region', '14'),
    (2718706::bigint, 'Burlövs Kommun', NULL::jsonb, '1231', 3337385::bigint, 'region', '12'),
    (2719105::bigint, 'Bromölla Kommun', NULL::jsonb, '1272', 3337385::bigint, 'region', '12'),
    (2720000::bigint, 'Bräcke Kommun', NULL::jsonb, '2305', 2703330::bigint, 'region', '23'),
    (2720036::bigint, 'Boxholms Kommun', NULL::jsonb, '0560', 2685867::bigint, 'region', '05'),
    (2720114::bigint, 'Botkyrka Kommun', NULL::jsonb, '0127', 2673722::bigint, 'region', '01'),
    (2720382::bigint, 'Borlänge Kommun', NULL::jsonb, '2081', 2699767::bigint, 'region', '20'),
    (2720436::bigint, 'Borgholms Kommun', NULL::jsonb, '0885', 2702259::bigint, 'region', '08'),
    (2720496::bigint, 'Borås', NULL::jsonb, '1490', 3337386::bigint, 'region', '14'),
    (2720678::bigint, 'Bollnäs Kommun', NULL::jsonb, '2183', 2712411::bigint, 'region', '21'),
    (2721533::bigint, 'Bjuvs Kommun', NULL::jsonb, '1260', 3337385::bigint, 'region', '12'),
    (2721584::bigint, 'Bjurholms Kommun', NULL::jsonb, '2403', 2664415::bigint, 'region', '24'),
    (2722709::bigint, 'Bergs Kommun', NULL::jsonb, '2326', 2703330::bigint, 'region', '23'),
    (2723078::bigint, 'Bengtsfors Kommun', NULL::jsonb, '1460', 3337386::bigint, 'region', '14'),
    (2723286::bigint, 'Båstads Kommun', NULL::jsonb, '1278', 3337385::bigint, 'region', '12'),
    (2724230::bigint, 'Avesta Kommun', NULL::jsonb, '2084', 2699767::bigint, 'region', '20'),
    (2724320::bigint, 'Åtvidabergs Kommun', NULL::jsonb, '0561', 2685867::bigint, 'region', '05'),
    (2724424::bigint, 'Åstorps Kommun', NULL::jsonb, '1277', 3337385::bigint, 'region', '12'),
    (2724776::bigint, 'Askersunds Kommun', NULL::jsonb, '1882', 2686655::bigint, 'region', '18'),
    (2724956::bigint, 'Åsele Kommun', NULL::jsonb, '2463', 2664415::bigint, 'region', '24'),
    (2725122::bigint, 'Arvika Kommun', NULL::jsonb, '1784', 2664870::bigint, 'region', '17'),
    (2725134::bigint, 'Arvidsjaurs Kommun', NULL::jsonb, '2505', 604010::bigint, 'region', '25'),
    (2725371::bigint, 'Arjeplogs Kommun', NULL::jsonb, '2506', 604010::bigint, 'region', '25'),
    (2725378::bigint, 'Årjängs Kommun', NULL::jsonb, '1765', 2664870::bigint, 'region', '17'),
    (2725422::bigint, 'Åre kommun', NULL::jsonb, '2321', 2703330::bigint, 'region', '23'),
    (2725469::bigint, 'Arboga Kommun', NULL::jsonb, '1984', 2664179::bigint, 'region', '19'),
    (2725898::bigint, 'Ängelholms Kommun', NULL::jsonb, '1292', 3337385::bigint, 'region', '12'),
    (2725906::bigint, 'Ånge kommun', NULL::jsonb, '2260', 2664292::bigint, 'region', '22'),
    (2726004::bigint, 'Aneby Kommun', NULL::jsonb, '0604', 2702976::bigint, 'region', '06'),
    (2726237::bigint, 'Åmåls Kommun', NULL::jsonb, '1492', 3337386::bigint, 'region', '14'),
    (2726284::bigint, 'Älvkarleby Kommun', NULL::jsonb, '0319', 2666218::bigint, 'region', '03'),
    (2726306::bigint, 'Alvesta Kommun', NULL::jsonb, '0764', 2699050::bigint, 'region', '07'),
    (2726330::bigint, 'Älvdalens kommun', NULL::jsonb, '2039', 2699767::bigint, 'region', '20'),
    (2726568::bigint, 'Älmhults Kommun', NULL::jsonb, '0765', 2699050::bigint, 'region', '07'),
    (2726755::bigint, 'Alingsås Kommun', NULL::jsonb, '1489', 3337386::bigint, 'region', '14'),
    (2726973::bigint, 'Ale Kommun', NULL::jsonb, '1440', 3337386::bigint, 'region', '14'),
    (3315140::bigint, 'Gnesta Kommun', NULL::jsonb, '0461', 2676207::bigint, 'region', '04'),
    (3315141::bigint, 'Trosa Kommun', NULL::jsonb, '0488', 2676207::bigint, 'region', '04'),
    (3337384::bigint, 'Knivsta muncipality', NULL::jsonb, '0330', 2666218::bigint, 'region', '03'),
    (3337401::bigint, 'Bollebygds Kommun', NULL::jsonb, '1443', 3337386::bigint, 'region', '14'),
    (3337402::bigint, 'Lekebergs Kommun', NULL::jsonb, '1814', 2686655::bigint, 'region', '18'),
    (3337442::bigint, 'Nykvarns Kommun', NULL::jsonb, '0140', 2673722::bigint, 'region', '01')
) AS v(geonames_id, name, name_i18n, external_code, parent_geonames_id, parent_type, parent_external_code)
JOIN public.locations p
  ON p.country_code = 'SE'
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
   WHERE country_code = 'SE' AND type = 'country';

  IF n_country <> 1 THEN
    RAISE EXCEPTION 'Sweden GeoNames seed: expected exactly 1 SE country row, found %', n_country;
  END IF;

  SELECT count(*) INTO n_region
    FROM public.locations
   WHERE country_code = 'SE' AND type = 'region';

  IF n_region <> 21 THEN
    RAISE EXCEPTION
      'Sweden GeoNames seed: expected 21 region rows for SE, found %. A shortfall means a level above did not land; a surplus means rows exist this seed does not explain.',
      n_region;
  END IF;

  -- Orphans, LEFT JOIN shape: a NULL or dangling parent_id has to be visible,
  -- which an inner join would silently drop.
  SELECT count(*) INTO orphans
    FROM public.locations c
    LEFT JOIN public.locations p ON p.id = c.parent_id
   WHERE c.country_code = 'SE' AND c.type = 'region'
     AND (p.id IS NULL OR p.country_code <> 'SE' OR p.type <> 'country');

  IF orphans > 0 THEN
    RAISE EXCEPTION 'Sweden GeoNames seed: % region rows are not parented to a country row in SE', orphans;
  END IF;

  SELECT count(*) INTO n_municipality
    FROM public.locations
   WHERE country_code = 'SE' AND type = 'municipality';

  IF n_municipality <> 290 THEN
    RAISE EXCEPTION
      'Sweden GeoNames seed: expected 290 municipality rows for SE, found %. A shortfall means a level above did not land; a surplus means rows exist this seed does not explain.',
      n_municipality;
  END IF;

  -- Orphans, LEFT JOIN shape: a NULL or dangling parent_id has to be visible,
  -- which an inner join would silently drop.
  SELECT count(*) INTO orphans
    FROM public.locations c
    LEFT JOIN public.locations p ON p.id = c.parent_id
   WHERE c.country_code = 'SE' AND c.type = 'municipality'
     AND (p.id IS NULL OR p.country_code <> 'SE' OR p.type <> 'region');

  IF orphans > 0 THEN
    RAISE EXCEPTION 'Sweden GeoNames seed: % municipality rows are not parented to a region row in SE', orphans;
  END IF;

  -- Every seeded row is a GeoNames row.
  SELECT count(*) INTO n_keyless
    FROM public.locations
   WHERE country_code = 'SE' AND type IN ('country', 'region', 'municipality')
     AND geonames_id IS NULL;

  IF n_keyless <> 0 THEN
    RAISE EXCEPTION
      'Sweden GeoNames seed: % seeded SE rows carry no geonames_id, expected 0',
      n_keyless;
  END IF;

  -- Every row at a level the config maps a code for carries one. A code-less
  -- row cannot be re-pointed by a reconciliation or joined by postal data.
  SELECT count(*) INTO n_codeless
    FROM public.locations
   WHERE country_code = 'SE' AND type IN ('region', 'municipality')
     AND external_code IS NULL;

  IF n_codeless > 0 THEN
    RAISE EXCEPTION
      'Sweden GeoNames seed: % SE rows carry no external_code at a level that must have one',
      n_codeless;
  END IF;

  -- Codes are unique within (country, type) — the key every reconciliation and
  -- official-data join runs on.
  SELECT count(*) INTO n_dupes
    FROM (
      SELECT type, external_code
        FROM public.locations
       WHERE country_code = 'SE' AND external_code IS NOT NULL
       GROUP BY type, external_code
      HAVING count(*) > 1
    ) d;

  IF n_dupes > 0 THEN
    RAISE EXCEPTION 'Sweden GeoNames seed: % (type, external_code) pairs are duplicated for SE', n_dupes;
  END IF;
END;
$$;

COMMIT;
