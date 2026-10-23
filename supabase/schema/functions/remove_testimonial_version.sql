--
-- Name: remove_testimonial_version(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remove_testimonial_version(p_id uuid, p_locale text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  UPDATE public.testimonials
     SET updated_at = now()
   WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Testimonial not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.testimonial_translations
     WHERE testimonial_id = p_id AND locale = p_locale
  ) THEN
    RAISE EXCEPTION 'The testimonial has no % version', COALESCE(p_locale, 'unnamed')
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.testimonial_translations
     WHERE testimonial_id = p_id AND locale <> p_locale
  ) THEN
    RAISE EXCEPTION 'That is the testimonial''s only language version, and a testimonial needs one'
      USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM public.testimonial_translations
   WHERE testimonial_id = p_id AND locale = p_locale;

  RETURN p_id;
END;
$$;


--
-- Name: FUNCTION remove_testimonial_version(p_id uuid, p_locale text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.remove_testimonial_version(p_id uuid, p_locale text) IS 'Admin-gated removal of one language version of a testimonial; no other is touched. Refuses the testimonial''s last version (check_violation); an id no testimonial has, or a locale it has no version in, raises no_data_found. SECURITY DEFINER because neither testimonial table carries a write grant.';


--
-- Name: FUNCTION remove_testimonial_version(p_id uuid, p_locale text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.remove_testimonial_version(p_id uuid, p_locale text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.remove_testimonial_version(p_id uuid, p_locale text) TO authenticated;
GRANT ALL ON FUNCTION public.remove_testimonial_version(p_id uuid, p_locale text) TO service_role;


