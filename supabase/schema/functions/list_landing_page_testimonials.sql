--
-- Name: list_landing_page_testimonials(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_landing_page_testimonials(p_page_id uuid) RETURNS TABLE(testimonial_id uuid, versions jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $_$
  SELECT t.id,
         COALESCE(
           (SELECT jsonb_agg(jsonb_build_object(
                     'locale', v.locale,
                     'attribution', v.attribution,
                     'quote', v.quote))
              FROM public.testimonial_translations v
             WHERE v.testimonial_id = t.id),
           '[]'::jsonb)
    FROM public.testimonials t
   WHERE t.id IN (
     SELECT CASE
              WHEN p.e #>> '{}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              THEN (p.e #>> '{}')::uuid
            END
       FROM public.landing_page_publications l,
            jsonb_array_elements(
              CASE WHEN jsonb_typeof(l.sections) = 'array' THEN l.sections ELSE '[]'::jsonb END
            ) AS s(e),
            jsonb_array_elements(
              CASE WHEN s.e->>'type' = 'testimonials' AND jsonb_typeof(s.e->'testimonialIds') = 'array'
                   THEN s.e->'testimonialIds' ELSE '[]'::jsonb END
            ) AS p(e)
      WHERE l.page_id = p_page_id
        AND jsonb_typeof(p.e) = 'string'
   );
$_$;


--
-- Name: FUNCTION list_landing_page_testimonials(p_page_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.list_landing_page_testimonials(p_page_id uuid) IS 'A live landing page''s testimonials: every testimonial the testimonials sections of the page''s PUBLISHED copy place, each once, with every language version as a JSON array of {locale, attribution, quote} (in no particular order: the reader picks theirs in the app). The words are the store''s current ones, so an edit shows on the live page at once, without a republish. Crosses the boundary that the testimonial store is admin-only and anon holds no grant on it, and hands back only what a live page places — never a testimonial placed only in an unpublished working copy, never an unplaced one, and never who created or saved one. An unpublished or unknown page answers no rows. The page''s structure says where each goes; this read is unordered.';


--
-- Name: FUNCTION list_landing_page_testimonials(p_page_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.list_landing_page_testimonials(p_page_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.list_landing_page_testimonials(p_page_id uuid) TO anon;
GRANT ALL ON FUNCTION public.list_landing_page_testimonials(p_page_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.list_landing_page_testimonials(p_page_id uuid) TO service_role;


