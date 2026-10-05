--
-- Name: landing_sections_repointed(jsonb, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.landing_sections_repointed(p_sections jsonb, p_from uuid, p_to uuid) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN s.e->>'imageId' = p_from::text
        THEN jsonb_set(s.e, '{imageId}', to_jsonb(p_to::text))
      WHEN jsonb_typeof(s.e->'images') = 'array'
        THEN jsonb_set(s.e, '{images}', (
          SELECT COALESCE(jsonb_agg(
            CASE WHEN i.e->>'imageId' = p_from::text
                 THEN jsonb_set(i.e, '{imageId}', to_jsonb(p_to::text))
                 ELSE i.e END
            ORDER BY i.n), '[]'::jsonb)
            FROM jsonb_array_elements(s.e->'images') WITH ORDINALITY AS i(e, n)))
      ELSE s.e
    END
    ORDER BY s.n), '[]'::jsonb)
    FROM jsonb_array_elements(p_sections) WITH ORDINALITY AS s(e, n);
$$;


--
-- Name: FUNCTION landing_sections_repointed(p_sections jsonb, p_from uuid, p_to uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.landing_sections_repointed(p_sections jsonb, p_from uuid, p_to uuid) IS 'A section structure with every picture that is entry p_from made entry p_to, everything else as it was.';


--
-- Name: FUNCTION landing_sections_repointed(p_sections jsonb, p_from uuid, p_to uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.landing_sections_repointed(p_sections jsonb, p_from uuid, p_to uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.landing_sections_repointed(p_sections jsonb, p_from uuid, p_to uuid) TO service_role;


