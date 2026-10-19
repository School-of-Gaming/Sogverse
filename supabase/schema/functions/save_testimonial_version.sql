--
-- Name: save_testimonial_version(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_testimonial_version(p_id uuid, p_locale text, p_attribution text, p_quote text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  PERFORM public.check_testimonial_version(p_locale, p_attribution, p_quote);

  UPDATE public.testimonials
     SET updated_at = now()
   WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Testimonial not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO public.testimonial_translations AS t (testimonial_id, locale, attribution, quote)
  VALUES (p_id, p_locale, btrim(p_attribution), btrim(p_quote))
  ON CONFLICT (testimonial_id, locale) DO UPDATE
     SET attribution = EXCLUDED.attribution,
         quote       = EXCLUDED.quote;

  RETURN p_id;
END;
$$;


--
-- Name: FUNCTION save_testimonial_version(p_id uuid, p_locale text, p_attribution text, p_quote text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.save_testimonial_version(p_id uuid, p_locale text, p_attribution text, p_quote text) IS 'Admin-gated partial write of one language version of a testimonial — whom it is from and the quote, replacing what that locale held, or adding the locale. No other version is touched, so two admins writing two languages never undo each other. The version is checked by check_testimonial_version (check_violation naming the locale); a malformed locale fails the table''s CHECK; an id no testimonial has raises no_data_found. SECURITY DEFINER because neither testimonial table carries a write grant.';


--
-- Name: FUNCTION save_testimonial_version(p_id uuid, p_locale text, p_attribution text, p_quote text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_testimonial_version(p_id uuid, p_locale text, p_attribution text, p_quote text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_testimonial_version(p_id uuid, p_locale text, p_attribution text, p_quote text) TO authenticated;
GRANT ALL ON FUNCTION public.save_testimonial_version(p_id uuid, p_locale text, p_attribution text, p_quote text) TO service_role;


