--
-- Name: replace_testimonial_versions(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.replace_testimonial_versions(p_id uuid, p_versions jsonb) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_version record;
BEGIN
  IF p_versions IS NULL OR jsonb_typeof(p_versions) <> 'array' THEN
    RAISE EXCEPTION 'p_versions must be a JSON array'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_versions) = 0 THEN
    RAISE EXCEPTION 'A testimonial needs at least one language version'
      USING ERRCODE = 'check_violation';
  END IF;

  FOR v_version IN
    SELECT r.locale, r.attribution, r.quote
      FROM jsonb_to_recordset(p_versions) AS r(locale text, attribution text, quote text)
  LOOP
    PERFORM public.check_testimonial_version(v_version.locale, v_version.attribution, v_version.quote);
  END LOOP;

  IF (SELECT count(DISTINCT r.locale) <> count(*)
        FROM jsonb_to_recordset(p_versions) AS r(locale text)) THEN
    RAISE EXCEPTION 'Each language may have one version'
      USING ERRCODE = '22023';
  END IF;

  -- The version set is replaced whole: a locale the save no longer names is
  -- gone, and every named one is written as sent.
  DELETE FROM public.testimonial_translations t
   WHERE t.testimonial_id = p_id
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_versions) e
        WHERE e->>'locale' = t.locale);

  INSERT INTO public.testimonial_translations AS t (testimonial_id, locale, attribution, quote)
  SELECT p_id, r.locale, btrim(r.attribution), btrim(r.quote)
    FROM jsonb_to_recordset(p_versions) AS r(locale text, attribution text, quote text)
  ON CONFLICT (testimonial_id, locale) DO UPDATE
     SET attribution = EXCLUDED.attribution,
         quote       = EXCLUDED.quote;
END;
$$;


--
-- Name: FUNCTION replace_testimonial_versions(p_id uuid, p_versions jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.replace_testimonial_versions(p_id uuid, p_versions jsonb) IS 'The version-set half of create_testimonial and save_testimonial, which have already checked the caller is an admin. p_versions is the whole set, a JSON array of {locale, attribution, quote}, replacing what was stored: a locale it omits is removed. At least one version, each passing check_testimonial_version, else check_violation; a locale named twice, or p_versions not an array, raises 22023. Text is trimmed. Not exposed: granted to no Data API role but the service role.';


--
-- Name: FUNCTION replace_testimonial_versions(p_id uuid, p_versions jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.replace_testimonial_versions(p_id uuid, p_versions jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.replace_testimonial_versions(p_id uuid, p_versions jsonb) TO service_role;


