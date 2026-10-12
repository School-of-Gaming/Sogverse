--
-- Name: replace_spotlight_versions(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.replace_spotlight_versions(p_id uuid, p_versions jsonb) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_locale text;
BEGIN
  IF p_versions IS NULL OR jsonb_typeof(p_versions) <> 'array' THEN
    RAISE EXCEPTION 'p_versions must be a JSON array'
      USING ERRCODE = '22023';
  END IF;

  -- Readers fall back to the first version written, so a spotlight has at
  -- least one, and every version has both of its fields.
  IF jsonb_array_length(p_versions) = 0 THEN
    RAISE EXCEPTION 'A spotlight needs at least one language version'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT r.locale INTO v_locale
    FROM jsonb_to_recordset(p_versions) AS r(locale text, title text)
   WHERE btrim(COALESCE(r.title, '')) = ''
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'The % version needs a title', COALESCE(v_locale, 'unnamed')
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT r.locale INTO v_locale
    FROM jsonb_to_recordset(p_versions) AS r(locale text, body text)
   WHERE btrim(COALESCE(r.body, '')) = ''
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'The % version needs a body', COALESCE(v_locale, 'unnamed')
      USING ERRCODE = 'check_violation';
  END IF;

  IF (SELECT count(DISTINCT r.locale) <> count(*)
        FROM jsonb_to_recordset(p_versions) AS r(locale text)) THEN
    RAISE EXCEPTION 'Each language may have one version'
      USING ERRCODE = '22023';
  END IF;

  -- The version set is replaced whole: a locale the save no longer names is
  -- gone, and every named one is written as sent.
  DELETE FROM public.spotlight_translations t
   WHERE t.spotlight_id = p_id
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_versions) e
        WHERE e->>'locale' = t.locale);

  INSERT INTO public.spotlight_translations AS t (spotlight_id, locale, title, body)
  SELECT p_id, r.locale, btrim(r.title), btrim(r.body)
    FROM jsonb_to_recordset(p_versions) AS r(locale text, title text, body text)
  ON CONFLICT (spotlight_id, locale) DO UPDATE
     SET title = EXCLUDED.title,
         body  = EXCLUDED.body;
END;
$$;


--
-- Name: FUNCTION replace_spotlight_versions(p_id uuid, p_versions jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.replace_spotlight_versions(p_id uuid, p_versions jsonb) IS 'The version-set half of create_spotlight and save_spotlight, which have already checked the caller is an admin. p_versions is the whole set, a JSON array of {locale, title, body}, replacing what was stored: a locale it omits is removed. At least one version, each with a title and a body, else check_violation naming the locale; a locale named twice, or p_versions not an array, raises 22023. Text is trimmed. Not exposed: granted to no Data API role but the service role.';


--
-- Name: FUNCTION replace_spotlight_versions(p_id uuid, p_versions jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.replace_spotlight_versions(p_id uuid, p_versions jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.replace_spotlight_versions(p_id uuid, p_versions jsonb) TO service_role;


