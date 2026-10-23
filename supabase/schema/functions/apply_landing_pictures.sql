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
  v_n        bigint;
  v_ref      text;
  v_path     text;
  v_purpose  public.catalogue_image_purpose;
  v_first    public.catalogue_image_purpose;
  v_takes    public.catalogue_image_purpose[];
  v_words    text;
  v_beside   text;
  v_pictures jsonb := '{}'::jsonb;
  v_share    uuid;
  v_shares   uuid[];
BEGIN
  IF jsonb_typeof(NEW.sections) = 'array' THEN
    FOR v_section, v_n IN
      SELECT s.e, s.n FROM jsonb_array_elements(NEW.sections) WITH ORDINALITY AS s(e, n) ORDER BY s.n
    LOOP
      -- The shapes this section's type takes. Held equal to the section
      -- registry's declaration by a DB test.
      v_takes := CASE v_section->>'type'
        WHEN 'hero' THEN ARRAY['landing_image']::public.catalogue_image_purpose[]
        WHEN 'guide' THEN ARRAY['landing_image']::public.catalogue_image_purpose[]
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
          -- Locked so a removal of this entry waits for this save to commit,
          -- and its unlink then sees the rows this save wrote: unlocked, a
          -- removal racing the save leaves a picture named that no longer
          -- exists, which no tool can then clear. A removal locks the entry
          -- before the page, the opposite order, so the two can deadlock in
          -- that same window: one is aborted (40P01) and retried, which is
          -- loud where the dangling picture was silent.
          SELECT path, purpose INTO v_path, v_purpose
            FROM public.catalogue_images
           WHERE id = v_ref::uuid
             FOR KEY SHARE;
        END IF;

        -- Reached by an id an AI app sent that no entry has, and by an entry
        -- another admin removed after this one was chosen; saving without the
        -- picture would be the worst answer. The refusal says only that no
        -- entry has the id, which is true of both.
        IF v_path IS NULL THEN
          RAISE EXCEPTION 'No picture in the catalogue has the id %', v_ref
            USING ERRCODE = 'foreign_key_violation';
        END IF;

        -- An entry of another purpose lives in another bucket, cut for
        -- another frame. The uploader and the picker offer only landing
        -- pictures; this refuses loudly the state they cannot produce.
        IF v_purpose NOT IN ('landing_image', 'landing_square_image', 'landing_portrait_image') THEN
          CASE v_purpose
            WHEN 'product' THEN v_words := 'a product picture';
            WHEN 'library_cover' THEN v_words := 'a Library cover';
            WHEN 'spotlight_image' THEN v_words := 'a spotlight picture';
            ELSE RAISE EXCEPTION 'No words for the picture purpose %', v_purpose;
          END CASE;
          RAISE EXCEPTION 'The picture % is %, and a landing page shows only landing pictures',
            v_ref, v_words
            USING ERRCODE = 'check_violation';
        END IF;

        IF NOT v_purpose = ANY (v_takes) THEN
          CASE v_purpose
            WHEN 'landing_square_image' THEN v_words := 'square 1:1';
            WHEN 'landing_portrait_image' THEN v_words := 'portrait 4:5';
            ELSE RAISE EXCEPTION 'No words for the picture purpose %', v_purpose;
          END CASE;
          RAISE EXCEPTION 'A % section''s picture must be wide 16:9%, and the picture % is %',
            v_section->>'type',
            CASE v_section->>'type' WHEN 'hero' THEN ', because it is the page''s link preview' ELSE '' END,
            v_ref, v_words
            USING ERRCODE = 'check_violation';
        END IF;

        -- The section is named by its number from one, as the structure check
        -- names it: an AI app may never have seen its id.
        IF v_first IS NULL THEN
          v_first := v_purpose;
        ELSIF v_purpose <> v_first THEN
          CASE v_purpose
            WHEN 'landing_image' THEN v_words := 'wide 16:9';
            WHEN 'landing_square_image' THEN v_words := 'square 1:1';
            WHEN 'landing_portrait_image' THEN v_words := 'portrait 4:5';
            ELSE RAISE EXCEPTION 'No words for the picture purpose %', v_purpose;
          END CASE;
          CASE v_first
            WHEN 'landing_image' THEN v_beside := 'wide 16:9';
            WHEN 'landing_square_image' THEN v_beside := 'square 1:1';
            WHEN 'landing_portrait_image' THEN v_beside := 'portrait 4:5';
            ELSE RAISE EXCEPTION 'No words for the picture purpose %', v_first;
          END CASE;
          RAISE EXCEPTION 'The pictures of an image section must all be one shape so they line up, and in section % the picture % is % beside a % one',
            v_n, v_ref, v_words, v_beside
            USING ERRCODE = 'check_violation';
        END IF;

        v_pictures := v_pictures
          || jsonb_build_object(v_ref, jsonb_build_object('path', v_path, 'purpose', v_purpose));
      END LOOP;
    END LOOP;
  END IF;

  -- The copy's versions' share pictures: the working versions for the working
  -- copy, the live ones for the published copy. Each is wide, as the hero's
  -- picture is, because the link preview it stands for is drawn at 16:9.
  -- Read per table, since only the published copy's row has a page_id.
  IF TG_TABLE_NAME = 'landing_pages' THEN
    SELECT array_agg(DISTINCT share_image_id) INTO v_shares
      FROM public.landing_page_translations
     WHERE page_id = NEW.id AND share_image_id IS NOT NULL;
  ELSE
    SELECT array_agg(DISTINCT share_image_id) INTO v_shares
      FROM public.landing_page_publication_translations
     WHERE page_id = NEW.page_id AND share_image_id IS NOT NULL;
  END IF;

  FOREACH v_share IN ARRAY COALESCE(v_shares, '{}'::uuid[])
  LOOP
    v_path := NULL;
    -- Locked for the same reason as a section's picture.
    SELECT path, purpose INTO v_path, v_purpose
      FROM public.catalogue_images
     WHERE id = v_share
       FOR KEY SHARE;

    IF v_path IS NULL THEN
      RAISE EXCEPTION 'No picture in the catalogue has the id %', v_share
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_purpose NOT IN ('landing_image', 'landing_square_image', 'landing_portrait_image') THEN
      CASE v_purpose
        WHEN 'product' THEN v_words := 'a product picture';
        WHEN 'library_cover' THEN v_words := 'a Library cover';
        WHEN 'spotlight_image' THEN v_words := 'a spotlight picture';
        ELSE RAISE EXCEPTION 'No words for the picture purpose %', v_purpose;
      END CASE;
      RAISE EXCEPTION 'The picture % is %, and a landing page shows only landing pictures',
        v_share, v_words
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_purpose <> 'landing_image' THEN
      CASE v_purpose
        WHEN 'landing_square_image' THEN v_words := 'square 1:1';
        WHEN 'landing_portrait_image' THEN v_words := 'portrait 4:5';
        ELSE RAISE EXCEPTION 'No words for the picture purpose %', v_purpose;
      END CASE;
      RAISE EXCEPTION 'A share picture must be wide 16:9, because it is the page''s link preview, and the picture % is %',
        v_share, v_words
        USING ERRCODE = 'check_violation';
    END IF;

    v_pictures := v_pictures
      || jsonb_build_object(v_share::text, jsonb_build_object('path', v_path, 'purpose', v_purpose));
  END LOOP;

  NEW.pictures := v_pictures;
  RETURN NEW;
END;
$_$;


--
-- Name: FUNCTION apply_landing_pictures(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.apply_landing_pictures() IS 'BEFORE INSERT OR UPDATE on landing_pages and landing_page_publications: pictures is derived from every catalogue entry the copy names (a hero, text or guide section''s imageId, an image section''s images[].imageId, and the share_image_id of each of the copy''s versions), as {entry id: {path, purpose}} — the purpose is the picture''s shape and names its bucket. No branch keeps a statement-supplied value and the triggers carry no column list, so this is the column''s only writer; refresh_landing_pictures re-runs it when a version''s share picture changes. Each entry is locked FOR KEY SHARE, so a racing removal waits and then unlinks what this write stored. Refuses an entry that is gone (23503); one that is not a landing picture (landing_image, landing_square_image or landing_portrait_image); a hero picture or a share picture that is not wide (landing_image), since each is the page''s link preview; a guide section''s picture that is not wide; and a section whose pictures are not all one purpose, naming the section by its number from one (each 23514). Each refusal names the picture by its catalogue id, the id the writer sent.';


--
-- Name: FUNCTION apply_landing_pictures(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.apply_landing_pictures() FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_landing_pictures() TO service_role;


