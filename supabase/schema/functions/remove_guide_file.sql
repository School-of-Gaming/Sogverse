--
-- Name: remove_guide_file(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remove_guide_file(p_id uuid, p_locale text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_removed text;
BEGIN
  PERFORM public.assert_admin();

  UPDATE public.guides
     SET updated_at = now()
   WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guide not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.guide_files
     WHERE guide_id = p_id AND locale = p_locale
  ) THEN
    RAISE EXCEPTION 'The guide has no % file', COALESCE(p_locale, 'unnamed')
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.guide_files
     WHERE guide_id = p_id AND locale <> p_locale
  ) THEN
    RAISE EXCEPTION 'That is the guide''s only file, and a guide needs one'
      USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM public.guide_files
   WHERE guide_id = p_id AND locale = p_locale
  RETURNING storage_path INTO v_removed;

  RETURN v_removed;
END;
$$;


--
-- Name: FUNCTION remove_guide_file(p_id uuid, p_locale text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.remove_guide_file(p_id uuid, p_locale text) IS 'Admin-gated removal of one language''s file of a guide; no other is touched. Returns the storage path it removed — the object the caller now deletes. Refuses the guide''s last file (check_violation); an id no guide has, or a locale it has no file in, raises no_data_found. SECURITY DEFINER because neither guide table carries a write grant.';


--
-- Name: FUNCTION remove_guide_file(p_id uuid, p_locale text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.remove_guide_file(p_id uuid, p_locale text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.remove_guide_file(p_id uuid, p_locale text) TO authenticated;
GRANT ALL ON FUNCTION public.remove_guide_file(p_id uuid, p_locale text) TO service_role;


