--
-- Name: effective_status(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.effective_status(p_product_id uuid) RETURNS public.effective_product_status
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_start_date  DATE;
  v_end_date    DATE;
  v_timezone    TEXT;
  v_now_local   DATE;
  v_end_passed  BOOLEAN;
BEGIN
  SELECT start_date, end_date, timezone
    INTO v_start_date, v_end_date, v_timezone
    FROM public.products
    WHERE id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- start_date and end_date are calendar dates in the product's OWN timezone
  -- rather than instants, so "today" has to be read in that zone too: a club in
  -- Helsinki starts on its start date in Helsinki, whatever the server thinks
  -- the date is.
  v_now_local := (NOW() AT TIME ZONE v_timezone)::DATE;
  v_end_passed := v_end_date IS NOT NULL AND v_end_date < v_now_local;

  -- A product with no end date never leaves running, which is the ordinary
  -- shape of an open-ended consumer club.
  IF v_start_date <= v_now_local THEN
    RETURN CASE WHEN v_end_passed THEN 'completed' ELSE 'running' END;
  END IF;

  RETURN 'pending';
END;
$$;


--
-- Name: FUNCTION effective_status(p_product_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.effective_status(p_product_id uuid) IS 'The lifecycle of one product, derived from its own two dates. Nothing about the answer is stored, so nothing can be stale: a product is pending until its start date arrives, running from then on, and completed once its end date has passed; one with no end date never leaves running. Every comparison is against today in the product''s OWN timezone, because start_date and end_date are calendar dates in that zone rather than instants. There is deliberately no answer for "ended without ever starting": start_date is NOT NULL and chk_products_date_range keeps end_date on or after it, so today < start_date <= end_date and the state cannot arise. SECURITY DEFINER with search_path pinned, and granted to service_role alone — the browser never asks this question, and a policy that needs it answered asks the date comparison inline rather than dragging a DEFINER function into the authorization spine to decide what two columns already decide (see can_read_product).';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: FUNCTION effective_status(p_product_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.effective_status(p_product_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.effective_status(p_product_id uuid) TO service_role;


