--
-- Name: apply_landing_image_paths(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_landing_image_paths() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
DECLARE
  v_ref     text;
  v_path    text;
  v_purpose public.catalogue_image_purpose;
  v_paths   jsonb := '{}'::jsonb;
BEGIN
  IF jsonb_typeof(NEW.sections) = 'array' THEN
    FOR v_ref IN
      SELECT DISTINCT r.ref FROM (
        SELECT s.e->>'imageId' AS ref
          FROM jsonb_array_elements(NEW.sections) AS s(e)
         WHERE jsonb_typeof(s.e->'imageId') = 'string'
        UNION ALL
        SELECT i.e->>'imageId'
          FROM jsonb_array_elements(NEW.sections) AS s(e),
               jsonb_array_elements(
                 CASE WHEN jsonb_typeof(s.e->'images') = 'array' THEN s.e->'images' ELSE '[]'::jsonb END
               ) AS i(e)
         WHERE jsonb_typeof(i.e->'imageId') = 'string'
      ) AS r
    LOOP
      v_path := NULL;
      IF v_ref ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        SELECT path, purpose INTO v_path, v_purpose
          FROM public.catalogue_images
         WHERE id = v_ref::uuid;
      END IF;

      -- The reachable cause is an entry another admin removed after this one
      -- was chosen; saving without the picture would be the worst answer.
      IF v_path IS NULL THEN
        RAISE EXCEPTION 'That picture is no longer in the catalogue (catalogue_images row %)', v_ref
          USING ERRCODE = 'foreign_key_violation';
      END IF;

      -- An entry of another purpose lives in another bucket, cut for another
      -- frame. The picker offers only landing pictures; this refuses loudly
      -- the state it cannot produce.
      IF v_purpose <> 'landing_image' THEN
        RAISE EXCEPTION 'That picture is a % picture, and a landing page shows only landing_image ones (catalogue_images row %)', v_purpose, v_ref
          USING ERRCODE = 'check_violation';
      END IF;

      v_paths := v_paths || jsonb_build_object(v_ref, v_path);
    END LOOP;
  END IF;

  NEW.image_paths := v_paths;
  RETURN NEW;
END;
$_$;


--
-- Name: FUNCTION apply_landing_image_paths(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.apply_landing_image_paths() IS 'BEFORE INSERT OR UPDATE on landing_pages and landing_page_publications: image_paths is derived from every catalogue entry the sections name (a section''s imageId, an image section''s images[].imageId), as {entry id: path}. No branch keeps a statement-supplied value and the triggers carry no column list, so this is the column''s only writer. Refuses an entry that is gone (23503) or whose purpose is not landing_image (23514).';


--
-- Name: FUNCTION apply_landing_image_paths(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.apply_landing_image_paths() FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_landing_image_paths() TO service_role;


