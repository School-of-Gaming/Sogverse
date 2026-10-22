--
-- Name: check_guide_file(text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_guide_file(p_locale text, p_file_name text, p_byte_size integer) RETURNS void
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $$
BEGIN
  IF btrim(COALESCE(p_file_name, '')) = '' THEN
    RAISE EXCEPTION 'The % file needs its file name', COALESCE(p_locale, 'unnamed')
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_byte_size IS NULL OR p_byte_size < 1 THEN
    RAISE EXCEPTION 'The % file is empty', COALESCE(p_locale, 'unnamed')
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_byte_size > 4194304 THEN
    RAISE EXCEPTION 'The % file is larger than 4 MB', COALESCE(p_locale, 'unnamed')
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;


--
-- Name: FUNCTION check_guide_file(p_locale text, p_file_name text, p_byte_size integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.check_guide_file(p_locale text, p_file_name text, p_byte_size integer) IS 'The file rule create_guide and save_guide_file check before they write, refusing with a sentence naming the locale (check_violation): a file name, and a size from one byte to 4 MB. The path''s shape is chk_guide_files_path_scheme''s to refuse, since only the uploader builds it. Not exposed: granted to no Data API role but the service role.';


--
-- Name: FUNCTION check_guide_file(p_locale text, p_file_name text, p_byte_size integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.check_guide_file(p_locale text, p_file_name text, p_byte_size integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.check_guide_file(p_locale text, p_file_name text, p_byte_size integer) TO service_role;


