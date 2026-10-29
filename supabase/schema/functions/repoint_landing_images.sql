--
-- Name: repoint_landing_images(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.repoint_landing_images(p_from uuid, p_to uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_moved integer;
BEGIN
  PERFORM public.assert_admin();

  -- Moving pictures to no entry is a removal, which the catalogue does by
  -- deleting the entry; this function only ever moves them to another.
  IF p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION 'A repoint needs the entry being replaced and its replacement'
      USING ERRCODE = 'null_value_not_allowed';
  END IF;

  -- pictures names every version's share and hero pictures as well as the
  -- sections' pictures, so a copy whose only use of p_from is in a version is
  -- found and counted too; sections is set either way, which moves the
  -- working copy's last-saved time and saver as for any picture.
  WITH drafts AS (
    UPDATE public.landing_pages
       SET sections = public.landing_sections_repointed(sections, p_from, p_to)
     WHERE pictures ? p_from::text
    RETURNING id
  ),
  live AS (
    UPDATE public.landing_page_publications
       SET sections = public.landing_sections_repointed(sections, p_from, p_to)
     WHERE pictures ? p_from::text
    RETURNING page_id
  )
  SELECT count(*) INTO v_moved
    FROM (SELECT id FROM drafts UNION SELECT page_id FROM live) AS moved;

  -- The versions' pictures, once the copies have been found by them: each
  -- language's hero picture, in the words of the structure's first section,
  -- and its share picture. Each version moved re-derives its copy's
  -- pictures, which refuses a p_to that is gone, not a landing picture or
  -- not wide.
  UPDATE public.landing_page_translations AS t
     SET section_texts = jsonb_set(t.section_texts, ARRAY[p.sections->0->>'id', 'imageId'], to_jsonb(p_to::text))
    FROM public.landing_pages AS p
   WHERE p.id = t.page_id
     AND t.section_texts #>> ARRAY[p.sections->0->>'id', 'imageId'] = p_from::text;

  UPDATE public.landing_page_publication_translations AS t
     SET section_texts = jsonb_set(t.section_texts, ARRAY[p.sections->0->>'id', 'imageId'], to_jsonb(p_to::text))
    FROM public.landing_page_publications AS p
   WHERE p.page_id = t.page_id
     AND t.section_texts #>> ARRAY[p.sections->0->>'id', 'imageId'] = p_from::text;

  UPDATE public.landing_page_translations
     SET share_image_id = p_to
   WHERE share_image_id = p_from;

  UPDATE public.landing_page_publication_translations
     SET share_image_id = p_to
   WHERE share_image_id = p_from;

  RETURN v_moved;
END;
$$;


--
-- Name: FUNCTION repoint_landing_images(p_from uuid, p_to uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.repoint_landing_images(p_from uuid, p_to uuid) IS 'Admin-gated landing half of the image catalogue''s replace: points every landing page picture that is entry p_from — in the sections, or as any language''s hero picture (in its words) or share picture, working and published copies alike — at entry p_to, and returns how many pages moved (a page whose two copies both moved counts once). A live page''s picture changes without a republish. The catalogue''s replace hands it an entry of p_from''s own purpose, so a picture keeps its shape; the picture triggers re-derive each copy''s pictures and refuse a p_to that is gone, not a landing picture, or of a shape its section, a hero or a share picture does not take. Either argument NULL raises null_value_not_allowed. SECURITY DEFINER because no landing page table carries a write grant.';


--
-- Name: FUNCTION repoint_landing_images(p_from uuid, p_to uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.repoint_landing_images(p_from uuid, p_to uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.repoint_landing_images(p_from uuid, p_to uuid) TO authenticated;
GRANT ALL ON FUNCTION public.repoint_landing_images(p_from uuid, p_to uuid) TO service_role;


