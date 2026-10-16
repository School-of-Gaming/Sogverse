--
-- Name: save_testimonial(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_testimonial(p_id uuid, p_versions jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  -- Written first, so an id no testimonial has is refused before any version
  -- is, and so the save is stamped.
  UPDATE public.testimonials
     SET updated_at = now()
   WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Testimonial not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM public.replace_testimonial_versions(p_id, p_versions);

  RETURN p_id;
END;
$$;


--
-- Name: FUNCTION save_testimonial(p_id uuid, p_versions jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.save_testimonial(p_id uuid, p_versions jsonb) IS 'Admin-gated whole save of a testimonial, the editor''s: p_versions is the whole version set, as replace_testimonial_versions takes it, replacing what was stored — a locale it omits is removed. A placed testimonial may be saved; its words change wherever it is shown. Returns its id; an id no testimonial has raises no_data_found. SECURITY DEFINER because neither testimonial table carries a write grant.';


--
-- Name: FUNCTION save_testimonial(p_id uuid, p_versions jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_testimonial(p_id uuid, p_versions jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_testimonial(p_id uuid, p_versions jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.save_testimonial(p_id uuid, p_versions jsonb) TO service_role;


