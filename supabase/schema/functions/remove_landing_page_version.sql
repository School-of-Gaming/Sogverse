--
-- Name: remove_landing_page_version(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remove_landing_page_version(p_id uuid, p_locale text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  -- Written first, so an id no page has is refused before anything else, the
  -- row's updated_at and saver move, and the row lock orders this removal
  -- against a publish and against another removal: two removals racing for
  -- a page's last two languages cannot both see the other still there.
  UPDATE public.landing_pages SET updated_at = now()
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Landing page not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.landing_page_translations
                  WHERE page_id = p_id AND locale = p_locale) THEN
    RAISE EXCEPTION 'The page has no % version to remove', COALESCE(p_locale, 'unnamed')
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.landing_page_translations
                  WHERE page_id = p_id AND locale <> p_locale) THEN
    RAISE EXCEPTION 'The % version is the page''s only language, and a page keeps at least one; write another language before removing this one', p_locale
      USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM public.landing_page_translations
   WHERE page_id = p_id AND locale = p_locale;

  RETURN p_id;
END;
$$;


--
-- Name: FUNCTION remove_landing_page_version(p_id uuid, p_locale text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.remove_landing_page_version(p_id uuid, p_locale text) IS 'Admin-gated removal of ONE language version from a landing page''s working copy — its title, summary, slug and every section''s text in that locale; returns the page id. Never touches the published copy: a live language stays live until the next publish, which copies only the working versions and so takes it down. Refuses the page''s last version with check_violation, since a page keeps at least one. An id no page has, or a locale the page has no version in, raises no_data_found. The working copy''s updated_at and saver move. SECURITY DEFINER because no working table carries a write grant.';


--
-- Name: FUNCTION remove_landing_page_version(p_id uuid, p_locale text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.remove_landing_page_version(p_id uuid, p_locale text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.remove_landing_page_version(p_id uuid, p_locale text) TO authenticated;
GRANT ALL ON FUNCTION public.remove_landing_page_version(p_id uuid, p_locale text) TO service_role;


