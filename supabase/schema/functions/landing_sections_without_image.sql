--
-- Name: landing_sections_without_image(jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.landing_sections_without_image(p_sections jsonb, p_image uuid) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  SELECT COALESCE(jsonb_agg(kept.e ORDER BY kept.n), '[]'::jsonb)
    FROM (
      SELECT s.n,
             CASE
               WHEN s.e->>'imageId' = p_image::text THEN s.e - 'imageId'
               WHEN jsonb_typeof(s.e->'images') = 'array' THEN jsonb_set(s.e, '{images}', (
                 SELECT COALESCE(jsonb_agg(i.e ORDER BY i.n), '[]'::jsonb)
                   FROM jsonb_array_elements(s.e->'images') WITH ORDINALITY AS i(e, n)
                  WHERE i.e->>'imageId' IS DISTINCT FROM p_image::text))
               ELSE s.e
             END AS e
        FROM jsonb_array_elements(p_sections) WITH ORDINALITY AS s(e, n)
    ) AS kept
   WHERE CASE WHEN jsonb_typeof(kept.e->'images') = 'array'
              THEN jsonb_array_length(kept.e->'images') > 0
              ELSE true
         END;
$$;


--
-- Name: FUNCTION landing_sections_without_image(p_sections jsonb, p_image uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.landing_sections_without_image(p_sections jsonb, p_image uuid) IS 'A section structure with catalogue entry p_image taken out: a section''s single picture is unset, an image section loses the pictures that are that entry, and an image section left with none is dropped.';


--
-- Name: FUNCTION landing_sections_without_image(p_sections jsonb, p_image uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.landing_sections_without_image(p_sections jsonb, p_image uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.landing_sections_without_image(p_sections jsonb, p_image uuid) TO service_role;


