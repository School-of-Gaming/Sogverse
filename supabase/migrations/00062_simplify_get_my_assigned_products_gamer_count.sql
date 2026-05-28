-- Migration: simplify get_my_assigned_products gamer_count subquery
-- Description: The original gamer_count in 00061 joined participations_v2
--              through product_groups_v2 on group_id, then filtered on
--              pg2.product_id = p.id and part.status = 'active'. Cleaner
--              shape: participations_v2 carries product_id directly, and
--              idx_participations_v2_active (00039) is a partial index on
--              (product_id) WHERE status = 'active' — exactly what this
--              count wants. Drop the join, hit the partial index directly.
--              Function signature, grants, and security model are
--              unchanged; this is a body-only rewrite via CREATE OR
--              REPLACE.

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
       WHERE part.product_id = p.id
         AND part.status     = 'active'
    ) AS gamer_count
  FROM gedu_group_assignments_v2 a
  JOIN products_v2 p ON p.id = a.product_id
  WHERE a.gedu_id = v_gedu_id;
END;
$$;
