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
  v_sections jsonb := CASE WHEN jsonb_typeof(NEW.sections) = 'array' THEN NEW.sections ELSE '[]'::jsonb END;
  v_shares  uuid[];
BEGIN
  -- The copy's versions' share pictures: the working versions for the working
  -- copy, the live ones for the published copy.
  IF TG_TABLE_NAME = 'landing_pages' THEN
    SELECT array_agg(share_image_id) INTO v_shares
      FROM public.landing_page_translations
     WHERE page_id = NEW.id AND share_image_id IS NOT NULL;
  ELSE
    SELECT array_agg(share_image_id) INTO v_shares
      FROM public.landing_page_publication_translations
     WHERE page_id = NEW.page_id AND share_image_id IS NOT NULL;
  END IF;

  FOR v_ref IN
    SELECT DISTINCT r.ref FROM (
      SELECT s.e->>'imageId' AS ref
        FROM jsonb_array_elements(v_sections) AS s(e)
       WHERE jsonb_typeof(s.e->'imageId') = 'string'
      UNION ALL
      SELECT i.e->>'imageId'
        FROM jsonb_array_elements(v_sections) AS s(e),
             jsonb_array_elements(
               CASE WHEN jsonb_typeof(s.e->'images') = 'array' THEN s.e->'images' ELSE '[]'::jsonb END
             ) AS i(e)
       WHERE jsonb_typeof(i.e->'imageId') = 'string'
      UNION ALL
      SELECT u.id::text
        FROM unnest(COALESCE(v_shares, '{}'::uuid[])) AS u(id)
    ) AS r
  LOOP
    v_path := NULL;
    IF v_ref ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      -- Locked so a removal of this entry waits for this save to commit, and
      -- its unlink then sees the rows this save wrote: unlocked, a removal
      -- racing the save leaves a picture named that no longer exists.
      SELECT path, purpose INTO v_path, v_purpose
        FROM public.catalogue_images
       WHERE id = v_ref::uuid
         FOR KEY SHARE;
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

  NEW.image_paths := v_paths;
  RETURN NEW;
END;
$_$;


--
-- Name: FUNCTION apply_landing_image_paths(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.apply_landing_image_paths() IS 'BEFORE INSERT OR UPDATE on landing_pages and landing_page_publications: image_paths is derived from every catalogue entry the copy names (a section''s imageId, an image section''s images[].imageId, and the share_image_id of each of the copy''s versions), as {entry id: path}. No branch keeps a statement-supplied value and the triggers carry no column list, so this is the column''s only writer; refresh_landing_image_paths re-runs it when a version''s share picture changes. Refuses an entry that is gone (23503) or whose purpose is not landing_image (23514).';


--
-- Name: FUNCTION apply_landing_image_paths(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.apply_landing_image_paths() FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_landing_image_paths() TO service_role;


