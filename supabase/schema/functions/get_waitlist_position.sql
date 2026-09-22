--
-- Name: get_waitlist_position(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_waitlist_position(p_participation_id uuid) RETURNS integer
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_id     UUID;
  v_participant_id UUID;
  v_customer_id    UUID;
  v_status         public.participation_status;
  v_waitlisted_at  TIMESTAMPTZ;
  v_uid            UUID;
  v_position       INTEGER;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT product_id, participant_id, customer_id, status, waitlisted_at
    INTO v_product_id, v_participant_id, v_customer_id, v_status, v_waitlisted_at
    FROM public.participations
    WHERE id = p_participation_id;

  -- Unknown row, not waitlisted, or caller doesn't own it -> no position.
  -- Owner = the purchasing parent (customer) or the gamer themselves. Returning
  -- NULL rather than raising avoids leaking whether the id exists.
  IF NOT FOUND
     OR v_status <> 'waitlisted'
     OR (v_uid <> v_customer_id AND v_uid <> v_participant_id) THEN
    RETURN NULL;
  END IF;

  -- Position = count of waitlisted rows ordered at-or-before this one
  -- (waitlisted_at, id) — the same derivation join_waitlist uses, recomputed
  -- live so it shrinks as people ahead leave.
  SELECT COUNT(*)::INTEGER INTO v_position
    FROM public.participations
    WHERE product_id = v_product_id
      AND status = 'waitlisted'
      AND (waitlisted_at < v_waitlisted_at
           OR (waitlisted_at = v_waitlisted_at AND id <= p_participation_id));

  RETURN v_position;
END;
$$;


--
-- Name: FUNCTION get_waitlist_position(p_participation_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_waitlist_position(p_participation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_waitlist_position(p_participation_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_waitlist_position(p_participation_id uuid) TO service_role;


