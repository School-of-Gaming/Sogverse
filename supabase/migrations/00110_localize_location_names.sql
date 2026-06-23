-- Add localized display names for locations.
--
-- Why: a location's `name` is the canonical native-language name (Finnish for FI
-- rows, English for UK/US, ...). A Swedish-speaking parent browsing the /schools
-- page expects "Helsingfors", "Nyland", "Åbo" — not the Finnish forms. Rather
-- than enumerate one column per locale (name_sv, name_ca, ...), a single jsonb
-- `name_i18n` holds locale -> name overrides for the (few) rows that differ; the
-- app resolves `name_i18n[locale] ?? name`, so every untranslated row, every site,
-- and every en/tlh viewer simply falls back to `name`.
--
-- Convention (documented in src/services/locations/CLAUDE.md): `name` stays the
-- native-language name and is NOT duplicated into name_i18n. Only alternate-locale
-- forms go in the json. Finland's own fi names therefore live in `name`, not under
-- a "fi" key.
--
-- Data backfilled here: the official Swedish names of Finland's 19 regions and 33
-- bilingual municipalities, per the Institute for the Languages of Finland (Kotus)
-- and the Government Decree on municipalities' linguistic status (Finlex 1385/2022).
-- Rows whose Swedish name equals the Finnish (Satakunta; Korsnäs; Åland's 15
-- Swedish-only municipalities, already stored in Swedish) get no entry.
--
-- IDEMPOTENT: the UPDATE matches by (country_code, type, name) — environment-stable,
-- unlike ids — and the `IS DISTINCT FROM` guard skips rows already set, so re-runs
-- touch nothing. Column add is plain ALTER (no-op if it somehow already exists is
-- NOT guaranteed by ADD COLUMN, so this migration must run exactly once like any
-- schema migration; the *data* step is the re-runnable part).
--
-- Access control: name_i18n is a new column on an already-granted, already-readable
-- table — no new GRANT, no RLS change.

ALTER TABLE public.locations ADD COLUMN name_i18n jsonb;

COMMENT ON COLUMN public.locations.name_i18n IS
  'Locale -> display-name overrides (e.g. {"sv":"Helsingfors"}). Resolve as '
  'name_i18n[locale] ?? name. `name` holds the canonical native-language name and '
  'is never duplicated here.';

UPDATE public.locations AS l
   SET name_i18n = jsonb_build_object('sv', v.sv),
       updated_at = NOW()
  FROM (VALUES
    -- Regions (maakunnat -> landskap). Satakunta omitted (identical in both).
    ('region', 'Uusimaa', 'Nyland'),
    ('region', 'Varsinais-Suomi', 'Egentliga Finland'),
    ('region', 'Kanta-Häme', 'Egentliga Tavastland'),
    ('region', 'Pirkanmaa', 'Birkaland'),
    ('region', 'Päijät-Häme', 'Päijänne-Tavastland'),
    ('region', 'Kymenlaakso', 'Kymmenedalen'),
    ('region', 'Etelä-Karjala', 'Södra Karelen'),
    ('region', 'Etelä-Savo', 'Södra Savolax'),
    ('region', 'Pohjois-Savo', 'Norra Savolax'),
    ('region', 'Pohjois-Karjala', 'Norra Karelen'),
    ('region', 'Keski-Suomi', 'Mellersta Finland'),
    ('region', 'Etelä-Pohjanmaa', 'Södra Österbotten'),
    ('region', 'Pohjanmaa', 'Österbotten'),
    ('region', 'Keski-Pohjanmaa', 'Mellersta Österbotten'),
    ('region', 'Pohjois-Pohjanmaa', 'Norra Österbotten'),
    ('region', 'Kainuu', 'Kajanaland'),
    ('region', 'Lappi', 'Lappland'),
    ('region', 'Ahvenanmaa', 'Åland'),
    -- Municipalities (kunnat) with a distinct official Swedish name (33).
    ('municipality', 'Espoo', 'Esbo'),
    ('municipality', 'Hanko', 'Hangö'),
    ('municipality', 'Helsinki', 'Helsingfors'),
    ('municipality', 'Inkoo', 'Ingå'),
    ('municipality', 'Kauniainen', 'Grankulla'),
    ('municipality', 'Kirkkonummi', 'Kyrkslätt'),
    ('municipality', 'Lapinjärvi', 'Lappträsk'),
    ('municipality', 'Lohja', 'Lojo'),
    ('municipality', 'Loviisa', 'Lovisa'),
    ('municipality', 'Myrskylä', 'Mörskom'),
    ('municipality', 'Porvoo', 'Borgå'),
    ('municipality', 'Raasepori', 'Raseborg'),
    ('municipality', 'Sipoo', 'Sibbo'),
    ('municipality', 'Siuntio', 'Sjundeå'),
    ('municipality', 'Vantaa', 'Vanda'),
    ('municipality', 'Kemiönsaari', 'Kimitoön'),
    ('municipality', 'Parainen', 'Pargas'),
    ('municipality', 'Turku', 'Åbo'),
    ('municipality', 'Pyhtää', 'Pyttis'),
    ('municipality', 'Kaskinen', 'Kaskö'),
    ('municipality', 'Kristiinankaupunki', 'Kristinestad'),
    ('municipality', 'Kruunupyy', 'Kronoby'),
    ('municipality', 'Luoto', 'Larsmo'),
    ('municipality', 'Maalahti', 'Malax'),
    ('municipality', 'Mustasaari', 'Korsholm'),
    ('municipality', 'Närpiö', 'Närpes'),
    ('municipality', 'Pedersören kunta', 'Pedersöre'),
    ('municipality', 'Pietarsaari', 'Jakobstad'),
    ('municipality', 'Uusikaarlepyy', 'Nykarleby'),
    ('municipality', 'Vöyri', 'Vörå'),
    ('municipality', 'Vaasa', 'Vasa'),
    ('municipality', 'Kokkola', 'Karleby'),
    ('municipality', 'Maarianhamina', 'Mariehamn')
  ) AS v(loc_type, fi, sv)
 WHERE l.country_code = 'FI'
   AND l.type = v.loc_type::public.location_type
   AND l.name = v.fi
   AND l.name_i18n IS DISTINCT FROM jsonb_build_object('sv', v.sv);
