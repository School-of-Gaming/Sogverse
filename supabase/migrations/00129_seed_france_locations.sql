-- Seeds the operational France location hierarchy: the country row, the 18
-- régions and the 101 départements, from INSEE's Code officiel géographique 2026.
--
-- WHY THIS DEPTH AND NO DEEPER
--
-- France has 34,875 communes. They do not belong in this table — nothing
-- references most of them, and a table of reference rows nobody points at is a
-- payload on every read. Communes live in the shipped catalog
-- (src/lib/locations/catalog/fr.json) and are materialized into `locations` on
-- demand, the first time an admin picks one. Régions and départements are seeded
-- because they are the parents every materialized commune needs, and there are
-- only ~120 of them.
--
-- Départements use the `district` location_type — the level that sits between
-- `region` and `municipality` in the hierarchy. Finland skips it; France uses
-- it. Communes will arrive as `municipality`, sites under them as `site`.
--
-- NAMES
--
-- `name` holds the LIBELLE column: the official French name with its article and
-- typography intact ("L'Abergement-Clémenciat", "Côte-d'Or", "Île-de-France") —
-- the canonical native-language name, per the locations name/name_i18n
-- convention. No name_i18n entries: French *is* the canonical language for these
-- rows, and the convention forbids duplicating `name` into it.
--
-- Note the five DROM each appear twice under different codes and different
-- types — région '01' Guadeloupe contains département '971' Guadeloupe, and so
-- on for Martinique, Guyane, La Réunion and Mayotte. That is the real structure
-- of the COG (they are single-département régions), not a duplicate.
--
-- IDEMPOTENT
--
-- Every insert is NOT EXISTS-guarded on (country_code, type, external_code) —
-- the same key 00128's unique index enforces — so re-running inserts nothing.
-- Guarding on the code rather than the name matters here precisely because of
-- the DROM: a name guard would refuse to insert département Guadeloupe once
-- région Guadeloupe exists.
--
-- Data-only migration: no schema change, no type/grant change.

DO $$
DECLARE
  fr_id uuid;
BEGIN
  -- 1. Country: get-or-create France. The COG has no country-level code, so the
  --    row keeps external_code NULL.
  SELECT id INTO fr_id
    FROM public.locations
   WHERE type = 'country' AND country_code = 'FR'
   LIMIT 1;

  IF fr_id IS NULL THEN
    INSERT INTO public.locations (name, type, parent_id, country_code)
    VALUES ('France', 'country', NULL, 'FR')
    RETURNING id INTO fr_id;
  END IF;

  -- 2. Régions (18), children of the country row.
  INSERT INTO public.locations (name, type, parent_id, country_code, external_code)
  SELECT r.name, 'region', fr_id, 'FR', r.code
  FROM (VALUES
    ('01', 'Guadeloupe'),
    ('02', 'Martinique'),
    ('03', 'Guyane'),
    ('04', 'La Réunion'),
    ('06', 'Mayotte'),
    ('11', 'Île-de-France'),
    ('24', 'Centre-Val de Loire'),
    ('27', 'Bourgogne-Franche-Comté'),
    ('28', 'Normandie'),
    ('32', 'Hauts-de-France'),
    ('44', 'Grand Est'),
    ('52', 'Pays de la Loire'),
    ('53', 'Bretagne'),
    ('75', 'Nouvelle-Aquitaine'),
    ('76', 'Occitanie'),
    ('84', 'Auvergne-Rhône-Alpes'),
    ('93', 'Provence-Alpes-Côte d''Azur'),
    ('94', 'Corse')
  ) AS r(code, name)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.locations l
     WHERE l.country_code = 'FR' AND l.type = 'region' AND l.external_code = r.code
  );

  -- 3. Départements (101, DROM included), each joined to its région by the
  --    région code the COG gives it.
  INSERT INTO public.locations (name, type, parent_id, country_code, external_code)
  SELECT d.name, 'district', reg.id, 'FR', d.code
  FROM (VALUES
    ('01', 'Ain', '84'),
    ('02', 'Aisne', '32'),
    ('03', 'Allier', '84'),
    ('04', 'Alpes-de-Haute-Provence', '93'),
    ('05', 'Hautes-Alpes', '93'),
    ('06', 'Alpes-Maritimes', '93'),
    ('07', 'Ardèche', '84'),
    ('08', 'Ardennes', '44'),
    ('09', 'Ariège', '76'),
    ('10', 'Aube', '44'),
    ('11', 'Aude', '76'),
    ('12', 'Aveyron', '76'),
    ('13', 'Bouches-du-Rhône', '93'),
    ('14', 'Calvados', '28'),
    ('15', 'Cantal', '84'),
    ('16', 'Charente', '75'),
    ('17', 'Charente-Maritime', '75'),
    ('18', 'Cher', '24'),
    ('19', 'Corrèze', '75'),
    ('21', 'Côte-d''Or', '27'),
    ('22', 'Côtes-d''Armor', '53'),
    ('23', 'Creuse', '75'),
    ('24', 'Dordogne', '75'),
    ('25', 'Doubs', '27'),
    ('26', 'Drôme', '84'),
    ('27', 'Eure', '28'),
    ('28', 'Eure-et-Loir', '24'),
    ('29', 'Finistère', '53'),
    ('2A', 'Corse-du-Sud', '94'),
    ('2B', 'Haute-Corse', '94'),
    ('30', 'Gard', '76'),
    ('31', 'Haute-Garonne', '76'),
    ('32', 'Gers', '76'),
    ('33', 'Gironde', '75'),
    ('34', 'Hérault', '76'),
    ('35', 'Ille-et-Vilaine', '53'),
    ('36', 'Indre', '24'),
    ('37', 'Indre-et-Loire', '24'),
    ('38', 'Isère', '84'),
    ('39', 'Jura', '27'),
    ('40', 'Landes', '75'),
    ('41', 'Loir-et-Cher', '24'),
    ('42', 'Loire', '84'),
    ('43', 'Haute-Loire', '84'),
    ('44', 'Loire-Atlantique', '52'),
    ('45', 'Loiret', '24'),
    ('46', 'Lot', '76'),
    ('47', 'Lot-et-Garonne', '75'),
    ('48', 'Lozère', '76'),
    ('49', 'Maine-et-Loire', '52'),
    ('50', 'Manche', '28'),
    ('51', 'Marne', '44'),
    ('52', 'Haute-Marne', '44'),
    ('53', 'Mayenne', '52'),
    ('54', 'Meurthe-et-Moselle', '44'),
    ('55', 'Meuse', '44'),
    ('56', 'Morbihan', '53'),
    ('57', 'Moselle', '44'),
    ('58', 'Nièvre', '27'),
    ('59', 'Nord', '32'),
    ('60', 'Oise', '32'),
    ('61', 'Orne', '28'),
    ('62', 'Pas-de-Calais', '32'),
    ('63', 'Puy-de-Dôme', '84'),
    ('64', 'Pyrénées-Atlantiques', '75'),
    ('65', 'Hautes-Pyrénées', '76'),
    ('66', 'Pyrénées-Orientales', '76'),
    ('67', 'Bas-Rhin', '44'),
    ('68', 'Haut-Rhin', '44'),
    ('69', 'Rhône', '84'),
    ('70', 'Haute-Saône', '27'),
    ('71', 'Saône-et-Loire', '27'),
    ('72', 'Sarthe', '52'),
    ('73', 'Savoie', '84'),
    ('74', 'Haute-Savoie', '84'),
    ('75', 'Paris', '11'),
    ('76', 'Seine-Maritime', '28'),
    ('77', 'Seine-et-Marne', '11'),
    ('78', 'Yvelines', '11'),
    ('79', 'Deux-Sèvres', '75'),
    ('80', 'Somme', '32'),
    ('81', 'Tarn', '76'),
    ('82', 'Tarn-et-Garonne', '76'),
    ('83', 'Var', '93'),
    ('84', 'Vaucluse', '93'),
    ('85', 'Vendée', '52'),
    ('86', 'Vienne', '75'),
    ('87', 'Haute-Vienne', '75'),
    ('88', 'Vosges', '44'),
    ('89', 'Yonne', '27'),
    ('90', 'Territoire de Belfort', '27'),
    ('91', 'Essonne', '11'),
    ('92', 'Hauts-de-Seine', '11'),
    ('93', 'Seine-Saint-Denis', '11'),
    ('94', 'Val-de-Marne', '11'),
    ('95', 'Val-d''Oise', '11'),
    ('971', 'Guadeloupe', '01'),
    ('972', 'Martinique', '02'),
    ('973', 'Guyane', '03'),
    ('974', 'La Réunion', '04'),
    ('976', 'Mayotte', '06')
  ) AS d(code, name, region_code)
  JOIN public.locations reg
    ON reg.country_code = 'FR'
   AND reg.type = 'region'
   AND reg.external_code = d.region_code
  WHERE NOT EXISTS (
    SELECT 1 FROM public.locations l
     WHERE l.country_code = 'FR' AND l.type = 'district' AND l.external_code = d.code
  );
END;
$$;

-- Fail the migration if the seed did not land whole. A partial France seed is a
-- broken parent chain for every commune materialized later, and it is far
-- cheaper to catch here than at the first admin who cannot find a département.
DO $$
DECLARE
  n_regions   integer;
  n_districts integer;
  orphans     integer;
BEGIN
  SELECT count(*) INTO n_regions
    FROM public.locations
   WHERE country_code = 'FR' AND type = 'region' AND external_code IS NOT NULL;

  SELECT count(*) INTO n_districts
    FROM public.locations
   WHERE country_code = 'FR' AND type = 'district' AND external_code IS NOT NULL;

  IF n_regions <> 18 OR n_districts <> 101 THEN
    RAISE EXCEPTION
      'France seed incomplete: expected 18 régions and 101 départements with codes, found % and %',
      n_regions, n_districts;
  END IF;

  SELECT count(*) INTO orphans
    FROM public.locations d
    JOIN public.locations r ON r.id = d.parent_id
   WHERE d.country_code = 'FR' AND d.type = 'district'
     AND (r.type <> 'region' OR r.country_code <> 'FR');

  IF orphans > 0 THEN
    RAISE EXCEPTION 'France seed: % département rows are not parented to a FR région', orphans;
  END IF;
END;
$$;
