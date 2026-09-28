--
-- Name: trg_seed_product_seat_counts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_seed_product_seat_counts() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  INSERT INTO public.product_seat_counts (
    product_id, active_count, waitlist_count
  ) VALUES (NEW.id, 0, 0)
  ON CONFLICT (product_id) DO NOTHING;
  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION trg_seed_product_seat_counts(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.trg_seed_product_seat_counts() FROM PUBLIC;
GRANT ALL ON FUNCTION public.trg_seed_product_seat_counts() TO service_role;


