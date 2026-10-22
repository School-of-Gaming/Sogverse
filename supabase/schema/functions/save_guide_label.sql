--
-- Name: save_guide_label(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_guide_label(p_id uuid, p_label text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  PERFORM public.check_guide_label(p_label);

  UPDATE public.guides
     SET label = btrim(p_label),
         updated_at = now()
   WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guide not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN p_id;
END;
$$;


--
-- Name: FUNCTION save_guide_label(p_id uuid, p_label text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.save_guide_label(p_id uuid, p_label text) IS 'Admin-gated save of a guide''s label, checked by check_guide_label (check_violation); no file is touched. Returns its id; an id no guide has raises no_data_found. SECURITY DEFINER because neither guide table carries a write grant.';


--
-- Name: FUNCTION save_guide_label(p_id uuid, p_label text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_guide_label(p_id uuid, p_label text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_guide_label(p_id uuid, p_label text) TO authenticated;
GRANT ALL ON FUNCTION public.save_guide_label(p_id uuid, p_label text) TO service_role;


