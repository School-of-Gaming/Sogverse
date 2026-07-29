-- Adds `locations.external_code` — the official statistical code a seeded
-- location row carries in its national classification — and backfills it for
-- Finland's already-seeded regions and municipalities.
--
-- WHY
--
-- Locations are about to stop being hand-typed. An admin picks an entry out of a
-- static, officially-sourced catalog (INSEE's Code officiel géographique for
-- France, Statistics Finland's classifications for Finland) and the row is
-- materialized from that entry. Materialization needs a stable key to dedupe on,
-- and a name is not one: France has homonymous communes, and every French DROM
-- has a région and a département sharing a name (Guadeloupe, Martinique, Guyane,
-- La Réunion, Mayotte). The official code is the key those catalogs are built
-- around, so it is what we store.
--
-- Rows an admin creates by hand — sites — have no code in any national
-- classification and keep `external_code` NULL. That is why the column is
-- nullable and the uniqueness is partial.
--
-- WHY THE UNIQUE INDEX INCLUDES `type`
--
-- France's classification reuses the same code across levels: every one of the
-- 18 région codes ('01', '11', '75', '84', …) is also a département code. They
-- are unambiguous in the COG only because they are published as separate files —
-- and `type` is precisely that file. So the official code is unique *within its
-- own classification*, which is what (country_code, type, external_code)
-- expresses. Uniquing on (country_code, external_code) alone would reject the
-- France seed outright: région '01' is Guadeloupe, département '01' is Ain.
--
-- The alternative — prefixing codes ('REG-01' / 'DEP-01') to force a single
-- namespace — was rejected because it means the column no longer holds the
-- official code, contradicting both its comment and any future join against
-- external INSEE/Tilastokeskus data.
--
-- FINLAND BACKFILL
--
-- Migration 00109 seeded 19 maakunnat and 308 kunnat by name; this stamps each
-- with its Statistics Finland code, matched on that name. Codes come from the
-- 2026 classifications (kunta_1_20260101, maakunta_1_20260101) — the same
-- release `scripts/generate-location-catalogs.mjs` builds the shipped catalogs
-- from, so the two agree by construction.
--
-- One name differs between the two sources: Statistics Finland publishes kunta
-- 478 as 'Maarianhamina - Mariehamn' (the bilingual official form), while 00109
-- stores 'Maarianhamina' per its stated convention of using the Finnish form for
-- bilingual municipalities. Our canonical name wins; the catalog generator
-- applies the same override, so catalog and database stay in step.
--
-- An unmatched row is a WARNING, not an error: a hand-created or renamed Finnish
-- row should not block a schema migration, and the operational cost of a missing
-- code is only that materialization will not dedupe onto that row.
--
-- Idempotent: the column, the index and every UPDATE are re-runnable no-ops on a
-- database that already has them.

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS external_code text;

COMMENT ON COLUMN public.locations.external_code IS 'Official statistical code for this location in its national classification: INSEE Code officiel géographique code for FR rows (région / département / commune), Statistics Finland region (maakunta) or municipality (kunta) code for FI rows. NULL on admin-created sites, which exist in no national classification. Unique per (country_code, type) — France reuses the same code across levels.';

-- Partial + type-scoped, per the reasoning above. This is the key
-- materialization dedupes on, so it must be an index, not a convention.
CREATE UNIQUE INDEX IF NOT EXISTS uq_locations_external_code
  ON public.locations (country_code, type, external_code)
  WHERE external_code IS NOT NULL;

-- The 2026 classification, materialized once so the backfill and both mismatch
-- reports below read the same list instead of three copies of it.
CREATE TEMP TABLE fi_official_codes (
  type public.location_type NOT NULL,
  name text NOT NULL,
  code text NOT NULL
);

INSERT INTO fi_official_codes (type, name, code) VALUES
  -- Maakunnat (19).
  ('region', 'Uusimaa', '01'),
  ('region', 'Varsinais-Suomi', '02'),
  ('region', 'Satakunta', '04'),
  ('region', 'Kanta-Häme', '05'),
  ('region', 'Pirkanmaa', '06'),
  ('region', 'Päijät-Häme', '07'),
  ('region', 'Kymenlaakso', '08'),
  ('region', 'Etelä-Karjala', '09'),
  ('region', 'Etelä-Savo', '10'),
  ('region', 'Pohjois-Savo', '11'),
  ('region', 'Pohjois-Karjala', '12'),
  ('region', 'Keski-Suomi', '13'),
  ('region', 'Etelä-Pohjanmaa', '14'),
  ('region', 'Pohjanmaa', '15'),
  ('region', 'Keski-Pohjanmaa', '16'),
  ('region', 'Pohjois-Pohjanmaa', '17'),
  ('region', 'Kainuu', '18'),
  ('region', 'Lappi', '19'),
  ('region', 'Ahvenanmaa', '21'),
  -- Kunnat (308).
  ('municipality', 'Alajärvi', '005'),
  ('municipality', 'Alavieska', '009'),
  ('municipality', 'Alavus', '010'),
  ('municipality', 'Asikkala', '016'),
  ('municipality', 'Askola', '018'),
  ('municipality', 'Aura', '019'),
  ('municipality', 'Akaa', '020'),
  ('municipality', 'Brändö', '035'),
  ('municipality', 'Eckerö', '043'),
  ('municipality', 'Enonkoski', '046'),
  ('municipality', 'Enontekiö', '047'),
  ('municipality', 'Espoo', '049'),
  ('municipality', 'Eura', '050'),
  ('municipality', 'Eurajoki', '051'),
  ('municipality', 'Evijärvi', '052'),
  ('municipality', 'Finström', '060'),
  ('municipality', 'Forssa', '061'),
  ('municipality', 'Föglö', '062'),
  ('municipality', 'Geta', '065'),
  ('municipality', 'Haapajärvi', '069'),
  ('municipality', 'Haapavesi', '071'),
  ('municipality', 'Hailuoto', '072'),
  ('municipality', 'Halsua', '074'),
  ('municipality', 'Hamina', '075'),
  ('municipality', 'Hammarland', '076'),
  ('municipality', 'Hankasalmi', '077'),
  ('municipality', 'Hanko', '078'),
  ('municipality', 'Harjavalta', '079'),
  ('municipality', 'Hartola', '081'),
  ('municipality', 'Hattula', '082'),
  ('municipality', 'Hausjärvi', '086'),
  ('municipality', 'Heinävesi', '090'),
  ('municipality', 'Helsinki', '091'),
  ('municipality', 'Vantaa', '092'),
  ('municipality', 'Hirvensalmi', '097'),
  ('municipality', 'Hollola', '098'),
  ('municipality', 'Huittinen', '102'),
  ('municipality', 'Humppila', '103'),
  ('municipality', 'Hyrynsalmi', '105'),
  ('municipality', 'Hyvinkää', '106'),
  ('municipality', 'Hämeenkyrö', '108'),
  ('municipality', 'Hämeenlinna', '109'),
  ('municipality', 'Heinola', '111'),
  ('municipality', 'Ii', '139'),
  ('municipality', 'Iisalmi', '140'),
  ('municipality', 'Iitti', '142'),
  ('municipality', 'Ikaalinen', '143'),
  ('municipality', 'Ilmajoki', '145'),
  ('municipality', 'Ilomantsi', '146'),
  ('municipality', 'Inari', '148'),
  ('municipality', 'Inkoo', '149'),
  ('municipality', 'Isojoki', '151'),
  ('municipality', 'Isokyrö', '152'),
  ('municipality', 'Imatra', '153'),
  ('municipality', 'Janakkala', '165'),
  ('municipality', 'Joensuu', '167'),
  ('municipality', 'Jokioinen', '169'),
  ('municipality', 'Jomala', '170'),
  ('municipality', 'Joroinen', '171'),
  ('municipality', 'Joutsa', '172'),
  ('municipality', 'Juuka', '176'),
  ('municipality', 'Juupajoki', '177'),
  ('municipality', 'Juva', '178'),
  ('municipality', 'Jyväskylä', '179'),
  ('municipality', 'Jämijärvi', '181'),
  ('municipality', 'Jämsä', '182'),
  ('municipality', 'Järvenpää', '186'),
  ('municipality', 'Kaarina', '202'),
  ('municipality', 'Kaavi', '204'),
  ('municipality', 'Kajaani', '205'),
  ('municipality', 'Kalajoki', '208'),
  ('municipality', 'Kangasala', '211'),
  ('municipality', 'Kangasniemi', '213'),
  ('municipality', 'Kankaanpää', '214'),
  ('municipality', 'Kannonkoski', '216'),
  ('municipality', 'Kannus', '217'),
  ('municipality', 'Karijoki', '218'),
  ('municipality', 'Karkkila', '224'),
  ('municipality', 'Karstula', '226'),
  ('municipality', 'Karvia', '230'),
  ('municipality', 'Kaskinen', '231'),
  ('municipality', 'Kauhajoki', '232'),
  ('municipality', 'Kauhava', '233'),
  ('municipality', 'Kauniainen', '235'),
  ('municipality', 'Kaustinen', '236'),
  ('municipality', 'Keitele', '239'),
  ('municipality', 'Kemi', '240'),
  ('municipality', 'Keminmaa', '241'),
  ('municipality', 'Kempele', '244'),
  ('municipality', 'Kerava', '245'),
  ('municipality', 'Keuruu', '249'),
  ('municipality', 'Kihniö', '250'),
  ('municipality', 'Kinnula', '256'),
  ('municipality', 'Kirkkonummi', '257'),
  ('municipality', 'Kitee', '260'),
  ('municipality', 'Kittilä', '261'),
  ('municipality', 'Kiuruvesi', '263'),
  ('municipality', 'Kivijärvi', '265'),
  ('municipality', 'Kokemäki', '271'),
  ('municipality', 'Kokkola', '272'),
  ('municipality', 'Kolari', '273'),
  ('municipality', 'Konnevesi', '275'),
  ('municipality', 'Kontiolahti', '276'),
  ('municipality', 'Korsnäs', '280'),
  ('municipality', 'Koski Tl', '284'),
  ('municipality', 'Kotka', '285'),
  ('municipality', 'Kouvola', '286'),
  ('municipality', 'Kristiinankaupunki', '287'),
  ('municipality', 'Kruunupyy', '288'),
  ('municipality', 'Kuhmo', '290'),
  ('municipality', 'Kuhmoinen', '291'),
  ('municipality', 'Kumlinge', '295'),
  ('municipality', 'Kuopio', '297'),
  ('municipality', 'Kuortane', '300'),
  ('municipality', 'Kurikka', '301'),
  ('municipality', 'Kustavi', '304'),
  ('municipality', 'Kuusamo', '305'),
  ('municipality', 'Outokumpu', '309'),
  ('municipality', 'Kyyjärvi', '312'),
  ('municipality', 'Kärkölä', '316'),
  ('municipality', 'Kärsämäki', '317'),
  ('municipality', 'Kökar', '318'),
  ('municipality', 'Kemijärvi', '320'),
  ('municipality', 'Kemiönsaari', '322'),
  ('municipality', 'Lahti', '398'),
  ('municipality', 'Laihia', '399'),
  ('municipality', 'Laitila', '400'),
  ('municipality', 'Lapinlahti', '402'),
  ('municipality', 'Lappajärvi', '403'),
  ('municipality', 'Lappeenranta', '405'),
  ('municipality', 'Lapinjärvi', '407'),
  ('municipality', 'Lapua', '408'),
  ('municipality', 'Laukaa', '410'),
  ('municipality', 'Lemi', '416'),
  ('municipality', 'Lemland', '417'),
  ('municipality', 'Lempäälä', '418'),
  ('municipality', 'Leppävirta', '420'),
  ('municipality', 'Lestijärvi', '421'),
  ('municipality', 'Lieksa', '422'),
  ('municipality', 'Lieto', '423'),
  ('municipality', 'Liminka', '425'),
  ('municipality', 'Liperi', '426'),
  ('municipality', 'Loimaa', '430'),
  ('municipality', 'Loppi', '433'),
  ('municipality', 'Loviisa', '434'),
  ('municipality', 'Luhanka', '435'),
  ('municipality', 'Lumijoki', '436'),
  ('municipality', 'Lumparland', '438'),
  ('municipality', 'Luoto', '440'),
  ('municipality', 'Luumäki', '441'),
  ('municipality', 'Lohja', '444'),
  ('municipality', 'Parainen', '445'),
  ('municipality', 'Maalahti', '475'),
  ('municipality', 'Maarianhamina', '478'),
  ('municipality', 'Marttila', '480'),
  ('municipality', 'Masku', '481'),
  ('municipality', 'Merijärvi', '483'),
  ('municipality', 'Merikarvia', '484'),
  ('municipality', 'Miehikkälä', '489'),
  ('municipality', 'Mikkeli', '491'),
  ('municipality', 'Muhos', '494'),
  ('municipality', 'Multia', '495'),
  ('municipality', 'Muonio', '498'),
  ('municipality', 'Mustasaari', '499'),
  ('municipality', 'Muurame', '500'),
  ('municipality', 'Mynämäki', '503'),
  ('municipality', 'Myrskylä', '504'),
  ('municipality', 'Mäntsälä', '505'),
  ('municipality', 'Mäntyharju', '507'),
  ('municipality', 'Mänttä-Vilppula', '508'),
  ('municipality', 'Naantali', '529'),
  ('municipality', 'Nakkila', '531'),
  ('municipality', 'Nivala', '535'),
  ('municipality', 'Nokia', '536'),
  ('municipality', 'Nousiainen', '538'),
  ('municipality', 'Nurmes', '541'),
  ('municipality', 'Nurmijärvi', '543'),
  ('municipality', 'Närpiö', '545'),
  ('municipality', 'Orimattila', '560'),
  ('municipality', 'Oripää', '561'),
  ('municipality', 'Orivesi', '562'),
  ('municipality', 'Oulainen', '563'),
  ('municipality', 'Oulu', '564'),
  ('municipality', 'Padasjoki', '576'),
  ('municipality', 'Paimio', '577'),
  ('municipality', 'Paltamo', '578'),
  ('municipality', 'Parikkala', '580'),
  ('municipality', 'Parkano', '581'),
  ('municipality', 'Pelkosenniemi', '583'),
  ('municipality', 'Perho', '584'),
  ('municipality', 'Petäjävesi', '592'),
  ('municipality', 'Pieksämäki', '593'),
  ('municipality', 'Pielavesi', '595'),
  ('municipality', 'Pietarsaari', '598'),
  ('municipality', 'Pedersören kunta', '599'),
  ('municipality', 'Pihtipudas', '601'),
  ('municipality', 'Pirkkala', '604'),
  ('municipality', 'Polvijärvi', '607'),
  ('municipality', 'Pomarkku', '608'),
  ('municipality', 'Pori', '609'),
  ('municipality', 'Pornainen', '611'),
  ('municipality', 'Posio', '614'),
  ('municipality', 'Pudasjärvi', '615'),
  ('municipality', 'Pukkila', '616'),
  ('municipality', 'Punkalaidun', '619'),
  ('municipality', 'Puolanka', '620'),
  ('municipality', 'Puumala', '623'),
  ('municipality', 'Pyhtää', '624'),
  ('municipality', 'Pyhäjoki', '625'),
  ('municipality', 'Pyhäjärvi', '626'),
  ('municipality', 'Pyhäntä', '630'),
  ('municipality', 'Pyhäranta', '631'),
  ('municipality', 'Pälkäne', '635'),
  ('municipality', 'Pöytyä', '636'),
  ('municipality', 'Porvoo', '638'),
  ('municipality', 'Raahe', '678'),
  ('municipality', 'Raisio', '680'),
  ('municipality', 'Rantasalmi', '681'),
  ('municipality', 'Ranua', '683'),
  ('municipality', 'Rauma', '684'),
  ('municipality', 'Rautalampi', '686'),
  ('municipality', 'Rautavaara', '687'),
  ('municipality', 'Rautjärvi', '689'),
  ('municipality', 'Reisjärvi', '691'),
  ('municipality', 'Riihimäki', '694'),
  ('municipality', 'Ristijärvi', '697'),
  ('municipality', 'Rovaniemi', '698'),
  ('municipality', 'Ruokolahti', '700'),
  ('municipality', 'Ruovesi', '702'),
  ('municipality', 'Rusko', '704'),
  ('municipality', 'Rääkkylä', '707'),
  ('municipality', 'Raasepori', '710'),
  ('municipality', 'Saarijärvi', '729'),
  ('municipality', 'Salla', '732'),
  ('municipality', 'Salo', '734'),
  ('municipality', 'Saltvik', '736'),
  ('municipality', 'Sauvo', '738'),
  ('municipality', 'Savitaipale', '739'),
  ('municipality', 'Savonlinna', '740'),
  ('municipality', 'Savukoski', '742'),
  ('municipality', 'Seinäjoki', '743'),
  ('municipality', 'Sievi', '746'),
  ('municipality', 'Siikainen', '747'),
  ('municipality', 'Siikajoki', '748'),
  ('municipality', 'Siilinjärvi', '749'),
  ('municipality', 'Simo', '751'),
  ('municipality', 'Sipoo', '753'),
  ('municipality', 'Siuntio', '755'),
  ('municipality', 'Sodankylä', '758'),
  ('municipality', 'Soini', '759'),
  ('municipality', 'Somero', '761'),
  ('municipality', 'Sonkajärvi', '762'),
  ('municipality', 'Sotkamo', '765'),
  ('municipality', 'Sottunga', '766'),
  ('municipality', 'Sulkava', '768'),
  ('municipality', 'Sund', '771'),
  ('municipality', 'Suomussalmi', '777'),
  ('municipality', 'Suonenjoki', '778'),
  ('municipality', 'Sysmä', '781'),
  ('municipality', 'Säkylä', '783'),
  ('municipality', 'Vaala', '785'),
  ('municipality', 'Sastamala', '790'),
  ('municipality', 'Siikalatva', '791'),
  ('municipality', 'Taipalsaari', '831'),
  ('municipality', 'Taivalkoski', '832'),
  ('municipality', 'Taivassalo', '833'),
  ('municipality', 'Tammela', '834'),
  ('municipality', 'Tampere', '837'),
  ('municipality', 'Tervo', '844'),
  ('municipality', 'Tervola', '845'),
  ('municipality', 'Teuva', '846'),
  ('municipality', 'Tohmajärvi', '848'),
  ('municipality', 'Toholampi', '849'),
  ('municipality', 'Toivakka', '850'),
  ('municipality', 'Tornio', '851'),
  ('municipality', 'Turku', '853'),
  ('municipality', 'Pello', '854'),
  ('municipality', 'Tuusniemi', '857'),
  ('municipality', 'Tuusula', '858'),
  ('municipality', 'Tyrnävä', '859'),
  ('municipality', 'Ulvila', '886'),
  ('municipality', 'Urjala', '887'),
  ('municipality', 'Utajärvi', '889'),
  ('municipality', 'Utsjoki', '890'),
  ('municipality', 'Uurainen', '892'),
  ('municipality', 'Uusikaarlepyy', '893'),
  ('municipality', 'Uusikaupunki', '895'),
  ('municipality', 'Vaasa', '905'),
  ('municipality', 'Valkeakoski', '908'),
  ('municipality', 'Varkaus', '915'),
  ('municipality', 'Vehmaa', '918'),
  ('municipality', 'Vesanto', '921'),
  ('municipality', 'Vesilahti', '922'),
  ('municipality', 'Veteli', '924'),
  ('municipality', 'Vieremä', '925'),
  ('municipality', 'Vihti', '927'),
  ('municipality', 'Viitasaari', '931'),
  ('municipality', 'Vimpeli', '934'),
  ('municipality', 'Virolahti', '935'),
  ('municipality', 'Virrat', '936'),
  ('municipality', 'Vårdö', '941'),
  ('municipality', 'Vöyri', '946'),
  ('municipality', 'Ylitornio', '976'),
  ('municipality', 'Ylivieska', '977'),
  ('municipality', 'Ylöjärvi', '980'),
  ('municipality', 'Ypäjä', '981'),
  ('municipality', 'Ähtäri', '989'),
  ('municipality', 'Äänekoski', '992');

DO $$
DECLARE
  fi_id     uuid;
  unmatched text[];
  codeless  text[];
BEGIN
  SELECT id INTO fi_id
    FROM public.locations
   WHERE type = 'country' AND country_code = 'FI'
   LIMIT 1;

  IF fi_id IS NULL THEN
    RAISE WARNING 'locations: no FI country row — skipping the Finland external_code backfill entirely';
    RETURN;
  END IF;

  -- Regions (maakunnat), children of the FI country row.
  UPDATE public.locations l
     SET external_code = c.code
    FROM fi_official_codes c
   WHERE c.type = 'region'
     AND l.parent_id = fi_id
     AND l.type = 'region'
     AND l.name = c.name
     AND l.external_code IS DISTINCT FROM c.code;

  -- Municipalities (kunnat). Matched on name across all of FI rather than per
  -- region: Finnish municipality names are unique nationally, and a row filed
  -- under the wrong region should still get its code.
  UPDATE public.locations l
     SET external_code = c.code
    FROM fi_official_codes c
   WHERE c.type = 'municipality'
     AND l.country_code = 'FI'
     AND l.type = 'municipality'
     AND l.name = c.name
     AND l.external_code IS DISTINCT FROM c.code;

  -- Report both directions of a mismatch. A classification entry with no row
  -- means the seed is behind the official release; a row with no code means the
  -- row was created or renamed outside the seed.
  SELECT coalesce(array_agg(c.type || ' ' || c.name ORDER BY c.type, c.name), ARRAY[]::text[])
    INTO unmatched
    FROM fi_official_codes c
   WHERE NOT EXISTS (
     SELECT 1 FROM public.locations l
      WHERE l.country_code = 'FI' AND l.type = c.type AND l.name = c.name
   );

  IF cardinality(unmatched) > 0 THEN
    RAISE WARNING 'locations: % Statistics Finland entries matched no seeded row (%)',
      cardinality(unmatched), array_to_string(unmatched, ', ');
  END IF;

  SELECT coalesce(array_agg(l.type || ' ' || l.name ORDER BY l.type, l.name), ARRAY[]::text[])
    INTO codeless
    FROM public.locations l
   WHERE l.country_code = 'FI'
     AND l.type IN ('region', 'municipality')
     AND l.external_code IS NULL;

  IF cardinality(codeless) > 0 THEN
    RAISE WARNING 'locations: % FI region/municipality rows still have no external_code (%)',
      cardinality(codeless), array_to_string(codeless, ', ');
  END IF;
END;
$$;

DROP TABLE fi_official_codes;
