--
-- Name: list_landing_page_guides(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_landing_page_guides(p_page_id uuid) RETURNS TABLE(guide_id uuid, files jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $_$
  SELECT g.id,
         COALESCE(
           (SELECT jsonb_agg(jsonb_build_object(
                     'locale', f.locale,
                     'byte_size', f.byte_size))
              FROM public.guide_files f
             WHERE f.guide_id = g.id),
           '[]'::jsonb)
    FROM public.guides g
   WHERE g.id IN (
     SELECT CASE
              WHEN s.e->>'guideId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              THEN (s.e->>'guideId')::uuid
            END
       FROM public.landing_page_publications l,
            jsonb_array_elements(
              CASE WHEN jsonb_typeof(l.sections) = 'array' THEN l.sections ELSE '[]'::jsonb END
            ) AS s(e)
      WHERE l.page_id = p_page_id
        AND s.e->>'type' = 'guide'
        AND jsonb_typeof(s.e->'guideId') = 'string'
   );
$_$;


--
-- Name: FUNCTION list_landing_page_guides(p_page_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.list_landing_page_guides(p_page_id uuid) IS 'A live landing page''s guides: every guide the guide sections of the page''s PUBLISHED copy place, each once, with its files as a JSON array of {locale, byte_size} (in no particular order: the reader''s pick is made in the app). The files are the store''s current ones, so a replaced or added file shows on the live page at once, without a republish. Crosses the boundary that the guide store is admin-only and anon holds no grant on it, and hands back only what a live page places, and of it only which locales have a file and how large each is — never where a file is stored, its name, the guide''s label, or who uploaded it, and never a guide placed only in an unpublished working copy. An unpublished or unknown page answers no rows.';


--
-- Name: FUNCTION list_landing_page_guides(p_page_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.list_landing_page_guides(p_page_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.list_landing_page_guides(p_page_id uuid) TO anon;
GRANT ALL ON FUNCTION public.list_landing_page_guides(p_page_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.list_landing_page_guides(p_page_id uuid) TO service_role;


