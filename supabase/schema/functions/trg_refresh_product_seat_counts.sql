--
-- Name: trg_refresh_product_seat_counts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_refresh_product_seat_counts() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_product_seat_counts(OLD.product_id);
    RETURN OLD;
  END IF;

  PERFORM public.refresh_product_seat_counts(NEW.product_id);

  -- An UPDATE that moved a row to a different product needs the old product
  -- recomputed too (theoretical — product_id doesn't change in practice,
  -- but the trigger covers it anyway).
  IF TG_OP = 'UPDATE' AND OLD.product_id <> NEW.product_id THEN
    PERFORM public.refresh_product_seat_counts(OLD.product_id);
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION trg_refresh_product_seat_counts(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.trg_refresh_product_seat_counts() FROM PUBLIC;
GRANT ALL ON FUNCTION public.trg_refresh_product_seat_counts() TO service_role;


