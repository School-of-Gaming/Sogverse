--
-- Name: create_guide(uuid, text, text, text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_guide(p_id uuid, p_label text, p_locale text, p_storage_path text, p_file_name text, p_byte_size integer) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  PERFORM public.check_guide_label(p_label);
  PERFORM public.check_guide_file(p_locale, p_file_name, p_byte_size);

  INSERT INTO public.guides (id, label)
  VALUES (p_id, btrim(p_label));

  INSERT INTO public.guide_files (guide_id, locale, storage_path, file_name, byte_size)
  VALUES (p_id, p_locale, p_storage_path, btrim(p_file_name), p_byte_size);

  RETURN p_id;
END;
$$;


--
-- Name: FUNCTION create_guide(p_id uuid, p_label text, p_locale text, p_storage_path text, p_file_name text, p_byte_size integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.create_guide(p_id uuid, p_label text, p_locale text, p_storage_path text, p_file_name text, p_byte_size integer) IS 'Admin-gated create of a guide together with its first file, since a guide is never empty; returns its id. The id is the caller''s, because the object was uploaded first under a path that names it (<id>/<locale>/<random uuid>.pdf, chk_guide_files_path_scheme). The label is checked by check_guide_label and the file by check_guide_file (check_violation); an id already taken raises unique_violation. Who created it and who uploaded the file are stamped by triggers. SECURITY DEFINER because neither guide table carries a write grant.';


--
-- Name: FUNCTION create_guide(p_id uuid, p_label text, p_locale text, p_storage_path text, p_file_name text, p_byte_size integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_guide(p_id uuid, p_label text, p_locale text, p_storage_path text, p_file_name text, p_byte_size integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_guide(p_id uuid, p_label text, p_locale text, p_storage_path text, p_file_name text, p_byte_size integer) TO authenticated;
GRANT ALL ON FUNCTION public.create_guide(p_id uuid, p_label text, p_locale text, p_storage_path text, p_file_name text, p_byte_size integer) TO service_role;


