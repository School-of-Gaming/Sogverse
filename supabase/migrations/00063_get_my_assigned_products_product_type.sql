-- Migration: add product_type to get_my_assigned_products
-- Description: The new gedu session-details page lives under one of three URL
--              prefixes — /gedu/clubs/[id], /gedu/camps/[id], or
--              /gedu/events/[id] — picked from the product's product_type
--              (consumer_club + municipality_club → clubs, camp → camps,
--              event → events). The dashboard cards build that link at render
--              time, so the RPC powering the dashboard needs to surface the
--              product_type alongside the other product shell columns. Body-
--              Adds a column to the RETURNS TABLE, which Postgres rejects via
--              CREATE OR REPLACE ("cannot change return type of existing
--              function"), so DROP + CREATE. Aggregates and security model
--              from 00061/00062 are unchanged; the GRANT below mirrors the
--              one shipped in 00061.

DROP FUNCTION IF EXISTS get_my_assigned_products();

CREATE OR REPLACE FUNCTION get_my_assigned_products()
RETURNS TABLE (
  product_id           UUID,
  group_id             UUID,
  timezone             TEXT,
  start_date           DATE,
  end_date             DATE,
  padlet_url           TEXT,
  is_remote            BOOLEAN,
  product_type         product_type_v2,
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
    p.id            AS product_id,
    a.group_id      AS group_id,
    p.timezone      AS timezone,
    p.start_date    AS start_date,
    p.end_date      AS end_date,
    p.padlet_url    AS padlet_url,
    p.is_remote     AS is_remote,
    p.product_type  AS product_type,
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
       WHERE part.product_id = p.id
         AND part.status     = 'active'
    ) AS gamer_count
  FROM gedu_group_assignments_v2 a
  JOIN products_v2 p ON p.id = a.product_id
  WHERE a.gedu_id = v_gedu_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_my_assigned_products() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_my_assigned_products() TO authenticated;
