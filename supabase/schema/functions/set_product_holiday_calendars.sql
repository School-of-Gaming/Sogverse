--
-- Name: set_product_holiday_calendars(uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_product_holiday_calendars(p_product_id uuid, p_calendar_ids uuid[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_type public.product_type;
BEGIN
  PERFORM public.assert_admin();

  -- A NULL element is refused for the reason set_product_required_consents
  -- refuses one: the replacing DELETE below would otherwise quietly become a
  -- merge. NULL as the whole array means "follows none".
  IF EXISTS (SELECT 1 FROM unnest(p_calendar_ids) AS c WHERE c IS NULL) THEN
    RAISE EXCEPTION
      'the holiday calendar list contains a NULL entry, which is not a calendar'
      USING ERRCODE = 'check_violation';
  END IF;

  IF COALESCE(cardinality(p_calendar_ids), 0) > 0 THEN
    SELECT p.product_type INTO v_product_type
      FROM public.products p
     WHERE p.id = p_product_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not found'
        USING ERRCODE = 'no_data_found';
    END IF;
    IF v_product_type NOT IN ('consumer_club', 'municipality_club') THEN
      RAISE EXCEPTION 'Only a club follows holiday calendars — a camp or an event keeps its own dates'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  DELETE FROM public.product_holiday_calendars phc
   WHERE phc.product_id = p_product_id
     AND NOT EXISTS (
           SELECT 1
             FROM unnest(COALESCE(p_calendar_ids, ARRAY[]::uuid[])) AS c
            WHERE c = phc.calendar_id
         );

  -- An unknown calendar is refused by the foreign key.
  IF COALESCE(cardinality(p_calendar_ids), 0) > 0 THEN
    INSERT INTO public.product_holiday_calendars (product_id, calendar_id)
    SELECT p_product_id, c
      FROM unnest(p_calendar_ids) AS c
    ON CONFLICT (product_id, calendar_id) DO NOTHING;
  END IF;
END;
$$;


--
-- Name: FUNCTION set_product_holiday_calendars(p_product_id uuid, p_calendar_ids uuid[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_product_holiday_calendars(p_product_id uuid, p_calendar_ids uuid[]) IS 'Replace the set of holiday calendars a club follows, admin-only and guard-first on assert_admin. The only writer of product_holiday_calendars — no Data API role holds a write grant — and what create_product and update_product both call. NULL and an empty array both mean "follows none", which is how the set is cleared. A non-empty set on a product that is not a club (consumer_club or municipality_club) is refused with check_violation, and on a product that does not exist with no_data_found; an unknown calendar is refused by the foreign key. A NULL element is refused with check_violation, and the replacing DELETE is a two-valued NOT EXISTS, as in set_product_required_consents.';


--
-- Name: FUNCTION set_product_holiday_calendars(p_product_id uuid, p_calendar_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_product_holiday_calendars(p_product_id uuid, p_calendar_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_product_holiday_calendars(p_product_id uuid, p_calendar_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.set_product_holiday_calendars(p_product_id uuid, p_calendar_ids uuid[]) TO service_role;


