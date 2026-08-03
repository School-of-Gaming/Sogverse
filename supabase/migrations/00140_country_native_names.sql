-- Country rows: the native name, plus the translations that actually exist.
--
-- The picker browses the tree from depth 0, so a country is now a row a parent
-- reads rather than a label the UI supplied from config. Every other row is
-- rendered through the shared resolver — `name_i18n[viewer locale] ?? name` —
-- and the two country rows were the only ones carrying no `name_i18n` at all.
-- A Finnish parent therefore saw "Finland" sitting above "Uusimaa" and
-- "Helsinki", which is the one word in the picker not in their language.
--
-- THE RULE THIS ENCODES
--
-- A place is labelled in its own language. The viewer's locale selects among
-- the names a place *has*; it does not translate them. That is why Helsinki
-- renders as Helsingfors in Swedish (both are legally the city's name) and why
-- nothing renders a French commune in Finnish (no such name exists).
--
-- Countries are the one level that takes translations, and not as an exception
-- to that rule but by the same test it rests on: **is there an authority
-- publishing a complete set of names for this level in this language, or would
-- we be inventing them?** ISO 3166 maintains country names in every locale we
-- ship — finite, authoritative, complete. No authority publishes English names
-- for 34,875 French communes, so below the country level nothing is translated.
--
-- Consistent with how the world already writes: an English timetable says
-- "Finland", never "Suomi", and "Tampere", never "Tammerfors".
--
-- WHAT IS DELIBERATELY ABSENT
--
-- A key equal to `name` is never stored — Finland carries no `fi`, France no
-- `fr` or `en` — because the resolver falls back to `name` for exactly those
-- viewers. And `tlh` is absent everywhere: Klingon is an easter egg for UI copy,
-- not a language anyone publishes place names in, so it falls back to the
-- native name, which is the honest answer.
--
-- KNOWN GAP, NOT ADDRESSED HERE
--
-- Finland's Swedish names are seeded only where they are *legal* — the
-- officially bilingual and Swedish-monolingual municipalities, 51 rows. A
-- Swedish-speaking family in Tampere says Tammerfors, and that name is not
-- here, because Tampere is monolingual Finnish by law. By the authority test
-- above those names probably do qualify (Kotus publishes Swedish names for
-- Finland), so this is a narrower line than the rule warrants — but it is a
-- ~250-row data job with a source to validate first, not two rows. Tracked
-- separately; the country fix is what a parent sees on the first screen.
--
-- `search_blob` is generated from `name` and `name_i18n`, so both rows re-fold
-- on update and every name below becomes searchable for free: "suomi", "ranska"
-- and "frankrike" all find their country after this runs.

BEGIN;

UPDATE public.locations
   SET name = 'Suomi',
       name_i18n = jsonb_build_object(
         'sv', 'Finland',   -- the other official name: Finland is bilingual
         'en', 'Finland',   -- ISO 3166
         'fr', 'Finlande'   -- ISO 3166
       )
 WHERE type = 'country' AND country_code = 'FI';

UPDATE public.locations
   SET name = 'France',
       name_i18n = jsonb_build_object(
         'fi', 'Ranska',    -- ISO 3166
         'sv', 'Frankrike'  -- ISO 3166
       )
 WHERE type = 'country' AND country_code = 'FR';

-- ---------------------------------------------------------------------------
-- Assertions — a country that reads wrong is visible on the picker's first
-- screen, so it fails here rather than there.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_fi public.locations%ROWTYPE;
  v_fr public.locations%ROWTYPE;
BEGIN
  SELECT * INTO v_fi FROM public.locations WHERE type = 'country' AND country_code = 'FI';
  SELECT * INTO v_fr FROM public.locations WHERE type = 'country' AND country_code = 'FR';

  IF v_fi.id IS NULL OR v_fr.id IS NULL THEN
    RAISE EXCEPTION 'locations: a country row is missing — is the seed applied?';
  END IF;

  IF v_fi.name <> 'Suomi'
     OR v_fi.name_i18n ->> 'sv' <> 'Finland'
     OR v_fi.name_i18n ->> 'en' <> 'Finland'
     OR v_fi.name_i18n ->> 'fr' <> 'Finlande' THEN
    RAISE EXCEPTION 'locations: Finland did not land as native name plus its published translations';
  END IF;

  IF v_fr.name <> 'France'
     OR v_fr.name_i18n ->> 'fi' <> 'Ranska'
     OR v_fr.name_i18n ->> 'sv' <> 'Frankrike' THEN
    RAISE EXCEPTION 'locations: France did not land as native name plus its published translations';
  END IF;

  -- The convention the resolver depends on: a locale whose name equals `name`
  -- is absent, so it falls back rather than storing the same string twice.
  IF v_fi.name_i18n ? 'fi' OR v_fr.name_i18n ? 'fr' OR v_fr.name_i18n ? 'en' THEN
    RAISE EXCEPTION 'locations: a country duplicates its own name into name_i18n';
  END IF;

  -- The generated column really did re-fold, so the new names are findable.
  IF v_fi.search_blob NOT LIKE '%suomi%'
     OR v_fi.search_blob NOT LIKE '%finland%'
     OR v_fr.search_blob NOT LIKE '%ranska%' THEN
    RAISE EXCEPTION 'locations: search_blob did not pick up the new country names';
  END IF;
END;
$$;

COMMIT;
