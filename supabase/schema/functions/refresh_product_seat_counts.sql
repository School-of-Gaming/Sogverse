--
-- Name: refresh_product_seat_counts(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_product_seat_counts(p_product_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_active     INTEGER;
  v_waitlist   INTEGER;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE status = 'active'),
    COUNT(*) FILTER (WHERE status = 'waitlisted')
    INTO v_active, v_waitlist
    FROM public.participations
    WHERE product_id = p_product_id;

  INSERT INTO public.product_seat_counts (
    product_id, active_count, waitlist_count, updated_at
  )
  VALUES (p_product_id, v_active, v_waitlist, NOW())
  ON CONFLICT (product_id) DO UPDATE SET
    active_count    = EXCLUDED.active_count,
    waitlist_count  = EXCLUDED.waitlist_count,
    updated_at      = EXCLUDED.updated_at;
END;
$$;


--
-- Name: FUNCTION refresh_product_seat_counts(p_product_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.refresh_product_seat_counts(p_product_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.refresh_product_seat_counts(p_product_id uuid) TO service_role;


