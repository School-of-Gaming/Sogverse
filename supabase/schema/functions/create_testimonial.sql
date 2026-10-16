--
-- Name: create_testimonial(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_testimonial(p_versions jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM public.assert_admin();

  INSERT INTO public.testimonials DEFAULT VALUES
  RETURNING id INTO v_id;

  PERFORM public.replace_testimonial_versions(v_id, p_versions);

  RETURN v_id;
END;
$$;


--
-- Name: FUNCTION create_testimonial(p_versions jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.create_testimonial(p_versions jsonb) IS 'Admin-gated create of a testimonial; returns its id. p_versions is the whole version set, as replace_testimonial_versions takes it — at least one {locale, attribution, quote}, each with both fields and no quotation marks around the quote. Who created it, and through which AI app, is stamped by the trigger. It is placed nowhere. SECURITY DEFINER because neither testimonial table carries a write grant.';


--
-- Name: FUNCTION create_testimonial(p_versions jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_testimonial(p_versions jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_testimonial(p_versions jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.create_testimonial(p_versions jsonb) TO service_role;


