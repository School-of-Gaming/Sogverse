--
-- Name: apply_landing_pictures(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_landing_pictures() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
DECLARE
  c_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_section  jsonb;
  v_ref      text;
  v_path     text;
  v_purpose  public.catalogue_image_purpose;
  v_first    public.catalogue_image_purpose;
  v_takes    public.catalogue_image_purpose[];
  v_pictures jsonb := '{}'::jsonb;
BEGIN
  IF jsonb_typeof(NEW.sections) = 'array' THEN
    FOR v_section IN
      SELECT s.e FROM jsonb_array_elements(NEW.sections) WITH ORDINALITY AS s(e, n) ORDER BY s.n
    LOOP
      -- The shapes this section's type takes. Held equal to the section
      -- registry's declaration by a DB test.
      v_takes := CASE v_section->>'type'
        WHEN 'hero' THEN ARRAY['landing_image']::public.catalogue_image_purpose[]
        ELSE ARRAY['landing_image', 'landing_square_image', 'landing_portrait_image']::public.catalogue_image_purpose[]
      END;
      v_first := NULL;

      FOR v_ref IN
        SELECT r.ref FROM (
          SELECT v_section->>'imageId' AS ref, 0::bigint AS n
           WHERE jsonb_typeof(v_section->'imageId') = 'string'
          UNION ALL
          SELECT i.e->>'imageId', i.n
            FROM jsonb_array_elements(
                   CASE WHEN jsonb_typeof(v_section->'images') = 'array' THEN v_section->'images' ELSE '[]'::jsonb END
                 ) WITH ORDINALITY AS i(e, n)
           WHERE jsonb_typeof(i.e->'imageId') = 'string'
        ) AS r
        ORDER BY r.n
      LOOP
        v_path := NULL;
        IF v_ref ~ c_uuid THEN
          SELECT path, purpose INTO v_path, v_purpose
            FROM public.catalogue_images
           WHERE id = v_ref::uuid;
        END IF;

        -- The reachable cause is an entry another admin removed after this
        -- one was chosen; saving without the picture would be the worst answer.
        IF v_path IS NULL THEN
          RAISE EXCEPTION 'That picture is no longer in the catalogue (catalogue_images row %)', v_ref
            USING ERRCODE = 'foreign_key_violation';
        END IF;

        -- An entry of another purpose lives in another bucket, cut for
        -- another frame. The uploader and the picker offer only landing
        -- pictures; this refuses loudly the state they cannot produce.
        IF v_purpose NOT IN ('landing_image', 'landing_square_image', 'landing_portrait_image') THEN
          RAISE EXCEPTION 'That picture is a % picture, and a landing page shows only landing pictures (catalogue_images row %)', v_purpose, v_ref
            USING ERRCODE = 'check_violation';
        END IF;

        IF NOT v_purpose = ANY (v_takes) THEN
          RAISE EXCEPTION 'A hero section''s picture must be wide 16:9, because it is the page''s link preview, and that picture is % (catalogue_images row %)',
            CASE v_purpose WHEN 'landing_square_image' THEN 'square 1:1' ELSE 'portrait 4:5' END, v_ref
            USING ERRCODE = 'check_violation';
        END IF;

        IF v_first IS NULL THEN
          v_first := v_purpose;
        ELSIF v_purpose <> v_first THEN
          RAISE EXCEPTION 'The pictures of an image section must all be one shape so they line up, and section % has a % picture beside a % one (catalogue_images row %)',
            v_section->>'id',
            CASE v_first WHEN 'landing_image' THEN 'wide 16:9' WHEN 'landing_square_image' THEN 'square 1:1' ELSE 'portrait 4:5' END,
            CASE v_purpose WHEN 'landing_image' THEN 'wide 16:9' WHEN 'landing_square_image' THEN 'square 1:1' ELSE 'portrait 4:5' END,
            v_ref
            USING ERRCODE = 'check_violation';
        END IF;

        v_pictures := v_pictures
          || jsonb_build_object(v_ref, jsonb_build_object('path', v_path, 'purpose', v_purpose));
      END LOOP;
    END LOOP;
  END IF;

  NEW.pictures := v_pictures;
  RETURN NEW;
END;
$_$;


--
-- Name: FUNCTION apply_landing_pictures(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.apply_landing_pictures() IS 'BEFORE INSERT OR UPDATE on landing_pages and landing_page_publications: pictures is derived from every catalogue entry the sections name (a section''s imageId, an image section''s images[].imageId), as {entry id: {path, purpose}} — the purpose is the picture''s shape and names its bucket. No branch keeps a statement-supplied value and the triggers carry no column list, so this is the column''s only writer. Refuses an entry that is gone (23503); one that is not a landing picture (landing_image, landing_square_image or landing_portrait_image); a hero picture that is not wide (landing_image), since it is the page''s link preview; and a section whose pictures are not all one purpose (each 23514).';


--
-- Name: FUNCTION apply_landing_pictures(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.apply_landing_pictures() FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_landing_pictures() TO service_role;


