--
-- Name: save_guide_file(uuid, text, text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_guide_file(p_id uuid, p_locale text, p_storage_path text, p_file_name text, p_byte_size integer) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_replaced text;
BEGIN
  PERFORM public.assert_admin();

  PERFORM public.check_guide_file(p_locale, p_file_name, p_byte_size);

  -- Written first, so an id no guide has is refused before any file is, so
  -- the save is stamped, and so two uploads to one guide take turns: the
  -- second reads the path the first wrote.
  UPDATE public.guides
     SET updated_at = now()
   WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guide not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT f.storage_path INTO v_replaced
    FROM public.guide_files f
   WHERE f.guide_id = p_id AND f.locale = p_locale;

  INSERT INTO public.guide_files AS f (guide_id, locale, storage_path, file_name, byte_size)
  VALUES (p_id, p_locale, p_storage_path, btrim(p_file_name), p_byte_size)
  ON CONFLICT (guide_id, locale) DO UPDATE
     SET storage_path = EXCLUDED.storage_path,
         file_name    = EXCLUDED.file_name,
         byte_size    = EXCLUDED.byte_size;

  -- The same path sent again names the object now stored, which is not the
  -- caller's to delete.
  RETURN NULLIF(v_replaced, p_storage_path);
END;
$$;


--
-- Name: FUNCTION save_guide_file(p_id uuid, p_locale text, p_storage_path text, p_file_name text, p_byte_size integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.save_guide_file(p_id uuid, p_locale text, p_storage_path text, p_file_name text, p_byte_size integer) IS 'Admin-gated write of one language''s file of a guide, replacing what that locale held or adding the locale; no other file is touched. Returns the storage path it replaced — the object the caller now deletes — or NULL when the locale had none. The file is checked by check_guide_file (check_violation naming the locale); a malformed locale or path fails the table''s CHECKs; an id no guide has raises no_data_found. SECURITY DEFINER because neither guide table carries a write grant.';


--
-- Name: FUNCTION save_guide_file(p_id uuid, p_locale text, p_storage_path text, p_file_name text, p_byte_size integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_guide_file(p_id uuid, p_locale text, p_storage_path text, p_file_name text, p_byte_size integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_guide_file(p_id uuid, p_locale text, p_storage_path text, p_file_name text, p_byte_size integer) TO authenticated;
GRANT ALL ON FUNCTION public.save_guide_file(p_id uuid, p_locale text, p_storage_path text, p_file_name text, p_byte_size integer) TO service_role;


