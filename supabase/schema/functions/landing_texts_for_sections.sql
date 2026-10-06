--
-- Name: landing_texts_for_sections(jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.landing_texts_for_sections(p_sections jsonb, p_section_texts jsonb) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  SELECT COALESCE(jsonb_object_agg(t.key, t.value), '{}'::jsonb)
    FROM jsonb_each(COALESCE(p_section_texts, '{}'::jsonb)) AS t(key, value)
   WHERE EXISTS (
     SELECT 1 FROM jsonb_array_elements(
       CASE WHEN jsonb_typeof(p_sections) = 'array' THEN p_sections ELSE '[]'::jsonb END) AS s(e)
      WHERE s.e->>'id' = t.key);
$$;


--
-- Name: FUNCTION landing_texts_for_sections(p_sections jsonb, p_section_texts jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.landing_texts_for_sections(p_sections jsonb, p_section_texts jsonb) IS 'A version''s section texts kept to the sections the structure still has: the text of a section the structure no longer holds is dropped.';


--
-- Name: FUNCTION landing_texts_for_sections(p_sections jsonb, p_section_texts jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.landing_texts_for_sections(p_sections jsonb, p_section_texts jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.landing_texts_for_sections(p_sections jsonb, p_section_texts jsonb) TO service_role;


