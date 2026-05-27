-- Migration: get_my_assigned_products RPC
-- Description: SECURITY DEFINER read powering the gedu dashboard's
--              "My Groups" section. Returns one row per
--              gedu_group_assignments_v2 row for the caller (auth.uid()=gedu)
--              joined with the product shell — translations, slots,
--              timezone, padlet, start/end dates, is_remote — plus the
--              gedu's own assigned group_id and two product-wide
--              aggregates: group_count (every product_groups_v2 row for
--              the product) and gamer_count (every active participation
--              across those groups).
--
--              The aggregates are intentionally product-wide, not gedu-
--              scoped. Per redesign §4.10 a gedu's reach on a product
--              spans every group in it (cross-group voice mobility), and
--              the dashboard card reflects that: "{n} groups · {m} gamers"
--              describes the whole product the gedu serves on. Sibling
--              groups + sibling participations aren't readable through
--              the table-level RLS shipped in 00049/00050 (which only
--              opens the gedu's own assignment + own group), so the
--              aggregate has to bypass RLS — SECURITY DEFINER is the
--              same pattern get_gedu_product_detail_v2 uses for the
--              detail view.
--
--              Translations / slots are returned as jsonb arrays so the
--              service can pass them straight through to the existing
--              resolve-translation + slot-expansion helpers without
--              another round trip. Column names inside the arrays match
--              the underlying tables (snake_case); the TS service
--              layer adapts to the camelCase shape the UI consumes.

CREATE OR REPLACE FUNCTION get_my_assigned_products()
RETURNS TABLE (
  product_id           UUID,
  group_id             UUID,
  timezone             TEXT,
  start_date           DATE,
  end_date             DATE,
  padlet_url           TEXT,
  is_remote            BOOLEAN,
  product_translations JSONB,
  schedule_slots       JSONB,
  group_count          INTEGER,
  gamer_count          INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_gedu_id UUID := (SELECT auth.uid());
BEGIN
  IF (SELECT get_user_role()) <> 'gedu' THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id          AS product_id,
    a.group_id    AS group_id,
    p.timezone    AS timezone,
    p.start_date  AS start_date,
    p.end_date    AS end_date,
    p.padlet_url  AS padlet_url,
    p.is_remote   AS is_remote,
    COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'locale',      pt.locale,
                 'name',        pt.name,
                 'description', pt.description
               )
             )
        FROM product_translations_v2 pt
       WHERE pt.product_id = p.id
    ), '[]'::jsonb) AS product_translations,
    COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'weekday',          ss.weekday,
                 'start_time',       to_char(ss.start_time, 'HH24:MI:SS'),
                 'duration_minutes', ss.duration_minutes
               )
               ORDER BY ss.weekday, ss.start_time
             )
        FROM schedule_slots_v2 ss
       WHERE ss.product_id = p.id
    ), '[]'::jsonb) AS schedule_slots,
    (
      SELECT COUNT(*)::INTEGER
        FROM product_groups_v2 pg
       WHERE pg.product_id = p.id
    ) AS group_count,
    (
      SELECT COUNT(*)::INTEGER
        FROM participations_v2 part
        JOIN product_groups_v2 pg2 ON pg2.id = part.group_id
       WHERE pg2.product_id = p.id
         AND part.status    = 'active'
    ) AS gamer_count
  FROM gedu_group_assignments_v2 a
  JOIN products_v2 p ON p.id = a.product_id
  WHERE a.gedu_id = v_gedu_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_my_assigned_products() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_my_assigned_products() TO authenticated;
