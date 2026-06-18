-- Seed the complete Finland location hierarchy: 19 regions (maakunnat) and 308
-- municipalities (kunnat), per Statistics Finland's 2025 official classification.
--
-- Why: admins should pick a verified municipality from the tree and attach their
-- site under it, rather than hand-typing region/municipality names and guessing the
-- hierarchy (which produced mismatched rows that break substitute matching and
-- product↔location pinning). See src/services/locations/CLAUDE.md.
--
-- Names are stored in native Finnish (Finland's main market). Bilingual municipalities
-- use their Finnish form (Maarianhamina, Mustasaari, Närpiö, ...); Åland's other 15
-- municipalities have only Swedish official names and keep them. The country row stays
-- 'Finland' so its locale-aware nameI18n ("Suomi" for fi) in
-- src/lib/constants/location-hierarchies.ts keeps working untouched.
--
-- This migration is SELF-RECONCILING and IDEMPOTENT (re-runnable, safe on prod and
-- staging, no new constraint, no extension):
--   1. Get-or-create the FI country row.
--   2. Reconcile a known mislabeling: a region literally named 'Helsinki' is wrong
--      (Helsinki is a municipality in Uusimaa). Rename it in place so its existing
--      child municipality + site ride along with their ids preserved — nothing that
--      references those rows (a product pinned to the site, a gedu coverage tick) is
--      disturbed. Guarded, so it no-ops where the pattern isn't present (staging).
--   3. Insert the 19 regions, each guarded by NOT EXISTS.
--   4. Insert the 308 municipalities under their region, each guarded by NOT EXISTS.
-- Re-running matches existing rows by (parent_id, type, name) and inserts nothing.
--
-- Data-only migration: no schema change, no type/grant change.

DO $$
DECLARE
  fi_id uuid;
BEGIN
  -- 1. Country: get-or-create Finland.
  SELECT id INTO fi_id
    FROM public.locations
   WHERE type = 'country' AND country_code = 'FI'
   LIMIT 1;

  IF fi_id IS NULL THEN
    INSERT INTO public.locations (name, type, parent_id, country_code)
    VALUES ('Finland', 'country', NULL, 'FI')
    RETURNING id INTO fi_id;
  END IF;

  -- 2. Reconcile the mislabeled region (Helsinki -> Uusimaa) in place.
  IF EXISTS (
        SELECT 1 FROM public.locations
         WHERE parent_id = fi_id AND type = 'region' AND name = 'Helsinki'
     ) AND NOT EXISTS (
        SELECT 1 FROM public.locations
         WHERE parent_id = fi_id AND type = 'region' AND name = 'Uusimaa'
     ) THEN
    UPDATE public.locations
       SET name = 'Uusimaa', updated_at = NOW()
     WHERE parent_id = fi_id AND type = 'region' AND name = 'Helsinki';
  END IF;

  -- 3. Regions (19).
  INSERT INTO public.locations (name, type, parent_id, country_code)
  SELECT r.name, 'region', fi_id, 'FI'
  FROM (VALUES
    ('Uusimaa'),
    ('Varsinais-Suomi'),
    ('Satakunta'),
    ('Kanta-Häme'),
    ('Pirkanmaa'),
    ('Päijät-Häme'),
    ('Kymenlaakso'),
    ('Etelä-Karjala'),
    ('Etelä-Savo'),
    ('Pohjois-Savo'),
    ('Pohjois-Karjala'),
    ('Keski-Suomi'),
    ('Etelä-Pohjanmaa'),
    ('Pohjanmaa'),
    ('Keski-Pohjanmaa'),
    ('Pohjois-Pohjanmaa'),
    ('Kainuu'),
    ('Lappi'),
    ('Ahvenanmaa')
  ) AS r(name)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.locations l
     WHERE l.parent_id = fi_id AND l.type = 'region' AND l.name = r.name
  );

  -- 4. Municipalities (308), each attached to its region by name.
  INSERT INTO public.locations (name, type, parent_id, country_code)
  SELECT m.municipality, 'municipality', reg.id, 'FI'
  FROM (VALUES
    -- Uusimaa (26)
    ('Uusimaa', 'Askola'),
    ('Uusimaa', 'Espoo'),
    ('Uusimaa', 'Hanko'),
    ('Uusimaa', 'Helsinki'),
    ('Uusimaa', 'Hyvinkää'),
    ('Uusimaa', 'Inkoo'),
    ('Uusimaa', 'Järvenpää'),
    ('Uusimaa', 'Karkkila'),
    ('Uusimaa', 'Kauniainen'),
    ('Uusimaa', 'Kerava'),
    ('Uusimaa', 'Kirkkonummi'),
    ('Uusimaa', 'Lapinjärvi'),
    ('Uusimaa', 'Lohja'),
    ('Uusimaa', 'Loviisa'),
    ('Uusimaa', 'Myrskylä'),
    ('Uusimaa', 'Mäntsälä'),
    ('Uusimaa', 'Nurmijärvi'),
    ('Uusimaa', 'Pornainen'),
    ('Uusimaa', 'Porvoo'),
    ('Uusimaa', 'Pukkila'),
    ('Uusimaa', 'Raasepori'),
    ('Uusimaa', 'Sipoo'),
    ('Uusimaa', 'Siuntio'),
    ('Uusimaa', 'Tuusula'),
    ('Uusimaa', 'Vantaa'),
    ('Uusimaa', 'Vihti'),
    -- Varsinais-Suomi (27)
    ('Varsinais-Suomi', 'Aura'),
    ('Varsinais-Suomi', 'Kaarina'),
    ('Varsinais-Suomi', 'Kemiönsaari'),
    ('Varsinais-Suomi', 'Koski Tl'),
    ('Varsinais-Suomi', 'Kustavi'),
    ('Varsinais-Suomi', 'Laitila'),
    ('Varsinais-Suomi', 'Lieto'),
    ('Varsinais-Suomi', 'Loimaa'),
    ('Varsinais-Suomi', 'Marttila'),
    ('Varsinais-Suomi', 'Masku'),
    ('Varsinais-Suomi', 'Mynämäki'),
    ('Varsinais-Suomi', 'Naantali'),
    ('Varsinais-Suomi', 'Nousiainen'),
    ('Varsinais-Suomi', 'Oripää'),
    ('Varsinais-Suomi', 'Paimio'),
    ('Varsinais-Suomi', 'Parainen'),
    ('Varsinais-Suomi', 'Pyhäranta'),
    ('Varsinais-Suomi', 'Pöytyä'),
    ('Varsinais-Suomi', 'Raisio'),
    ('Varsinais-Suomi', 'Rusko'),
    ('Varsinais-Suomi', 'Salo'),
    ('Varsinais-Suomi', 'Sauvo'),
    ('Varsinais-Suomi', 'Somero'),
    ('Varsinais-Suomi', 'Taivassalo'),
    ('Varsinais-Suomi', 'Turku'),
    ('Varsinais-Suomi', 'Uusikaupunki'),
    ('Varsinais-Suomi', 'Vehmaa'),
    -- Satakunta (16)
    ('Satakunta', 'Eura'),
    ('Satakunta', 'Eurajoki'),
    ('Satakunta', 'Harjavalta'),
    ('Satakunta', 'Huittinen'),
    ('Satakunta', 'Jämijärvi'),
    ('Satakunta', 'Kankaanpää'),
    ('Satakunta', 'Karvia'),
    ('Satakunta', 'Kokemäki'),
    ('Satakunta', 'Merikarvia'),
    ('Satakunta', 'Nakkila'),
    ('Satakunta', 'Pomarkku'),
    ('Satakunta', 'Pori'),
    ('Satakunta', 'Rauma'),
    ('Satakunta', 'Siikainen'),
    ('Satakunta', 'Säkylä'),
    ('Satakunta', 'Ulvila'),
    -- Kanta-Häme (11)
    ('Kanta-Häme', 'Forssa'),
    ('Kanta-Häme', 'Hattula'),
    ('Kanta-Häme', 'Hausjärvi'),
    ('Kanta-Häme', 'Humppila'),
    ('Kanta-Häme', 'Hämeenlinna'),
    ('Kanta-Häme', 'Janakkala'),
    ('Kanta-Häme', 'Jokioinen'),
    ('Kanta-Häme', 'Loppi'),
    ('Kanta-Häme', 'Riihimäki'),
    ('Kanta-Häme', 'Tammela'),
    ('Kanta-Häme', 'Ypäjä'),
    -- Pirkanmaa (23)
    ('Pirkanmaa', 'Akaa'),
    ('Pirkanmaa', 'Hämeenkyrö'),
    ('Pirkanmaa', 'Ikaalinen'),
    ('Pirkanmaa', 'Juupajoki'),
    ('Pirkanmaa', 'Kangasala'),
    ('Pirkanmaa', 'Kihniö'),
    ('Pirkanmaa', 'Kuhmoinen'),
    ('Pirkanmaa', 'Lempäälä'),
    ('Pirkanmaa', 'Mänttä-Vilppula'),
    ('Pirkanmaa', 'Nokia'),
    ('Pirkanmaa', 'Orivesi'),
    ('Pirkanmaa', 'Parkano'),
    ('Pirkanmaa', 'Pirkkala'),
    ('Pirkanmaa', 'Punkalaidun'),
    ('Pirkanmaa', 'Pälkäne'),
    ('Pirkanmaa', 'Ruovesi'),
    ('Pirkanmaa', 'Sastamala'),
    ('Pirkanmaa', 'Tampere'),
    ('Pirkanmaa', 'Urjala'),
    ('Pirkanmaa', 'Valkeakoski'),
    ('Pirkanmaa', 'Vesilahti'),
    ('Pirkanmaa', 'Virrat'),
    ('Pirkanmaa', 'Ylöjärvi'),
    -- Päijät-Häme (10)
    ('Päijät-Häme', 'Asikkala'),
    ('Päijät-Häme', 'Hartola'),
    ('Päijät-Häme', 'Heinola'),
    ('Päijät-Häme', 'Hollola'),
    ('Päijät-Häme', 'Iitti'),
    ('Päijät-Häme', 'Kärkölä'),
    ('Päijät-Häme', 'Lahti'),
    ('Päijät-Häme', 'Orimattila'),
    ('Päijät-Häme', 'Padasjoki'),
    ('Päijät-Häme', 'Sysmä'),
    -- Kymenlaakso (6)
    ('Kymenlaakso', 'Hamina'),
    ('Kymenlaakso', 'Kotka'),
    ('Kymenlaakso', 'Kouvola'),
    ('Kymenlaakso', 'Miehikkälä'),
    ('Kymenlaakso', 'Pyhtää'),
    ('Kymenlaakso', 'Virolahti'),
    -- Etelä-Karjala (9)
    ('Etelä-Karjala', 'Imatra'),
    ('Etelä-Karjala', 'Lappeenranta'),
    ('Etelä-Karjala', 'Lemi'),
    ('Etelä-Karjala', 'Luumäki'),
    ('Etelä-Karjala', 'Parikkala'),
    ('Etelä-Karjala', 'Rautjärvi'),
    ('Etelä-Karjala', 'Ruokolahti'),
    ('Etelä-Karjala', 'Savitaipale'),
    ('Etelä-Karjala', 'Taipalsaari'),
    -- Etelä-Savo (11)
    ('Etelä-Savo', 'Enonkoski'),
    ('Etelä-Savo', 'Hirvensalmi'),
    ('Etelä-Savo', 'Juva'),
    ('Etelä-Savo', 'Kangasniemi'),
    ('Etelä-Savo', 'Mikkeli'),
    ('Etelä-Savo', 'Mäntyharju'),
    ('Etelä-Savo', 'Pieksämäki'),
    ('Etelä-Savo', 'Puumala'),
    ('Etelä-Savo', 'Rantasalmi'),
    ('Etelä-Savo', 'Savonlinna'),
    ('Etelä-Savo', 'Sulkava'),
    -- Pohjois-Savo (19)
    ('Pohjois-Savo', 'Iisalmi'),
    ('Pohjois-Savo', 'Joroinen'),
    ('Pohjois-Savo', 'Kaavi'),
    ('Pohjois-Savo', 'Keitele'),
    ('Pohjois-Savo', 'Kiuruvesi'),
    ('Pohjois-Savo', 'Kuopio'),
    ('Pohjois-Savo', 'Lapinlahti'),
    ('Pohjois-Savo', 'Leppävirta'),
    ('Pohjois-Savo', 'Pielavesi'),
    ('Pohjois-Savo', 'Rautalampi'),
    ('Pohjois-Savo', 'Rautavaara'),
    ('Pohjois-Savo', 'Siilinjärvi'),
    ('Pohjois-Savo', 'Sonkajärvi'),
    ('Pohjois-Savo', 'Suonenjoki'),
    ('Pohjois-Savo', 'Tervo'),
    ('Pohjois-Savo', 'Tuusniemi'),
    ('Pohjois-Savo', 'Varkaus'),
    ('Pohjois-Savo', 'Vesanto'),
    ('Pohjois-Savo', 'Vieremä'),
    -- Pohjois-Karjala (13)
    ('Pohjois-Karjala', 'Heinävesi'),
    ('Pohjois-Karjala', 'Ilomantsi'),
    ('Pohjois-Karjala', 'Joensuu'),
    ('Pohjois-Karjala', 'Juuka'),
    ('Pohjois-Karjala', 'Kitee'),
    ('Pohjois-Karjala', 'Kontiolahti'),
    ('Pohjois-Karjala', 'Lieksa'),
    ('Pohjois-Karjala', 'Liperi'),
    ('Pohjois-Karjala', 'Nurmes'),
    ('Pohjois-Karjala', 'Outokumpu'),
    ('Pohjois-Karjala', 'Polvijärvi'),
    ('Pohjois-Karjala', 'Rääkkylä'),
    ('Pohjois-Karjala', 'Tohmajärvi'),
    -- Keski-Suomi (22)
    ('Keski-Suomi', 'Hankasalmi'),
    ('Keski-Suomi', 'Joutsa'),
    ('Keski-Suomi', 'Jyväskylä'),
    ('Keski-Suomi', 'Jämsä'),
    ('Keski-Suomi', 'Kannonkoski'),
    ('Keski-Suomi', 'Karstula'),
    ('Keski-Suomi', 'Keuruu'),
    ('Keski-Suomi', 'Kinnula'),
    ('Keski-Suomi', 'Kivijärvi'),
    ('Keski-Suomi', 'Konnevesi'),
    ('Keski-Suomi', 'Kyyjärvi'),
    ('Keski-Suomi', 'Laukaa'),
    ('Keski-Suomi', 'Luhanka'),
    ('Keski-Suomi', 'Multia'),
    ('Keski-Suomi', 'Muurame'),
    ('Keski-Suomi', 'Petäjävesi'),
    ('Keski-Suomi', 'Pihtipudas'),
    ('Keski-Suomi', 'Saarijärvi'),
    ('Keski-Suomi', 'Toivakka'),
    ('Keski-Suomi', 'Uurainen'),
    ('Keski-Suomi', 'Viitasaari'),
    ('Keski-Suomi', 'Äänekoski'),
    -- Etelä-Pohjanmaa (18)
    ('Etelä-Pohjanmaa', 'Alajärvi'),
    ('Etelä-Pohjanmaa', 'Alavus'),
    ('Etelä-Pohjanmaa', 'Evijärvi'),
    ('Etelä-Pohjanmaa', 'Ilmajoki'),
    ('Etelä-Pohjanmaa', 'Isojoki'),
    ('Etelä-Pohjanmaa', 'Isokyrö'),
    ('Etelä-Pohjanmaa', 'Karijoki'),
    ('Etelä-Pohjanmaa', 'Kauhajoki'),
    ('Etelä-Pohjanmaa', 'Kauhava'),
    ('Etelä-Pohjanmaa', 'Kuortane'),
    ('Etelä-Pohjanmaa', 'Kurikka'),
    ('Etelä-Pohjanmaa', 'Lappajärvi'),
    ('Etelä-Pohjanmaa', 'Lapua'),
    ('Etelä-Pohjanmaa', 'Seinäjoki'),
    ('Etelä-Pohjanmaa', 'Soini'),
    ('Etelä-Pohjanmaa', 'Teuva'),
    ('Etelä-Pohjanmaa', 'Vimpeli'),
    ('Etelä-Pohjanmaa', 'Ähtäri'),
    -- Pohjanmaa (14)
    ('Pohjanmaa', 'Kaskinen'),
    ('Pohjanmaa', 'Korsnäs'),
    ('Pohjanmaa', 'Kristiinankaupunki'),
    ('Pohjanmaa', 'Kruunupyy'),
    ('Pohjanmaa', 'Laihia'),
    ('Pohjanmaa', 'Luoto'),
    ('Pohjanmaa', 'Maalahti'),
    ('Pohjanmaa', 'Mustasaari'),
    ('Pohjanmaa', 'Närpiö'),
    ('Pohjanmaa', 'Pedersören kunta'),
    ('Pohjanmaa', 'Pietarsaari'),
    ('Pohjanmaa', 'Uusikaarlepyy'),
    ('Pohjanmaa', 'Vaasa'),
    ('Pohjanmaa', 'Vöyri'),
    -- Keski-Pohjanmaa (8)
    ('Keski-Pohjanmaa', 'Halsua'),
    ('Keski-Pohjanmaa', 'Kannus'),
    ('Keski-Pohjanmaa', 'Kaustinen'),
    ('Keski-Pohjanmaa', 'Kokkola'),
    ('Keski-Pohjanmaa', 'Lestijärvi'),
    ('Keski-Pohjanmaa', 'Perho'),
    ('Keski-Pohjanmaa', 'Toholampi'),
    ('Keski-Pohjanmaa', 'Veteli'),
    -- Pohjois-Pohjanmaa (30)
    ('Pohjois-Pohjanmaa', 'Alavieska'),
    ('Pohjois-Pohjanmaa', 'Haapajärvi'),
    ('Pohjois-Pohjanmaa', 'Haapavesi'),
    ('Pohjois-Pohjanmaa', 'Hailuoto'),
    ('Pohjois-Pohjanmaa', 'Ii'),
    ('Pohjois-Pohjanmaa', 'Kalajoki'),
    ('Pohjois-Pohjanmaa', 'Kempele'),
    ('Pohjois-Pohjanmaa', 'Kuusamo'),
    ('Pohjois-Pohjanmaa', 'Kärsämäki'),
    ('Pohjois-Pohjanmaa', 'Liminka'),
    ('Pohjois-Pohjanmaa', 'Lumijoki'),
    ('Pohjois-Pohjanmaa', 'Merijärvi'),
    ('Pohjois-Pohjanmaa', 'Muhos'),
    ('Pohjois-Pohjanmaa', 'Nivala'),
    ('Pohjois-Pohjanmaa', 'Oulainen'),
    ('Pohjois-Pohjanmaa', 'Oulu'),
    ('Pohjois-Pohjanmaa', 'Pudasjärvi'),
    ('Pohjois-Pohjanmaa', 'Pyhäjoki'),
    ('Pohjois-Pohjanmaa', 'Pyhäjärvi'),
    ('Pohjois-Pohjanmaa', 'Pyhäntä'),
    ('Pohjois-Pohjanmaa', 'Raahe'),
    ('Pohjois-Pohjanmaa', 'Reisjärvi'),
    ('Pohjois-Pohjanmaa', 'Sievi'),
    ('Pohjois-Pohjanmaa', 'Siikajoki'),
    ('Pohjois-Pohjanmaa', 'Siikalatva'),
    ('Pohjois-Pohjanmaa', 'Taivalkoski'),
    ('Pohjois-Pohjanmaa', 'Tyrnävä'),
    ('Pohjois-Pohjanmaa', 'Utajärvi'),
    ('Pohjois-Pohjanmaa', 'Vaala'),
    ('Pohjois-Pohjanmaa', 'Ylivieska'),
    -- Kainuu (8)
    ('Kainuu', 'Hyrynsalmi'),
    ('Kainuu', 'Kajaani'),
    ('Kainuu', 'Kuhmo'),
    ('Kainuu', 'Paltamo'),
    ('Kainuu', 'Puolanka'),
    ('Kainuu', 'Ristijärvi'),
    ('Kainuu', 'Sotkamo'),
    ('Kainuu', 'Suomussalmi'),
    -- Lappi (21)
    ('Lappi', 'Enontekiö'),
    ('Lappi', 'Inari'),
    ('Lappi', 'Kemi'),
    ('Lappi', 'Kemijärvi'),
    ('Lappi', 'Keminmaa'),
    ('Lappi', 'Kittilä'),
    ('Lappi', 'Kolari'),
    ('Lappi', 'Muonio'),
    ('Lappi', 'Pelkosenniemi'),
    ('Lappi', 'Pello'),
    ('Lappi', 'Posio'),
    ('Lappi', 'Ranua'),
    ('Lappi', 'Rovaniemi'),
    ('Lappi', 'Salla'),
    ('Lappi', 'Savukoski'),
    ('Lappi', 'Simo'),
    ('Lappi', 'Sodankylä'),
    ('Lappi', 'Tervola'),
    ('Lappi', 'Tornio'),
    ('Lappi', 'Utsjoki'),
    ('Lappi', 'Ylitornio'),
    -- Ahvenanmaa (16)
    ('Ahvenanmaa', 'Brändö'),
    ('Ahvenanmaa', 'Eckerö'),
    ('Ahvenanmaa', 'Finström'),
    ('Ahvenanmaa', 'Föglö'),
    ('Ahvenanmaa', 'Geta'),
    ('Ahvenanmaa', 'Hammarland'),
    ('Ahvenanmaa', 'Jomala'),
    ('Ahvenanmaa', 'Kumlinge'),
    ('Ahvenanmaa', 'Kökar'),
    ('Ahvenanmaa', 'Lemland'),
    ('Ahvenanmaa', 'Lumparland'),
    ('Ahvenanmaa', 'Maarianhamina'),
    ('Ahvenanmaa', 'Saltvik'),
    ('Ahvenanmaa', 'Sottunga'),
    ('Ahvenanmaa', 'Sund'),
    ('Ahvenanmaa', 'Vårdö')
  ) AS m(region, municipality)
  JOIN public.locations reg
    ON reg.parent_id = fi_id AND reg.type = 'region' AND reg.name = m.region
  WHERE NOT EXISTS (
    SELECT 1 FROM public.locations x
     WHERE x.parent_id = reg.id AND x.type = 'municipality' AND x.name = m.municipality
  );
END $$;
