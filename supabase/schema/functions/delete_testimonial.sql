--
-- Name: delete_testimonial(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_testimonial(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_spot public.home_testimonial_spot;
BEGIN
  PERFORM public.assert_admin();

  -- Locked first, so a placement cannot land between the check below and the
  -- delete; the foreign key restricts beneath it either way.
  PERFORM 1
    FROM public.testimonials
   WHERE id = p_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Testimonial not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Every place a testimonial can be shown is named here, so the refusal says
  -- where it is used rather than which key it violates.
  SELECT spot INTO v_spot
    FROM public.home_testimonials
   WHERE testimonial_id = p_id;

  IF FOUND THEN
    RAISE EXCEPTION 'This testimonial is shown in the home page''s % spot, and so on About too, so it cannot be deleted. Which testimonial fills a home spot is changed by a developer.',
      CASE v_spot
        WHEN 'feature' THEN 'feature (under the hero)'
        WHEN 'safety'  THEN 'safety (beside the safety facts)'
        WHEN 'row'     THEN 'row ("What parents tell us")'
      END
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  DELETE FROM public.testimonials WHERE id = p_id;
END;
$$;


--
-- Name: FUNCTION delete_testimonial(p_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.delete_testimonial(p_id uuid) IS 'Admin-gated removal of a testimonial outright, its versions with it (ON DELETE CASCADE). Refuses a testimonial shown anywhere with foreign_key_violation and a sentence naming where — today a home spot, and About through it; the foreign key from home_testimonials restricts beneath the check. An id no testimonial has raises no_data_found. SECURITY DEFINER because testimonials carries no write grant.';


--
-- Name: FUNCTION delete_testimonial(p_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.delete_testimonial(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_testimonial(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.delete_testimonial(p_id uuid) TO service_role;


