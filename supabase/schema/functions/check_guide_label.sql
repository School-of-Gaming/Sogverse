--
-- Name: check_guide_label(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_guide_label(p_label text) RETURNS void
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $$
BEGIN
  IF btrim(COALESCE(p_label, '')) = '' THEN
    RAISE EXCEPTION 'A guide needs a label'
      USING ERRCODE = 'check_violation';
  END IF;

  IF char_length(btrim(p_label)) > 200 THEN
    RAISE EXCEPTION 'A guide''s label is at most 200 characters'
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;


--
-- Name: FUNCTION check_guide_label(p_label text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.check_guide_label(p_label text) IS 'The label rule create_guide and save_guide_label check before they write, refusing with a sentence an admin can act on (check_violation): written, and at most 200 characters once trimmed. Not exposed: granted to no Data API role but the service role.';


--
-- Name: FUNCTION check_guide_label(p_label text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.check_guide_label(p_label text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.check_guide_label(p_label text) TO service_role;


