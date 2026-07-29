-- Hardens two assertions that earlier, already-applied migrations left softer
-- than the architecture now demands. Applied migrations are history and are
-- never edited; this migration re-states their guarantees at today's strength.
--
-- 1. FINLAND: EVERY SEEDED ROW CARRIES ITS OFFICIAL CODE — EXCEPTION, NOT WARNING
--
-- 00128 backfilled Statistics Finland codes onto the FI rows and only RAISEd a
-- WARNING for a row it could not match (it matched by name, and a rename would
-- have missed). That was fine when a code-less row was merely un-dedupable; it
-- is not fine now. The coverage editor classifies a code-less municipality as a
-- read-only "legacy" chip a gedu can remove but never re-add, and a catalog
-- tick on it refuses to save — so a single renamed kunta would quietly become
-- unpickable, with a warning in a push log as the only witness. France's seed
-- (00131) already raises on this condition; Finland must hold the same bar.
--
-- 2. FRANCE: THE ORPHAN CHECK CAN ACTUALLY SEE ORPHANS
--
-- 00129's assertion used an INNER JOIN to the parent row, so a district with a
-- NULL or dangling parent_id fell out of the join and counted as zero orphans —
-- a paranoia check blind to one of its cases. (Nothing 00129 inserts can hit
-- it; a hand-created row could.) Re-checked here with the LEFT JOIN shape
-- 00131 uses, for both districts under régions and municipalities under
-- districts.
--
-- Assertion-only: no data change, no schema change, re-runnable by nature.

DO $$
DECLARE
  codeless  text[];
  orphans   integer;
BEGIN
  -- (1) Finland: no seeded level may be code-less.
  SELECT coalesce(array_agg(l.type || ' ' || l.name ORDER BY l.type, l.name), ARRAY[]::text[])
    INTO codeless
    FROM public.locations l
   WHERE l.country_code = 'FI'
     AND l.type IN ('region', 'municipality')
     AND l.external_code IS NULL;

  IF cardinality(codeless) > 0 THEN
    RAISE EXCEPTION
      'locations: % FI region/municipality rows have no external_code (%) — a renamed row missed the 00128 backfill; stamp it by hand before proceeding',
      cardinality(codeless), array_to_string(codeless, ', ');
  END IF;

  -- (2) France: every district hangs off an FR région...
  SELECT count(*) INTO orphans
    FROM public.locations d
    LEFT JOIN public.locations r ON r.id = d.parent_id
   WHERE d.country_code = 'FR' AND d.type = 'district'
     AND (r.id IS NULL OR r.type <> 'region' OR r.country_code <> 'FR');

  IF orphans > 0 THEN
    RAISE EXCEPTION 'locations: % FR district rows are not parented to an FR région', orphans;
  END IF;

  -- ...and every commune off an FR district.
  SELECT count(*) INTO orphans
    FROM public.locations m
    LEFT JOIN public.locations d ON d.id = m.parent_id
   WHERE m.country_code = 'FR' AND m.type = 'municipality'
     AND (d.id IS NULL OR d.type <> 'district' OR d.country_code <> 'FR');

  IF orphans > 0 THEN
    RAISE EXCEPTION 'locations: % FR municipality rows are not parented to an FR département', orphans;
  END IF;
END;
$$;
