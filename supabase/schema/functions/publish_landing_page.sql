--
-- Name: publish_landing_page(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.publish_landing_page(p_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_page public.landing_pages;
BEGIN
  PERFORM public.assert_admin();

  -- Locked, so a save racing this publish (which writes this row first) lands
  -- wholly before or wholly after the copy rather than half in it.
  SELECT * INTO v_page
    FROM public.landing_pages
   WHERE id = p_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Landing page not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- An incomplete version is not a refusal: it stays in the working copy.
  IF NOT EXISTS (SELECT 1 FROM public.landing_page_translations
                  WHERE page_id = p_id AND is_complete) THEN
    RAISE EXCEPTION 'The page cannot be published without a language version that has its title, summary, address and the text of every section written'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The structure is copied and the picture paths are not: the trigger
  -- derives the published copy's own.
  INSERT INTO public.landing_page_publications (page_id, sections, published_at, first_published_at)
  VALUES (v_page.id, v_page.sections, now(), now())
  ON CONFLICT (page_id) DO UPDATE SET
    sections     = EXCLUDED.sections,
    published_at = EXCLUDED.published_at;
  -- first_published_at is deliberately absent from the SET list: a republish
  -- of a live page keeps the date it first went live.

  -- The live version set becomes the complete working versions, whole.
  DELETE FROM public.landing_page_publication_translations
   WHERE page_id = p_id;

  INSERT INTO public.landing_page_publication_translations
         (page_id, locale, title, summary, slug, section_texts)
  SELECT page_id, locale, title, summary, slug, section_texts
    FROM public.landing_page_translations
   WHERE page_id = p_id
     AND is_complete;

  -- From now on these languages' addresses are fixed.
  UPDATE public.landing_page_translations
     SET first_published_at = now()
   WHERE page_id = p_id
     AND is_complete
     AND first_published_at IS NULL;

  RETURN p_id;
END;
$$;


--
-- Name: FUNCTION publish_landing_page(p_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.publish_landing_page(p_id uuid) IS 'Admin-gated publish: copies the page''s working copy over its published copy, making it live or replacing the live version — the structure and every complete language version at once (is_complete: title, summary, slug and every section''s required text written); the live version set becomes exactly those. An incomplete version stays in the working copy. Refuses a page with no complete version with check_violation. Stamps first_published_at on each version going live for the first time, which fixes its slug. A republish moves published_at and keeps first_published_at. The working copy is locked for the copy. An id no page has raises no_data_found. SECURITY DEFINER because no landing page table carries a write grant.';


--
-- Name: FUNCTION publish_landing_page(p_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.publish_landing_page(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.publish_landing_page(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.publish_landing_page(p_id uuid) TO service_role;


