--
-- Name: check_landing_product_picks(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_landing_product_picks() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
DECLARE
  c_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_before  text[] := ARRAY[]::text[];
  v_section bigint;
  v_id      text;
BEGIN
  IF TG_OP = 'UPDATE' AND jsonb_typeof(OLD.sections) = 'array' THEN
    SELECT COALESCE(array_agg(p.e #>> '{}'), ARRAY[]::text[]) INTO v_before
      FROM jsonb_array_elements(OLD.sections) AS s(e),
           jsonb_array_elements(
             CASE WHEN s.e->>'type' = 'products' AND jsonb_typeof(s.e->'productIds') = 'array'
                  THEN s.e->'productIds' ELSE '[]'::jsonb END
           ) AS p(e);
  END IF;

  IF jsonb_typeof(NEW.sections) IS DISTINCT FROM 'array' THEN
    RETURN NEW;
  END IF;

  SELECT pick.n, pick.id INTO v_section, v_id
    FROM (
      SELECT s.n, p.e #>> '{}' AS id
        FROM jsonb_array_elements(NEW.sections) WITH ORDINALITY AS s(e, n),
             jsonb_array_elements(
               CASE WHEN s.e->>'type' = 'products' AND jsonb_typeof(s.e->'productIds') = 'array'
                    THEN s.e->'productIds' ELSE '[]'::jsonb END
             ) AS p(e)
       WHERE jsonb_typeof(p.e) = 'string'
    ) AS pick
   WHERE NOT (pick.id = ANY (v_before))
     AND NOT EXISTS (
       SELECT 1 FROM public.products pr
        WHERE pr.id = CASE WHEN pick.id ~ c_uuid THEN pick.id::uuid END
     )
   ORDER BY pick.n
   LIMIT 1;

  IF v_id IS NOT NULL THEN
    RAISE EXCEPTION 'Section % picks the product %, and no product has that id', v_section, v_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$_$;


--
-- Name: FUNCTION check_landing_product_picks(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.check_landing_product_picks() IS 'BEFORE INSERT OR UPDATE OF sections on landing_pages (the working copy alone): refuses a save whose products sections pick an id no product has, with foreign_key_violation naming the section by its number from one and the id. Only ids the save adds are checked — on an update, a pick the stored structure already held is left alone — so a write that moves only the structure''s other contents (a catalogue picture''s replace or removal) is never refused by a pick it did not make. No foreign key can reach into the structure, which is why this is a trigger. The published copy has no such check: a stale pick is not an error, the public page leaves out whatever the shop''s listing does not hold.';


--
-- Name: FUNCTION check_landing_product_picks(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.check_landing_product_picks() FROM PUBLIC;
GRANT ALL ON FUNCTION public.check_landing_product_picks() TO service_role;


