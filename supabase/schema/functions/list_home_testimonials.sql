--
-- Name: list_home_testimonials(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_home_testimonials() RETURNS TABLE(spot public.home_testimonial_spot, "position" smallint, testimonial_id uuid, versions jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT h.spot,
         h.position,
         h.testimonial_id,
         COALESCE(
           (SELECT jsonb_agg(jsonb_build_object(
                     'locale', t.locale,
                     'attribution', t.attribution,
                     'quote', t.quote))
              FROM public.testimonial_translations t
             WHERE t.testimonial_id = h.testimonial_id),
           '[]'::jsonb)
    FROM public.home_testimonials h
   ORDER BY h.spot, h.position;
$$;


--
-- Name: FUNCTION list_home_testimonials(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.list_home_testimonials() IS 'The home page''s and About''s testimonials: every testimonial placed in a home spot, with its spot, its position there and every language version as a JSON array of {locale, attribution, quote} (in no particular order: the reader picks theirs in the app). Crosses the boundary that the testimonial store is admin-only and anon holds no grant on it, and hands back only what a placement puts on the public pages — never an unplaced testimonial, and never who created or saved one. Ordered by spot (feature, safety, row), then position. Takes no argument and answers every caller identically.';


--
-- Name: FUNCTION list_home_testimonials(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.list_home_testimonials() FROM PUBLIC;
GRANT ALL ON FUNCTION public.list_home_testimonials() TO anon;
GRANT ALL ON FUNCTION public.list_home_testimonials() TO authenticated;
GRANT ALL ON FUNCTION public.list_home_testimonials() TO service_role;


