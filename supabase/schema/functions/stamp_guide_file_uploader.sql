--
-- Name: stamp_guide_file_uploader(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.stamp_guide_file_uploader() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_by  uuid := auth.uid();
  v_via uuid;
BEGIN
  IF v_by IS NOT NULL THEN
    v_via := (auth.jwt() ->> 'client_id')::uuid;
  END IF;

  NEW.uploaded_at  := now();
  NEW.uploaded_by  := v_by;
  NEW.uploaded_via := v_via;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION stamp_guide_file_uploader(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.stamp_guide_file_uploader() IS 'BEFORE INSERT, and BEFORE UPDATE OF storage_path, on guide_files: stamps who uploaded the file, when, and through which AI app (the token''s client_id claim), overwriting whatever the statement said. A new object is a new path, so a replace is stamped as the upload it is.';


--
-- Name: FUNCTION stamp_guide_file_uploader(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.stamp_guide_file_uploader() FROM PUBLIC;
GRANT ALL ON FUNCTION public.stamp_guide_file_uploader() TO service_role;


