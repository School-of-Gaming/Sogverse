--
-- Name: location_search_blob(text, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.location_search_blob(p_name text, p_name_i18n jsonb, p_external_code text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO ''
    AS $$
  SELECT coalesce(
    public.location_search_separator()
      || string_agg(term, public.location_search_separator() ORDER BY term)
      || public.location_search_separator(),
    public.location_search_separator()
  )
  FROM (
    SELECT DISTINCT lower(public.immutable_unaccent(btrim(raw.value))) AS term
      FROM (
             SELECT p_name
             UNION ALL
             -- Alternates only. `name` is never duplicated into name_i18n, so
             -- the keys are irrelevant here; only the values are searchable.
             SELECT alternate.value
               FROM jsonb_each_text(coalesce(p_name_i18n, '{}'::jsonb)) AS alternate
             UNION ALL
             SELECT p_external_code
           ) AS raw(value)
     WHERE raw.value IS NOT NULL
       AND btrim(raw.value) <> ''
  ) AS terms;
$$;


--
-- Name: FUNCTION location_search_blob(p_name text, p_name_i18n jsonb, p_external_code text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.location_search_blob(p_name text, p_name_i18n jsonb, p_external_code text) IS 'Every searchable string for a location row — canonical name, each name_i18n alternate, the official code — folded to lowercase without diacritics and joined with the separator around each term. Backs the generated locations.search_blob column.';


--
-- Name: FUNCTION location_search_blob(p_name text, p_name_i18n jsonb, p_external_code text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.location_search_blob(p_name text, p_name_i18n jsonb, p_external_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.location_search_blob(p_name text, p_name_i18n jsonb, p_external_code text) TO authenticated;
GRANT ALL ON FUNCTION public.location_search_blob(p_name text, p_name_i18n jsonb, p_external_code text) TO service_role;


