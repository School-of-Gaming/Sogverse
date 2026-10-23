--
-- Name: get_guide_download_files(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_guide_download_files(p_guide_id uuid) RETURNS TABLE(locale text, storage_path text, file_name text, byte_size integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT f.locale, f.storage_path, f.file_name, f.byte_size
    FROM public.guide_files f
   WHERE f.guide_id = p_guide_id
     AND (
       (SELECT public.is_admin())
       OR EXISTS (
         SELECT 1
           FROM public.landing_page_publications l,
                jsonb_array_elements(
                  CASE WHEN jsonb_typeof(l.sections) = 'array' THEN l.sections ELSE '[]'::jsonb END
                ) AS s(e)
          WHERE s.e->>'type' = 'guide'
            AND s.e->>'guideId' = p_guide_id::text
       )
     );
$$;


--
-- Name: FUNCTION get_guide_download_files(p_guide_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_guide_download_files(p_guide_id uuid) IS 'The files of one guide the caller may download, for the download route, which calls it on the reader''s own session and then reads the chosen object from the private guides bucket with the service role: every language''s file as {locale, storage_path, file_name, byte_size}, in no particular order — the reader''s pick is the app''s, through its one picker. Any signed-in account may download a guide the published copy of some live landing page places; an admin may download any guide, so a preview of a working copy downloads too. Answers no rows otherwise, and for a guide that does not exist. Granted to authenticated alone: anon has no download, which is the gate a signed-out visitor meets. Crosses the boundary that the guide store is admin-only, reading no uid beyond whether the caller is an admin.';


--
-- Name: FUNCTION get_guide_download_files(p_guide_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_guide_download_files(p_guide_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_guide_download_files(p_guide_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_guide_download_files(p_guide_id uuid) TO service_role;


