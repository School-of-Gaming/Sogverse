--
-- Name: location_lineage(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.location_lineage(p_location_id uuid) RETURNS TABLE(location_id uuid, distance integer)
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
DECLARE
  v_id     uuid := p_location_id;
  v_parent uuid;
  v_seen   uuid[] := '{}';
BEGIN
  WHILE v_id IS NOT NULL LOOP
    IF v_id = ANY (v_seen) THEN
      RAISE EXCEPTION 'locations form a loop through %, climbing from %', v_id, p_location_id
        USING ERRCODE = 'data_corrupted';
    END IF;

    SELECT l.parent_id INTO v_parent
      FROM public.locations l
     WHERE l.id = v_id;

    -- Only the starting id can name no row: every parent_id is held to an
    -- existing row by its foreign key.
    IF NOT FOUND THEN
      RETURN;
    END IF;

    location_id := v_id;
    distance := cardinality(v_seen);
    RETURN NEXT;

    v_seen := v_seen || v_id;
    v_id := v_parent;
  END LOOP;
END;
$$;


--
-- Name: FUNCTION location_lineage(p_location_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.location_lineage(p_location_id uuid) IS 'A place and every place above it, as (location_id, distance): the place itself at distance 0, its parent at 1, up to the country. Empty for NULL or an id no place has. The one way any reader climbs the location tree, and it climbs through retired rows, which still sit where they sat. Raises data_corrupted on a loop rather than stopping at some depth and answering with a chain that looks right: trg_locations_refuse_loop keeps loops from being written, so meeting one means that guarantee broke, and nothing built on the tree can be trusted until it is repaired. SECURITY INVOKER over locations, which anon and authenticated read in full; granted to both because search_locations runs as its caller and calls it, and because an admin''s write to locations runs the loop trigger, which calls it, as that admin.';


--
-- Name: FUNCTION location_lineage(p_location_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.location_lineage(p_location_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.location_lineage(p_location_id uuid) TO anon;
GRANT ALL ON FUNCTION public.location_lineage(p_location_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.location_lineage(p_location_id uuid) TO service_role;


